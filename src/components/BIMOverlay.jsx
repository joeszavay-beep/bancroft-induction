import { useState } from 'react'
import { BIM_CATEGORIES, ifcToDrawingPercent } from '../lib/bimUtils'
import { Box, ZapOff, Layers, List } from 'lucide-react'

/**
 * BIM element overlay for drawing viewers.
 * Renders small category-colored dots on the drawing at calibrated positions.
 */
export default function BIMOverlay({ elements, calibration, visible, onElementClick, selectedElementId, hoveredElementId }) {
  const [localHoveredId, setLocalHoveredId] = useState(null)

  if (!visible || !calibration || !elements?.length) return null

  const activeHoverId = hoveredElementId || localHoveredId

  return (
    <>
      {elements.map(el => {
        if (el.x == null || el.y == null) return null

        const pos = ifcToDrawingPercent({ x: el.x, y: el.y }, calibration)
        if (!pos) return null

        const cat = BIM_CATEGORIES[el.category] || BIM_CATEGORIES.other
        const isSelected = selectedElementId === el.id
        const isHovered = activeHoverId === el.id

        return (
          <button
            key={el.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-[5]"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onMouseEnter={() => setLocalHoveredId(el.id)}
            onMouseLeave={() => setLocalHoveredId(null)}
            onClick={(e) => { e.stopPropagation(); onElementClick?.(el, e) }}
            title={`${el.name} (${cat.label})`}
          >
            {/* Pulsing ring for selected element */}
            {isSelected && (
              <div
                className="absolute inset-0 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                style={{
                  width: 20, height: 20,
                  left: '50%', top: '50%',
                  backgroundColor: cat.color,
                  opacity: 0.3,
                }}
              />
            )}

            {/* Glow ring for hovered element (from panel) */}
            {isHovered && !isSelected && (
              <div
                className="absolute rounded-full"
                style={{
                  width: 16, height: 16,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: cat.color,
                  opacity: 0.2,
                }}
              />
            )}

            {/* Dot */}
            <div
              style={{
                width: isSelected ? 12 : isHovered ? 10 : 8,
                height: isSelected ? 12 : isHovered ? 10 : 8,
                backgroundColor: cat.color,
                borderRadius: '50%',
                border: isSelected ? '2px solid white' : '1px solid rgba(0,0,0,0.2)',
                boxShadow: isSelected ? `0 0 8px ${cat.color}` : isHovered ? `0 0 4px ${cat.color}` : 'none',
                opacity: isSelected || isHovered ? 1 : 0.8,
                transition: 'all 0.15s ease',
                position: 'relative',
                zIndex: isSelected ? 10 : isHovered ? 5 : 1,
              }}
            />

            {/* Tooltip on hover */}
            {isHovered && !isSelected && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900/95 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap shadow-lg pointer-events-none z-50">
                <p className="font-semibold">{el.name}</p>
                <p className="text-slate-300">{cat.label} · {el.floor_name || 'Unknown floor'}</p>
              </div>
            )}
          </button>
        )
      })}
    </>
  )
}

/**
 * BIM layer toggle button with category filter, floor selector, and list toggle
 */
export function BIMToggle({ visible, onToggle, elements, categoryFilter, onCategoryChange, floors, selectedFloor, onFloorChange, onOpenList, listOpen }) {
  const [showPanel, setShowPanel] = useState(false)

  const counts = {}
  for (const el of (elements || [])) {
    counts[el.category] = (counts[el.category] || 0) + 1
  }

  const floorCounts = {}
  for (const el of (elements || [])) {
    const f = el.floor_name || 'Unknown'
    floorCounts[f] = (floorCounts[f] || 0) + 1
  }

  return (
    <div className="relative flex items-center gap-0.5">
      {/* List toggle button */}
      <button
        onClick={onOpenList}
        className={`p-2 rounded-lg transition-colors ${
          listOpen ? 'bg-blue-500 text-white' : 'hover:bg-slate-700 text-white'
        }`}
        title="Element List"
      >
        <List size={16} />
      </button>

      {/* Overlay toggle button */}
      <button
        onClick={() => {
          if (!visible) { onToggle(true); setShowPanel(true) }
          else setShowPanel(!showPanel)
        }}
        className={`p-2 rounded-lg transition-colors ${
          visible ? 'bg-purple-500 text-white' : 'hover:bg-slate-700 text-white'
        }`}
        title="BIM Elements"
      >
        <Box size={16} />
      </button>

      {showPanel && visible && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 w-60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-700">BIM Overlay</p>
            <button onClick={() => { onToggle(false); setShowPanel(false) }}
              className="text-[10px] text-slate-400 hover:text-red-500">
              <ZapOff size={12} />
            </button>
          </div>

          {/* Floor selector */}
          {floors?.length > 1 && (
            <div className="mb-2 pb-2 border-b border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Layers size={10} /> FLOOR
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => onFloorChange?.(null)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    !selectedFloor ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  All
                </button>
                {floors.map(f => (
                  <button
                    key={f}
                    onClick={() => onFloorChange?.(selectedFloor === f ? null : f)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      selectedFloor === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {f} ({floorCounts[f] || 0})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category filters */}
          <p className="text-[10px] font-semibold text-slate-400 mb-1">CATEGORIES</p>
          <div className="space-y-1">
            {Object.entries(BIM_CATEGORIES).map(([key, cat]) => {
              if (!counts[key]) return null
              const isActive = !categoryFilter || categoryFilter.includes(key)
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (!categoryFilter) onCategoryChange([key])
                    else if (categoryFilter.includes(key) && categoryFilter.length === 1) onCategoryChange(null)
                    else if (categoryFilter.includes(key)) onCategoryChange(categoryFilter.filter(c => c !== key))
                    else onCategoryChange([...categoryFilter, key])
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isActive ? cat.color : '#CBD5E1' }} />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <span className="text-[10px] text-slate-400">{counts[key]}</span>
                </button>
              )
            })}
          </div>

          <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            {elements?.length || 0} elements {selectedFloor ? `on ${selectedFloor}` : 'total'}
          </p>
        </div>
      )}
    </div>
  )
}
