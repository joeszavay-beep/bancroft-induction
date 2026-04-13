import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  await sb.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

  const projectId = 'f63ff789-24aa-457d-8fb4-b84521d580d3'
  const companyId = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
  const drawingId = '92e99980-adb7-47eb-bd21-dea379b4202f'
  const modelId = '2ddb2cbf-2beb-4582-a52d-93c9916a3de1'

  // 1. Convert SVG to PNG and upload
  console.log('Converting SVG to PNG...')
  const { execSync } = await import('child_process')
  execSync('sips -s format png --resampleWidth 2400 "/Users/SzavayProperty/Desktop/MSite/Level_01_GA.svg" --out /tmp/level01_ga.png')

  const png = readFileSync('/tmp/level01_ga.png')
  const filePath = `${projectId}/level_01_ga_${Date.now()}.png`

  const { error: upErr } = await sb.storage.from('drawings').upload(filePath, png, { contentType: 'image/png' })
  if (upErr) { console.error('Upload error:', upErr.message); return }

  const { data: urlData } = sb.storage.from('drawings').getPublicUrl(filePath)
  console.log('Uploaded:', urlData.publicUrl)

  // 2. Update drawing record
  await sb.from('drawings').update({
    file_url: urlData.publicUrl,
    name: 'Level 01 General Arrangement',
    drawing_number: 'GA-L01',
    revision: 'P01',
  }).eq('id', drawingId)
  console.log('Drawing updated')

  // 3. Scatter elements into actual rooms from the SVG
  // SVG viewBox: 0 0 1200 850
  // Grid: A-G (x: 120-1060), rows 1-5 (y: 80-660)
  // Convert SVG coords to drawing percentages: x% = svgX/1200*100, y% = svgY/850*100

  const rooms = [
    // Reception A1-C2: SVG rect ~120-440, 80-240
    { name: 'Reception', x1: 120, y1: 80, x2: 440, y2: 240, lights: 3, outlets: 4, switches: 2 },
    // Waiting C1-D2: ~440-600, 80-240
    { name: 'Waiting', x1: 440, y1: 80, x2: 600, y2: 240, lights: 2, outlets: 2, switches: 1 },
    // Meeting 01 D1-E2: ~600-760, 80-240
    { name: 'Meeting 01', x1: 600, y1: 80, x2: 760, y2: 240, lights: 2, outlets: 3, switches: 1 },
    // Meeting 02 E1-G2: ~760-1060, 80-240
    { name: 'Meeting 02', x1: 760, y1: 80, x2: 1060, y2: 240, lights: 4, outlets: 4, switches: 2 },
    // Office 01 A2-B3: ~120-280, 240-400
    { name: 'Office 01', x1: 120, y1: 240, x2: 280, y2: 400, lights: 2, outlets: 3, switches: 1 },
    // Office 02 B2-C3: ~280-440, 240-400
    { name: 'Office 02', x1: 280, y1: 240, x2: 440, y2: 400, lights: 2, outlets: 3, switches: 1 },
    // Server Room C2-D3: ~440-600, 240-400
    { name: 'Server Room', x1: 440, y1: 240, x2: 600, y2: 400, lights: 1, outlets: 6, switches: 1 },
    // Corridor: ~120-1060, 400-440
    { name: 'Corridor', x1: 120, y1: 400, x2: 1060, y2: 440, lights: 6, outlets: 0, switches: 2 },
    // Open Plan A3-D4: ~120-600, 440-560
    { name: 'Open Plan', x1: 120, y1: 440, x2: 600, y2: 560, lights: 6, outlets: 8, switches: 2 },
    // Kitchen E3-G4: ~760-1060, 400-560
    { name: 'Kitchen', x1: 760, y1: 400, x2: 1060, y2: 560, lights: 2, outlets: 4, switches: 1 },
    // WC: ~600-760, 440-560
    { name: 'WC', x1: 600, y1: 440, x2: 760, y2: 560, lights: 2, outlets: 1, switches: 1 },
    // Comms A4-B5: ~120-280, 560-660
    { name: 'Comms Room', x1: 120, y1: 560, x2: 280, y2: 660, lights: 1, outlets: 4, switches: 1 },
    // Storage: ~280-440, 560-660
    { name: 'Storage', x1: 280, y1: 560, x2: 440, y2: 660, lights: 1, outlets: 1, switches: 1 },
    // Plant: ~760-1060, 560-660
    { name: 'Plant Room', x1: 760, y1: 560, x2: 1060, y2: 660, lights: 2, outlets: 3, switches: 1 },
  ]

  // Build scattered element positions
  function seeded(seed) {
    let x = Math.sin(seed * 9301 + 49297) * 233280
    return x - Math.floor(x)
  }

  const positions = []
  let seed = 1

  for (const room of rooms) {
    const margin = 15 // SVG pixels margin from walls
    const x1 = room.x1 + margin, x2 = room.x2 - margin
    const y1 = room.y1 + margin, y2 = room.y2 - margin

    // Lights: center-ish, ceiling mounted
    for (let i = 0; i < room.lights; i++) {
      const sx = x1 + seeded(seed++) * (x2 - x1)
      const sy = y1 + seeded(seed++) * (y2 - y1)
      positions.push({ x: sx / 1200 * 100, y: sy / 850 * 100, type: 'light', room: room.name })
    }
    // Outlets: near walls (edges)
    for (let i = 0; i < room.outlets; i++) {
      const wall = Math.floor(seeded(seed++) * 4) // 0=top, 1=right, 2=bottom, 3=left
      let sx, sy
      if (wall === 0) { sx = x1 + seeded(seed++) * (x2 - x1); sy = y1 + 5 }
      else if (wall === 1) { sx = x2 - 5; sy = y1 + seeded(seed++) * (y2 - y1) }
      else if (wall === 2) { sx = x1 + seeded(seed++) * (x2 - x1); sy = y2 - 5 }
      else { sx = x1 + 5; sy = y1 + seeded(seed++) * (y2 - y1) }
      positions.push({ x: sx / 1200 * 100, y: sy / 850 * 100, type: 'outlet', room: room.name })
    }
    // Switches: near door area (one side of room)
    for (let i = 0; i < room.switches; i++) {
      const sx = x1 + 8 + seeded(seed++) * 20
      const sy = y2 - 8 - seeded(seed++) * 15
      positions.push({ x: sx / 1200 * 100, y: sy / 850 * 100, type: 'switch', room: room.name })
    }
  }

  console.log(`Generated ${positions.length} element positions across ${rooms.length} rooms`)

  // 4. Get existing elements and update their coordinates
  const { data: elements } = await sb.from('bim_elements')
    .select('id, ifc_type')
    .eq('project_id', projectId)
    .order('created_at')

  if (!elements?.length) { console.error('No elements'); return }

  // Match element types to positions
  const lights = elements.filter(e => e.ifc_type === 'IfcLightFixture' || e.ifc_type === 'IFCLIGHTFIXTURE' || e.ifc_type?.toLowerCase().includes('light'))
  const outlets = elements.filter(e => e.ifc_type === 'IfcOutlet' || e.ifc_type === 'IFCOUTLET' || e.ifc_type?.toLowerCase().includes('outlet') || e.ifc_type?.toLowerCase().includes('receptacle'))
  const switches = elements.filter(e => e.ifc_type?.toLowerCase().includes('switch') || e.ifc_type === 'IFCSWITCHINGDEVICE')
  const others = elements.filter(e => !lights.includes(e) && !outlets.includes(e) && !switches.includes(e))

  const lightPos = positions.filter(p => p.type === 'light')
  const outletPos = positions.filter(p => p.type === 'outlet')
  const switchPos = positions.filter(p => p.type === 'switch')

  console.log(`Elements: ${lights.length} lights, ${outlets.length} outlets, ${switches.length} switches, ${others.length} other`)
  console.log(`Positions: ${lightPos.length} light, ${outletPos.length} outlet, ${switchPos.length} switch`)

  // Assign positions to elements
  const updates = []

  function assignPositions(elems, posArr) {
    for (let i = 0; i < elems.length; i++) {
      const pos = posArr[i % posArr.length]
      // Add small jitter so stacked elements don't overlap exactly
      const jx = (seeded(i * 31 + 7) - 0.5) * 1.5
      const jy = (seeded(i * 47 + 13) - 0.5) * 1.5
      updates.push({
        id: elems[i].id,
        x: Math.round((pos.x + jx) * 100) / 100,
        y: Math.round((pos.y + jy) * 100) / 100,
      })
    }
  }

  assignPositions(lights, lightPos)
  assignPositions(outlets, outletPos)
  assignPositions(switches, switchPos)
  // Scatter remaining elements across all positions
  assignPositions(others, positions)

  console.log(`Updating ${updates.length} element coordinates...`)

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i]
    await sb.from('bim_elements').update({ x: u.x, y: u.y, floor_name: 'Level 01' }).eq('id', u.id)
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${updates.length}`)
  }
  console.log(`  ${updates.length}/${updates.length}`)

  // 5. Update calibration to 1:1 (coordinates are already in drawing %)
  await sb.from('bim_drawing_calibration').delete().eq('drawing_id', drawingId)
  const { error: calErr } = await sb.from('bim_drawing_calibration').insert({
    drawing_id: drawingId,
    model_id: modelId,
    company_id: companyId,
    point1_ifc_x: 0, point1_ifc_y: 0,
    point1_draw_x: 0, point1_draw_y: 0,
    point2_ifc_x: 100, point2_ifc_y: 100,
    point2_draw_x: 100, point2_draw_y: 100,
    floor_name: 'Level 01',
    created_by: 'Demo Setup',
  })
  if (calErr) console.error('Cal error:', calErr.message)
  else console.log('Calibration set (1:1)')

  // 6. Update model element count
  await sb.from('bim_models').update({ element_count: updates.length }).eq('id', modelId)

  console.log(`\nDone! Open: https://www.coresite.io/snags/${drawingId}`)
}

main().catch(console.error)
