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

  // Upload PNG
  const png = readFileSync('/tmp/duplex_mep_floorplan.png')
  const filePath = `${projectId}/duplex_mep_floorplan_${Date.now()}.png`

  const { error: upErr } = await sb.storage.from('drawings').upload(filePath, png, { contentType: 'image/png' })
  if (upErr) { console.error('Upload error:', upErr.message); return }

  const { data: urlData } = sb.storage.from('drawings').getPublicUrl(filePath)
  console.log('PNG URL:', urlData.publicUrl)

  // Update drawing record
  const { error: updErr } = await sb.from('drawings').update({ file_url: urlData.publicUrl }).eq('id', drawingId)
  if (updErr) console.error('Update error:', updErr.message)
  else console.log('Drawing updated with PNG URL')

  console.log(`\nOpen: /snags/${drawingId}`)
}

main().catch(console.error)
