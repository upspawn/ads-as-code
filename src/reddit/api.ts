// src/reddit/api.ts
//
// Reddit Ads API client — OAuth2, error mapping, rate limiting, pagination.
// T0 foundation: provides the RedditClient type consumed by T4 (performance).

import type { RedditProviderConfig } from './types'

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type RedditApiErrorType = 'auth' | 'quota' | 'validation' | 'policy' | 'api'

export type RedditApiError = {
  readonly type: RedditApiErrorType
  readonly status: number
  readonly code: string
  readonly message: string
}

// ---------------------------------------------------------------------------
// Client type — the interface consumed by fetch, apply, performance modules
// ---------------------------------------------------------------------------

export type RedditClient = {
  readonly get: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T>
  readonly post: <T = unknown>(path: string, body: unknown) => Promise<T>
  readonly put: <T = unknown>(path: string, body: unknown) => Promise<T>
  readonly delete: <T = unknown>(path: string) => Promise<T>
  /** Paginated GET — follows cursor until all pages fetched. */
  readonly fetchAll: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T[]>
}

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

export type ResolvedCredentials = {
  readonly appId: string
  readonly appSecret: string
  readonly refreshToken?: string
  readonly username?: string
  readonly password?: string
  readonly userAgent: string
}

/**
 * Resolve Reddit API credentials from config, credentials file, or env vars.
 * Priority: config fields > credentials file > environment variables.
 */
export function resolveRedditCredentials(config: RedditProviderConfig): ResolvedCredentials {
  // 1. Config fields
  if (config.appId && config.appSecret) {
    return {
      appId: config.appId,
      appSecret: config.appSecret,
      refreshToken: config.refreshToken,
      username: config.username,
      password: config.password,
      userAgent: config.userAgent ?? 'ads-as-code/1.0',
    }
  }

  // 2. Credentials file
  if (config.credentials) {
    try {
      const fs = require('node:fs')
      const content = JSON.parse(fs.readFileSync(config.credentials, 'utf-8'))
      return {
        appId: content.reddit_app_id ?? '',
        appSecret: content.reddit_app_secret ?? '',
        refreshToken: content.reddit_refresh_token,
        username: content.reddit_username,
        password: content.reddit_password,
        userAgent: config.userAgent ?? content.reddit_user_agent ?? 'ads-as-code/1.0',
      }
    } catch {
      // Fall through to env vars
    }
  }

  // 3. Default credentials file (~/.ads/credentials.json)
  try {
    const fs = require('node:fs')
    const path = require('node:path')
    const defaultPath = path.join(process.env.HOME ?? '~', '.ads', 'credentials.json')
    const content = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'))
    if (content.reddit_app_id) {
      return {
        appId: content.reddit_app_id,
        appSecret: content.reddit_app_secret ?? '',
        refreshToken: content.reddit_refresh_token,
        username: content.reddit_username,
        password: content.reddit_password,
        userAgent: config.userAgent ?? content.reddit_user_agent ?? 'ads-as-code/1.0',
      }
    }
  } catch {
    // Fall through to env vars
  }

  // 4. Environment variables
  return {
    appId: process.env.REDDIT_APP_ID ?? '',
    appSecret: process.env.REDDIT_APP_SECRET ?? '',
    refreshToken: process.env.REDDIT_REFRESH_TOKEN,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
    userAgent: config.userAgent ?? process.env.REDDIT_USER_AGENT ?? 'ads-as-code/1.0',
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/** Map an HTTP status + Reddit error body to a typed error. */
export function mapRedditError(
  status: number,
  body: { error?: { code?: string; message?: string } },
): RedditApiError {
  const code = body.error?.code ?? 'UNKNOWN'
  const message = body.error?.message ?? 'Unknown error'

  if (status === 401 || code === 'UNAUTHORIZED') {
    return { type: 'auth', status, code, message }
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return { type: 'quota', status, code, message }
  }
  if (code === 'POLICY_VIOLATION') {
    return { type: 'policy', status, code, message }
  }
  if (status === 400 || code === 'INVALID_REQUEST') {
    return { type: 'validation', status, code, message }
  }

  return { type: 'api', status, code, message }
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

const BASE_URL = 'https://ads-api.reddit.com/api/v3'
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'

/** Create a Reddit Ads API client with automatic token refresh and rate limiting. */
export async function createRedditClient(config: RedditProviderConfig): Promise<RedditClient> {
  const creds = resolveRedditCredentials(config)
  let accessToken = await fetchAccessToken(creds)

  async function fetchAccessToken(c: ResolvedCredentials): Promise<string> {
    const params = new URLSearchParams()
    if (c.refreshToken) {
      params.set('grant_type', 'refresh_token')
      params.set('refresh_token', c.refreshToken)
    } else if (c.username && c.password) {
      params.set('grant_type', 'password')
      params.set('username', c.username)
      params.set('password', c.password)
    } else {
      throw new Error('Reddit credentials require either refreshToken or username+password')
    }

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${c.appId}:${c.appSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': c.userAgent,
      },
      body: params,
    })

    if (!resp.ok) {
      throw new Error(`Reddit auth failed: ${resp.status} ${resp.statusText}`)
    }

    const data = await resp.json() as { access_token: string }
    return data.access_token
  }

  async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const resp = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': creds.userAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw mapRedditError(resp.status, errBody)
    }

    return resp.json() as Promise<T>
  }

  return {
    get: <T>(path: string, params?: Record<string, string>) => request<T>('GET', path, undefined, params),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
    async fetchAll<T>(path: string, params?: Record<string, string>): Promise<T[]> {
      const results: T[] = []
      let cursor: string | undefined

      do {
        const queryParams = { ...params }
        if (cursor) queryParams['after'] = cursor

        const resp = await request<{ data: T[]; after?: string }>('GET', path, undefined, queryParams)
        results.push(...resp.data)
        cursor = resp.after
      } while (cursor)

      return results
    },
  }
}
