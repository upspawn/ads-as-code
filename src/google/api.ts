import type { AdsError } from '../core/types.ts'
import type { GoogleConfig, GoogleAdsClient, GoogleAdsRow, MutateOperation, MutateResult } from './types.ts'
import { API_VERSION, BASE_URL } from './constants.ts'

// === Credential Resolution ===

type ResolvedCredentials = {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
  readonly developerToken: string
  readonly customerId: string
  readonly managerId?: string
}

/**
 * Read credentials from ~/.ads/credentials.json.
 * Returns null if file doesn't exist or is unreadable.
 */
async function readCredentialsFile(): Promise<Record<string, string> | null> {
  try {
    const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
    const path = `${home}/.ads/credentials.json`
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return await file.json()
  } catch {
    return null
  }
}

/**
 * Resolve Google Ads credentials from (1) explicit config, (2) credentials file, (3) env vars.
 * Throws an AdsError of type 'auth' if credentials cannot be resolved.
 */
async function resolveCredentials(config: GoogleConfig): Promise<ResolvedCredentials> {
  // (1) Explicit OAuth config
  if (config.type === 'oauth') {
    const customerId = process.env['GOOGLE_ADS_CUSTOMER_ID']
    if (!customerId) {
      throw adsError({ type: 'auth', message: 'GOOGLE_ADS_CUSTOMER_ID env var required with oauth config' })
    }
    return {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      developerToken: config.developerToken,
      customerId: customerId.replace(/-/g, ''),
      managerId: config.managerId,
    }
  }

  // (1b) Service account — not yet implemented
  if (config.type === 'service-account') {
    throw adsError({ type: 'auth', message: 'Service account authentication is not yet supported' })
  }

  // (2) Try ~/.ads/credentials.json
  const fileCreds = await readCredentialsFile()
  if (fileCreds) {
    const clientId = fileCreds['google_client_id']
    const clientSecret = fileCreds['google_client_secret']
    const refreshToken = fileCreds['google_refresh_token']
    const developerToken = fileCreds['google_developer_token']
    const customerId = fileCreds['google_customer_id']
    const managerId = fileCreds['google_manager_id']

    if (clientId && clientSecret && refreshToken && developerToken && customerId) {
      return {
        clientId,
        clientSecret,
        refreshToken,
        developerToken,
        customerId: customerId.replace(/-/g, ''),
        managerId: managerId || undefined,
      }
    }
  }

  // (3) Environment variables
  const clientId = process.env['GOOGLE_ADS_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_ADS_CLIENT_SECRET']
  const refreshToken = process.env['GOOGLE_ADS_REFRESH_TOKEN']
  const developerToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN']
  const customerId = process.env['GOOGLE_ADS_CUSTOMER_ID']
  const managerId = process.env['GOOGLE_ADS_MANAGER_ID']

  if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
    throw adsError({
      type: 'auth',
      message: 'Google Ads credentials not found. Provide them via GoogleConfig, ~/.ads/credentials.json, or GOOGLE_ADS_* env vars.',
    })
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    developerToken,
    customerId: customerId.replace(/-/g, ''),
    managerId: managerId || undefined,
  }
}

// === OAuth Token Management ===

type CachedToken = {
  accessToken: string
  expiresAt: number
}

/**
 * Exchange a refresh token for an access token via Google OAuth2.
 * Caches the token and refreshes when within 60s of expiry.
 */
function createTokenManager(creds: ResolvedCredentials) {
  let cached: CachedToken | null = null

  return async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cached && Date.now() < cached.expiresAt - 60_000) {
      return cached.accessToken
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw adsError({ type: 'auth', message: `OAuth token exchange failed: ${response.status} ${text}` })
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    cached = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }

    return cached.accessToken
  }
}

// === Error Mapping ===

class AdsApiError extends Error {
  readonly adsError: AdsError

  constructor(error: AdsError) {
    super(error.message)
    this.name = 'AdsApiError'
    this.adsError = error
  }
}

function adsError(error: AdsError): AdsApiError {
  return new AdsApiError(error)
}

/**
 * Map an HTTP status code and response body to an AdsError.
 */
function mapHttpError(status: number, body: string): AdsError {
  switch (status) {
    case 401:
    case 403:
      return { type: 'auth', message: `Authentication failed (${status}): ${body}` }
    case 429:
      return { type: 'quota', message: `Rate limited (429): ${body}`, retryAfter: 30 }
    case 400: {
      // Try to extract field info from validation errors
      try {
        const parsed = JSON.parse(body)
        const details = parsed?.error?.details ?? []
        for (const detail of details) {
          const errors = detail?.errors ?? []
          for (const err of errors) {
            if (err?.errorCode?.requestError || err?.errorCode?.fieldError) {
              return { type: 'validation', field: err.location?.fieldPathElements?.[0]?.fieldName ?? 'unknown', message: err.message ?? body }
            }
          }
        }
      } catch {
        // Not JSON, fall through
      }
      return { type: 'validation', field: 'unknown', message: `Bad request (400): ${body}` }
    }
    case 409:
      return {
        type: 'conflict',
        resource: { kind: 'campaign', path: 'unknown', properties: {} },
        message: `Conflict (409): ${body}`,
      }
    default:
      return { type: 'api', code: status, message: `API error (${status}): ${body}` }
  }
}

// === Retry Logic ===

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempt = 0,
): Promise<Response> {
  const response = await fetch(url, options)

  if (!response.ok && isRetryable(response.status) && attempt < MAX_RETRIES - 1) {
    const delay = BASE_DELAY_MS * Math.pow(2, attempt)
    await sleep(delay)
    return fetchWithRetry(url, options, attempt + 1)
  }

  return response
}

// === API Client Factory ===

/**
 * Create a Google Ads API client.
 *
 * Credential resolution order:
 * 1. Explicit config (oauth or service-account)
 * 2. ~/.ads/credentials.json
 * 3. GOOGLE_ADS_* environment variables
 *
 * @example
 * ```ts
 * const client = await createGoogleClient({ type: 'env' })
 * const rows = await client.query('SELECT campaign.name FROM campaign')
 * ```
 */
export async function createGoogleClient(config: GoogleConfig): Promise<GoogleAdsClient> {
  const creds = await resolveCredentials(config)
  const getToken = createTokenManager(creds)

  async function buildHeaders(): Promise<Record<string, string>> {
    const token = await getToken()
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'developer-token': creds.developerToken,
    }
    if (creds.managerId) {
      headers['login-customer-id'] = creds.managerId.replace(/-/g, '')
    }
    return headers
  }

  const customerId = creds.customerId.replace(/-/g, '')

  async function query(gaql: string): Promise<GoogleAdsRow[]> {
    const url = `${BASE_URL}/${API_VERSION}/customers/${customerId}/googleAds:searchStream`
    const headers = await buildHeaders()

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gaql }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw adsError(mapHttpError(response.status, body))
    }

    const data = (await response.json()) as Array<{ results?: GoogleAdsRow[] }>
    // searchStream returns an array of result batches
    const rows: GoogleAdsRow[] = []
    for (const batch of data) {
      if (batch.results) {
        rows.push(...batch.results)
      }
    }
    return rows
  }

  async function mutate(operations: MutateOperation[]): Promise<MutateResult[]> {
    const url = `${BASE_URL}/${API_VERSION}/customers/${customerId}/googleAds:mutate`
    const headers = await buildHeaders()

    // Convert our MutateOperation format to Google Ads API format
    const mutateOperations = operations.map(op => ({
      [op.operation]: {
        ...op.resource,
        ...(op.updateMask ? { updateMask: op.updateMask } : {}),
      },
    }))

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mutateOperations }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw adsError(mapHttpError(response.status, body))
    }

    const data = (await response.json()) as {
      mutateOperationResponses?: Array<{
        campaignResult?: { resourceName: string }
        adGroupResult?: { resourceName: string }
        adGroupAdResult?: { resourceName: string }
        adGroupCriterionResult?: { resourceName: string }
        [key: string]: unknown
      }>
    }

    const results: MutateResult[] = (data.mutateOperationResponses ?? []).map(resp => {
      // Find the first *Result key
      const resultKey = Object.keys(resp).find(k => k.endsWith('Result'))
      const resultObj = resultKey ? (resp[resultKey] as { resourceName: string } | undefined) : undefined
      return {
        resourceName: resultObj?.resourceName ?? '',
      }
    })

    return results
  }

  return {
    query,
    mutate,
    customerId,
    managerId: creds.managerId,
  }
}

export { AdsApiError, adsError, mapHttpError, resolveCredentials }
export type { ResolvedCredentials }
