import { describe, it, expect } from 'vitest'
import { canApproveOrReject } from './_holiday-auth.js'

describe('canApproveOrReject (AUDIT §4.3)', () => {
  // The exploit: an operative (no JWT) passes operativeSessionId = request.approver_id
  // (read from the GET), so isAssignedApprover would be true via callerId === approver_id.
  // Requiring a verified JWT closes it — the no-JWT path can never reach the approver check.
  it('denies the forged-operative self-approval (no verified JWT)', () => {
    const v = canApproveOrReject({ hasVerifiedUser: false, isAssignedApprover: true, isAdmin: false, sharedHolidays: false })
    expect(v.ok).toBe(false)
    expect(v.status).toBe(401)
  })

  it('denies any caller without a verified JWT', () => {
    expect(canApproveOrReject({ hasVerifiedUser: false, isAssignedApprover: false, isAdmin: false, sharedHolidays: false }).ok).toBe(false)
  })

  it('allows the assigned approver (verified JWT)', () => {
    expect(canApproveOrReject({ hasVerifiedUser: true, isAssignedApprover: true, isAdmin: false, sharedHolidays: false })).toEqual({ ok: true })
  })

  it('allows an admin (verified JWT) who is not the assigned approver', () => {
    expect(canApproveOrReject({ hasVerifiedUser: true, isAssignedApprover: false, isAdmin: true, sharedHolidays: false })).toEqual({ ok: true })
  })

  it('denies a verified manager who is neither the approver nor an admin (shared visibility off)', () => {
    const v = canApproveOrReject({ hasVerifiedUser: true, isAssignedApprover: false, isAdmin: false, sharedHolidays: false })
    expect(v.ok).toBe(false)
    expect(v.status).toBe(403)
  })

  // PR #6 feature must be preserved: with shared-holiday visibility on, any verified
  // in-company manager can approve even if not the assigned approver.
  it('allows a verified non-approver manager when shared-holiday visibility is on', () => {
    expect(canApproveOrReject({ hasVerifiedUser: true, isAssignedApprover: false, isAdmin: false, sharedHolidays: true })).toEqual({ ok: true })
  })

  // Defensive: sharedHolidays should never be true without a JWT in practice, but the
  // JWT guard still wins if it ever were.
  it('still denies when sharedHolidays is set but there is no verified JWT', () => {
    const v = canApproveOrReject({ hasVerifiedUser: false, isAssignedApprover: false, isAdmin: false, sharedHolidays: true })
    expect(v.ok).toBe(false)
    expect(v.status).toBe(401)
  })
})
