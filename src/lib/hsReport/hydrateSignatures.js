/**
 * Hydrate toolbox signature rows with pre-fetched base64 data URLs.
 *
 * - Fetches each signature URL once (in-memory cache by URL)
 * - SVGs are rasterized to PNG via offscreen canvas at 180×60
 * - PNGs/JPEGs are converted to base64 data URLs
 * - Null URLs and fetch failures → signatureDataUrl: null
 * - Failures are logged to console, never throw
 *
 * @param {Array} signatures — array of { signature_url, ...rest }
 * @returns {Promise<Array>} — same array with signatureDataUrl added
 */
export async function hydrateSignatures(signatures) {
  if (!Array.isArray(signatures) || signatures.length === 0) return signatures

  // In-memory cache: URL → data URL (or null on failure)
  const cache = new Map()

  // Collect unique non-null URLs
  const uniqueUrls = [...new Set(
    signatures
      .map(s => s.signature_url)
      .filter(url => url != null && url !== '')
  )]

  // Fetch and rasterize all unique URLs in parallel
  await Promise.all(uniqueUrls.map(async (url) => {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const contentType = resp.headers.get('content-type') || ''
      const blob = await resp.blob()

      if (contentType.includes('svg') || url.endsWith('.svg')) {
        // SVG → rasterize to PNG via offscreen canvas
        const dataUrl = await rasterizeSvg(blob)
        cache.set(url, dataUrl)
      } else {
        // PNG/JPEG → convert blob to base64 data URL
        const dataUrl = await blobToDataUrl(blob)
        cache.set(url, dataUrl)
      }
    } catch (err) {
      console.warn(`[hydrateSignatures] Failed to fetch ${url}:`, err.message)
      cache.set(url, null)
    }
  }))

  // Attach hydrated data URLs to each signature row
  return signatures.map(sig => ({
    ...sig,
    signatureDataUrl: sig.signature_url ? (cache.get(sig.signature_url) || null) : null,
  }))
}

/**
 * Rasterize an SVG blob to a PNG data URL at 180×60.
 */
function rasterizeSvg(blob) {
  return new Promise((resolve) => {
    const svgUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 180
      canvas.height = 60
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 180, 60)
      URL.revokeObjectURL(svgUrl)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      resolve(null)
    }
    img.src = svgUrl
  })
}

/**
 * Convert a Blob to a base64 data URL, downscaling images to 180×60 max.
 */
function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    // First load the image to downscale it
    const objUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 180
      canvas.height = 60
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 180, 60)
      URL.revokeObjectURL(objUrl)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      // Fallback: read blob directly without downscaling
      URL.revokeObjectURL(objUrl)
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    }
    img.src = objUrl
  })
}
