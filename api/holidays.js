import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

function calculateWorkingDays(startDate, endDate, startHalfDay, endHalfDay) {
  let count = 0
  let current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    if (current.getDay() !== 0 && current.getDay() !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  if (startHalfDay) count -= 0.5
  if (endHalfDay) count -= 0.5
  return Math.max(0, count)
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // --- POST: Create holiday request ---
  if (req.method === 'POST') {
    const { operativeId, operativeSessionId, approverId, startDate, endDate, startHalfDay, endHalfDay, reason } = req.body
    if (!operativeId || !approverId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Auth: operative must own the session
    if (!operativeSessionId || operativeSessionId !== operativeId) {
      return res.status(403).json({ error: 'Not authorised' })
    }

    // Validate dates
    const today = new Date().toISOString().split('T')[0]
    if (startDate < today) return res.status(400).json({ error: 'Start date cannot be in the past' })
    if (endDate < startDate) return res.status(400).json({ error: 'End date must be on or after start date' })

    // Calculate working days server-side
    const workingDays = calculateWorkingDays(startDate, endDate, startHalfDay, endHalfDay)
    if (workingDays <= 0) return res.status(400).json({ error: 'Request must cover at least half a working day' })

    // Validate approver is actually eligible
    const { data: op } = await supabase.from('operatives').select('company_id, email, name').eq('id', operativeId).single()
    if (!op) return res.status(404).json({ error: 'Operative not found' })

    const { data: opProjects } = await supabase.from('operative_projects').select('project_id').eq('operative_id', operativeId)
    const projectIds = (opProjects || []).map(r => r.project_id)

    // Check managers table first, then profiles (company owner may only be in profiles)
    let mgr = null
    const { data: mgrRows } = await supabase.from('managers').select('id, project_ids, name, email').eq('id', approverId).eq('is_active', true)
    if (mgrRows?.length > 0) {
      mgr = mgrRows[0]
    } else {
      // Approver might be from profiles table (company owner)
      const { data: profRows } = await supabase.from('profiles').select('id, name, email, role').eq('id', approverId).in('role', ['admin', 'super_admin'])
      if (profRows?.length > 0) mgr = { id: profRows[0].id, name: profRows[0].name, email: profRows[0].email, project_ids: [] }
    }
    if (!mgr) return res.status(400).json({ error: 'Selected approver not found or inactive' })
    if (mgr.email?.toLowerCase() === op.email?.toLowerCase()) return res.status(400).json({ error: 'Cannot assign yourself as approver' })

    const mgrProjects = mgr.project_ids || []
    const hasOverlap = mgrProjects.some(pid => projectIds.includes(pid))
    // Allow admins even without project overlap
    if (!hasOverlap) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('email', mgr.email).limit(1)
      const isAdmin = prof?.[0]?.role === 'admin' || prof?.[0]?.role === 'super_admin'
      if (!isAdmin) return res.status(400).json({ error: 'Selected approver is not assigned to any of your projects' })
    }

    // Check for overlapping requests
    const { data: existing } = await supabase.from('holiday_requests')
      .select('id')
      .eq('operative_id', operativeId)
      .in('status', ['pending', 'approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate)
    if (existing?.length > 0) return res.status(400).json({ error: 'You already have a request overlapping these dates' })

    // Check allowance
    const { data: allowanceOp } = await supabase.from('operatives').select('annual_allowance_days').eq('id', operativeId).single()
    const totalAllowance = allowanceOp?.annual_allowance_days || 28
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const yearEnd = new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
    const { data: yearRequests } = await supabase.from('holiday_requests')
      .select('working_days')
      .eq('operative_id', operativeId)
      .in('status', ['approved', 'pending'])
      .gte('start_date', yearStart).lte('start_date', yearEnd)
    const usedDays = (yearRequests || []).reduce((sum, r) => sum + (parseFloat(r.working_days) || 0), 0)
    if (usedDays + workingDays > totalAllowance) {
      return res.status(400).json({ error: `Insufficient allowance. ${totalAllowance - usedDays} days remaining.` })
    }

    // Insert
    const { data: request, error: insertErr } = await supabase.from('holiday_requests').insert({
      operative_id: operativeId,
      company_id: op.company_id,
      approver_id: approverId,
      start_date: startDate,
      end_date: endDate,
      start_half_day: !!startHalfDay,
      end_half_day: !!endHalfDay,
      working_days: workingDays,
      reason: reason?.trim()?.slice(0, 500) || null,
      status: 'pending',
    }).select().single()

    if (insertErr) return res.status(500).json({ error: 'Failed to create request: ' + insertErr.message })

    // Audit
    await supabase.from('holiday_audit_log').insert({
      holiday_request_id: request.id,
      action: 'submitted',
      actor_id: operativeId,
      actor_name: op.name,
      actor_role: 'operative',
    })

    // Notify the approver — find their profile user_id by email
    const { data: approverProfile } = await supabase.from('profiles').select('id').eq('email', mgr.email).limit(1)
    if (approverProfile?.[0]) {
      await supabase.from('notifications').insert({
        user_id: approverProfile[0].id,
        company_id: op.company_id,
        type: 'info',
        title: 'Holiday Request',
        body: `${op.name} requested ${workingDays} day${workingDays !== 1 ? 's' : ''} off (${startDate} to ${endDate})`,
        link: '/app/holiday-approvals',
      })
    }

    return res.json({ success: true, request })
  }

  // --- GET: List holiday requests ---
  if (req.method === 'GET') {
    const { operativeId, operativeSessionId, status, from_date, to_date } = req.query

    // Operative fetching their own
    if (operativeId && operativeSessionId === operativeId) {
      let q = supabase.from('holiday_requests').select('*, managers:approver_id(name)').eq('operative_id', operativeId).order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data } = await q
      return res.json({ requests: data || [] })
    }

    // Manager/Admin fetching inbox
    const { user } = await verifyAuth(req)
    if (!user) {
      // Try manager company fallback
      const managerCompanyId = req.query.managerCompanyId
      const managerId = req.query.managerId
      if (managerCompanyId && managerId) {
        let q = supabase.from('holiday_requests').select('*, operatives(name, photo_url, role)').eq('approver_id', managerId).order('start_date')
        if (status) q = q.eq('status', status)
        if (from_date) q = q.gte('start_date', from_date)
        if (to_date) q = q.lte('end_date', to_date)
        const { data } = await q
        return res.json({ requests: data || [] })
      }
      return res.status(401).json({ error: 'Authentication required' })
    }

    const meta = user.user_metadata || {}
    const isAdmin = ['admin', 'super_admin'].includes(meta.role)

    // Get manager's ID from managers table
    const { data: mgrRow } = await supabase.from('managers').select('id').eq('email', user.email).eq('company_id', meta.company_id).limit(1)
    const managerId = mgrRow?.[0]?.id

    let q = supabase.from('holiday_requests').select('*, operatives(name, photo_url, role)').eq('company_id', meta.company_id).order('start_date')
    if (!isAdmin && managerId) q = q.eq('approver_id', managerId)
    if (status) q = q.eq('status', status)
    if (from_date) q = q.gte('start_date', from_date)
    if (to_date) q = q.lte('end_date', to_date)

    const { data } = await q
    return res.json({ requests: data || [] })
  }

  // --- PATCH: Approve/Reject/Cancel/Reassign ---
  if (req.method === 'PATCH') {
    const { requestId, action, note, operativeSessionId, newApproverId, managerCompanyId, managerId: reqManagerId } = req.body
    if (!requestId || !action) return res.status(400).json({ error: 'Missing requestId or action' })

    const { data: request } = await supabase.from('holiday_requests').select('*').eq('id', requestId).single()
    if (!request) return res.status(404).json({ error: 'Request not found' })

    // Determine caller identity
    let callerId = null, callerName = 'Unknown', callerRole = 'unknown'
    const { user } = await verifyAuth(req)
    if (user) {
      callerId = user.id
      callerName = user.user_metadata?.name || user.email
      callerRole = user.user_metadata?.role || 'manager'
    } else if (reqManagerId && managerCompanyId) {
      callerId = reqManagerId
      callerRole = 'manager'
      const { data: mgr } = await supabase.from('managers').select('name').eq('id', reqManagerId).single()
      callerName = mgr?.name || 'Manager'
    } else if (operativeSessionId) {
      callerId = operativeSessionId
      callerRole = 'operative'
      const { data: op } = await supabase.from('operatives').select('name').eq('id', operativeSessionId).single()
      callerName = op?.name || 'Operative'
    } else {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const isAdmin = callerRole === 'admin' || callerRole === 'super_admin'
    const isAssignedApprover = callerId === request.approver_id || reqManagerId === request.approver_id
    const isOperativeOwner = operativeSessionId === request.operative_id

    // Permission checks per action
    if (action === 'approve' || action === 'reject') {
      if (!isAssignedApprover && !isAdmin) return res.status(403).json({ error: 'Only the assigned approver or an admin can action this request' })
      if (request.status !== 'pending') return res.status(400).json({ error: 'Can only approve/reject pending requests' })
      if (action === 'reject' && !note) return res.status(400).json({ error: 'Rejection reason is required' })
    } else if (action === 'cancel') {
      if (!isOperativeOwner && !isAdmin) return res.status(403).json({ error: 'Only the requesting operative or an admin can cancel' })
      if (!['pending', 'approved'].includes(request.status)) return res.status(400).json({ error: 'Cannot cancel this request' })
      if (request.status === 'approved' && request.start_date <= new Date().toISOString().split('T')[0]) {
        return res.status(400).json({ error: 'Cannot cancel a holiday that has already started' })
      }
    } else if (action === 'reassign') {
      if (!isOperativeOwner && !isAdmin) return res.status(403).json({ error: 'Only the operative or admin can reassign' })
      if (request.status !== 'pending') return res.status(400).json({ error: 'Can only reassign pending requests' })
      if (!newApproverId) return res.status(400).json({ error: 'Missing new approver ID' })
      // 48h check for operative (admin can reassign anytime)
      if (isOperativeOwner && !isAdmin) {
        const createdAt = new Date(request.created_at)
        const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
        if (hoursElapsed < 48) return res.status(400).json({ error: 'Can only reassign after 48 hours' })
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' })
    }

    // Perform the action
    const now = new Date().toISOString()
    let update = { updated_at: now }
    let notifyUserId = null, notifyTitle = '', notifyBody = '', notifyLink = ''

    if (action === 'approve') {
      update.status = 'approved'
      update.approved_at = now
      // Notify operative
      const { data: opProfile } = await supabase.from('profiles').select('id').eq('email',
        (await supabase.from('operatives').select('email').eq('id', request.operative_id).single()).data?.email
      ).limit(1)
      notifyUserId = request.operative_id
      notifyTitle = 'Holiday Approved'
      notifyBody = `Your holiday (${request.start_date} to ${request.end_date}) has been approved`
      notifyLink = '/worker/holidays'
    } else if (action === 'reject') {
      update.status = 'rejected'
      update.rejected_at = now
      update.rejection_reason = note
      notifyUserId = request.operative_id
      notifyTitle = 'Holiday Rejected'
      notifyBody = `Your holiday (${request.start_date} to ${request.end_date}) was rejected: ${note}`
      notifyLink = '/worker/holidays'
    } else if (action === 'cancel') {
      update.status = 'cancelled'
      update.cancelled_at = now
      // Notify the approver
      const { data: mgr } = await supabase.from('managers').select('email').eq('id', request.approver_id).single()
      if (mgr) {
        const { data: approverProfile } = await supabase.from('profiles').select('id').eq('email', mgr.email).limit(1)
        if (approverProfile?.[0]) {
          notifyUserId = approverProfile[0].id
          notifyTitle = 'Holiday Cancelled'
          notifyBody = `${callerName} cancelled their holiday request (${request.start_date} to ${request.end_date})`
          notifyLink = '/app/holiday-approvals'
        }
      }
    } else if (action === 'reassign') {
      update.approver_id = newApproverId
      update.reassigned_at = now
      update.reassigned_from = request.approver_id
      // Notify new approver
      const { data: newMgr } = await supabase.from('managers').select('email, name').eq('id', newApproverId).single()
      if (newMgr) {
        const { data: newProfile } = await supabase.from('profiles').select('id').eq('email', newMgr.email).limit(1)
        if (newProfile?.[0]) {
          await supabase.from('notifications').insert({
            user_id: newProfile[0].id,
            company_id: request.company_id,
            type: 'info',
            title: 'Holiday Request Assigned',
            body: `A holiday request has been reassigned to you (${request.start_date} to ${request.end_date})`,
            link: '/app/holiday-approvals',
          })
        }
      }
    }

    const { error: updateErr } = await supabase.from('holiday_requests').update(update).eq('id', requestId)
    if (updateErr) return res.status(500).json({ error: 'Failed to update request' })

    // Send notification
    if (notifyUserId && notifyTitle) {
      await supabase.from('notifications').insert({
        user_id: notifyUserId,
        company_id: request.company_id,
        type: action === 'approve' ? 'success' : action === 'reject' ? 'error' : 'info',
        title: notifyTitle,
        body: notifyBody,
        link: notifyLink,
      })
    }

    // Audit log
    await supabase.from('holiday_audit_log').insert({
      holiday_request_id: requestId,
      action,
      actor_id: callerId,
      actor_name: callerName,
      actor_role: callerRole,
      details: { note, new_approver_id: newApproverId },
    })

    return res.json({ success: true, action })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
