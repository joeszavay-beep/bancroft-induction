import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isAuthorizedCron } from './_cron-auth.js'

const SECRET = 'test-cron-secret-value'
const reqWith = (headers) => ({ headers })

describe('isAuthorizedCron', () => {
  let original
  beforeEach(() => {
    original = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  // The vulnerability (AUDIT §4.4): both of these were accepted before the fix.
  it('rejects the spoofable x-vercel-cron header', () => {
    expect(isAuthorizedCron(reqWith({ 'x-vercel-cron': '1' }))).toBe(false)
  })
  it('rejects a spoofed vercel-cron user-agent', () => {
    expect(isAuthorizedCron(reqWith({ 'user-agent': 'vercel-cron/1.0' }))).toBe(false)
  })
  it('rejects a request with no auth headers', () => {
    expect(isAuthorizedCron(reqWith({}))).toBe(false)
  })

  it('accepts Vercel\'s Authorization: Bearer <CRON_SECRET> header', () => {
    expect(isAuthorizedCron(reqWith({ authorization: `Bearer ${SECRET}` }))).toBe(true)
  })
  it('accepts the manual x-cron-key header', () => {
    expect(isAuthorizedCron(reqWith({ 'x-cron-key': SECRET }))).toBe(true)
  })

  it('rejects a wrong bearer token', () => {
    expect(isAuthorizedCron(reqWith({ authorization: 'Bearer not-the-secret' }))).toBe(false)
  })
  it('rejects a wrong x-cron-key', () => {
    expect(isAuthorizedCron(reqWith({ 'x-cron-key': 'not-the-secret' }))).toBe(false)
  })

  it('fails closed when CRON_SECRET is unset, even with a bearer header', () => {
    delete process.env.CRON_SECRET
    expect(isAuthorizedCron(reqWith({ authorization: 'Bearer anything' }))).toBe(false)
  })
})
