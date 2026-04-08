import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import * as WebIfc from 'web-ifc'
import { supabase } from '../lib/supabase'
import { BIM_CATEGORIES } from '../lib/bimUtils'
import { getSession } from '../lib/storage'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { ifcToDrawingPercent } from '../lib/bimUtils'
import {
  ArrowLeft, Layers, Eye, EyeOff, Search, RotateCcw,
  X, AlertTriangle, MapPin, Camera, Zap, SplitSquareVertical,
  Scissors, Crosshair, PanelLeftClose, PanelLeft,
  ChevronDown, ChevronRight, BarChart3, Ruler, Flag
} from 'lucide-react'

/* ============================================================
   Constants
   ============================================================ */

const STATUS_COLORS = {
  not_verified: '#94A3B8',
  installed: '#22C55E',
  snagged: '#EF4444',
  commissioned: '#3B82F6',
}

const CATEGORY_MAP = {
  IFCELECTRICALELEMENT: 'electrical', IFCELECTRICDISTRIBUTIONBOARD: 'electrical', IFCELECTRICMOTOR: 'electrical',
  IFCSWITCHINGDEVICE: 'electrical', IFCOUTLET: 'electrical', IFCLIGHTFIXTURE: 'electrical', IFCJUNCTIONBOX: 'electrical',
  IFCCABLECARRIERSEGMENT: 'electrical', IFCCABLESEGMENT: 'electrical', IFCPROTECTIVEDEVICE: 'electrical',
  IFCDISTRIBUTIONBOARD: 'electrical', IFCLAMP: 'electrical',
  IFCAIRTERMINAL: 'mechanical', IFCAIRTERMINALBOX: 'mechanical', IFCBOILER: 'mechanical', IFCCHILLER: 'mechanical',
  IFCCOIL: 'mechanical', IFCDUCTFITTING: 'mechanical', IFCDUCTSEGMENT: 'mechanical', IFCFAN: 'mechanical',
  IFCFILTER: 'mechanical', IFCUNITARYEQUIPMENT: 'mechanical', IFCSPACEHEATERELEMENT: 'mechanical',
  IFCPIPEFITTING: 'plumbing', IFCPIPESEGMENT: 'plumbing', IFCPUMP: 'plumbing', IFCSANITARYTERMINAL: 'plumbing',
  IFCTANK: 'plumbing', IFCVALVE: 'plumbing', IFCWASTETERMINAL: 'plumbing',
  IFCFIREALARM: 'fire', IFCFIRESUPPRESSIONTERMINAL: 'fire', IFCALARM: 'fire', IFCDETECTOR: 'fire', IFCSENSOR: 'fire',
}

const SHELL_TYPES = [
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCROOF', 'IFCCOLUMN',
  'IFCBEAM', 'IFCSTAIR', 'IFCRAILING', 'IFCWINDOW', 'IFCDOOR',
  'IFCPLATE', 'IFCCURTAINWALL', 'IFCMEMBER', 'IFCFOOTING',
  'IFCSPACE', 'IFCCOVERING', 'IFCBUILDINGELEMENTPROXY',
  'IFCFURNISHINGELEMENT', 'IFCOPENINGELEMENT',
]

/* ============================================================
   Geometry merge utilities
   ============================================================ */

function mergeBufferGeometries(geometries) {
  let totalVerts = 0, totalIndices = 0
  for (const g of geometries) {
    const pos = g.getAttribute('position')
    const idx = g.getIndex()
    if (pos) totalVerts += pos.count
    if (idx) totalIndices += idx.count
  }
  if (totalVerts === 0) return null
  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const indices = new Uint32Array(totalIndices)
  let vOffset = 0, iOffset = 0
  for (const g of geometries) {
    const pos = g.getAttribute('position')
    const norm = g.getAttribute('normal')
    const idx = g.getIndex()
    if (!pos) continue
    positions.set(pos.array, vOffset * 3)
    if (norm) normals.set(norm.array, vOffset * 3)
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOffset + i] = idx.array[i] + vOffset
      iOffset += idx.count
    }
    vOffset += pos.count
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (totalIndices > 0) merged.setIndex(new THREE.BufferAttribute(indices, 1))
  return merged
}

function useMergedGeometries(meshes, categoryFilter, floorFilter, statusMap, hiddenIds, colorMode) {
  return useMemo(() => {
    const groups = {}
    const filtered = meshes.filter(m => {
      if (hiddenIds.has(m.expressId)) return false
      if (categoryFilter && m.category !== categoryFilter) return false
      if (floorFilter && m.floorName !== floorFilter) return false
      return true
    })
    for (const m of filtered) {
      const status = statusMap[m.expressId]
      let color
      if (colorMode === 'status') {
        color = STATUS_COLORS[status || 'not_verified']
      } else {
        color = status ? STATUS_COLORS[status] : BIM_CATEGORIES[m.category]?.color || '#A78BFA'
      }
      if (!groups[color]) groups[color] = []
      groups[color].push(m.geometry)
    }
    const merged = []
    for (const [color, geometries] of Object.entries(groups)) {
      if (geometries.length === 0) continue
      const mergedGeom = mergeBufferGeometries(geometries)
      if (mergedGeom) merged.push({ geometry: mergedGeom, color })
    }
    return merged
  }, [meshes, categoryFilter, floorFilter, statusMap, hiddenIds, colorMode])
}

/* ============================================================
   ClippingPlane — R3F component
   ============================================================ */

function ClippingPlane({ enabled, position, axis }) {
  const { gl } = useThree()

  useEffect(() => {
    if (enabled) {
      const plane = new THREE.Plane()
      if (axis === 'y') plane.set(new THREE.Vector3(0, -1, 0), position)
      else if (axis === 'x') plane.set(new THREE.Vector3(-1, 0, 0), position)
      else plane.set(new THREE.Vector3(0, 0, -1), position)
      gl.clippingPlanes = [plane]
    } else {
      gl.clippingPlanes = []
    }
    gl.localClippingEnabled = enabled
    return () => { gl.clippingPlanes = []; gl.localClippingEnabled = false }
  }, [enabled, position, axis, gl])

  return null
}

/* ============================================================
   IFCModel — merged-geometry renderer
   ============================================================ */

function IFCModel({ meshes, shellMeshes, shellVisible, shellOpacity, selectedId, onSelect,
  categoryFilter, floorFilter, statusMap, xrayMode, hiddenIds, colorMode }) {
  const groupRef = useRef()
  const mergedGroups = useMergedGeometries(meshes, categoryFilter, floorFilter, statusMap, hiddenIds, colorMode)

  const mergedShell = useMemo(() => {
    if (!shellMeshes.length) return null
    return mergeBufferGeometries(shellMeshes.map(m => m.geometry))
  }, [shellMeshes])

  const selectedMesh = selectedId && !hiddenIds.has(selectedId) ? meshes.find(m => m.expressId === selectedId) : null

  return (
    <group ref={groupRef}>
      {/* Shell */}
      {shellVisible && mergedShell && (
        <mesh geometry={mergedShell}>
          <meshStandardMaterial
            color={xrayMode ? 0x1E3A5F : 0xCCD5E0}
            transparent
            opacity={xrayMode ? 0.04 : shellOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
            wireframe={xrayMode}
          />
        </mesh>
      )}

      {/* MEP merged groups — keyed by xrayMode to force material rebuild */}
      {mergedGroups.map((g, i) => (
        <mesh key={`${i}-${xrayMode}`} geometry={g.geometry}>
          <meshStandardMaterial
            color={g.color}
            emissive={xrayMode ? g.color : '#000000'}
            emissiveIntensity={xrayMode ? 1.5 : 0}
            transparent={xrayMode}
            opacity={xrayMode ? 0.9 : 1}
            toneMapped={!xrayMode}
            roughness={xrayMode ? 0 : 0.4}
            metalness={xrayMode ? 0 : 0.1}
          />
        </mesh>
      ))}

      {/* Invisible pick meshes for raycasting */}
      {meshes.map((m, i) => {
        if (hiddenIds.has(m.expressId)) return null
        if (categoryFilter && m.category !== categoryFilter) return null
        if (floorFilter && m.floorName !== floorFilter) return null
        return (
          <mesh key={`pick-${i}`} geometry={m.geometry} visible={false}
            userData={{ isPick: true }}
            onClick={(e) => { e.stopPropagation(); onSelect(m.expressId) }} />
        )
      })}

      {/* Selected element highlight */}
      {selectedMesh && (
        <mesh geometry={selectedMesh.geometry}>
          <meshStandardMaterial
            color="white" emissive="white" emissiveIntensity={xrayMode ? 2 : 0.6}
            transparent opacity={0.9} toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

/* ============================================================
   CameraController — orbit + fly-to animation
   ============================================================ */

function CameraController({ resetTrigger, boundingBox, flyTarget, onFlyComplete }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef()
  const flyingRef = useRef(false)
  const flyStartRef = useRef(null)
  const flyFromRef = useRef(null)
  const flyToRef = useRef(null)
  const flyTargetPosRef = useRef(null)
  const flyTargetFromRef = useRef(null)

  useEffect(() => {
    if (!boundingBox || !controlsRef.current) return
    const center = new THREE.Vector3()
    boundingBox.getCenter(center)
    const size = new THREE.Vector3()
    boundingBox.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const dist = maxDim * 1.5
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.8, center.z + dist * 0.6)
    camera.lookAt(center)
    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }, [boundingBox, resetTrigger])

  useEffect(() => {
    if (!flyTarget || !controlsRef.current) return
    flyingRef.current = true
    flyStartRef.current = performance.now()
    flyFromRef.current = camera.position.clone()
    flyTargetFromRef.current = controlsRef.current.target.clone()

    const target = new THREE.Vector3(flyTarget.x || 0, flyTarget.y || 0, flyTarget.z || 0)
    const closeOffset = new THREE.Vector3(1.5, 1, 1.5)
    flyToRef.current = target.clone().add(closeOffset)
    flyTargetPosRef.current = target
  }, [flyTarget])

  useFrame(() => {
    if (!flyingRef.current || !flyStartRef.current || !controlsRef.current) return
    const elapsed = performance.now() - flyStartRef.current
    const duration = 1500
    const t = Math.min(elapsed / duration, 1)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    camera.position.lerpVectors(flyFromRef.current, flyToRef.current, ease)
    controlsRef.current.target.lerpVectors(flyTargetFromRef.current, flyTargetPosRef.current, ease)
    controlsRef.current.update()

    if (t >= 1) {
      flyingRef.current = false
      controlsRef.current.target.copy(flyTargetPosRef.current)
      controlsRef.current.update()
      onFlyComplete?.()
    }
  })

  return <OrbitControls ref={controlsRef} args={[camera, gl.domElement]} enableDamping dampingFactor={0.1} />
}

/* ============================================================
   ScreenshotCapture — CoreSite watermarked PNG
   ============================================================ */

function ScreenshotCapture({ trigger, onDone }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    if (!trigger) return
    gl.render(scene, camera)

    const src = gl.domElement
    const canvas = document.createElement('canvas')
    canvas.width = src.width
    canvas.height = src.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(src, 0, 0)

    // Watermark pill — top right
    const pad = 20
    const pillH = 32
    const text = 'CORESITE'
    ctx.font = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.letterSpacing = '2px'
    const textW = ctx.measureText(text).width + 8
    const dotR = 5
    const pillW = dotR * 2 + 10 + textW + 24
    const px = canvas.width - pillW - pad
    const py = pad

    ctx.fillStyle = 'rgba(13, 21, 38, 0.8)'
    ctx.beginPath()
    ctx.roundRect(px, py, pillW, pillH, 8)
    ctx.fill()

    const cx = px + 18
    const cy = py + pillH / 2
    ctx.strokeStyle = 'rgba(27, 111, 200, 0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#1B6FC8'
    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(27, 111, 200, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, cy - dotR - 3); ctx.lineTo(cx, cy - dotR + 1)
    ctx.moveTo(cx, cy + dotR - 1); ctx.lineTo(cx, cy + dotR + 3)
    ctx.moveTo(cx - dotR - 3, cy); ctx.lineTo(cx - dotR + 1, cy)
    ctx.moveTo(cx + dotR - 1, cy); ctx.lineTo(cx + dotR + 3, cy)
    ctx.stroke()

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 13px "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx + dotR + 12, cy + 1)

    const link = document.createElement('a')
    link.download = `CoreSite-BIM-${new Date().toISOString().slice(0, 10)}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    onDone()
  }, [trigger])

  return null
}

/* ============================================================
   PlanCapture — top-down orthographic 2D plan generation
   ============================================================ */

function PlanCapture({ trigger, boundingBox, onDone, onResult }) {
  const { gl, scene } = useThree()

  useEffect(() => {
    if (!trigger || !boundingBox) return

    const center = new THREE.Vector3()
    boundingBox.getCenter(center)
    const size = new THREE.Vector3()
    boundingBox.getSize(size)

    const aspect = size.x / size.y || 1
    const pad = 1.1
    const orthoW = size.x * pad / 2
    const orthoH = size.y * pad / 2
    const ortho = new THREE.OrthographicCamera(-orthoW, orthoW, orthoH, -orthoH, 0.1, size.z * 10)
    ortho.position.set(center.x, center.y + size.y * 5, center.z)
    ortho.up.set(0, 0, -1)
    ortho.lookAt(center.x, center.y, center.z)
    ortho.updateProjectionMatrix()

    const resW = 2400, resH = Math.round(2400 / aspect)
    const target = new THREE.WebGLRenderTarget(resW, resH, { format: THREE.RGBAFormat })
    gl.setRenderTarget(target)
    gl.render(scene, ortho)

    const pixels = new Uint8Array(resW * resH * 4)
    gl.readRenderTargetPixels(target, 0, 0, resW, resH, pixels)
    gl.setRenderTarget(null)

    const canvas = document.createElement('canvas')
    canvas.width = resW
    canvas.height = resH
    const ctx = canvas.getContext('2d')
    const imgData = ctx.createImageData(resW, resH)
    for (let y = 0; y < resH; y++) {
      for (let x = 0; x < resW; x++) {
        const srcIdx = ((resH - 1 - y) * resW + x) * 4
        const dstIdx = (y * resW + x) * 4
        imgData.data[dstIdx] = pixels[srcIdx]
        imgData.data[dstIdx + 1] = pixels[srcIdx + 1]
        imgData.data[dstIdx + 2] = pixels[srcIdx + 2]
        imgData.data[dstIdx + 3] = pixels[srcIdx + 3]
      }
    }
    ctx.putImageData(imgData, 0, 0)

    // Title block
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(resW - 360, resH - 70, 350, 60)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.strokeRect(resW - 360, resH - 70, 350, 60)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 16px Helvetica, Arial, sans-serif'
    ctx.fillText('PLAN VIEW — TOP DOWN', resW - 350, resH - 42)
    ctx.fillStyle = '#64748B'
    ctx.font = '12px Helvetica, Arial, sans-serif'
    ctx.fillText('Auto-generated from 3D BIM model', resW - 350, resH - 22)

    const ifcMinX = center.x - orthoW
    const ifcMaxX = center.x + orthoW
    const ifcMinZ = center.z - orthoH
    const ifcMaxZ = center.z + orthoH

    onResult({
      dataUrl: canvas.toDataURL('image/png'),
      calibration: {
        point1_ifc_x: ifcMinX, point1_ifc_y: ifcMinZ,
        point1_draw_x: 0, point1_draw_y: 100,
        point2_ifc_x: ifcMaxX, point2_ifc_y: ifcMaxZ,
        point2_draw_x: 100, point2_draw_y: 0,
      }
    })
    target.dispose()
    onDone()
  }, [trigger])

  return null
}

/* ============================================================
   Reusable UI: collapsible panel section
   ============================================================ */

function PanelSection({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
      >
        {Icon && <Icon size={12} className="shrink-0" />}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

/* ============================================================
   SnapIndicator — camera-distance-aware snap preview dot
   ============================================================ */

function SnapIndicator({ position }) {
  const ref = useRef()
  const { camera } = useThree()

  useFrame(() => {
    if (!ref.current) return
    const dist = camera.position.distanceTo(position)
    const scale = Math.max(0.01, dist * 0.012)
    ref.current.scale.setScalar(scale)
  })

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#F59E0B" transparent opacity={0.9} depthTest={false} />
    </mesh>
  )
}

/* ============================================================
   MeasurementLine — renders dashed line + distance label
   ============================================================ */

function MeasurementLine({ start, end }) {
  if (!start || !end) return null
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const distance = start.distanceTo(end)
  return (
    <>
      <Line
        points={[start, end]}
        color="#F59E0B"
        lineWidth={2}
        dashed
        dashScale={10}
        dashSize={0.3}
        gapSize={0.15}
      />
      <Html position={[mid.x, mid.y + 0.15, mid.z]} center>
        <div className="px-2 py-0.5 bg-amber-500 text-white text-[11px] font-bold rounded shadow-lg whitespace-nowrap pointer-events-none">
          {distance.toFixed(2)} m
        </div>
      </Html>
      <SnapIndicator position={start} />
      <SnapIndicator position={end} />
    </>
  )
}

/* ============================================================
   MeasureClickHandler — raycasts clicks to get 3D points
   ============================================================ */

function MeasureClickHandler({ active, onPoint, snap, onPreview }) {
  const { camera, scene, gl } = useThree()
  const raycasterRef = useRef(new THREE.Raycaster())

  // Get only visible, non-pick meshes
  const getVisibleMeshes = () => {
    const meshes = []
    scene.traverse(obj => {
      if (obj.isMesh && obj.visible && !obj.userData?.isPick) meshes.push(obj)
    })
    return meshes
  }

  const getSnappedPoint = (hit) => {
    let point = hit.point.clone()
    if (!snap || !hit.object?.geometry) return point

    const geo = hit.object.geometry
    const posAttr = geo.getAttribute('position')
    if (!posAttr) return point

    // Only snap to vertices near the hit point (within 0.5m radius)
    const SNAP_RADIUS = 0.5
    let closestDist = SNAP_RADIUS
    let closestVert = point.clone()
    const vertex = new THREE.Vector3()
    const worldMatrix = hit.object.matrixWorld

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i)
      vertex.applyMatrix4(worldMatrix)
      const dist = vertex.distanceTo(point)
      if (dist < closestDist) {
        closestDist = dist
        closestVert = vertex.clone()
      }
    }
    return closestVert
  }

  const castRay = (e) => {
    const rect = gl.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycasterRef.current.setFromCamera(mouse, camera)
    const hits = raycasterRef.current.intersectObjects(getVisibleMeshes(), false)
    return hits.length > 0 ? hits[0] : null
  }

  useEffect(() => {
    if (!active) {
      gl.domElement.style.cursor = ''
      onPreview?.(null)
      return
    }
    gl.domElement.style.cursor = 'crosshair'

    // Show snap preview on hover
    const handleMove = (e) => {
      const hit = castRay(e)
      if (hit) {
        const snapped = getSnappedPoint(hit)
        onPreview?.(snapped)
      } else {
        onPreview?.(null)
      }
    }

    const handleClick = (e) => {
      const hit = castRay(e)
      if (hit) {
        const point = getSnappedPoint(hit)
        onPoint(point)
      }
    }

    const canvas = gl.domElement
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousemove', handleMove)
    return () => {
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousemove', handleMove)
      canvas.style.cursor = ''
    }
  }, [active, camera, scene, onPoint, snap])

  return null
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function BIMViewer3D() {
  const { modelId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  // --- Data state ---
  const [model, setModel] = useState(null)
  const [allModels, setAllModels] = useState([])
  const [dbElements, setDbElements] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadLabel, setLoadLabel] = useState('Loading model...')
  const [error, setError] = useState(null)

  // --- Geometry state ---
  const [meshes, setMeshes] = useState([])
  const [shellMeshes, setShellMeshes] = useState([])
  const [boundingBox, setBoundingBox] = useState(null)
  const [floors, setFloors] = useState([])

  // --- View controls ---
  const [selectedId, setSelectedId] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [floorFilter, setFloorFilter] = useState('')
  const [shellVisible, setShellVisible] = useState(true)
  const [shellOpacity, setShellOpacity] = useState(0.15)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [snags, setSnags] = useState([])
  const [xrayMode, setXrayMode] = useState(false)
  const [hiddenIds, setHiddenIds] = useState(new Set())

  // --- Split view ---
  const [splitView, setSplitView] = useState(false)
  const [drawings, setDrawings] = useState([])
  const [selectedDrawing, setSelectedDrawing] = useState(null)
  const [calibrations, setCalibrations] = useState([])

  // --- Tools ---
  const [clipEnabled, setClipEnabled] = useState(false)
  const [clipPosition, setClipPosition] = useState(0)
  const [clipAxis, setClipAxis] = useState('y')
  const [flyTarget, setFlyTarget] = useState(null)
  const [screenshotTrigger, setScreenshotTrigger] = useState(0)
  const [planCaptureTrigger, setPlanCaptureTrigger] = useState(0)
  const [generatingPlan, setGeneratingPlan] = useState(false)

  // --- Color mode ---
  const [colorMode, setColorMode] = useState('category')

  // --- Commissioning workflow ---
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [statusJustUpdated, setStatusJustUpdated] = useState(null)

  // --- Progress dashboard ---
  const [showDashboard, setShowDashboard] = useState(false)
  const [dashboardCategoryOpen, setDashboardCategoryOpen] = useState(false)

  // --- Measurement tool ---
  const [measureMode, setMeasureMode] = useState(false)
  const [measureSnap, setMeasureSnap] = useState(true)
  const [measureStart, setMeasureStart] = useState(null)
  const [measureEnd, setMeasureEnd] = useState(null)
  const [measurePreview, setMeasurePreview] = useState(null)

  // --- Controls panel ---
  const [controlsOpen, setControlsOpen] = useState(true)

  // --- Quick search ---
  const [quickSearch, setQuickSearch] = useState('')
  const [quickSearchFocused, setQuickSearchFocused] = useState(false)

  // --- Properties panel ---
  const [propsExpanded, setPropsExpanded] = useState(false)

  // --- Derived ---

  const statusMap = useMemo(() => {
    const map = {}
    for (const el of dbElements) {
      if (el.ifc_id && el.status) map[el.ifc_id] = el.status
    }
    return map
  }, [dbElements])

  const selectedElement = useMemo(() => {
    if (!selectedId) return null
    const mesh = meshes.find(m => m.expressId === selectedId)
    const dbEl = dbElements.find(el => el.ifc_id === selectedId)
    if (!mesh && !dbEl) return null
    return { ...mesh, ...dbEl }
  }, [selectedId, meshes, dbElements])

  const clipRange = useMemo(() => {
    if (!boundingBox) return { min: -1000, max: 1000 }
    const min = clipAxis === 'x' ? boundingBox.min.x : clipAxis === 'y' ? boundingBox.min.y : boundingBox.min.z
    const max = clipAxis === 'x' ? boundingBox.max.x : clipAxis === 'y' ? boundingBox.max.y : boundingBox.max.z
    return { min, max }
  }, [boundingBox, clipAxis])

  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const m of meshes) counts[m.category] = (counts[m.category] || 0) + 1
    return counts
  }, [meshes])

  const drawingElements = useMemo(() => {
    if (!selectedDrawing || !calibrations.length || !dbElements.length) return []
    const cal = calibrations.find(c => c.drawing_id === selectedDrawing.id)
    if (!cal) return []
    return dbElements
      .filter(el => el.x != null && el.y != null)
      .map(el => {
        const pos = ifcToDrawingPercent({ x: Number(el.x), y: Number(el.y) }, cal)
        if (!pos || pos.x < -5 || pos.x > 105 || pos.y < -5 || pos.y > 105) return null
        return { ...el, drawX: pos.x, drawY: pos.y }
      })
      .filter(Boolean)
  }, [selectedDrawing, calibrations, dbElements])

  const panelElements = useMemo(() => {
    if (!searchTerm) return dbElements.slice(0, 200)
    const q = searchTerm.toLowerCase()
    return dbElements.filter(el =>
      el.name?.toLowerCase().includes(q) || el.ifc_type?.toLowerCase().includes(q) || el.floor_name?.toLowerCase().includes(q)
    ).slice(0, 200)
  }, [dbElements, searchTerm])

  const hasDrawings = drawings.length > 0

  // --- Progress stats ---
  const progressStats = useMemo(() => {
    const total = dbElements.length
    if (!total) return null
    const counts = { not_verified: 0, installed: 0, snagged: 0, commissioned: 0 }
    const catCounts = {}
    for (const el of dbElements) {
      const s = el.status || 'not_verified'
      counts[s] = (counts[s] || 0) + 1
      const cat = el.category || 'other'
      if (!catCounts[cat]) catCounts[cat] = { not_verified: 0, installed: 0, snagged: 0, commissioned: 0, total: 0 }
      catCounts[cat][s] = (catCounts[cat][s] || 0) + 1
      catCounts[cat].total++
    }
    return { total, counts, catCounts }
  }, [dbElements])

  // --- Quick search results ---
  const quickSearchResults = useMemo(() => {
    if (!quickSearch.trim()) return []
    const q = quickSearch.toLowerCase()
    return dbElements.filter(el =>
      el.name?.toLowerCase().includes(q) || el.ifc_type?.toLowerCase().includes(q) || el.floor_name?.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [dbElements, quickSearch])

  // --- Effects ---

  useEffect(() => {
    if (clipEnabled) setClipPosition(clipRange.max)
  }, [clipEnabled, clipAxis])

  // --- Handlers ---

  function handleFlyTo(el) {
    if (el.x == null) return
    const mesh = meshes.find(m => m.expressId === el.ifc_id)
    if (mesh?.geometry?.boundingBox) {
      const center = new THREE.Vector3()
      mesh.geometry.boundingBox.getCenter(center)
      setFlyTarget({ x: center.x, y: center.y, z: center.z })
    } else {
      setFlyTarget({ x: Number(el.x), y: Number(el.z) || 0, z: Number(el.y) })
    }
    setSelectedId(el.ifc_id)
  }

  async function handlePlanGenerated({ dataUrl, calibration }) {
    if (!model) return
    setGeneratingPlan(true)
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()

      const uuid = crypto.randomUUID()
      const path = `drawings/${model.project_id}/${uuid}.png`
      const { error: upErr } = await supabase.storage.from('drawings').upload(path, blob, { contentType: 'image/png' })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(path)

      const { data: drawing, error: drawErr } = await supabase.from('drawings').insert({
        project_id: model.project_id,
        company_id: managerData.company_id,
        name: `${model.name} — Plan View`,
        file_url: urlData.publicUrl,
        level_ref: 'Auto-generated',
        uploaded_by: managerData.name || 'System',
      }).select().single()
      if (drawErr) throw drawErr

      for (const mod of allModels) {
        await supabase.from('bim_drawing_calibration').upsert({
          drawing_id: drawing.id,
          model_id: mod.id,
          company_id: managerData.company_id,
          ...calibration,
          floor_name: 'All',
          created_by: managerData.name || 'System',
        }, { onConflict: 'drawing_id,model_id' })
      }

      setDrawings(prev => [...prev, drawing])
      setSelectedDrawing(drawing)
      setCalibrations(prev => [...prev, ...allModels.map(mod => ({ drawing_id: drawing.id, model_id: mod.id, ...calibration }))])
      setSplitView(true)
    } catch (err) {
      console.error('Plan generation failed:', err)
    }
    setGeneratingPlan(false)
  }

  // --- Commissioning status update ---
  async function handleStatusUpdate(elementId, newStatus) {
    setStatusUpdating(true)
    try {
      const { error: err } = await supabase.from('bim_elements').update({ status: newStatus }).eq('id', elementId)
      if (err) throw err
      setDbElements(prev => prev.map(el => el.id === elementId ? { ...el, status: newStatus } : el))
      setStatusJustUpdated(managerData.name || 'You')
      setTimeout(() => setStatusJustUpdated(null), 5000)
    } catch (err) {
      console.error('Status update failed:', err)
    }
    setStatusUpdating(false)
  }

  // --- Measurement point handler ---
  const handleMeasurePoint = useMemo(() => (point) => {
    if (!measureStart || measureEnd) {
      setMeasureStart(point)
      setMeasureEnd(null)
    } else {
      setMeasureEnd(point)
    }
  }, [measureStart, measureEnd])

  // --- Data loading ---

  useEffect(() => { loadAllModels() }, [modelId])

  async function loadAllModels() {
    try {
      setLoadLabel('Fetching model info...')
      const { data: m } = await supabase.from('bim_models').select('*').eq('id', modelId).single()
      if (!m) { setError('Model not found'); setLoading(false); return }
      setModel(m)

      const { data: projectModels } = await supabase.from('bim_models').select('*').eq('project_id', m.project_id).eq('status', 'ready')
      const models = projectModels || [m]
      setAllModels(models)

      const modelIds = models.map(mod => mod.id)
      const { data: els } = await supabase.from('bim_elements').select('*').in('model_id', modelIds)
      setDbElements(els || [])

      const elIds = (els || []).map(e => e.id).filter(Boolean)
      if (elIds.length) {
        const { data: s } = await supabase.from('snags').select('id, description, status, bim_element_id').in('bim_element_id', elIds.slice(0, 500))
        setSnags(s || [])
      }

      const { data: drws } = await supabase.from('drawings').select('*').eq('project_id', m.project_id).order('name')
      setDrawings(drws || [])
      if (drws?.length) setSelectedDrawing(drws[0])

      const { data: cals } = await supabase.from('bim_drawing_calibration').select('*').in('model_id', modelIds)
      setCalibrations(cals || [])

      const allMep = [], allShell = []
      const box = new THREE.Box3()
      const floorSet = new Set()

      for (let mi = 0; mi < models.length; mi++) {
        const mod = models[mi]
        const baseProgress = Math.floor((mi / models.length) * 80)
        const progressRange = Math.floor(80 / models.length)

        setLoadLabel(`Downloading ${mod.name}... (${mi + 1}/${models.length})`)
        setLoadProgress(baseProgress + 5)

        const response = await fetch(mod.file_url)
        if (!response.ok) continue
        const buffer = await response.arrayBuffer()

        setLoadLabel(`Parsing ${mod.name}... (${mi + 1}/${models.length})`)
        setLoadProgress(baseProgress + Math.floor(progressRange * 0.3))

        const result = await parseOneModel(buffer, (p) => {
          setLoadProgress(baseProgress + Math.floor(progressRange * (0.3 + p * 0.007)))
        })

        allMep.push(...result.mepMeshes)
        allShell.push(...result.structMeshes)
        if (result.meshBox) box.union(result.meshBox)
        for (const f of result.floors) floorSet.add(f)
      }

      setLoadLabel('Rendering...')
      setLoadProgress(90)
      setMeshes(allMep)
      setShellMeshes(allShell)
      setBoundingBox(box.isEmpty() ? null : box)
      setFloors([...floorSet].sort())
      setLoadProgress(100)
    } catch (err) {
      console.error('BIM 3D load error:', err)
      setError(err.message)
    }
    setLoading(false)
  }

  async function parseOneModel(buffer, onProgress) {
    const ifcApi = new WebIfc.IfcAPI()
    await ifcApi.Init((path) => `/${path}`)
    const modelID = ifcApi.OpenModel(new Uint8Array(buffer))
    const allTypes = ifcApi.GetAllTypesOfModel(modelID)

    const mepMeshes = [], structMeshes = []
    const box = new THREE.Box3()
    const floorSet = new Set()
    let processed = 0

    const storeyMap = {}
    try {
      const storeyTypeId = allTypes.find(t => t.typeName?.toUpperCase() === 'IFCBUILDINGSTOREY')?.typeID
      const storeyNames = []
      if (storeyTypeId) {
        const sIds = ifcApi.GetLineIDsWithType(modelID, storeyTypeId)
        for (let i = 0; i < sIds.size(); i++) {
          const s = ifcApi.GetLine(modelID, sIds.get(i), false)
          if (s?.Name?.value) storeyNames.push({ id: sIds.get(i), name: s.Name.value })
        }
      }
      const relType = allTypes.find(t => t.typeName?.toUpperCase() === 'IFCRELCONTAINEDINSPATIALSTRUCTURE')?.typeID
      if (relType) {
        const relIds = ifcApi.GetLineIDsWithType(modelID, relType)
        for (let i = 0; i < relIds.size(); i++) {
          try {
            const rel = ifcApi.GetLine(modelID, relIds.get(i), false)
            if (!rel) continue
            const structId = rel.RelatingStructure?.value ?? rel.RelatingStructure?.expressID
            const storey = storeyNames.find(s => s.id === structId)
            const related = rel.RelatedElements
            if (Array.isArray(related)) {
              for (const ref of related) {
                const elId = ref?.value ?? ref?.expressID ?? ref
                if (typeof elId === 'number') storeyMap[elId] = storey?.name || null
              }
            }
          } catch {}
        }
      }
    } catch {}

    for (const { typeID, typeName } of allTypes) {
      processed++
      if (processed % 20 === 0) onProgress?.(processed / allTypes.length)

      const upperName = typeName?.toUpperCase()
      const isMEP = !!CATEGORY_MAP[upperName] || upperName?.includes('DISTRIBUTION') || upperName?.includes('FLOW')
      const isShell = SHELL_TYPES.some(t => upperName?.includes(t))
      if (!isMEP && !isShell) continue

      const ids = ifcApi.GetLineIDsWithType(modelID, typeID)
      for (let i = 0; i < ids.size(); i++) {
        const expressId = ids.get(i)
        try {
          const flatMesh = ifcApi.GetFlatMesh(modelID, expressId)
          if (!flatMesh || flatMesh.geometries.size() === 0) continue
          for (let g = 0; g < flatMesh.geometries.size(); g++) {
            const geomData = flatMesh.geometries.get(g)
            const placedGeom = ifcApi.GetGeometry(modelID, geomData.geometryExpressID)
            const verts = ifcApi.GetVertexArray(placedGeom.GetVertexData(), placedGeom.GetVertexDataSize())
            const idxArr = ifcApi.GetIndexArray(placedGeom.GetIndexData(), placedGeom.GetIndexDataSize())
            if (!verts || verts.length === 0) continue

            const geometry = new THREE.BufferGeometry()
            const positions = new Float32Array(verts.length / 2)
            const normals = new Float32Array(verts.length / 2)
            for (let v = 0; v < verts.length; v += 6) {
              const vi = v / 2
              positions[vi] = verts[v]; positions[vi+1] = verts[v+1]; positions[vi+2] = verts[v+2]
              normals[vi] = verts[v+3]; normals[vi+1] = verts[v+4]; normals[vi+2] = verts[v+5]
            }
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
            geometry.setIndex(new THREE.BufferAttribute(idxArr, 1))
            geometry.applyMatrix4(new THREE.Matrix4().fromArray(geomData.flatTransformation))
            geometry.computeBoundingBox()
            if (geometry.boundingBox) box.union(geometry.boundingBox)

            const floorName = storeyMap[expressId] || null
            if (floorName) floorSet.add(floorName)

            const meshData = { geometry, position: [0,0,0], rotation: [0,0,0], expressId, typeName, category: CATEGORY_MAP[upperName] || 'other', floorName }
            if (isMEP) mepMeshes.push(meshData)
            else structMeshes.push(meshData)
          }
        } catch {}
      }
    }
    ifcApi.CloseModel(modelID)
    return { mepMeshes, structMeshes, meshBox: box.isEmpty() ? null : box, floors: [...floorSet] }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" />
          <p className="font-bold text-lg">Failed to load 3D model</p>
          <p className="text-sm text-slate-400 mt-2">{error}</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh bg-slate-900 flex flex-col overflow-hidden">

      {/* ==================== HEADER ==================== */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2.5 flex items-center gap-3 shrink-0 z-20">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-white transition-colors" title="Go back">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[13px] font-bold text-white truncate">
            {allModels.length > 1 ? `${allModels.length} Models` : model?.name || 'Loading...'}
          </h1>
          <p className="text-[11px] text-slate-400 truncate">
            {allModels.map(m => m.name).join(' + ')} — {meshes.length} MEP{shellMeshes.length > 0 ? ` · ${shellMeshes.length} structural` : ''}
          </p>
        </div>

        {/* Contextual header actions */}
        <div className="flex items-center gap-1.5">
          {/* Generate 2D Plan — only if no drawings exist yet */}
          {!hasDrawings && (
            <button
              onClick={() => setPlanCaptureTrigger(t => t + 1)}
              disabled={generatingPlan}
              title="Generate 2D plan view from the 3D model"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                generatingPlan ? 'bg-purple-400 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
              }`}
            >
              {generatingPlan ? 'Generating...' : 'Generate 2D Plan'}
            </button>
          )}

          {/* Split toggle — only if drawings exist */}
          {hasDrawings && (
            <button
              onClick={() => setSplitView(!splitView)}
              title="Toggle split view with 2D drawing"
              className={`p-2 rounded-lg transition-colors ${
                splitView ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {splitView ? <PanelLeftClose size={16} /> : <SplitSquareVertical size={16} />}
            </button>
          )}

          {/* Screenshot — icon only */}
          <button
            onClick={() => setScreenshotTrigger(t => t + 1)}
            title="Capture screenshot with CoreSite watermark"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <Camera size={16} />
          </button>

          {/* Elements panel — icon only */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            title="Element search panel"
            className={`p-2 rounded-lg transition-colors ${
              showPanel ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Layers size={16} />
          </button>
        </div>
      </header>

      {/* ==================== LOADING ==================== */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium text-sm">{loadLabel}</p>
            <div className="w-48 bg-slate-700 rounded-full h-1.5 mt-3 mx-auto overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${loadProgress}%` }} />
            </div>
            <p className="text-slate-500 text-xs mt-2">{loadProgress}%</p>
          </div>
        </div>
      )}

      {/* ==================== MAIN CONTENT ==================== */}
      {!loading && (
        <div className="flex-1 flex min-h-0">

          {/* ---------- 2D Drawing pane (split view) ---------- */}
          {splitView && selectedDrawing && (
            <div className="w-1/2 border-r border-slate-700 bg-slate-950 relative flex flex-col min-h-0">
              {/* Drawing selector */}
              {drawings.length > 1 && (
                <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
                  <select
                    value={selectedDrawing?.id || ''}
                    onChange={e => setSelectedDrawing(drawings.find(d => d.id === e.target.value))}
                    className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-white focus:outline-none"
                  >
                    {drawings.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {/* Drawing image — responsive with zoom/pan */}
              <div className="flex-1 min-h-0">
                <TransformWrapper initialScale={0.5} minScale={0.1} maxScale={8} centerOnInit
                  wheel={{ step: 0.08 }} doubleClick={{ disabled: true }}>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%' }}
                    contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div className="relative inline-block">
                      <img
                        src={selectedDrawing.file_url}
                        alt={selectedDrawing.name}
                        className="select-none max-w-[90vw]"
                        draggable={false}
                        style={{ width: '100%', maxWidth: '2000px', height: 'auto' }}
                      />

                      {/* BIM element dots on drawing */}
                      {drawingElements.map(el => {
                        const cat = BIM_CATEGORIES[el.category]
                        const isActive = el.ifc_id === selectedId
                        return (
                          <button key={el.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedId(el.ifc_id) }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all"
                            style={{ left: `${el.drawX}%`, top: `${el.drawY}%` }}>
                            <div
                              className={`rounded-full border ${isActive ? 'w-4 h-4 border-white shadow-lg shadow-white/30' : 'w-2.5 h-2.5 border-white/40'}`}
                              style={{ backgroundColor: cat?.color || '#A78BFA' }}
                            />
                            {isActive && (
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-white rounded text-[9px] font-bold text-slate-900 whitespace-nowrap shadow-lg">
                                {el.name}
                              </div>
                            )}
                          </button>
                        )
                      })}

                      {/* Snag pins */}
                      {snags.filter(s => s.drawing_id === selectedDrawing.id).map(snag => (
                        <div key={snag.id}
                          className="absolute -translate-x-1/2 -translate-y-full"
                          style={{ left: `${snag.pin_x}%`, top: `${snag.pin_y}%` }}>
                          <svg width="16" height="20" viewBox="0 0 28 36">
                            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                              fill={snag.status === 'open' ? '#EF4444' : snag.status === 'completed' ? '#22C55E' : '#94A3B8'} />
                          </svg>
                        </div>
                      ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              </div>

              {/* Drawing info label */}
              <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-slate-800/90 backdrop-blur rounded text-[10px] text-slate-400 border border-slate-700">
                {selectedDrawing.name} · {drawingElements.length} elements mapped
              </div>
            </div>
          )}

          {/* ---------- 3D Canvas ---------- */}
          <div className={`${splitView ? 'w-1/2' : 'w-full'} relative min-h-0`}>
            <Canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
              camera={{ fov: 50, near: 0.1, far: 100000 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}>
              <color attach="background" args={[xrayMode ? '#050A15' : '#0F172A']} />
              <ambientLight intensity={xrayMode ? 0.15 : 0.6} />
              <directionalLight position={[50, 100, 50]} intensity={xrayMode ? 0.3 : 1.2} />
              <directionalLight position={[-50, 80, -50]} intensity={xrayMode ? 0.1 : 0.4} />

              <ClippingPlane enabled={clipEnabled} position={clipPosition} axis={clipAxis} />

              <IFCModel
                meshes={meshes} shellMeshes={shellMeshes} shellVisible={shellVisible} shellOpacity={shellOpacity}
                selectedId={selectedId} onSelect={setSelectedId} categoryFilter={categoryFilter}
                floorFilter={floorFilter} statusMap={statusMap} xrayMode={xrayMode} hiddenIds={hiddenIds}
                colorMode={colorMode}
              />

              <CameraController resetTrigger={resetTrigger} boundingBox={boundingBox}
                flyTarget={flyTarget} onFlyComplete={() => setFlyTarget(null)} />

              <ScreenshotCapture trigger={screenshotTrigger} onDone={() => setScreenshotTrigger(0)} />
              <PlanCapture trigger={planCaptureTrigger} boundingBox={boundingBox}
                onDone={() => setPlanCaptureTrigger(0)} onResult={handlePlanGenerated} />

              <MeasurementLine start={measureStart} end={measureEnd} />
              <MeasureClickHandler active={measureMode} onPoint={handleMeasurePoint} snap={measureSnap} onPreview={setMeasurePreview} />
              {/* Snap preview indicator — scales with camera distance */}
              {measureMode && measurePreview && (
                <SnapIndicator position={measurePreview} />
              )}

              {!xrayMode && <gridHelper args={[1000, 100, '#1E293B', '#1E293B']} position={[0, -0.1, 0]} />}
            </Canvas>

            {/* ========== PROGRESS DASHBOARD ========== */}
            {progressStats && (
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => setShowDashboard(!showDashboard)}
                  title="Toggle progress dashboard"
                  className={`p-2 rounded-lg transition-colors ${
                    showDashboard ? 'bg-blue-500 text-white' : 'bg-slate-800/90 backdrop-blur border border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <BarChart3 size={16} />
                </button>
                {showDashboard && (
                  <div className="mt-2 w-64 bg-slate-800/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-white/[0.06]">
                      <p className="text-[11px] font-semibold text-white uppercase tracking-wider">Progress</p>
                      <p className="text-[10px] text-slate-500">{progressStats.total} total elements</p>
                    </div>
                    <div className="px-3 py-2.5 space-y-2">
                      {/* Stacked bar */}
                      <div className="flex h-3 rounded-full overflow-hidden bg-slate-700">
                        {[
                          { key: 'commissioned', color: '#3B82F6' },
                          { key: 'installed', color: '#22C55E' },
                          { key: 'snagged', color: '#EF4444' },
                          { key: 'not_verified', color: '#94A3B8' },
                        ].map(({ key, color }) => {
                          const pct = progressStats.total > 0 ? (progressStats.counts[key] / progressStats.total) * 100 : 0
                          if (pct === 0) return null
                          return (
                            <div
                              key={key}
                              style={{ width: `${pct}%`, backgroundColor: color }}
                              title={`${key.replace(/_/g, ' ')}: ${progressStats.counts[key]} (${pct.toFixed(1)}%)`}
                            />
                          )
                        })}
                      </div>

                      {/* Status rows */}
                      {[
                        { key: 'installed', label: 'Installed', color: '#22C55E' },
                        { key: 'commissioned', label: 'Commissioned', color: '#3B82F6' },
                        { key: 'snagged', label: 'Snagged', color: '#EF4444' },
                        { key: 'not_verified', label: 'Not Verified', color: '#94A3B8' },
                      ].map(({ key, label, color }) => {
                        const count = progressStats.counts[key] || 0
                        const pct = progressStats.total > 0 ? ((count / progressStats.total) * 100).toFixed(1) : '0.0'
                        return (
                          <div key={key} className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="flex-1 text-slate-300">{label}</span>
                            <span className="text-slate-500 font-mono">{count}</span>
                            <span className="text-slate-600 font-mono text-[10px] w-12 text-right">{pct}%</span>
                          </div>
                        )
                      })}

                      {/* Per-category breakdown */}
                      <button
                        onClick={() => setDashboardCategoryOpen(!dashboardCategoryOpen)}
                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-1"
                      >
                        {dashboardCategoryOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        By Category
                      </button>
                      {dashboardCategoryOpen && (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {Object.entries(progressStats.catCounts).map(([cat, counts]) => {
                            const catInfo = BIM_CATEGORIES[cat]
                            return (
                              <div key={cat} className="text-[10px]">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catInfo?.color || '#A78BFA' }} />
                                  <span className="text-slate-400 font-medium">{catInfo?.label || cat}</span>
                                  <span className="text-slate-600 ml-auto">{counts.total}</span>
                                </div>
                                <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-700 ml-3">
                                  {counts.commissioned > 0 && <div style={{ width: `${(counts.commissioned / counts.total) * 100}%`, backgroundColor: '#3B82F6' }} />}
                                  {counts.installed > 0 && <div style={{ width: `${(counts.installed / counts.total) * 100}%`, backgroundColor: '#22C55E' }} />}
                                  {counts.snagged > 0 && <div style={{ width: `${(counts.snagged / counts.total) * 100}%`, backgroundColor: '#EF4444' }} />}
                                  {counts.not_verified > 0 && <div style={{ width: `${(counts.not_verified / counts.total) * 100}%`, backgroundColor: '#94A3B8' }} />}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========== LEFT FLOATING CONTROL PANEL ========== */}
            <div className="absolute top-4 left-4 z-10">
              {/* Collapse/expand toggle */}
              <button
                onClick={() => setControlsOpen(!controlsOpen)}
                title={controlsOpen ? 'Hide controls' : 'Show controls'}
                className="mb-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/90 backdrop-blur-xl border border-white/[0.08] rounded-lg text-[11px] font-medium text-slate-400 hover:text-white transition-colors shadow-lg"
              >
                <ChevronRight size={12} className={`transition-transform ${controlsOpen ? 'rotate-180' : ''}`} />
                {controlsOpen ? 'Hide' : 'Controls'}
              </button>

              {controlsOpen && (
              <div className="w-56 bg-slate-800/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">

                {/* --- Quick Search --- */}
                <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={quickSearch}
                      onChange={e => setQuickSearch(e.target.value)}
                      onFocus={() => setQuickSearchFocused(true)}
                      onBlur={() => setTimeout(() => setQuickSearchFocused(false), 200)}
                      placeholder="Find element..."
                      className="w-full pl-7 pr-3 py-1.5 bg-slate-700/60 border border-transparent rounded-lg text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                    {quickSearchFocused && quickSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                        {quickSearchResults.map(el => (
                          <button
                            key={el.id}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleFlyTo(el)
                              setQuickSearch('')
                              setQuickSearchFocused(false)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700/60 transition-colors border-b border-white/[0.04] last:border-b-0"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BIM_CATEGORIES[el.category]?.color || '#A78BFA' }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-white truncate">{el.name}</p>
                              <p className="text-[9px] text-slate-500">{el.ifc_type} · {el.floor_name || '—'}</p>
                            </div>
                            <Crosshair size={10} className="text-slate-500 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* --- View Modes --- */}
                <PanelSection title="View" icon={Eye}>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setXrayMode(!xrayMode)}
                      title="X-Ray mode — see MEP systems glowing through transparent structure"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                        xrayMode
                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                          : 'bg-slate-700/60 border-transparent text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <Zap size={12} /> X-Ray
                    </button>
                    <button
                      onClick={() => setShellVisible(!shellVisible)}
                      title="Toggle building shell (walls, slabs, columns)"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                        shellVisible
                          ? 'bg-slate-700/60 border-transparent text-slate-300 hover:text-white'
                          : 'bg-slate-700/60 border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {shellVisible ? <Eye size={12} /> : <EyeOff size={12} />} Shell
                    </button>
                  </div>

                  {/* Shell opacity — only when shell visible and not x-ray */}
                  {shellVisible && !xrayMode && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-500">Opacity</span>
                        <span className="text-[10px] text-slate-500 font-mono">{Math.round(shellOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min="0.02" max="0.5" step="0.02" value={shellOpacity}
                        onChange={e => setShellOpacity(Number(e.target.value))}
                        className="w-full h-1 accent-blue-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Colour mode toggle */}
                  <button
                    onClick={() => setColorMode(prev => prev === 'category' ? 'status' : 'category')}
                    title="Toggle colour mode between category and status"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border bg-slate-700/60 border-transparent text-slate-400 hover:text-white hover:bg-slate-700"
                  >
                    <span className="flex gap-0.5">
                      {colorMode === 'status' ? (
                        Object.values(STATUS_COLORS).map((c, i) => (
                          <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                        ))
                      ) : (
                        Object.values(BIM_CATEGORIES).slice(0, 4).map((c, i) => (
                          <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        ))
                      )}
                    </span>
                    Colour: {colorMode === 'category' ? 'Category' : 'Status'}
                  </button>
                </PanelSection>

                {/* --- Tools --- */}
                <PanelSection title="Tools" icon={Scissors}>
                  {/* Clip toggle */}
                  <button
                    onClick={() => setClipEnabled(!clipEnabled)}
                    title="Clipping plane — slice through the building"
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                      clipEnabled
                        ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                        : 'bg-slate-700/60 border-transparent text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <Scissors size={12} /> Clip
                  </button>

                  {/* Clip controls */}
                  {clipEnabled && (
                    <div className="space-y-2 pl-1">
                      <div className="flex gap-1">
                        {['x', 'y', 'z'].map(a => (
                          <button key={a} onClick={() => setClipAxis(a)}
                            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                              clipAxis === a ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                            }`}>
                            {a.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min={clipRange.min} max={clipRange.max} step={(clipRange.max - clipRange.min) / 100}
                        value={clipPosition} onChange={e => setClipPosition(Number(e.target.value))}
                        className="w-full h-1 accent-orange-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Measure toggle */}
                  <button
                    onClick={() => {
                      setMeasureMode(!measureMode)
                      if (measureMode) { setMeasureStart(null); setMeasureEnd(null) }
                    }}
                    title="Measure distance between two points on surfaces"
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                      measureMode
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : 'bg-slate-700/60 border-transparent text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <Ruler size={12} /> Measure
                  </button>

                  {measureMode && (
                    <div className="space-y-1.5 pl-1">
                      <p className="text-[10px] text-slate-500">
                        {!measureStart ? 'Click first point' : !measureEnd ? 'Click second point' : 'Click to start new'}
                      </p>
                      <button
                        onClick={() => setMeasureSnap(!measureSnap)}
                        title="Snap to nearest vertex for precise measurements"
                        className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
                          measureSnap ? 'text-amber-300' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded border flex items-center justify-center ${
                          measureSnap ? 'bg-amber-500 border-amber-500' : 'border-slate-500'
                        }`}>
                          {measureSnap && <span className="text-[7px] text-white font-bold">&#10003;</span>}
                        </div>
                        Snap to vertex
                      </button>
                    </div>
                  )}

                  {/* Show all hidden */}
                  {hiddenIds.size > 0 && (
                    <button
                      onClick={() => setHiddenIds(new Set())}
                      title="Show all hidden elements"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
                    >
                      <Eye size={12} /> Show All ({hiddenIds.size} hidden)
                    </button>
                  )}
                </PanelSection>

                {/* --- Filters --- */}
                <PanelSection title="Filters" icon={Layers}>
                  {/* Category filters */}
                  <div className="space-y-1">
                    {Object.entries(BIM_CATEGORIES).map(([key, cat]) => {
                      if (!categoryCounts[key]) return null
                      const isActive = categoryFilter === key
                      const isVisible = !categoryFilter || categoryFilter === key
                      return (
                        <button key={key}
                          onClick={() => setCategoryFilter(isActive ? '' : key)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                            isActive
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                          }`}
                          style={isActive ? { boxShadow: `inset 2px 0 0 ${cat.color}` } : {}}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0 transition-opacity"
                            style={{ backgroundColor: cat.color, opacity: isVisible ? 1 : 0.3 }}
                          />
                          <span className="flex-1 text-left">{cat.label}</span>
                          <span className="text-[10px] text-slate-500">{categoryCounts[key]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Floor dropdown */}
                  {floors.length > 1 && (
                    <select
                      value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-700/60 rounded-lg text-[11px] text-slate-300 border border-transparent focus:outline-none focus:border-blue-500/50 cursor-pointer"
                    >
                      <option value="">All Floors</option>
                      {floors.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  )}
                </PanelSection>

                {/* --- Reset View --- */}
                <div className="px-3 py-2.5">
                  <button
                    onClick={() => setResetTrigger(t => t + 1)}
                    title="Reset camera to default position"
                    className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-white bg-slate-700/40 hover:bg-slate-700 transition-colors"
                  >
                    <RotateCcw size={12} /> Reset View
                  </button>
                </div>
              </div>
              )}
            </div>

            {/* ========== SELECTED ELEMENT POPUP ========== */}
            {/* Positioned bottom-left when panel is open, bottom-right otherwise */}
            {selectedElement && (
              <div className={`absolute bottom-4 ${showPanel ? 'left-4' : 'right-4'} w-80 bg-slate-800/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 z-10 overflow-hidden`}>
                <div className="flex items-start gap-3 p-4 border-b border-white/[0.06]">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: (BIM_CATEGORIES[selectedElement.category]?.color || '#A78BFA') + '20' }}>
                    {BIM_CATEGORIES[selectedElement.category]?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white truncate">{selectedElement.name || selectedElement.typeName}</p>
                    <p className="text-[11px] text-slate-400">{selectedElement.ifc_type} · {selectedElement.floor_name || 'Unknown floor'}</p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="p-1 text-slate-500 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider w-16">Status</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        backgroundColor: (STATUS_COLORS[selectedElement.status] || '#94A3B8') + '20',
                        color: STATUS_COLORS[selectedElement.status] || '#94A3B8'
                      }}>
                      {(selectedElement.status || 'not_verified').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider w-16">Category</span>
                    <span className="text-xs text-slate-300">{BIM_CATEGORIES[selectedElement.category]?.label || 'Other'}</span>
                  </div>
                  {selectedElement.x != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider w-16">Position</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {Number(selectedElement.x).toFixed(0)}, {Number(selectedElement.y).toFixed(0)}, {Number(selectedElement.z).toFixed(0)} mm
                      </span>
                    </div>
                  )}
                  {/* Linked snags */}
                  {selectedElement.id && (() => {
                    const linked = snags.filter(s => s.bim_element_id === selectedElement.id)
                    if (!linked.length) return null
                    return (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <MapPin size={10} /> {linked.length} Linked Snag{linked.length > 1 ? 's' : ''}
                        </p>
                        {linked.slice(0, 3).map(s => (
                          <div key={s.id} className="flex items-center gap-2 py-1">
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: s.status === 'open' ? '#EF4444' : s.status === 'completed' ? '#22C55E' : '#94A3B8' }} />
                            <span className="text-xs text-slate-300 truncate">{s.description}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  {/* Commissioning status buttons */}
                  {selectedElement.id && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Update Status</p>
                      <div className="flex gap-1">
                        {[
                          { key: 'not_verified', label: 'Not Verified' },
                          { key: 'installed', label: 'Installed' },
                          { key: 'snagged', label: 'Snagged' },
                          { key: 'commissioned', label: 'Commissioned' },
                        ].map(({ key, label }) => {
                          const isCurrent = (selectedElement.status || 'not_verified') === key
                          return (
                            <button
                              key={key}
                              onClick={() => !isCurrent && handleStatusUpdate(selectedElement.id, key)}
                              disabled={statusUpdating || isCurrent}
                              title={`Set status to ${label}`}
                              className={`flex-1 px-1 py-1.5 rounded text-[9px] font-semibold transition-all border ${
                                isCurrent
                                  ? 'border-white/20 text-white'
                                  : 'border-transparent text-slate-500 hover:text-white hover:bg-slate-700/60'
                              }`}
                              style={isCurrent ? { backgroundColor: STATUS_COLORS[key] + '30', color: STATUS_COLORS[key] } : {}}
                            >
                              {label.split(' ')[0]}
                            </button>
                          )
                        })}
                      </div>
                      {statusJustUpdated && (
                        <p className="text-[10px] text-green-400 mt-1">Updated by {statusJustUpdated} just now</p>
                      )}
                    </div>
                  )}

                  {/* Properties (JSONB) expandable */}
                  {selectedElement.properties && typeof selectedElement.properties === 'object' && Object.keys(selectedElement.properties).length > 0 && (
                    <div>
                      <button
                        onClick={() => setPropsExpanded(!propsExpanded)}
                        className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
                      >
                        {propsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        Properties ({Object.keys(selectedElement.properties).length})
                      </button>
                      {propsExpanded && (
                        <div className="mt-1.5 max-h-32 overflow-y-auto">
                          <table className="w-full text-[10px]">
                            <tbody>
                              {Object.entries(selectedElement.properties).map(([k, v]) => (
                                <tr key={k} className="border-b border-white/[0.04]">
                                  <td className="py-0.5 pr-2 text-slate-500 font-medium whitespace-nowrap">{k}</td>
                                  <td className="py-0.5 text-slate-300 truncate max-w-[140px]">{String(v)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raise Snag button */}
                  {hasDrawings && selectedElement.id && (
                    <button
                      onClick={() => navigate('/snags/' + drawings[0].id + '?bim_element=' + selectedElement.id)}
                      title="Raise a snag for this element"
                      className="w-full py-2 bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[11px] font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-red-500/30"
                    >
                      <Flag size={12} /> Raise Snag
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setHiddenIds(prev => { const next = new Set(prev); next.add(selectedId); return next })
                      setSelectedId(null)
                    }}
                    title="Hide this element from the 3D view"
                    className="w-full py-2 mt-1 bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <EyeOff size={12} /> Hide Element
                  </button>
                </div>
              </div>
            )}

            {/* ========== ELEMENT SEARCH PANEL ========== */}
            {showPanel && (
              <div className="absolute top-0 right-0 w-80 h-full bg-slate-800/95 backdrop-blur-xl border-l border-white/[0.08] z-10 flex flex-col">
                <div className="p-3 border-b border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[13px] font-semibold text-white">Elements</h2>
                    <button onClick={() => setShowPanel(false)} className="p-1 text-slate-500 hover:text-white transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search elements..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-700/60 border border-transparent rounded-lg text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {panelElements.map(el => {
                    const cat = BIM_CATEGORIES[el.category] || BIM_CATEGORIES.other
                    const isActive = el.ifc_id === selectedId
                    return (
                      <div key={el.id}
                        className={`flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.04] transition-colors ${
                          isActive ? 'bg-blue-500/15' : 'hover:bg-slate-700/40'
                        }`}>
                        <button onClick={() => setSelectedId(el.ifc_id)} className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-[11px] text-white font-medium truncate">{el.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 ml-4">{el.ifc_type} · {el.floor_name || '—'}</p>
                        </button>
                        {el.x != null && (
                          <button onClick={() => handleFlyTo(el)} title="Fly to element"
                            className="p-1.5 rounded text-slate-500 hover:text-cyan-400 hover:bg-slate-700/60 transition-colors shrink-0">
                            <Crosshair size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="p-2 border-t border-white/[0.06] text-center">
                  <p className="text-[10px] text-slate-500">{panelElements.length} of {dbElements.length} elements</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
