import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const action = req.query.action || req.body?.action

  // ── Public actions (no auth required) ──
  if (req.method === 'GET' && action === 'public-item') {
    const id = req.query.id
    if (!id) return res.status(400).json({ error: 'Missing id' })
    const { data, error } = await supabase
      .from('equipment')
      .select('id, description, type, serial_number, status, inspection_interval_days, company_id, project_id, projects(name, location), companies(name, logo_url, primary_colour)')
      .eq('id', id)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Equipment not found' })
    return res.json({ equipment: data })
  }

  if (req.method === 'GET' && action === 'checklist-template') {
    const type = req.query.equipmentType
    const companyId = req.query.companyId
    if (!type) return res.status(400).json({ error: 'Missing equipmentType' })
    // Try company-specific first, fall back to system default
    let { data } = await supabase
      .from('equipment_checklist_templates')
      .select('items')
      .eq('equipment_type', type)
      .eq('company_id', companyId || '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    if (!data) {
      const res2 = await supabase
        .from('equipment_checklist_templates')
        .select('items')
        .eq('equipment_type', type)
        .is('company_id', null)
        .maybeSingle()
      data = res2.data
    }
    return res.json({ items: data?.items || [] })
  }

  // ── Equipment check — auth token OR operative session ──
  if (req.method === 'POST' && action === 'check') {
    const b = req.body
    if (!b.equipmentId || !b.operativeName) return res.status(400).json({ error: 'Missing required fields' })

    // Auth: either a valid JWT or operative session matching operative ID
    const { user } = await verifyAuth(req)
    if (!user && (!b.operativeSessionId || b.operativeSessionId !== b.operativeId)) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: eq } = await supabase.from('equipment').select('id, status, company_id, project_id').eq('id', b.equipmentId).single()
    if (!eq) return res.status(404).json({ error: 'Equipment not found' })
    if (eq.status === 'Defective') return res.status(400).json({ error: 'Equipment is defective — cannot check in' })
    if (eq.status === 'Off-Hire') return res.status(400).json({ error: 'Equipment is off-hire' })
    const { data, error } = await supabase.from('equipment_checks').insert({
      equipment_id: b.equipmentId,
      company_id: eq.company_id,
      project_id: eq.project_id,
      operative_id: b.operativeId || null,
      operative_name: b.operativeName,
      checklist: b.checklist || [],
      all_passed: b.allPassed !== false,
      floor: b.floor || null,
      location: b.location || null,
      pin_x: b.pinX ?? null,
      pin_y: b.pinY ?? null,
      notes: b.notes || null,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, check: data })
  }

  // ── Auth required for all other actions ──
  const { user, error: authErr } = await verifyAuth(req)
  if (!user) return res.status(401).json({ error: authErr || 'Unauthorized' })
  // Resolve company_id — JWT metadata may not have it (e.g. admins created via create-company-admin)
  let callerCompanyId = user.user_metadata?.company_id
  if (!callerCompanyId) {
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('email', user.email).limit(1)
    if (prof?.[0]?.company_id) callerCompanyId = prof[0].company_id
  }
  const callerRole = user.user_metadata?.role

  async function verifyProjectAccess(projectId) {
    if (!projectId) return true
    const { data } = await supabase.from('projects').select('company_id').eq('id', projectId).single()
    return data?.company_id === callerCompanyId
  }

  async function verifyEquipmentAccess(equipmentId) {
    if (!equipmentId) return false
    const { data } = await supabase.from('equipment').select('company_id').eq('id', equipmentId).single()
    return data?.company_id === callerCompanyId
  }

  // ═══════════════════════════════════════════
  // GET
  // ═══════════════════════════════════════════
  if (req.method === 'GET') {
    if (action === 'items') {
      const projectId = req.query.projectId
      let q = supabase.from('equipment').select('*').eq('company_id', callerCompanyId).order('created_at', { ascending: false })
      if (projectId) q = q.eq('project_id', projectId)
      if (req.query.type) q = q.eq('type', req.query.type)
      if (req.query.status) q = q.eq('status', req.query.status)
      if (req.query.search) q = q.ilike('description', `%${req.query.search}%`)
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })

      // Attach latest check per item
      const ids = (data || []).map(e => e.id)
      let checksMap = {}
      if (ids.length > 0) {
        const { data: checks } = await supabase
          .from('equipment_checks')
          .select('equipment_id, checked_at, all_passed, operative_name, floor')
          .in('equipment_id', ids)
          .order('checked_at', { ascending: false })
        if (checks) {
          for (const c of checks) {
            if (!checksMap[c.equipment_id]) checksMap[c.equipment_id] = c
          }
        }
      }

      // Attach open defect count
      let defectMap = {}
      if (ids.length > 0) {
        const { data: defects } = await supabase
          .from('equipment_defects')
          .select('equipment_id')
          .in('equipment_id', ids)
          .eq('status', 'Open')
        if (defects) {
          for (const d of defects) {
            defectMap[d.equipment_id] = (defectMap[d.equipment_id] || 0) + 1
          }
        }
      }

      const items = (data || []).map(e => ({
        ...e,
        latest_check: checksMap[e.id] || null,
        open_defects: defectMap[e.id] || 0,
      }))

      return res.json({ items })
    }

    if (action === 'checks') {
      const equipmentId = req.query.equipmentId
      if (!equipmentId) return res.status(400).json({ error: 'Missing equipmentId' })
      if (!await verifyEquipmentAccess(equipmentId)) return res.status(403).json({ error: 'Not authorised' })
      const limit = parseInt(req.query.limit) || 20
      const { data, error } = await supabase
        .from('equipment_checks')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('checked_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ checks: data || [] })
    }

    if (action === 'defects') {
      const equipmentId = req.query.equipmentId
      if (!equipmentId) return res.status(400).json({ error: 'Missing equipmentId' })
      if (!await verifyEquipmentAccess(equipmentId)) return res.status(403).json({ error: 'Not authorised' })
      const { data, error } = await supabase
        .from('equipment_defects')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ defects: data || [] })
    }

    if (action === 'dashboard') {
      const projectId = req.query.projectId
      let q = supabase.from('equipment').select('id, status, inspection_interval_days').eq('company_id', callerCompanyId)
      if (projectId) q = q.eq('project_id', projectId)
      const { data: items } = await q

      const onSite = (items || []).filter(e => e.status === 'In Service').length
      const defective = (items || []).filter(e => e.status === 'Defective').length
      const total = (items || []).length

      // Checked today
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const ids = (items || []).map(e => e.id)
      let checkedToday = 0
      let overdue = 0
      if (ids.length > 0) {
        const { data: todayChecks } = await supabase
          .from('equipment_checks')
          .select('equipment_id')
          .in('equipment_id', ids)
          .gte('checked_at', todayStart.toISOString())
        const checkedIds = new Set((todayChecks || []).map(c => c.equipment_id))
        checkedToday = checkedIds.size

        // Overdue: in-service items not checked within their interval
        const { data: latestChecks } = await supabase
          .from('equipment_checks')
          .select('equipment_id, checked_at')
          .in('equipment_id', ids)
          .order('checked_at', { ascending: false })
        const lastCheckMap = {}
        for (const c of (latestChecks || [])) {
          if (!lastCheckMap[c.equipment_id]) lastCheckMap[c.equipment_id] = c.checked_at
        }
        const now = new Date()
        for (const item of (items || [])) {
          if (item.status !== 'In Service') continue
          const last = lastCheckMap[item.id]
          if (!last) { overdue++; continue }
          const daysSince = (now - new Date(last)) / (1000 * 60 * 60 * 24)
          if (daysSince > item.inspection_interval_days) overdue++
        }
      }

      return res.json({ total, onSite, defective, checkedToday, overdue })
    }

    // Equipment map — latest pin location per equipment on a given floor
    if (action === 'equipment-map') {
      const projectId = req.query.projectId
      const floorName = req.query.floor
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })

      let q = supabase.from('equipment').select('id, description, type, serial_number, status')
        .eq('company_id', callerCompanyId).eq('project_id', projectId)
      const { data: items } = await q
      if (!items?.length) return res.json({ pins: [] })

      const ids = items.map(e => e.id)
      const { data: checks } = await supabase.from('equipment_checks')
        .select('equipment_id, floor, pin_x, pin_y, operative_name, checked_at')
        .in('equipment_id', ids)
        .not('pin_x', 'is', null)
        .order('checked_at', { ascending: false })

      // Latest check per equipment
      const latest = {}
      for (const c of (checks || [])) {
        if (!latest[c.equipment_id]) latest[c.equipment_id] = c
      }

      // Filter to requested floor and merge with equipment data
      const pins = Object.values(latest)
        .filter(c => !floorName || c.floor === floorName)
        .map(c => {
          const eq = items.find(i => i.id === c.equipment_id)
          return { ...eq, ...c }
        })

      return res.json({ pins })
    }

    return res.status(400).json({ error: 'Unknown GET action' })
  }

  // ═══════════════════════════════════════════
  // POST
  // ═══════════════════════════════════════════
  if (req.method === 'POST') {
    if (action === 'item') {
      if (!callerCompanyId) return res.status(403).json({ error: 'No company' })
      const b = req.body
      if (!b.description || !b.type) return res.status(400).json({ error: 'Missing description or type' })
      if (b.projectId && !await verifyProjectAccess(b.projectId)) return res.status(403).json({ error: 'Not authorised' })

      const { data, error } = await supabase.from('equipment').insert({
        company_id: callerCompanyId,
        project_id: b.projectId || null,
        description: b.description.trim(),
        type: b.type,
        serial_number: b.serialNumber?.trim() || null,
        hire_company: b.hireCompany?.trim() || null,
        on_hire_date: b.onHireDate || null,
        off_hire_date: b.offHireDate || null,
        daily_hire_rate: b.dailyHireRate || null,
        inspection_interval_days: b.inspectionIntervalDays || 7,
        created_by_user_id: user.id,
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, item: data })
    }

    if (action === 'defect') {
      const b = req.body
      if (!b.equipmentId || !b.description || !b.severity || !b.reporterName) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { data: eq } = await supabase.from('equipment').select('id, company_id, type, serial_number, description').eq('id', b.equipmentId).single()
      if (!eq) return res.status(404).json({ error: 'Equipment not found' })

      // Create defect record
      const { data: defect, error } = await supabase.from('equipment_defects').insert({
        equipment_id: b.equipmentId,
        company_id: eq.company_id,
        reported_by_id: b.reporterId || null,
        reported_by_name: b.reporterName,
        description: b.description.trim(),
        severity: b.severity,
        photo_url: b.photoUrl || null,
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })

      // Flip equipment status to Defective
      await supabase.from('equipment').update({ status: 'Defective', updated_at: new Date().toISOString() }).eq('id', b.equipmentId)

      // Notify all managers in the company
      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', eq.company_id)
      for (const m of (managers || [])) {
        await supabase.from('notifications').insert({
          company_id: eq.company_id,
          user_id: m.id,
          type: 'warning',
          title: `Equipment Defect: ${eq.type}`,
          body: `${eq.description}${eq.serial_number ? ' (' + eq.serial_number + ')' : ''} — ${b.severity}: ${b.description}. Reported by ${b.reporterName}.`,
          link: '/app/plant-equipment',
        })
      }

      return res.json({ success: true, defect })
    }

    return res.status(400).json({ error: 'Unknown POST action' })
  }

  // ═══════════════════════════════════════════
  // PATCH
  // ═══════════════════════════════════════════
  if (req.method === 'PATCH') {
    if (action === 'item') {
      const b = req.body
      if (!b.id) return res.status(400).json({ error: 'Missing id' })
      if (!await verifyEquipmentAccess(b.id)) return res.status(403).json({ error: 'Not authorised' })

      const updates = { updated_at: new Date().toISOString() }
      const fields = ['description', 'type', 'serial_number', 'hire_company', 'on_hire_date', 'off_hire_date', 'daily_hire_rate', 'status', 'project_id', 'inspection_interval_days']
      for (const f of fields) {
        if (b[f] !== undefined) updates[f] = b[f] === '' ? null : b[f]
      }

      const { error } = await supabase.from('equipment').update(updates).eq('id', b.id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true })
    }

    if (action === 'resolve-defect') {
      const b = req.body
      if (!b.defectId) return res.status(400).json({ error: 'Missing defectId' })

      const { data: defect } = await supabase.from('equipment_defects').select('equipment_id, company_id').eq('id', b.defectId).single()
      if (!defect) return res.status(404).json({ error: 'Defect not found' })
      if (defect.company_id !== callerCompanyId) return res.status(403).json({ error: 'Not authorised' })

      // Resolve the defect
      await supabase.from('equipment_defects').update({
        status: 'Resolved',
        resolved_by_id: user.id,
        resolved_by_name: b.resolverName || user.user_metadata?.name || 'Manager',
        resolution_notes: b.notes || null,
        resolved_at: new Date().toISOString(),
      }).eq('id', b.defectId)

      // Check if any other open defects remain
      const { data: remaining } = await supabase
        .from('equipment_defects')
        .select('id')
        .eq('equipment_id', defect.equipment_id)
        .eq('status', 'Open')
      if (!remaining || remaining.length === 0) {
        await supabase.from('equipment').update({ status: 'In Service', updated_at: new Date().toISOString() }).eq('id', defect.equipment_id)
      }

      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown PATCH action' })
  }

  // ═══════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (action === 'item') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      if (!await verifyEquipmentAccess(id)) return res.status(403).json({ error: 'Not authorised' })
      const { error } = await supabase.from('equipment').delete().eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true })
    }
    return res.status(400).json({ error: 'Unknown DELETE action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
