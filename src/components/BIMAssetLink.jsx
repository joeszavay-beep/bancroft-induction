import { BIM_CATEGORIES } from '../lib/bimUtils'
import { X, Link2 } from 'lucide-react'

/**
 * Shows nearby BIM assets when placing a snag pin.
 * Allows the user to link the snag to a specific building asset.
 */
export default function BIMAssetLink({ nearbyElements, selectedElement, onSelect, onDismiss }) {
  if (!nearbyElements?.length) return null

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
          <Link2 size={12} />
          Link to nearby asset?
        </p>
        <button onClick={onDismiss} className="text-purple-400 hover:text-purple-600">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {nearbyElements.map(el => {
          const cat = BIM_CATEGORIES[el.category] || BIM_CATEGORIES.other
          const isSelected = selectedElement?.id === el.id
          return (
            <button
              key={el.id}
              onClick={() => onSelect(isSelected ? null : el)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                isSelected
                  ? 'bg-purple-200 text-purple-900 ring-1 ring-purple-400'
                  : 'bg-white hover:bg-purple-100 text-slate-700'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                style={{ backgroundColor: cat.color }}>
                {cat.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{el.name}</p>
                <p className="text-[10px] text-slate-400">{cat.label} — {el.ifc_type}</p>
              </div>
              {isSelected && <span className="text-purple-600 text-[10px] font-bold shrink-0">LINKED</span>}
            </button>
          )
        })}
      </div>

      {selectedElement && (
        <p className="text-[10px] text-purple-500 mt-2">
          This snag will be linked to: <strong>{selectedElement.name}</strong>
        </p>
      )}
    </div>
  )
}
