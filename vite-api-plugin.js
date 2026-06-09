import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'

// Load .env into process.env so the serverless handlers (which read
// process.env.SUPABASE_SERVICE_ROLE_KEY etc.) work under the dev server.
dotenv.config()

const API_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/api'
const handlerCache = new Map()

/**
 * Dev-only Vite plugin: executes /api/*.js functions in-process with a
 * Vercel-compatible (req, res) adapter. The Vite dev server does NOT run
 * serverless functions (it serves them as static source), so this is required
 * for any flow that calls /api/* — and it runs the REAL handler code, so the
 * behaviour is faithful to production (bugs reproduce, auth is enforced).
 *
 * Not used in production builds (Vercel runs the functions natively).
 */
export function apiPlugin() {
  return {
    name: 'local-api-functions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        try {
          // Resolve /api/<name>[?query] -> api/<name>.js
          const url = new URL(req.originalUrl, 'http://localhost')
          const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '')
          const file = path.join(API_DIR, `${name}.js`)
          if (!name || name.startsWith('_') || !fs.existsSync(file)) return next()

          // Import the handler once and cache it. (Re-importing per request —
          // which also re-imports @supabase/supabase-js each time — is slow and
          // made API-backed tests flaky under load. Restart the dev server to
          // pick up handler edits.)
          if (!handlerCache.has(file)) handlerCache.set(file, import(file))
          const mod = await handlerCache.get(file)
          const handler = mod.default
          if (typeof handler !== 'function') return next()

          // Parse JSON body.
          let body = {}
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks = []
            for await (const c of req) chunks.push(c)
            const raw = Buffer.concat(chunks).toString('utf8')
            if (raw) {
              try { body = JSON.parse(raw) } catch { body = raw }
            }
          }

          const query = Object.fromEntries(url.searchParams.entries())

          // Vercel-style req additions.
          req.query = query
          req.body = body

          // Vercel-style res adapter.
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
            return res
          }
          res.send = (data) => {
            if (typeof data === 'object' && data !== null) return res.json(data)
            res.end(data == null ? '' : String(data))
            return res
          }

          await handler(req, res)
        } catch (err) {
          console.error('[local-api]', req.originalUrl, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message || 'Internal error' }))
          }
        }
      })
    },
  }
}
