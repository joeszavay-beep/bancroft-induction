import React, { useState, useMemo, useCallback } from 'react'
import { Search, X, Download, ChevronUp, ChevronDown, Check, ListFilter } from 'lucide-react'
import { BIM_CATEGORIES } from '../lib/bimUtils'

// Status display config — exported for reuse
// eslint-disable-next-line react-refresh/only-export-components
export const STATUS = {
  not_verified: { bg: '#F3F4F6', text: '#6B7280', label: 'Not verified' },
  installed: { bg: '#D1FAE5', text: '#065F46', label: 'Installed' },
  snagged: { bg: '#FEE2E2', text: '#991B1B', label: 'Snagged' },
  commissioned: { bg: '#DBEAFE', text: '#1E40AF', label: 'Commissioned' },
}

// IFC type to readable name mapping
const IFC_TYPE_MAP = {
  IFCLIGHTFIXTURE: 'Light Fixture',
  IFCOUTLET: 'Power Outlet',
  IFCSWITCHINGDEVICE: 'Light Switch',
  IFCAIRTERMINAL: 'Air Terminal',
  IFCDUCTSEGMENT: 'Duct Segment',
  IFCPIPESEGMENT: 'Pipe Segment',
  IFCPIPEFITTING: 'Pipe Fitting',
  IFCFAN: 'Fan',
  IFCPUMP: 'Pump',
  IFCVALVE: 'Valve',
  IFCBOILER: 'Boiler',
  IFCDETECTOR: 'Detector',
  IFCALARM: 'Alarm',
  IFCFIRESUPPRESSIONTERMINAL: 'Sprinkler',
  IFCSANITARYTERMINAL: 'Sanitary Fitting',
  IFCDISTRIBUTIONBOARD: 'Distribution Board',
  IFCUNITARYEQUIPMENT: 'Unitary Equipment',
}

function ifcTypeToReadable(ifcType) {
  if (!ifcType) return '—'
  const upper = ifcType.toUpperCase()
  if (IFC_TYPE_MAP[upper]) return IFC_TYPE_MAP[upper]
  // Default: strip IFC prefix and convert to title case
  const stripped = upper.replace(/^IFC/, '')
  return stripped
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const STATUS_OPTIONS = ['all', 'not_verified', 'installed', 'snagged', 'commissioned']

// Sort arrow indicator — defined outside component to avoid re-creation during render
function SortArrow({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronUp size={12} style={{ opacity: 0.25 }} />
  return sortDir === 'asc'
    ? <ChevronUp size={12} style={{ opacity: 1 }} />
    : <ChevronDown size={12} style={{ opacity: 1 }} />
}

export default function BIMElementPanel({
  open,
  onClose,
  elements = [],
  onElementClick,
  onElementHover,
  onStatusUpdate,
}) {
  const [search, setSearch] = useState('')
  const [activeCategories, setActiveCategories] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortCol, setSortCol] = useState(null) // 'name' | 'type' | 'status'
  const [sortDir, setSortDir] = useState('asc')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedRow, setSelectedRow] = useState(null)

  // Toggle a category filter chip
  const toggleCategory = useCallback((cat) => {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  // Handle sort toggle
  const handleSort = useCallback((col) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return col
      }
      setSortDir('asc')
      return col
    })
  }, [])

  // Toggle a single checkbox
  const toggleSelect = useCallback((id, e) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Filtered & sorted elements
  const filtered = useMemo(() => {
    let result = [...elements]

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(el =>
        (el.name || '').toLowerCase().includes(q) ||
        (el.ifc_type || '').toLowerCase().includes(q) ||
        ifcTypeToReadable(el.ifc_type).toLowerCase().includes(q) ||
        (el.system || '').toLowerCase().includes(q)
      )
    }

    // Category filter
    if (activeCategories.size > 0) {
      result = result.filter(el => activeCategories.has(el.category))
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(el => (el.status || 'not_verified') === statusFilter)
    }

    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        let aVal, bVal
        if (sortCol === 'name') {
          aVal = (a.name || '').toLowerCase()
          bVal = (b.name || '').toLowerCase()
        } else if (sortCol === 'type') {
          aVal = ifcTypeToReadable(a.ifc_type).toLowerCase()
          bVal = ifcTypeToReadable(b.ifc_type).toLowerCase()
        } else if (sortCol === 'status') {
          aVal = (a.status || 'not_verified')
          bVal = (b.status || 'not_verified')
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [elements, search, activeCategories, statusFilter, sortCol, sortDir])

  // Category summary counts
  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const el of elements) {
      counts[el.category] = (counts[el.category] || 0) + 1
    }
    return counts
  }, [elements])

  // Toggle select all (filtered)
  const allFilteredSelected = filtered.length > 0 && filtered.every(el => selectedIds.has(el.id))
  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(el => el.id)))
    }
  }, [filtered, allFilteredSelected])

  // CSV export
  const handleExport = useCallback(() => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const filename = `BIM_Elements_Level_01_${dateStr}.csv`

    const headers = ['Element Name', 'IFC Type', 'Category', 'System', 'Level', 'Status', 'Snag Count', 'IFC Global ID', 'X', 'Y']
    const rows = filtered.map(el => [
      el.name || '',
      el.ifc_type || '',
      el.category || '',
      el.system || '',
      el.level || '',
      (STATUS[el.status || 'not_verified'] || STATUS.not_verified).label,
      el.snag_count || 0,
      el.ifc_global_id || '',
      el.draw_x ?? '',
      el.draw_y ?? '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  // Bulk status update
  const handleBulkStatus = useCallback((newStatus) => {
    if (onStatusUpdate && selectedIds.size > 0) {
      onStatusUpdate(Array.from(selectedIds), newStatus)
      setSelectedIds(new Set())
    }
  }, [selectedIds, onStatusUpdate])

  if (!open) return null

  const summaryParts = [
    `${elements.length} elements`,
    ...Object.entries(categoryCounts).map(([cat, count]) => `${count} ${cat}`),
  ]

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 49,
          display: 'none',
        }}
        className="bim-panel-backdrop"
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: '#fff',
          borderLeft: '0.5px solid #E5E7EB',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
          transition: 'transform 0.2s ease',
        }}
        className="bim-element-panel"
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '0.5px solid #E5E7EB',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
              BIM Elements
            </span>
            <span style={{
              fontSize: 12,
              color: '#6B7280',
              background: '#F3F4F6',
              borderRadius: 10,
              padding: '2px 8px',
            }}>
              {filtered.length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleExport}
              title="Export CSV"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Download size={16} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{
          padding: '8px 16px',
          fontSize: 12,
          color: '#6B7280',
          borderBottom: '0.5px solid #E5E7EB',
          flexShrink: 0,
        }}>
          {summaryParts.join(' | ')}
        </div>

        {/* Search bar */}
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                color: '#9CA3AF',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, type, system..."
              style={{
                width: '100%',
                height: 36,
                paddingLeft: 32,
                paddingRight: 10,
                fontSize: 13,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                outline: 'none',
                color: '#111827',
                background: '#fff',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9CA3AF',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category filter chips + status dropdown */}
        <div style={{
          padding: '4px 16px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {Object.entries(BIM_CATEGORIES).map(([key, cat]) => {
            const active = activeCategories.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 12,
                  border: active ? `1px solid ${cat.color}` : '1px solid #E5E7EB',
                  background: active ? `${cat.color}18` : '#fff',
                  color: active ? '#111827' : '#6B7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: cat.color,
                  flexShrink: 0,
                }} />
                {cat.label}
              </button>
            )
          })}

          {/* Status filter dropdown */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ListFilter size={13} style={{ color: '#9CA3AF' }} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                fontSize: 11,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                padding: '3px 6px',
                color: '#374151',
                background: '#fff',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt === 'all' ? 'All' : STATUS[opt].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            tableLayout: 'fixed',
          }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                background: '#FAFAFA',
                borderBottom: '0.5px solid #E5E7EB',
                zIndex: 1,
              }}>
                <th style={{ width: 36, padding: '8px 4px 8px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#3B82F6' }}
                  />
                </th>
                <th
                  onClick={() => handleSort('name')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    fontWeight: 600,
                    fontSize: 11,
                    color: '#6B7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Name <SortArrow col="name" sortCol={sortCol} sortDir={sortDir} />
                  </span>
                </th>
                <th
                  onClick={() => handleSort('type')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    fontWeight: 600,
                    fontSize: 11,
                    color: '#6B7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: 90,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Type <SortArrow col="type" sortCol={sortCol} sortDir={sortDir} />
                  </span>
                </th>
                <th style={{
                  textAlign: 'left',
                  padding: '8px 6px',
                  fontWeight: 600,
                  fontSize: 11,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  width: 78,
                }}>
                  Category
                </th>
                <th
                  onClick={() => handleSort('status')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    fontWeight: 600,
                    fontSize: 11,
                    color: '#6B7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: 86,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Status <SortArrow col="status" sortCol={sortCol} sortDir={sortDir} />
                  </span>
                </th>
                <th style={{
                  textAlign: 'center',
                  padding: '8px 6px',
                  fontWeight: 600,
                  fontSize: 11,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  width: 44,
                }}>
                  Snags
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(el => {
                const isSelected = selectedIds.has(el.id)
                const isRowSelected = selectedRow === el.id
                const statusKey = el.status || 'not_verified'
                const statusInfo = STATUS[statusKey] || STATUS.not_verified
                const catInfo = BIM_CATEGORIES[el.category] || BIM_CATEGORIES.other
                const snagCount = el.snag_count || 0

                return (
                  <tr
                    key={el.id}
                    onClick={() => {
                      setSelectedRow(el.id)
                      onElementClick?.(el)
                    }}
                    onMouseEnter={() => onElementHover?.(el.id)}
                    onMouseLeave={() => onElementHover?.(null)}
                    style={{
                      height: 44,
                      borderBottom: '0.5px solid #F3F4F6',
                      cursor: 'pointer',
                      background: isRowSelected ? '#EFF6FF' : undefined,
                      borderLeft: isRowSelected ? '3px solid #3B82F6' : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseOver={e => {
                      if (!isRowSelected) e.currentTarget.style.background = '#F9FAFB'
                    }}
                    onMouseOut={e => {
                      if (!isRowSelected) e.currentTarget.style.background = ''
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '0 4px 0 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => toggleSelect(el.id, e)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: '#3B82F6' }}
                      />
                    </td>

                    {/* Name */}
                    <td style={{
                      padding: '0 6px',
                      fontSize: 13,
                      color: '#111827',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 0,
                    }}>
                      {el.name || '—'}
                    </td>

                    {/* Type */}
                    <td style={{
                      padding: '0 6px',
                      fontSize: 12,
                      color: '#6B7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {ifcTypeToReadable(el.ifc_type)}
                    </td>

                    {/* Category */}
                    <td style={{ padding: '0 6px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: '#6B7280',
                      }}>
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: catInfo.color,
                          flexShrink: 0,
                        }} />
                        {catInfo.label}
                      </span>
                    </td>

                    {/* Status — click to cycle */}
                    <td style={{ padding: '0 6px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const order = ['not_verified', 'installed', 'snagged', 'commissioned']
                          const next = order[(order.indexOf(statusKey) + 1) % order.length]
                          onStatusUpdate?.([el.id], next)
                        }}
                        title="Click to change status"
                        style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                        background: statusInfo.bg,
                        color: statusInfo.text,
                        whiteSpace: 'nowrap',
                      }}>
                        {statusInfo.label}
                      </button>
                    </td>

                    {/* Snags */}
                    <td style={{ padding: '0 6px', textAlign: 'center' }}>
                      {snagCount > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 20,
                          height: 20,
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          background: '#FEE2E2',
                          color: '#DC2626',
                        }}>
                          {snagCount}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#D1D5DB' }}>0</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    color: '#9CA3AF',
                    fontSize: 13,
                  }}>
                    No elements match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '10px 16px',
            background: '#1E293B',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            flexShrink: 0,
            borderTop: '1px solid #334155',
          }}>
            <span>
              <strong>{selectedIds.size}</strong> selected
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              Mark as:
              <button
                onClick={() => handleBulkStatus('installed')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#D1FAE5',
                  color: '#065F46',
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Installed
              </button>
              <button
                onClick={() => handleBulkStatus('commissioned')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#DBEAFE',
                  color: '#1E40AF',
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Commissioned
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Responsive styles for mobile */}
      <style>{`
        @media (max-width: 767px) {
          .bim-panel-backdrop {
            display: block !important;
          }
          .bim-element-panel {
            width: 100% !important;
            top: 10vh !important;
            border-radius: 16px 16px 0 0 !important;
            border-left: none !important;
          }
        }
      `}</style>
    </>
  )
}
