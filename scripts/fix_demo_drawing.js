import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

async function main() {
  await sb.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

  const projectId = 'f63ff789-24aa-457d-8fb4-b84521d580d3'
  const drawingId = '92e99980-adb7-47eb-bd21-dea379b4202f'

  // Upload the proper 2D architectural floor plan PNG
  const png = readFileSync('/tmp/duplex_arch_floorplan.png')
  const filePath = `${projectId}/duplex_arch_floorplan_${Date.now()}.png`

  const { error: upErr } = await sb.storage.from('drawings').upload(filePath, png, { contentType: 'image/png' })
  if (upErr) { console.error('Upload error:', upErr.message); return }

  const { data: urlData } = sb.storage.from('drawings').getPublicUrl(filePath)
  console.log('2D Floor Plan URL:', urlData.publicUrl)

  // Update drawing to use the flat 2D plan
  const { error: updErr } = await sb.from('drawings').update({
    file_url: urlData.publicUrl,
    name: 'Duplex Apartment - Level 1 Floor Plan',
  }).eq('id', drawingId)

  if (updErr) console.error('Update error:', updErr.message)
  else console.log('Drawing updated with 2D architectural floor plan')

  // Also update the BIM elements to have proper floor names
  // The Duplex electrical IFC has elements at Z=0 (Level 1) and Z~3 (Level 2)
  const { data: elements } = await sb.from('bim_elements')
    .select('id, z')
    .eq('project_id', projectId)

  if (elements?.length) {
    const level1 = elements.filter(e => e.z == null || Number(e.z) < 2.5)
    const level2 = elements.filter(e => e.z != null && Number(e.z) >= 2.5)

    if (level1.length) {
      const { error } = await sb.from('bim_elements')
        .update({ floor_name: 'Level 1' })
        .in('id', level1.map(e => e.id))
      if (error) console.error('L1 update error:', error.message)
      else console.log(`Updated ${level1.length} elements to Level 1`)
    }

    if (level2.length) {
      const { error } = await sb.from('bim_elements')
        .update({ floor_name: 'Level 2' })
        .in('id', level2.map(e => e.id))
      if (error) console.error('L2 update error:', error.message)
      else console.log(`Updated ${level2.length} elements to Level 2`)
    }
  }

  console.log(`\nDone. Open: /snags/${drawingId}`)
  console.log('Then click the gear icon to recalibrate, and the purple Box icon to toggle BIM overlay.')
}

main().catch(console.error)
