import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Cron job: auto sign-out any operatives still signed in at 23:59.
 * Runs daily at 23:59 via Vercel Cron.
 *
 * Finds all operatives whose last attendance record today is a 'sign_in'
 * (meaning they forgot to sign out) and inserts an automatic 'sign_out'.
 */
export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron')
  const isManual = req.headers['x-cron-key'] === 'CORESITE_CRON_2026'

  if (!isCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Get all attendance records for today
    const { data: records, error } = await supabase
      .from('site_attendance')
      .select('*')
      .gte('recorded_at', todayStart.toISOString())
      .order('recorded_at', { ascending: false })

    if (error) throw error

    // Find operatives whose last record is a sign_in (forgot to sign out)
    const lastByOperative = {}
    for (const rec of (records || [])) {
      const key = `${rec.project_id}_${rec.operative_id}`
      if (!lastByOperative[key]) {
        lastByOperative[key] = rec
      }
    }

    const forgotToSignOut = Object.values(lastByOperative).filter(r => r.type === 'sign_in')

    if (forgotToSignOut.length === 0) {
      return res.status(200).json({ message: 'No one left to sign out', count: 0 })
    }

    // Insert auto sign-out for each
    const signOuts = forgotToSignOut.map(r => ({
      company_id: r.company_id,
      project_id: r.project_id,
      operative_id: r.operative_id,
      operative_name: r.operative_name,
      type: 'sign_out',
      method: 'auto',
      notes: 'Automatic sign-out at end of day',
      recorded_at: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0).toISOString(),
    }))

    const { error: insertErr } = await supabase.from('site_attendance').insert(signOuts)
    if (insertErr) throw insertErr

    return res.status(200).json({
      message: `Auto signed out ${signOuts.length} operative${signOuts.length !== 1 ? 's' : ''}`,
      count: signOuts.length,
      operatives: forgotToSignOut.map(r => r.operative_name),
    })
  } catch (err) {
    console.error('Auto sign-out error:', err)
    return res.status(500).json({ error: err.message })
  }
}
