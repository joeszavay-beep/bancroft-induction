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
              // Return a fake chain that's fully Promise-compatible
              const fakeResult = Promise.resolve({ data: null, error: null })
              const fakeChain = {
                select: () => fakeChain,
                single: () => fakeResult,
                eq: () => fakeChain,
                in: () => fakeChain,
                then: (cb) => fakeResult.then(cb),
                catch: (cb) => fakeResult.catch(cb),
              }
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
