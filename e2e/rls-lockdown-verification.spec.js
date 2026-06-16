import { test, expect } from '@playwright/test'
import { getAnonDb, getDb, getIds } from './helpers/db.js'

/**
 * POST-LOCKDOWN verification (Step 6 of RLS-REMEDIATION-PLAN.md).
 *
 * Proves the lockdown actually closed the anon hole: the public anon key (the
 * one in the JS bundle) can NO LONGER read tenant data or forge/delete rows,
 * while the public RPCs still work so the migrated pages keep functioning.
 *
 * These assertions are intentionally FALSE before the lockdown (anon can
 * currently read everything — that's the bug), so the whole describe is SKIPPED
 * until the lockdown is applied. After running storage-lockdown + deploy4 +
 * rls-deploy4-patches in prod, run:
 *
 *     RLS_LOCKDOWN_APPLIED=1 npm run test:e2e
 *
 * and this becomes the regression gate confirming anon is denied.
 */
const LOCKED = process.env.RLS_LOCKDOWN_APPLIED === '1'

test.describe('RLS lockdown verification (post-lockdown only)', () => {
  test.skip(!LOCKED, 'enable with RLS_LOCKDOWN_APPLIED=1 after applying the lockdown')

  const TENANT_TABLES = [
    'operatives', 'signatures', 'projects', 'site_attendance', 'documents',
    'snags', 'snag_comments', 'chat_messages', 'toolbox_talks', 'toolbox_signatures',
    'holiday_requests', 'profiles', 'notifications', 'pending_email_changes',
    'agency_operatives', 'sub_invoices',
  ]

  test('anon reads zero rows from every tenant table (and the table still exists)', async () => {
    const anon = getAnonDb()
    for (const t of TENANT_TABLES) {
      const { data, error } = await anon.from(t).select('id').limit(5)
      // Post-lockdown, RLS FILTERS anon SELECTs to zero rows — it does NOT error.
      // An actual error means schema drift / a renamed table (the table list is
      // stale) — fail loudly rather than silently pass on a missing relation.
      expect(error, `anon SELECT ${t} should not error (RLS filters rows; an error means schema drift)`).toBeFalsy()
      expect(data?.length ?? 0, `anon must read 0 rows from ${t} after lockdown`).toBe(0)
    }
  })

  test('anon cannot forge a signature', async () => {
    const anon = getAnonDb()
    const ids = await getIds()
    const { data, error } = await anon.from('signatures').insert({
      operative_id: ids.operativeId, document_id: ids.documentId, project_id: ids.projectId,
      company_id: ids.companyId, operative_name: 'FORGE', document_title: 'FORGE', typed_name: 'FORGE',
    }).select()
    const inserted = !error && (data?.length ?? 0) > 0
    if (inserted) { const db = await getDb(); await db.from('signatures').delete().eq('typed_name', 'FORGE') }
    expect(inserted, 'anon signature INSERT must be denied after lockdown').toBe(false)
  })

  test('anon cannot delete a targeted snag comment', async () => {
    // Seed a known comment as the authenticated test user, then prove anon
    // cannot delete THAT specific row — a delete returning 0 rows is meaningless
    // unless we know a real, targetable row existed and survived.
    const db = await getDb()
    const ids = await getIds()
    const { data: snag, error: se } = await db.from('snags').insert({
      drawing_id: ids.drawingId, project_id: ids.projectId, company_id: ids.companyId,
      description: 'LOCKDOWN-VERIFY', status: 'open', snag_number: 99500, pin_x: 50, pin_y: 50,
    }).select('id').single()
    if (se) throw new Error('verify snag seed failed: ' + se.message)
    const { data: cmt } = await db.from('snag_comments').insert({
      snag_id: snag.id, company_id: ids.companyId, comment: 'protected', author_name: 'verify', author_role: 'verify',
    }).select('id').single()
    try {
      const anon = getAnonDb()
      await anon.from('snag_comments').delete().eq('id', cmt.id)
      const { data: still } = await db.from('snag_comments').select('id').eq('id', cmt.id).maybeSingle()
      expect(still, 'anon must NOT be able to delete a targeted snag comment').not.toBeNull()
    } finally {
      await db.from('snag_comments').delete().eq('snag_id', snag.id)
      await db.from('snags').delete().eq('id', snag.id)
    }
  })

  test('public RPCs still work for anon (migrated pages keep functioning)', async () => {
    const anon = getAnonDb()
    const ids = await getIds()
    const { data, error } = await anon.rpc('get_project_public_info', { p_id: ids.projectId })
    expect(error, 'get_project_public_info must not error for anon').toBeFalsy()
    expect(data?.name, 'public project RPC should still return the project name').toBeTruthy()
  })
})
