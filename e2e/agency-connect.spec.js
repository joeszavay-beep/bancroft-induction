import { test, expect } from '@playwright/test'
import { getDb, getAnonDb, getIds } from './helpers/db.js'
import { getAdmin } from './helpers/operatives.js'
import {
  createDisposableAgency, deleteDisposableAgency, sweepDisposableAgencies,
} from './helpers/agencies.js'

/**
 * §5.7c [BLOCKING GATE] — Agency search + connect in the LOCKED state.
 *
 * The 2026-06-15 lockdown re-scoped `agencies` from USING(true) to own/connected
 * (rls-deploy4-patches.sql) and moved marketplace discovery to the SECURITY
 * DEFINER `search_agencies` RPC (rls-deploy3b-public-rpcs.sql). That flow shipped
 * with ZERO coverage and could not be hand-tested (no agency in prod). This spec
 * walks it end to end against the live locked DB, signed in as the existing E2E
 * Test Co admin (the connecting company), using a disposable agency it cleans up.
 *
 * Targeted risks (see AUDIT §5.7c):
 *   R2 — the connect upsert's onConflict:'company_id,agency_id' needs a UNIQUE
 *        constraint that is in NO committed schema; if absent in prod the upsert
 *        throws. Asserted by the connect test.
 *   R3 — the connection must be readable back by its own creator under ac_select
 *        (a §5.16-style "saved but invisible" regression would fail here).
 *   R4 — prod must match the repo SQL: anon is denied search_agencies; pending
 *        agencies are hidden; connected scoping actually opens the agency + roster.
 *
 * Skipped until the lockdown is applied (it already is in prod):
 *     RLS_LOCKDOWN_APPLIED=1 npm run test:e2e
 */
const LOCKED = process.env.RLS_LOCKDOWN_APPLIED === '1'

test.describe.serial('§5.7c agency search + connect (post-lockdown only)', () => {
  test.skip(!LOCKED, 'enable with RLS_LOCKDOWN_APPLIED=1 after applying the lockdown')

  let ids, admin, activeAgency, pendingAgency

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposableAgencies()
    // An ACTIVE agency with a 2-operative roster (discoverable) and a
    // PENDING_VERIFICATION agency (must stay hidden — the as-registered state).
    activeAgency = await createDisposableAgency({ status: 'active', operatives: 2 })
    pendingAgency = await createDisposableAgency({ status: 'pending_verification' })
  })

  test.afterAll(async () => {
    // Remove the connection THIS spec creates (company side), then both agencies
    // and all their children. Leaves zero residue in prod.
    if (activeAgency) {
      await admin.from('agency_connections').delete()
        .match({ company_id: ids.companyId, agency_id: activeAgency.id })
      await deleteDisposableAgency(activeAgency.id)
    }
    if (pendingAgency) await deleteDisposableAgency(pendingAgency.id)
  })

  test('anon is DENIED search_agencies (authenticated-only grant)', async () => {
    const anon = getAnonDb()
    const { error } = await anon.rpc('search_agencies', { p_term: activeAgency.tag })
    // The RPC returns cross-tenant contact PII via SECURITY DEFINER, so anon's
    // EXECUTE was revoked — anon must get an error, not rows.
    expect(error, 'anon must be denied EXECUTE on search_agencies').toBeTruthy()
  })

  test('search_agencies returns ACTIVE agencies and HIDES pending_verification', async () => {
    const db = await getDb() // signed in as the E2E Test Co admin = connecting company
    const { data, error } = await db.rpc('search_agencies', { p_term: activeAgency.tag })
    expect(error, error?.message).toBeFalsy()
    expect((data || []).map(a => a.id), 'active agency is discoverable via the RPC')
      .toContain(activeAgency.id)

    const { data: pData, error: pErr } = await db.rpc('search_agencies', { p_term: pendingAgency.tag })
    expect(pErr, pErr?.message).toBeFalsy()
    expect((pData || []).map(a => a.id), 'pending_verification agency must NOT be discoverable')
      .not.toContain(pendingAgency.id)
  })

  test('BEFORE connecting: the company cannot directly SELECT the agency row (scoped)', async () => {
    const db = await getDb()
    const { data, error } = await db.from('agencies').select('id').eq('id', activeAgency.id)
    expect(error, error?.message).toBeFalsy()
    expect(data?.length || 0, 'unconnected agency is invisible via direct table read').toBe(0)
  })

  test('R2/R3: connect upsert succeeds AND the connection is visible to its creator', async () => {
    const db = await getDb()
    // EXACTLY the client call (AgencyConnections.handleConnect). The onConflict
    // target exercises R2: a missing UNIQUE(company_id,agency_id) throws here.
    const { error } = await db.from('agency_connections').upsert({
      company_id: ids.companyId,
      agency_id: activeAgency.id,
      status: 'active',
      connected_by: 'E2E §5.7c',
    }, { onConflict: 'company_id,agency_id' })
    expect(error, `R2: connect upsert must succeed (missing UNIQUE constraint would throw) — ${error?.message}`)
      .toBeFalsy()

    // R3: the just-written row reads back under ac_select for its creator.
    const { data: conn, error: rErr } = await db.from('agency_connections')
      .select('id, agency_id, status')
      .eq('company_id', ids.companyId).eq('agency_id', activeAgency.id).eq('status', 'active')
    expect(rErr, rErr?.message).toBeFalsy()
    expect(conn?.length, 'R3: connection is visible to its own creator (not a §5.16 silent-invisible row)').toBe(1)
  })

  test('AFTER connecting: the agency row AND its operatives become visible', async () => {
    const db = await getDb()
    // agency_select connected-branch
    const { data: ag, error: agErr } = await db.from('agencies')
      .select('id, company_name').eq('id', activeAgency.id)
    expect(agErr, agErr?.message).toBeFalsy()
    expect(ag?.length, 'connected agency is now visible (agency_select connections branch)').toBe(1)

    // ao_select connected-branch (View Operatives in the UI)
    const { data: ops, error: opErr } = await db.from('agency_operatives')
      .select('id').eq('agency_id', activeAgency.id)
    expect(opErr, opErr?.message).toBeFalsy()
    expect(ops?.length, 'connected company sees the agency roster (ao_select connections branch)').toBe(2)
  })
})
