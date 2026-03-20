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
  generate      Generate expanded campaign variants (translations, ICP)
  plan          Show what changes would be applied
  apply         Apply changes to ad platforms
  pull          Pull live state and detect drift from code
  status        Show current platform state
  history       Show operation history
  performance   Show campaign performance metrics and analysis
  optimize      AI-powered campaign optimization analysis
  doctor        Run diagnostic checks on project setup
  cache         Manage the local cache (clear, stats)
  search        Search Meta interests or behaviors for targeting
  audiences     List Meta custom audiences in account
  generate      Generate AI-powered ad copy and keywords
  diff          Compare local vs platform state (not implemented yet)
  destroy       Remove all managed resources (not implemented yet)

Global Flags:
  --json        Output in JSON format
  --provider    Filter to a specific provider (google, meta)
  --filter      Filter campaigns by glob pattern (status command)
  --dry-run     Show exact API payloads without making changes (apply command)
  --diff N      Show changeset for operation N (history command)
  --rollback N  Show snapshot N for revert (history command)
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
        console.error('Providers: google, reddit')
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
    case 'generate': {
      const { runGenerate } = await import('./generate.ts')
      await runGenerate(args.slice(1), flags)
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
    case 'performance': {
      const { runPerformance } = await import('./performance.ts')
      await runPerformance(args.slice(1), flags)
      break
    }
    case 'optimize': {
      const { runOptimize } = await import('./optimize.ts')
      await runOptimize(args.slice(1), flags)
      break
    }
    case 'pull': {
      const { runPull } = await import('./pull.ts')
      await runPull(process.cwd())
      break
    }
    case 'status': {
      const { runStatus } = await import('./status.ts')
      await runStatus(process.cwd(), {
        json: flags.json,
        filter: getFlag(args, '--filter'),
        provider: flags.provider,
      })
      break
    }
    case 'history': {
      const { runHistory } = await import('./history.ts')
      const diffFlag = getFlag(args, '--diff')
      const rollbackFlag = getFlag(args, '--rollback')
      await runHistory(process.cwd(), {
        diff: diffFlag ? Number(diffFlag) : undefined,
        rollback: rollbackFlag ? Number(rollbackFlag) : undefined,
      })
      break
    }
    case 'doctor': {
      const { runDoctor } = await import('./doctor.ts')
      await runDoctor(process.cwd())
      break
    }
    case 'generate': {
      const { runGenerate } = await import('./generate.ts')
      await runGenerate(args.slice(1), flags)
      break
    }
    case 'cache': {
      const { runCache } = await import('./cache.ts')
      const action = args[1]
      if (action !== 'clear' && action !== 'stats') {
        console.error('Usage: ads cache <clear|stats>')
        process.exit(1)
      }
      await runCache(process.cwd(), action)
      break
    }
    case 'search': {
      const { runSearch } = await import('./search.ts')
      await runSearch(args.slice(1), flags)
      break
    }
    case 'audiences': {
      const { runAudiences } = await import('./audiences.ts')
      await runAudiences(args.slice(1), flags)
      break
    }
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
