import { discoverCampaigns, loadConfig } from '../src/core/discovery.ts'
import type { GlobalFlags } from './init.ts'

const VALIDATE_USAGE = `
ads validate — Validate campaign files and report errors

Discovers all campaign files in campaigns/**/*.ts, loads them,
and reports any import errors or structural issues.

Flags:
  --json        Output results as JSON
  --provider    Only validate campaigns for this provider
  --help, -h    Show this help message
`.trim()

export async function runValidate(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(VALIDATE_USAGE)
    return
  }

  const rootDir = process.cwd()

  // Load config (optional — validation works without it)
  const config = await loadConfig(rootDir)

  // Discover campaigns
  const result = await discoverCampaigns(rootDir)

  // Filter by provider if specified
  let campaigns = result.campaigns
  if (flags.provider) {
    campaigns = campaigns.filter(c => c.provider === flags.provider)
  }

  const hasErrors = result.errors.length > 0

  if (flags.json) {
    console.log(JSON.stringify({
      valid: !hasErrors,
      config: config ? 'loaded' : 'not found',
      campaigns: campaigns.map(c => ({
        file: c.file,
        export: c.exportName,
        provider: c.provider,
        kind: c.kind,
      })),
      errors: result.errors.map(e => ({
        file: e.file,
        message: e.message,
      })),
    }, null, 2))
  } else {
    // Config status
    if (config) {
      console.log('Config: ads.config.ts loaded')
    } else {
      console.log('Config: ads.config.ts not found (optional)')
    }
    console.log()

    // Campaigns found
    if (campaigns.length > 0) {
      console.log(`Campaigns: ${campaigns.length} found`)
      for (const c of campaigns) {
        const relFile = c.file.replace(rootDir + '/', '')
        console.log(`  ${c.provider}/${c.kind}  ${relFile} (export: ${c.exportName})`)
      }
    } else {
      console.log('Campaigns: none found')
    }

    // Errors
    if (hasErrors) {
      console.log()
      console.log(`Errors: ${result.errors.length}`)
      for (const e of result.errors) {
        const relFile = e.file.replace(rootDir + '/', '')
        console.log(`  ✗ ${relFile}: ${e.message}`)
      }
    }

    console.log()
    console.log(hasErrors ? 'Validation failed.' : 'Validation passed.')
  }

  process.exit(hasErrors ? 1 : 0)
}
