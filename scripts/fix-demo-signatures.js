/**
 * Upload personalised demo signature SVGs to Supabase storage.
 * Deletes old files first, then uploads new ones.
 *
 * Run: node scripts/fix-demo-signatures.js
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pbyxpeaeijuxkzktvwbd.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'

const supabase = createClient(supabaseUrl, anonKey)

const signatures = {
  'james-wilson': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M22,18 C22,18 30,16 32,18 C34,20 34,42 32,52 C30,62 24,68 18,66 C12,64 12,58 16,56" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
  <circle cx="28" cy="12" r="1.5" fill="#1a1a2e"/>
  <circle cx="40" cy="56" r="1.5" fill="#1a1a2e"/>
  <path d="M55,22 C55,22 58,52 60,56 C62,52 68,30 70,28 C72,30 76,52 78,56 C80,52 86,22 86,22" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M94,34 L94,56" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
  <circle cx="94" cy="28" r="1.5" fill="#1a1a2e"/>
  <path d="M104,20 L104,56" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
  <path d="M114,36 C120,32 124,34 120,40 C116,46 114,50 120,54 C126,56 126,54 126,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M132,44 C132,36 140,32 144,38 C148,44 144,56 136,56 C130,56 130,46 132,44" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M150,34 L150,56 M150,40 C150,34 162,32 162,40 L162,56" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M18,72 C60,68 120,66 172,70 C180,71 175,66 168,68" fill="none" stroke="#1a1a2e" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
</svg>`,

  'sarah-chen': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M28,24 C20,20 12,26 14,34 C16,42 28,42 30,50 C32,58 24,64 16,60" fill="none" stroke="#1a1a2e" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="38" cy="58" r="1.5" fill="#1a1a2e"/>
  <path d="M62,30 C54,24 44,30 44,44 C44,58 54,62 62,58" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
  <path d="M70,18 L70,58 M70,38 C70,32 82,30 82,38 L82,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M90,44 L104,44 C104,36 98,32 90,36 C86,42 88,56 98,58 C104,58 106,54 106,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M112,34 L112,58 M112,40 C112,32 124,30 124,40 L124,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12,72 C40,68 90,66 134,70 Q140,72 136,68" fill="none" stroke="#1a1a2e" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
</svg>`,

  'lisa-martinez': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M14,18 L14,58 L32,58" fill="none" stroke="#1a1a2e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="38" cy="58" r="1.5" fill="#1a1a2e"/>
  <path d="M50,58 L50,22 L64,46 L78,22 L78,58" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M96,44 C90,38 88,48 90,54 C92,58 100,58 102,50 C102,42 96,36 90,40 M102,36 L102,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M110,36 L110,58 M110,42 C110,36 118,34 120,36" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M128,24 L128,58 M122,36 L136,36" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M142,36 L142,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="142" cy="28" r="1.5" fill="#1a1a2e"/>
  <path d="M150,36 L150,58 M150,42 C150,34 162,32 162,42 L162,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M170,44 L184,44 C184,36 178,32 170,36 C166,42 168,56 178,58 C184,58 186,54 186,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M192,36 L206,36 L192,58 L206,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12,72 C60,68 140,64 216,70 Q222,72 218,68" fill="none" stroke="#1a1a2e" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
</svg>`,

  'mike-obrien': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M12,58 L12,22 L26,44 L40,22 L40,58" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="48" cy="58" r="1.5" fill="#1a1a2e"/>
  <path d="M68,40 C68,26 56,22 56,40 C56,58 68,62 68,40 Z" fill="none" stroke="#1a1a2e" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M78,22 C79,18 77,16 76,18" fill="none" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M84,22 L84,58 M84,22 C84,22 100,22 100,32 C100,40 84,40 84,40 C84,40 102,40 102,50 C102,58 84,58 84,58" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M112,36 L112,58 M112,42 C112,36 120,34 122,36" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M128,36 L128,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="128" cy="28" r="1.5" fill="#1a1a2e"/>
  <path d="M136,44 L150,44 C150,36 144,32 136,36 C132,42 134,56 144,58 C150,58 152,54 152,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M158,36 L158,58 M158,42 C158,34 170,32 170,42 L170,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M10,72 C50,68 120,64 180,70 Q186,72 182,68" fill="none" stroke="#1a1a2e" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
</svg>`,

  'tom-hughes': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M10,22 L36,22 M23,22 L23,58" fill="none" stroke="#1a1a2e" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="42" cy="58" r="1.5" fill="#1a1a2e"/>
  <path d="M54,22 L54,58 M54,40 L76,40 M76,22 L76,58" fill="none" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
  <path d="M86,36 L86,52 C86,58 94,60 98,54 L98,36" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M118,44 C112,38 106,42 106,48 C106,56 114,58 118,52 M118,36 L118,68 C118,74 110,76 106,72" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M126,18 L126,58 M126,40 C126,34 138,32 138,40 L138,58" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M146,44 L160,44 C160,36 154,32 146,36 C142,42 144,56 154,58 C160,58 162,54 162,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M172,38 C178,34 182,36 178,42 C174,48 172,52 178,56 C184,58 186,54 186,54" fill="none" stroke="#1a1a2e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M8,72 C50,68 130,64 196,70 Q202,72 198,68" fill="none" stroke="#1a1a2e" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>
</svg>`,
}

async function main() {
  const names = Object.keys(signatures)

  // Delete old files first
  console.log('Deleting old files...')
  const filesToDelete = names.map(n => `demo-signatures/${n}.svg`)
  await supabase.storage.from('documents').remove(filesToDelete)

  // Upload new ones
  for (const [key, svg] of Object.entries(signatures)) {
    console.log(`Uploading ${key}...`)
    const { error } = await supabase.storage
      .from('documents')
      .upload(`demo-signatures/${key}.svg`, svg, { contentType: 'image/svg+xml' })

    if (error) {
      console.error(`  Failed: ${error.message}`)
    } else {
      console.log(`  Done`)
    }
  }
  console.log('\nAll signatures uploaded!')
}

main()
