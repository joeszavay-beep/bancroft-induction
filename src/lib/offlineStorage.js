import { cacheBlob, getCachedBlob } from './offlineDb'

/**
 * Fetches an image URL and caches it in IndexedDB as an ArrayBuffer.
 * Returns a blob: URL that works offline.
 * If already cached, returns from cache without network.
 */
export async function getCachedImageUrl(url) {
  if (!url) return null

  const cacheKey = `img_${hashUrl(url)}`

  // Check IDB cache first
  try {
    const cached = await getCachedBlob(cacheKey)
    if (cached) {
      const blob = new Blob([cached])
      return URL.createObjectURL(blob)
    }
  } catch {}

  // Not cached — fetch and store (only if online)
  if (!navigator.onLine) return url // fall back to original URL (SW might have it)

  try {
    const response = await fetch(url)
    if (!response.ok) return url

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    await cacheBlob(cacheKey, arrayBuffer, { contentType, originalUrl: url })

    const blob = new Blob([arrayBuffer], { type: contentType })
    return URL.createObjectURL(blob)
  } catch {
    return url // network failed, use original URL
  }
}

/**
 * Pre-fetches and caches multiple image URLs in background.
 * Useful for "download for offline" feature.
 */
export async function prefetchImages(urls) {
  const results = { cached: 0, failed: 0 }

  for (const url of urls) {
    if (!url) continue
    try {
      const cacheKey = `img_${hashUrl(url)}`
      const existing = await getCachedBlob(cacheKey)
      if (existing) { results.cached++; continue }

      const response = await fetch(url)
      if (!response.ok) { results.failed++; continue }

      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      await cacheBlob(cacheKey, arrayBuffer, { contentType, originalUrl: url })
      results.cached++
    } catch {
      results.failed++
    }
  }

  return results
}

/**
 * Simple hash function for cache keys (not cryptographic, just for dedup).
 */
function hashUrl(url) {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
