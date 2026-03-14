// === Error Context ===

export type ErrorContext = {
  readonly file?: string
  readonly group?: string
  readonly ad?: string
  readonly field?: string
}

/**
 * An enriched error that carries file/group/ad/field location context
 * for better diagnostic messages.
 */
export class AdsEnrichedError extends Error {
  readonly context: ErrorContext

  constructor(message: string, context: ErrorContext, cause?: unknown) {
    const location = formatLocation(context)
    const enrichedMessage = location ? `${location}: ${message}` : message
    super(enrichedMessage)
    this.name = 'AdsEnrichedError'
    this.context = context
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

/**
 * Format an ErrorContext into a human-readable location string.
 *
 * Examples:
 *   { file: "campaigns/search.ts" } → "campaigns/search.ts"
 *   { file: "campaigns/search.ts", group: "en-us" } → "campaigns/search.ts > en-us"
 *   { file: "campaigns/search.ts", group: "en-us", field: "budget" } → "campaigns/search.ts > en-us > budget"
 */
function formatLocation(context: ErrorContext): string {
  const parts: string[] = []
  if (context.file) parts.push(context.file)
  if (context.group) parts.push(context.group)
  if (context.ad) parts.push(context.ad)
  if (context.field) parts.push(context.field)
  return parts.join(' > ')
}

/**
 * Wrap an error with file/group/ad/field location context.
 * If the error is already enriched, its context is merged (new context wins).
 */
export function enrichError(error: unknown, context: ErrorContext): AdsEnrichedError {
  if (error instanceof AdsEnrichedError) {
    // Merge contexts — new context fields override existing ones
    const mergedContext: ErrorContext = { ...error.context, ...context }
    const originalMessage = error.cause instanceof Error
      ? error.cause.message
      : error.message.includes(': ')
        ? error.message.split(': ').slice(1).join(': ')
        : error.message
    return new AdsEnrichedError(originalMessage, mergedContext, error.cause ?? error)
  }

  const message = error instanceof Error ? error.message : String(error)
  return new AdsEnrichedError(message, context, error)
}
