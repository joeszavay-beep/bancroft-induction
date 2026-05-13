import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import { authFetch } from '../lib/authFetch'
import { getSession } from '../lib/storage'
import { calculateEndDate, formatDateWithDay, modeLabel, durationUnit, nextWorkingDay } from '../lib/programmeCalc'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calculator, Calendar, Plus, GripVertical, Pencil, Trash2, Copy, ChevronDown, ChevronRight, FolderOpen, Settings, AlertTriangle, Info } from 'lucide-react'

const WEEKDAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

const MODE_OPTIONS = [
  { value: 'calendar_days', label: 'Calendar Days' },
  { value: 'working_days', label: 'Working Days' },
  { value: 'monday_start_working_days', label: 'Monday-Start Working Days' },
]

function modeBadge(mode) {
  const styles = {
    calendar_days: 'bg-blue-100 text-blue-700',
    working_days: 'bg-emerald-100 text-emerald-700',
    monday_start_working_days: 'bg-teal-100 text-teal-700',
  }
  const labels = {
    calendar_days: 'Calendar',
    working_days: 'Working',
    monday_start_working_days: 'Mon-Start',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[mode] || 'bg-slate-100 text-slate-500'}`}>
      {labels[mode] || mode}
    </span>
  )
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// ── Sortable row for dnd-kit ──
function SortableRow({ task, index, onEdit, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <tr ref={setNodeRef} style={style} className="border-b hover:bg-black/[0.02] transition-colors" >
      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--text-muted)' }}>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-black/5 transition-colors">
          <GripVertical size={14} />
        </button>
      </td>
      <td className="px-2 py-2.5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>{index + 1}</td>
      <td className="px-3 py-2.5 font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{task.name}</td>
      <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>{task.trade || '--'}</td>
      <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(task.start_date)}</td>
      <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
        {task.duration} {durationUnit(task.mode)}
      </td>
      <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(task.end_date)}</td>
      <td className="px-3 py-2.5">{modeBadge(task.mode)}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(task)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }} title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDuplicate(task)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }} title="Duplicate">
            <Copy size={14} />
          </button>
          <button onClick={() => onDelete(task)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}


export default function ProgrammeCalculator() {
  const { user } = useCompany()
  const { projectId, projectName } = useProject()
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const cid = user?.company_id

  // ── Calendar settings state ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workingDays, setWorkingDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [useBankHolidays, setUseBankHolidays] = useState(true)
  const [nonWorkingPeriods, setNonWorkingPeriods] = useState([])
  const [savingSettings, setSavingSettings] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)

  // Non-working period inline form
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [periodName, setPeriodName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  // Recalculate confirmation modal
  const [recalcModal, setRecalcModal] = useState(false)
  const [recalcCount, setRecalcCount] = useState(0)
  const [recalculating, setRecalculating] = useState(false)

  // ── Task list state ──
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  // Bank holidays (for preview calculations)
  const [bankHolidays, setBankHolidays] = useState([])

  // Task modal state
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null) // null = add, object = edit
  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    trade: '',
    mode: 'working_days',
    start_date: todayISO(),
    duration: 5,
    notes: '',
  })
  const [savingTask, setSavingTask] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Calendar settings object for calculations ──
  const calendarSettings = useMemo(() => ({
    workingDays,
    bankHolidays,
    nonWorkingPeriods,
  }), [workingDays, bankHolidays, nonWorkingPeriods])

  // ── Live preview for task modal ──
  const livePreview = useMemo(() => {
    if (!taskForm.start_date || !taskForm.duration || taskForm.duration < 1) return null
    return calculateEndDate(taskForm.start_date, Number(taskForm.duration), taskForm.mode, calendarSettings)
  }, [taskForm.start_date, taskForm.duration, taskForm.mode, calendarSettings])

  // ── Data loading ──
  const loadSettings = useCallback(async () => {
    if (!projectId) return
    setLoadingSettings(true)
    try {
      const res = await authFetch(`/api/programme-calc?action=settings&projectId=${projectId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setWorkingDays(data.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'])
      setUseBankHolidays(data.use_uk_bank_holidays !== false)
      setNonWorkingPeriods(data.non_working_periods || [])
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
    setLoadingSettings(false)
  }, [projectId])

  const loadTasks = useCallback(async () => {
    if (!projectId) return
    setLoadingTasks(true)
    try {
      const res = await authFetch(`/api/programme-calc?action=tasks&projectId=${projectId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTasks(data.tasks || [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
    }
    setLoadingTasks(false)
  }, [projectId])

  const loadBankHolidays = useCallback(async () => {
    try {
      const thisYear = new Date().getFullYear()
      const res = await authFetch(`/api/bank-holidays?from=${thisYear}&to=${thisYear + 2}`)
      const data = await res.json()
      setBankHolidays(data.holidays || data || [])
    } catch (err) {
      console.error('Failed to load bank holidays:', err)
    }
  }, [])

  useEffect(() => {
    if (projectId) {
      loadSettings()
      loadTasks()
      loadBankHolidays()
    } else {
      setTasks([])
      setNonWorkingPeriods([])
      setWorkingDays(['mon', 'tue', 'wed', 'thu', 'fri'])
      setUseBankHolidays(true)
    }
  }, [projectId, loadSettings, loadTasks, loadBankHolidays])

  // ── Save settings ──
  async function handleSaveSettings() {
    if (workingDays.length === 0) {
      toast.error('At least one working day is required')
      return
    }
    setSavingSettings(true)
    try {
      const res = await authFetch('/api/programme-calc?action=settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          workingDays,
          useUkBankHolidays: useBankHolidays,
          nonWorkingPeriods,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Calendar settings saved')

      // If tasks exist, offer to recalculate
      if (tasks.length > 0) {
        setRecalcCount(tasks.length)
        setRecalcModal(true)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save settings')
    }
    setSavingSettings(false)
  }

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const res = await authFetch('/api/programme-calc?action=recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(`${data.updated || recalcCount} tasks recalculated`)
      await loadTasks()
    } catch (err) {
      toast.error(err.message || 'Recalculation failed')
    }
    setRecalculating(false)
    setRecalcModal(false)
  }

  // ── Non-working period ──
  function handleAddPeriod() {
    if (!periodName.trim() || !periodStart || !periodEnd) {
      toast.error('All period fields are required')
      return
    }
    if (periodEnd < periodStart) {
      toast.error('End date must be after start date')
      return
    }
    setNonWorkingPeriods(prev => [...prev, {
      name: periodName.trim(),
      start_date: periodStart,
      end_date: periodEnd,
    }])
    setPeriodName('')
    setPeriodStart('')
    setPeriodEnd('')
    setShowPeriodForm(false)
  }

  function handleRemovePeriod(idx) {
    setNonWorkingPeriods(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Working days toggle ──
  function toggleWorkingDay(day) {
    setWorkingDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    )
  }

  // ── Task modal ──
  function openAddTask() {
    setEditingTask(null)
    setTaskForm({
      name: '',
      description: '',
      trade: '',
      mode: 'working_days',
      start_date: todayISO(),
      duration: 5,
      notes: '',
    })
    setTaskModalOpen(true)
  }

  function openEditTask(task) {
    setEditingTask(task)
    setTaskForm({
      name: task.name || '',
      description: task.description || '',
      trade: task.trade || '',
      mode: task.mode || 'working_days',
      start_date: task.start_date || todayISO(),
      duration: task.duration || 5,
      notes: task.notes || '',
    })
    setTaskModalOpen(true)
  }

  async function handleSaveTask() {
    if (!taskForm.name.trim()) {
      toast.error('Task name is required')
      return
    }
    if (!taskForm.start_date) {
      toast.error('Start date is required')
      return
    }
    if (!taskForm.duration || taskForm.duration < 1) {
      toast.error('Duration must be at least 1')
      return
    }
    setSavingTask(true)
    try {
      const method = editingTask ? 'PATCH' : 'POST'
      const body = {
        projectId,
        ...taskForm,
        duration: Number(taskForm.duration),
        ...(editingTask ? { id: editingTask.id } : {}),
      }
      const res = await authFetch('/api/programme-calc?action=task', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(editingTask ? 'Task updated' : 'Task created')
      setTaskModalOpen(false)
      await loadTasks()
    } catch (err) {
      toast.error(err.message || 'Failed to save task')
    }
    setSavingTask(false)
  }

  // ── Duplicate ──
  async function handleDuplicate(task) {
    try {
      const res = await authFetch(`/api/programme-calc?action=duplicate&id=${task.id}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Task duplicated')
      await loadTasks()
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate task')
    }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/programme-calc?action=task&id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Task deleted')
      setDeleteTarget(null)
      await loadTasks()
    } catch (err) {
      toast.error(err.message || 'Failed to delete task')
    }
    setDeleting(false)
  }

  // ── Drag end → reorder ──
  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tasks.findIndex(t => t.id === active.id)
    const newIndex = tasks.findIndex(t => t.id === over.id)
    const reordered = arrayMove(tasks, oldIndex, newIndex)
    setTasks(reordered)

    // Persist new order
    try {
      const sortOrders = reordered.map((t, i) => ({ id: t.id, sort_order: i }))
      await authFetch('/api/programme-calc?action=reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sortOrders }),
      })
    } catch (err) {
      console.error('Reorder failed:', err)
      toast.error('Failed to save order')
      await loadTasks()
    }
  }

  // ── No project selected ──
  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">Select a project</p>
        <p className="text-xs mt-1">Choose a project from the sidebar to use the Programme Calculator</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ background: 'var(--primary-color)', color: '#fff' }}>
          <Calculator size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Programme Calculator</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{projectName || 'Project'} — task scheduling with calendar awareness</p>
        </div>
      </div>

      {/* ─── Section 1: Calendar Settings (collapsible) ─── */}
      <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-black/[0.02] transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Calendar Settings</span>
          </div>
          {settingsOpen ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {settingsOpen && (
          <div className="px-4 pb-4 space-y-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
            {/* Working week */}
            <div className="pt-4">
              <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-primary)' }}>Working Week</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(d => (
                  <button
                    key={d.key}
                    onClick={() => toggleWorkingDay(d.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      background: workingDays.includes(d.key) ? 'var(--primary-color)' : 'transparent',
                      color: workingDays.includes(d.key) ? '#fff' : 'var(--text-muted)',
                      borderColor: workingDays.includes(d.key) ? 'var(--primary-color)' : 'var(--border-color)',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {workingDays.length === 0 && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> At least one working day is required
                </p>
              )}
            </div>

            {/* UK Bank Holidays toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold block" style={{ color: 'var(--text-primary)' }}>UK Bank Holidays</label>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Exclude UK bank holidays from working day counts</p>
              </div>
              <button
                onClick={() => setUseBankHolidays(!useBankHolidays)}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: useBankHolidays ? 'var(--primary-color)' : 'var(--border-color)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{ left: useBankHolidays ? '22px' : '2px' }}
                />
              </button>
            </div>

            {/* Non-working periods */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Non-Working Periods</label>
                <button
                  onClick={() => setShowPeriodForm(!showPeriodForm)}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors hover:bg-black/[0.02]"
                  style={{ color: 'var(--primary-color)', borderColor: 'var(--border-color)' }}
                >
                  <Plus size={12} /> Add Period
                </button>
              </div>

              {nonWorkingPeriods.length > 0 && (
                <div className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: 'var(--border-color)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Start</th>
                        <th className="text-left px-3 py-2">End</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonWorkingPeriods.map((p, idx) => (
                        <tr key={idx} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(p.start_date)}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(p.end_date)}</td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleRemovePeriod(idx)}
                              className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {nonWorkingPeriods.length === 0 && !showPeriodForm && (
                <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No non-working periods defined</p>
              )}

              {showPeriodForm && (
                <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
                    <input
                      type="text"
                      value={periodName}
                      onChange={e => setPeriodName(e.target.value)}
                      placeholder="e.g. Christmas"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                    />
                  </div>
                  <div className="min-w-[130px]">
                    <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Start</label>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={e => setPeriodStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                    />
                  </div>
                  <div className="min-w-[130px]">
                    <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>End</label>
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={e => setPeriodEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                    />
                  </div>
                  <button
                    onClick={handleAddPeriod}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                    style={{ background: 'var(--primary-color)' }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <LoadingButton
                loading={savingSettings}
                onClick={handleSaveSettings}
                className="text-sm text-white"
                style={{ background: 'var(--primary-color)' }}
              >
                Save Settings
              </LoadingButton>
            </div>
          </div>
        )}
      </div>

      {/* ─── Section 2: Task List ─── */}
      <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Programme Tasks</span>
            {tasks.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--border-color)', color: 'var(--text-muted)' }}>
                {tasks.length}
              </span>
            )}
          </div>
          <button
            onClick={openAddTask}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
            style={{ background: 'var(--primary-color)' }}
          >
            <Plus size={14} /> Add Task
          </button>
        </div>

        {loadingTasks ? (
          <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-current border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'var(--text-muted)' }}>
            <Calendar size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs mt-1">Add your first task to start building the programme</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
                      <th className="px-2 py-2.5 w-10"></th>
                      <th className="px-2 py-2.5 text-center w-10">#</th>
                      <th className="px-3 py-2.5 text-left">Name</th>
                      <th className="px-3 py-2.5 text-left">Trade</th>
                      <th className="px-3 py-2.5 text-left">Start</th>
                      <th className="px-3 py-2.5 text-left">Duration</th>
                      <th className="px-3 py-2.5 text-left">End</th>
                      <th className="px-3 py-2.5 text-left">Mode</th>
                      <th className="px-2 py-2.5 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, index) => (
                      <SortableRow
                        key={task.id}
                        task={task}
                        index={index}
                        onEdit={openEditTask}
                        onDuplicate={handleDuplicate}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* ─── Task Modal (Add/Edit) ─── */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Edit Task' : 'Add Task'}>
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Name *</label>
            <input
              type="text"
              value={taskForm.name}
              onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ground Floor Slab"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Description</label>
            <textarea
              value={taskForm.description}
              onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Trade */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Trade</label>
            <input
              type="text"
              value={taskForm.trade}
              onChange={e => setTaskForm(f => ({ ...f, trade: e.target.value }))}
              placeholder="e.g. Groundworks"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Calendar mode */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-primary)' }}>Calendar Mode</label>
            <div className="space-y-1.5">
              {MODE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="calendarMode"
                    value={opt.value}
                    checked={taskForm.mode === opt.value}
                    onChange={() => setTaskForm(f => ({ ...f, mode: opt.value }))}
                    className="accent-current"
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Start Date</label>
            <input
              type="date"
              value={taskForm.start_date}
              onChange={e => setTaskForm(f => ({ ...f, start_date: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={taskForm.duration}
                onChange={e => setTaskForm(f => ({ ...f, duration: e.target.value }))}
                className="w-24 px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{durationUnit(taskForm.mode)}</span>
            </div>
          </div>

          {/* Live preview */}
          {livePreview && (
            <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info size={13} style={{ color: 'var(--primary-color)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Calculated End Date</span>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--primary-color)' }}>
                {formatDateWithDay(livePreview.endDate)}
              </p>
              {livePreview.snappedStart && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Start snapped to {formatDateWithDay(livePreview.snappedStart)}
                </p>
              )}
              {livePreview.warnings?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {livePreview.warnings.map((w, i) => (
                    <p key={i} className="text-xs flex items-start gap-1 text-amber-600">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Notes</label>
            <textarea
              value={taskForm.notes}
              onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Save button */}
          <LoadingButton
            loading={savingTask}
            onClick={handleSaveTask}
            className="w-full text-sm text-white mt-2"
            style={{ background: 'var(--primary-color)' }}
          >
            {editingTask ? 'Update Task' : 'Create Task'}
          </LoadingButton>
        </div>
      </Modal>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Task">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-black/[0.02]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <LoadingButton
              loading={deleting}
              onClick={handleDelete}
              className="flex-1 text-sm text-white bg-red-500 hover:bg-red-600"
            >
              Delete
            </LoadingButton>
          </div>
        </div>
      </Modal>

      {/* ─── Recalculate Confirmation Modal ─── */}
      <Modal open={recalcModal} onClose={() => setRecalcModal(false)} title="Recalculate Tasks">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Recalculate <strong>{recalcCount}</strong> task{recalcCount !== 1 ? 's' : ''} with the new calendar settings?
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            This will update all end dates based on the updated working days, bank holidays, and non-working periods.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setRecalcModal(false)}
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-black/[0.02]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              No
            </button>
            <LoadingButton
              loading={recalculating}
              onClick={handleRecalculate}
              className="flex-1 text-sm text-white"
              style={{ background: 'var(--primary-color)' }}
            >
              Yes, Recalculate
            </LoadingButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}
