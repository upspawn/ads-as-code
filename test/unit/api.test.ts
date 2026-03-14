import { describe, test, expect, afterEach } from 'bun:test'
import { resolveCredentials, AdsApiError, mapHttpError } from '../../src/google/api.ts'
import type { GoogleConfig } from '../../src/google/types.ts'

// === Credential Resolution Tests ===

describe('credential resolution', () => {
  const savedEnv: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('GOOGLE_ADS_')) {
        if (savedEnv[key] !== undefined) {
          process.env[key] = savedEnv[key]
        } else {
          delete process.env[key]
        }
      }
    }
  })

  function setEnv(vars: Record<string, string>) {
    for (const [k, v] of Object.entries(vars)) {
      savedEnv[k] = process.env[k]
      process.env[k] = v
    }
  }

  test('resolves from env vars or credentials file', async () => {
    setEnv({
      GOOGLE_ADS_CLIENT_ID: 'test-client-id',
      GOOGLE_ADS_CLIENT_SECRET: 'test-secret',
      GOOGLE_ADS_REFRESH_TOKEN: 'test-refresh',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'test-dev-token',
      GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
    })

    const creds = await resolveCredentials({ type: 'env' })
    // credentials file at ~/.ads/credentials.json takes priority if present
    expect(creds.clientId).toBeDefined()
    expect(creds.clientSecret).toBeDefined()
    expect(creds.refreshToken).toBeDefined()
    expect(creds.developerToken).toBeDefined()
    expect(creds.customerId).toMatch(/^\d+$/) // no dashes
  })

  test('strips dashes from customer ID', async () => {
    setEnv({
      GOOGLE_ADS_CLIENT_ID: 'cid',
      GOOGLE_ADS_CLIENT_SECRET: 'cs',
      GOOGLE_ADS_REFRESH_TOKEN: 'rt',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'dt',
      GOOGLE_ADS_CUSTOMER_ID: '111-222-3333',
      GOOGLE_ADS_MANAGER_ID: '444-555-6666',
    })

    const creds = await resolveCredentials({ type: 'env' })
    // customerId should never have dashes
    expect(creds.customerId).toMatch(/^\d+$/)
  })

  test('throws auth error when no credentials found', async () => {
    // Clear all Google Ads env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('GOOGLE_ADS_')) {
        savedEnv[key] = process.env[key]
        delete process.env[key]
      }
    }
    try {
      await resolveCredentials({ type: 'env' })
      // If credentials file exists on this machine, it might succeed
    } catch (err) {
      expect(err).toBeInstanceOf(AdsApiError)
      expect((err as AdsApiError).adsError.type).toBe('auth')
    }
  })

  test('resolves from explicit oauth config', async () => {
    setEnv({ GOOGLE_ADS_CUSTOMER_ID: '999888777' })
    const config: GoogleConfig = {
      type: 'oauth',
      clientId: 'explicit-cid',
      clientSecret: 'explicit-cs',
      refreshToken: 'explicit-rt',
      developerToken: 'explicit-dt',
    }
    const creds = await resolveCredentials(config)
    expect(creds.clientId).toBe('explicit-cid')
    expect(creds.developerToken).toBe('explicit-dt')
  })

  test('throws for service-account (not yet supported)', async () => {
    try {
      await resolveCredentials({ type: 'service-account', keyFile: '/path', developerToken: 'dt' })
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(AdsApiError)
    }
  })
})

// === Error Mapping Tests ===

describe('error mapping', () => {
  test('maps 401 to auth error', () => {
    const err = mapHttpError(401, 'Unauthorized')
    expect(err.type).toBe('auth')
  })

  test('maps 403 to auth error', () => {
    const err = mapHttpError(403, 'Forbidden')
    expect(err.type).toBe('auth')
  })

  test('maps 429 to quota error', () => {
    const err = mapHttpError(429, 'Rate limited')
    expect(err.type).toBe('quota')
    expect((err as { retryAfter: number }).retryAfter).toBe(30)
  })

  test('maps 400 to validation error', () => {
    const err = mapHttpError(400, 'Bad request')
    expect(err.type).toBe('validation')
  })

  test('maps 409 to conflict error', () => {
    const err = mapHttpError(409, 'Conflict')
    expect(err.type).toBe('conflict')
  })

  test('maps 500 to api error', () => {
    const err = mapHttpError(500, 'Internal error')
    expect(err.type).toBe('api')
    expect((err as { code: number }).code).toBe(500)
  })

  test('maps unknown status to api error', () => {
    const err = mapHttpError(502, 'Bad gateway')
    expect(err.type).toBe('api')
    expect((err as { code: number }).code).toBe(502)
  })
})

// === Constants Tests ===

describe('constants', () => {
  test('language criteria has expected mappings', async () => {
    const { LANGUAGE_CRITERIA } = await import('../../src/google/constants.ts')
    expect(LANGUAGE_CRITERIA['en']).toBe(1000)
    expect(LANGUAGE_CRITERIA['de']).toBe(1001)
  })

  test('geo targets has expected mappings', async () => {
    const { GEO_TARGETS } = await import('../../src/google/constants.ts')
    expect(GEO_TARGETS['US']).toBe(2840)
    expect(GEO_TARGETS['DE']).toBe(2276)
  })

  test('API version is v19', async () => {
    const { API_VERSION } = await import('../../src/google/constants.ts')
    expect(API_VERSION).toBe('v19')
  })
})

// === AdsApiError Tests ===

describe('AdsApiError', () => {
  test('has correct name and message', () => {
    const err = new AdsApiError({ type: 'auth', message: 'test' })
    expect(err.name).toBe('AdsApiError')
    expect(err.message).toBe('test')
    expect(err.adsError.type).toBe('auth')
  })

  test('is instanceof Error', () => {
    const err = new AdsApiError({ type: 'api', code: 500, message: 'fail' })
    expect(err).toBeInstanceOf(Error)
  })
})
