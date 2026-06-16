import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Returns false on any type/length mismatch.
 * (Both operands here are server-controlled secrets / caller-supplied tokens,
 * so the early length check leaks nothing useful.)
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Authorise a cron invocation against CRON_SECRET.
 *
 * Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}` to
 * scheduled paths when the CRON_SECRET env var is set. A manual trigger may
 * instead pass the same secret in the `x-cron-key` header. Both are verified
 * with a constant-time comparison.
 *
 * Fails closed: returns false when CRON_SECRET is unset, so a misconfigured
 * deployment refuses cron work rather than running it unauthenticated.
 *
 * The previous `x-vercel-cron` header / `vercel-cron` user-agent checks were
 * removed: both are fully attacker-controlled, so anyone could invoke these
 * endpoints (forge attendance sign-outs, spam operatives, mutate snags).
 * See AUDIT.md §4.4.
 */
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = req.headers?.authorization
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (typeof auth === 'string' && auth.startsWith('Bearer ') && safeEqual(auth.slice(7), secret)) {
    return true
  }

  const keyHeader = req.headers?.['x-cron-key']
  const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader
  return safeEqual(key, secret)
}
