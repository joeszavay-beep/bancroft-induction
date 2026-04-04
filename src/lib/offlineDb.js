import { openDB } from 'idb'

const DB_NAME = 'coresite-offline'
const DB_VERSION = 1

let dbPromise = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Sync queue — pending mutations to push to Supabase
        if (!db.objectStoreNames.contains('syncQueue')) {
          const sq = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
          sq.createIndex('status', 'status')
          sq.createIndex('table', 'table')
          sq.createIndex('createdAt', 'createdAt')
        }

        // Cached data stores — mirror Supabase tables
        const stores = [
          { name: 'projects', indexes: ['company_id'] },
          { name: 'operatives', indexes: ['project_id', 'company_id'] },
          { name: 'drawings', indexes: ['project_id'] },
          { name: 'snags', indexes: ['drawing_id', 'project_id', 'status'] },
          { name: 'snag_comments', indexes: ['snag_id'] },
          { name: 'progress_drawings', indexes: ['project_id'] },
          { name: 'progress_items', indexes: ['drawing_id'] },
          { name: 'toolbox_talks', indexes: ['project_id'] },
          { name: 'toolbox_signatures', indexes: ['talk_id'] },
          { name: 'documents', indexes: ['project_id'] },
          { name: 'signatures', indexes: ['operative_id', 'document_id'] },
        ]

        for (const { name, indexes } of stores) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' })
            for (const idx of indexes) {
              store.createIndex(idx, idx)
            }
          }
        }

        // Blob cache — photos and drawings stored as ArrayBuffer
        if (!db.objectStoreNames.contains('blobCache')) {
          db.createObjectStore('blobCache', { keyPath: 'key' })
        }

        // Auth cache — session, user profile, company data
        if (!db.objectStoreNames.contains('authCache')) {
          db.createObjectStore('authCache', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

// Generic CRUD helpers

export async function putRecord(storeName, record) {
  const db = await getDb()
  return db.put(storeName, record)
}

export async function putRecords(storeName, records) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  for (const record of records) {
    tx.store.put(record)
  }
  await tx.done
}

export async function getRecord(storeName, id) {
  const db = await getDb()
  return db.get(storeName, id)
}

export async function getAllRecords(storeName) {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function getByIndex(storeName, indexName, value) {
  const db = await getDb()
  return db.getAllFromIndex(storeName, indexName, value)
}

export async function deleteRecord(storeName, id) {
  const db = await getDb()
  return db.delete(storeName, id)
}

export async function clearStore(storeName) {
  const db = await getDb()
  return db.clear(storeName)
}

// Sync queue helpers

export async function enqueueMutation(mutation) {
  const db = await getDb()
  return db.add('syncQueue', {
    ...mutation,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  })
}

export async function getPendingMutations() {
  const db = await getDb()
  return db.getAllFromIndex('syncQueue', 'status', 'pending')
}

export async function updateMutationStatus(id, status) {
  const db = await getDb()
  const record = await db.get('syncQueue', id)
  if (record) {
    record.status = status
    if (status === 'failed') record.retryCount = (record.retryCount || 0) + 1
    await db.put('syncQueue', record)
  }
}

export async function clearCompletedMutations() {
  const db = await getDb()
  const tx = db.transaction('syncQueue', 'readwrite')
  const all = await tx.store.getAll()
  for (const record of all) {
    if (record.status === 'done') {
      await tx.store.delete(record.id)
    }
  }
  await tx.done
}

// Auth cache helpers

export async function cacheAuth(key, value) {
  const db = await getDb()
  return db.put('authCache', { key, value, updatedAt: Date.now() })
}

export async function getCachedAuth(key) {
  const db = await getDb()
  const record = await db.get('authCache', key)
  return record?.value || null
}

// Blob cache helpers

export async function cacheBlob(key, arrayBuffer, metadata = {}) {
  const db = await getDb()
  return db.put('blobCache', { key, data: arrayBuffer, ...metadata, cachedAt: Date.now() })
}

export async function getCachedBlob(key) {
  const db = await getDb()
  const record = await db.get('blobCache', key)
  return record?.data || null
}

export async function deleteBlob(key) {
  const db = await getDb()
  return db.delete('blobCache', key)
}
