import * as WebIfc from 'web-ifc'

// MEP category classification by IFC type
const CATEGORY_MAP = {
  // Electrical
  IFCELECTRICALELEMENT: 'electrical',
  IFCELECTRICDISTRIBUTIONBOARD: 'electrical',
  IFCELECTRICMOTOR: 'electrical',
  IFCELECTRICGENERATOR: 'electrical',
  IFCELECTRICTIMECONTROL: 'electrical',
  IFCELECTRICFLOWSTORAGEDEVICE: 'electrical',
  IFCSWITCHINGDEVICE: 'electrical',
  IFCOUTLET: 'electrical',
  IFCLIGHTFIXTURE: 'electrical',
  IFCJUNCTIONBOX: 'electrical',
  IFCCABLECARRIERSEGMENT: 'electrical',
  IFCCABLECARRIERFITTING: 'electrical',
  IFCCABLESEGMENT: 'electrical',
  IFCCABLEFITTING: 'electrical',
  IFCPROTECTIVEDEVICE: 'electrical',
  IFCDISTRIBUTIONBOARD: 'electrical',
  IFCLAMP: 'electrical',

  // Mechanical / HVAC
  IFCAIRTERMINAL: 'mechanical',
  IFCAIRTERMINALBOX: 'mechanical',
  IFCAIRTOAIRHEATRECOVERY: 'mechanical',
  IFCBOILER: 'mechanical',
  IFCBURNER: 'mechanical',
  IFCCHILLER: 'mechanical',
  IFCCOIL: 'mechanical',
  IFCCOMPRESSOR: 'mechanical',
  IFCCONDENSER: 'mechanical',
  IFCCOOLEDBEAM: 'mechanical',
  IFCCOOLINGTOWER: 'mechanical',
  IFCDUCTFITTING: 'mechanical',
  IFCDUCTSEGMENT: 'mechanical',
  IFCDUCTSILENCER: 'mechanical',
  IFCEVAPORATIVECOOLER: 'mechanical',
  IFCEVAPORATOR: 'mechanical',
  IFCFAN: 'mechanical',
  IFCFILTER: 'mechanical',
  IFCFLOWMETER: 'mechanical',
  IFCHEATEXCHANGER: 'mechanical',
  IFCHUMIDIFIER: 'mechanical',
  IFCMOTORCONNECTION: 'mechanical',
  IFCSPACEHEATERELEMENT: 'mechanical',
  IFCUNITARYEQUIPMENT: 'mechanical',

  // Plumbing
  IFCPIPEFITTING: 'plumbing',
  IFCPIPESEGMENT: 'plumbing',
  IFCPUMP: 'plumbing',
  IFCSANITARYTERMINAL: 'plumbing',
  IFCTANK: 'plumbing',
  IFCVALVE: 'plumbing',
  IFCWASTETERMINAL: 'plumbing',
  IFCSTACKTERMINAL: 'plumbing',
  IFCINTERCEPTOR: 'plumbing',

  // Fire
  IFCFIREALARM: 'fire',
  IFCFIRESUPPRESSIONTERMINAL: 'fire',
  IFCALARM: 'fire',
  IFCDETECTOR: 'fire',
  IFCSENSOR: 'fire',
}

// Category display config
export const BIM_CATEGORIES = {
  electrical: { label: 'Electrical', color: '#FBBF24', icon: '⚡' },
  mechanical: { label: 'Mechanical', color: '#60A5FA', icon: '🌀' },
  plumbing: { label: 'Plumbing', color: '#34D399', icon: '🔧' },
  fire: { label: 'Fire', color: '#EF4444', icon: '🔥' },
  other: { label: 'Other', color: '#A78BFA', icon: '📦' },
}

/**
 * Parse an IFC file and extract MEP elements with coordinates
 * @param {ArrayBuffer} buffer - IFC file contents
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {{ elements: Array, ifcSchema: string }}
 */
export async function parseIFC(buffer, onProgress) {
  const ifcApi = new WebIfc.IfcAPI()

  // Load WASM from public directory — first arg is locateFile handler
  await ifcApi.Init((path) => `/${path}`)

  onProgress?.(10)

  const modelId = ifcApi.OpenModel(new Uint8Array(buffer))
  const schema = ifcApi.GetHeaderLine(modelId, WebIfc.FILE_SCHEMA)?.arguments?.[0]?.[0]?.value || 'IFC2X3'

  onProgress?.(20)

  const elements = []
  const allTypes = ifcApi.GetAllTypesOfModel(modelId)
  const totalTypes = allTypes.length
  let processed = 0

  for (const { typeID, typeName } of allTypes) {
    processed++
    const progress = 20 + Math.floor((processed / totalTypes) * 70)
    if (processed % 50 === 0) onProgress?.(progress)

    // Only extract MEP-related elements
    const upperName = typeName?.toUpperCase()
    const category = CATEGORY_MAP[upperName]
    if (!category && !upperName?.includes('DISTRIBUTION') && !upperName?.includes('FLOW')) continue

    const ids = ifcApi.GetLineIDsWithType(modelId, typeID)
    for (let i = 0; i < ids.size(); i++) {
      const expressId = ids.get(i)
      try {
        const props = ifcApi.GetLine(modelId, expressId, true)
        if (!props) continue

        const name = props.Name?.value || props.Tag?.value || null
        const desc = props.Description?.value || null
        const globalId = props.GlobalId?.value || null

        // Try to get placement coordinates
        let x = null, y = null, z = null
        try {
          const placement = props.ObjectPlacement
          if (placement) {
            const coords = extractCoordinates(ifcApi, modelId, placement)
            if (coords) { x = coords.x; y = coords.y; z = coords.z }
          }
        } catch {}

        // Get property sets
        const properties = {}
        try {
          const psets = ifcApi.GetPropertySets(modelId, expressId)
          if (psets) {
            for (const pset of psets) {
              if (pset.HasProperties) {
                for (const prop of pset.HasProperties) {
                  if (prop.Name?.value && prop.NominalValue?.value !== undefined) {
                    properties[prop.Name.value] = prop.NominalValue.value
                  }
                }
              }
            }
          }
        } catch {}

        // Get system/floor info from spatial containment
        let floorName = null
        let systemType = null
        try {
          if (props.PredefinedType?.value) systemType = props.PredefinedType.value
        } catch {}

        elements.push({
          ifc_id: expressId,
          global_id: globalId,
          ifc_type: typeName,
          name: name || typeName,
          description: desc,
          category: category || 'other',
          system_type: systemType,
          floor_name: floorName,
          x, y, z,
          properties,
        })
      } catch (err) {
        // Skip elements that can't be parsed
        console.warn(`Failed to parse element ${expressId}:`, err.message)
      }
    }
  }

  onProgress?.(95)

  ifcApi.CloseModel(modelId)

  onProgress?.(100)

  return { elements, ifcSchema: schema }
}

/**
 * Extract x,y,z from an IFC placement chain
 */
function extractCoordinates(ifcApi, modelId, placement) {
  try {
    let resolved = placement
    if (typeof resolved === 'object' && resolved.expressID) {
      resolved = ifcApi.GetLine(modelId, resolved.expressID, true)
    }
    if (!resolved) return null

    const relPlacement = resolved.RelativePlacement
    if (!relPlacement) return null

    let rp = relPlacement
    if (typeof rp === 'object' && rp.expressID) {
      rp = ifcApi.GetLine(modelId, rp.expressID, true)
    }
    if (!rp) return null

    let loc = rp.Location
    if (typeof loc === 'object' && loc.expressID) {
      loc = ifcApi.GetLine(modelId, loc.expressID, true)
    }
    if (!loc?.Coordinates) return null

    const coords = loc.Coordinates
    return {
      x: coords[0]?.value ?? coords[0] ?? 0,
      y: coords[1]?.value ?? coords[1] ?? 0,
      z: coords[2]?.value ?? coords[2] ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Map IFC coordinate to drawing percentage position using two-point calibration
 * @param {{ x: number, y: number }} ifcPoint - IFC world coordinate
 * @param {object} calibration - Calibration data with point1/point2 pairs
 * @returns {{ x: number, y: number }} - Drawing percentage position (0-100)
 */
export function ifcToDrawingPercent(ifcPoint, calibration) {
  const { point1_ifc_x, point1_ifc_y, point1_draw_x, point1_draw_y,
          point2_ifc_x, point2_ifc_y, point2_draw_x, point2_draw_y } = calibration

  // Linear interpolation between two calibration points
  const ifcDx = point2_ifc_x - point1_ifc_x
  const ifcDy = point2_ifc_y - point1_ifc_y
  const drawDx = point2_draw_x - point1_draw_x
  const drawDy = point2_draw_y - point1_draw_y

  if (Math.abs(ifcDx) < 0.001 && Math.abs(ifcDy) < 0.001) return null

  // Compute scale factors
  const scaleX = Math.abs(ifcDx) > 0.001 ? drawDx / ifcDx : 0
  const scaleY = Math.abs(ifcDy) > 0.001 ? drawDy / ifcDy : 0

  // Use the scale that's non-zero, or average if both are valid
  const useScaleX = Math.abs(ifcDx) > 0.001
  const useScaleY = Math.abs(ifcDy) > 0.001

  const x = useScaleX
    ? point1_draw_x + (ifcPoint.x - point1_ifc_x) * scaleX
    : point1_draw_x

  const y = useScaleY
    ? point1_draw_y + (ifcPoint.y - point1_ifc_y) * scaleY
    : point1_draw_y

  // Clamp to 0-100
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

/**
 * Find nearby BIM elements to a given drawing position
 * @param {Array} elements - BIM elements with draw_x, draw_y positions
 * @param {{ x: number, y: number }} point - Drawing percentage position
 * @param {number} radiusPercent - Search radius in drawing percentage units
 * @returns {Array} Nearby elements sorted by distance
 */
export function findNearbyElements(elements, point, radiusPercent = 3) {
  return elements
    .filter(el => el.draw_x != null && el.draw_y != null)
    .map(el => ({
      ...el,
      distance: Math.sqrt(
        Math.pow(el.draw_x - point.x, 2) +
        Math.pow(el.draw_y - point.y, 2)
      ),
    }))
    .filter(el => el.distance <= radiusPercent)
    .sort((a, b) => a.distance - b.distance)
}
