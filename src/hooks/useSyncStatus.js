import { useState, useEffect } from 'react'
import { onSyncChange } from '../lib/syncEngine'
import { getPendingMutations } from '../lib/offlineDb'

export function useSyncStatus() {
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    // Get initial count
    getPendingMutations().then(m => setPendingCount(m.length)).catch(() => {})

    // Subscribe to sync changes
    const unsub = onSyncChange(({ syncing: s, pendingCount: c }) => {
      setSyncing(s)
      if (c >= 0) setPendingCount(c)
    })

    return unsub
  }, [])

  return { syncing, pendingCount }
}
