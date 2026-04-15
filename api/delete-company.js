import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const { companyId } = req.body
  if (!companyId) {
    return res.status(400).json({ error: 'Missing companyId' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing server config' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Get admin emails before deleting so we can clean up auth users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('company_id', companyId)

    // Delete in dependency order — deepest children first
    const companyTables = [
      'audit_logs', 'cis_records', 'timesheet_entries', 'sub_invoices',
      'job_variations', 'job_operatives', 'subcontractor_jobs',
      'operative_invoices', 'markup_lines', 'progress_snapshots',
      'programme_activities', 'drawing_layers', 'design_drawings',
      'master_activities', 'master_programme',
      'labour_proposals', 'labour_bookings', 'labour_requests',
      'agency_connections',
      'snag_comments', 'snags',
      'toolbox_signatures', 'toolbox_talks',
      'signatures', 'documents', 'drawings',
      'site_attendance', 'notifications',
      'inspection_templates', 'inspections',
      'aftercare_defects', 'chat_messages',
      'progress_items', 'progress_item_history', 'progress_zones', 'progress_drawings',
      'bim_drawing_calibration', 'bim_elements', 'bim_models',
      'operatives', 'projects', 'profiles', 'managers', 'settings',
    ]

    const errors = []
    for (const table of companyTables) {
      const { error } = await supabase.from(table).delete().eq('company_id', companyId)
      if (error && !error.message?.includes('does not exist')) {
        errors.push(`${table}: ${error.message}`)
      }
    }

    // Delete the company itself
    const { error: delErr } = await supabase.from('companies').delete().eq('id', companyId)
    if (delErr) {
      return res.status(400).json({ error: delErr.message, tableErrors: errors })
    }

    // Clean up auth users for this company's profiles
    for (const profile of (profiles || [])) {
      if (profile.id) {
        await supabase.auth.admin.deleteUser(profile.id).catch(() => {})
      }
    }

    return res.status(200).json({ success: true, cleanupErrors: errors.length ? errors : undefined })
  } catch (err) {
    console.error('Delete company error:', err)
    return res.status(500).json({ error: err.message })
  }
}
