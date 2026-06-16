/**
 * Decide whether a caller may approve or reject a holiday request.
 *
 * Approve/reject is a manager/admin action, so it REQUIRES a verified Supabase
 * JWT (hasVerifiedUser). Before this guard, the PATCH handler also honoured the
 * unauthenticated `operativeSessionId` branch, where `callerId = operativeSessionId`
 * fed straight into `isAssignedApprover = callerId === request.approver_id`. An
 * operative can read their own request's approver_id from the GET, then pass it
 * back as operativeSessionId to approve their own holiday with zero credentials.
 * See AUDIT.md §4.3.
 *
 * isAssignedApprover / isAdmin must be derived from the verified JWT identity
 * (managers/profiles IDs, profiles.role) — never from caller-supplied input.
 *
 * Returns { ok: true } or { ok: false, status, error }.
 */
export function canApproveOrReject({ hasVerifiedUser, isAssignedApprover, isAdmin, sharedHolidays }) {
  if (!hasVerifiedUser) {
    return { ok: false, status: 401, error: 'Manager authentication required to approve or reject' }
  }
  // sharedHolidays (per-company opt-in) lets any manager/admin in the request's
  // own company approve, not just the assigned approver. It is only ever true for
  // a verified in-company manager/profile (see holidays.js), so it cannot widen
  // access past the JWT guard above.
  if (!isAssignedApprover && !isAdmin && !sharedHolidays) {
    return { ok: false, status: 403, error: 'Only the assigned approver or an admin can action this request' }
  }
  return { ok: true }
}
