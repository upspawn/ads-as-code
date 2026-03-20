import { describe, test, expect, mock } from 'bun:test'
import type { RedditClient } from '../../src/reddit/api'

function mockClient(uploadResponse: Record<string, unknown> = {}): RedditClient {
  return {
    get: mock(async () => ({})) as unknown as RedditClient['get'],
    post: mock(async () => ({})) as unknown as RedditClient['post'],
    put: mock(async () => ({})) as unknown as RedditClient['put'],
    delete: mock(async () => ({})) as unknown as RedditClient['delete'],
    fetchAll: mock(async () => []) as unknown as RedditClient['fetchAll'],
    upload: mock(async () => uploadResponse) as unknown as RedditClient['upload'],
  }
}

describe('uploadRedditMedia', () => {
  test('uploads file and returns asset ID', async () => {
    const { uploadRedditMedia } = await import('../../src/reddit/upload')

    const client = mockClient({
      asset: { asset_id: 'media_abc123', url: 'https://reddit.com/media/abc123' },
    })

    // Use a known file for testing — the module itself is a small readable file
    const result = await uploadRedditMedia(
      import.meta.dir + '/reddit-upload.test.ts',
      't2_testaccount',
      client,
    )

    expect(result.assetId).toBe('media_abc123')
    expect(result.url).toBe('https://reddit.com/media/abc123')

    const uploadCalls = (client.upload as ReturnType<typeof mock>).mock.calls
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]![0]).toContain('accounts/t2_testaccount')
    expect(uploadCalls[0]![0]).toContain('media')
  })

  test('throws on upload failure (no asset in response)', async () => {
    const { uploadRedditMedia } = await import('../../src/reddit/upload')

    const client = mockClient({}) // empty response

    await expect(
      uploadRedditMedia(
        import.meta.dir + '/reddit-upload.test.ts',
        't2_testaccount',
        client,
      ),
    ).rejects.toThrow('upload failed')
  })

  test('throws when file does not exist', async () => {
    const { uploadRedditMedia } = await import('../../src/reddit/upload')

    const client = mockClient({
      asset: { asset_id: 'a1', url: 'https://example.com' },
    })

    await expect(
      uploadRedditMedia(
        '/nonexistent/path/to/file.jpg',
        't2_testaccount',
        client,
      ),
    ).rejects.toThrow()
  })

  test('throws when response has asset but no asset_id', async () => {
    const { uploadRedditMedia } = await import('../../src/reddit/upload')

    // asset object present but asset_id is missing
    const client = mockClient({ asset: { url: 'https://reddit.com/media/abc' } })

    await expect(
      uploadRedditMedia(
        import.meta.dir + '/reddit-upload.test.ts',
        't2_testaccount',
        client,
      ),
    ).rejects.toThrow('upload failed')
  })

  test('returns empty string url when response asset has asset_id but no url', async () => {
    const { uploadRedditMedia } = await import('../../src/reddit/upload')

    const client = mockClient({ asset: { asset_id: 'media_xyz' } })

    const result = await uploadRedditMedia(
      import.meta.dir + '/reddit-upload.test.ts',
      't2_testaccount',
      client,
    )

    expect(result.assetId).toBe('media_xyz')
    expect(result.url).toBe('')
  })
})
