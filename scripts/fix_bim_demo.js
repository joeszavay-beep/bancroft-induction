import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  await sb.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

  // Find the existing GA drawings
  const { data: allDrawings } = await sb.from('drawings').select('id, name, file_url, project_id')
  console.log('Existing drawings:')
  for (const d of (allDrawings || [])) {
    console.log(`  ${d.name} — ${d.file_url?.substring(0, 80)}...`)
  }

  // Use the Riverside Level 1 GA as our BIM demo background
  const gaDrawing = allDrawings?.find(d => d.name?.includes('Level 1') || d.name?.includes('Riverside'))
  if (!gaDrawing) { console.error('No GA drawing found'); return }
  console.log(`\nUsing: ${gaDrawing.name} (${gaDrawing.file_url})`)

  const bimDrawingId = '92e99980-adb7-47eb-bd21-dea379b4202f'
  const projectId = 'f63ff789-24aa-457d-8fb4-b84521d580d3'

  // Update the BIM demo drawing to use the GA floor plan image
  const { error: updErr } = await sb.from('drawings').update({
    file_url: gaDrawing.file_url,
    name: 'Riverside Tower - Level 01 GA (BIM Demo)',
    drawing_number: 'GA-L01',
    revision: 'P01',
  }).eq('id', bimDrawingId)

  if (updErr) { console.error('Drawing update error:', updErr.message); return }
  console.log('Drawing updated to use GA floor plan')

  // Now scatter the BIM elements across the floor plan
  // Place them in realistic zones within 12-88% of the drawing area
  const { data: elements } = await sb.from('bim_elements')
    .select('id, name, ifc_type, category')
    .eq('project_id', projectId)

  if (!elements?.length) { console.error('No elements found'); return }
  console.log(`\nScattering ${elements.length} elements across floor plan...`)

  // Define zones for different element types to make it look realistic
  // Lights: scattered throughout rooms (wide spread)
  // Outlets: along walls (edges of rooms)
  // Switches: near doors (scattered but grouped)

  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  const zones = {
    // Room areas on a typical GA floor plan (x%, y%)
    rooms: [
      { cx: 25, cy: 30, rx: 10, ry: 10 },  // Top-left room
      { cx: 50, cy: 25, rx: 12, ry: 8 },   // Top-center room
      { cx: 75, cy: 30, rx: 10, ry: 10 },  // Top-right room
      { cx: 25, cy: 55, rx: 10, ry: 10 },  // Mid-left room
      { cx: 50, cy: 50, rx: 8, ry: 6 },    // Corridor
      { cx: 75, cy: 55, rx: 10, ry: 10 },  // Mid-right room
      { cx: 30, cy: 75, rx: 12, ry: 8 },   // Bottom-left room
      { cx: 60, cy: 75, rx: 12, ry: 8 },   // Bottom-right room
    ]
  }

  // Batch updates
  const updates = elements.map((el, i) => {
    const room = zones.rooms[i % zones.rooms.length]
    const r1 = seededRandom(i * 137 + 42)
    const r2 = seededRandom(i * 251 + 17)

    // Scatter within the room zone with some jitter
    const x = room.cx + (r1 - 0.5) * 2 * room.rx
    const y = room.cy + (r2 - 0.5) * 2 * room.ry

    return {
      id: el.id,
      // Store scattered coords as the drawing-space percentages directly
      // We'll use a 1:1 calibration so these map directly
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    }
  })

  // Update in batches
  const batchSize = 50
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    for (const u of batch) {
      await sb.from('bim_elements').update({ x: u.x, y: u.y }).eq('id', u.id)
    }
    console.log(`  Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
  }

  // Set up a 1:1 calibration (x,y in DB = x,y % on drawing)
  // This means the scattered coordinates map directly to drawing percentages
  const modelId = '2ddb2cbf-2beb-4582-a52d-93c9916a3de1'

  // Delete existing calibration first
  await sb.from('bim_drawing_calibration').delete().eq('drawing_id', bimDrawingId)

  const { error: calErr } = await sb.from('bim_drawing_calibration').insert({
    drawing_id: bimDrawingId,
    model_id: modelId,
    company_id: 'a3a6b344-8394-4ca6-8f07-3011b4513bbe',
    // 1:1 mapping: IFC coords = drawing percentages
    point1_ifc_x: 0,
    point1_ifc_y: 0,
    point1_draw_x: 0,
    point1_draw_y: 0,
    point2_ifc_x: 100,
    point2_ifc_y: 100,
    point2_draw_x: 100,
    point2_draw_y: 100,
    floor_name: 'Level 01',
    created_by: 'Demo Setup',
  })

  if (calErr) console.error('Calibration error:', calErr.message)
  else console.log('\n1:1 calibration set (scattered coords map directly to drawing %)')

  console.log(`\nDone! Open: /snags/${bimDrawingId}`)
  console.log('Toggle the purple Box icon to see BIM elements on the GA floor plan.')
}

main().catch(console.error)
