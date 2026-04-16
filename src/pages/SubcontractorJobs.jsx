import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { formatMoney, parseMoney, JOB_STATUSES, TRAFFIC_LIGHT_COLORS } from '../lib/subcontractor'
import toast from 'react-hot-toast'
import {
  Plus, Search, Briefcase, PoundSterling, ArrowUpDown, ChevronUp, ChevronDown,
  X, Loader2, Activity
} from 'lucide-react'

const STATUS_MAP = Object.fromEntries(JOB_STATUSES.map(s => [s.value, s]))

export default function SubcontractorJobs() {
  const navigate = useNavigate()
  const { user } = useCompany()
  const cid = user?.company_id

  const [jobs, setJobs] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // New job form
  const [form, setForm] = useState({
    name: '', main_contractor: '', project_id: '', contract_value: '',
    start_date: '', est_completion_date: '', retention_pct: '5',
    payment_terms_days: '30', scope_description: '',
  })

  async function loadData() {
    setLoading(true)
    try {
      const [jobRes, projRes] = await Promise.all([
        supabase.from('subcontractor_jobs').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
      ])
      const jobIds = (jobRes.data || []).map(j => j.id)
      let varRes = { data: [] }
      if (jobIds.length > 0) {
        varRes = await supabase.from('job_variations').select('id, job_id, value, status').in('job_id', jobIds)
      }
      const variationsByJob = {}
      for (const v of (varRes.data || [])) {
        if (!variationsByJob[v.job_id]) variationsByJob[v.job_id] = []
        variationsByJob[v.job_id].push(v)
      }
      setJobs((jobRes.data || []).map(j => {
        const vars = variationsByJob[j.id] || []
        const approvedVariations = vars.filter(v => v.status === 'approved')
        const variationsTotal = approvedVariations.reduce((s, v) => s + (v.value || 0), 0)
        return {
          ...j,
          variations_count: vars.length,
          variations_total: variationsTotal,
          revised_value: (j.contract_value || 0) + variationsTotal,
        }
      }))
      setProjects(projRes.data || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load jobs')
    }
    setLoading(false)
  }

  useEffect(() => { if (cid) loadData() }, [cid])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Job name required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('subcontractor_jobs').insert({
        company_id: cid,
        project_id: form.project_id || null,
        name: form.name.trim(),
        main_contractor: form.main_contractor.trim(),
        contract_value: parseMoney(form.contract_value),
        start_date: form.start_date || null,
        est_completion_date: form.est_completion_date || null,
        retention_pct: parseFloat(form.retention_pct) || 5,
        payment_terms_days: parseInt(form.payment_terms_days) || 30,
        scope_description: form.scope_description.trim(),
        status: 'active',
        created_by: user?.id || null,
      })
      if (error) throw error
      toast.success('Job created')
      setShowForm(false)
      setForm({ name: '', main_contractor: '', project_id: '', contract_value: '', start_date: '', est_completion_date: '', retention_pct: '5', payment_terms_days: '30', scope_description: '' })
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to create job')
    }
    setSaving(false)
  }

  // Aggregates
  const aggregates = useMemo(() => {
    const total = jobs.length
    const active = jobs.filter(j => j.status === 'active').length
    const totalValue = jobs.reduce((s, j) => s + (j.revised_value || j.contract_value || 0), 0)
    return { total, active, totalValue }
  }, [jobs])

  // Filtered and sorted
  const displayJobs = useMemo(() => {
    let filtered = jobs
    if (statusFilter) filtered = filtered.filter(j => j.status === statusFilter)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      filtered = filtered.filter(j =>
        j.name?.toLowerCase().includes(q) ||
        j.main_contractor?.toLowerCase().includes(q)
      )
    }
    return [...filtered].sort((a, b) => {
      let va = a[sortField]
      let vb = b[sortField]
      if (va == null) va = ''
      if (vb == null) vb = ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [jobs, statusFilter, searchTerm, sortField, sortDir])

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-slate-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-500" />
      : <ChevronDown size={12} className="text-blue-500" />
  }

  function getTrafficLight(job) {
    if (!job.contract_value) return null
    const margin = job.revised_value - (job.contract_value || 0)
    const marginPct = job.contract_value > 0 ? (margin / job.contract_value) * 100 : 0
    // Simple heuristic: green if positive variations, amber if tight, red if negative
    if (job.variations_total < 0) return 'red'
    if (marginPct <= 5 && job.variations_count > 0) return 'amber'
    return 'green'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Subcontractor Jobs</h1>
          <p className="text-sm text-slate-500">Manage jobs, operatives and commercial tracking</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> New Job
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={Briefcase} label="Total Jobs" value={aggregates.total} color="blue" />
        <SummaryCard icon={Activity} label="Active Jobs" value={aggregates.active} color="green" />
        <SummaryCard icon={PoundSterling} label="Total Contract Value" value={formatMoney(aggregates.totalValue)} color="slate" />
      </div>

      {/* Search / filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-400"
        >
          <option value="">All Statuses</option>
          {JOB_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Jobs table */}
      {displayJobs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Briefcase size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{jobs.length === 0 ? 'No jobs yet' : 'No matching jobs'}</p>
          <p className="text-xs text-slate-400 mt-1">Create your first job to start tracking costs and timesheets</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { key: 'name', label: 'Job Name' },
                    { key: 'main_contractor', label: 'Main Contractor' },
                    { key: 'contract_value', label: 'Contract Value' },
                    { key: 'revised_value', label: 'Revised Value' },
                    { key: 'status', label: 'Status' },
                    { key: 'margin', label: '' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => col.key !== 'margin' && handleSort(col.key)}
                      className={`text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap ${col.key !== 'margin' ? 'cursor-pointer hover:text-slate-700 select-none' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key !== 'margin' && <SortIcon field={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayJobs.map(job => {
                  const sc = STATUS_MAP[job.status] || { label: job.status, color: 'slate' }
                  const tl = getTrafficLight(job)
                  const tlc = tl ? TRAFFIC_LIGHT_COLORS[tl] : null
                  return (
                    <tr
                      key={job.id}
                      onClick={() => navigate(`/app/jobs/${job.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{job.name}</td>
                      <td className="px-4 py-3 text-slate-600">{job.main_contractor || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{formatMoney(job.contract_value)}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">
                        {job.variations_count > 0 ? formatMoney(job.revised_value) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${sc.color}-100 text-${sc.color}-700`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tlc && <span className={`inline-block w-3 h-3 rounded-full ${tlc.dot}`} title={tlc.label} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create job modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">New Job</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <Field label="Job Name *">
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field" placeholder="e.g. M&E First Fix — Block A" required />
              </Field>
              <Field label="Main Contractor">
                <input type="text" value={form.main_contractor} onChange={e => setForm(f => ({ ...f, main_contractor: e.target.value }))}
                  className="input-field" placeholder="e.g. Balfour Beatty" />
              </Field>
              <Field label="Project">
                <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className="input-field">
                  <option value="">— Select project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contract Value">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">£</span>
                    <input type="text" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                      className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" />
                  </div>
                </Field>
                <Field label="Retention %">
                  <input type="number" step="0.5" value={form.retention_pct} onChange={e => setForm(f => ({ ...f, retention_pct: e.target.value }))}
                    className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start Date">
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="input-field" />
                </Field>
                <Field label="Est. Completion">
                  <input type="date" value={form.est_completion_date} onChange={e => setForm(f => ({ ...f, est_completion_date: e.target.value }))} className="input-field" />
                </Field>
              </div>
              <Field label="Payment Terms (days)">
                <input type="number" value={form.payment_terms_days} onChange={e => setForm(f => ({ ...f, payment_terms_days: e.target.value }))}
                  className="input-field" />
              </Field>
              <Field label="Scope Description">
                <textarea value={form.scope_description} onChange={e => setForm(f => ({ ...f, scope_description: e.target.value }))}
                  rows={3} className="input-field" placeholder="Brief description of works..." />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input-field {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: #1e293b;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: #3b82f6;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function SummaryCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color] || colors.slate}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} />
        <span className="text-[11px] font-medium opacity-70">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
