import { useState, useCallback } from 'react'
import { Download, Upload, FileSpreadsheet, Printer, CalendarRange } from 'lucide-react'
import ProcurementCalendar from '../components/ProcurementCalendar'
import ProcurementTable from '../components/ProcurementTable'
import {
  DEFAULT_RULES, WEEKDAY_OPTIONS,
  parseLeadTime, fmtDate, fmtDateISO, computeMilestones,
} from '../lib/procurementSchedule'

// ── Algorithm panel ──
function AlgorithmPanel({ rules, setRules }) {
  const fields = [
    { key: 'deliveryWeeksBefore', label: 'Delivery: weeks before Required On Site', type: 'number', min: 0, max: 8 },
    { key: 'orderPlacedWeekday', label: 'Order Placed: weekday', type: 'weekday' },
    { key: 'approvalWeekday', label: 'Approval Required: weekday', type: 'weekday' },
    { key: 'techSubDaysBefore', label: 'Tech Sub: calendar days before Approval', type: 'number', min: 0, max: 60 },
    { key: 'techSubWeekday', label: 'Tech Sub: weekday', type: 'weekday' },
  ]

  return (
    <div className="flex-1 min-w-[300px] p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
        Scheduling Rules
      </h3>
      <div className="space-y-2.5">
        {fields.map(f => (
          <div key={f.key} className="flex items-center gap-3">
            <label className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{f.label}</label>
            {f.type === 'weekday' ? (
              <select value={rules[f.key]}
                onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}
                className="w-[120px] px-2 py-1.5 border text-sm"
                style={{ borderColor: 'var(--border-color)', background: '#FFFBEB', color: 'var(--text-primary)' }}>
                {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="number" value={rules[f.key]} min={f.min} max={f.max}
                onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                className="w-[72px] px-2 py-1.5 border text-sm text-center"
                style={{ borderColor: 'var(--border-color)', background: '#FFFBEB', color: 'var(--text-primary)' }} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs italic" style={{ color: 'var(--text-muted)' }}>
        Per item, enter Required On Site + Lead Time. Delivery, Order Placed, Approval Required and Tech Sub Issue dates auto-calculate.
      </p>
    </div>
  )
}

// ── Project header ──
function ProjectHeader({ header, setHeader }) {
  const fields = [
    { key: 'project', label: 'Project' },
    { key: 'stage', label: 'Stage / Sub-stage' },
    { key: 'projectNo', label: 'Project No.' },
    { key: 'revision', label: 'Revision' },
    { key: 'date', label: 'Date' },
    { key: 'trade', label: 'Trade' },
  ]

  return (
    <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg" style={{ background: 'var(--primary-color)', color: '#fff' }}>
          <CalendarRange size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Procurement Schedule</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Reverse-scheduled procurement tracker</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              {f.label}
            </label>
            <input type={f.key === 'date' ? 'date' : 'text'}
              value={header[f.key] || ''}
              onChange={e => setHeader(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full px-2 py-1.5 text-sm border border-transparent hover:border-[var(--border-color)] focus:border-[var(--primary-color)] outline-none transition-colors"
              style={{ color: 'var(--text-primary)', background: 'transparent' }}
              placeholder={'\u2014'}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CSV export helper ──
const CSV_HEADERS = ['ID', 'Description', 'Supplier', '1st Level', 'Tech Sub', 'Approval', 'Approved', 'Status', 'Order Placed', 'Lead Time', 'Delivery', 'On Site', 'Comments']

// ── Main page ──
export default function ProcurementScheduler() {
  const [header, setHeader] = useState({ project: '', stage: '', projectNo: '', revision: '', date: fmtDateISO(new Date()), trade: '' })
  const [rules, setRules] = useState({ ...DEFAULT_RULES })
  const [rows, setRows] = useState([])

  // Keep _leadWeeks synced
  const setRowsWrapped = useCallback(fn => {
    setRows(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      return next.map(r => ({ ...r, _leadWeeks: parseLeadTime(r.leadTime) }))
    })
  }, [])

  async function handleExportExcel() {
    const { exportToExcel } = await import('../lib/procurementExport.js')
    exportToExcel(header, rules, rows)
  }

  function handleExportCSV() {
    const csvRows = [CSV_HEADERS.join(',')]
    rows.forEach(row => {
      const lw = parseLeadTime(row.leadTime)
      const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
      csvRows.push([
        row.id, `"${(row.description || '').replace(/"/g, '""')}"`, `"${row.supplier || ''}"`,
        row.firstLevel || '', ms ? fmtDate(ms.techSubIssue) : '', ms ? fmtDate(ms.approvalRequired) : '',
        row.dateApproved ? fmtDate(row.dateApproved) : '', '', ms ? fmtDate(ms.orderPlaced) : '',
        row.leadTime || '', ms ? fmtDate(ms.delivery) : '', row.requiredOnSite ? fmtDate(row.requiredOnSite) : '',
        `"${(row.comments || '').replace(/"/g, '""')}"`,
      ].join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${header.projectNo || 'Procurement'}_${header.trade || ''}_Schedule_${header.revision || ''}_${fmtDateISO(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const { importFromExcel } = await import('../lib/procurementExport.js')
    const result = await importFromExcel(file)
    if (result) {
      if (result.header) setHeader(prev => ({ ...prev, ...result.header }))
      if (result.rules) setRules(prev => ({ ...prev, ...result.rules }))
      if (result.rows) setRowsWrapped(result.rows)
    }
    e.target.value = ''
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Region 1: Project Header */}
      <div className="rounded-xl border mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <ProjectHeader header={header} setHeader={setHeader} />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <FileSpreadsheet size={13} /> Export Excel
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Download size={13} /> Export CSV
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium cursor-pointer transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Upload size={13} /> Import .xlsx
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Region 2: Algorithm Panel + Calendar */}
      <div className="rounded-xl border mb-4 flex flex-wrap" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <AlgorithmPanel rules={rules} setRules={setRules} />
        <div className="w-px self-stretch" style={{ background: 'var(--border-color)' }} />
        <div className="flex-1 min-w-[340px] p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Date Calculator
          </h3>
          <ProcurementCalendar rules={rules} trackerRows={rows} />
        </div>
      </div>

      {/* Region 3: Tracker Table */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <ProcurementTable rows={rows} setRows={setRowsWrapped} rules={rules} />
      </div>

      <style>{`
        @media print {
          .max-w-\\[1400px\\] > div:nth-child(2) { display: none !important; }
          @page { size: A3 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}
