import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, ChevronDown, ChevronRight, MoreHorizontal, AlertCircle } from 'lucide-react'
import {
  computeMilestones, parseLeadTime, formatLeadTime, fmtDate, fmtDateISO,
  parseDate, getRowFlags,
} from '../lib/procurementSchedule'

// ── Status pills (A/B/C review states) ──

const STATUS_STATES = [null, 'yes', 'no'] // cycle: empty → ✓ → ✗
const STATUS_LABELS = ['A', 'B', 'C']

function StatusPills({ value = {}, onChange }) {
  const vals = { a: value.a || null, b: value.b || null, c: value.c || null }
  function cycle(key) {
    const cur = vals[key]
    const idx = STATUS_STATES.indexOf(cur)
    const next = STATUS_STATES[(idx + 1) % STATUS_STATES.length]
    onChange({ ...vals, [key]: next })
  }
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {STATUS_LABELS.map((label, i) => {
        const key = label.toLowerCase()
        const v = vals[key]
        const bg = v === 'yes' ? 'var(--green-soft)' : v === 'no' ? '#FDECEC' : 'var(--paper-2)'
        const color = v === 'yes' ? 'var(--green)' : v === 'no' ? '#D93E3E' : 'var(--muted-2)'
        const text = v === 'yes' ? '✓' : v === 'no' ? '✗' : label
        return (
          <button key={key} onClick={() => cycle(key)}
            style={{
              width: 24, height: 22, border: '1px solid var(--line)', background: bg,
              color, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: v ? 'system-ui' : "'Hanken Grotesk',sans-serif",
            }}>
            {text}
          </button>
        )
      })}
    </div>
  )
}

// ── First Level (priority pips) ──
function PriorityPips({ value, onChange }) {
  const n = Math.min(4, Math.max(0, value || 0))
  return (
    <div style={{ display: 'flex', gap: 3, cursor: 'pointer' }}
      onClick={() => onChange(n >= 4 ? 1 : n + 1)}>
      {[1, 2, 3, 4].map(i => (
        <span key={i} style={{
          width: 8, height: 8, background: i <= n ? 'var(--blue)' : 'var(--line)',
          transition: 'background .15s',
        }} />
      ))}
    </div>
  )
}

// ── Editable cell ──
function EditCell({ value, onChange, type = 'text', placeholder = '\u2014', readOnly, italic, muted, style: extraStyle, ...props }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const inputRef = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])

  function commit() {
    setEditing(false)
    if (draft !== (value || '')) onChange(draft)
  }

  if (readOnly) {
    return (
      <div title={props.title}
        style={{
          padding: '6px 8px', fontSize: 13, fontStyle: italic ? 'italic' : 'normal',
          color: muted ? 'var(--muted-2)' : 'var(--ink)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          fontFamily: "'Hanken Grotesk',sans-serif", ...extraStyle,
        }}
        aria-readonly="true">
        {value || '\u2014'}
      </div>
    )
  }

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} tabIndex={0}
        onFocus={() => setEditing(true)}
        onKeyDown={e => e.key === 'Enter' && setEditing(true)}
        style={{
          padding: '6px 8px', fontSize: 13, cursor: 'text',
          color: value ? 'var(--ink)' : 'var(--muted-2)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          border: '1px solid transparent', fontFamily: "'Hanken Grotesk',sans-serif",
          ...extraStyle,
        }}>
        {value || placeholder}
      </div>
    )
  }

  return (
    <input ref={el => { inputRef.current = el; el?.focus(); el?.select() }}
      type={type === 'date' ? 'date' : 'text'} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
      style={{
        width: '100%', padding: '5px 7px', fontSize: 13, border: '1px solid var(--blue)',
        outline: 'none', background: 'var(--paper)', color: 'var(--ink)',
        fontFamily: "'Hanken Grotesk',sans-serif", ...extraStyle,
      }} />
  )
}

// ── Context menu ──
function ContextMenu({ x, y, onAction, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])
  const items = [
    { id: 'insertAbove', label: 'Insert above' },
    { id: 'insertBelow', label: 'Insert below' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'moveUp', label: 'Move up' },
    { id: 'moveDown', label: 'Move down' },
    { id: 'sep1', sep: true },
    { id: 'copyExcel', label: 'Copy as Excel' },
    { id: 'copyMd', label: 'Copy as Markdown' },
    { id: 'sep2', sep: true },
    { id: 'delete', label: 'Delete', danger: true },
  ]
  return (
    <div ref={ref} style={{
      position: 'fixed', left: x, top: y, zIndex: 1000, background: 'var(--paper)',
      border: '1px solid var(--line)', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      padding: '4px 0', minWidth: 180,
    }}>
      {items.map(item => item.sep
        ? <div key={item.id} style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
        : <button key={item.id} onClick={() => { onAction(item.id); onClose() }}
            style={{
              display: 'block', width: '100%', padding: '7px 14px', border: 'none',
              background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
              color: item.danger ? '#D93E3E' : 'var(--ink)',
              fontFamily: "'Hanken Grotesk',sans-serif",
            }}
            onMouseEnter={e => e.target.style.background = 'var(--paper-2)'}
            onMouseLeave={e => e.target.style.background = 'none'}>
            {item.label}
          </button>
      )}
    </div>
  )
}

// ── Supplier autocomplete ──
function SupplierCell({ value, onChange, suggestions }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [showSugg, setShowSugg] = useState(false)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft)

  useEffect(() => { setDraft(value || '') }, [value])

  function commit(val) {
    setEditing(false)
    setShowSugg(false)
    if ((val || draft) !== (value || '')) onChange(val || draft)
  }

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} tabIndex={0} onFocus={() => setEditing(true)}
        style={{
          padding: '6px 8px', fontSize: 13, cursor: 'text',
          color: value ? 'var(--ink)' : 'var(--muted-2)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid transparent',
          fontFamily: "'Hanken Grotesk',sans-serif",
        }}>
        {value || '\u2014'}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input autoFocus value={draft}
        onChange={e => { setDraft(e.target.value); setShowSugg(true) }}
        onBlur={() => setTimeout(() => commit(), 150)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
        style={{
          width: '100%', padding: '5px 7px', fontSize: 13, border: '1px solid var(--blue)',
          outline: 'none', background: 'var(--paper)', color: 'var(--ink)',
          fontFamily: "'Hanken Grotesk',sans-serif",
        }} />
      {showSugg && filtered.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', width: '100%', zIndex: 50,
          background: 'var(--paper)', border: '1px solid var(--line)', boxShadow: '0 4px 12px rgba(0,0,0,.08)',
          maxHeight: 120, overflow: 'auto',
        }}>
          {filtered.slice(0, 6).map(s => (
            <div key={s} onMouseDown={() => { setDraft(s); commit(s) }}
              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--ink)' }}
              onMouseEnter={e => e.target.style.background = 'var(--paper-2)'}
              onMouseLeave={e => e.target.style.background = 'none'}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Column definitions ──
const COLUMNS = [
  { key: 'id', label: 'ID', width: 52, align: 'center' },
  { key: 'description', label: 'Description', width: 220, flex: 1 },
  { key: 'supplier', label: 'Supplier', width: 140 },
  { key: 'firstLevel', label: '1st Level', width: 72, align: 'center' },
  { key: 'techSubIssue', label: 'Tech Sub Issue', width: 120, calc: true },
  { key: 'approvalRequired', label: 'Approval Req\u2019d', width: 120, calc: true },
  { key: 'dateApproved', label: 'Date Approved', width: 120 },
  { key: 'status', label: 'Status', width: 90, align: 'center' },
  { key: 'orderPlaced', label: 'Order Placed', width: 120, calc: true },
  { key: 'leadTime', label: 'Lead Time', width: 80, align: 'center' },
  { key: 'deliveryRequired', label: 'Delivery Req\u2019d', width: 120, calc: true },
  { key: 'requiredOnSite', label: 'Req\u2019d On Site', width: 120 },
  { key: 'comments', label: 'Comments', width: 200, flex: 1 },
]

// ── Main component ──

export default function ProcurementTable({ rows, setRows, rules, categories = [] }) {
  const [collapsed, setCollapsed] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  // All unique suppliers for autocomplete
  const supplierSuggestions = useMemo(() =>
    [...new Set(rows.map(r => r.supplier).filter(Boolean))].sort(),
    [rows]
  )

  // Group rows by category
  const grouped = useMemo(() => {
    const cats = []
    const catOrder = []
    rows.forEach(row => {
      const cat = row.category || 'Uncategorised'
      if (!catOrder.includes(cat)) catOrder.push(cat)
    })
    catOrder.forEach(cat => {
      cats.push({ category: cat, rows: rows.filter(r => (r.category || 'Uncategorised') === cat) })
    })
    return cats
  }, [rows])

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow(category) {
    const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0)
    setRows(prev => [...prev, {
      id: maxId + 1, category: category || 'Uncategorised',
      description: '', supplier: '', firstLevel: 1, leadTime: '', requiredOnSite: '',
      dateApproved: '', status: {}, comments: '',
    }])
  }

  function deleteRow(id) { setRows(prev => prev.filter(r => r.id !== id)) }
  function duplicateRow(id) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0)
    const idx = rows.indexOf(row)
    const newRow = { ...row, id: maxId + 1 }
    const next = [...rows]
    next.splice(idx + 1, 0, newRow)
    setRows(next)
  }
  function insertRow(id, pos) {
    const idx = rows.findIndex(r => r.id === id)
    if (idx < 0) return
    const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0)
    const cat = rows[idx].category
    const newRow = { id: maxId + 1, category: cat, description: '', supplier: '', firstLevel: 1, leadTime: '', requiredOnSite: '', dateApproved: '', status: {}, comments: '' }
    const next = [...rows]
    next.splice(pos === 'above' ? idx : idx + 1, 0, newRow)
    setRows(next)
  }
  function moveRow(id, dir) {
    const idx = rows.findIndex(r => r.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= rows.length) return
    const next = [...rows]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setRows(next)
  }
  function copyRowAsExcel(id) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const lw = parseLeadTime(row.leadTime)
    const ms = lw ? computeMilestones(row.requiredOnSite, lw, rules) : null
    const vals = [row.id, row.description, row.supplier, row.firstLevel, ms ? fmtDate(ms.techSubIssue) : '', ms ? fmtDate(ms.approvalRequired) : '', row.dateApproved || '', '', ms ? fmtDate(ms.orderPlaced) : '', row.leadTime, ms ? fmtDate(ms.delivery) : '', row.requiredOnSite ? fmtDate(row.requiredOnSite) : '', row.comments]
    navigator.clipboard?.writeText(vals.join('\t'))
  }
  function copyRowAsMd(id) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const lw = parseLeadTime(row.leadTime)
    const ms = lw ? computeMilestones(row.requiredOnSite, lw, rules) : null
    const vals = [row.id, row.description, row.supplier, row.firstLevel, ms ? fmtDate(ms.techSubIssue) : '', ms ? fmtDate(ms.approvalRequired) : '', row.dateApproved || '', '', ms ? fmtDate(ms.orderPlaced) : '', row.leadTime, ms ? fmtDate(ms.delivery) : '', row.requiredOnSite ? fmtDate(row.requiredOnSite) : '', row.comments]
    navigator.clipboard?.writeText('| ' + vals.join(' | ') + ' |')
  }

  function handleContextAction(id, action) {
    switch (action) {
      case 'insertAbove': insertRow(id, 'above'); break
      case 'insertBelow': insertRow(id, 'below'); break
      case 'duplicate': duplicateRow(id); break
      case 'moveUp': moveRow(id, -1); break
      case 'moveDown': moveRow(id, 1); break
      case 'delete': deleteRow(id); break
      case 'copyExcel': copyRowAsExcel(id); break
      case 'copyMd': copyRowAsMd(id); break
    }
  }

  function toggleCat(cat) {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button onClick={() => setSelectMode(prev => !prev)}
          style={{
            padding: '6px 14px', fontSize: 12, border: '1px solid var(--line)',
            background: selectMode ? 'var(--blue-soft)' : 'var(--paper)', cursor: 'pointer',
            color: selectMode ? 'var(--blue)' : 'var(--muted)', fontWeight: 500,
            fontFamily: "'Hanken Grotesk',sans-serif",
          }}>
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {/* Table container */}
      <div style={{ overflow: 'auto', border: '1px solid var(--line)' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
          fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 13,
        }}>
          <colgroup>
            {selectMode && <col style={{ width: 36 }} />}
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.flex ? undefined : c.width, minWidth: c.width }} />)}
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr>
              {selectMode && <th style={thStyle}></th>}
              {COLUMNS.map(c => (
                <th key={c.key} style={{ ...thStyle, textAlign: c.align || 'left', position: 'sticky', top: 0, zIndex: 10 }}>
                  {c.label}
                </th>
              ))}
              <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(group => {
              const isCollapsed = collapsed[group.category]
              return [
                // Category header row
                <tr key={`cat-${group.category}`}>
                  <td colSpan={COLUMNS.length + (selectMode ? 2 : 1)} onClick={() => toggleCat(group.category)}
                    style={{
                      padding: '10px 12px', background: 'var(--blue-soft)', cursor: 'pointer',
                      borderBottom: '1px solid var(--line)', fontFamily: "'Fraunces',serif",
                      fontStyle: 'italic', fontSize: 15, fontWeight: 500, color: 'var(--blue-ink)',
                      display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none',
                    }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {group.category}
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'normal', fontFamily: "'Hanken Grotesk',sans-serif" }}>
                      ({group.rows.length})
                    </span>
                  </td>
                </tr>,
                // Data rows
                ...(!isCollapsed ? group.rows.map((row, ri) => {
                  const lw = parseLeadTime(row.leadTime)
                  const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
                  const flags = getRowFlags(row, ms)
                  const stripe = ri % 2 === 1

                  return (
                    <tr key={row.id}
                      onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id }) }}
                      style={{ background: stripe ? 'var(--paper-2)' : 'var(--paper)' }}>
                      {selectMode && (
                        <td style={tdStyle}>
                          <input type="checkbox" checked={selected.has(row.id)}
                            onChange={e => {
                              const next = new Set(selected)
                              e.target.checked ? next.add(row.id) : next.delete(row.id)
                              setSelected(next)
                            }} />
                        </td>
                      )}
                      {/* ID */}
                      <td style={{ ...tdStyle, textAlign: 'center', position: 'relative' }}>
                        {flags.length > 0 && (
                          <span title={flags.map(f => f.message).join('; ')}
                            style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)' }}>
                            <AlertCircle size={12} color="#D93E3E" />
                          </span>
                        )}
                        <EditCell value={String(row.id)} onChange={v => updateRow(row.id, 'id', parseInt(v) || row.id)} style={{ textAlign: 'center' }} />
                      </td>
                      {/* Description */}
                      <td style={tdStyle}>
                        <EditCell value={row.description} onChange={v => updateRow(row.id, 'description', v)} />
                      </td>
                      {/* Supplier */}
                      <td style={tdStyle}>
                        <SupplierCell value={row.supplier} onChange={v => updateRow(row.id, 'supplier', v)} suggestions={supplierSuggestions} />
                      </td>
                      {/* First Level */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <PriorityPips value={row.firstLevel} onChange={v => updateRow(row.id, 'firstLevel', v)} />
                        </div>
                      </td>
                      {/* Tech Sub Issue (calc) */}
                      <td style={tdStyle}>
                        <EditCell value={ms ? fmtDate(ms.techSubIssue) : ''} readOnly italic muted
                          title="Auto-calculated: approval date − tech sub days, snapped to weekday" />
                      </td>
                      {/* Approval Required (calc) */}
                      <td style={tdStyle}>
                        <EditCell value={ms ? fmtDate(ms.approvalRequired) : ''} readOnly italic muted
                          title="Auto-calculated: order date snapped to approval weekday" />
                      </td>
                      {/* Date Approved */}
                      <td style={tdStyle}>
                        <EditCell value={row.dateApproved ? fmtDate(row.dateApproved) : ''} type="date"
                          onChange={v => updateRow(row.id, 'dateApproved', v)} />
                      </td>
                      {/* Status (A/B/C) */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <StatusPills value={row.status || {}} onChange={v => updateRow(row.id, 'status', v)} />
                        </div>
                      </td>
                      {/* Order Placed (calc) */}
                      <td style={tdStyle}>
                        <EditCell value={ms ? fmtDate(ms.orderPlaced) : ''} readOnly italic muted
                          title="Auto-calculated: delivery − lead time, snapped to weekday" />
                      </td>
                      {/* Lead Time */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <EditCell value={row.leadTime || ''} onChange={v => updateRow(row.id, 'leadTime', v)}
                          placeholder="e.g. 12W" style={{ textAlign: 'center' }} />
                      </td>
                      {/* Delivery Required (calc) */}
                      <td style={tdStyle}>
                        <EditCell value={ms ? fmtDate(ms.delivery) : ''} readOnly italic muted
                          title="Auto-calculated: on-site date − delivery weeks" />
                      </td>
                      {/* Required On Site */}
                      <td style={tdStyle}>
                        <EditCell value={row.requiredOnSite ? fmtDateISO(row.requiredOnSite) : ''} type="date"
                          onChange={v => updateRow(row.id, 'requiredOnSite', v)} />
                      </td>
                      {/* Comments */}
                      <td style={tdStyle}>
                        <EditCell value={row.comments || ''} onChange={v => updateRow(row.id, 'comments', v)} />
                      </td>
                      {/* Context menu button */}
                      <td style={tdStyle}>
                        <button onClick={e => setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                          <MoreHorizontal size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                }) : []),
              ]
            }).flat()}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => addRow(grouped[grouped.length - 1]?.category)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            border: '1px dashed var(--line)', background: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 13, fontFamily: "'Hanken Grotesk',sans-serif",
          }}>
          <Plus size={14} /> Add row
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y}
          onAction={action => handleContextAction(contextMenu.rowId, action)}
          onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}

const thStyle = {
  padding: '10px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.08em', color: 'var(--paper)', background: 'var(--navy)',
  borderBottom: '2px solid var(--blue)', whiteSpace: 'nowrap',
  fontFamily: "'Hanken Grotesk',sans-serif",
}

const tdStyle = {
  padding: 0, borderBottom: '1px solid var(--line)', borderRight: '1px solid var(--line)',
  verticalAlign: 'middle',
}
