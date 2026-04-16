import { useState } from 'react'
import { X, Copy, Check, AlertCircle, Crosshair } from 'lucide-react'
import { BIM_CATEGORIES } from '../lib/bimUtils'

/**
 * Map IFC type strings to human-readable names
 */
// eslint-disable-next-line react-refresh/only-export-components
export function readableIfcType(typeName) {
  if (!typeName) return 'Unknown Type'
  const map = {
    IFCLIGHTFIXTURE: 'Light Fixture',
    IFCOUTLET: 'Power Outlet',
    IFCSWITCHINGDEVICE: 'Light Switch',
    IFCFLOWSEGMENT: 'Flow Segment',
    IFCFLOWTERMINAL: 'Flow Terminal',
    IFCFLOWCONTROLLER: 'Flow Controller',
    IFCFLOWFITTING: 'Flow Fitting',
    IFCFLOWMOVINGDEVICE: 'Flow Moving Device',
    IFCFLOWSTORAGEDEVICE: 'Flow Storage Device',
    IFCFLOWTREATMENTDEVICE: 'Flow Treatment Device',
    IFCFIRESUPPRESSIONTERMINAL: 'Fire Suppression Terminal',
    IFCSANITARYTERMINAL: 'Sanitary Terminal',
    IFCWASTETERMINAL: 'Waste Terminal',
    IFCSTACKTERMINAL: 'Stack Terminal',
    IFCDUCTFITTING: 'Duct Fitting',
    IFCDUCTSEGMENT: 'Duct Segment',
    IFCDUCTSILENCER: 'Duct Silencer',
    IFCPIPEFITTING: 'Pipe Fitting',
    IFCPIPESEGMENT: 'Pipe Segment',
    IFCCABLECARRIERFITTING: 'Cable Carrier Fitting',
    IFCCABLECARRIERSEGMENT: 'Cable Carrier Segment',
    IFCCABLESEGMENT: 'Cable Segment',
    IFCJUNCTIONBOX: 'Junction Box',
    IFCELECTRICDISTRIBUTIONBOARD: 'Distribution Board',
    IFCELECTRICMOTOR: 'Electric Motor',
    IFCELECTRICGENERATOR: 'Electric Generator',
    IFCTRANSFORMER: 'Transformer',
    IFCPROTECTIVEDEVICE: 'Protective Device',
    IFCDISTRIBUTIONCHAMBER: 'Distribution Chamber',
    IFCVALVE: 'Valve',
    IFCPUMP: 'Pump',
    IFCFAN: 'Fan',
    IFCCOMPRESSOR: 'Compressor',
    IFCCOIL: 'Coil',
    IFCBOILER: 'Boiler',
    IFCCHILLER: 'Chiller',
    IFCCONDENSER: 'Condenser',
    IFCCOOLEDBEAM: 'Cooled Beam',
    IFCCOOLINGTOWER: 'Cooling Tower',
    IFCEVAPORATIVECOOLER: 'Evaporative Cooler',
    IFCEVAPORATOR: 'Evaporator',
    IFCHEATEXCHANGER: 'Heat Exchanger',
    IFCHUMIDIFIER: 'Humidifier',
    IFCUNITARYEQUIPMENT: 'Unitary Equipment',
    IFCAIRTERMINAL: 'Air Terminal',
    IFCAIRTERMINALBOX: 'Air Terminal Box',
    IFCDAMPER: 'Damper',
    IFCFILTER: 'Filter',
    IFCFIRESUPPRESSIONTERMINALTYPE: 'Fire Suppression Terminal',
    IFCALARM: 'Alarm',
    IFCDETECTOR: 'Detector',
    IFCSENSOR: 'Sensor',
    IFCACTUATOR: 'Actuator',
    IFCCONTROLLER: 'Controller',
    IFCSPACER: 'Spacer',
    IFCSPACE: 'Space',
    IFCWALL: 'Wall',
    IFCDOOR: 'Door',
    IFCWINDOW: 'Window',
    IFCSLAB: 'Slab',
    IFCCOLUMN: 'Column',
    IFCBEAM: 'Beam',
    IFCROOF: 'Roof',
    IFCSTAIR: 'Stair',
    IFCRAMP: 'Ramp',
    IFCRAILING: 'Railing',
    IFCFURNITURE: 'Furniture',
    IFCCOVERING: 'Covering',
    IFCBUILDINGELEMENTPROXY: 'Building Element',
  }
  const upper = typeName.toUpperCase().replace(/\s+/g, '')
  return map[upper] || typeName.replace(/^IFC/i, '').replace(/([A-Z])/g, ' $1').trim()
}

const SNAG_STATUS_DOTS = {
  open: '#EF4444',
  completed: '#22C55E',
  closed: '#9CA3AF',
  reassigned: '#F59E0B',
  pending_review: '#A855F7',
}

export default function BIMElementPopup({ element, position, onClose, onRaiseSnag, linkedSnags = [] }) {
  const [copiedId, setCopiedId] = useState(false)
  const [showAllProps, setShowAllProps] = useState(false)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  if (!element) return null

  const category = BIM_CATEGORIES[element.category] || BIM_CATEGORIES.other
  const properties = element.properties || {}
  const propEntries = Object.entries(properties).filter(
    ([, v]) => v != null && v !== '' && v !== undefined
  )
  const visibleProps = showAllProps ? propEntries : propEntries.slice(0, 6)

  // Popup positioning (desktop)
  const flipBelow = position && position.y < 200
  const shiftLeft = position && position.x > window.innerWidth - 340

  const handleCopyGlobalId = async () => {
    try {
      await navigator.clipboard.writeText(element.global_id || '')
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1500)
    } catch {
      // fallback: ignore
    }
  }

  const truncate = (str, len) => {
    if (!str) return ''
    return str.length > len ? str.slice(0, len) + '...' : str
  }

  // Mobile bottom sheet
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[1000]"
        onClick={onClose}
      >
        <div className="fixed inset-0 bg-black/20" />
        <div
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-xl overflow-hidden"
          style={{
            maxHeight: '60vh',
            animation: 'bimPopupSlideUp 200ms ease-out forwards',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 16px)' }}>
            {renderContent()}
          </div>
        </div>

        <style>{`
          @keyframes bimPopupSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Desktop popup
  const popupStyle = {
    position: 'fixed',
    left: shiftLeft ? position.x - 280 : position.x - 160,
    top: flipBelow ? position.y + 16 : 'auto',
    bottom: flipBelow ? 'auto' : `${window.innerHeight - position.y + 16}px`,
    minWidth: 280,
    maxWidth: 320,
    zIndex: 1000,
    opacity: 1,
    transform: 'scale(1)',
    animation: 'bimPopupFadeIn 150ms ease-out forwards',
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[999]"
        onClick={onClose}
      />
      <div style={popupStyle} onClick={(e) => e.stopPropagation()}>
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{
            border: '0.5px solid #E5E7EB',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            position: 'relative',
          }}
        >
          {/* Pointer triangle */}
          <div
            style={{
              position: 'absolute',
              [flipBelow ? 'top' : 'bottom']: -8,
              left: shiftLeft ? 'auto' : '50%',
              right: shiftLeft ? 40 : 'auto',
              transform: shiftLeft ? 'none' : 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              ...(flipBelow
                ? { borderBottom: '8px solid white' }
                : { borderTop: '8px solid white' }),
            }}
          />

          {renderContent()}
        </div>
      </div>

      <style>{`
        @keyframes bimPopupFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  )

  function renderContent() {
    return (
      <div className="text-sm">
        {/* Header */}
        <div className="px-3 pt-3 pb-2" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: category.color,
                }}
              />
              <span
                className="truncate"
                style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}
              >
                {element.name || 'Unnamed Element'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors"
            >
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#6B7A99', marginTop: 2, paddingLeft: 16 }}>
            {readableIfcType(element.ifc_type)} &mdash; {category.label}
          </div>
        </div>

        {/* Core info */}
        <div className="px-3 py-2 space-y-1.5" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <InfoRow label="System">
            {element.system_type ? (
              <span>{element.system_type}</span>
            ) : (
              <span className="italic text-gray-400">Unassigned</span>
            )}
          </InfoRow>
          <InfoRow label="Level">
            {element.floor_name || <span className="italic text-gray-400">Unknown</span>}
          </InfoRow>
          <InfoRow label="IFC Ref">
            <div className="flex items-center gap-1 min-w-0">
              <span
                className="truncate"
                style={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 160 }}
                title={element.global_id}
              >
                {element.global_id || '—'}
              </span>
              {element.global_id && (
                <button
                  onClick={handleCopyGlobalId}
                  className="shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors"
                  title="Copy IFC Reference"
                >
                  {copiedId ? (
                    <Check size={12} className="text-green-500" />
                  ) : (
                    <Copy size={12} className="text-gray-400" />
                  )}
                </button>
              )}
              {copiedId && (
                <span className="text-green-600" style={{ fontSize: 10 }}>
                  Copied!
                </span>
              )}
            </div>
          </InfoRow>
        </div>

        {/* Properties */}
        <div className="px-3 py-2" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6B7A99',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Properties
          </div>
          {propEntries.length === 0 ? (
            <div className="italic text-gray-400" style={{ fontSize: 12 }}>
              No properties available
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {visibleProps.map(([key, value]) => (
                  <InfoRow key={key} label={formatPropKey(key)}>
                    <span className="truncate" title={String(value)}>
                      {String(value)}
                    </span>
                  </InfoRow>
                ))}
              </div>
              {propEntries.length > 6 && (
                <button
                  onClick={() => setShowAllProps(!showAllProps)}
                  className="text-blue-600 hover:text-blue-800 mt-1.5 transition-colors"
                  style={{ fontSize: 11 }}
                >
                  {showAllProps
                    ? 'Show less'
                    : `Show all (${propEntries.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Snags */}
        <div className="px-3 py-2" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#6B7A99',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Snags
            </span>
            {linkedSnags.length > 0 && (
              <span
                className="rounded-full px-1.5 text-white"
                style={{
                  fontSize: 10,
                  lineHeight: '16px',
                  backgroundColor: '#EF4444',
                  minWidth: 16,
                  textAlign: 'center',
                }}
              >
                {linkedSnags.length}
              </span>
            )}
          </div>
          {linkedSnags.length === 0 ? (
            <div className="italic text-gray-400" style={{ fontSize: 12 }}>
              No snags raised
            </div>
          ) : (
            <div className="space-y-1">
              {linkedSnags.map((snag) => (
                <div
                  key={snag.id}
                  className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                  style={{ fontSize: 12 }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: SNAG_STATUS_DOTS[snag.status] || '#9CA3AF',
                    }}
                  />
                  <span className="text-gray-500 font-medium">
                    #{snag.number || snag.id}
                  </span>
                  <span className="truncate text-gray-700">
                    {truncate(snag.description, 30)}
                  </span>
                  <span
                    className="shrink-0 ml-auto capitalize"
                    style={{ fontSize: 10, color: '#6B7A99' }}
                  >
                    {snag.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="px-3 py-3">
          <button
            onClick={() => onRaiseSnag && onRaiseSnag(element)}
            className="w-full text-white font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: '#1B6FC8',
              padding: '8px 12px',
              fontSize: 13,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1558A0')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B6FC8')}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Crosshair size={14} />
              Raise Snag Against This Asset
            </span>
          </button>
        </div>
      </div>
    )
  }
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-800 text-right min-w-0">{children}</span>
    </div>
  )
}

function formatPropKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}
