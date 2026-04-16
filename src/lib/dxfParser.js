import DxfParser from 'dxf-parser'

// Unit conversion to metres
const UNIT_TO_METRES = {
  0: 0.001,   // unitless — assume mm for UK M&E
  1: 0.0254,  // inches
  2: 0.3048,  // feet
  3: 1609.34, // miles
  4: 0.001,   // millimetres (most common for UK M&E)
  5: 0.01,    // centimetres
  6: 1.0,     // metres
}

/**
 * Parse a DXF file and extract all data needed for the programme pipeline
 * @param {string} dxfText - Raw DXF file text content
 * @returns {{ layers, entities, units, scaleFactor, bounds }}
 */
export function parseDXF(dxfText) {
  const parser = new DxfParser()
  const dxf = parser.parseSync(dxfText)

  // Extract units from header
  const insUnits = dxf.header?.['$INSUNITS'] ?? 0
  const scaleFactor = UNIT_TO_METRES[insUnits] ?? 0.001 // default mm

  // Extract all layer names
  const layers = []
  if (dxf.tables?.layer?.layers) {
    for (const [name, layerData] of Object.entries(dxf.tables.layer.layers)) {
      layers.push({
        name,
        color: layerData.color ?? 7,
        visible: !layerData.frozen && !layerData.off,
      })
    }
  }

  // Extract all entities grouped by layer
  const entitiesByLayer = {}
  const allEntities = dxf.entities || []

  for (const entity of allEntities) {
    const layer = entity.layer || '0'
    if (!entitiesByLayer[layer]) entitiesByLayer[layer] = []
    entitiesByLayer[layer].push(entity)
  }

  // Calculate bounds for rendering
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const entity of allEntities) {
    updateBounds(bounds, entity)
  }

  return {
    layers,
    entitiesByLayer,
    allEntities,
    units: insUnits,
    unitsLabel: getUnitsLabel(insUnits),
    scaleFactor,
    bounds,
    header: dxf.header,
  }
}

/**
 * Calculate total length of all geometry on a given layer
 * @param {Array} entities - Entities on the layer
 * @param {number} scaleFactor - Conversion factor to metres
 * @returns {{ totalLengthMetres, entityCount, deduplicated }}
 */
export function calculateLayerLength(entities, scaleFactor) {
  let totalLength = 0
  let entityCount = 0
  const seenLines = new Set()

  for (const entity of entities) {
    const length = getEntityLength(entity)
    if (length <= 0) continue

    // Deduplication for LINEs — skip if same start/end within 1mm
    if (entity.type === 'LINE') {
      const key = lineKey(entity)
      if (seenLines.has(key)) continue
      seenLines.add(key)
    }

    totalLength += length
    entityCount++
  }

  const totalLengthMetres = Math.round(totalLength * scaleFactor * 100) / 100
  return { totalLengthMetres, entityCount, deduplicated: seenLines.size }
}

/**
 * Calculate the length of a single DXF entity
 */
function getEntityLength(entity) {
  switch (entity.type) {
    case 'LINE': {
      const { x: x1, y: y1 } = entity.vertices?.[0] || entity.start || {}
      const { x: x2, y: y2 } = entity.vertices?.[1] || entity.end || {}
      if (x1 == null || x2 == null) return 0
      return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = entity.vertices || []
      if (verts.length < 2) return 0
      let length = 0
      for (let i = 0; i < verts.length - 1; i++) {
        const v1 = verts[i]
        const v2 = verts[i + 1]
        const bulge = v1.bulge || 0
        if (Math.abs(bulge) < 1e-6) {
          length += Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2)
        } else {
          // Arc segment from bulge
          const chord = Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2)
          const angle = 4 * Math.atan(Math.abs(bulge))
          const sinHalf = Math.sin(angle / 2)
          if (Math.abs(sinHalf) > 1e-10) {
            const radius = chord / (2 * sinHalf)
            length += radius * angle
          }
        }
      }
      // Handle closed polyline
      if (entity.shape || entity.closed) {
        const v1 = verts[verts.length - 1]
        const v2 = verts[0]
        const bulge = v1.bulge || 0
        if (Math.abs(bulge) < 1e-6) {
          length += Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2)
        } else {
          const chord = Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2)
          const angle = 4 * Math.atan(Math.abs(bulge))
          const sinHalf = Math.sin(angle / 2)
          if (Math.abs(sinHalf) > 1e-10) {
            const radius = chord / (2 * sinHalf)
            length += radius * angle
          }
        }
      }
      return length
    }

    case 'ARC': {
      const radius = entity.radius || 0
      let startAngle = (entity.startAngle || 0) * Math.PI / 180
      let endAngle = (entity.endAngle || 360) * Math.PI / 180
      if (endAngle < startAngle) endAngle += 2 * Math.PI
      return radius * (endAngle - startAngle)
    }

    case 'CIRCLE': {
      return 2 * Math.PI * (entity.radius || 0)
    }

    case 'SPLINE': {
      // Approximate spline length from control/fit points
      const pts = entity.fitPoints || entity.controlPoints || []
      if (pts.length < 2) return 0
      let length = 0
      for (let i = 0; i < pts.length - 1; i++) {
        length += Math.sqrt((pts[i + 1].x - pts[i].x) ** 2 + (pts[i + 1].y - pts[i].y) ** 2)
      }
      return length
    }

    default:
      return 0
  }
}

/**
 * Generate a dedup key for a LINE entity (rounded to 1mm)
 */
function lineKey(entity) {
  const s = entity.vertices?.[0] || entity.start || {}
  const e = entity.vertices?.[1] || entity.end || {}
  const round = v => Math.round((v || 0) * 10) / 10
  const k1 = `${round(s.x)},${round(s.y)}-${round(e.x)},${round(e.y)}`
  const k2 = `${round(e.x)},${round(e.y)}-${round(s.x)},${round(s.y)}`
  return k1 < k2 ? k1 : k2 // canonical form
}

/**
 * Update bounding box from an entity
 */
function updateBounds(bounds, entity) {
  const points = getEntityPoints(entity)
  for (const p of points) {
    if (p.x < bounds.minX) bounds.minX = p.x
    if (p.y < bounds.minY) bounds.minY = p.y
    if (p.x > bounds.maxX) bounds.maxX = p.x
    if (p.y > bounds.maxY) bounds.maxY = p.y
  }
}

/**
 * Get all significant points from an entity (for bounds calculation)
 */
function getEntityPoints(entity) {
  switch (entity.type) {
    case 'LINE':
      return [...(entity.vertices || [entity.start, entity.end].filter(Boolean))]
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return entity.vertices || []
    case 'ARC':
    case 'CIRCLE':
      if (entity.center) {
        const r = entity.radius || 0
        return [
          { x: entity.center.x - r, y: entity.center.y - r },
          { x: entity.center.x + r, y: entity.center.y + r },
        ]
      }
      return []
    case 'INSERT':
      return entity.position ? [entity.position] : []
    case 'TEXT':
    case 'MTEXT':
      return entity.startPoint ? [entity.startPoint] : entity.position ? [entity.position] : []
    default:
      return entity.vertices || []
  }
}

function getUnitsLabel(units) {
  const labels = { 0: 'Unitless (assuming mm)', 1: 'Inches', 2: 'Feet', 3: 'Miles', 4: 'Millimetres', 5: 'Centimetres', 6: 'Metres' }
  return labels[units] || 'Unknown'
}

/**
 * Convert parsed DXF entities to SVG path data for rendering
 * @param {Array} entities - DXF entities to render
 * @param {object} bounds - Drawing bounds { minX, minY, maxX, maxY }
 * @param {object} options - { width, height, strokeWidth, color }
 * @returns {Array<{ path, color, layer }>} SVG path strings
 */
export function entitiesToSVGPaths(entities, bounds) {
  const paths = []

  for (const entity of entities) {
    const pathData = entityToSVGPath(entity, bounds)
    if (!pathData) continue
    paths.push({
      d: pathData,
      color: entityColor(entity),
      layer: entity.layer || '0',
      type: entity.type,
    })
  }

  return paths
}

function entityToSVGPath(entity) {
  switch (entity.type) {
    case 'LINE': {
      const s = entity.vertices?.[0] || entity.start
      const e = entity.vertices?.[1] || entity.end
      if (!s || !e) return null
      return `M ${s.x} ${-s.y} L ${e.x} ${-e.y}`
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = entity.vertices || []
      if (verts.length < 2) return null
      let d = `M ${verts[0].x} ${-verts[0].y}`
      for (let i = 1; i < verts.length; i++) {
        const prev = verts[i - 1]
        const curr = verts[i]
        const bulge = prev.bulge || 0
        if (Math.abs(bulge) > 1e-6) {
          // Arc segment
          const chord = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
          const angle = 4 * Math.atan(Math.abs(bulge))
          const sinHalf = Math.sin(angle / 2)
          if (Math.abs(sinHalf) > 1e-10) {
            const radius = chord / (2 * sinHalf)
            const largeArc = angle > Math.PI ? 1 : 0
            const sweep = bulge > 0 ? 0 : 1
            d += ` A ${radius} ${radius} 0 ${largeArc} ${sweep} ${curr.x} ${-curr.y}`
          } else {
            d += ` L ${curr.x} ${-curr.y}`
          }
        } else {
          d += ` L ${curr.x} ${-curr.y}`
        }
      }
      if (entity.shape || entity.closed) d += ' Z'
      return d
    }

    case 'ARC': {
      if (!entity.center) return null
      const cx = entity.center.x, cy = -entity.center.y
      const r = entity.radius || 0
      const sa = -(entity.startAngle || 0) * Math.PI / 180
      const ea = -(entity.endAngle || 360) * Math.PI / 180
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa)
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea)
      let angleDiff = ea - sa
      if (angleDiff > 0) angleDiff -= 2 * Math.PI
      const largeArc = Math.abs(angleDiff) > Math.PI ? 1 : 0
      return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
    }

    case 'CIRCLE': {
      if (!entity.center) return null
      const cx = entity.center.x, cy = -entity.center.y, r = entity.radius || 0
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`
    }

    default:
      return null
  }
}

// DXF ACI color index to hex (simplified — covers common colors)
const ACI_COLORS = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
  5: '#0000FF', 6: '#FF00FF', 7: '#FFFFFF', 8: '#808080',
  9: '#C0C0C0',
}

function entityColor(entity) {
  if (entity.color) return ACI_COLORS[entity.color] || '#AAAAAA'
  return '#AAAAAA' // default grey
}

/**
 * Calculate the real-world length of a markup polyline
 * @param {Array<{x, y}>} points - Points in DXF coordinate space
 * @param {number} scaleFactor - DXF units to metres conversion
 * @returns {number} Length in metres
 */
export function calculateMarkupLength(points, scaleFactor) {
  if (!points || points.length < 2) return 0
  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.sqrt(
      (points[i + 1].x - points[i].x) ** 2 +
      (points[i + 1].y - points[i].y) ** 2
    )
  }
  return Math.round(length * scaleFactor * 100) / 100
}
