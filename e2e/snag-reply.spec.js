import { test, expect } from '@playwright/test'
import { getIds, getDb, fetchRow, runMarker } from './helpers/db.js'

/**
 * Public subcontractor snag-reply page (/snag-reply/:token) — runs fully
 * anonymous so it proves the comment path works via submit_snag_comment as the
 * anon role (the path that must survive the RLS lockdown).
 *
 * Seeds a snag with a known reply_token, then removes it + its comments.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe.serial('Snag reply (anon, via RPC)', () => {
  let ids, db, snagId
  const token = runMarker('e2e-reply-tok')
  const commentText = runMarker('E2E-REPLY-COMMENT')

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    if (!ids.drawingId) throw new Error('Seed missing E2E Drawing — run `node scripts/seed-e2e.js`')
    const { data, error } = await db.from('snags').insert({
      drawing_id: ids.drawingId,
      project_id: ids.projectId,
      company_id: ids.companyId,
      description: 'E2E reply snag',
      status: 'open',
      snag_number: 99001,
      reply_token: token,
      assigned_to: 'E2E Sub',
      pin_x: 50,
      pin_y: 50,
    }).select('id').single()
    if (error) throw new Error('snag seed failed: ' + error.message)
    snagId = data.id
  })

  test.afterAll(async () => {
    if (snagId) {
      await db.from('snag_comments').delete().eq('snag_id', snagId)
      await db.from('snags').delete().eq('id', snagId)
    }
  })

  test('anon comment-only reply persists via RPC', async ({ page }) => {
    await page.goto(`/snag-reply/${token}`)
    // The snag renders (anon read via get_snag_for_reply).
    await expect(page.getByRole('heading', { name: /Snag #99001/ })).toBeVisible({ timeout: 20_000 })

    // Comment-only path (no photo): the Send button appears when no photo is attached.
    await page.getByPlaceholder('Add a comment...').fill(commentText)
    await page.locator('button:has(svg.lucide-send)').click()

    await expect(async () => {
      const row = await fetchRow('snag_comments', { snag_id: snagId, comment: commentText })
      expect(row, 'comment should persist via submit_snag_comment').not.toBeNull()
    }).toPass({ timeout: 10_000 })
  })
})
