import type { AdsError } from '../core/types.ts'
import type { GoogleConfig, GoogleAdsClient, GoogleAdsRow, MutateOperation, MutateResult } from './types.ts'

// === Credential Resolution ===

type ResolvedCredentials = {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
  readonly developerToken: string
  readonly customerId: string
  readonly managerId?: string
}

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

async function resolveCredentials(config: GoogleConfig): Promise<ResolvedCredentials> {
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

// === Error Types ===

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

function mapHttpError(status: number, body: string): AdsError {
  switch (status) {
    case 401:
    case 403:
      return { type: 'auth', message: `Authentication failed (${status}): ${body}` }
    case 429:
      return { type: 'quota', message: `Rate limited (429): ${body}`, retryAfter: 30 }
    case 400: {
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
        // Not JSON
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

// === gRPC Error Extraction ===

/**
 * Extract a human-readable message from a google-ads-api gRPC error.
 * gRPC errors are plain objects (not Error instances) with shape:
 *   { errors: [{ message: string, error_code: {...} }], request_id: string }
 */
function extractGrpcErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    // google-ads-api gRPC error shape
    if (Array.isArray(obj.errors)) {
      const messages = (obj.errors as Array<{ message?: string }>)
        .map(e => e.message)
        .filter(Boolean)
      if (messages.length > 0) return messages.join('; ')
    }
    // Fallback: try .message property
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
}

// === API Client Factory (uses google-ads-api gRPC package) ===

export async function createGoogleClient(config: GoogleConfig): Promise<GoogleAdsClient> {
  const creds = await resolveCredentials(config)

  // Dynamically import to avoid issues in test environments
  const { GoogleAdsApi } = await import('google-ads-api')

  const api = new GoogleAdsApi({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    developer_token: creds.developerToken,
  })

  const customer = api.Customer({
    customer_id: creds.customerId,
    login_customer_id: creds.managerId ?? creds.customerId,
    refresh_token: creds.refreshToken,
  })

  const customerId = creds.customerId.replace(/-/g, '')

  async function query(gaql: string): Promise<GoogleAdsRow[]> {
    try {
      const results = await customer.query(gaql)
      return results as GoogleAdsRow[]
    } catch (err: unknown) {
      // google-ads-api gRPC errors are plain objects (not Error instances)
      // with shape: { errors: [{ message: string, error_code: {...} }], request_id: string }
      const message = extractGrpcErrorMessage(err)
      throw adsError({ type: 'api', code: 0, message })
    }
  }

  async function mutate(operations: MutateOperation[]): Promise<MutateResult[]> {
    try {
      const mutateOps = operations.map(op => ({
        entity: op.operation,
        operation: (op.op ?? 'create') as 'create' | 'update' | 'remove',
        resource: op.resource,
        ...(op.updateMask ? { update_mask: { paths: op.updateMask.split(',') } } : {}),
      }))

      const results = await customer.mutateResources(mutateOps as Parameters<typeof customer.mutateResources>[0])
      return (results as unknown as Array<{ resource_name?: string }>).map(r => ({
        resourceName: r.resource_name ?? '',
      }))
    } catch (err: unknown) {
      const message = extractGrpcErrorMessage(err)
      throw adsError({ type: 'api', code: 0, message })
    }
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
