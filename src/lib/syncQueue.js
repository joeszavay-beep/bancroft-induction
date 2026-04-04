import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabase'
import { enqueueMutation, putRecord, deleteRecord as deleteIdbRecord } from './offlineDb'
import { cacheBlob } from './offlineDb'

/**
 * Wraps a Supabase insert. If online, executes immediately. If offline,
 * queues the mutation and applies it optimistically to IDB.
 *
 * Returns { data, offline } — data is the inserted record (real or optimistic),
 * offline is true if it was queued.
 */
export async function offlineInsert(table, record, options = {}) {
  const { fileUpload } = options // { bucket, path, blob, contentType }
  const clientId = uuidv4()
  const optimisticId = record.id || clientId

  // Build the full record with a client-generated ID
  const fullRecord = { ...record, id: optimisticId, _clientId: clientId }

  if (navigator.onLine) {
    try {
      // Handle file upload first if present
      let fileUrl = null
      if (fileUpload) {
        const { error: upErr } = await supabase.storage
          .from(fileUpload.bucket)
          .upload(fileUpload.path, fileUpload.blob, { contentType: fileUpload.contentType })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from(fileUpload.bucket).getPublicUrl(fileUpload.path)
        fileUrl = urlData.publicUrl
      }

      // Apply file URL to record if applicable
      const insertRecord = { ...record }
      if (fileUrl && fileUpload.field) {
        insertRecord[fileUpload.field] = fileUrl
      }
      delete insertRecord._clientId

      const { data, error } = await supabase.from(table).insert(insertRecord).select().single()
      if (error) throw error

      // Cache to IDB
      await putRecord(table, data).catch(() => {})
      return { data, offline: false }
    } catch (err) {
      // Network failed mid-request — fall through to offline queue
      console.log(`[sync] Online insert failed, queueing: ${err.message}`)
    }
  }

  // Offline path: cache blob if file upload, queue mutation
  let fileUploadMeta = null
  if (fileUpload?.blob) {
    const blobKey = `blob_${clientId}`
    const arrayBuffer = fileUpload.blob instanceof ArrayBuffer
      ? fileUpload.blob
      : await fileUpload.blob.arrayBuffer()
    await cacheBlob(blobKey, arrayBuffer, { contentType: fileUpload.contentType })
    fileUploadMeta = {
      bucket: fileUpload.bucket,
      path: fileUpload.path,
      blobKey,
      contentType: fileUpload.contentType,
      field: fileUpload.field,
    }
  }

  // Save optimistic record to IDB
  const optimistic = { ...fullRecord, _pending: true }
  delete optimistic._clientId
  await putRecord(table, optimistic).catch(() => {})

  // Queue the mutation
  await enqueueMutation({
    table,
    operation: 'insert',
    payload: fullRecord,
    fileUpload: fileUploadMeta,
    clientId,
  })

  return { data: optimistic, offline: true }
}

/**
 * Wraps a Supabase update. If online, executes immediately. If offline, queues.
 */
export async function offlineUpdate(table, id, updates) {
  const clientId = uuidv4()
  const fullUpdates = { ...updates, updated_at: new Date().toISOString() }

  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from(table).update(fullUpdates).eq('id', id).select().single()
      if (error) throw error
      await putRecord(table, data).catch(() => {})
      return { data, offline: false }
    } catch (err) {
      console.log(`[sync] Online update failed, queueing: ${err.message}`)
    }
  }

  // Offline: apply optimistically to IDB
  const { getRecord } = await import('./offlineDb')
  const existing = await getRecord(table, id)
  if (existing) {
    await putRecord(table, { ...existing, ...fullUpdates, _pending: true }).catch(() => {})
  }

  await enqueueMutation({
    table,
    operation: 'update',
    payload: { id, ...fullUpdates },
    clientId,
  })

  return { data: { id, ...fullUpdates }, offline: true }
}

/**
 * Wraps a Supabase delete. If online, executes immediately. If offline, queues.
 */
export async function offlineDelete(table, id) {
  if (navigator.onLine) {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      await deleteIdbRecord(table, id).catch(() => {})
      return { offline: false }
    } catch (err) {
      console.log(`[sync] Online delete failed, queueing: ${err.message}`)
    }
  }

  await deleteIdbRecord(table, id).catch(() => {})
  await enqueueMutation({
    table,
    operation: 'delete',
    payload: { id },
    clientId: uuidv4(),
  })

  return { offline: true }
}
