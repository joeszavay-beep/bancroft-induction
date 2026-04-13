import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  await sb.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

  const projectId = 'f63ff789-24aa-457d-8fb4-b84521d580d3'
  const drawingId = '92e99980-adb7-47eb-bd21-dea379b4202f'

  // Check calibration
  const { data: cal } = await sb.from('bim_drawing_calibration').select('*').eq('drawing_id', drawingId).single()
  console.log('Calibration:', JSON.stringify(cal, null, 2))

  // Check element coordinate ranges
  const { data: elements } = await sb.from('bim_elements')
    .select('id, x, y, name, category')
    .eq('project_id', projectId)
    .limit(20)

  console.log('\nFirst 20 elements:')
  for (const e of (elements || [])) {
    console.log(`  ${e.name} (${e.category}): x=${e.x}, y=${e.y}`)
  }

  // Get ranges
  const { data: all } = await sb.from('bim_elements')
    .select('x, y')
    .eq('project_id', projectId)

  const xs = all.map(e => Number(e.x)).filter(n => !isNaN(n))
  const ys = all.map(e => Number(e.y)).filter(n => !isNaN(n))
  console.log(`\nX range: ${Math.min(...xs).toFixed(2)} to ${Math.max(...xs).toFixed(2)}`)
  console.log(`Y range: ${Math.min(...ys).toFixed(2)} to ${Math.max(...ys).toFixed(2)}`)
  console.log(`Total elements: ${all.length}`)
}

main().catch(console.error)
