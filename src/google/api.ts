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
 *   { errors: [{ message: string, error_code: {...}, location: { field_path_elements: [...] } }], request_id: string }
 */
function extractGrpcErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>

    // google-ads-api gRPC error — check statusDetails first (most detailed)
    if (Array.isArray(obj.statusDetails)) {
      const allMessages: string[] = []
      for (const detail of obj.statusDetails as Array<{ errors?: Array<{
        message?: string
        error_code?: Record<string, unknown>
        location?: { field_path_elements?: Array<{ field_name?: string; index?: number }> }
      }> }>) {
        for (const e of detail.errors ?? []) {
          const parts: string[] = []
          if (e.message) parts.push(e.message)
          if (e.error_code) {
            const codes = Object.entries(e.error_code).filter(([, v]) => v && v !== 'UNSPECIFIED')
            if (codes.length > 0) parts.push(`[${codes.map(([k, v]) => `${k}: ${v}`).join(', ')}]`)
          }
          if (e.location?.field_path_elements?.length) {
            const path = e.location.field_path_elements
              .map(f => f.index != null ? `${f.field_name}[${f.index}]` : f.field_name)
              .join('.')
            parts.push(`(field: ${path})`)
          }
          if (parts.length > 0) allMessages.push(parts.join(' '))
        }
      }
      if (allMessages.length > 0) return allMessages.join('; ')
    }

    // google-ads-api gRPC error shape — top-level errors array
    if (Array.isArray(obj.errors)) {
      const messages = (obj.errors as Array<{ message?: string }>)
        .map(e => e.message)
        .filter(Boolean)
      if (messages.length > 0) return messages.join('; ')
    }

    // Fallback: try .details or .message property
    if (typeof obj.details === 'string') return obj.details
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
}

// === API Client Factory (uses google-ads-api gRPC package) ===

export async function createGoogleClient(config: GoogleConfig): Promise<GoogleAdsClient> {
  const creds = await resolveCredentials(config)

  // Suppress GCE metadata server detection — we're not running on Google Cloud.
  // Without this, google-auth-library probes the metadata endpoint and emits a noisy warning.
  if (!process.env['METADATA_SERVER_DETECTION']) {
    process.env['METADATA_SERVER_DETECTION'] = 'none'
  }

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
      // Check if any update operation has an explicit updateMask.
      // The google-ads-api library's mutateResources() auto-generates field masks
      // from the resource object, which fails for empty sub-messages (e.g.,
      // `maximize_conversions = {}` produces an empty mask, so the API silently
      // ignores the bidding strategy change). When we have an explicit mask,
      // we build the protobuf request directly to ensure our mask is used.
      const hasExplicitMask = operations.some(op => op.op === 'update' && op.updateMask)

      if (hasExplicitMask) {
        return await mutateWithExplicitMasks(operations)
      }

      // Fast path: no explicit masks — use the library's mutateResources()
      const mutateOps = operations.map(op => {
        const operation = (op.op ?? 'create') as 'create' | 'update' | 'remove'
        if (operation === 'remove') {
          const rn = (op.resource as Record<string, unknown>).resource_name as string
          return { entity: op.operation, operation, resource: rn }
        }
        return { entity: op.operation, operation, resource: op.resource }
      })

      if (process.env['ADS_DEBUG']) {
        console.log('[DEBUG mutate]', JSON.stringify(mutateOps, null, 2))
      }

      const response = await customer.mutateResources(mutateOps as Parameters<typeof customer.mutateResources>[0])
      return extractMutateResults(response)
    } catch (err: unknown) {
      const message = extractGrpcErrorMessage(err)
      throw adsError({ type: 'api', code: 0, message })
    }
  }

  /**
   * Build and send the mutate request directly, bypassing the library's
   * auto-generated field masks. This replicates buildMutationRequestAndService()
   * from google-ads-api but uses our explicit updateMask when provided.
   */
  async function mutateWithExplicitMasks(operations: MutateOperation[]): Promise<MutateResult[]> {
    // Import the protobuf constructors and utils from google-ads-api internals.
    // We access these directly to build protobuf messages with our own field masks,
    // bypassing the library's auto-generated masks that fail on empty sub-messages.
    const protos = await import('google-ads-api/build/src/protos/index.js') as unknown as {
      services: { MutateOperation: new (data: Record<string, unknown>) => unknown; MutateGoogleAdsRequest: new (data: Record<string, unknown>) => unknown }
      protobuf: { FieldMask: new (data: { paths: string[] }) => unknown }
    }
    const utils = await import('google-ads-api/build/src/utils.js') as unknown as {
      toSnakeCase: (s: string) => string
      getFieldMask: (data: Record<string, unknown>) => unknown
    }
    const { toSnakeCase, getFieldMask } = utils

    const mutateOperations = operations.map(op => {
      const opType = (op.op ?? 'create') as 'create' | 'update' | 'remove'
      const opKey = toSnakeCase(`${op.operation}Operation`)

      if (opType === 'remove') {
        const rn = (op.resource as Record<string, unknown>).resource_name as string
        const operation = { remove: rn }
        return new protos.services.MutateOperation({ [opKey]: operation })
      }

      const operation: Record<string, unknown> = { [opType]: op.resource }

      if (opType === 'update') {
        if (op.updateMask) {
          // Use our explicit mask — this is the critical fix for bidding changes
          operation.update_mask = new protos.protobuf.FieldMask({
            paths: op.updateMask.split(','),
          })
        } else {
          // Fall back to auto-generated mask (library default behavior)
          operation.update_mask = getFieldMask(op.resource)
        }
      }

      return new protos.services.MutateOperation({ [opKey]: operation })
    })

    const request = new protos.services.MutateGoogleAdsRequest({
      customer_id: creds.customerId,
      mutate_operations: mutateOperations,
    })

    // Access the gRPC service directly via the customer's internal method.
    // loadService() is synchronous (returns cached gRPC client).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cust = customer as any
    const service = cust.loadService('GoogleAdsServiceClient')
    const callHeaders = cust.callHeaders
    const response = (await service.mutate(request, { otherArgs: { headers: callHeaders } }))[0]
    return extractMutateResults(response)
  }

  function extractMutateResults(response: unknown): MutateResult[] {
    const responses = (response as { mutate_operation_responses?: Array<Record<string, unknown>> }).mutate_operation_responses ?? []
    return responses.map(r => {
      const resultKey = Object.keys(r).find(k => k.endsWith('_result') && r[k] != null)
      const result = resultKey ? r[resultKey] as Record<string, unknown> : null
      return { resourceName: (result?.resource_name as string) ?? '' }
    })
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
