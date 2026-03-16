# Asset Pipelines Design Spec

**Date:** 2026-03-16
**Status:** Final
**Scope:** Pluggable creative asset generation and composition for ads-as-code

## Problem

Modern ad creatives rely heavily on GenAI image generation, programmatic video composition (Remotion), and image processing (Sharp, Satori). The SDK currently treats assets as static file paths or URLs — there's no way to define a pipeline that produces assets as part of the campaign deployment flow.

## Design Principles

- **Zero coupling to external tools.** The SDK defines a contract. Users bring their own tools — fal.ai, Remotion, Sharp, Cloudinary, OpenAI, whatever. The SDK never imports, wraps, or ships adapters for any of them.
- **Just functions.** An asset pipeline is a named typed function wrapped with `asset()`. No config entry, no registry lookups. Import it, call it, done.
- **SDK-managed storage.** The SDK owns the `.assets/` folder. File paths are deterministic: `<params-hash>-<content-hash>.<ext>`. Users never declare output paths — the SDK catalogs everything.
- **Content-aware caching.** Params change → new file. Content changes (regen) → new file with new content hash. Ad platforms treat creatives as immutable — a changed file MUST produce a new path so the diff engine picks it up and `apply` uploads the new creative.

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

`asset()` takes a name and an async function. The function receives typed params and returns a file path to the produced asset. The SDK handles the rest — cataloging, caching, path management.

```ts
// pipelines/product-card.ts
import { asset } from "@upspawn/ads";

type ProductCardInput = {
  product: string;
  price: string;
  size: [number, number];
};

export const productCard = asset("product-card", async (p: ProductCardInput) => {
  const tmp = `/tmp/${crypto.randomUUID()}.png`;
  await renderProductCard({ ...p, output: tmp });
  return tmp;
});
```

The function:
- Receives typed params
- Does whatever it needs (Sharp, fal.ai, Remotion — user's code, user's tools)
- Returns a file path to the result (temp file, working directory, anywhere)
- The SDK copies the result into `.assets/<name>/<params-hash>-<content-hash>.<ext>`

Optional third argument controls source file handling:
- `{ move: true }` — moves (deletes) the source file after copying to `.assets/`. Use when generating to temp files and you want cleanup.
- Default (no option) — copies, source file stays untouched.

```ts
// Large video files — move to avoid temp file buildup
export const promoVideo = asset("promo-video", async (p: VideoInput) => {
  const tmp = `/tmp/${crypto.randomUUID()}.mp4`;
  await remotion.render({ ...p, output: tmp });
  return tmp;
}, { move: true });
```

The type signature:

```ts
function asset<T>(
  name: string,
  generate: (params: T) => Promise<string>,
  options?: { move?: boolean },
): (params: T) => AssetMarker;
```

Full autocomplete and type checking on params. Pipelines are regular TypeScript — import them, test them, compose them.

### More examples

```ts
// pipelines/ugc-video.ts
export const ugcVideo = asset("ugc-video", async (p: { topic: string }) => {
  const tmp = `/tmp/${crypto.randomUUID()}.mp4`;
  await higsfield.generateVideo({
    prompt: `Girl talking about ${p.topic}`,
    output: tmp,
  });
  return tmp;
});

// pipelines/hero-scene.ts
export const heroScene = asset("hero-scene", async (p: { product: string; scene: string }) => {
  const result = await fal.run("flux-fill", {
    image: `./products/${p.product}.png`,
    prompt: p.scene,
  });
  const tmp = `/tmp/${crypto.randomUUID()}.png`;
  await Bun.write(tmp, result.image);
  return tmp;
});

// pipelines/resize.ts
export const resize = asset("resize", async (p: { src: string; width: number; height: number }) => {
  const tmp = `/tmp/${crypto.randomUUID()}.png`;
  await sharp(p.src).resize(p.width, p.height).toFile(tmp);
  return tmp;
});
```

### Using in campaigns

Calling the wrapped function returns an `AssetMarker` — a plain object with `{ __brand: "asset", name, paramsHash, cachedPath?, generate }`. Creative helpers (`image()`, `video()`, `carousel()`) accept `string | AssetMarker` for their path argument.

```ts
// campaigns/summer-shoes.ts
import { meta, metaImage, metaVideo } from "@upspawn/ads";
import { productCard } from "../pipelines/product-card";
import { ugcVideo } from "../pipelines/ugc-video";

export const campaign = meta.traffic("summer-shoes", config)
  .adSet("main", targeting, [
    metaImage(productCard({ product: "trail-runner", price: "€89", size: [1080, 1080] }), {
      headline: "Trail Runner Pro",
      primaryText: "Hit the trails this summer",
    }),
  ])
  .adSet("story", targeting, [
    metaImage(productCard({ product: "trail-runner", price: "€89", size: [1080, 1920] }), {
      headline: "Trail Runner Pro",
      primaryText: "Hit the trails this summer",
    }),
  ])
  .adSet("ugc", targeting, [
    metaVideo(ugcVideo({ topic: "trail running shoes" }), {
      headline: "Real runners, real trails",
    }),
  ]);
```

Static assets still work — `metaImage("./assets/hero.png", { ... })` is unchanged.

### One call, one output

Each pipeline call produces a single file. Need 5 sizes? Call 5 times with different params. Each has its own output path and cache entry.

## Storage: `.assets/` folder

The SDK manages the `.assets/` folder at the project root. Structure:

```
.assets/
  product-card/
    a1b2c3-f7e8d9.png    ← params: { product: "runner", size: [1080, 1080] }
    a1b2c3-b4c5a6.png    ← same params, regenerated (different content hash)
    d4e5f6-c3d2e1.png    ← params: { product: "runner", size: [1080, 1920] }
  hero-scene/
    g7h8i9-a9b8c7.png    ← params: { product: "runner", scene: "mountain" }
```

### File naming

`<params-hash>-<content-hash-prefix>.<ext>`

- **params-hash**: First 8 chars of SHA-256 of `stableStringify(params)`. Identifies the logical asset.
- **content-hash-prefix**: First 8 chars of SHA-256 of the output file contents. Changes when content changes.
- **ext**: Inferred from the file path returned by `generate()`.

### Why content hash matters

Ad platforms (Meta, Google) treat creatives as **immutable**. You can't swap the image on a live ad — you upload a new image, create a new ad, pause the old one.

If a regenerated creative kept the same path, the diff engine would see no change and `apply` would never upload the new version. The content hash ensures:
- Same params + same content = same path = cached (no-op)
- Same params + different content (regen) = different path = diff picks it up = new ad created

## Caching

The SDK checks for existing files matching the params hash in `.assets/<name>/`:

| Situation | SDK behavior |
|-----------|-------------|
| File matching `<params-hash>-*.<ext>` exists | Skip — use existing file path |
| No match | Call `generate(params)`, hash content, copy to `.assets/<name>/<params-hash>-<content-hash>.<ext>` |
| `--refresh-assets` | Delete all files in `.assets/`, re-run all pipelines |

Cache lookup: `glob(".assets/<name>/<params-hash>-*")`. First match wins (there should only be one per params-hash unless regenerated — old files are cleaned up).

### Atomic writes

To prevent corrupt files from crashed pipelines:
1. `generate(params)` writes to its own location (temp file)
2. SDK hashes the output file
3. SDK copies (or moves, if `{ move: true }`) to `.assets/<name>/<params-hash>-<content-hash>.<ext>`

If `generate` crashes, no file appears in `.assets/`. Clean by default. With `{ move: true }`, source file is deleted only after successful copy to `.assets/`.

### Cleanup on regeneration

When `--refresh-assets` produces a new content hash for the same params hash:
- New file: `.assets/product-card/a1b2c3-NEW_HASH.png`
- Old file: `.assets/product-card/a1b2c3-OLD_HASH.png` — deleted after successful generation

### Team sharing

- `.assets/` can be committed to git — team gets pre-built assets
- Or gitignored — each developer generates locally on first `plan`/`apply`

## Resolution Pipeline

Asset resolution slots into the pipeline between discovery and flatten — the same stage where `ai.rsa()` markers resolve.

**Note:** The current codebase embeds marker resolution inside provider-specific preprocessing (e.g., `preprocessGoogle()` in `plan.ts`). Asset resolution follows the same pattern: `resolveAssets()` is called within the existing preprocessing flow, after marker resolution and before flatten.

```
discoverCampaigns() → preprocess(resolveMarkers + resolveAssets) → flattenAll() → diff() → apply()
```

`resolveAssets(campaigns, options)`:

1. Generic recursive walk of the campaign object tree, finding any value where `isAssetMarker(value)` returns true (checks `value?.__brand === "asset"`). Provider-agnostic.
2. For each marker, checks if `.assets/<name>/<params-hash>-*` exists
3. If missing, calls `generate(params)` concurrently via `Promise.allSettled()` (one failure doesn't cancel others)
4. Hashes output file, copies to managed path, cleans up source if temp
5. Replaces each marker with the resolved managed file path string

By the time `flattenAll()` sees the campaign, every asset field is a plain string path. The rest of the pipeline (diff, apply, upload) works unchanged.

### Pre-marker validation

`asset()` validates at marker-creation time:
- `name` must be a non-empty string
- `generate` must be a function
- `params` must be serializable (for hashing)

### Concurrency

Resolution runs all pending pipelines concurrently with `Promise.allSettled()`. No concurrency limit in v1. A `maxConcurrency` option can be added later if needed.

## Error Handling

Asset pipelines are user code — they will throw. The SDK wraps each call:

```
✗ Asset "product-card" failed (params: { product: "runner", size: [1080, 1080] })
  Error: ENOENT: ./products/runner.png not found
```

Post-`generate` validation:
- Returned path must point to an existing, non-empty file (not a directory)
- File must be readable

### Error behavior by command

- **`plan`**: Asset failure marks the affected ad as `⚠ unresolved asset`. The rest of the changeset still displays.
- **`apply`**: Asset failure is fatal for that specific ad. Other ads in the changeset still apply.
- **`validate`**: Checks that asset markers exist. Does NOT run pipelines.

## CLI Integration

No new commands. Assets resolve transparently within existing commands:

| Command | Asset behavior |
|---------|---------------|
| `plan` | Resolves assets (skip if cached, generate if missing), shows changeset |
| `plan --refresh-assets` | Clears `.assets/`, re-runs all pipelines |
| `apply` | Resolves assets, uploads to platform |
| `apply --refresh-assets` | Clears `.assets/`, re-runs all pipelines |
| `validate` | Checks marker structure, does not run pipelines |
| `pull` | Substitutes marker with cached path (no pipeline execution) |

### Plan output

```
Assets:
  ✓ product-card (runner, 1080x1080) — cached
  ▸ product-card (runner, 1080x1920) — generated (1.2s)
  ✗ hero-scene (runner, mountain) — failed: API timeout

Changes:
  + meta/summer-shoes/main/ad  (image: .assets/product-card/a1b2c3-f7e8d9.png)
  + meta/summer-shoes/story/ad  (⚠ unresolved asset)
```

## Implementation Surface

### New files

| File | Purpose |
|------|---------|
| `src/core/asset.ts` | `asset()` higher-order function, `AssetMarker` type, `resolveAssets()` tree walker, `isAssetMarker()` type guard, file hashing, managed path computation |

### Modified files

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `AssetMarker` type |
| `src/helpers/meta-creative.ts` | `image()`, `video()` accept `string \| AssetMarker` for path args |
| `src/meta/types.ts` | Widen `ImageAd.image`, `VideoAd.video`, `VideoAd.thumbnail`, `CarouselCard.image`, `CollectionAd.coverImage`, `CollectionAd.coverVideo` to `string \| AssetMarker` |
| `cli/plan.ts` | Call `resolveAssets()` within preprocessing, display asset resolution status, `--refresh-assets` flag |
| `cli/apply.ts` | Add `resolveAssets()` before flatten, `--refresh-assets` flag |
| `cli/validate.ts` | Check asset marker structure via `isAssetMarker()` |
| `cli/pull.ts` | Substitute `AssetMarker` → cached path string (no pipeline execution) |

### New test files

| File | Purpose |
|------|---------|
| `test/unit/asset.test.ts` | `asset()` wrapping, marker creation, `resolveAssets()` with mock pipelines, caching, content hash changes, error cases |

### Types

```ts
/** Options for asset pipeline behavior */
type AssetOptions = {
  move?: boolean;  // Move (delete) source file after copying to .assets/. Default: false (copy).
};

/** Marker object created by calling a wrapped pipeline */
type AssetMarker = {
  readonly __brand: "asset";
  readonly name: string;
  readonly paramsHash: string;
  readonly generate: (params: unknown) => Promise<string>;
  readonly params: unknown;
  readonly options: AssetOptions;
};

/**
 * Higher-order function: wraps a named pipeline into a typed marker factory.
 */
function asset<T>(
  name: string,
  generate: (params: T) => Promise<string>,
  options?: AssetOptions,
): (params: T) => AssetMarker;

/** Type guard for detecting markers during tree walk */
function isAssetMarker(value: unknown): value is AssetMarker;

/** Result of resolveAssets() — resolved campaigns + per-asset status */
type AssetResolution = {
  output: string;
  status: "cached" | "generated" | "failed";
  error?: string;
  durationMs?: number;
};

type ResolveResult<T> = {
  resolved: T;
  assets: AssetResolution[];
};
```

## What This Design Does NOT Do

- **No adapters or wrappers** for fal.ai, Remotion, Sharp, or any other tool
- **No multi-output from single call** — one pipeline call = one file
- **No asset library or registry** — assets are project-local files
- **No config changes** — pipelines are functions, not config entries
- **No lock file or manifest** — filesystem + content hash is the cache
- **No image validation** (dimensions, format, file size) — the ad platform rejects invalid assets at apply time
- **No automatic format conversion** — if Meta needs JPEG and your pipeline produces PNG, that's on the pipeline
- **No asset preview** — `plan` shows the path, not a thumbnail
- **No `import` round-trip** — `import` from live platforms produces concrete file paths, not `asset()` calls
- **No Google extensions support in v1** — deferred until the pattern is proven with Meta creatives
- **No asset versioning** — git tracks file history. `--refresh-assets` regenerates.
