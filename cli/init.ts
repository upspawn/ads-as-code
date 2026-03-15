import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type GlobalFlags = {
  json: boolean
  provider?: string
  help: boolean
}

type Provider = 'google' | 'meta'

// --- Config templates ---

function googleConfigTemplate(ai: boolean): string {
  const aiBlock = ai ? `  ai: {
    // model: openai('gpt-4.1'),  // Uncomment and configure your model
  },\n` : ''
  return `import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  google: {
    customerId: '123-456-7890',
    managerId: '098-765-4321',
  },
${aiBlock}})
`
}

function metaConfigTemplate(accountId: string, pageId: string, pixelId?: string, ai?: boolean): string {
  const pixelLine = pixelId ? `\n    pixelId: '${pixelId}',` : ''
  const aiBlock = ai ? `  ai: {
    // model: openai('gpt-4.1'),  // Uncomment and configure your model
  },\n` : ''
  return `import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  meta: {
    accountId: '${accountId}',
    pageId: '${pageId}',${pixelLine}
  },
${aiBlock}})
`
}

function genericConfigTemplate(ai: boolean): string {
  const aiBlock = ai ? `  ai: {
    // model: openai('gpt-4.1'),  // Uncomment and configure your model
  },\n` : ''
  return `import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  // google: {
  //   customerId: '123-456-7890',
  //   managerId: '098-765-4321',
  // },
  // meta: {
  //   accountId: 'act_123456789',
  //   pageId: '123456789',
  // },
${aiBlock}})
`
}

const TARGETING_TEMPLATE = `import { geo, languages, targeting } from '@upspawn/ads'

/**
 * Shared targeting presets.
 * Import these in your campaign files.
 */

export const english = targeting(
  geo('US', 'CA', 'GB', 'AU'),
  languages('en'),
)

export const dach = targeting(
  geo('DE', 'AT', 'CH'),
  languages('de'),
)
`

const NEGATIVES_TEMPLATE = `import { negatives } from '@upspawn/ads'

/**
 * Shared negative keyword lists.
 * Import these in your campaign files.
 */

export const brandSafety = negatives(
  'free',
  'cheap',
  'crack',
  'torrent',
  'download',
)
`

const BRAND_PROMPT_TEMPLATE = `/**
 * Brand prompt context for AI generation.
 * Describe your brand, product, and tone so generated
 * ad copy stays on-brand.
 */

export const brandPrompt = \`
  Company: [Your Company Name]
  Product: [Your Product/Service]
  Tone: [Professional / Friendly / Bold / etc.]
  Key differentiators: [What makes you unique]
\`.trim()
`

const GENERATE_MATRIX_TEMPLATE = `// import { expand } from '@upspawn/ads'
//
// Export a default array of expand() entries to generate
// translated and varied campaign files.
//
// Example:
// export default [
//   expand('campaigns/search-main.ts', {
//     translate: ['de', 'fr', 'es'],
//     vary: [
//       { name: 'smb', prompt: 'Target small businesses' },
//       { name: 'enterprise', prompt: 'Target enterprise buyers' },
//     ],
//   }),
// ]

export default []
`

const GITIGNORE_ENTRIES = `
# ads-as-code
.ads/
*.db
`

// --- Prompt helpers ---

function promptLine(message: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(message)
    let data = ''
    const onData = (chunk: Buffer) => {
      data += chunk.toString()
      if (data.includes('\n')) {
        process.stdin.removeListener('data', onData)
        process.stdin.pause()
        resolve(data.trim())
      }
    }
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onData)
  })
}

async function promptProvider(): Promise<Provider> {
  console.log('\nWhich ad platform?\n')
  console.log('  1. Google Ads')
  console.log('  2. Meta (Facebook / Instagram)')
  console.log()
  const choice = await promptLine('Enter 1 or 2: ')
  if (choice === '2' || choice.toLowerCase() === 'meta') return 'meta'
  return 'google'
}

// --- Meta auth verification ---

const META_GRAPH_BASE = 'https://graph.facebook.com'

async function verifyMetaAuth(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env['FB_ADS_ACCESS_TOKEN']
  if (!token) {
    return { ok: false, error: 'FB_ADS_ACCESS_TOKEN environment variable is not set.' }
  }

  try {
    const url = `${META_GRAPH_BASE}/v21.0/${accountId}?fields=name,account_status&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      const errorObj = body['error'] as Record<string, unknown> | undefined
      const msg = errorObj?.['message'] as string | undefined
      return { ok: false, error: msg ?? `API returned ${res.status}` }
    }
    const data = await res.json() as { name?: string; account_status?: number }
    // account_status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, etc.
    if (data.account_status !== 1) {
      return { ok: false, error: `Account "${data.name}" is not active (status: ${data.account_status}).` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// --- Scaffold helpers ---

function writeFileIfMissing(
  path: string,
  label: string,
  content: string,
  created: string[],
  skipped: string[],
): boolean {
  if (existsSync(path)) {
    skipped.push(label)
    return false
  }
  // Synchronous write via Bun — we call this in an async context but the
  // caller awaits the outer function so it's fine to return the promise chain.
  Bun.write(path, content)
  created.push(label)
  return true
}

function createDirIfMissing(
  dir: string,
  label: string,
  created: string[],
  skipped: string[],
): boolean {
  if (existsSync(dir)) {
    skipped.push(label)
    return false
  }
  mkdirSync(dir, { recursive: true })
  created.push(label)
  return true
}

// --- Main ---

export async function runInit(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(`
ads init — Scaffold a new ads-as-code project

Creates:
  ads.config.ts    Configuration file
  campaigns/       Campaign directory
  targeting.ts     Shared targeting presets
  negatives.ts     Shared negative keyword lists

Flags:
  --provider <p>  Skip provider picker (google, meta)
  --ai            Include AI generation scaffolding
  --json          Output results as JSON
  --help, -h      Show this help message
`.trim())
    return
  }

  const rootDir = process.cwd()
  const enableAi = args.includes('--ai')
  const created: string[] = []
  const skipped: string[] = []

  // --- Provider selection ---
  let provider: Provider | undefined
  if (flags.provider === 'google' || flags.provider === 'meta') {
    provider = flags.provider
  } else if (flags.provider) {
    console.error(`Unknown provider: ${flags.provider}. Supported: google, meta`)
    process.exit(1)
  } else if (!flags.json) {
    // Interactive provider picker (skip in JSON mode — non-interactive)
    provider = await promptProvider()
  }

  // --- Meta-specific: collect account details ---
  let metaAccountId: string | undefined
  let metaPageId: string | undefined
  let metaPixelId: string | undefined

  if (provider === 'meta') {
    console.log('\nMeta Ads setup\n')

    metaAccountId = await promptLine('Ad Account ID (e.g. act_123456789): ')
    if (!metaAccountId) {
      console.error('Ad Account ID is required.')
      process.exit(1)
    }
    // Normalize: ensure the act_ prefix
    if (!metaAccountId.startsWith('act_')) {
      metaAccountId = `act_${metaAccountId}`
    }

    metaPageId = await promptLine('Facebook Page ID: ')
    if (!metaPageId) {
      console.error('Page ID is required.')
      process.exit(1)
    }

    metaPixelId = await promptLine('Pixel ID (optional, press Enter to skip): ')
    if (!metaPixelId) metaPixelId = undefined
  }

  // --- ads.config.ts ---
  const configPath = join(rootDir, 'ads.config.ts')
  if (existsSync(configPath)) {
    skipped.push('ads.config.ts')
  } else {
    let configContent: string
    if (provider === 'meta' && metaAccountId && metaPageId) {
      configContent = metaConfigTemplate(metaAccountId, metaPageId, metaPixelId, enableAi)
    } else if (provider === 'google') {
      configContent = googleConfigTemplate(enableAi)
    } else {
      configContent = genericConfigTemplate(enableAi)
    }
    await Bun.write(configPath, configContent)
    created.push('ads.config.ts')
  }

  // --- campaigns/ ---
  createDirIfMissing(join(rootDir, 'campaigns'), 'campaigns/', created, skipped)

  // --- Provider-specific scaffolding ---
  if (provider !== 'meta') {
    // Google-specific: targeting presets and negative keyword lists
    writeFileIfMissing(join(rootDir, 'targeting.ts'), 'targeting.ts', TARGETING_TEMPLATE, created, skipped)
    writeFileIfMissing(join(rootDir, 'negatives.ts'), 'negatives.ts', NEGATIVES_TEMPLATE, created, skipped)
  }

  // --- .gitignore ---
  const gitignorePath = join(rootDir, '.gitignore')
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (!content.includes('.ads/')) {
      appendFileSync(gitignorePath, GITIGNORE_ENTRIES)
      created.push('.gitignore (updated)')
    } else {
      skipped.push('.gitignore (already has ads entries)')
    }
  } else {
    await Bun.write(gitignorePath, GITIGNORE_ENTRIES.trim() + '\n')
    created.push('.gitignore')
  }

  // --- AI scaffolding (when --ai flag is passed) ---
  if (enableAi) {
    const promptsDir = join(rootDir, 'prompts')
    createDirIfMissing(promptsDir, 'prompts/', created, skipped)
    writeFileIfMissing(join(promptsDir, 'brand.ts'), 'prompts/brand.ts', BRAND_PROMPT_TEMPLATE, created, skipped)
    writeFileIfMissing(join(rootDir, 'ads.generate.ts'), 'ads.generate.ts', GENERATE_MATRIX_TEMPLATE, created, skipped)

    const generatedDir = join(rootDir, 'generated')
    if (!existsSync(generatedDir)) {
      mkdirSync(generatedDir, { recursive: true })
      await Bun.write(join(generatedDir, '.gitkeep'), '')
      created.push('generated/')
    } else {
      skipped.push('generated/')
    }
  }

  // --- Meta auth verification ---
  let metaAuthOk = false
  if (provider === 'meta' && metaAccountId) {
    if (!flags.json) console.log('\nVerifying Meta authentication...')
    const result = await verifyMetaAuth(metaAccountId)
    metaAuthOk = result.ok
    if (!flags.json) {
      if (result.ok) {
        console.log('  Meta API connection verified.')
      } else {
        console.log(`  Warning: ${result.error}`)
        console.log('  Set FB_ADS_ACCESS_TOKEN in your environment and try again.')
      }
    }
  }

  // --- Output ---
  if (flags.json) {
    console.log(JSON.stringify({
      provider: provider ?? null,
      created,
      skipped,
      ...(provider === 'meta' ? { metaAuth: metaAuthOk } : {}),
    }, null, 2))
  } else {
    if (created.length > 0) {
      console.log('\nCreated:')
      for (const f of created) {
        console.log(`  + ${f}`)
      }
    }
    if (skipped.length > 0) {
      console.log('Skipped (already exists):')
      for (const f of skipped) {
        console.log(`  - ${f}`)
      }
    }
    if (created.length === 0 && skipped.length > 0) {
      console.log('\nProject already initialized.')
    } else {
      printNextSteps(provider, enableAi, metaAuthOk)
    }
  }
}

function printNextSteps(provider: Provider | undefined, enableAi: boolean, metaAuthOk: boolean): void {
  console.log('\nYou\'re ready! Next steps:\n')

  if (provider === 'meta') {
    let step = 1
    if (!metaAuthOk) {
      console.log(`  ${step}. Export FB_ADS_ACCESS_TOKEN in your shell`)
      step++
    }
    console.log(`  ${step}. Run \`ads import --provider meta\` to import live campaigns`)
    step++
    console.log(`  ${step}. Or create campaign files in campaigns/ using the meta.* builder`)
    step++
    console.log(`  ${step}. Run \`ads plan\` to preview changes`)
    step++
    console.log(`  ${step}. Run \`ads apply\` to push changes to Meta`)
    if (enableAi) {
      step++
      console.log(`  ${step}. Configure your AI model in ads.config.ts`)
      step++
      console.log(`  ${step}. Run \`ads generate\` to generate AI ad copy`)
    }
  } else {
    console.log('  1. Edit ads.config.ts with your provider credentials')
    console.log('  2. Create campaign files in campaigns/')
    console.log('  3. Run `ads validate` to check your campaigns')
    if (enableAi) {
      console.log('  4. Configure your AI model in ads.config.ts')
      console.log('  5. Add ai.rsa() / ai.keywords() markers in campaigns')
      console.log('  6. Run `ads generate` to generate AI ad copy')
    }
  }
}
