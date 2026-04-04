import { supabase } from './supabase'
import {
  getPendingMutations,
  updateMutationStatus,
  clearCompletedMutations,
  getCachedBlob,
  deleteBlob,
  putRecord,
} from './offlineDb'

let syncing = false
let listeners = new Set()

/**
 * Subscribe to sync status changes.
 * Callback receives { syncing: boolean, pendingCount: number }
 */
export function onSyncChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyListeners(status) {
  listeners.forEach(fn => fn(status))
}

/**
 * Process all pending mutations in FIFO order.
 * Called when connectivity returns or manually triggered.
 */
export async function processQueue() {
  if (syncing || !navigator.onLine) return
  syncing = true

  try {
    const pending = await getPendingMutations()
    notifyListeners({ syncing: true, pendingCount: pending.length })

    if (pending.length === 0) {
      notifyListeners({ syncing: false, pendingCount: 0 })
      syncing = false
      return
    }

    let processed = 0

    for (const mutation of pending) {
      if (!navigator.onLine) break // lost connection mid-sync

      try {
        await updateMutationStatus(mutation.id, 'syncing')
        await processMutation(mutation)
        await updateMutationStatus(mutation.id, 'done')
        processed++
        notifyListeners({ syncing: true, pendingCount: pending.length - processed })
      } catch (err) {
        console.error(`[sync] Failed to process mutation ${mutation.id}:`, err)
        await updateMutationStatus(mutation.id, 'failed')

        // Skip after 3 retries
        if ((mutation.retryCount || 0) >= 3) {
          console.warn(`[sync] Mutation ${mutation.id} failed 3 times, marking as done (dropped)`)
          await updateMutationStatus(mutation.id, 'done')
        }
      }
    }

    // Clean up completed mutations
    await clearCompletedMutations()
    notifyListeners({ syncing: false, pendingCount: 0 })
  } catch (err) {
    console.error('[sync] Queue processing error:', err)
    notifyListeners({ syncing: false, pendingCount: -1 })
  }

  syncing = false
}

async function processMutation(mutation) {
  const { table, operation, payload, fileUpload } = mutation

  if (operation === 'insert') {
    // Upload file first if there's a pending blob
    let fileUrl = null
    if (fileUpload?.blobKey) {
      const blobData = await getCachedBlob(fileUpload.blobKey)
      if (blobData) {
        const blob = new Blob([blobData], { type: fileUpload.contentType || 'application/octet-stream' })
        const { error: upErr } = await supabase.storage
          .from(fileUpload.bucket)
          .upload(fileUpload.path, blob, { contentType: fileUpload.contentType })
        if (upErr && !upErr.message?.includes('already exists')) throw upErr

        const { data: urlData } = supabase.storage.from(fileUpload.bucket).getPublicUrl(fileUpload.path)
        fileUrl = urlData.publicUrl
        await deleteBlob(fileUpload.blobKey).catch(() => {})
      }
    }

    // Clean payload — remove client-side fields
    const insertPayload = { ...payload }
    delete insertPayload._clientId
    delete insertPayload._pending
    // Apply file URL
    if (fileUrl && fileUpload?.field) {
      insertPayload[fileUpload.field] = fileUrl
    }
    // Remove the client-generated ID so Supabase generates a real one
    const clientId = insertPayload.id
    delete insertPayload.id

    const { data, error } = await supabase.from(table).insert(insertPayload).select().single()
    if (error) throw error

    // Update IDB: remove the optimistic record, store the real one
    if (clientId) {
      const { deleteRecord } = await import('./offlineDb')
      await deleteRecord(table, clientId).catch(() => {})
    }
    if (data) {
      await putRecord(table, data).catch(() => {})
    }

    return data
  }

  if (operation === 'update') {
    const { id, ...updates } = payload
    delete updates._clientId
    delete updates._pending

    // Handle file upload if present (e.g. photo added to snag while offline)
    let fileUrl = null
    if (fileUpload?.blobKey) {
      const blobData = await getCachedBlob(fileUpload.blobKey)
      if (blobData) {
        const blob = new Blob([blobData], { type: fileUpload.contentType || 'application/octet-stream' })
        const { error: upErr } = await supabase.storage
          .from(fileUpload.bucket)
          .upload(fileUpload.path, blob, { contentType: fileUpload.contentType })
        if (upErr && !upErr.message?.includes('already exists')) throw upErr

        const { data: urlData } = supabase.storage.from(fileUpload.bucket).getPublicUrl(fileUpload.path)
        fileUrl = urlData.publicUrl
        await deleteBlob(fileUpload.blobKey).catch(() => {})
      }
    }

    // Apply file URL to updates
    if (fileUrl && fileUpload?.field) {
      updates[fileUpload.field] = fileUrl
    }

    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single()
    if (error) throw error

    // Update IDB with server response
    if (data) {
      await putRecord(table, data).catch(() => {})
    }

    return data
  }

  if (operation === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', payload.id)
    if (error && !error.message?.includes('not found')) throw error
    return null
  }
}

/**
 * Start listening for online events to trigger sync.
 */
export function startSyncListener() {
  window.addEventListener('online', () => {
    console.log('[sync] Back online — processing queue...')
    // Small delay to let the connection stabilize
    setTimeout(() => processQueue(), 1500)
  })

  // Also process on startup if there are pending items
  if (navigator.onLine) {
    setTimeout(() => processQueue(), 3000)
  }
}
