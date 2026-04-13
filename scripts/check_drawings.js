import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  await sb.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

  const projectId = 'f63ff789-24aa-457d-8fb4-b84521d580d3'
  const companyId = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
  const modelId = '2ddb2cbf-2beb-4582-a52d-93c9916a3de1'

  // Check all drawings
  const { data: drawings } = await sb.from('drawings').select('id, name, project_id')
  console.log('All drawings:', drawings?.length || 0)
  if (drawings?.length) {
    for (const d of drawings) console.log(`  ${d.name} (${d.id}) project=${d.project_id}`)
  }

  // If no drawings exist for this project, create one with the uploaded floor plan
  const projectDrawings = drawings?.filter(d => d.project_id === projectId) || []
  if (projectDrawings.length === 0) {
    console.log('\nNo drawings for this project. Creating one...')
    const { data: drawing, error } = await sb.from('drawings').insert({
      company_id: companyId,
      project_id: projectId,
      name: 'Duplex MEP Floor Plan',
      drawing_number: 'MEP-001',
      revision: 'A',
      file_url: 'https://pbyxpeaeijuxkzktvwbd.supabase.co/storage/v1/object/public/drawings/f63ff789-24aa-457d-8fb4-b84521d580d3/bim_demo_floorplan_1775508135465.pdf',
    }).select().single()

    if (error) { console.error('Drawing insert error:', error.message); return }
    console.log('Created drawing:', drawing.id, drawing.name)

    // Set up calibration for this drawing
    // IFC: X=0..27.5, Y=-57..-1.4
    // Drawing %: map to 10-90% range
    const { error: calErr } = await sb.from('bim_drawing_calibration').insert({
      drawing_id: drawing.id,
      model_id: modelId,
      company_id: companyId,
      point1_ifc_x: 0,
      point1_ifc_y: -57,
      point1_draw_x: 10,
      point1_draw_y: 85,
      point2_ifc_x: 27.5,
      point2_ifc_y: -1.4,
      point2_draw_x: 90,
      point2_draw_y: 15,
      floor_name: 'Level 1',
      created_by: 'Demo Setup',
    })

    if (calErr) console.error('Calibration error:', calErr.message)
    else console.log('Calibration set!')

    console.log(`\nOpen: /snags/${drawing.id} to see BIM overlay`)
  } else {
    console.log(`\nProject already has ${projectDrawings.length} drawing(s)`)
    const drawingId = projectDrawings[0].id

    // Check if calibration exists
    const { data: cal } = await sb.from('bim_drawing_calibration').select('*').eq('drawing_id', drawingId)
    if (!cal?.length) {
      console.log('Setting up calibration for existing drawing...')
      const { error: calErr } = await sb.from('bim_drawing_calibration').insert({
        drawing_id: drawingId,
        model_id: modelId,
        company_id: companyId,
        point1_ifc_x: 0,
        point1_ifc_y: -57,
        point1_draw_x: 10,
        point1_draw_y: 85,
        point2_ifc_x: 27.5,
        point2_ifc_y: -1.4,
        point2_draw_x: 90,
        point2_draw_y: 15,
        floor_name: 'Level 1',
        created_by: 'Demo Setup',
      })
      if (calErr) console.error('Calibration error:', calErr.message)
      else console.log('Calibration set!')
    } else {
      console.log('Calibration already exists')
    }

    console.log(`\nOpen: /snags/${drawingId} to see BIM overlay`)
  }
}

main().catch(console.error)
