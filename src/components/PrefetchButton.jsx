import { useState } from 'react'
import { prefetchImages } from '../lib/offlineStorage'
import { fetchAndCache } from '../hooks/useOfflineData'
import { checkStorageQuota } from '../lib/imageCompressor'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { CloudDownload, Check, Loader2 } from 'lucide-react'

/**
 * Button that prefetches all drawings and snag photos for a project
 * (or a single drawing) into offline cache.
 *
 * Props:
 *   projectId - download everything for this project
 *   drawingId - (optional) just this one drawing
 *   size - icon size (default 16)
 *   className - additional classes
 */
export default function PrefetchButton({ projectId, drawingId, size = 16, className = '' }) {
  const [status, setStatus] = useState('idle') // idle | fetching | done | error
  const [progress, setProgress] = useState('')

  async function handlePrefetch() {
    if (status === 'fetching') return
    setStatus('fetching')
    setProgress('Checking storage...')

    try {
      const quota = await checkStorageQuota()
      if (quota.percentUsed > 95) {
        toast.error(`Storage nearly full (${quota.percentUsed}%) — clear some space first`)
        setStatus('error')
        return
      }

      // Step 1: Cache drawing metadata + snag data
      setProgress('Caching data...')

      let drawings, snags
      if (drawingId) {
        drawings = await fetchAndCache('drawings', (sb) =>
          sb.from('drawings').select('*').eq('id', drawingId)
        )
        snags = await fetchAndCache('snags', (sb) =>
          sb.from('snags').select('*').eq('drawing_id', drawingId)
        )
      } else {
        drawings = await fetchAndCache('drawings', (sb) =>
          sb.from('drawings').select('*').eq('project_id', projectId)
        )
        snags = await fetchAndCache('snags', (sb) =>
          sb.from('snags').select('*').eq('project_id', projectId)
        )
      }

      const drawingList = Array.isArray(drawings) ? drawings : [drawings].filter(Boolean)
      const snagList = Array.isArray(snags) ? snags : [snags].filter(Boolean)

      // Step 2: Collect all image URLs
      const imageUrls = []

      // Drawing images
      drawingList.forEach(d => {
        if (d?.file_url) imageUrls.push(d.file_url)
      })

      // Snag photos
      snagList.forEach(s => {
        if (s?.photo_url) imageUrls.push(s.photo_url)
        if (s?.review_photo_url) imageUrls.push(s.review_photo_url)
      })

      // Also prefetch progress drawings if it's a project-level download
      if (!drawingId && projectId) {
        const progressDrawings = await fetchAndCache('progress_drawings', (sb) =>
          sb.from('progress_drawings').select('*').eq('project_id', projectId)
        )
        const pdList = Array.isArray(progressDrawings) ? progressDrawings : []
        pdList.forEach(pd => {
          if (pd?.file_url) imageUrls.push(pd.file_url)
        })

        // Progress item photos
        if (pdList.length > 0) {
          const pdIds = pdList.map(pd => pd.id)
          for (const pdId of pdIds) {
            const items = await fetchAndCache('progress_items', (sb) =>
              sb.from('progress_items').select('*').eq('drawing_id', pdId)
            )
            const itemList = Array.isArray(items) ? items : []
            itemList.forEach(i => {
              if (i?.photo_url) imageUrls.push(i.photo_url)
            })
          }
        }
      }

      if (imageUrls.length === 0) {
        setProgress('No images to cache')
        setStatus('done')
        toast.success('Data cached — no images to download')
        setTimeout(() => setStatus('idle'), 3000)
        return
      }

      // Step 3: Prefetch all images
      setProgress(`Downloading ${imageUrls.length} images...`)
      const result = await prefetchImages(imageUrls)

      setStatus('done')
      setProgress('')
      toast.success(`Cached ${result.cached} images for offline use${result.failed > 0 ? ` (${result.failed} failed)` : ''}`)
      setTimeout(() => setStatus('idle'), 5000)
    } catch (err) {
      console.error('[prefetch]', err)
      setStatus('error')
      setProgress('')
      toast.error('Failed to download for offline')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handlePrefetch}
      disabled={status === 'fetching'}
      className={`relative group ${className}`}
      title={status === 'done' ? 'Downloaded for offline' : status === 'fetching' ? progress : 'Download for offline use'}
    >
      {status === 'fetching' ? (
        <Loader2 size={size} className="animate-spin text-blue-400" />
      ) : status === 'done' ? (
        <Check size={size} className="text-green-400" />
      ) : (
        <CloudDownload size={size} />
      )}
    </button>
  )
}
