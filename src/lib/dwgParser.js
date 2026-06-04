// DWG parser — lazy-loads @mlightcad/libredwg-web WASM
// Same pattern as ifcParser.js — only loaded when user triggers DWG auto-detect

let libredwgInstance = null

/**
 * Parse a DWG file and extract INSERT entities (block references = fixtures) by layer.
 * @param {ArrayBuffer} buffer - DWG file contents
 * @param {function} onProgress - callback(0-100)
 * @returns {{ layers: Array<{name, insertCount}>, insertsByLayer: Object, allInserts: Array, bounds: Object }}
 */
export async function parseDWG(buffer, onProgress = () => {}) {
  onProgress(0)

  // Lazy-load WASM
  if (!libredwgInstance) {
    const { LibreDwg } = await import('@mlightcad/libredwg-web')
    libredwgInstance = await LibreDwg.create()
  }
  onProgress(20)

  // Parse DWG
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web')
  const data = new Uint8Array(buffer)
  const dwg = libredwgInstance.dwg_read_data(data, Dwg_File_Type.DWG)
  onProgress(40)

  const db = libredwgInstance.convert(dwg)
  onProgress(60)

  // Extract INSERT entities grouped by layer
  const insertsByLayer = {}
  const allInserts = []

  for (const entity of (db.entities || [])) {
    if (entity.type !== 'INSERT') continue
    if (!entity.insertionPoint) continue

    const layer = entity.layer || '0'
    const insert = {
      x: entity.insertionPoint.x,
      y: entity.insertionPoint.y,
      layer,
      blockName: entity.name || 'Unknown',
    }

    if (!insertsByLayer[layer]) insertsByLayer[layer] = []
    insertsByLayer[layer].push(insert)
    allInserts.push(insert)
  }
  onProgress(80)

  // Build layer summary sorted by INSERT count (descending)
  const layers = Object.entries(insertsByLayer)
    .map(([name, inserts]) => ({ name, insertCount: inserts.length }))
    .sort((a, b) => b.insertCount - a.insertCount)

  // Calculate bounds from all INSERTs
  let bounds = null
  if (allInserts.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const ins of allInserts) {
      if (ins.x < minX) minX = ins.x
      if (ins.y < minY) minY = ins.y
      if (ins.x > maxX) maxX = ins.x
      if (ins.y > maxY) maxY = ins.y
    }
    bounds = { minX, minY, maxX, maxY }
  }

  // Free memory
  libredwgInstance.dwg_free(dwg)
  onProgress(100)

  return { layers, insertsByLayer, allInserts, bounds }
}

/**
 * Map DWG coordinate to drawing percentage position using two-point calibration.
 * Identical math to bimUtils.js:ifcToDrawingPercent
 */
export function dwgToDrawingPercent(dwgPoint, calibration) {
  const { point1_dwg_x, point1_dwg_y, point1_draw_x, point1_draw_y,
          point2_dwg_x, point2_dwg_y, point2_draw_x, point2_draw_y } = calibration

  const dwgDx = point2_dwg_x - point1_dwg_x
  const dwgDy = point2_dwg_y - point1_dwg_y
  const drawDx = point2_draw_x - point1_draw_x
  const drawDy = point2_draw_y - point1_draw_y

  if (Math.abs(dwgDx) < 0.001 && Math.abs(dwgDy) < 0.001) return null

  const scaleX = Math.abs(dwgDx) > 0.001 ? drawDx / dwgDx : 0
  const scaleY = Math.abs(dwgDy) > 0.001 ? drawDy / dwgDy : 0

  const useScaleX = Math.abs(dwgDx) > 0.001
  const useScaleY = Math.abs(dwgDy) > 0.001

  const x = useScaleX
    ? point1_draw_x + (dwgPoint.x - point1_dwg_x) * scaleX
    : point1_draw_x

  const y = useScaleY
    ? point1_draw_y + (dwgPoint.y - point1_dwg_y) * scaleY
    : point1_draw_y

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}
