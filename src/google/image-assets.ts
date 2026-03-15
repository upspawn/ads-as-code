import type { MutateOperation } from './types.ts'

// ─── Image Reference Types ──────────────────────────────

export type ImageAspectRatio = 'landscape' | 'square' | 'portrait' | 'logo' | 'logo-landscape'

export type ImageRef = {
  readonly type: 'image-ref'
  readonly path: string
  readonly aspectRatio: ImageAspectRatio
}

/** Create a landscape (1.91:1) image reference */
export function landscape(path: string): ImageRef {
  return { type: 'image-ref', path, aspectRatio: 'landscape' }
}

/** Create a square (1:1) image reference */
export function square(path: string): ImageRef {
  return { type: 'image-ref', path, aspectRatio: 'square' }
}

/** Create a portrait (4:5) image reference */
export function portrait(path: string): ImageRef {
  return { type: 'image-ref', path, aspectRatio: 'portrait' }
}

/** Create a logo image reference (square 1:1) */
export function logo(path: string): ImageRef {
  return { type: 'image-ref', path, aspectRatio: 'logo' }
}

/** Create a landscape logo reference (4:1) */
export function logoLandscape(path: string): ImageRef {
  return { type: 'image-ref', path, aspectRatio: 'logo-landscape' }
}

// ─── MIME Type Detection ────────────────────────────────

const MIME_TYPE_MAP: Record<string, number> = {
  'jpg': 1,   // JPEG
  'jpeg': 1,  // JPEG
  'png': 3,   // PNG
  'gif': 2,   // GIF
}

/** Detect Google Ads image MIME type enum from file extension. Defaults to PNG. */
export function detectMimeType(filePath: string): number {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return MIME_TYPE_MAP[ext] ?? 3
}

// ─── Batch Mutation Builder ─────────────────────────────

/**
 * Build an image asset create mutation for batched operations.
 * Does NOT execute -- returns the mutation for inclusion in a batch.
 */
export function buildImageAssetCreate(
  customerId: string,
  tempId: string,
  imageData: string,
  fileSize: number,
  mimeType: number,
  name: string,
): MutateOperation {
  return {
    operation: 'asset',
    op: 'create',
    resource: {
      resource_name: `customers/${customerId}/assets/${tempId}`,
      name,
      type: 4, // IMAGE
      image_asset: {
        data: imageData,
        file_size: fileSize,
        mime_type: mimeType,
      },
    },
  }
}
