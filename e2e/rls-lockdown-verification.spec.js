import { test, expect } from '@playwright/test'
import { getAnonDb, getDb, getIds } from './helpers/db.js'

/**
 * POST-LOCKDOWN verification (Step 6 of RLS-REMEDIATION-PLAN.md).
 *
 * Proves the lockdown actually closed the anon hole: the public anon key (the
 * one in the JS bundle) can NO LONGER read tenant data or forge writes, while
 * the public RPCs still work so the migrated pages keep functioning.
 *
 * These assertions are intentionally FALSE before the lockdown (anon can
 * currently read everything — that's the bug), so the whole describe is SKIPPED
 * until the lockdown is applied. After running deploy4 + rls-deploy4-patches +
 * storage-lockdown in prod, run:
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

  test('anon cannot read any tenant table', async () => {
    const anon = getAnonDb()
    for (const t of TENANT_TABLES) {
      const { data, error } = await anon.from(t).select('id').limit(5)
      // Locked down = RLS denies (error) OR filters to zero rows. Never returns rows.
      const rows = error ? 0 : (data?.length ?? 0)
      expect(rows, `anon must read 0 rows from ${t} after lockdown`).toBe(0)
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
    // Defensive cleanup if the lockdown somehow let it through.
    if (inserted) await getDb().then(db => db.from('signatures').delete().eq('typed_name', 'FORGE'))
    expect(inserted, 'anon signature INSERT must be denied after lockdown').toBe(false)
  })

  test('anon cannot delete snag comments', async () => {
    const anon = getAnonDb()
    const { data, error } = await anon.from('snag_comments').delete().neq('id', '00000000-0000-0000-0000-000000000000').select()
    const deleted = !error && (data?.length ?? 0) > 0
    expect(deleted, 'anon snag_comments DELETE must be denied after lockdown').toBe(false)
  })

  test('public RPCs still work for anon (migrated pages keep functioning)', async () => {
    const anon = getAnonDb()
    const ids = await getIds()
    const { data, error } = await anon.rpc('get_project_public_info', { p_id: ids.projectId })
    expect(error, 'get_project_public_info must not error for anon').toBeFalsy()
    expect(data?.name, 'public project RPC should still return the project name').toBeTruthy()
  })
})
