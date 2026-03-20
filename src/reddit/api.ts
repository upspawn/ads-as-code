// Reddit Ads API client
// OAuth2 token exchange, rate limiting, error mapping, pagination

import type { AdsError, Resource } from '../core/types.ts'
import type { RedditProviderConfig } from './types.ts'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

// ─── Error Types ───────────────────────────────────────────

class RedditApiError extends Error {
  readonly adsError: AdsError

  constructor(error: AdsError) {
    super(error.message)
    this.name = 'RedditApiError'
    this.adsError = error
  }
}

// ─── Error Response Parsing ────────────────────────────────

type RedditErrorBody = {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

function isRedditErrorBody(body: unknown): body is RedditErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as RedditErrorBody).error === 'object' &&
    (body as RedditErrorBody).error !== null &&
    typeof (body as RedditErrorBody).error.code === 'string'
  )
}

/**
 * Maps Reddit Ads API error responses to SDK AdsError types.
 *
 * Reddit uses string error codes:
 * - UNAUTHORIZED: invalid/expired token
 * - 429 status: rate limiting
 * - INVALID_REQUEST: validation error
 * - POLICY_VIOLATION: ad policy rejection
 */
export function mapRedditError(httpStatus: number, body: unknown): AdsError {
  if (!isRedditErrorBody(body)) {
    return { type: 'api', code: httpStatus, message: `Reddit API error (${httpStatus}): ${JSON.stringify(body)}` }
  }

  const { error } = body
  const message = error.message

  // Auth errors
  if (error.code === 'UNAUTHORIZED' || httpStatus === 401 || httpStatus === 403) {
    return { type: 'auth', message }
  }

  // Rate limiting
  if (httpStatus === 429 || error.code === 'RATE_LIMITED') {
    return { type: 'quota', message, retryAfter: 60 }
  }

  // Validation errors
  if (error.code === 'INVALID_REQUEST') {
    return { type: 'validation', field: 'unknown', message }
  }

  // Policy violations — need a dummy resource for the policy error type
  if (error.code === 'POLICY_VIOLATION') {
    const dummyResource: Resource = { kind: 'ad', path: 'unknown', properties: {} }
    return { type: 'policy', resource: dummyResource, message }
  }

  return { type: 'api', code: httpStatus, message }
}

// ─── Credential Resolution ─────────────────────────────────

type ResolvedCredentials = {
  readonly accountId: string
  readonly appId: string
  readonly appSecret: string
  readonly refreshToken?: string
  readonly username?: string
  readonly password?: string
  readonly userAgent: string
}

/**
 * Reads credentials from ~/.ads/credentials.json or a custom path.
 * Returns undefined if file doesn't exist.
 */
function readCredentialsFile(path?: string): Record<string, string> | undefined {
  const filePath = path ?? resolve(homedir(), '.ads', 'credentials.json')
  if (!existsSync(filePath)) return undefined

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, string>
  } catch {
    return undefined
  }
}

/**
 * Resolves Reddit credentials in priority order:
 * 1. Explicit config fields
 * 2. Credentials file (~/.ads/credentials.json or custom path)
 * 3. Environment variables
 */
export function resolveRedditCredentials(config: RedditProviderConfig): ResolvedCredentials {
  const fileCredentials = readCredentialsFile(config.credentials)

  const appId =
    config.appId ??
    fileCredentials?.['reddit_app_id'] ??
    process.env['REDDIT_APP_ID'] ??
    ''

  const appSecret =
    config.appSecret ??
    fileCredentials?.['reddit_app_secret'] ??
    process.env['REDDIT_APP_SECRET'] ??
    ''

  const refreshToken =
    config.refreshToken ??
    fileCredentials?.['reddit_refresh_token'] ??
    process.env['REDDIT_REFRESH_TOKEN']

  const username =
    config.username ??
    fileCredentials?.['reddit_username'] ??
    process.env['REDDIT_USERNAME']

  const password =
    config.password ??
    fileCredentials?.['reddit_password'] ??
    process.env['REDDIT_PASSWORD']

  const userAgent =
    config.userAgent ??
    fileCredentials?.['reddit_user_agent'] ??
    process.env['REDDIT_USER_AGENT'] ??
    'ads-as-code/1.0'

  return {
    accountId: config.accountId,
    appId,
    appSecret,
    refreshToken,
    username,
    password,
    userAgent,
  }
}

// ─── OAuth2 Token Exchange ─────────────────────────────────

type TokenResponse = {
  readonly access_token: string
  readonly token_type: string
  readonly expires_in: number
  readonly scope: string
}

/**
 * Exchange a refresh token for an access token via Reddit's OAuth2 endpoint.
 * Supports both refresh_token and password grant types.
 */
async function exchangeToken(credentials: ResolvedCredentials): Promise<string> {
  const { appId, appSecret, refreshToken, username, password, userAgent } = credentials

  if (!appId || !appSecret) {
    throw new RedditApiError({
      type: 'auth',
      message: 'Reddit app ID and secret are required. Set REDDIT_APP_ID and REDDIT_APP_SECRET, or configure in ~/.ads/credentials.json',
    })
  }

  const authHeader = `Basic ${btoa(`${appId}:${appSecret}`)}`
  const body = new URLSearchParams()

  if (refreshToken) {
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', refreshToken)
  } else if (username && password) {
    body.set('grant_type', 'password')
    body.set('username', username)
    body.set('password', password)
  } else {
    throw new RedditApiError({
      type: 'auth',
      message: 'Reddit refresh token or username/password required. Set REDDIT_REFRESH_TOKEN or REDDIT_USERNAME/REDDIT_PASSWORD',
    })
  }

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new RedditApiError({
      type: 'auth',
      message: `Reddit OAuth2 token exchange failed (${response.status}): ${errorBody}`,
    })
  }

  const token = (await response.json()) as TokenResponse
  return token.access_token
}

// ─── Reddit Ads API Client ─────────────────────────────────

const BASE_URL = 'https://ads-api.reddit.com/api/v3'

export type RedditClient = {
  readonly get: <T = unknown>(endpoint: string, params?: Record<string, string>) => Promise<T>
  readonly post: <T = unknown>(endpoint: string, body: unknown) => Promise<T>
  readonly put: <T = unknown>(endpoint: string, body: unknown) => Promise<T>
  readonly delete: <T = unknown>(endpoint: string) => Promise<T>
  readonly fetchAll: <T>(endpoint: string, params?: Record<string, string>) => Promise<T[]>
  readonly upload: <T = unknown>(endpoint: string, formData: FormData) => Promise<T>
}

type PaginatedResponse<T> = {
  readonly data: T[]
  readonly after?: string
}

export function createRedditClient(config: RedditProviderConfig): RedditClient {
  const credentials = resolveRedditCredentials(config)
  let accessToken: string | null = null

  async function ensureToken(): Promise<string> {
    if (!accessToken) {
      accessToken = await exchangeToken(credentials)
    }
    return accessToken
  }

  /** Handle rate limit headers — wait if remaining is low. */
  async function handleRateLimit(response: Response): Promise<void> {
    const remaining = response.headers.get('X-Ratelimit-Remaining')
    const reset = response.headers.get('X-Ratelimit-Reset')

    if (remaining !== null && parseFloat(remaining) < 1 && reset) {
      const waitMs = parseFloat(reset) * 1000
      await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 60_000)))
    }
  }

  async function request<T>(method: string, endpoint: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const token = await ensureToken()
    const url = new URL(`${BASE_URL}/${endpoint}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': credentials.userAgent,
    }

    const fetchOptions: RequestInit = { method, headers }

    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
      headers['Content-Type'] = 'application/json'
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url.toString(), fetchOptions)

    await handleRateLimit(response)

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text()
      }

      // Retry once on 401 — token may have expired
      if (response.status === 401 && accessToken) {
        accessToken = null
        return request<T>(method, endpoint, body, params)
      }

      throw new RedditApiError(mapRedditError(response.status, errorBody))
    }

    const text = await response.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }

  async function get<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return request<T>('GET', endpoint, undefined, params)
  }

  async function post<T = unknown>(endpoint: string, body: unknown): Promise<T> {
    return request<T>('POST', endpoint, body)
  }

  async function put<T = unknown>(endpoint: string, body: unknown): Promise<T> {
    return request<T>('PUT', endpoint, body)
  }

  async function del<T = unknown>(endpoint: string): Promise<T> {
    return request<T>('DELETE', endpoint)
  }

  async function fetchAll<T>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
    const results: T[] = []
    let after: string | undefined

    do {
      const queryParams = { ...params }
      if (after) queryParams['after'] = after

      const page = await get<PaginatedResponse<T>>(endpoint, queryParams)
      results.push(...page.data)
      after = page.after
    } while (after)

    return results
  }

  async function upload<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
    const token = await ensureToken()
    const url = new URL(`${BASE_URL}/${endpoint}`)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': credentials.userAgent,
      },
      body: formData,
    })

    await handleRateLimit(response)

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: { code: 'UNKNOWN', message: response.statusText } }))
      throw new RedditApiError(mapRedditError(response.status, errorBody))
    }

    return (await response.json()) as T
  }

  return { get, post, put, delete: del, fetchAll, upload }
}

export { RedditApiError }
