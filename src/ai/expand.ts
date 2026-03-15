// ─── Campaign Multiplication: Expand ────────────────────
// Computes an expansion matrix from a seed campaign, producing
// translation, ICP variation, and cross-product targets.

// ─── Types ──────────────────────────────────────────────

export type ExpandConfig = {
  /** Languages to translate into (ISO codes, e.g. 'de', 'fr') */
  readonly translate?: string[]
  /** ICP variations to generate */
  readonly vary?: ReadonlyArray<{ readonly name: string; readonly prompt: string }>
  /** Optional judge system prompt for quality control */
  readonly judge?: string
  /** Whether to generate cross-product of translate x vary. Defaults to true. */
  readonly cross?: boolean
}

export type ExpandEntry = {
  readonly seed: string
  readonly config: ExpandConfig
}

export type ExpansionTarget = {
  readonly fileName: string
  readonly translate?: string
  readonly vary?: { readonly name: string; readonly prompt: string }
}

// ─── Functions ──────────────────────────────────────────

/**
 * Create an expand entry for the generation matrix.
 * Pure data — no side effects.
 */
export function expand(seedPath: string, config: ExpandConfig): ExpandEntry {
  return { seed: seedPath, config }
}

/**
 * Compute all expansion targets from a seed slug and config.
 *
 * Produces:
 * - translate-only targets: one per language (e.g., search-dropbox.de.ts)
 * - vary-only targets: one per ICP (e.g., search-dropbox.smb.ts)
 * - If cross is true (default), cross products (e.g., search-dropbox.smb.de.ts)
 *
 * Math example: translate: ['de','fr','es'] + vary: [smb, enterprise] + cross:true
 *   = 3 translate + 2 vary + (3 * 2) cross = 11 targets
 */
export function computeExpansionTargets(
  seedSlug: string,
  config: ExpandConfig,
): ExpansionTarget[] {
  const targets: ExpansionTarget[] = []
  const langs = config.translate ?? []
  const variations = config.vary ?? []
  const cross = config.cross ?? true

  // Translate-only targets
  for (const lang of langs) {
    targets.push({
      fileName: `${seedSlug}.${lang}.ts`,
      translate: lang,
    })
  }

  // Vary-only targets
  for (const v of variations) {
    targets.push({
      fileName: `${seedSlug}.${v.name}.ts`,
      vary: { name: v.name, prompt: v.prompt },
    })
  }

  // Cross-product targets (translate x vary)
  if (cross && langs.length > 0 && variations.length > 0) {
    for (const v of variations) {
      for (const lang of langs) {
        targets.push({
          fileName: `${seedSlug}.${v.name}.${lang}.ts`,
          translate: lang,
          vary: { name: v.name, prompt: v.prompt },
        })
      }
    }
  }

  return targets
}
