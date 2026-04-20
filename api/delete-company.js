import { verifySuperAdmin } from './_superAdminAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { verified, supabase, error: authErr } = await verifySuperAdmin(req)
  if (!verified) {
    return res.status(401).json({ error: authErr })
  }

  const { companyId } = req.body
  if (!companyId) {
    return res.status(400).json({ error: 'Missing companyId' })
  }

  try {
    // Get admin profiles before deleting so we can clean up auth users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('company_id', companyId)

    // Delete in dependency order — deepest children first
    const companyTables = [
      // Deep children first
      'audit_logs', 'cis_records', 'timesheet_entries', 'sub_invoices',
      'payment_applications', 'contra_charges', 'daywork_sheets', 'job_documents',
      'job_variations', 'job_operatives', 'subcontractor_jobs',
      'operative_invoices', 'markup_lines', 'progress_snapshots',
      'programme_activities', 'drawing_layers', 'design_drawings',
      'master_activities', 'master_programme',
      'labour_proposals', 'labour_bookings', 'labour_requests',
      'agency_connections',
      'snag_comments', 'snags',
      'permit_signatures', 'permits', 'permit_templates',
      'toolbox_signatures', 'toolbox_talks',
      'document_signoffs', 'document_audit_log', 'document_hub', 'document_packs',
      'signatures', 'documents', 'drawings',
      'site_attendance', 'site_diary', 'notifications',
      'hs_observations',
      'inspection_templates', 'inspections',
      'aftercare_defects', 'chat_messages',
      'progress_item_history', 'progress_items', 'progress_zones', 'progress_drawings',
      'bim_drawing_calibration', 'bim_elements', 'bim_models',
      // Parent tables last
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

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Delete company error:', err)
    return res.status(500).json({ error: err.message })
  }
}
