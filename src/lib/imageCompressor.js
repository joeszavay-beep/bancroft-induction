/**
 * Compresses an image file/blob to a target max dimension and JPEG quality.
 * Returns a compressed Blob.
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.7,
    type = 'image/jpeg',
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img

      // Calculate scaled dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas toBlob failed'))
          }
        },
        type,
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for compression'))
    }

    img.src = url
  })
}

/**
 * Check storage quota and return whether we should compress aggressively.
 * Returns { shouldCompress, usage, quota, percentUsed }
 */
export async function checkStorageQuota() {
  if (!navigator.storage?.estimate) {
    return { shouldCompress: false, usage: 0, quota: 0, percentUsed: 0 }
  }

  try {
    const { usage, quota } = await navigator.storage.estimate()
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0
    return {
      shouldCompress: percentUsed > 80,
      usage,
      quota,
      percentUsed: Math.round(percentUsed),
    }
  } catch {
    return { shouldCompress: false, usage: 0, quota: 0, percentUsed: 0 }
  }
}

/**
 * Smart compress — uses aggressive settings if storage is getting full,
 * otherwise uses standard settings.
 */
export async function smartCompress(file) {
  const { shouldCompress } = await checkStorageQuota()

  if (shouldCompress) {
    // Aggressive compression when storage is filling up
    return compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.5 })
  }

  // Standard compression for offline storage
  return compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.7 })
}
