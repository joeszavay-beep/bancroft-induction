import { test, expect } from '@playwright/test'
import { getIds, getDb, runMarker } from './helpers/db.js'

/**
 * First-time operative profile setup (/operative/:id/profile reached from an
 * invite link, no session). OperativeGuard allows it (dob NULL) and the page
 * loads it — both via get_operative_for_setup as the anon role, the path that
 * must survive the RLS lockdown. The write path (complete_operative_setup) is
 * exercised directly to avoid the UI's auth-account side effect.
 *
 * Seeds an unactivated operative (date_of_birth NULL), then removes it.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Operative profile setup (anon, via RPC)', () => {
  let ids, db, opId
  const email = `${runMarker('e2e-setup')}@coresite.io`

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    const { data, error } = await db.from('operatives').insert({
      company_id: ids.companyId,
      name: 'E2E Setup Worker',
      email,
      // date_of_birth omitted → NULL → unactivated / first-time
    }).select('id').single()
    if (error) throw new Error('operative seed failed: ' + error.message)
    opId = data.id
  })

  test.afterAll(async () => {
    if (opId) {
      await db.from('operative_projects').delete().eq('operative_id', opId)
      await db.from('operatives').delete().eq('id', opId)
    }
  })

  test('anon first-time profile loads via RPC; setup write persists', async ({ page }) => {
    await page.goto(`/operative/${opId}/profile`)
    await expect(page.getByText('Complete Your Profile')).toBeVisible({ timeout: 20_000 })

    // Write path: complete_operative_setup activates the operative (gated on dob NULL).
    const { data, error } = await db.rpc('complete_operative_setup', {
      p_id: opId,
      p_role: 'Labourer',
      p_date_of_birth: '1990-01-01',
      p_ni_number: 'AB123456C',
      p_address: '1 Test Street',
      p_mobile: '07700900000',
      p_email: email,
      p_next_of_kin: 'Next Kin',
      p_next_of_kin_phone: '07700900001',
      p_card_type: 'CSCS',
      p_card_number: 'C-123',
      p_card_expiry: '2030-01-01',
      p_card_front_url: null,
      p_card_back_url: null,
    })
    expect(error, 'complete_operative_setup should not error').toBeFalsy()
    expect(data?.success, 'setup should report success').toBe(true)

    const { data: row } = await db.from('operatives').select('date_of_birth').eq('id', opId).single()
    expect(row?.date_of_birth, 'dob should be set after setup').toBeTruthy()
  })
})
