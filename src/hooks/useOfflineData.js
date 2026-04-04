import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { putRecords, getAllRecords, getByIndex } from '../lib/offlineDb'

/**
 * Hook that reads from IndexedDB first, then refreshes from Supabase.
 * When offline, returns cached data seamlessly.
 *
 * Usage:
 *   const { data, loading } = useOfflineData('snags', {
 *     filter: { drawing_id: drawingId },
 *     order: { column: 'snag_number' },
 *     single: false,
 *   })
 *
 * Or for a single record:
 *   const { data, loading } = useOfflineData('projects', {
 *     match: { id: projectId },
 *     single: true,
 *   })
 */
export function useOfflineData(table, options = {}) {
  const { filter, match, order, single, enabled = true } = options
  const [data, setData] = useState(single ? null : [])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (enabled) loadData()
    return () => { mountedRef.current = false }
  }, [table, JSON.stringify(filter), JSON.stringify(match), enabled])

  async function loadData() {
    setLoading(true)

    // Step 1: Load from IDB cache instantly
    try {
      let cached
      const filterKey = filter ? Object.keys(filter)[0] : null
      const filterVal = filter ? filter[filterKey] : null

      if (match?.id) {
        // Single record by ID — use getByIndex or getAll and filter
        const all = await getAllRecords(table)
        cached = all.find(r => r.id === match.id) || null
      } else if (filterKey && filterVal) {
        cached = await getByIndex(table, filterKey, filterVal)
      } else {
        cached = await getAllRecords(table)
      }

      if (mountedRef.current && cached) {
        if (single) {
          setData(Array.isArray(cached) ? cached[0] || null : cached)
        } else {
          let arr = Array.isArray(cached) ? cached : [cached]
          if (order?.column) {
            arr = sortArray(arr, order.column, order.ascending)
          }
          setData(arr)
        }
      }
    } catch (err) {
      // IDB might not have data yet, that's fine
    }

    // Step 2: Refresh from Supabase (if online)
    if (!navigator.onLine) {
      if (mountedRef.current) setLoading(false)
      return
    }

    try {
      let query = supabase.from(table).select('*')

      if (match) {
        for (const [key, val] of Object.entries(match)) {
          query = query.eq(key, val)
        }
      }
      if (filter) {
        for (const [key, val] of Object.entries(filter)) {
          query = query.eq(key, val)
        }
      }
      if (order?.column) {
        query = query.order(order.column, { ascending: order.ascending ?? true })
      }
      if (single) {
        query = query.single()
      }

      const { data: fresh, error } = await query
      if (error) throw error

      if (mountedRef.current && fresh !== null && fresh !== undefined) {
        setData(fresh)
        // Cache the fresh data in IDB
        const toCache = Array.isArray(fresh) ? fresh : [fresh]
        if (toCache.length > 0 && toCache[0]?.id) {
          await putRecords(table, toCache).catch(() => {})
        }
      }
    } catch (err) {
      // Network failed — we already have IDB data, so just use that
      console.log(`[offline] Using cached ${table} data`)
    }

    if (mountedRef.current) setLoading(false)
  }

  async function refresh() {
    await loadData()
  }

  return { data, loading, refresh }
}

/**
 * Imperative function to fetch + cache data outside of a hook.
 * Use this inside existing loadData() functions.
 */
export async function fetchAndCache(table, queryFn) {
  // Try IDB first
  let cached = null
  try {
    cached = await getAllRecords(table)
  } catch {}

  // If offline, return cached
  if (!navigator.onLine) {
    return cached || []
  }

  // Fetch from Supabase
  try {
    const result = await queryFn(supabase)
    const fresh = result.data
    if (fresh) {
      const toCache = Array.isArray(fresh) ? fresh : [fresh]
      if (toCache.length > 0 && toCache[0]?.id) {
        await putRecords(table, toCache).catch(() => {})
      }
    }
    return fresh
  } catch {
    return cached || []
  }
}

function sortArray(arr, column, ascending = true) {
  return [...arr].sort((a, b) => {
    const av = a[column], bv = b[column]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return ascending ? cmp : -cmp
  })
}
