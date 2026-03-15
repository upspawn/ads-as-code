import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { MetaApiError, mapMetaError, resolveAccessToken, createMetaClient, safeParseJson } from '../../src/meta/api.ts'
import type { MetaProviderConfig } from '../../src/core/types.ts'

// === safeParseJson Tests ===

describe('safeParseJson', () => {
  function mockResponse(body: string): Response {
    return new Response(body, { status: 200 })
  }

  test('preserves large numeric id as string', async () => {
    // Meta campaign IDs exceed Number.MAX_SAFE_INTEGER
    const body = '{"id": 120243045932140561}'
    const result = await safeParseJson(mockResponse(body)) as { id: string }
    expect(result.id).toBe('120243045932140561')
    expect(typeof result.id).toBe('string')
  })

  test('leaves already-quoted id as string', async () => {
    const body = '{"id": "120243045932140561"}'
    const result = await safeParseJson(mockResponse(body)) as { id: string }
    expect(result.id).toBe('120243045932140561')
  })

  test('preserves small numeric id as number', async () => {
    // Small IDs (< 15 digits) don't need protection
    const body = '{"id": 12345}'
    const result = await safeParseJson(mockResponse(body)) as { id: number }
    expect(result.id).toBe(12345)
  })

  test('handles compound id fields (campaign_id, adset_id)', async () => {
    const body = '{"campaign_id": 120243045932140561, "adset_id": 120243045932140999}'
    const result = await safeParseJson(mockResponse(body)) as Record<string, string>
    expect(result.campaign_id).toBe('120243045932140561')
    expect(result.adset_id).toBe('120243045932140999')
  })

  test('does not touch non-id numeric fields', async () => {
    const body = '{"bid_amount": 250, "error_subcode": 4834011}'
    const result = await safeParseJson(mockResponse(body)) as Record<string, number>
    expect(result.bid_amount).toBe(250)
    expect(result.error_subcode).toBe(4834011)
  })

  test('handles nested objects with large ids', async () => {
    const body = '{"data": [{"id": 120243045932140561, "name": "Test"}]}'
    const result = await safeParseJson(mockResponse(body)) as { data: Array<{ id: string; name: string }> }
    expect(result.data[0]!.id).toBe('120243045932140561')
    expect(result.data[0]!.name).toBe('Test')
  })

  test('preserves precision of borderline ids', async () => {
    // Number.MAX_SAFE_INTEGER = 9007199254740991 (16 digits)
    // IDs with 15+ digits should be protected
    const body = '{"id": 900719925474099123}'
    const result = await safeParseJson(mockResponse(body)) as { id: string }
    expect(result.id).toBe('900719925474099123')
  })
})

// === mapMetaError Tests ===

describe('mapMetaError', () => {
  test('maps code 190 to auth error', () => {
    const body = {
      error: { message: 'Invalid access token', type: 'OAuthException', code: 190, fbtrace_id: 'abc123' },
    }
    const err = mapMetaError(body, 400)
    expect(err.type).toBe('auth')
    expect(err.message).toContain('Invalid access token')
    expect(err.message).toContain('abc123')
  })

  test('maps code 10 to auth (permission denied) error', () => {
    const body = {
      error: { message: 'Requires ads_management permission', type: 'OAuthException', code: 10 },
    }
    const err = mapMetaError(body, 403)
    expect(err.type).toBe('auth')
    expect(err.message).toContain('Permission denied')
  })

  test('maps code 4 to quota (rate limit) error', () => {
    const body = {
      error: { message: 'Application request limit reached', type: 'OAuthException', code: 4 },
    }
    const err = mapMetaError(body, 400)
    expect(err.type).toBe('quota')
    expect((err as { retryAfter: number }).retryAfter).toBe(60)
  })

  test('maps code 32 to quota (account-level rate limit) error', () => {
    const body = {
      error: { message: 'Account-level rate limit reached', type: 'OAuthException', code: 32 },
    }
    const err = mapMetaError(body, 400)
    expect(err.type).toBe('quota')
    expect((err as { retryAfter: number }).retryAfter).toBe(60)
  })

  test('maps code 100 to validation error', () => {
    const body = {
      error: { message: 'Invalid parameter', type: 'GraphMethodException', code: 100, error_subcode: 1487390 },
    }
    const err = mapMetaError(body, 400)
    expect(err.type).toBe('validation')
    expect(err.message).toContain('Invalid parameter')
  })

  test('maps unknown codes to generic api error', () => {
    const body = {
      error: { message: 'Something went wrong', type: 'OAuthException', code: 999 },
    }
    const err = mapMetaError(body, 500)
    expect(err.type).toBe('api')
    expect((err as { code: number }).code).toBe(999)
  })

  test('handles non-Meta error body gracefully', () => {
    const err = mapMetaError({ unexpected: 'format' }, 500)
    expect(err.type).toBe('api')
    expect((err as { code: number }).code).toBe(500)
  })

  test('handles null body gracefully', () => {
    const err = mapMetaError(null, 502)
    expect(err.type).toBe('api')
    expect((err as { code: number }).code).toBe(502)
  })
})

// === MetaApiError Tests ===

describe('MetaApiError', () => {
  test('has correct name and message', () => {
    const err = new MetaApiError({ type: 'auth', message: 'test error' })
    expect(err.name).toBe('MetaApiError')
    expect(err.message).toBe('test error')
    expect(err.adsError.type).toBe('auth')
  })

  test('is instanceof Error', () => {
    const err = new MetaApiError({ type: 'api', code: 500, message: 'fail' })
    expect(err).toBeInstanceOf(Error)
  })
})

// === resolveAccessToken Tests ===

describe('resolveAccessToken', () => {
  const savedToken = process.env['FB_ADS_ACCESS_TOKEN']

  afterEach(() => {
    if (savedToken !== undefined) {
      process.env['FB_ADS_ACCESS_TOKEN'] = savedToken
    } else {
      delete process.env['FB_ADS_ACCESS_TOKEN']
    }
  })

  test('returns token from environment', () => {
    process.env['FB_ADS_ACCESS_TOKEN'] = 'test-token-123'
    expect(resolveAccessToken()).toBe('test-token-123')
  })

  test('throws MetaApiError when token is missing', () => {
    delete process.env['FB_ADS_ACCESS_TOKEN']
    try {
      resolveAccessToken()
      expect(true).toBe(false) // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError)
      expect((err as MetaApiError).adsError.type).toBe('auth')
      expect((err as MetaApiError).adsError.message).toContain('FB_ADS_ACCESS_TOKEN')
    }
  })
})

// === createMetaClient Tests ===

describe('createMetaClient', () => {
  const savedToken = process.env['FB_ADS_ACCESS_TOKEN']
  const originalFetch = globalThis.fetch

  const testConfig: MetaProviderConfig = {
    accountId: 'act_123456',
    pageId: 'page_789',
  }

  beforeEach(() => {
    process.env['FB_ADS_ACCESS_TOKEN'] = 'test-token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (savedToken !== undefined) {
      process.env['FB_ADS_ACCESS_TOKEN'] = savedToken
    } else {
      delete process.env['FB_ADS_ACCESS_TOKEN']
    }
  })

  function mockFetch(body: unknown, status = 200): void {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })),
    ) as typeof fetch
  }

  // --- graphGet ---

  describe('graphGet', () => {
    test('makes GET request with access_token and params', async () => {
      const responseData = { id: '123', name: 'Test Campaign' }
      mockFetch(responseData)

      const client = createMetaClient(testConfig)
      const result = await client.graphGet('act_123456/campaigns', { fields: 'id,name', limit: '10' })

      expect(result).toEqual(responseData)

      // Verify the URL was constructed correctly
      const fetchMock = globalThis.fetch as ReturnType<typeof mock>
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('graph.facebook.com/v21.0/act_123456/campaigns')
      expect(calledUrl).toContain('access_token=test-token')
      expect(calledUrl).toContain('fields=id%2Cname')
      expect(calledUrl).toContain('limit=10')
    })

    test('uses custom API version from config', async () => {
      mockFetch({ id: '1' })

      const client = createMetaClient({ ...testConfig, apiVersion: 'v22.0' })
      await client.graphGet('me')

      const fetchMock = globalThis.fetch as ReturnType<typeof mock>
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('graph.facebook.com/v22.0/')
    })

    test('throws MetaApiError on auth failure', async () => {
      mockFetch(
        { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190, fbtrace_id: 'trace1' } },
        400,
      )

      const client = createMetaClient(testConfig)
      try {
        await client.graphGet('me')
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
        const metaErr = err as MetaApiError
        expect(metaErr.adsError.type).toBe('auth')
        expect(metaErr.adsError.message).toContain('Invalid OAuth access token')
      }
    })

    test('throws MetaApiError on rate limit (code 4)', async () => {
      mockFetch(
        { error: { message: 'App request limit reached', type: 'OAuthException', code: 4 } },
        400,
      )

      const client = createMetaClient(testConfig)
      try {
        await client.graphGet('act_123456/campaigns')
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
        const metaErr = err as MetaApiError
        expect(metaErr.adsError.type).toBe('quota')
        expect((metaErr.adsError as { retryAfter: number }).retryAfter).toBe(60)
      }
    })

    test('throws MetaApiError on validation error (code 100)', async () => {
      mockFetch(
        { error: { message: 'Invalid parameter: fields', type: 'GraphMethodException', code: 100 } },
        400,
      )

      const client = createMetaClient(testConfig)
      try {
        await client.graphGet('act_123456/campaigns', { fields: 'invalid_field' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
        const metaErr = err as MetaApiError
        expect(metaErr.adsError.type).toBe('validation')
      }
    })
  })

  // --- graphPost ---

  describe('graphPost', () => {
    test('makes POST request with form-encoded body', async () => {
      const responseData = { id: 'campaign_999' }
      mockFetch(responseData)

      const client = createMetaClient(testConfig)
      const result = await client.graphPost('act_123456/campaigns', {
        name: 'Test Campaign',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
      })

      expect(result).toEqual(responseData)

      const fetchMock = globalThis.fetch as ReturnType<typeof mock>
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('access_token=test-token')

      const calledInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      expect(calledInit.method).toBe('POST')
      expect(calledInit.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })

      // Verify form body contains expected params
      const body = calledInit.body as string
      expect(body).toContain('name=Test+Campaign')
      expect(body).toContain('objective=OUTCOME_TRAFFIC')
    })

    test('throws MetaApiError on POST failure', async () => {
      mockFetch(
        { error: { message: 'Invalid campaign params', type: 'GraphMethodException', code: 100 } },
        400,
      )

      const client = createMetaClient(testConfig)
      try {
        await client.graphPost('act_123456/campaigns', { name: 'Bad Campaign' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
      }
    })
  })

  // --- graphDelete ---

  describe('graphDelete', () => {
    test('makes DELETE request', async () => {
      mockFetch({ success: true })

      const client = createMetaClient(testConfig)
      const result = await client.graphDelete('12345')

      expect(result).toEqual({ success: true })

      const fetchMock = globalThis.fetch as ReturnType<typeof mock>
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('graph.facebook.com/v21.0/12345')
      expect(calledUrl).toContain('access_token=test-token')

      const calledInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      expect(calledInit.method).toBe('DELETE')
    })

    test('throws MetaApiError on DELETE failure', async () => {
      mockFetch(
        { error: { message: 'Object does not exist', type: 'GraphMethodException', code: 100 } },
        400,
      )

      const client = createMetaClient(testConfig)
      try {
        await client.graphDelete('nonexistent_id')
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
      }
    })
  })

  // --- graphGetAll (pagination) ---

  describe('graphGetAll', () => {
    test('returns all data from a single page', async () => {
      const page1 = {
        data: [{ id: '1', name: 'Campaign A' }, { id: '2', name: 'Campaign B' }],
        paging: { cursors: { after: 'cursor1' } },
      }
      mockFetch(page1)

      const client = createMetaClient(testConfig)
      const results = await client.graphGetAll('act_123456/campaigns')

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ id: '1', name: 'Campaign A' })
    })

    test('follows pagination cursors across multiple pages', async () => {
      const page1 = {
        data: [{ id: '1', name: 'A' }],
        paging: { next: 'https://graph.facebook.com/v21.0/act_123/campaigns?after=cursor1&access_token=test-token' },
      }
      const page2 = {
        data: [{ id: '2', name: 'B' }],
        paging: { next: 'https://graph.facebook.com/v21.0/act_123/campaigns?after=cursor2&access_token=test-token' },
      }
      const page3 = {
        data: [{ id: '3', name: 'C' }],
        paging: {}, // No next — end of pagination
      }

      let callCount = 0
      globalThis.fetch = mock(() => {
        const pages = [page1, page2, page3]
        const body = pages[callCount]!
        callCount++
        return Promise.resolve(new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      }) as typeof fetch

      const client = createMetaClient(testConfig)
      const results = await client.graphGetAll('act_123456/campaigns')

      expect(results).toHaveLength(3)
      expect(results.map(r => r['id'])).toEqual(['1', '2', '3'])
      expect(callCount).toBe(3) // initial + 2 pagination follows
    })

    test('handles empty data array', async () => {
      mockFetch({ data: [], paging: {} })

      const client = createMetaClient(testConfig)
      const results = await client.graphGetAll('act_123456/campaigns')

      expect(results).toHaveLength(0)
    })

    test('throws MetaApiError on pagination error', async () => {
      const page1 = {
        data: [{ id: '1', name: 'A' }],
        paging: { next: 'https://graph.facebook.com/v21.0/act_123/campaigns?after=cursor1' },
      }

      let callCount = 0
      globalThis.fetch = mock(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify(page1), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        }
        // Second call (pagination follow) returns error
        return Promise.resolve(new Response(
          JSON.stringify({ error: { message: 'Rate limit', type: 'OAuthException', code: 4 } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ))
      }) as typeof fetch

      const client = createMetaClient(testConfig)
      try {
        await client.graphGetAll('act_123456/campaigns')
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(MetaApiError)
        expect((err as MetaApiError).adsError.type).toBe('quota')
      }
    })
  })
})
