import type { AdsError, MetaProviderConfig } from '../core/types.ts'

// === Error Types ===

class MetaApiError extends Error {
  readonly adsError: AdsError

  constructor(error: AdsError) {
    super(error.message)
    this.name = 'MetaApiError'
    this.adsError = error
  }
}

// === Meta Error Response Parsing ===

type MetaErrorBody = {
  readonly error: {
    readonly message: string
    readonly type: string
    readonly code: number
    readonly error_subcode?: number
    readonly fbtrace_id?: string
  }
}

function isMetaErrorBody(body: unknown): body is MetaErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as MetaErrorBody).error === 'object' &&
    (body as MetaErrorBody).error !== null &&
    typeof (body as MetaErrorBody).error.code === 'number'
  )
}

/**
 * Maps Meta Graph API error responses to SDK AdsError types.
 *
 * Meta uses error codes (not HTTP status) to distinguish error categories:
 * - Code 190: invalid/expired access token
 * - Code 4, 32: rate limiting (application-level and account-level)
 * - Code 100: validation / invalid parameter
 * - Code 10: permission denied
 */
function mapMetaError(body: unknown, httpStatus: number): AdsError {
  if (!isMetaErrorBody(body)) {
    return { type: 'api', code: httpStatus, message: `Meta API error (${httpStatus}): ${JSON.stringify(body)}` }
  }

  const { error } = body
  const detail = error.fbtrace_id ? ` [fbtrace_id: ${error.fbtrace_id}]` : ''
  const message = `${error.message}${detail}`

  // Auth errors
  if (error.code === 190) {
    return { type: 'auth', message }
  }

  // Permission denied
  if (error.code === 10) {
    return { type: 'auth', message: `Permission denied: ${message}` }
  }

  // Rate limiting — codes 4 (application) and 32 (account)
  if (error.code === 4 || error.code === 32) {
    return { type: 'quota', message, retryAfter: 60 }
  }

  // Validation errors — code 100 (invalid parameter)
  if (error.code === 100) {
    return { type: 'validation', field: 'unknown', message }
  }

  // Generic API error for anything else
  return { type: 'api', code: error.code, message }
}

// === Credential Resolution ===

function resolveAccessToken(): string {
  const token = process.env['FB_ADS_ACCESS_TOKEN']
  if (!token) {
    throw new MetaApiError({
      type: 'auth',
      message: 'FB_ADS_ACCESS_TOKEN environment variable is required. Get one from https://developers.facebook.com/tools/explorer/',
    })
  }
  return token
}

// === Meta Graph API Client ===

export type MetaClient = {
  readonly graphGet: <T = unknown>(endpoint: string, params?: Record<string, string>) => Promise<T>
  readonly graphPost: <T = unknown>(endpoint: string, params: Record<string, string>) => Promise<T>
  readonly graphDelete: <T = unknown>(endpoint: string) => Promise<T>
  readonly graphGetAll: <T extends Record<string, unknown>>(endpoint: string, params?: Record<string, string>) => Promise<T[]>
}

type PaginatedResponse<T> = {
  readonly data: T[]
  readonly paging?: {
    readonly cursors?: { readonly before?: string; readonly after?: string }
    readonly next?: string
  }
}

/**
 * Parse a JSON response body, preserving large numeric ID fields as strings.
 * Meta IDs can exceed Number.MAX_SAFE_INTEGER (2^53 - 1); standard JSON.parse
 * would silently truncate them, causing off-by-one errors in campaign references.
 */
async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  // Wrap bare large-integer values on any key ending with "id" in quotes
  // before parsing. Already-quoted values won't match (digit won't follow colon+space).
  return JSON.parse(text.replace(/"(\w*id)"\s*:\s*(\d{15,})/gi, '"$1":"$2"'))
}

export function createMetaClient(config: MetaProviderConfig): MetaClient {
  const apiVersion = config.apiVersion ?? 'v21.0'
  const baseUrl = `https://graph.facebook.com/${apiVersion}`
  const accessToken = resolveAccessToken()

  async function request<T>(method: string, endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}/${endpoint}`)

    // Always attach the access token
    url.searchParams.set('access_token', accessToken)

    let response: Response

    if (method === 'GET') {
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          url.searchParams.set(key, value)
        }
      }
      response = await fetch(url.toString())
    } else if (method === 'POST') {
      // POST uses form-encoded body
      const formData = new URLSearchParams()
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          formData.set(key, value)
        }
      }
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })
    } else if (method === 'DELETE') {
      response = await fetch(url.toString(), { method: 'DELETE' })
    } else {
      throw new MetaApiError({ type: 'api', code: 0, message: `Unsupported HTTP method: ${method}` })
    }

    const body = await safeParseJson(response)

    if (!response.ok) {
      throw new MetaApiError(mapMetaError(body, response.status))
    }

    return body as T
  }

  async function graphGet<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return request<T>('GET', endpoint, params)
  }

  async function graphPost<T = unknown>(endpoint: string, params: Record<string, string>): Promise<T> {
    return request<T>('POST', endpoint, params)
  }

  async function graphDelete<T = unknown>(endpoint: string): Promise<T> {
    return request<T>('DELETE', endpoint)
  }

  async function graphGetAll<T extends Record<string, unknown>>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
    const results: T[] = []
    let nextUrl: string | undefined

    // First request goes through the normal path
    const firstPage = await graphGet<PaginatedResponse<T>>(endpoint, params)
    results.push(...firstPage.data)
    nextUrl = firstPage.paging?.next

    // Follow pagination cursors
    while (nextUrl) {
      const response = await fetch(nextUrl)
      const body = await safeParseJson(response)

      if (!response.ok) {
        throw new MetaApiError(mapMetaError(body, response.status))
      }

      const page = body as PaginatedResponse<T>
      results.push(...page.data)
      nextUrl = page.paging?.next
    }

    return results
  }

  return { graphGet, graphPost, graphDelete, graphGetAll }
}

export { MetaApiError, mapMetaError, resolveAccessToken, safeParseJson }
