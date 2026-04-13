import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

// Sign in as demo user for RLS
await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'
const today = new Date()
const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString() }

// Site Diary
const diaryEntries = []
for (let i = 20; i >= 1; i--) {
  const d = new Date(today); d.setDate(d.getDate() - i)
  if (d.getDay() === 0 || d.getDay() === 6) continue
  const weathers = ['sunny','cloudy','rain','sunny','cloudy','windy','sunny','rain','cloudy','sunny','heavy_rain','sunny','cloudy','sunny','rain']
  diaryEntries.push({
    company_id: CID, project_id: PID, date: d.toISOString().split('T')[0],
    weather: weathers[i % weathers.length],
    temp_high: 10 + Math.floor(Math.random() * 10),
    temp_low: 2 + Math.floor(Math.random() * 6),
    workforce_count: 20 + Math.floor(Math.random() * 15),
    subcontractors: ['ABC Electrical (8), Delta Plumbing (4), BMS Solutions (2)','ABC Electrical (6), Delta Plumbing (3)','ABC Electrical (10), Delta Plumbing (5), Fire Systems (3)','ABC Electrical (7), BMS Solutions (3)'][i%4],
    work_completed: ['Containment Level 2 east 80%. Final fix lighting corridors A-D.','Fire alarm loop testing Levels 1-3. BMS integration started.','Pipework risers 4-8 pressure tested. Level 1 hot water commissioned.','Cable pulling Level 3 DBs. Earthing verified Level 2.','Ductwork Level 2 west 100%. AHU-01 air balance in progress.','Emergency lighting Level 1-2. Fire dampers installed.','Small power Level 1 offices 90%. Server room cabling.','FCU commissioning Levels 1-2. Temp sensors calibrated.'][i%8],
    work_planned: ['Continue Level 2 west. Start Level 3 cabling.','Complete BMS Level 1. Fire alarm commissioning.','Start Level 2 pipework. Riser insulation.','Level 3 DB terms. Lighting circuit testing.','AHU-02 commissioning. Level 3 ductwork.','Emergency lighting Level 3. Fire stopping inspection.','Complete server room. Level 2 small power.','Snag walkthrough Level 1. FCU commissioning Level 3.'][i%8],
    deliveries: i%3===0 ? 'Cable drums x8, DBs x2, Fire alarm devices x50' : null,
    visitors: i%5===0 ? 'Client walkthrough — pleased with progress.' : null,
    delays: i===5 ? 'Lift access restricted 3 hours.' : null,
    incidents: i===7 ? 'Near miss: loose bracket Level 2. Secured. Toolbox talk delivered.' : null,
    created_by: 'Demo Manager',
  })
}
const { error: dErr } = await supabase.from('site_diary').insert(diaryEntries)
console.log(dErr ? 'Diary error: ' + dErr.message : diaryEntries.length + ' diary entries')

// Inspections
const { data: templates } = await supabase.from('inspection_templates').select('id, name, items').eq('company_id', CID)
if (templates?.length) {
  const inspections = [
    { tmpl: 0, loc: 'Level 1 West Wing', status: 'completed', d: 8 },
    { tmpl: 0, loc: 'Level 2 East Wing', status: 'completed', d: 6 },
    { tmpl: 1, loc: 'Level 1 Riser 1-3', status: 'completed', d: 5 },
    { tmpl: 1, loc: 'Level 2 Riser 4-6', status: 'failed', d: 4 },
    { tmpl: 2, loc: 'Level 1 Corridor A', status: 'completed', d: 3 },
    { tmpl: 2, loc: 'Level 2 Corridor B', status: 'completed', d: 2 },
    { tmpl: 0, loc: 'Level 3 East Wing', status: 'in_progress', d: 1 },
  ].map(insp => {
    const t = templates[Math.min(insp.tmpl, templates.length - 1)]
    let items; try { items = typeof t.items === 'string' ? JSON.parse(t.items) : t.items } catch { items = [] }
    const results = items.map(item => ({
      label: item.label, result: insp.status === 'in_progress' ? null : (insp.status === 'failed' && Math.random() > 0.7 ? 'fail' : 'pass'), notes: '',
    }))
    return {
      company_id: CID, project_id: PID, template_id: t.id, template_name: t.name,
      location: insp.loc, inspector_name: 'Demo Manager', status: insp.status,
      results: JSON.stringify(results),
      completed_at: insp.status !== 'in_progress' ? day(-insp.d) : null,
      created_at: day(-insp.d),
    }
  })
  const { error: iErr } = await supabase.from('inspections').insert(inspections)
  console.log(iErr ? 'Inspection error: ' + iErr.message : inspections.length + ' inspections')
}

await supabase.auth.signOut()
console.log('Done!')
