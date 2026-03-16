// Asset pipeline marker type — a placeholder for assets that get resolved
// before flatten time. See docs/superpowers/specs/2026-03-16-asset-pipelines-design.md

/** Marker object returned by calling a wrapped asset pipeline function. */
export type AssetMarker = {
  readonly __brand: 'asset'
  readonly name: string
  readonly paramsHash: string
  readonly generate: (params: unknown) => Promise<string>
  readonly params: unknown
  readonly cachedPath?: string
}

/** Type guard for detecting asset markers during tree walk. */
export function isAssetMarker(value: unknown): value is AssetMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as AssetMarker).__brand === 'asset'
  )
}
