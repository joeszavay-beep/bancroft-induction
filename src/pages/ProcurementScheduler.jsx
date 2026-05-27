import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, FileSpreadsheet, Printer, CalendarRange, Settings2, FileDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import ProcurementCalendar from '../components/ProcurementCalendar'
import ProcurementTable from '../components/ProcurementTable'
import {
  DEFAULT_RULES, WEEKDAY_OPTIONS,
  parseLeadTime, fmtDate, fmtDateISO, computeMilestones,
} from '../lib/procurementSchedule'

// ── Scheduling rules (collapsible) ──
function AlgorithmPanel({ rules, setRules, open, setOpen }) {
  const fields = [
    { key: 'deliveryWeeksBefore', label: 'Delivery buffer', desc: 'Weeks between delivery and the Required On Site date', type: 'number', min: 0, max: 8 },
    { key: 'orderPlacedWeekday', label: 'Order placed day', desc: 'Orders are placed on this day of the week', type: 'weekday' },
    { key: 'approvalWeekday', label: 'Approval deadline day', desc: 'Approval must be received by this day each week', type: 'weekday' },
    { key: 'techSubDaysBefore', label: 'Tech submittal lead time', desc: 'Days needed between issuing the submittal and placing the order', type: 'techsub' },
    { key: 'techSubWeekday', label: 'Tech submittal day', desc: 'Technical submittals are issued on this day', type: 'weekday' },
  ]

  return (
    <div className="rounded-xl border mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-black/[0.01]">
        <div className="flex items-center gap-2">
          <Settings2 size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Scheduling rules</span>
          <span className="text-[11px] px-2 py-0.5 border" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
            {open ? 'Hide' : 'Show'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          These settings control how milestone dates are calculated
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 mt-3">
            {fields.map(f => (
              <div key={f.key} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>{f.label}</label>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                </div>
                {f.type === 'weekday' ? (
                  <select value={rules[f.key]}
                    onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}
                    className="w-[110px] px-2 py-1.5 border text-sm shrink-0 mt-0.5"
                    style={{ borderColor: 'var(--border-color)', background: '#FFFBEB', color: 'var(--text-primary)' }}>
                    {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'techsub' ? (
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <input type="number" value={rules.techSubDaysBefore} min={0} max={60}
                      onChange={e => setRules(prev => ({ ...prev, techSubDaysBefore: parseInt(e.target.value) || 0 }))}
                      className="w-[56px] px-2 py-1.5 border text-sm text-center"
                      style={{ borderColor: 'var(--border-color)', background: '#FFFBEB', color: 'var(--text-primary)' }} />
                    <div className="flex border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
                      {['calendar', 'working'].map(t => (
                        <button key={t} onClick={() => setRules(prev => ({ ...prev, techSubDaysType: t }))}
                          className="px-2 py-1.5 text-[11px] font-medium transition-colors"
                          style={{
                            background: rules.techSubDaysType === t ? 'var(--primary-color)' : '#FFFBEB',
                            color: rules.techSubDaysType === t ? '#fff' : 'var(--text-muted)',
                            borderRight: t === 'calendar' ? '1px solid var(--border-color)' : 'none',
                          }}>
                          {t === 'calendar' ? 'Calendar' : 'Working'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <input type="number" value={rules[f.key]} min={f.min} max={f.max}
                    onChange={e => setRules(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                    className="w-[64px] px-2 py-1.5 border text-sm text-center shrink-0 mt-0.5"
                    style={{ borderColor: 'var(--border-color)', background: '#FFFBEB', color: 'var(--text-primary)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
const CSV_HEADERS = ['ID', 'Description', 'Supplier', 'Level', 'Tech Sub', 'Approval', 'Approved', 'Status', 'Order Placed', 'Lead Time', 'Delivery', 'On Site', 'Comments']

// ── Main page ──
export default function ProcurementScheduler() {
  const { user } = useCompany()
  const { projectId } = useProject()
  const cid = user?.company_id

  const [header, setHeader] = useState({ project: '', stage: '', projectNo: '', revision: '', date: fmtDateISO(new Date()), trade: '' })
  const [rules, setRules] = useState({ ...DEFAULT_RULES })
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState(['General'])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef(null)

  // Load from Supabase on mount / project change
  useEffect(() => {
    if (!cid || !projectId) { setLoaded(true); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('procurement_schedules')
        .select('header, rules, rows, categories')
        .eq('company_id', cid)
        .eq('project_id', projectId)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setHeader(data.header || { project: '', stage: '', projectNo: '', revision: '', date: fmtDateISO(new Date()), trade: '' })
        setRules(data.rules || { ...DEFAULT_RULES })
        setRows((data.rows || []).map(r => ({ ...r, _leadWeeks: parseLeadTime(r.leadTime) })))
        setCategories(data.categories || ['General'])
      } else {
        setHeader({ project: '', stage: '', projectNo: '', revision: '', date: fmtDateISO(new Date()), trade: '' })
        setRules({ ...DEFAULT_RULES })
        setRows([])
        setCategories(['General'])
      }
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [cid, projectId])

  // Auto-save to Supabase (debounced 1.5s after last change)
  useEffect(() => {
    if (!loaded || !cid || !projectId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const cleanRows = rows.map(({ _leadWeeks, ...r }) => r)
      const { error } = await supabase
        .from('procurement_schedules')
        .upsert({
          company_id: cid,
          project_id: projectId,
          header,
          rules,
          rows: cleanRows,
          categories,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,project_id' })
      if (error) console.error('Save failed:', error.message)
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [header, rules, rows, categories, loaded, cid, projectId])

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

  async function handleExportPDF() {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const isPast = (d) => d && d < today
    const grouped = []
    const cats = categories.length > 0 ? categories : ['General']
    cats.forEach(cat => {
      const catRows = rows.filter(r => (r.category || 'General') === cat)
      if (catRows.length > 0) grouped.push({ category: cat, rows: catRows })
    })

    const cols = [
      { label: 'Description', key: 'description', w: 200 },
      { label: 'Supplier', key: 'supplier', w: 120 },
      { label: 'Level', key: 'firstLevel', w: 50, center: true },
      { label: 'Tech Sub', key: 'techSub', w: 90, calc: true },
      { label: 'Approval', key: 'approval', w: 90, calc: true },
      { label: 'Approved', key: 'dateApproved', w: 90 },
      { label: 'Status', key: 'status', w: 70, center: true },
      { label: 'Order', key: 'orderPlaced', w: 90, calc: true },
      { label: 'Lead', key: 'leadTime', w: 60, center: true },
      { label: 'Delivery', key: 'delivery', w: 90, calc: true },
      { label: 'On Site', key: 'requiredOnSite', w: 90 },
      { label: 'Comments', key: 'comments', w: 160 },
    ]

    // Build HTML
    let html = `<div style="font-family:Calibri,sans-serif;width:1200px;padding:0;background:#fff">` +
      `<div style="background:#0D1426;padding:18px 28px;color:#fff;font-size:18px;font-weight:bold;letter-spacing:.02em">PROCUREMENT SCHEDULE</div>` +
      `<div style="background:#16213B;padding:6px 28px;color:#A2A7B2;font-size:10px">Generated by CoreSite</div>` +
      `<div style="height:3px;background:#1B6FC8"></div>` +
      `<div style="padding:16px 28px;display:flex;gap:40px;font-size:12px">` +
      `<div><span style="color:#7C828F;font-weight:bold">Project</span><br/><strong>${header.project || '\u2014'}</strong></div>` +
      `<div><span style="color:#7C828F;font-weight:bold">Stage</span><br/>${header.stage || '\u2014'}</div>` +
      `<div><span style="color:#7C828F;font-weight:bold">Project No.</span><br/>${header.projectNo || '\u2014'}</div>` +
      `<div><span style="color:#7C828F;font-weight:bold">Trade</span><br/>${header.trade || '\u2014'}</div>` +
      `<div><span style="color:#7C828F;font-weight:bold">Revision</span><br/>${header.revision || '\u2014'}</div>` +
      `<div><span style="color:#7C828F;font-weight:bold">Date</span><br/>${header.date || '\u2014'}</div>` +
      `</div>` +
      `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px">` +
      `<thead><tr>${cols.map(c => `<th style="background:#0D1426;color:#fff;padding:8px 6px;text-align:${c.center ? 'center' : 'left'};font-size:10px;font-weight:600;border-bottom:2px solid #1B6FC8">${c.label}</th>`).join('')}</tr></thead><tbody>`

    grouped.forEach(g => {
      html += `<tr><td colspan="${cols.length}" style="background:#E9F1FB;padding:8px 10px;font-weight:600;color:#155CA8;font-size:12px">${g.category} (${g.rows.length})</td></tr>`
      g.rows.forEach((row, ri) => {
        const lw = parseLeadTime(row.leadTime)
        const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
        const stripe = ri % 2 === 1 ? '#F5F7FA' : '#fff'
        const vals = {
          description: row.description || '',
          supplier: row.supplier || '',
          firstLevel: row.firstLevel || '',
          techSub: ms ? fmtDate(ms.techSubIssue) : '\u2014',
          approval: ms ? fmtDate(ms.approvalRequired) : '\u2014',
          dateApproved: row.dateApproved ? fmtDate(row.dateApproved) : '\u2014',
          status: ['a', 'b', 'c'].map(k => row.status?.[k] === 'yes' ? '✓' : row.status?.[k] === 'no' ? '✗' : '-').join(' '),
          orderPlaced: ms ? fmtDate(ms.orderPlaced) : '\u2014',
          leadTime: row.leadTime || '',
          delivery: ms ? fmtDate(ms.delivery) : '\u2014',
          requiredOnSite: row.requiredOnSite ? fmtDate(row.requiredOnSite) : '\u2014',
          comments: row.comments || '',
        }
        const pastFlags = {
          techSub: ms && isPast(ms.techSubIssue),
          approval: ms && isPast(ms.approvalRequired),
          orderPlaced: ms && isPast(ms.orderPlaced),
          delivery: ms && isPast(ms.delivery),
        }
        html += `<tr>`
        cols.forEach(c => {
          const past = pastFlags[c.key]
          const isCalc = c.calc && ms
          const bg = past ? '#FDECEC' : isCalc ? '#E9F1FB' : stripe
          const color = past ? '#D93E3E' : isCalc ? '#1B6FC8' : '#0D1426'
          const fw = isCalc ? 'bold' : 'normal'
          html += `<td style="padding:6px;border-bottom:1px solid #E8EBF1;background:${bg};color:${color};font-weight:${fw};text-align:${c.center ? 'center' : 'left'};white-space:nowrap">${vals[c.key]}</td>`
        })
        html += `</tr>`
      })
    })

    html += `</tbody></table>` +
      `<div style="padding:12px 28px;text-align:right;color:#A2A7B2;font-size:9px;font-style:italic">Generated by CoreSite · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>`

    // Render off-screen
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:absolute;left:-10000px;top:0;width:1200px'
    wrapper.innerHTML = html
    document.body.appendChild(wrapper)

    await new Promise(r => setTimeout(r, 200))
    const canvas = await html2canvas(wrapper.firstChild, { scale: 2, backgroundColor: '#ffffff', logging: false })
    document.body.removeChild(wrapper)

    // A3 landscape
    const pdf = new jsPDF('l', 'mm', 'a3')
    const pw = 420, ph = 297
    const imgW = pw
    const imgH = (canvas.height * imgW) / canvas.width

    if (imgH <= ph) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH)
    } else {
      const pxPerPage = (ph / imgW) * canvas.width
      let yOff = 0, page = 0
      while (yOff < canvas.height) {
        if (page > 0) pdf.addPage()
        const sliceH = Math.min(pxPerPage, canvas.height - yOff)
        const pc = document.createElement('canvas')
        pc.width = canvas.width; pc.height = sliceH
        pc.getContext('2d').drawImage(canvas, 0, yOff, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, (sliceH * imgW) / canvas.width)
        yOff += pxPerPage; page++
      }
    }

    pdf.save(`${header.projectNo || 'CoreSite'}_${header.trade || 'Procurement'}_Schedule_Rev${header.revision || ''}_${fmtDateISO(new Date())}.pdf`)
  }

  if (!projectId) {
    return (
      <div className="max-w-[1400px] mx-auto py-16 text-center">
        <CalendarRange size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a project from the sidebar to get started</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Project header + toolbar */}
      <div className="rounded-xl border mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <ProjectHeader header={header} setHeader={setHeader} />
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
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <FileDown size={13} /> Export PDF
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Scheduling rules (collapsible) */}
      <AlgorithmPanel rules={rules} setRules={setRules} open={rulesOpen} setOpen={setRulesOpen} />

      {/* Calendar (collapsible) */}
      <div className="rounded-xl border mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <button onClick={() => setCalendarOpen(!calendarOpen)}
          className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-black/[0.01]">
          <div className="flex items-center gap-2">
            <CalendarRange size={15} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Date calculator</span>
            <span className="text-[11px] px-2 py-0.5 border" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
              {calendarOpen ? 'Hide' : 'Show'}
            </span>
          </div>
        </button>
        {calendarOpen && (
          <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <div className="mt-4">
              <ProcurementCalendar rules={rules} trackerRows={rows} />
            </div>
          </div>
        )}
      </div>

      {/* Tracker table */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <ProcurementTable rows={rows} setRows={setRowsWrapped} rules={rules} categories={categories} setCategories={setCategories} />
      </div>

      <style>{`
        @media print {
          .max-w-\\[1400px\\] > div:nth-child(2),
          .max-w-\\[1400px\\] > div:nth-child(3) { display: none !important; }
          @page { size: A3 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}
