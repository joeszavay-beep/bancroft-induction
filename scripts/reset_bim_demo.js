import { createClient } from '@supabase/supabase-js'

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

  // 1. Nuke all existing elements
  console.log('Deleting all existing BIM elements...')
  // Delete in batches (supabase has row limits)
  let deleted = 0
  while (true) {
    const { data } = await sb.from('bim_elements').select('id').eq('project_id', projectId).limit(200)
    if (!data?.length) break
    await sb.from('bim_elements').delete().in('id', data.map(e => e.id))
    deleted += data.length
    console.log(`  Deleted ${deleted}...`)
  }
  console.log(`Deleted ${deleted} total`)

  // 2. Create fresh elements with coordinates as drawing percentages
  // SVG: 1200x850, grid A-G (x:120-1060), rows 1-5 (y:80-660)
  // To drawing %: x% = svgX/1200*100, y% = svgY/850*100

  function svgToPercent(svgX, svgY) {
    return { x: Math.round(svgX / 1200 * 10000) / 100, y: Math.round(svgY / 850 * 10000) / 100 }
  }

  function seeded(s) {
    let x = Math.sin(s * 9301 + 49297) * 233280
    return x - Math.floor(x)
  }

  // Room definitions from the SVG
  const rooms = [
    { name: 'Reception', x1: 130, y1: 90, x2: 430, y2: 230 },
    { name: 'Waiting Area', x1: 450, y1: 90, x2: 590, y2: 230 },
    { name: 'Meeting Room 01', x1: 610, y1: 90, x2: 750, y2: 230 },
    { name: 'Meeting Room 02', x1: 770, y1: 90, x2: 1050, y2: 230 },
    { name: 'Office 01', x1: 130, y1: 250, x2: 270, y2: 390 },
    { name: 'Office 02', x1: 290, y1: 250, x2: 430, y2: 390 },
    { name: 'Server Room', x1: 450, y1: 250, x2: 590, y2: 390 },
    { name: 'Corridor', x1: 130, y1: 405, x2: 1050, y2: 435 },
    { name: 'Open Plan Office', x1: 130, y1: 445, x2: 590, y2: 550 },
    { name: 'Kitchen / Break', x1: 770, y1: 405, x2: 1050, y2: 550 },
    { name: 'WC', x1: 610, y1: 445, x2: 750, y2: 550 },
    { name: 'Comms Room', x1: 130, y1: 570, x2: 270, y2: 650 },
    { name: 'Storage', x1: 290, y1: 570, x2: 430, y2: 650 },
    { name: 'Plant Room', x1: 770, y1: 570, x2: 1050, y2: 650 },
  ]

  // Element definitions per room — realistic for an M&E fit-out
  const roomElements = [
    // Reception: big space, lots of lighting
    { room: 0, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 4 },
      { name: 'Duplex Receptacle', type: 'IFCOUTLET', cat: 'electrical', count: 4 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 2 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 2 },
      { name: 'FCU Unit', type: 'IFCFAN', cat: 'mechanical', count: 1 },
    ]},
    // Waiting
    { room: 1, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Duplex Receptacle', type: 'IFCOUTLET', cat: 'electrical', count: 2 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
    ]},
    // Meeting 01
    { room: 2, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Floor Box Outlet', type: 'IFCOUTLET', cat: 'electrical', count: 2 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 1 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
      { name: 'Air Terminal', type: 'IFCAIRTERMINAL', cat: 'mechanical', count: 1 },
    ]},
    // Meeting 02
    { room: 3, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 4 },
      { name: 'Floor Box Outlet', type: 'IFCOUTLET', cat: 'electrical', count: 3 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 2 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
      { name: 'Fire Sprinkler', type: 'IFCFIRESUPPRESSIONTERMINAL', cat: 'fire', count: 2 },
      { name: 'Air Terminal', type: 'IFCAIRTERMINAL', cat: 'mechanical', count: 2 },
    ]},
    // Office 01
    { room: 4, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Duplex Receptacle', type: 'IFCOUTLET', cat: 'electrical', count: 3 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 1 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
    ]},
    // Office 02
    { room: 5, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Duplex Receptacle', type: 'IFCOUTLET', cat: 'electrical', count: 3 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 1 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
    ]},
    // Server Room
    { room: 6, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 1 },
      { name: 'Server Rack Outlet', type: 'IFCOUTLET', cat: 'electrical', count: 6 },
      { name: 'Distribution Board', type: 'IFCDISTRIBUTIONBOARD', cat: 'electrical', count: 1 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
      { name: 'CRAC Unit', type: 'IFCUNITARYEQUIPMENT', cat: 'mechanical', count: 1 },
      { name: 'Fire Sprinkler', type: 'IFCFIRESUPPRESSIONTERMINAL', cat: 'fire', count: 2 },
    ]},
    // Corridor
    { room: 7, items: [
      { name: 'Emergency Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 5 },
      { name: 'Fire Alarm Call Point', type: 'IFCALARM', cat: 'fire', count: 2 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 3 },
    ]},
    // Open Plan
    { room: 8, items: [
      { name: 'Ceiling Light Panel', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 6 },
      { name: 'Desk Outlet', type: 'IFCOUTLET', cat: 'electrical', count: 8 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 2 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 2 },
      { name: 'Fire Sprinkler', type: 'IFCFIRESUPPRESSIONTERMINAL', cat: 'fire', count: 3 },
      { name: 'Air Terminal', type: 'IFCAIRTERMINAL', cat: 'mechanical', count: 3 },
    ]},
    // Kitchen
    { room: 9, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Duplex Receptacle', type: 'IFCOUTLET', cat: 'electrical', count: 3 },
      { name: 'Smoke Detector', type: 'IFCDETECTOR', cat: 'fire', count: 1 },
      { name: 'Waste Pipe', type: 'IFCPIPESEGMENT', cat: 'plumbing', count: 1 },
      { name: 'Sink', type: 'IFCSANITARYTERMINAL', cat: 'plumbing', count: 1 },
    ]},
    // WC
    { room: 10, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Extract Fan', type: 'IFCFAN', cat: 'mechanical', count: 1 },
      { name: 'Toilet', type: 'IFCSANITARYTERMINAL', cat: 'plumbing', count: 2 },
      { name: 'Basin', type: 'IFCSANITARYTERMINAL', cat: 'plumbing', count: 2 },
      { name: 'Waste Pipe', type: 'IFCPIPESEGMENT', cat: 'plumbing', count: 2 },
    ]},
    // Comms
    { room: 11, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 1 },
      { name: 'Rack Outlet', type: 'IFCOUTLET', cat: 'electrical', count: 4 },
      { name: 'Distribution Board', type: 'IFCDISTRIBUTIONBOARD', cat: 'electrical', count: 1 },
    ]},
    // Storage
    { room: 12, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 1 },
      { name: 'Light Switch', type: 'IFCSWITCHINGDEVICE', cat: 'electrical', count: 1 },
    ]},
    // Plant Room
    { room: 13, items: [
      { name: 'Ceiling Light', type: 'IFCLIGHTFIXTURE', cat: 'electrical', count: 2 },
      { name: 'Boiler', type: 'IFCBOILER', cat: 'mechanical', count: 1 },
      { name: 'Pump', type: 'IFCPUMP', cat: 'plumbing', count: 2 },
      { name: 'Pipe Run', type: 'IFCPIPESEGMENT', cat: 'plumbing', count: 3 },
      { name: 'Valve', type: 'IFCVALVE', cat: 'plumbing', count: 2 },
      { name: 'Distribution Board', type: 'IFCDISTRIBUTIONBOARD', cat: 'electrical', count: 1 },
    ]},
  ]

  // Generate elements with positions
  const newElements = []
  let seed = 1

  for (const re of roomElements) {
    const room = rooms[re.room]
    for (const item of re.items) {
      for (let i = 0; i < item.count; i++) {
        const margin = 12
        const rx1 = room.x1 + margin, rx2 = room.x2 - margin
        const ry1 = room.y1 + margin, ry2 = room.y2 - margin

        const sx = rx1 + seeded(seed++) * (rx2 - rx1)
        const sy = ry1 + seeded(seed++) * (ry2 - ry1)
        const pos = svgToPercent(sx, sy)

        newElements.push({
          model_id: modelId,
          company_id: companyId,
          project_id: projectId,
          ifc_id: 100000 + newElements.length,
          global_id: `demo_${newElements.length}`,
          ifc_type: item.type,
          name: item.name,
          description: `${item.name} in ${room.name}`,
          category: item.cat,
          system_type: null,
          floor_name: 'Level 01',
          x: pos.x,
          y: pos.y,
          z: 0,
          properties: {},
        })
      }
    }
  }

  console.log(`\nInserting ${newElements.length} fresh elements...`)

  // Verify positions look right
  console.log('\nSample positions:')
  for (const e of newElements.slice(0, 5)) {
    console.log(`  ${e.name} in ${e.description.split(' in ')[1]}: x=${e.x}%, y=${e.y}%`)
  }

  // Insert in batches
  for (let i = 0; i < newElements.length; i += 50) {
    const batch = newElements.slice(i, i + 50)
    const { error } = await sb.from('bim_elements').insert(batch)
    if (error) { console.error(`Batch error at ${i}:`, error.message); return }
  }
  console.log('All elements inserted')

  // Update model count
  await sb.from('bim_models').update({ element_count: newElements.length }).eq('id', modelId)

  // Category summary
  const cats = {}
  for (const e of newElements) cats[e.category] = (cats[e.category] || 0) + 1
  console.log('\nCategories:', cats)

  console.log(`\nDone! ${newElements.length} elements across ${rooms.length} rooms.`)
  console.log(`Open: https://www.coresite.io/snags/${drawingId}`)
}

main().catch(console.error)
