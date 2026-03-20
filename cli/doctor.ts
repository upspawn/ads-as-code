import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../src/core/discovery.ts'
import { Cache } from '../src/core/cache.ts'

type CheckResult = {
  name: string
  pass: boolean
  message: string
  fix?: string
}

/**
 * Run diagnostic checks on the ads-as-code project setup.
 */
export async function runDoctor(rootDir: string): Promise<void> {
  const checks: CheckResult[] = []

  // 1. ads.config.ts exists and parses
  try {
    const config = await loadConfig(rootDir)
    if (config) {
      checks.push({
        name: 'Config file',
        pass: true,
        message: 'ads.config.ts loaded successfully',
      })
    } else {
      checks.push({
        name: 'Config file',
        pass: false,
        message: 'ads.config.ts not found',
        fix: 'Run `ads init` to create one',
      })
    }
  } catch (err) {
    checks.push({
      name: 'Config file',
      pass: false,
      message: `ads.config.ts failed to parse: ${err instanceof Error ? err.message : err}`,
      fix: 'Check for syntax errors in ads.config.ts',
    })
  }

  // 2. Google credentials
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
  const credentialsPath = join(home, '.ads', 'credentials.json')
  const hasCredentialsFile = existsSync(credentialsPath)

  const hasGoogleEnvVars =
    !!process.env['GOOGLE_ADS_CLIENT_ID'] &&
    !!process.env['GOOGLE_ADS_CLIENT_SECRET'] &&
    !!process.env['GOOGLE_ADS_REFRESH_TOKEN'] &&
    !!process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] &&
    !!process.env['GOOGLE_ADS_CUSTOMER_ID']

  if (hasCredentialsFile || hasGoogleEnvVars) {
    const source = hasCredentialsFile ? '~/.ads/credentials.json' : 'environment variables'
    checks.push({
      name: 'Google credentials',
      pass: true,
      message: `Found credentials via ${source}`,
    })
  } else {
    checks.push({
      name: 'Google credentials',
      pass: false,
      message: 'No Google credentials found',
      fix: 'Run `ads auth google` or set GOOGLE_ADS_* environment variables',
    })
  }

  // 2b. Reddit credentials
  let hasRedditCreds = false
  if (hasCredentialsFile) {
    try {
      const content = await Bun.file(credentialsPath).json() as Record<string, string>
      hasRedditCreds = !!content['reddit_app_id'] && !!content['reddit_app_secret']
    } catch {
      // Ignore parse errors — already caught above
    }
  }

  const hasRedditEnvVars =
    !!process.env['REDDIT_APP_ID'] &&
    !!process.env['REDDIT_APP_SECRET']

  if (hasRedditCreds || hasRedditEnvVars) {
    const source = hasRedditCreds ? '~/.ads/credentials.json' : 'environment variables'
    checks.push({
      name: 'Reddit credentials',
      pass: true,
      message: `Found Reddit credentials via ${source}`,
    })
  } else {
    checks.push({
      name: 'Reddit credentials',
      pass: false,
      message: 'No Reddit credentials found (optional)',
      fix: 'Run `ads auth reddit` or set REDDIT_APP_ID + REDDIT_APP_SECRET environment variables',
    })
  }

  // Keep combined flag for API connectivity check below
  const hasEnvVars = hasGoogleEnvVars

  // 3. API connectivity
  if (hasCredentialsFile || hasEnvVars) {
    try {
      const { createGoogleClient } = await import('../src/google/api.ts')
      const client = await createGoogleClient({ type: 'env' })

      // Try a minimal query
      await client.query('SELECT campaign.id FROM campaign LIMIT 1')

      checks.push({
        name: 'API connectivity',
        pass: true,
        message: `Connected to Google Ads (customer ${client.customerId})`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      // Distinguish auth errors from network errors
      if (message.includes('Authentication') || message.includes('auth') || message.includes('401') || message.includes('403')) {
        checks.push({
          name: 'API connectivity',
          pass: false,
          message: `Authentication failed: ${message.slice(0, 100)}`,
          fix: 'Check your credentials — run `ads auth google` to re-authenticate',
        })
      } else {
        checks.push({
          name: 'API connectivity',
          pass: false,
          message: `API request failed: ${message.slice(0, 100)}`,
          fix: 'Check your internet connection and Google Ads API access',
        })
      }
    }
  } else {
    checks.push({
      name: 'API connectivity',
      pass: false,
      message: 'Skipped — no credentials available',
      fix: 'Set up credentials first',
    })
  }

  // 4. Cache accessible and schema current
  const cachePath = join(rootDir, '.ads', 'cache.db')
  try {
    const cache = new Cache(cachePath)
    // If we got here, schema is current
    cache.close()
    checks.push({
      name: 'Cache',
      pass: true,
      message: `cache.db accessible at .ads/cache.db`,
    })
  } catch (err) {
    if (!existsSync(join(rootDir, '.ads'))) {
      checks.push({
        name: 'Cache',
        pass: false,
        message: '.ads/ directory does not exist',
        fix: 'Run `ads apply` to create the cache, or `mkdir .ads`',
      })
    } else {
      checks.push({
        name: 'Cache',
        pass: false,
        message: `Cache error: ${err instanceof Error ? err.message : err}`,
        fix: 'Run `ads cache clear` to reset the cache',
      })
    }
  }

  // 5. campaigns/ directory exists
  const campaignsDir = join(rootDir, 'campaigns')
  if (existsSync(campaignsDir)) {
    checks.push({
      name: 'Campaigns directory',
      pass: true,
      message: 'campaigns/ directory exists',
    })
  } else {
    checks.push({
      name: 'Campaigns directory',
      pass: false,
      message: 'campaigns/ directory not found',
      fix: 'Run `ads init` to scaffold the project',
    })
  }

  // 6. At least one campaign file found
  if (existsSync(campaignsDir)) {
    const glob = new Bun.Glob('campaigns/**/*.ts')
    const files: string[] = []
    for await (const match of glob.scan({ cwd: rootDir, absolute: true })) {
      files.push(match)
    }

    if (files.length > 0) {
      checks.push({
        name: 'Campaign files',
        pass: true,
        message: `${files.length} campaign file(s) found`,
      })
    } else {
      checks.push({
        name: 'Campaign files',
        pass: false,
        message: 'No .ts files in campaigns/',
        fix: 'Create a campaign file: campaigns/my-campaign.ts',
      })
    }
  } else {
    checks.push({
      name: 'Campaign files',
      pass: false,
      message: 'Skipped — campaigns/ directory missing',
    })
  }

  // Print results
  console.log()
  console.log('ads doctor')
  console.log('──────────')
  console.log()

  let passCount = 0
  let failCount = 0

  for (const check of checks) {
    const icon = check.pass ? 'PASS' : 'FAIL'
    const prefix = check.pass ? '  [PASS]' : '  [FAIL]'
    console.log(`${prefix}  ${check.name}: ${check.message}`)
    if (!check.pass && check.fix) {
      console.log(`          Fix: ${check.fix}`)
    }
    if (check.pass) passCount++
    else failCount++
  }

  console.log()
  if (failCount === 0) {
    console.log(`All ${passCount} checks passed.`)
  } else {
    console.log(`${passCount} passed, ${failCount} failed.`)
  }
}
