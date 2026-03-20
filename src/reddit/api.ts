// src/reddit/api.ts
import type { AdsError, Resource } from '../core/types.ts'
import type { RedditProviderConfig } from './types.ts'

// === Error Types ===

export class RedditApiError extends Error {
  readonly adsError: AdsError

  constructor(error: AdsError) {
    super(error.message)
    this.name = 'RedditApiError'
    this.adsError = error
  }
}

// === Credential Resolution ===

export type RedditCredentials = {
  readonly appId: string
  readonly appSecret: string
  readonly refreshToken?: string
  readonly username?: string
  readonly password?: string
  readonly userAgent: string
}

export function resolveRedditCredentials(config: RedditProviderConfig): RedditCredentials {
  // Config fields take priority
  const appId = config.appId ?? process.env.REDDIT_APP_ID ?? ''
  const appSecret = config.appSecret ?? process.env.REDDIT_APP_SECRET ?? ''
  const refreshToken = config.refreshToken ?? process.env.REDDIT_REFRESH_TOKEN
  const username = config.username ?? process.env.REDDIT_USERNAME
  const password = config.password ?? process.env.REDDIT_PASSWORD
  const userAgent = config.userAgent ?? process.env.REDDIT_USER_AGENT ?? 'ads-as-code/1.0'

  return { appId, appSecret, refreshToken, username, password, userAgent }
}

// === Error Mapping ===

export function mapRedditError(
  status: number,
  body: { error?: { code?: string; message?: string } },
): AdsError & { type: string } {
  const code = body?.error?.code ?? 'UNKNOWN'
  const message = body?.error?.message ?? `Reddit API error (HTTP ${status})`

  if (status === 401 || code === 'UNAUTHORIZED') {
    return { type: 'auth', message }
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return { type: 'quota', message, retryAfter: 60 } as AdsError & { type: 'quota' }
  }
  if (code === 'INVALID_REQUEST') {
    return { type: 'validation', field: '', message } as AdsError & { type: 'validation' }
  }
  if (code === 'POLICY_VIOLATION') {
    return {
      type: 'policy',
      message,
      resource: { kind: 'campaign', path: '', properties: {} } as Resource,
    } as AdsError & { type: 'policy' }
  }

  return { type: 'api', code: status, message } as AdsError & { type: 'api' }
}

// === Client Type ===

export type RedditClient = {
  get<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T>
  post<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T>
  put<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T>
  delete<T = unknown>(endpoint: string): Promise<T>
  fetchAll<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T[]>
  upload(endpoint: string, formData: FormData): Promise<Record<string, unknown>>
}

// === Client Factory ===

const BASE_URL = 'https://ads-api.reddit.com/api/v3'
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'

export function createRedditClient(config: RedditProviderConfig): RedditClient {
  const creds = resolveRedditCredentials(config)
  let accessToken: string | null = null
  let tokenExpiry = 0

  async function ensureToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiry) return accessToken

    const params = new URLSearchParams()
    if (creds.refreshToken) {
      params.set('grant_type', 'refresh_token')
      params.set('refresh_token', creds.refreshToken)
    } else if (creds.username && creds.password) {
      params.set('grant_type', 'password')
      params.set('username', creds.username)
      params.set('password', creds.password)
    } else {
      throw new RedditApiError({ type: 'auth', message: 'No refresh token or username/password provided' })
    }

    const auth = Buffer.from(`${creds.appId}:${creds.appSecret}`).toString('base64')
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': creds.userAgent,
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new RedditApiError({ type: 'auth', message: `Token exchange failed: HTTP ${response.status}` })
    }

    const data = await response.json() as { access_token: string; expires_in: number }
    accessToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    return accessToken
  }

  async function request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<T> {
    const token = await ensureToken()
    const url = new URL(`${BASE_URL}/${endpoint}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': creds.userAgent,
    }
    if (body) headers['Content-Type'] = 'application/json'

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new RedditApiError(mapRedditError(response.status, errorBody as { error?: { code?: string; message?: string } }))
    }

    return response.json() as Promise<T>
  }

  async function upload(endpoint: string, formData: FormData): Promise<Record<string, unknown>> {
    const token = await ensureToken()
    const url = `${BASE_URL}/${endpoint}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': creds.userAgent,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new RedditApiError(mapRedditError(response.status, errorBody as { error?: { code?: string; message?: string } }))
    }

    return response.json() as Promise<Record<string, unknown>>
  }

  return {
    get: <T>(endpoint: string, params?: Record<string, string>) =>
      request<T>('GET', endpoint, undefined, params),
    post: <T>(endpoint: string, body: Record<string, unknown>) =>
      request<T>('POST', endpoint, body),
    put: <T>(endpoint: string, body: Record<string, unknown>) =>
      request<T>('PUT', endpoint, body),
    delete: <T>(endpoint: string) =>
      request<T>('DELETE', endpoint),
    fetchAll: async <T>(endpoint: string, params?: Record<string, string>): Promise<T[]> => {
      const results: T[] = []
      let afterId: string | undefined
      do {
        const queryParams = { ...params }
        if (afterId) queryParams['after'] = afterId
        const page = await request<{ data: T[]; after?: string }>('GET', endpoint, undefined, queryParams)
        results.push(...page.data)
        afterId = page.after
      } while (afterId)
      return results
    },
    upload,
  }
}
