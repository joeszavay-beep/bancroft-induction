// BIM utility functions that don't require web-ifc WASM
// Import these for lightweight usage; import ifcParser.js only for parsing

// Category display config
export const BIM_CATEGORIES = {
  electrical: { label: 'Electrical', color: '#FBBF24', icon: '⚡' },
  mechanical: { label: 'Mechanical', color: '#60A5FA', icon: '🌀' },
  plumbing: { label: 'Plumbing', color: '#34D399', icon: '🔧' },
  fire: { label: 'Fire', color: '#EF4444', icon: '🔥' },
  other: { label: 'Other', color: '#A78BFA', icon: '📦' },
}

/**
 * Map IFC coordinate to drawing percentage position using two-point calibration
 */
export function ifcToDrawingPercent(ifcPoint, calibration) {
  const { point1_ifc_x, point1_ifc_y, point1_draw_x, point1_draw_y,
          point2_ifc_x, point2_ifc_y, point2_draw_x, point2_draw_y } = calibration

  const ifcDx = point2_ifc_x - point1_ifc_x
  const ifcDy = point2_ifc_y - point1_ifc_y
  const drawDx = point2_draw_x - point1_draw_x
  const drawDy = point2_draw_y - point1_draw_y

  if (Math.abs(ifcDx) < 0.001 && Math.abs(ifcDy) < 0.001) return null

  const scaleX = Math.abs(ifcDx) > 0.001 ? drawDx / ifcDx : 0
  const scaleY = Math.abs(ifcDy) > 0.001 ? drawDy / ifcDy : 0

  const useScaleX = Math.abs(ifcDx) > 0.001
  const useScaleY = Math.abs(ifcDy) > 0.001

  const x = useScaleX
    ? point1_draw_x + (ifcPoint.x - point1_ifc_x) * scaleX
    : point1_draw_x

  const y = useScaleY
    ? point1_draw_y + (ifcPoint.y - point1_ifc_y) * scaleY
    : point1_draw_y

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

/**
 * Find nearby BIM elements to a given drawing position
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
