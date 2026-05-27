import { useState, useCallback } from 'react'
import { Download, Upload, FileSpreadsheet, Printer } from 'lucide-react'
import ProcurementCalendar from '../components/ProcurementCalendar'
import ProcurementTable from '../components/ProcurementTable'
import {
  DEFAULT_RULES, WEEKDAY_OPTIONS, SAMPLE_HEADER, SAMPLE_ROWS, SAMPLE_CATEGORIES,
  parseLeadTime, fmtDate, fmtDateISO, computeMilestones,
} from '../lib/procurementSchedule'

// ── Algorithm panel inputs ──
function AlgorithmPanel({ rules, setRules }) {
  const fields = [
    { key: 'deliveryWeeksBefore', label: 'Delivery: weeks before Required On Site', type: 'number', min: 0, max: 8 },
    { key: 'orderPlacedWeekday', label: 'Order Placed: weekday', type: 'weekday' },
    { key: 'approvalWeekday', label: 'Approval Required: weekday', type: 'weekday' },
    { key: 'techSubDaysBefore', label: 'Tech Sub: calendar days before Approval', type: 'number', min: 0, max: 60 },
    { key: 'techSubWeekday', label: 'Tech Sub: weekday', type: 'weekday' },
  ]

  return (
    <div style={{ flex: '1 1 360px', minWidth: 300, padding: 24 }}>
      <h3 style={{
        fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 600, color: 'var(--navy)',
        marginBottom: 16,
      }}>
        Scheduling Rules
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.3 }}>
              {f.label}
            </label>
            {f.type === 'weekday' ? (
              <select value={rules[f.key]} onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}
                style={{
                  width: 120, padding: '6px 8px', border: '1px solid var(--line)',
                  fontSize: 13, background: '#FFFBEB', color: 'var(--ink)',
                  fontFamily: "'Hanken Grotesk',sans-serif",
                }}>
                {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="number" value={rules[f.key]} min={f.min} max={f.max}
                onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                style={{
                  width: 72, padding: '6px 8px', border: '1px solid var(--line)',
                  fontSize: 13, textAlign: 'center', background: '#FFFBEB', color: 'var(--ink)',
                  fontFamily: "'Hanken Grotesk',sans-serif",
                }} />
            )}
          </div>
        ))}
      </div>
      <p style={{
        marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
        fontStyle: 'italic',
      }}>
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
    <div style={{ padding: '36px 48px 28px', borderBottom: '1px solid var(--line)' }}>
      <h1 style={{
        fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 700, color: 'var(--navy)',
        marginBottom: 24, lineHeight: 1.1,
      }}>
        Procurement Tracker
      </h1>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '12px 32px',
      }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{
              display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em',
              color: 'var(--muted)', fontWeight: 600, marginBottom: 4,
            }}>
              {f.label}
            </label>
            <input type={f.key === 'date' ? 'date' : 'text'}
              value={header[f.key] || ''}
              onChange={e => setHeader(prev => ({ ...prev, [f.key]: e.target.value }))}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid transparent',
                fontSize: 15, fontWeight: 500, color: 'var(--ink)',
                fontFamily: f.key === 'project' ? "'Fraunces',serif" : "'Hanken Grotesk',sans-serif",
                background: 'transparent',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--blue)'}
              onBlur={e => e.target.style.borderColor = 'transparent'}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ──
export default function ProcurementScheduler() {
  const [header, setHeader] = useState({
    ...SAMPLE_HEADER,
    date: fmtDateISO(new Date()),
  })
  const [rules, setRules] = useState({ ...DEFAULT_RULES })
  const [rows, setRows] = useState(SAMPLE_ROWS.map(r => ({
    ...r,
    status: {},
    dateApproved: '',
    comments: '',
    _leadWeeks: parseLeadTime(r.leadTime),
  })))

  // Keep _leadWeeks synced
  const setRowsWrapped = useCallback(fn => {
    setRows(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      return next.map(r => ({ ...r, _leadWeeks: parseLeadTime(r.leadTime) }))
    })
  }, [])

  // Excel export
  async function handleExportExcel() {
    const { exportToExcel } = await import('../lib/procurementExport.js')
    exportToExcel(header, rules, rows)
  }

  // CSV export
  function handleExportCSV() {
    const csvRows = [COLUMNS_FOR_CSV.map(c => c.label).join(',')]
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
    a.download = `${header.projectNo || 'Procurement'}_${header.trade || ''}_Tracker_${header.revision || ''}_${fmtDateISO(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Excel import
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
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* CSS variables */}
      <style>{`
        .ps-root {
          --navy: #0D1426; --navy-2: #16213B;
          --blue: #1B6FC8; --blue-ink: #155CA8; --blue-soft: #E9F1FB;
          --green: #2C9C5E; --green-soft: #E7F5EC; --green-line: #C4E6D1;
          --paper: #FFFFFF; --paper-2: #F5F7FA; --tint: #EEF2F7;
          --ink: #0D1426; --ink-2: #3A4254; --muted: #7C828F; --muted-2: #A2A7B2;
          --line: #E8EBF1; --line-2: #DCE0EA;
        }
        @media print {
          .ps-algo-panel, .ps-toolbar { display: none !important; }
          .ps-root { background: white !important; }
          @page { size: A3 landscape; margin: 10mm; }
          .ps-table-wrap { overflow: visible !important; }
        }
      `}</style>

      <div className="ps-root" style={{ fontFamily: "'Hanken Grotesk',sans-serif", color: 'var(--ink)' }}>
        {/* Region 1: Project Header */}
        <ProjectHeader header={header} setHeader={setHeader} />

        {/* Toolbar */}
        <div className="ps-toolbar" style={{
          display: 'flex', gap: 8, padding: '12px 48px', borderBottom: '1px solid var(--line)',
          background: 'var(--paper)', flexWrap: 'wrap', alignItems: 'center',
        }}>
          <button onClick={handleExportExcel}
            style={toolBtnStyle}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          <button onClick={handleExportCSV}
            style={toolBtnStyle}>
            <Download size={14} /> Export CSV
          </button>
          <label style={{ ...toolBtnStyle, cursor: 'pointer' }}>
            <Upload size={14} /> Import .xlsx
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button onClick={() => window.print()} style={toolBtnStyle}>
            <Printer size={14} /> Print
          </button>
        </div>

        {/* Region 2: Algorithm Panel + Calendar */}
        <div className="ps-algo-panel" style={{
          display: 'flex', gap: 0, background: 'var(--paper-2)',
          borderBottom: '1px solid var(--line)', flexWrap: 'wrap',
        }}>
          <AlgorithmPanel rules={rules} setRules={setRules} />
          <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
          <div style={{ flex: '1 1 400px', minWidth: 340, padding: 24 }}>
            <h3 style={{
              fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 600, color: 'var(--navy)',
              marginBottom: 16,
            }}>
              Date Calculator
            </h3>
            <ProcurementCalendar rules={rules} trackerRows={rows} />
          </div>
        </div>

        {/* Region 3: Tracker Table */}
        <div className="ps-table-wrap" style={{ padding: '24px 48px 48px', overflow: 'auto' }}>
          <ProcurementTable rows={rows} setRows={setRowsWrapped} rules={rules} categories={SAMPLE_CATEGORIES} />
        </div>
      </div>
    </div>
  )
}

const COLUMNS_FOR_CSV = [
  { label: 'ID' }, { label: 'Description' }, { label: 'Supplier' }, { label: '1st Level' },
  { label: 'Tech Sub Issue' }, { label: 'Approval Req' }, { label: 'Date Approved' },
  { label: 'Status' }, { label: 'Order Placed' }, { label: 'Lead Time' },
  { label: 'Delivery Req' }, { label: 'Required On Site' }, { label: 'Comments' },
]

const toolBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  border: '1px solid var(--line)', background: 'var(--paper)', cursor: 'pointer',
  color: 'var(--ink-2)', fontSize: 13, fontWeight: 500, fontFamily: "'Hanken Grotesk',sans-serif",
}
