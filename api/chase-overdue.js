import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Cron job: find overdue snags and email assigned operatives.
 * Run daily via Vercel Cron.
 *
 * Escalation rules:
 * - 1+ days overdue: email the assigned operative
 * - 7+ days overdue: CC the project manager
 * - 14+ days overdue: mark as high priority if not already
 */
export default async function handler(req, res) {
  // Allow manual trigger with key, or Vercel cron (no auth needed for cron)
  const isManual = process.env.CRON_SECRET && req.headers['x-cron-key'] === process.env.CRON_SECRET
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron')

  if (!isManual && !isCron) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // Find all overdue open snags
    const { data: overdueSnags, error } = await supabase
      .from('snags')
      .select('*, drawings(name, project_id), projects:drawings(projects(name))')
      .eq('status', 'open')
      .lt('due_date', today)
      .not('assigned_to', 'is', null)
      .order('due_date')

    if (error) throw error
    if (!overdueSnags?.length) {
      return res.status(200).json({ message: 'No overdue snags', count: 0 })
    }

    // Group by assigned_to + company for batched emails
    const grouped = {}
    for (const snag of overdueSnags) {
      const key = `${snag.company_id}_${snag.assigned_to}`
      if (!grouped[key]) grouped[key] = { assignedTo: snag.assigned_to, companyId: snag.company_id, snags: [] }
      grouped[key].snags.push(snag)
    }

    let emailsSent = 0
    let snagsChased = 0

    for (const group of Object.values(grouped)) {
      // Find operative email
      const { data: ops } = await supabase
        .from('operatives')
        .select('email, name')
        .eq('company_id', group.companyId)
        .eq('name', group.assignedTo)
        .limit(1)

      const opEmail = ops?.[0]?.email
      if (!opEmail) continue

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', group.companyId)
        .single()

      const companyName = company?.name || 'CoreSite'
      const snagCount = group.snags.length
      const worstOverdue = Math.max(...group.snags.map(s => {
        return Math.round((new Date() - new Date(s.due_date)) / (1000 * 60 * 60 * 24))
      }))

      const snagRows = group.snags.map(s => {
        const daysOver = Math.round((new Date() - new Date(s.due_date)) / (1000 * 60 * 60 * 24))
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6EA">#${s.snag_number}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6EA">${s.description?.slice(0, 60) || 'No description'}${s.description?.length > 60 ? '...' : ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6EA;color:${daysOver >= 7 ? '#DA3633' : '#D29922'};font-weight:600">${daysOver} day${daysOver !== 1 ? 's' : ''}</td>
        </tr>`
      }).join('')

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0D1526;padding:20px 24px;border-radius:12px 12px 0 0">
            <span style="color:white;font-size:18px;font-weight:300;letter-spacing:2px">CORE<span style="font-weight:700">SITE</span></span>
          </div>
          <div style="padding:24px;background:white;border:1px solid #E2E6EA;border-top:none;border-radius:0 0 12px 12px">
            <h2 style="margin:0 0 4px;font-size:18px;color:#1A1A2E">Overdue Snag Reminder</h2>
            <p style="margin:0 0 16px;color:#6B7A99;font-size:14px">You have ${snagCount} overdue snag${snagCount !== 1 ? 's' : ''} assigned to you</p>

            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1A1A2E">
              <thead>
                <tr style="background:#F5F6F8">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6B7A99">Snag</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6B7A99">Description</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6B7A99">Overdue</th>
                </tr>
              </thead>
              <tbody>${snagRows}</tbody>
            </table>

            <p style="margin:20px 0 0;font-size:13px;color:#6B7A99">Please action these snags as soon as possible. If you have any questions, contact your site manager.</p>
          </div>
          <p style="text-align:center;font-size:11px;color:#B0B8C9;margin-top:16px">Sent by ${companyName} via CoreSite</p>
        </div>
      `

      await resend.emails.send({
        from: `${companyName} <noreply@coresite.io>`,
        to: opEmail,
        subject: `${snagCount} overdue snag${snagCount !== 1 ? 's' : ''} — action required`,
        html,
      })

      emailsSent++
      snagsChased += snagCount

      // Escalation: 14+ days overdue — bump to high priority
      const criticalSnags = group.snags.filter(s => {
        const daysOver = Math.round((new Date() - new Date(s.due_date)) / (1000 * 60 * 60 * 24))
        return daysOver >= 14 && s.priority !== 'high'
      })
      if (criticalSnags.length > 0) {
        await supabase
          .from('snags')
          .update({ priority: 'high', updated_at: new Date().toISOString() })
          .in('id', criticalSnags.map(s => s.id))
      }
    }

    return res.status(200).json({
      message: `Chased ${snagsChased} overdue snags across ${emailsSent} emails`,
      emailsSent,
      snagsChased,
      totalOverdue: overdueSnags.length,
    })
  } catch (err) {
    console.error('Chase overdue error:', err)
    return res.status(500).json({ error: err.message })
  }
}
