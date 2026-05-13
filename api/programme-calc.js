import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

// Duplicate the calculation logic server-side (same as src/lib/programmeCalc.js)
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function toISO(d) { return d.toISOString().split('T')[0] }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function isWorkingDay(date, settings) {
  const { workingDays = ['mon','tue','wed','thu','fri'], bankHolidays = [], nonWorkingPeriods = [] } = settings
  const dayName = DAY_NAMES[date.getDay()]
  const dateStr = toISO(date)
  if (!workingDays.includes(dayName)) return false
  if (bankHolidays.some(bh => bh.date === dateStr)) return false
  if (nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)) return false
  return true
}

function calculateEndDate(startDate, duration, mode, settings = {}) {
  if (!startDate || !duration || duration < 1) return { endDate: startDate || '' }
  const start = new Date(startDate + 'T00:00:00')

  if (mode === 'calendar_days') return { endDate: toISO(addDays(start, duration - 1)) }

  let effectiveStart = new Date(start)
  if (mode === 'monday_start_working_days') {
    const workingDays = settings.workingDays || ['mon','tue','wed','thu','fri']
    const targetDayIdx = DAY_NAMES.indexOf(workingDays[0] || 'mon')
    const currentDayIdx = effectiveStart.getDay()
    if (currentDayIdx !== targetDayIdx) {
      let daysToAdd = (targetDayIdx - currentDayIdx + 7) % 7
      if (daysToAdd === 0) daysToAdd = 7
      effectiveStart = addDays(effectiveStart, daysToAdd)
    }
  }

  let cursor = new Date(effectiveStart)
  while (!isWorkingDay(cursor, settings)) cursor = addDays(cursor, 1)

  let counted = 0
  while (counted < duration) {
    if (isWorkingDay(cursor, settings)) {
      counted++
      if (counted === duration) break
    }
    cursor = addDays(cursor, 1)
  }
  return { endDate: toISO(cursor) }
}

function nextWorkingDay(dateStr, settings) {
  let cursor = addDays(new Date(dateStr + 'T00:00:00'), 1)
  let i = 0
  while (!isWorkingDay(cursor, settings) && i < 365) { cursor = addDays(cursor, 1); i++ }
  return toISO(cursor)
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const action = req.query.action || req.body?.action

  // Helper: load calendar settings for a project
  async function loadSettings(projectId) {
    const { data: cal } = await supabase.from('project_calendar_settings').select('*').eq('project_id', projectId).single()
    const settings = cal || { working_days: ['mon','tue','wed','thu','fri'], use_uk_bank_holidays: true }
    const { data: periods } = await supabase.from('project_non_working_periods').select('*').eq('project_id', projectId).order('start_date')
    let bankHolidays = []
    if (settings.use_uk_bank_holidays) {
      const { data: bh } = await supabase.from('uk_bank_holidays').select('date, name').eq('division', 'england-and-wales')
      bankHolidays = bh || []
    }
    return {
      workingDays: settings.working_days || ['mon','tue','wed','thu','fri'],
      bankHolidays,
      nonWorkingPeriods: periods || [],
    }
  }

  // ── GET: settings or tasks ──
  if (req.method === 'GET') {
    const projectId = req.query.projectId
    if (!projectId) return res.status(400).json({ error: 'Missing projectId' })

    if (action === 'settings') {
      const { data: cal } = await supabase.from('project_calendar_settings').select('*').eq('project_id', projectId).single()
      const { data: periods } = await supabase.from('project_non_working_periods').select('*').eq('project_id', projectId).order('start_date')
      return res.json({
        settings: cal || { project_id: projectId, working_days: ['mon','tue','wed','thu','fri'], use_uk_bank_holidays: true },
        nonWorkingPeriods: periods || [],
      })
    }

    if (action === 'tasks') {
      const { data } = await supabase.from('programme_tasks').select('*').eq('project_id', projectId).order('sort_order')
      return res.json({ tasks: data || [] })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── POST: create task, duplicate, add non-working period, recalculate ──
  if (req.method === 'POST') {
    if (action === 'task') {
      const b = req.body
      const projectId = b.projectId
      const name = b.name
      const description = b.description
      const startDate = b.startDate || b.start_date
      const duration = Number(b.duration)
      const calendarMode = b.calendarMode || b.calendar_mode || b.mode || 'monday_start_working_days'
      const trade = b.trade
      const notes = b.notes

      const missing = []
      if (!projectId) missing.push('projectId')
      if (!name) missing.push('name')
      if (!startDate) missing.push('start_date')
      if (!duration) missing.push('duration')
      if (missing.length > 0) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
      if (duration < 1) return res.status(400).json({ error: 'Duration must be at least 1' })

      const settings = await loadSettings(projectId)
      const { endDate } = calculateEndDate(startDate, duration, calendarMode, settings)

      // Get next sort_order
      const { data: lastTask } = await supabase.from('programme_tasks').select('sort_order').eq('project_id', projectId).order('sort_order', { ascending: false }).limit(1)
      const sortOrder = (lastTask?.[0]?.sort_order || 0) + 1

      const { data, error } = await supabase.from('programme_tasks').insert({
        project_id: projectId, name: name.trim(), description: description?.trim() || null,
        start_date: startDate, duration, end_date: endDate,
        calendar_mode: calendarMode || 'monday_start_working_days',
        trade: trade?.trim() || null, notes: notes?.trim() || null, sort_order: sortOrder,
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, task: data })
    }

    if (action === 'duplicate') {
      const taskId = req.query.id || req.body.id
      if (!taskId) return res.status(400).json({ error: 'Missing task id' })

      const { data: original } = await supabase.from('programme_tasks').select('*').eq('id', taskId).single()
      if (!original) return res.status(404).json({ error: 'Task not found' })

      const settings = await loadSettings(original.project_id)
      const newStart = nextWorkingDay(original.end_date, settings)
      const { endDate } = calculateEndDate(newStart, original.duration, original.calendar_mode, settings)

      const { data: lastTask } = await supabase.from('programme_tasks').select('sort_order').eq('project_id', original.project_id).order('sort_order', { ascending: false }).limit(1)
      const sortOrder = (lastTask?.[0]?.sort_order || 0) + 1

      const { data, error } = await supabase.from('programme_tasks').insert({
        project_id: original.project_id, name: original.name + ' (copy)',
        description: original.description, start_date: newStart, duration: original.duration,
        end_date: endDate, calendar_mode: original.calendar_mode,
        trade: original.trade, notes: original.notes, sort_order: sortOrder,
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, task: data })
    }

    if (action === 'non-working-period') {
      const { projectId, name, startDate, endDate } = req.body
      if (!projectId || !name || !startDate || !endDate) return res.status(400).json({ error: 'Missing fields' })
      const { data, error } = await supabase.from('project_non_working_periods').insert({
        project_id: projectId, name: name.trim(), start_date: startDate, end_date: endDate,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, period: data })
    }

    if (action === 'recalculate') {
      const projectId = req.body.projectId
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })

      const settings = await loadSettings(projectId)
      const { data: tasks } = await supabase.from('programme_tasks').select('*').eq('project_id', projectId)
      let changed = 0
      for (const task of (tasks || [])) {
        const { endDate } = calculateEndDate(task.start_date, task.duration, task.calendar_mode, settings)
        if (endDate !== task.end_date) {
          await supabase.from('programme_tasks').update({ end_date: endDate, updated_at: new Date().toISOString() }).eq('id', task.id)
          changed++
        }
      }
      return res.json({ success: true, total: (tasks || []).length, changed })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── PATCH: update task, settings, reorder ──
  if (req.method === 'PATCH') {
    if (action === 'task') {
      const bp = req.body
      const id = bp.id
      const name = bp.name
      const description = bp.description
      const startDate = bp.startDate || bp.start_date
      const duration = bp.duration ? Number(bp.duration) : null
      const calendarMode = bp.calendarMode || bp.calendar_mode || bp.mode
      const trade = bp.trade
      const notes = bp.notes
      if (!id) return res.status(400).json({ error: 'Missing task id' })

      const { data: existing } = await supabase.from('programme_tasks').select('*').eq('id', id).single()
      if (!existing) return res.status(404).json({ error: 'Task not found' })

      const finalStart = startDate || existing.start_date
      const finalDuration = duration || existing.duration
      const finalMode = calendarMode || existing.calendar_mode

      const settings = await loadSettings(existing.project_id)
      const { endDate } = calculateEndDate(finalStart, finalDuration, finalMode, settings)

      const updates = { updated_at: new Date().toISOString(), end_date: endDate }
      if (name !== undefined) updates.name = name.trim()
      if (description !== undefined) updates.description = description?.trim() || null
      if (startDate) updates.start_date = startDate
      if (duration) updates.duration = duration
      if (calendarMode) updates.calendar_mode = calendarMode
      if (trade !== undefined) updates.trade = trade?.trim() || null
      if (notes !== undefined) updates.notes = notes?.trim() || null

      const { error } = await supabase.from('programme_tasks').update(updates).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, endDate })
    }

    if (action === 'settings') {
      const { projectId, workingDays, useUkBankHolidays, nonWorkingPeriods } = req.body
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })
      if (workingDays && workingDays.length === 0) return res.status(400).json({ error: 'At least one working day required' })

      const updates = { updated_at: new Date().toISOString() }
      if (workingDays) updates.working_days = workingDays
      if (useUkBankHolidays !== undefined) updates.use_uk_bank_holidays = useUkBankHolidays

      await supabase.from('project_calendar_settings').upsert({
        project_id: projectId, ...updates,
      }, { onConflict: 'project_id' })

      // Sync non-working periods: delete all existing for this project, re-insert
      if (nonWorkingPeriods !== undefined) {
        await supabase.from('project_non_working_periods').delete().eq('project_id', projectId)
        const rows = (nonWorkingPeriods || []).filter(p => p.name && p.start_date && p.end_date).map(p => ({
          project_id: projectId, name: p.name, start_date: p.start_date, end_date: p.end_date,
        }))
        if (rows.length > 0) {
          await supabase.from('project_non_working_periods').insert(rows)
        }
      }

      return res.json({ success: true })
    }

    if (action === 'reorder') {
      const { tasks } = req.body // [{ id, sort_order }]
      if (!tasks?.length) return res.status(400).json({ error: 'Missing tasks' })
      for (const t of tasks) {
        await supabase.from('programme_tasks').update({ sort_order: t.sort_order }).eq('id', t.id)
      }
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    if (action === 'task') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await supabase.from('programme_tasks').delete().eq('id', id)
      return res.json({ success: true })
    }

    if (action === 'non-working-period') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await supabase.from('project_non_working_periods').delete().eq('id', id)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
