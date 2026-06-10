import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

const realSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

function isDemo() {
  return sessionStorage.getItem('sandbox_mode') === 'true'
}

function showDemoToast() {
  toast('This is a demo — request your own account to save changes', {
    icon: '👁️',
    style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #93C5FD' },
    duration: 3000,
    id: 'demo-block', // prevent duplicate toasts
  })
}

// Proxy that intercepts write operations in demo mode
const handler = {
  get(target, prop) {
    if (prop === 'from') {
      return (table) => {
        const chain = target.from(table)
        return new Proxy(chain, {
          get(chainTarget, chainProp) {
            // Block insert/update/delete/upsert in demo mode
            if (['insert', 'update', 'delete', 'upsert'].includes(chainProp) && isDemo()) {
              showDemoToast()
              // Fake chain: resolves a success-shaped result (the demo is meant to
              // look like it works) but must be Promise-compatible AND cover every
              // builder method real code chains, or those paths throw
              // "x is not a function" mid-demo (AUDIT §1.5). The leak that made this
              // dangerous for REAL users is closed separately by clearing
              // sandbox_mode on any non-demo sign-in (AUDIT §1.6).
              const fakeResult = Promise.resolve({ data: null, error: null })
              const fakeChain = {}
              // Builder methods return the chain (allow further chaining).
              for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'filter', 'match',
                'order', 'limit', 'range', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'contains',
                'overlaps', 'returns']) {
                fakeChain[m] = () => fakeChain
              }
              // Terminal methods resolve the result.
              fakeChain.single = () => fakeResult
              fakeChain.maybeSingle = () => fakeResult
              fakeChain.csv = () => fakeResult
              fakeChain.then = (cb) => fakeResult.then(cb)
              fakeChain.catch = (cb) => fakeResult.catch(cb)
              fakeChain.finally = (cb) => fakeResult.finally(cb)
              return () => fakeChain
            }
            return chainTarget[chainProp]
          },
        })
      }
    }
    // Storage uploads also blocked in demo
    if (prop === 'storage' && isDemo()) {
      return new Proxy(target.storage, {
        get(storageTarget, storageProp) {
          if (storageProp === 'from') {
            return (bucket) => {
              const bucketChain = storageTarget.from(bucket)
              return new Proxy(bucketChain, {
                get(bucketTarget, bucketProp) {
                  if (['upload', 'remove'].includes(bucketProp)) {
                    showDemoToast()
                    return () => Promise.resolve({ data: null, error: null })
                  }
                  return bucketTarget[bucketProp]
                },
              })
            }
          }
          return storageTarget[storageProp]
        },
      })
    }
    return target[prop]
  },
}

export const supabase = new Proxy(realSupabase, handler)
