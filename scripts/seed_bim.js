import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  // Sign in as demo user to get auth
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'demo@coresite.io',
    password: 'Demo2026!',
  })
  if (authErr) { console.error('Auth failed:', authErr.message); return }
  console.log('Signed in as demo user')

  // Get the demo company/project
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, companies(id, name)')
    .eq('id', auth.user.id)
    .single()

  const companyId = profile?.company_id
  console.log('Company:', profile?.companies?.name, companyId)

  // Get first project
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name')
    .limit(1)

  if (!projects?.length) { console.error('No projects found'); return }
  const projectId = projects[0].id
  console.log('Project:', projects[0].name, projectId)

  // Upload the MEP floor plan PDF as a drawing image
  // First convert PDF to a usable format - actually let's just upload it and use the URL
  const pdfBuffer = readFileSync('/tmp/Duplex_MEP_20110907_optimized.pdf')
  const filePath = `${projectId}/bim_demo_floorplan_${Date.now()}.pdf`

  const { error: upErr } = await supabase.storage
    .from('drawings')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf' })

  if (upErr) { console.error('Upload failed:', upErr.message); }
  else { console.log('Floor plan uploaded') }

  const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filePath)
  console.log('Drawing URL:', urlData.publicUrl)

  // Upload the IFC file to documents storage
  const ifcBuffer = readFileSync('/tmp/duplex_electrical.ifc')
  const ifcPath = `bim/${projectId}/duplex_electrical_${Date.now()}.ifc`

  const { error: ifcUpErr } = await supabase.storage
    .from('documents')
    .upload(ifcPath, ifcBuffer, { contentType: 'application/x-step' })

  if (ifcUpErr) console.error('IFC upload failed:', ifcUpErr.message)
  else console.log('IFC file uploaded')

  const { data: ifcUrlData } = supabase.storage.from('documents').getPublicUrl(ifcPath)

  // Create BIM model record
  const { data: model, error: modelErr } = await supabase.from('bim_models').insert({
    company_id: companyId,
    project_id: projectId,
    name: 'Duplex Electrical',
    file_url: ifcUrlData.publicUrl,
    file_size: ifcBuffer.length,
    ifc_schema: 'IFC2X3',
    element_count: 82,
    status: 'ready',
    uploaded_by: 'Demo Setup',
  }).select().single()

  if (modelErr) { console.error('Model insert failed:', modelErr.message); return }
  console.log('BIM model created:', model.id)

  // Load parsed elements
  const elements = JSON.parse(readFileSync('/tmp/bim_elements.json', 'utf-8'))
  console.log(`Inserting ${elements.length} elements...`)

  // Insert elements in batches
  const batchSize = 50
  for (let i = 0; i < elements.length; i += batchSize) {
    const batch = elements.slice(i, i + batchSize).map(el => ({
      model_id: model.id,
      company_id: companyId,
      project_id: projectId,
      ifc_id: el.ifc_id,
      global_id: el.global_id,
      ifc_type: el.ifc_type,
      name: el.name,
      description: el.description,
      category: el.category,
      system_type: null,
      floor_name: 'Level 1',
      x: el.x,
      y: el.y,
      z: el.z,
      properties: {},
    }))

    const { error: elErr } = await supabase.from('bim_elements').insert(batch)
    if (elErr) console.error(`Batch ${i} error:`, elErr.message)
    else console.log(`  Inserted batch ${i}-${i + batch.length}`)
  }

  // Now get the first snag drawing for this project to set up calibration
  const { data: drawings } = await supabase
    .from('drawings')
    .select('id, name')
    .eq('project_id', projectId)
    .limit(1)

  if (drawings?.length) {
    const drawingId = drawings[0].id
    console.log('Found drawing:', drawings[0].name, drawingId)

    // Set up calibration mapping
    // IFC coords: X range 0-27.5, Y range -57 to -1.4
    // Map to drawing percentage: we'll map the full IFC range to roughly 10%-90% of the drawing
    const { error: calErr } = await supabase.from('bim_drawing_calibration').upsert({
      drawing_id: drawingId,
      model_id: model.id,
      company_id: companyId,
      point1_ifc_x: 0,
      point1_ifc_y: -57,
      point1_draw_x: 10,
      point1_draw_y: 90,
      point2_ifc_x: 27.5,
      point2_ifc_y: -1.4,
      point2_draw_x: 90,
      point2_draw_y: 10,
      floor_name: 'Level 1',
      created_by: 'Demo Setup',
    }, { onConflict: 'drawing_id,model_id' })

    if (calErr) console.error('Calibration error:', calErr.message)
    else console.log('Calibration set for drawing', drawingId)
  } else {
    console.log('No existing drawings found - calibration skipped')
    console.log('The BIM model and elements are ready. Open a snag drawing and calibrate from there.')
  }

  console.log('\nDone! Refresh /app/bim to see the model.')
}

main().catch(console.error)
