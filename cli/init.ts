import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type GlobalFlags = {
  json: boolean
  provider?: string
  help: boolean
}

const CONFIG_TEMPLATE = `import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  // google: {
  //   customerId: '123-456-7890',
  //   managerId: '098-765-4321',
  // },
  // meta: {
  //   accountId: 'act_123456789',
  // },
})
`

const CONFIG_TEMPLATE_AI = `import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  // google: {
  //   customerId: '123-456-7890',
  //   managerId: '098-765-4321',
  // },
  ai: {
    // model: openai('gpt-4.1'),  // Uncomment and configure your model
  },
})
`

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

  // ads.config.ts
  const configPath = join(rootDir, 'ads.config.ts')
  if (existsSync(configPath)) {
    skipped.push('ads.config.ts')
  } else {
    await Bun.write(configPath, enableAi ? CONFIG_TEMPLATE_AI : CONFIG_TEMPLATE)
    created.push('ads.config.ts')
  }

  // campaigns/
  const campaignsDir = join(rootDir, 'campaigns')
  if (existsSync(campaignsDir)) {
    skipped.push('campaigns/')
  } else {
    mkdirSync(campaignsDir, { recursive: true })
    created.push('campaigns/')
  }

  // targeting.ts
  const targetingPath = join(rootDir, 'targeting.ts')
  if (existsSync(targetingPath)) {
    skipped.push('targeting.ts')
  } else {
    await Bun.write(targetingPath, TARGETING_TEMPLATE)
    created.push('targeting.ts')
  }

  // negatives.ts
  const negativesPath = join(rootDir, 'negatives.ts')
  if (existsSync(negativesPath)) {
    skipped.push('negatives.ts')
  } else {
    await Bun.write(negativesPath, NEGATIVES_TEMPLATE)
    created.push('negatives.ts')
  }

  // .gitignore
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

  // AI scaffolding (when --ai flag is passed)
  if (enableAi) {
    // prompts/ directory with brand template
    const promptsDir = join(rootDir, 'prompts')
    if (existsSync(promptsDir)) {
      skipped.push('prompts/')
    } else {
      mkdirSync(promptsDir, { recursive: true })
      created.push('prompts/')
    }

    const brandPath = join(promptsDir, 'brand.ts')
    if (existsSync(brandPath)) {
      skipped.push('prompts/brand.ts')
    } else {
      await Bun.write(brandPath, BRAND_PROMPT_TEMPLATE)
      created.push('prompts/brand.ts')
    }

    // ads.generate.ts template
    const generatePath = join(rootDir, 'ads.generate.ts')
    if (existsSync(generatePath)) {
      skipped.push('ads.generate.ts')
    } else {
      await Bun.write(generatePath, GENERATE_MATRIX_TEMPLATE)
      created.push('ads.generate.ts')
    }

    // generated/ directory with .gitkeep
    const generatedDir = join(rootDir, 'generated')
    if (existsSync(generatedDir)) {
      skipped.push('generated/')
    } else {
      mkdirSync(generatedDir, { recursive: true })
      await Bun.write(join(generatedDir, '.gitkeep'), '')
      created.push('generated/')
    }
  }

  // Output
  if (flags.json) {
    console.log(JSON.stringify({ created, skipped }, null, 2))
  } else {
    if (created.length > 0) {
      console.log('Created:')
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
      console.log('\nNext steps:')
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
}
