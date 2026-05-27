import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
import { Plus, ChevronDown, ChevronRight, MoreHorizontal, AlertCircle, GripVertical, Trash2, Copy } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  computeMilestones, parseLeadTime, fmtDate, fmtDateISO, getRowFlags,
} from '../lib/procurementSchedule'

// ── Status pills ──
function StatusPills({ value = {}, onChange }) {
  const vals = { a: value.a || null, b: value.b || null, c: value.c || null }
  const states = [null, 'yes', 'no']
  function cycle(key) {
    const idx = states.indexOf(vals[key])
    onChange({ ...vals, [key]: states[(idx + 1) % 3] })
  }
  return (
    <div className="flex gap-1 justify-center">
      {['A', 'B', 'C'].map(label => {
        const key = label.toLowerCase()
        const v = vals[key]
        return (
          <button key={key} onClick={() => cycle(key)}
            className="w-6 h-6 border text-[11px] font-semibold flex items-center justify-center transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              background: v === 'yes' ? '#E7F5EC' : v === 'no' ? '#FDECEC' : 'var(--bg-main)',
              color: v === 'yes' ? '#2C9C5E' : v === 'no' ? '#D93E3E' : 'var(--text-muted)',
            }}>
            {v === 'yes' ? '✓' : v === 'no' ? '✗' : label}
          </button>
        )
      })}
    </div>
  )
}

// (PriorityPips removed — Level is now a free-text EditCell)

// ── Editable cell ──
function EditCell({ value, onCommit, type = 'text', placeholder = '\u2014', readOnly, calculated, italic, muted, title, className = '' }) {
  const [editing, setEditing] = useState(false)

  if (readOnly) {
    return (
      <div title={title}
        className={`px-2 py-1.5 text-sm whitespace-nowrap overflow-hidden text-ellipsis ${className}`}
        style={{
          color: calculated && value ? 'var(--primary-color)' : muted ? 'var(--text-muted)' : 'var(--text-primary)',
          fontWeight: calculated && value ? 600 : 400,
          fontStyle: italic ? 'italic' : 'normal',
          background: calculated && value ? 'rgba(27,111,200,.04)' : 'transparent',
        }}
        aria-readonly="true">
        {value || '\u2014'}
      </div>
    )
  }

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} tabIndex={0} onFocus={() => setEditing(true)}
        onKeyDown={e => e.key === 'Enter' && setEditing(true)}
        className={`px-2 py-1.5 text-sm cursor-text whitespace-nowrap overflow-hidden text-ellipsis border border-transparent hover:border-[var(--border-color)] transition-colors ${className}`}
        style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {value || placeholder}
      </div>
    )
  }

  return (
    <input
      autoFocus
      type={type === 'date' ? 'date' : 'text'}
      defaultValue={value || ''}
      ref={el => { if (el) { el.focus(); if (type !== 'date') el.select() } }}
      onBlur={e => { setEditing(false); if (e.target.value !== (value || '')) onCommit(e.target.value) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { setEditing(false); if (e.target.value !== (value || '')) onCommit(e.target.value) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className={`w-full px-2 py-1 text-sm border outline-none ${className}`}
      style={{ borderColor: 'var(--primary-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
    />
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
    { id: 'sep1', sep: true },
    { id: 'copyExcel', label: 'Copy as Excel' },
    { id: 'copyMd', label: 'Copy as Markdown' },
    { id: 'sep2', sep: true },
    { id: 'delete', label: 'Delete', danger: true },
  ]
  return (
    <div ref={ref} className="fixed z-[1000] border shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y, background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      {items.map(item => item.sep
        ? <div key={item.id} className="h-px my-1" style={{ background: 'var(--border-color)' }} />
        : <button key={item.id} onClick={() => { onAction(item.id); onClose() }}
            className="block w-full px-3.5 py-1.5 text-left text-sm hover:bg-black/[0.03] transition-colors"
            style={{ color: item.danger ? '#D93E3E' : 'var(--text-primary)' }}>
            {item.label}
          </button>
      )}
    </div>
  )
}

// ── Supplier autocomplete ──
function SupplierCell({ value, onCommit, suggestions }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [showSugg, setShowSugg] = useState(false)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft)

  if (!editing) {
    return (
      <div onClick={() => { setDraft(value || ''); setEditing(true) }} tabIndex={0}
        onFocus={() => { setDraft(value || ''); setEditing(true) }}
        className="px-2 py-1.5 text-sm cursor-text whitespace-nowrap overflow-hidden text-ellipsis border border-transparent hover:border-[var(--border-color)] transition-colors"
        style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {value || '\u2014'}
      </div>
    )
  }

  function commit(val) {
    setEditing(false); setShowSugg(false)
    if (val !== (value || '')) onCommit(val)
  }

  return (
    <div className="relative">
      <input autoFocus defaultValue={value || ''}
        onChange={e => { setDraft(e.target.value); setShowSugg(true) }}
        onBlur={e => setTimeout(() => commit(e.target.value), 150)}
        onKeyDown={e => { if (e.key === 'Enter') commit(e.target.value); if (e.key === 'Escape') setEditing(false) }}
        className="w-full px-2 py-1 text-sm border outline-none"
        style={{ borderColor: 'var(--primary-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
      {showSugg && filtered.length > 0 && (
        <div className="absolute left-0 top-full w-full z-50 border shadow-md max-h-[120px] overflow-auto"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          {filtered.slice(0, 6).map(s => (
            <div key={s} onMouseDown={() => commit(s)}
              className="px-2.5 py-1.5 text-xs cursor-pointer hover:bg-black/[0.03]"
              style={{ color: 'var(--text-primary)' }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable row ──
function SortableRow({ row, ri, rules, supplierSuggestions, updateRow, deleteRow, duplicateRow, setContextMenu, selectMode, selected, setSelected }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })

  const lw = parseLeadTime(row.leadTime)
  const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
  const flags = getRowFlags(row, ms)

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: ri % 2 === 1 ? 'var(--bg-main)' : 'var(--bg-card)',
    borderColor: 'var(--border-color)',
  }

  const bdr = { borderRight: '1px solid var(--border-color)' }

  return (
    <tr ref={setNodeRef} style={rowStyle}
      onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id }) }}
      className="border-b transition-colors">
      <td className="px-1 py-1.5 text-center w-8" style={bdr}>
        <button {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-black/5 transition-colors"
          style={{ color: 'var(--text-muted)' }}>
          <GripVertical size={13} />
        </button>
      </td>
      {selectMode && (
        <td className="px-1 py-1.5 text-center w-8" style={bdr}>
          <input type="checkbox" checked={selected.has(row.id)}
            onChange={e => { const next = new Set(selected); e.target.checked ? next.add(row.id) : next.delete(row.id); setSelected(next) }} />
        </td>
      )}
      <td className="text-center relative w-[50px]" style={bdr}>
        {flags.length > 0 && (
          <span title={flags.map(f => f.message).join('; ')} className="absolute left-1 top-1/2 -translate-y-1/2">
            <AlertCircle size={12} color="#D93E3E" />
          </span>
        )}
        <EditCell value={String(row.id)} onCommit={v => updateRow(row.id, 'id', parseInt(v) || row.id)} className="text-center" />
      </td>
      <td style={bdr}><EditCell value={row.description} onCommit={v => updateRow(row.id, 'description', v)} /></td>
      <td style={bdr}><SupplierCell value={row.supplier} onCommit={v => updateRow(row.id, 'supplier', v)} suggestions={supplierSuggestions} /></td>
      <td className="text-center" style={bdr}><EditCell value={row.firstLevel != null ? String(row.firstLevel) : ''} onCommit={v => updateRow(row.id, 'firstLevel', v)} className="text-center" /></td>
      <td style={bdr}><EditCell value={ms ? fmtDate(ms.techSubIssue) : ''} readOnly calculated title="Auto-calculated" /></td>
      <td style={bdr}><EditCell value={ms ? fmtDate(ms.approvalRequired) : ''} readOnly calculated title="Auto-calculated" /></td>
      <td style={bdr}><EditCell value={row.dateApproved ? fmtDate(row.dateApproved) : ''} type="date" onCommit={v => updateRow(row.id, 'dateApproved', v)} /></td>
      <td className="text-center px-1" style={bdr}><StatusPills value={row.status || {}} onChange={v => updateRow(row.id, 'status', v)} /></td>
      <td style={bdr}><EditCell value={ms ? fmtDate(ms.orderPlaced) : ''} readOnly calculated title="Auto-calculated" /></td>
      <td className="text-center" style={bdr}><EditCell value={row.leadTime || ''} onCommit={v => updateRow(row.id, 'leadTime', v)} placeholder="e.g. 12W" className="text-center" /></td>
      <td style={bdr}><EditCell value={ms ? fmtDate(ms.delivery) : ''} readOnly calculated title="Auto-calculated" /></td>
      <td style={bdr}><EditCell value={row.requiredOnSite ? fmtDateISO(row.requiredOnSite) : ''} type="date" onCommit={v => updateRow(row.id, 'requiredOnSite', v)} /></td>
      <td style={bdr}><EditCell value={row.comments || ''} onCommit={v => updateRow(row.id, 'comments', v)} /></td>
      <td className="px-1 text-center" style={{ width: 52 }}>
        <div className="flex items-center justify-center gap-0.5">
          <button onClick={() => duplicateRow(row.id)} title="Duplicate row"
            className="p-1 hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <Copy size={13} />
          </button>
          <button onClick={() => deleteRow(row.id)} title="Delete row"
            className="p-1 hover:bg-red-50 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main ──
export default function ProcurementTable({ rows, setRows, rules }) {
  const [collapsed, setCollapsed] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const supplierSuggestions = useMemo(() =>
    [...new Set(rows.map(r => r.supplier).filter(Boolean))].sort(), [rows])

  const allIds = useMemo(() => rows.map(r => r.id), [rows])

  const grouped = useMemo(() => {
    const catOrder = []
    rows.forEach(r => { const c = r.category || 'General'; if (!catOrder.includes(c)) catOrder.push(c) })
    return catOrder.map(cat => ({ category: cat, rows: rows.filter(r => (r.category || 'General') === cat) }))
  }, [rows])

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    const maxId = rows.length > 0 ? rows.reduce((m, r) => Math.max(m, r.id || 0), 0) : 0
    setRows(prev => [...prev, {
      id: maxId + 1, category: 'General',
      description: '', supplier: '', firstLevel: '', leadTime: '', requiredOnSite: '',
      dateApproved: '', status: {}, comments: '',
    }])
  }

  function handleContextAction(id, action) {
    const idx = rows.findIndex(r => r.id === id)
    if (idx < 0) return
    const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0)
    const row = rows[idx]
    switch (action) {
      case 'insertAbove': case 'insertBelow': {
        const nr = { id: maxId + 1, category: row.category || 'General', description: '', supplier: '', firstLevel: '', leadTime: '', requiredOnSite: '', dateApproved: '', status: {}, comments: '' }
        const next = [...rows]; next.splice(action === 'insertAbove' ? idx : idx + 1, 0, nr); setRows(next); break
      }
      case 'duplicate': { const next = [...rows]; next.splice(idx + 1, 0, { ...row, id: maxId + 1 }); setRows(next); break }
      case 'delete': setRows(prev => prev.filter(r => r.id !== id)); break
      case 'copyExcel': {
        const lw = parseLeadTime(row.leadTime); const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
        navigator.clipboard?.writeText([row.id, row.description, row.supplier, row.firstLevel, ms ? fmtDate(ms.techSubIssue) : '', ms ? fmtDate(ms.approvalRequired) : '', row.dateApproved || '', '', ms ? fmtDate(ms.orderPlaced) : '', row.leadTime, ms ? fmtDate(ms.delivery) : '', row.requiredOnSite ? fmtDate(row.requiredOnSite) : '', row.comments].join('\t'))
        break
      }
      case 'copyMd': {
        const lw = parseLeadTime(row.leadTime); const ms = lw && row.requiredOnSite ? computeMilestones(row.requiredOnSite, lw, rules) : null
        navigator.clipboard?.writeText('| ' + [row.id, row.description, row.supplier, row.firstLevel, ms ? fmtDate(ms.techSubIssue) : '', ms ? fmtDate(ms.approvalRequired) : '', row.dateApproved || '', '', ms ? fmtDate(ms.orderPlaced) : '', row.leadTime, ms ? fmtDate(ms.delivery) : '', row.requiredOnSite ? fmtDate(row.requiredOnSite) : '', row.comments].join(' | ') + ' |')
        break
      }
    }
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows(prev => {
      const oldIdx = prev.findIndex(r => r.id === active.id)
      const newIdx = prev.findIndex(r => r.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const thCls = "px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={() => setSelectMode(p => !p)}
          className="px-3 py-1.5 text-xs border transition-colors"
          style={{ borderColor: 'var(--border-color)', background: selectMode ? 'var(--primary-color)' : 'var(--bg-card)', color: selectMode ? '#fff' : 'var(--text-muted)' }}>
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      <div className="border overflow-x-auto" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b" style={{ background: 'var(--bg-main)', borderColor: 'var(--border-color)' }}>
                  <th className={`${thCls} w-8`} style={{ color: 'var(--text-muted)' }}></th>
                  {selectMode && <th className={`${thCls} w-8`} style={{ color: 'var(--text-muted)' }}></th>}
                  <th className={thCls} style={{ color: 'var(--text-muted)', width: 50 }}>ID</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 200 }}>Description</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 130 }}>Supplier</th>
                  <th className={`${thCls} text-center`} style={{ color: 'var(--text-muted)', width: 70 }}>Level</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>Tech Sub</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>Approval</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>Approved</th>
                  <th className={`${thCls} text-center`} style={{ color: 'var(--text-muted)', width: 90 }}>Status</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>Order</th>
                  <th className={`${thCls} text-center`} style={{ color: 'var(--text-muted)', width: 80 }}>Lead</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>Delivery</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 110 }}>On Site</th>
                  <th className={thCls} style={{ color: 'var(--text-muted)', minWidth: 160 }}>Comments</th>
                  <th className={`${thCls} w-8`}></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(group => {
                  const isCollapsed = collapsed[group.category]
                  return (
                    <Fragment key={group.category}>
                      <tr className="border-b cursor-pointer select-none"
                        onClick={() => setCollapsed(p => ({ ...p, [group.category]: !p[group.category] }))}
                        style={{ borderColor: 'var(--border-color)' }}>
                        <td colSpan={100} className="px-3 py-2.5" style={{ background: 'var(--bg-main)' }}>
                          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--primary-color)' }}>
                            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            {group.category}
                            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({group.rows.length})</span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && group.rows.map((row, ri) => (
                        <SortableRow key={row.id} row={row} ri={ri} rules={rules}
                          supplierSuggestions={supplierSuggestions} updateRow={updateRow}
                          deleteRow={id => setRows(prev => prev.filter(r => r.id !== id))}
                          duplicateRow={id => {
                            const src = rows.find(r => r.id === id); if (!src) return
                            const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0)
                            const idx = rows.indexOf(src)
                            setRows(prev => { const next = [...prev]; next.splice(idx + 1, 0, { ...src, id: maxId + 1 }); return next })
                          }}
                          setContextMenu={setContextMenu} selectMode={selectMode}
                          selected={selected} setSelected={setSelected} />
                      ))}
                    </Fragment>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={100} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No items yet — click "Add row" to start
                  </td></tr>
                )}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>

      <button onClick={addRow}
        className="flex items-center gap-2 mt-3 px-4 py-2 border border-dashed text-sm transition-colors hover:bg-black/[0.02]"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
        <Plus size={14} /> Add row
      </button>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y}
          onAction={action => handleContextAction(contextMenu.rowId, action)}
          onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
