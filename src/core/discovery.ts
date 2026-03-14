import type { AdsConfig } from './types.ts'

// === Types ===

export type DiscoveredCampaign = {
  readonly file: string
  readonly exportName: string
  readonly provider: string
  readonly kind: string
  readonly campaign: unknown
}

export type DiscoveryError = {
  readonly file: string
  readonly message: string
  readonly cause?: unknown
}

export type DiscoveryResult = {
  readonly campaigns: DiscoveredCampaign[]
  readonly errors: DiscoveryError[]
}

// === Campaign Discovery ===

/**
 * Check if a value looks like a campaign object (has provider + kind fields).
 */
function isCampaignLike(value: unknown): value is { provider: string; kind: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provider' in value &&
    'kind' in value &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).kind === 'string'
  )
}

/**
 * Scan campaigns/**\/*.ts under rootDir, dynamic-import each file,
 * and collect exports that look like campaign objects (have provider + kind fields).
 *
 * Returns discovered campaigns and any errors encountered during import.
 */
export async function discoverCampaigns(rootDir: string): Promise<DiscoveryResult> {
  const campaigns: DiscoveredCampaign[] = []
  const errors: DiscoveryError[] = []

  const glob = new Bun.Glob('campaigns/**/*.ts')
  const files: string[] = []

  for await (const match of glob.scan({ cwd: rootDir, absolute: true })) {
    files.push(match)
  }

  // Sort for deterministic order
  files.sort()

  for (const file of files) {
    try {
      const mod = await import(file)

      for (const [exportName, value] of Object.entries(mod)) {
        if (isCampaignLike(value)) {
          campaigns.push({
            file,
            exportName,
            provider: value.provider,
            kind: value.kind,
            campaign: value,
          })
        }
      }
    } catch (err) {
      errors.push({
        file,
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      })
    }
  }

  return { campaigns, errors }
}

// === Config Loading ===

/**
 * Import ads.config.ts from rootDir and return the default export.
 * Returns undefined if the file doesn't exist.
 */
export async function loadConfig(rootDir: string): Promise<AdsConfig | undefined> {
  const configPath = `${rootDir}/ads.config.ts`

  const file = Bun.file(configPath)
  const exists = await file.exists()
  if (!exists) {
    return undefined
  }

  const mod = await import(configPath)
  return mod.default as AdsConfig
}
