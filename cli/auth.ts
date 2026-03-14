import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'

const CREDENTIALS_PATH = join(homedir(), '.ads', 'credentials.json')

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'

type Credentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  developerToken: string
}

function prompt(message: string): Promise<string> {
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

function promptConfirm(message: string): Promise<boolean> {
  return prompt(message).then((answer) => answer.toLowerCase() === 'y')
}

async function loadCredentials(): Promise<Credentials | null> {
  const file = Bun.file(CREDENTIALS_PATH)
  if (!(await file.exists())) return null
  try {
    return (await file.json()) as Credentials
  } catch {
    return null
  }
}

async function saveCredentials(creds: Credentials): Promise<void> {
  const dir = join(homedir(), '.ads')
  mkdirSync(dir, { recursive: true })
  await Bun.write(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + '\n')
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Token refresh failed (${response.status}): ${body}`)
  }
  const data = (await response.json()) as { access_token: string }
  return data.access_token
}

async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${body}`)
  }
  const data = (await response.json()) as { refresh_token?: string }
  if (!data.refresh_token) {
    throw new Error('No refresh token received. Make sure prompt=consent is set.')
  }
  return data.refresh_token
}

async function runAuthCheck(): Promise<void> {
  // Try credentials file first
  let creds = await loadCredentials()

  // Fall back to env vars
  if (!creds) {
    const clientId = process.env['GOOGLE_ADS_CLIENT_ID']
    const clientSecret = process.env['GOOGLE_ADS_CLIENT_SECRET']
    const refreshToken = process.env['GOOGLE_ADS_REFRESH_TOKEN']
    const developerToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN']

    if (clientId && clientSecret && refreshToken && developerToken) {
      creds = { clientId, clientSecret, refreshToken, developerToken }
      console.log('Using credentials from environment variables.')
    } else {
      console.error('No credentials found. Run `ads auth google` to authenticate.')
      process.exit(1)
    }
  } else {
    console.log(`Using credentials from ${CREDENTIALS_PATH}`)
  }

  // Try to get an access token to verify credentials work
  try {
    await getAccessToken(creds.clientId, creds.clientSecret, creds.refreshToken)
    console.log('Authentication valid.')
  } catch (err) {
    console.error(
      'Authentication check failed:',
      err instanceof Error ? err.message : err,
    )
    process.exit(1)
  }
}

async function runAuthGoogle(): Promise<void> {
  // Check existing credentials
  const existing = await loadCredentials()
  if (existing) {
    console.log(`Existing credentials found at ${CREDENTIALS_PATH}`)
    const reauth = await promptConfirm('Re-authenticate? (y/N) ')
    if (!reauth) {
      console.log('Keeping existing credentials.')
      return
    }
  }

  // Prompt for developer token and OAuth credentials
  const developerToken = await prompt(
    'Enter your Google Ads Developer Token (from API Center): ',
  )
  if (!developerToken) {
    console.error('Developer token is required.')
    process.exit(1)
  }

  const clientId = await prompt('Enter OAuth Client ID: ')
  if (!clientId) {
    console.error('Client ID is required.')
    process.exit(1)
  }

  const clientSecret = await prompt('Enter OAuth Client Secret: ')
  if (!clientSecret) {
    console.error('Client secret is required.')
    process.exit(1)
  }

  // Start local server to receive the OAuth callback
  let resolveCode: (code: string) => void
  let rejectCode: (err: Error) => void
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = Bun.serve({
    port: 0, // random available port
    fetch(req) {
      const url = new URL(req.url)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        rejectCode!(new Error(`OAuth error: ${error}`))
        return new Response(
          '<html><body><h1>Authentication failed.</h1><p>You can close this window.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } },
        )
      }

      if (code) {
        resolveCode!(code)
        return new Response(
          '<html><body><h1>Authenticated!</h1><p>You can close this window and return to the terminal.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } },
        )
      }

      return new Response('Waiting for OAuth callback...', { status: 400 })
    },
  })

  const port = server.port
  const redirectUri = `http://localhost:${port}`

  // Build OAuth URL
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`

  console.log('Opening browser...')
  Bun.spawn(['open', authUrl])
  console.log(`\nIf the browser didn't open, visit:\n${authUrl}\n`)
  console.log('Waiting for authorization...')

  // Set timeout
  const timeout = setTimeout(() => {
    rejectCode!(new Error('OAuth callback timed out after 120 seconds.'))
    server.stop()
  }, 120_000)

  try {
    const code = await codePromise
    clearTimeout(timeout)
    server.stop()

    console.log('Authorization code received. Exchanging for tokens...')

    const refreshToken = await exchangeCodeForTokens(
      code,
      clientId,
      clientSecret,
      redirectUri,
    )

    await saveCredentials({
      clientId,
      clientSecret,
      refreshToken,
      developerToken,
    })

    console.log(
      `\nAuthenticated successfully. Credentials saved to ${CREDENTIALS_PATH}`,
    )
  } catch (err) {
    clearTimeout(timeout)
    server.stop()
    throw err
  }
}

export async function runAuth(
  provider: string,
  options: { check?: boolean },
): Promise<void> {
  if (provider !== 'google') {
    console.error('Only \'google\' provider is supported.')
    process.exit(1)
  }

  if (options.check) {
    await runAuthCheck()
  } else {
    await runAuthGoogle()
  }
}
