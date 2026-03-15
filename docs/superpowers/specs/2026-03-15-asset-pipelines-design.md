# Asset Pipelines Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Pluggable creative asset generation and composition for ads-as-code

## Problem

Modern ad creatives rely heavily on GenAI image generation, programmatic video composition (Remotion), and image processing (Sharp, Satori). The SDK currently treats assets as static file paths or URLs — there's no way to define a pipeline that produces assets as part of the campaign deployment flow.

## Design Principles

- **Zero coupling to external tools.** The SDK defines a contract. Users bring their own tools — fal.ai, Remotion, Sharp, Cloudinary, OpenAI, whatever. The SDK never imports, wraps, or ships adapters for any of them.
- **Just functions.** An asset pipeline is a typed function wrapped with `asset()`. No registry, no config entry, no string-based lookups. Import it, call it, done.
- **Filesystem is the cache.** Output file exists → skip. Missing → generate. No lock file, no hashes, no key formats. Fully transparent, fully controllable.
- **Inspired by existing patterns.** Asset markers follow the same concept as `ai.rsa()` markers (placeholder → resolution → concrete value). Resolution happens at the same pipeline stage.

## Target Scenarios

1. **Product banner factory** — compose product photos into branded banners with text overlays, different sizes per placement
2. **AI hero images** — generate lifestyle photos via GenAI (fal.ai, FLUX, etc.)
3. **Video ads from static assets** — Remotion templates that animate product photos into video ads
4. **Localized creative variants** — same base image, different text overlays per locale
5. **Multi-format from one concept** — resize/recompose one hero creative to every required format
6. **Seasonal/dynamic swaps** — template-based banners with swappable slots (discount %, seasonal theme)
7. **Carousel from product catalog** — compose product images into consistently styled carousel cards
8. **UGC-style ads** — compose talking head footage with product cutouts, captions, branding
9. **GenAI product-in-scene** — take a product photo and generate a contextual scene around it via inpainting

## API Surface

### Defining a pipeline

`asset()` is a higher-order function that wraps a pipeline definition into a typed marker factory. A pipeline is a single function that returns a descriptor: **where** the output goes and **how** to produce it.

```ts
// pipelines/product-card.ts
import { asset } from "@upspawn/ads";

type ProductCardInput = {
  product: string;
  price: string;
  size: [number, number];
};

export const productCard = asset((p: ProductCardInput) => ({
  output: `./assets/output/${p.product}-${p.size[0]}x${p.size[1]}.png`,
  generate: async (out) => {
    await renderProductCard({ ...p, output: out });
  },
}));
```

The function takes typed params and returns:
- `output` — deterministic file path, relative to the project root (the directory containing `ads.config.ts`). This IS the cache key.
- `generate(outputPath)` — async producer, only called if the output file doesn't exist. Always use `out` for the write destination rather than re-deriving the path from params — the SDK may resolve it to an absolute path.

Params are captured by closure — `generate` has natural access to everything.

The type signature:

```ts
function asset<T>(
  fn: (params: T) => { output: string; generate: (out: string) => Promise<void> }
): (params: T) => AssetMarker;
```

Full autocomplete and type checking on params. Pipelines are regular TypeScript — import them, test them, compose them.

### More examples

```ts
// pipelines/ugc-video.ts
export const ugcVideo = asset((p: { topic: string }) => ({
  output: `./assets/ugc/${p.topic}.mp4`,
  generate: async (out) => {
    await higsfield.generateVideo({
      prompt: `Girl talking about ${p.topic}`,
      output: out,
    });
  },
}));

// pipelines/hero-scene.ts
export const heroScene = asset((p: { product: string; scene: string }) => ({
  output: `./assets/heroes/${p.product}-${p.scene}.png`,
  generate: async (out) => {
    const result = await fal.run("flux-fill", {
      image: `./assets/products/${p.product}.png`,
      prompt: p.scene,
    });
    await Bun.write(out, result.image);
  },
}));

// pipelines/resize.ts
export const resize = asset((p: { src: string; width: number; height: number }) => ({
  output: `./assets/resized/${basename(p.src)}-${p.width}x${p.height}.png`,
  generate: async (out) => {
    await sharp(p.src).resize(p.width, p.height).toFile(out);
  },
}));
```

### Using in campaigns

Calling the wrapped function returns an `AssetMarker` — a plain object with `{ __brand: "asset", output, generate }`. Creative helpers (`image()`, `video()`, `carousel()`) accept `string | AssetMarker` for their path argument.

```ts
// campaigns/summer-shoes.ts
import { meta, image } from "@upspawn/ads";
import { productCard } from "../pipelines/product-card";
import { ugcVideo } from "../pipelines/ugc-video";

export const campaign = meta.traffic("summer-shoes", config)
  .adSet("main", targeting, [
    image(productCard({ product: "trail-runner", price: "€89", size: [1080, 1080] }), {
      headline: "Trail Runner Pro",
      primaryText: "Hit the trails this summer",
    }),
  ])
  .adSet("story", targeting, [
    image(productCard({ product: "trail-runner", price: "€89", size: [1080, 1920] }), {
      headline: "Trail Runner Pro",
      primaryText: "Hit the trails this summer",
    }),
  ])
  .adSet("ugc", targeting, [
    video(ugcVideo({ topic: "trail running shoes" }), {
      headline: "Real runners, real trails",
    }),
  ]);
```

Static assets still work — `image("./assets/hero.png", { ... })` is unchanged.

### One call, one output

Each pipeline call produces a single file. Need 5 sizes? Call 5 times with different params. Each has its own output path and cache entry.

## Caching

**The filesystem is the cache.** The output path declared by the pipeline IS the cache key.

| Situation | SDK behavior |
|-----------|-------------|
| Output file exists | Skip — use it directly |
| Output file missing | Call `generate(outputPath)`, verify file was created |
| `--refresh-assets` flag | Discover all markers first, delete their output files, then re-run all pipelines |

That's the entire caching model. No lock file, no hashes, no manifest.

### Cache invalidation

The user controls invalidation by choosing what goes in the output path:

```ts
// Price changes → new file (price is in the path)
output: `./assets/${p.product}-${p.price}-${p.size}.png`

// Price changes → same file, no re-generation (price not in path)
output: `./assets/${p.product}-${p.size}.png`
```

Want to force regeneration of a specific asset? Delete the file. Want to regenerate everything? `--refresh-assets` or `rm -rf ./assets/output/`.

### Team sharing

Output files can be:
- **Committed to git** — team gets pre-built assets, no re-generation needed
- **Gitignored** — each developer generates locally on first `plan`/`apply`
- **Stored in cloud storage** — user's choice, outside SDK scope

## Resolution Pipeline

Asset resolution slots into the pipeline between discovery and flatten — the same stage where `ai.rsa()` markers resolve.

**Note:** The current codebase embeds marker resolution inside provider-specific preprocessing (e.g., `preprocessGoogle()` in `plan.ts`). Asset resolution follows the same pattern: `resolveAssets()` is called within the existing preprocessing flow, after marker resolution and before flatten.

```
discoverCampaigns() → preprocess(resolveMarkers + resolveAssets) → flattenAll() → diff() → apply()
```

`resolveAssets(campaigns, options)`:

1. Generic recursive walk of the campaign object tree, finding any value where `isAssetMarker(value)` returns true (checks `value?.__brand === "asset"`). This is provider-agnostic — works for Meta creatives, Google extensions, carousel cards, or any future type that holds an asset path.
2. For each marker, checks if `output` file exists
3. If missing, calls `generate(outputPath)` concurrently via `Promise.allSettled()` (so one failure doesn't cancel others)
4. Verifies each output file was created (exists, non-empty, not a directory)
5. Replaces each marker with the resolved file path string

By the time `flattenAll()` sees the campaign, every asset field is a plain string path. The rest of the pipeline (diff, apply, upload) works unchanged.

### Pre-generation validation

`asset()` itself validates the descriptor at marker-creation time:
- `output` must be a non-empty string
- `output` must not end with `/` (directory)
- `generate` must be a function

These checks fail fast with clear errors before any pipeline runs.

### Concurrency

Resolution runs all pending pipelines concurrently with `Promise.allSettled()` (not `Promise.all()`). This ensures all pipelines run to completion — one failure doesn't cancel in-flight work. The final report shows all successes and failures together. No concurrency limit in v1 — users who need throttling implement it inside their pipeline functions. A `maxConcurrency` option can be added later if needed.

## Error Handling

Asset pipelines are user code — they will throw. The SDK wraps each call:

```
✗ Asset failed: ./assets/output/trail-runner-1080x1080.png
  Error: ENOENT: ./assets/photos/trail-runner.png not found
  Pipeline: pipelines/product-card.ts
```

Post-`generate` validation catches:
- Output file not created (pipeline returned without writing)
- Output file is empty
- Output path is a directory

### Error behavior by command

- **`plan`**: Asset failure marks the affected ad as `⚠ unresolved asset`. The rest of the changeset still displays.
- **`apply`**: Asset failure is fatal for that specific ad. Other ads in the changeset still apply (consistent with existing dependency-ordered mutation behavior).
- **`validate`**: Checks that asset markers have valid `output` paths (no empty strings). Does NOT run pipelines.

## CLI Integration

No new commands. Assets resolve transparently within existing commands:

| Command | Asset behavior |
|---------|---------------|
| `plan` | Resolves assets (skip if exists, generate if missing), shows changeset |
| `plan --refresh-assets` | Discovers markers, deletes their outputs, re-runs all pipelines |
| `apply` | Resolves assets, uploads to platform |
| `apply --refresh-assets` | Discovers markers, deletes their outputs, re-runs all pipelines |
| `validate` | Checks marker structure, does not run pipelines |
| `pull` | Substitutes marker output paths without running pipelines (drift detection doesn't need generated files) |

### Plan output

```
Assets:
  ✓ ./assets/output/trail-runner-1080x1080.png — exists
  ▸ ./assets/output/trail-runner-1080x1920.png — generated (1.2s)
  ✗ ./assets/heroes/trail-runner-mountain.png — failed: API timeout

Changes:
  + meta/summer-shoes/main/ad  (image: trail-runner-1080x1080.png)
  + meta/summer-shoes/story/ad  (⚠ unresolved asset)
```

## Implementation Surface

### New files

| File | Purpose |
|------|---------|
| `src/core/asset.ts` | `asset()` higher-order function, `AssetMarker` type, `resolveAssets()` tree walker, `isAssetMarker()` type guard |

### Modified files

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `AssetMarker` and `AssetDescriptor` types |
| `src/helpers/meta-creative.ts` | `image()`, `video()`, `carousel()` accept `string \| AssetMarker` for path args. `CarouselCard.image` and `VideoAd.thumbnail` widened to `string \| AssetMarker` in `src/meta/types.ts`. |
| `src/meta/types.ts` | Widen `CarouselCard.image`, `VideoAd.thumbnail`, `CollectionAd.coverImage`, `CollectionAd.coverVideo` to `string \| AssetMarker` |
| `cli/plan.ts` | Call `resolveAssets()` within preprocessing, display asset resolution status |
| `cli/apply.ts` | Extract shared `preprocessCampaigns()` from `plan.ts` that runs both `resolveMarkers()` and `resolveAssets()`. Apply currently skips all preprocessing — this refactor gives both `plan` and `apply` the same preprocess chain. Add `--refresh-assets` flag. |
| `cli/validate.ts` | Check asset marker structure via `isAssetMarker()` |
| `cli/pull.ts` | Substitute `AssetMarker` → `marker.output` string (no pipeline execution) |

### New test files

| File | Purpose |
|------|---------|
| `test/unit/asset.test.ts` | `asset()` wrapping, marker creation, `resolveAssets()` with mock pipelines (both cached and generated paths), error cases |

### Types

```ts
/** Descriptor returned by the user's pipeline function */
type AssetDescriptor = {
  readonly output: string;
  readonly generate: (outputPath: string) => Promise<void>;
};

/** Marker object created by calling a wrapped pipeline */
type AssetMarker = {
  readonly __brand: "asset";
  readonly output: string;
  readonly generate: (outputPath: string) => Promise<void>;
};

/**
 * Higher-order function: wraps a pipeline definition into a typed marker factory.
 *
 * The pipeline function takes typed params and returns an AssetDescriptor.
 * The returned factory takes the same params and returns an AssetMarker.
 */
function asset<T>(
  fn: (params: T) => AssetDescriptor
): (params: T) => AssetMarker;

/** Type guard for detecting markers during tree walk */
function isAssetMarker(value: unknown): value is AssetMarker;
```

## What This Design Does NOT Do

- **No adapters or wrappers** for fal.ai, Remotion, Sharp, or any other tool
- **No multi-output from single call** — one pipeline call = one file
- **No asset library or registry** — assets are project-local files
- **No config changes** — pipelines are functions, not config entries
- **No lock file or manifest** — filesystem is the cache
- **No image validation** (dimensions, format, file size) — the ad platform rejects invalid assets at apply time
- **No automatic format conversion** — if Meta needs JPEG and your pipeline produces PNG, that's on the pipeline
- **No asset preview** — `plan` shows the path, not a thumbnail
- **No `import` round-trip** — `import` from live platforms produces concrete file paths, not `asset()` calls
- **No Google extensions support in v1** — Google `ImageExtension` uses `imageUrl: string` which could hold asset markers, but this is deferred until the pattern is proven with Meta creatives

These are potential future extensions but are out of scope for the initial implementation.
