import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

const EDITABLE_FIELDS = [
  'date_of_birth', 'ni_number', 'address', 'mobile',
  'next_of_kin', 'next_of_kin_phone',
  'card_number', 'card_type', 'card_expiry',
]

function validateDOB(v) {
  if (!v) return 'Date of birth is required'
  const d = new Date(v); if (isNaN(d)) return 'Invalid date'
  const age = (new Date() - d) / (365.25 * 864e5)
  if (age < 16) return 'Must be at least 16 years old'
  if (age > 100) return 'Invalid date of birth'
  return null
}
function validateNI(v) {
  if (!v) return null
  const ni = v.replace(/\s/g, '').toUpperCase()
  if (!/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(ni)) return 'Invalid NI number format'
  if (['BG','GB','NK','KN','TN','NT','ZZ'].includes(ni.slice(0,2))) return 'Invalid NI number prefix'
  return null
}
function validateUKMobile(v) {
  if (!v) return null
  const c = v.replace(/[\s\-()]/g, '')
  if (/^07\d{9}$/.test(c) || /^\+447\d{9}$/.test(c)) return null
  return 'Enter a valid UK mobile number'
}
function validateUKPhone(v) {
  if (!v) return null
  const c = v.replace(/[\s\-()]/g, '')
  if (/^0\d{10,11}$/.test(c) || /^\+44\d{10,11}$/.test(c)) return null
  return 'Enter a valid UK phone number'
}
function normalisePhone(v) {
  if (!v) return v
  const c = v.replace(/[\s\-()]/g, '')
  if (/^07\d{9}$/.test(c)) return '+44' + c.slice(1)
  return v.trim()
}

const VALIDATORS = {
  date_of_birth: validateDOB,
  ni_number: validateNI,
  mobile: validateUKMobile,
  next_of_kin_phone: validateUKPhone,
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const { operativeId, fields } = req.body
  if (!operativeId || !fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing operativeId or fields' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Permission check
  let editorName = 'Unknown'
  let editorId = null
  let editorRole = null

  const { operativeSessionId, managerCompanyId, managerName: reqManagerName } = req.body

  const { user } = await verifyAuth(req)
  if (user) {
    const meta = user.user_metadata || {}
    editorRole = meta.role || 'manager'
    editorName = meta.name || user.email || 'Manager'
    editorId = user.id
    // Verify manager belongs to same company
    if (['manager', 'admin', 'super_admin'].includes(editorRole)) {
      const { data: op } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
      if (!op || op.company_id !== meta.company_id) {
        return res.status(403).json({ error: 'Not authorised to edit this operative' })
      }
    }
  } else if (managerCompanyId) {
    // Fallback for managers when Supabase Auth session token isn't available
    const { data: op } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
    if (!op || op.company_id !== managerCompanyId) {
      return res.status(403).json({ error: 'Not authorised to edit this operative' })
    }
    editorName = reqManagerName || 'Manager'
    editorId = null
    editorRole = 'manager'
  } else if (operativeSessionId) {
    // Operative self-edit: session ID must match operative ID
    if (operativeSessionId !== operativeId) {
      return res.status(403).json({ error: 'Not authorised' })
    }
    const { data: op } = await supabase.from('operatives').select('name').eq('id', operativeId).single()
    editorName = op?.name || 'Operative'
    editorId = operativeId
    editorRole = 'operative'
  } else {
    return res.status(401).json({ error: 'Authentication required' })
  }

  // Filter to allowed fields only
  const update = {}
  const errors = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!EDITABLE_FIELDS.includes(key)) continue
    const trimmed = typeof value === 'string' ? value.trim() : value
    // Validate
    if (VALIDATORS[key]) {
      const err = VALIDATORS[key](trimmed)
      if (err) { errors[key] = err; continue }
    }
    // Normalise phone fields
    if (key === 'mobile' || key === 'next_of_kin_phone') {
      update[key] = normalisePhone(trimmed)
    } else if (key === 'ni_number' && trimmed) {
      update[key] = trimmed.replace(/\s/g, '').toUpperCase()
    } else {
      update[key] = trimmed || null
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors })
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  // Fetch current values for audit
  const { data: current } = await supabase.from('operatives').select('*').eq('id', operativeId).single()
  if (!current) return res.status(404).json({ error: 'Operative not found' })

  // Check for no-ops (value unchanged)
  const actualUpdates = {}
  for (const [key, value] of Object.entries(update)) {
    if (String(current[key] ?? '') !== String(value ?? '')) {
      actualUpdates[key] = value
    }
  }
  if (Object.keys(actualUpdates).length === 0) {
    return res.json({ success: true, updated: [] })
  }

  // Update
  const { error: updateErr } = await supabase.from('operatives').update(actualUpdates).eq('id', operativeId)
  if (updateErr) return res.status(500).json({ error: 'Failed to update: ' + updateErr.message })

  // Audit log
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const auditRows = Object.keys(actualUpdates).map(key => ({
    worker_id: operativeId,
    edited_by: editorName,
    edited_by_id: editorId,
    editor_role: editorRole,
    field_name: key === 'ni_number' ? 'ni_number_changed' : key,
    old_value: key === 'ni_number' ? null : String(current[key] ?? ''),
    new_value: key === 'ni_number' ? null : String(actualUpdates[key] ?? ''),
    ip_address: ip,
  }))

  if (auditRows.length > 0) {
    await supabase.from('profile_audit_log').insert(auditRows)
  }

  return res.json({ success: true, updated: Object.keys(actualUpdates) })
}
