import { createClient } from '@supabase/supabase-js'

import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const operativeId = req.query.operativeId
  if (!operativeId) return res.status(400).json({ error: 'Missing operativeId' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Auth: either an authenticated manager or the operative themselves
  const operativeSessionId = req.query.operativeSessionId
  const { user } = await verifyAuth(req)
  if (!user && operativeSessionId !== operativeId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  // Get operative's allowance settings
  const { data: op } = await supabase
    .from('operatives')
    .select('annual_allowance_days, allowance_year_start')
    .eq('id', operativeId)
    .single()

  if (!op) return res.status(404).json({ error: 'Operative not found' })

  // If authenticated manager, verify they belong to the same company
  if (user) {
    const { data: fullOp } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
    if (fullOp && user.user_metadata?.company_id && fullOp.company_id !== user.user_metadata.company_id) {
      return res.status(403).json({ error: 'Not authorised' })
    }
  }

  const totalDays = op.annual_allowance_days || 28

  // Calculate allowance year boundaries
  const now = new Date()
  let yearStart, yearEnd
  if (op.allowance_year_start) {
    const as = new Date(op.allowance_year_start)
    yearStart = new Date(now.getFullYear(), as.getMonth(), as.getDate())
    if (yearStart > now) yearStart.setFullYear(yearStart.getFullYear() - 1)
    yearEnd = new Date(yearStart)
    yearEnd.setFullYear(yearEnd.getFullYear() + 1)
    yearEnd.setDate(yearEnd.getDate() - 1)
  } else {
    // Default: Jan 1 to Dec 31
    yearStart = new Date(now.getFullYear(), 0, 1)
    yearEnd = new Date(now.getFullYear(), 11, 31)
  }

  // Sum working_days for approved + pending requests in this year
  const { data: requests } = await supabase
    .from('holiday_requests')
    .select('working_days, status')
    .eq('operative_id', operativeId)
    .in('status', ['approved', 'pending'])
    .gte('start_date', yearStart.toISOString().split('T')[0])
    .lte('start_date', yearEnd.toISOString().split('T')[0])

  let usedDays = 0
  let pendingDays = 0
  for (const r of (requests || [])) {
    const d = parseFloat(r.working_days) || 0
    if (r.status === 'approved') usedDays += d
    else if (r.status === 'pending') pendingDays += d
  }

  const remaining = Math.max(0, totalDays - usedDays - pendingDays)

  return res.json({
    total: totalDays,
    used: usedDays,
    pending: pendingDays,
    remaining,
    yearStart: yearStart.toISOString().split('T')[0],
    yearEnd: yearEnd.toISOString().split('T')[0],
  })
}
