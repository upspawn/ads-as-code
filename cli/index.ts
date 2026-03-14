#!/usr/bin/env bun

const USAGE = `
ads — declarative ad campaign management

Usage:
  ads <command> [options]

Commands:
  init          Scaffold a new ads-as-code project
  validate      Validate campaign files and report errors
  auth          Authenticate with ad platforms
  import        Import campaigns from Google Ads as TypeScript files
  plan          Show what changes would be applied
  apply         Apply changes to ad platforms
  status        Show current platform state (not implemented yet)
  diff          Compare local vs platform state (not implemented yet)
  destroy       Remove all managed resources (not implemented yet)

Global Flags:
  --json        Output in JSON format
  --provider    Filter to a specific provider (google, meta)
  --help, -h    Show this help message
`.trim()

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  // Global flags
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    process.exit(0)
  }

  // Parse global flags from remaining args
  const flags = {
    json: args.includes('--json'),
    provider: getFlag(args, '--provider'),
    help: args.includes('--help') || args.includes('-h'),
  }

  // Route to subcommands
  switch (command) {
    case 'init': {
      const { runInit } = await import('./init.ts')
      await runInit(args.slice(1), flags)
      break
    }
    case 'validate': {
      const { runValidate } = await import('./validate.ts')
      await runValidate(args.slice(1), flags)
      break
    }
    case 'auth': {
      const { runAuth } = await import('./auth.ts')
      const provider = args[1]
      if (!provider) {
        console.error('Usage: ads auth <provider> [--check]')
        console.error('Providers: google')
        process.exit(1)
      }
      const check = args.includes('--check')
      await runAuth(provider, { check })
      break
    }
    case 'import': {
      const { runImport } = await import('./import.ts')
      await runImport(args.slice(1), flags)
      break
    }
    case 'plan': {
      const { runPlanCommand } = await import('./plan.ts')
      await runPlanCommand(args.slice(1), flags)
      break
    }
    case 'apply': {
      const { runApplyCommand } = await import('./apply.ts')
      await runApplyCommand(args.slice(1), flags)
      break
    }
    case 'status':
    case 'diff':
    case 'destroy':
      console.log(`Not implemented yet: ${command}`)
      process.exit(0)
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.log()
      console.log(USAGE)
      process.exit(1)
  }
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
