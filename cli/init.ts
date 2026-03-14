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

Also updates .gitignore with ads-as-code entries.
`.trim())
    return
  }

  const rootDir = process.cwd()
  const created: string[] = []
  const skipped: string[] = []

  // ads.config.ts
  const configPath = join(rootDir, 'ads.config.ts')
  if (existsSync(configPath)) {
    skipped.push('ads.config.ts')
  } else {
    await Bun.write(configPath, CONFIG_TEMPLATE)
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
    }
  }
}
