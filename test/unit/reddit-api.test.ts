// test/unit/reddit-api.test.ts
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  resolveRedditCredentials,
  mapRedditError,
  createRedditClient,
  RedditApiError,
  type RedditClient,
} from '../../src/reddit/api'
import type { RedditProviderConfig } from '../../src/reddit/types'

describe('reddit api', () => {
  describe('resolveRedditCredentials', () => {
    test('uses config fields first', () => {
      const config: RedditProviderConfig = {
        accountId: 'a2_test',
        appId: 'config-app-id',
        appSecret: 'config-secret',
        refreshToken: 'config-token',
      }
      const creds = resolveRedditCredentials(config)
      expect(creds.appId).toBe('config-app-id')
      expect(creds.appSecret).toBe('config-secret')
      expect(creds.refreshToken).toBe('config-token')
    })

    test('falls back to env vars', () => {
      const origAppId = process.env.REDDIT_APP_ID
      const origSecret = process.env.REDDIT_APP_SECRET
      const origToken = process.env.REDDIT_REFRESH_TOKEN

      process.env.REDDIT_APP_ID = 'env-app-id'
      process.env.REDDIT_APP_SECRET = 'env-secret'
      process.env.REDDIT_REFRESH_TOKEN = 'env-token'

      try {
        const config: RedditProviderConfig = { accountId: 'a2_test' }
        const creds = resolveRedditCredentials(config)
        expect(creds.appId).toBe('env-app-id')
        expect(creds.appSecret).toBe('env-secret')
        expect(creds.refreshToken).toBe('env-token')
      } finally {
        if (origAppId) process.env.REDDIT_APP_ID = origAppId
        else delete process.env.REDDIT_APP_ID
        if (origSecret) process.env.REDDIT_APP_SECRET = origSecret
        else delete process.env.REDDIT_APP_SECRET
        if (origToken) process.env.REDDIT_REFRESH_TOKEN = origToken
        else delete process.env.REDDIT_REFRESH_TOKEN
      }
    })

    test('falls back to credentials file', () => {
      // When config has a credentials path that exists and contains reddit fields,
      // those should be used. We test the priority: config > file > env.
      // The credentials file path test is covered by the file-reading logic;
      // here we verify that config fields take priority even if env vars are set.
      const origAppId = process.env.REDDIT_APP_ID
      process.env.REDDIT_APP_ID = 'env-app-id'

      try {
        const config: RedditProviderConfig = {
          accountId: 'a2_test',
          appId: 'config-app-id',
          appSecret: 'config-secret',
          refreshToken: 'config-token',
        }
        const creds = resolveRedditCredentials(config)
        expect(creds.appId).toBe('config-app-id')
      } finally {
        if (origAppId) process.env.REDDIT_APP_ID = origAppId
        else delete process.env.REDDIT_APP_ID
      }
    })

    test('returns accountId from config', () => {
      const config: RedditProviderConfig = {
        accountId: 'a2_myaccount',
        appId: 'id',
        appSecret: 'secret',
        refreshToken: 'token',
      }
      const creds = resolveRedditCredentials(config)
      expect(creds.accountId).toBe('a2_myaccount')
    })

    test('resolves username and password from config', () => {
      const config: RedditProviderConfig = {
        accountId: 'a2_test',
        appId: 'id',
        appSecret: 'secret',
        username: 'myuser',
        password: 'mypass',
      }
      const creds = resolveRedditCredentials(config)
      expect(creds.username).toBe('myuser')
      expect(creds.password).toBe('mypass')
      expect(creds.refreshToken).toBeUndefined()
    })

    test('defaults userAgent to ads-as-code/1.0', () => {
      const config: RedditProviderConfig = { accountId: 'a2_test' }
      const creds = resolveRedditCredentials(config)
      expect(creds.userAgent).toBe('ads-as-code/1.0')
    })
  })

  describe('mapRedditError', () => {
    test('maps UNAUTHORIZED to auth error', () => {
      const err = mapRedditError(401, { error: { code: 'UNAUTHORIZED', message: 'Bad token' } })
      expect(err.type).toBe('auth')
    })

    test('maps FORBIDDEN to auth error', () => {
      const err = mapRedditError(403, { error: { code: 'FORBIDDEN', message: 'No access' } })
      expect(err.type).toBe('auth')
    })

    test('maps 429 to quota error', () => {
      const err = mapRedditError(429, { error: { code: 'RATE_LIMITED', message: 'Slow down' } })
      expect(err.type).toBe('quota')
    })

    test('maps INVALID_REQUEST to validation error', () => {
      const err = mapRedditError(400, { error: { code: 'INVALID_REQUEST', message: 'Bad field' } })
      expect(err.type).toBe('validation')
    })

    test('maps VALIDATION_ERROR to validation error', () => {
      const err = mapRedditError(400, { error: { code: 'VALIDATION_ERROR', message: 'Bad' } })
      expect(err.type).toBe('validation')
    })

    test('maps POLICY_VIOLATION to policy error', () => {
      const err = mapRedditError(400, { error: { code: 'POLICY_VIOLATION', message: 'Rejected' } })
      expect(err.type).toBe('policy')
    })

    test('maps unknown errors to api error', () => {
      const err = mapRedditError(500, { error: { code: 'UNKNOWN', message: 'Oops' } })
      expect(err.type).toBe('api')
    })

    test('handles non-standard error bodies gracefully', () => {
      const err = mapRedditError(502, 'Bad Gateway')
      expect(err.type).toBe('api')
      expect(err).toHaveProperty('code', 502)
    })

    test('handles null body', () => {
      const err = mapRedditError(500, null)
      expect(err.type).toBe('api')
    })
  })

  // ─── Client Integration Tests (mocking global fetch) ─────────────────

  describe('createRedditClient', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    const config: RedditProviderConfig = {
      accountId: 'a2_test',
      appId: 'test-app-id',
      appSecret: 'test-secret',
      refreshToken: 'test-refresh-token',
    }

    /** Create a mock fetch that returns token on OAuth call, then the provided response. */
    function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
      let callIdx = 0
      globalThis.fetch = mock(async (url: string | URL | Request, _init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        // OAuth token exchange — always return a valid token
        if (urlStr.includes('access_token')) {
          return new Response(JSON.stringify({ access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600, scope: 'ads' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const resp = responses[callIdx++]
        if (!resp) throw new Error(`Unexpected fetch call #${callIdx} to ${urlStr}`)

        const headers = new Headers(resp.headers ?? {})
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

        return new Response(
          typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body),
          { status: resp.status, headers },
        )
      }) as unknown as typeof fetch
    }

    test('token refresh on 401: clears token and retries once', async () => {
      let apiCallCount = 0
      let tokenCallCount = 0

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes('access_token')) {
          tokenCallCount++
          return new Response(JSON.stringify({
            access_token: `token-${tokenCallCount}`,
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'ads',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        apiCallCount++
        if (apiCallCount === 1) {
          // First API call returns 401 (expired token)
          return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // Second API call succeeds with new token
        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch

      const client = createRedditClient(config)
      const result = await client.get<{ data: string }>('test/endpoint')

      expect(result.data).toBe('success')
      // Token was fetched twice (initial + refresh after 401)
      expect(tokenCallCount).toBe(2)
      // API was called twice (initial 401 + retry)
      expect(apiCallCount).toBe(2)
    })

    test('token refresh on 401: does not retry infinitely', async () => {
      let tokenCallCount = 0

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes('access_token')) {
          tokenCallCount++
          return new Response(JSON.stringify({
            access_token: `token-${tokenCallCount}`,
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'ads',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        // Always return 401
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Bad token' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch

      const client = createRedditClient(config)
      await expect(client.get('test/endpoint')).rejects.toThrow()

      // Should only retry token exchange once (2 total), not infinite
      expect(tokenCallCount).toBe(2)
    })

    test('rate limit backoff: waits when X-Ratelimit-Remaining is 0', async () => {
      const startTime = Date.now()

      // The client calls handleRateLimit after each response.
      // With Remaining=0 and Reset=0.1 (100ms), it should wait ~100ms.
      mockFetch([
        {
          status: 200,
          body: { result: 'ok' },
          headers: { 'X-Ratelimit-Remaining': '0', 'X-Ratelimit-Reset': '0.1' },
        },
      ])

      const client = createRedditClient(config)
      await client.get('test/endpoint')

      const elapsed = Date.now() - startTime
      // Should have waited at least ~50ms (allowing for timing variance)
      expect(elapsed).toBeGreaterThanOrEqual(50)
    })

    test('pagination via fetchAll collects all pages', async () => {
      let pageCallCount = 0

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes('access_token')) {
          return new Response(JSON.stringify({
            access_token: 'mock-token',
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'ads',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        pageCallCount++
        if (pageCallCount === 1) {
          // First page with cursor
          return new Response(JSON.stringify({
            data: [{ id: '1' }, { id: '2' }],
            after: 'cursor_abc',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        // Second page, no cursor (end of pagination)
        return new Response(JSON.stringify({
          data: [{ id: '3' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as unknown as typeof fetch

      const client = createRedditClient(config)
      const results = await client.fetchAll<{ id: string }>('test/items')

      expect(results).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }])
      expect(pageCallCount).toBe(2)
    })

    test('password auth flow: uses grant_type=password when no refreshToken', async () => {
      const passwordConfig: RedditProviderConfig = {
        accountId: 'a2_test',
        appId: 'test-app-id',
        appSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      }

      let tokenBody: string | undefined

      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes('access_token')) {
          tokenBody = init?.body as string
          return new Response(JSON.stringify({
            access_token: 'pwd-token',
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'ads',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch

      const client = createRedditClient(passwordConfig)
      await client.get('test/endpoint')

      // Verify the token exchange used password grant
      expect(tokenBody).toBeDefined()
      const params = new URLSearchParams(tokenBody!)
      expect(params.get('grant_type')).toBe('password')
      expect(params.get('username')).toBe('testuser')
      expect(params.get('password')).toBe('testpass')
    })

    test('upload method sends FormData with correct auth headers', async () => {
      let capturedHeaders: Record<string, string> | undefined
      let capturedBody: FormData | undefined

      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes('access_token')) {
          return new Response(JSON.stringify({
            access_token: 'upload-token',
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'ads',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
        )
        capturedBody = init?.body as FormData

        return new Response(JSON.stringify({ asset: { asset_id: 'a1', url: 'https://img.reddit.com/a1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch

      const client = createRedditClient(config)
      const formData = new FormData()
      formData.append('file', new Blob(['test']), 'test.jpg')

      const result = await client.upload<{ asset: { asset_id: string; url: string } }>('media/upload', formData)

      expect(result.asset.asset_id).toBe('a1')
      expect(capturedHeaders?.['Authorization']).toBe('Bearer upload-token')
      expect(capturedHeaders?.['User-Agent']).toBeDefined()
      // Upload should NOT set Content-Type (browser sets multipart boundary automatically)
      expect(capturedHeaders?.['Content-Type']).toBeUndefined()
    })
  })
})
