#!/usr/bin/env bun

const USAGE = `
ads — declarative ad campaign management

Usage:
  ads <command> [options]

Commands:
  init          Scaffold a new ads-as-code project
  validate      Validate campaign files and report errors
  plan          Show what changes would be applied (not implemented yet)
  apply         Apply changes to ad platforms (not implemented yet)
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
    case 'plan':
    case 'apply':
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
