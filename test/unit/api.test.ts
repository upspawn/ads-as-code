import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { createGoogleClient, AdsApiError, mapHttpError } from '../../src/google/api.ts'
import { API_VERSION, BASE_URL, LANGUAGE_CRITERIA, GEO_TARGETS } from '../../src/google/constants.ts'
import type { GoogleConfig } from '../../src/google/types.ts'

// ─── Constants ──────────────────────────────────────────────

describe('constants', () => {
  test('API_VERSION is v19', () => {
    expect(API_VERSION).toBe('v19')
  })

  test('BASE_URL points to googleads.googleapis.com', () => {
    expect(BASE_URL).toBe('https://googleads.googleapis.com')
  })

  test('LANGUAGE_CRITERIA has expected entries', () => {
    expect(LANGUAGE_CRITERIA['en']).toBe(1000)
    expect(LANGUAGE_CRITERIA['de']).toBe(1001)
    expect(LANGUAGE_CRITERIA['fr']).toBe(1002)
    expect(LANGUAGE_CRITERIA['es']).toBe(1003)
    expect(LANGUAGE_CRITERIA['ko']).toBe(1012)
    expect(LANGUAGE_CRITERIA['pl']).toBe(1030)
  })

  test('GEO_TARGETS has expected entries', () => {
    expect(GEO_TARGETS['US']).toBe(2840)
    expect(GEO_TARGETS['DE']).toBe(2276)
    expect(GEO_TARGETS['GB']).toBe(2826)
    expect(GEO_TARGETS['JP']).toBe(2392)
    expect(GEO_TARGETS['BR']).toBe(2076)
    expect(GEO_TARGETS['FI']).toBe(2246)
  })

  test('GEO_TARGETS has 20 entries', () => {
    expect(Object.keys(GEO_TARGETS)).toHaveLength(20)
  })

  test('LANGUAGE_CRITERIA has 14 entries', () => {
    expect(Object.keys(LANGUAGE_CRITERIA)).toHaveLength(14)
  })
})

// ─── Test Helpers ───────────────────────────────────────────

const FAKE_TOKEN_RESPONSE = {
  access_token: 'fake-access-token',
  expires_in: 3600,
}

const FAKE_SEARCH_RESPONSE = [
  {
    results: [
      { campaign: { name: 'Test Campaign', id: '123' } },
      { campaign: { name: 'Another Campaign', id: '456' } },
    ],
  },
]

const FAKE_MUTATE_RESPONSE = {
  mutateOperationResponses: [
    { campaignResult: { resourceName: 'customers/123/campaigns/456' } },
  ],
}

function makeEnvConfig(): GoogleConfig {
  return { type: 'env' as const }
}

function makeOAuthConfig(): GoogleConfig {
  return {
    type: 'oauth' as const,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    refreshToken: 'test-refresh-token',
    developerToken: 'test-dev-token',
    managerId: '234-567-8901',
  }
}

function setEnvVars() {
  process.env['GOOGLE_ADS_CLIENT_ID'] = 'env-client-id'
  process.env['GOOGLE_ADS_CLIENT_SECRET'] = 'env-client-secret'
  process.env['GOOGLE_ADS_REFRESH_TOKEN'] = 'env-refresh-token'
  process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] = 'env-dev-token'
  process.env['GOOGLE_ADS_CUSTOMER_ID'] = '123-456-7890'
  process.env['GOOGLE_ADS_MANAGER_ID'] = '234-567-8901'
}

function clearEnvVars() {
  delete process.env['GOOGLE_ADS_CLIENT_ID']
  delete process.env['GOOGLE_ADS_CLIENT_SECRET']
  delete process.env['GOOGLE_ADS_REFRESH_TOKEN']
  delete process.env['GOOGLE_ADS_DEVELOPER_TOKEN']
  delete process.env['GOOGLE_ADS_CUSTOMER_ID']
  delete process.env['GOOGLE_ADS_MANAGER_ID']
}

// Track fetch calls for assertions
let fetchCalls: Array<{ url: string; options: RequestInit }> = []
let fetchResponses: Array<{ status: number; body: unknown; ok?: boolean }> = []
let fetchCallIndex = 0

function mockFetchWith(responses: Array<{ status: number; body: unknown; ok?: boolean }>) {
  fetchCalls = []
  fetchResponses = responses
  fetchCallIndex = 0

  // @ts-expect-error -- overriding global fetch for testing
  globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    fetchCalls.push({ url: urlStr, options: options ?? {} })

    const responseSpec = fetchResponses[fetchCallIndex] ?? fetchResponses[fetchResponses.length - 1]!
    fetchCallIndex++

    const ok = responseSpec.ok ?? (responseSpec.status >= 200 && responseSpec.status < 300)
    return {
      ok,
      status: responseSpec.status,
      text: async () => typeof responseSpec.body === 'string' ? responseSpec.body : JSON.stringify(responseSpec.body),
      json: async () => typeof responseSpec.body === 'string' ? JSON.parse(responseSpec.body) : responseSpec.body,
      headers: new Headers(),
    } as Response
  }
}

const originalFetch = globalThis.fetch

// ─── Credential Resolution ─────────────────────────────────

describe('credential resolution', () => {
  beforeEach(() => clearEnvVars())
  afterEach(() => {
    clearEnvVars()
    globalThis.fetch = originalFetch
  })

  test('resolves from explicit oauth config', async () => {
    process.env['GOOGLE_ADS_CUSTOMER_ID'] = '111-222-3333'

    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_SEARCH_RESPONSE },
    ])

    const client = await createGoogleClient(makeOAuthConfig())
    expect(client.customerId).toBe('1112223333')
    expect(client.managerId).toBe('234-567-8901')
  })

  test('resolves from env vars', async () => {
    setEnvVars()
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    expect(client.customerId).toBe('1234567890')
    expect(client.managerId).toBe('234-567-8901')
  })

  test('strips dashes from customer ID', async () => {
    setEnvVars()
    process.env['GOOGLE_ADS_CUSTOMER_ID'] = '123-456-7890'
    mockFetchWith([{ status: 200, body: FAKE_TOKEN_RESPONSE }])

    const client = await createGoogleClient(makeEnvConfig())
    expect(client.customerId).toBe('1234567890')
  })

  test('throws auth error when no credentials found', async () => {
    // No env vars, no credentials file
    try {
      await createGoogleClient(makeEnvConfig())
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('auth')
      expect((e as AdsApiError).adsError.message).toContain('credentials not found')
    }
  })

  test('throws auth error for service-account config', async () => {
    try {
      await createGoogleClient({ type: 'service-account', keyFile: '/tmp/key.json', developerToken: 'test' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('auth')
      expect((e as AdsApiError).adsError.message).toContain('not yet supported')
    }
  })

  test('oauth config requires GOOGLE_ADS_CUSTOMER_ID env var', async () => {
    // No customer ID in env
    try {
      await createGoogleClient(makeOAuthConfig())
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('auth')
      expect((e as AdsApiError).adsError.message).toContain('GOOGLE_ADS_CUSTOMER_ID')
    }
  })
})

// ─── Query ──────────────────────────────────────────────────

describe('query()', () => {
  beforeEach(() => {
    clearEnvVars()
    setEnvVars()
  })
  afterEach(() => {
    clearEnvVars()
    globalThis.fetch = originalFetch
  })

  test('sends GAQL query and returns rows', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_SEARCH_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const rows = await client.query('SELECT campaign.name FROM campaign')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ campaign: { name: 'Test Campaign', id: '123' } })

    // Verify the search request was made correctly
    const searchCall = fetchCalls[1]!
    expect(searchCall.url).toContain('/googleAds:searchStream')
    expect(searchCall.url).toContain('1234567890')
    expect(searchCall.url).toContain(API_VERSION)
  })

  test('includes developer-token header', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_SEARCH_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    await client.query('SELECT campaign.name FROM campaign')

    const searchCall = fetchCalls[1]!
    const headers = searchCall.options.headers as Record<string, string>
    expect(headers['developer-token']).toBe('env-dev-token')
    expect(headers['Authorization']).toBe('Bearer fake-access-token')
  })

  test('includes login-customer-id header when managerId is set', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_SEARCH_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    await client.query('SELECT campaign.name FROM campaign')

    const searchCall = fetchCalls[1]!
    const headers = searchCall.options.headers as Record<string, string>
    expect(headers['login-customer-id']).toBe('2345678901')
  })

  test('returns empty array when no results', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: [{}] }, // no results key
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const rows = await client.query('SELECT campaign.name FROM campaign WHERE 1=0')
    expect(rows).toEqual([])
  })

  test('throws on API error', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 400, body: '{"error": {"message": "bad query"}}', ok: false },
    ])

    const client = await createGoogleClient(makeEnvConfig())

    try {
      await client.query('INVALID GAQL')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('validation')
    }
  })
})

// ─── Mutate ─────────────────────────────────────────────────

describe('mutate()', () => {
  beforeEach(() => {
    clearEnvVars()
    setEnvVars()
  })
  afterEach(() => {
    clearEnvVars()
    globalThis.fetch = originalFetch
  })

  test('sends mutate operations and returns results', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_MUTATE_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const results = await client.mutate([
      {
        operation: 'campaignOperation',
        resource: { create: { name: 'New Campaign' } },
      },
    ])

    expect(results).toHaveLength(1)
    expect(results[0]!.resourceName).toBe('customers/123/campaigns/456')
  })

  test('sends correct URL', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: FAKE_MUTATE_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    await client.mutate([{ operation: 'campaignOperation', resource: {} }])

    const mutateCall = fetchCalls[1]!
    expect(mutateCall.url).toContain('/googleAds:mutate')
    expect(mutateCall.url).toContain('1234567890')
  })

  test('returns empty array when no responses', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 200, body: {} }, // no mutateOperationResponses
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const results = await client.mutate([])
    expect(results).toEqual([])
  })
})

// ─── Error Mapping ──────────────────────────────────────────

describe('error mapping', () => {
  test('401 maps to auth error', () => {
    const err = mapHttpError(401, 'unauthorized')
    expect(err.type).toBe('auth')
    expect(err.message).toContain('401')
  })

  test('403 maps to auth error', () => {
    const err = mapHttpError(403, 'forbidden')
    expect(err.type).toBe('auth')
    expect(err.message).toContain('403')
  })

  test('429 maps to quota error with retryAfter', () => {
    const err = mapHttpError(429, 'too many requests')
    expect(err.type).toBe('quota')
    if (err.type === 'quota') {
      expect(err.retryAfter).toBe(30)
    }
  })

  test('400 maps to validation error', () => {
    const err = mapHttpError(400, '{"error": {"message": "bad request"}}')
    expect(err.type).toBe('validation')
  })

  test('409 maps to conflict error', () => {
    const err = mapHttpError(409, 'conflict')
    expect(err.type).toBe('conflict')
  })

  test('500 maps to api error', () => {
    const err = mapHttpError(500, 'internal server error')
    expect(err.type).toBe('api')
    if (err.type === 'api') {
      expect(err.code).toBe(500)
    }
  })

  test('502 maps to api error', () => {
    const err = mapHttpError(502, 'bad gateway')
    expect(err.type).toBe('api')
  })
})

// ─── Retry Logic ────────────────────────────────────────────

describe('retry logic', () => {
  beforeEach(() => {
    clearEnvVars()
    setEnvVars()
  })
  afterEach(() => {
    clearEnvVars()
    globalThis.fetch = originalFetch
  })

  test('retries on 500 and succeeds', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 500, body: 'server error', ok: false },    // 1st attempt
      { status: 200, body: FAKE_SEARCH_RESPONSE },          // 2nd attempt (retry)
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const rows = await client.query('SELECT campaign.name FROM campaign')
    expect(rows).toHaveLength(2)

    // token call + 2 search calls = 3 total
    expect(fetchCalls).toHaveLength(3)
  })

  test('retries on 429 and succeeds', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 429, body: 'rate limited', ok: false },
      { status: 200, body: FAKE_SEARCH_RESPONSE },
    ])

    const client = await createGoogleClient(makeEnvConfig())
    const rows = await client.query('SELECT campaign.name FROM campaign')
    expect(rows).toHaveLength(2)
  })

  test('gives up after max retries', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 500, body: 'fail 1', ok: false },
      { status: 500, body: 'fail 2', ok: false },
      { status: 500, body: 'fail 3', ok: false },  // 3rd attempt, should give up
    ])

    const client = await createGoogleClient(makeEnvConfig())

    try {
      await client.query('SELECT campaign.name FROM campaign')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('api')
    }
  })

  test('does not retry on 400', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 400, body: '{"error": "bad request"}', ok: false },
    ])

    const client = await createGoogleClient(makeEnvConfig())

    try {
      await client.query('INVALID')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
    }

    // token + 1 search call (no retry)
    expect(fetchCalls).toHaveLength(2)
  })

  test('does not retry on 401', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },
      { status: 401, body: 'unauthorized', ok: false },
    ])

    const client = await createGoogleClient(makeEnvConfig())

    try {
      await client.query('SELECT campaign.name FROM campaign')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AdsApiError)
      expect((e as AdsApiError).adsError.type).toBe('auth')
    }

    expect(fetchCalls).toHaveLength(2)
  })
})

// ─── Token Caching ──────────────────────────────────────────

describe('token caching', () => {
  beforeEach(() => {
    clearEnvVars()
    setEnvVars()
  })
  afterEach(() => {
    clearEnvVars()
    globalThis.fetch = originalFetch
  })

  test('reuses cached token for subsequent requests', async () => {
    mockFetchWith([
      { status: 200, body: FAKE_TOKEN_RESPONSE },      // token exchange
      { status: 200, body: FAKE_SEARCH_RESPONSE },      // 1st query
      { status: 200, body: FAKE_SEARCH_RESPONSE },      // 2nd query (no new token)
    ])

    const client = await createGoogleClient(makeEnvConfig())
    await client.query('SELECT 1')
    await client.query('SELECT 2')

    // Only 1 token exchange + 2 queries = 3 total (not 4)
    expect(fetchCalls).toHaveLength(3)

    // First call is to OAuth endpoint
    expect(fetchCalls[0]!.url).toContain('oauth2.googleapis.com')
    // Second and third are search calls
    expect(fetchCalls[1]!.url).toContain('searchStream')
    expect(fetchCalls[2]!.url).toContain('searchStream')
  })
})

// ─── AdsApiError ────────────────────────────────────────────

describe('AdsApiError', () => {
  test('is an instance of Error', () => {
    const err = new AdsApiError({ type: 'auth', message: 'test' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AdsApiError)
  })

  test('has name AdsApiError', () => {
    const err = new AdsApiError({ type: 'api', code: 500, message: 'fail' })
    expect(err.name).toBe('AdsApiError')
  })

  test('exposes the underlying AdsError', () => {
    const adsErr = { type: 'quota' as const, message: 'rate limited', retryAfter: 60 }
    const err = new AdsApiError(adsErr)
    expect(err.adsError).toEqual(adsErr)
    expect(err.message).toBe('rate limited')
  })
})
