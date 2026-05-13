import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const division = req.query.division || 'england-and-wales'

  // Check cache freshness
  const { data: latest } = await supabase.from('uk_bank_holidays').select('created_at').eq('division', division).order('created_at', { ascending: false }).limit(1)
  const cacheAge = latest?.[0] ? Date.now() - new Date(latest[0].created_at).getTime() : Infinity
  const stale = cacheAge > 30 * 24 * 60 * 60 * 1000 // 30 days

  if (stale) {
    try {
      const apiRes = await fetch('https://www.gov.uk/bank-holidays.json')
      if (apiRes.ok) {
        const data = await apiRes.json()
        const events = data[division]?.events || []
        if (events.length > 0) {
          // Clear old data for this division and insert fresh
          await supabase.from('uk_bank_holidays').delete().eq('division', division)
          const rows = events.map(e => ({ date: e.date, name: e.title, division }))
          await supabase.from('uk_bank_holidays').insert(rows)
        }
      }
    } catch (e) {
      console.error('[BankHolidays] API fetch failed, using cache:', e.message)
    }
  }

  // Return from cache
  let q = supabase.from('uk_bank_holidays').select('date, name, division').eq('division', division).order('date')
  if (req.query.from) q = q.gte('date', req.query.from)
  if (req.query.to) q = q.lte('date', req.query.to)
  const { data } = await q

  return res.json({
    holidays: data || [],
    lastRefreshed: latest?.[0]?.created_at || null,
    stale: stale && (!data || data.length === 0),
  })
}
