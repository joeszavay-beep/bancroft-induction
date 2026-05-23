import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { loadLogoImage, fetchSignatureAsDataUrl } from './reportTemplate'

// ── Ensure Google Fonts are loaded ──
let fontsInjected = false
function ensureFonts() {
  if (fontsInjected) return
  if (!document.querySelector('link[href*="Fraunces"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap'
    document.head.appendChild(link)
  }
  fontsInjected = true
}

// ── Helpers ──
function ini(name) {
  const p = (name || '').trim().split(/\s+/)
  return p.length < 2 ? (p[0] || '?')[0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }

function fmtDate(d) {
  if (!d) return '\u2014'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function parseTitle(title) {
  const m = title.match(/^(.+?)\s*[\-\u2013]\s*\((.+)\)$/)
  if (m) return { code: m[1].trim(), human: m[2].trim() }
  const m2 = title.match(/^([A-Z0-9][\w-]+.*?(?:REV\s*[\w-]*))\s*[\-\u2013]\s*(.+)$/i)
  if (m2) return { code: m2[1].trim(), human: m2[2].trim() }
  return { code: '', human: title }
}

const CHECK = '<svg style="width:13px;height:13px;color:#2C9C5E;flex-shrink:0" viewBox="0 0 14 14" fill="none"><path d="M3 7.5 L5.8 10.2 L11 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// ── CSS for the rendered sheet ──
const SHEET_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
  .so-root *, .so-root *::before, .so-root *::after { margin:0; padding:0; box-sizing:border-box; }
  .so-root {
    --navy:#0D1426; --navy-2:#16213B;
    --blue:#1B6FC8; --blue-ink:#155CA8; --blue-soft:#E9F1FB;
    --green:#2C9C5E; --green-soft:#E7F5EC;
    --paper:#FFFFFF; --paper-2:#F5F7FA;
    --ink:#0D1426; --ink-2:#3A4254;
    --muted:#7C828F; --muted-2:#A2A7B2;
    --line:#E8EBF1; --line-2:#DCE0EA;
    font-family:'Hanken Grotesk',system-ui,sans-serif;
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
  }
  .so-sheet {
    width:880px; background:var(--paper); position:relative; overflow:hidden;
  }
  .so-sheet::before {
    content:''; position:absolute; left:0; top:0; bottom:0; width:4px;
    background:linear-gradient(to bottom, var(--blue), var(--navy)); z-index:10;
  }
  /* MASTHEAD */
  .so-mast {
    background:linear-gradient(112deg, var(--navy), var(--navy-2));
    padding:26px 56px 26px 60px; display:flex; align-items:center; justify-content:space-between; gap:24px;
  }
  .so-mast-l { display:flex; align-items:center; gap:18px; min-width:0; }
  .so-logo {
    width:50px; height:50px; background:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .so-logo img { height:34px; width:auto; display:block; object-fit:contain; }
  .so-logo-fb { font-family:'Fraunces',serif; font-weight:700; font-size:20px; color:var(--navy); line-height:1; }
  .so-div { width:1px; height:36px; background:rgba(255,255,255,.15); flex-shrink:0; }
  .so-co { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .so-co-name { color:#fff; font-weight:700; font-size:15px; letter-spacing:.01em; white-space:nowrap; }
  .so-co-sub { color:rgba(255,255,255,.4); font-size:10.5px; text-transform:uppercase; letter-spacing:.14em; font-weight:500; }
  .so-mast-r { display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0; }
  .so-pill {
    display:inline-flex; align-items:center; gap:8px; padding:7px 16px 7px 12px;
    background:rgba(44,156,94,.14); border:1px solid rgba(44,156,94,.35);
    color:#62D69C; font-size:13px; font-weight:600;
  }
  .so-led { width:7px; height:7px; background:#62D69C; border-radius:50%; flex-shrink:0; }
  .so-sc { color:rgba(255,255,255,.35); font-size:12px; font-weight:500; }
  .so-accent { height:2px; background:linear-gradient(to right, var(--blue), transparent 70%); }
  /* HERO */
  .so-hero { padding:46px 56px 42px 60px; }
  .so-eye { color:var(--blue); font-size:11.5px; text-transform:uppercase; letter-spacing:.26em; font-weight:600; margin-bottom:16px; }
  .so-h1 {
    font-family:'Fraunces',serif; font-optical-sizing:auto; font-size:46px; font-weight:700;
    color:var(--navy); line-height:1.08; margin-bottom:12px;
  }
  .so-code { color:var(--muted); font-size:13.5px; margin-bottom:22px; letter-spacing:.01em; }
  .so-proj { display:flex; align-items:center; gap:10px; }
  .so-pdot { width:6px; height:6px; background:var(--blue); flex-shrink:0; }
  .so-pname { font-family:'Fraunces',serif; font-optical-sizing:auto; font-style:italic; font-size:18px; color:var(--blue-ink); }
  /* META */
  .so-meta {
    display:grid; grid-template-columns:repeat(4,1fr); background:var(--paper-2);
    border-top:1px solid var(--line); border-bottom:1px solid var(--line);
  }
  .so-mc { padding:22px 28px; text-align:center; }
  .so-mc+.so-mc { border-left:1px solid var(--line); }
  .so-ml { font-size:10px; text-transform:uppercase; letter-spacing:.16em; color:var(--muted); font-weight:600; margin-bottom:7px; }
  .so-mv { font-family:'Fraunces',serif; font-optical-sizing:auto; font-size:21px; font-weight:500; color:var(--ink); }
  .so-mv-g { color:var(--green); }
  /* REGISTER */
  .so-reg { padding:40px 56px 36px 60px; }
  .so-rh { display:flex; align-items:baseline; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid var(--line); }
  .so-rt { font-family:'Fraunces',serif; font-optical-sizing:auto; font-size:25px; font-weight:600; color:var(--navy); }
  .so-rc { color:var(--muted); font-size:14px; }
  .so-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:48px; }
  /* ENTRY */
  .so-e { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; padding:22px 4px 20px; border-bottom:1px solid var(--line); }
  .so-el { display:flex; gap:14px; align-items:flex-start; min-width:0; }
  .so-chip {
    width:42px; height:42px; background:var(--blue-soft); display:flex; align-items:center; justify-content:center; flex-shrink:0;
    font-family:'Fraunces',serif; font-optical-sizing:auto; font-weight:600; font-size:15px; color:var(--blue-ink);
  }
  .so-ei { display:flex; flex-direction:column; gap:5px; min-width:0; padding-top:2px; }
  .so-en { font-weight:600; font-size:16.5px; color:var(--ink); line-height:1.2; }
  .so-ed { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:13px; line-height:1; }
  .so-mid { width:3px; height:3px; background:var(--muted-2); flex-shrink:0; }
  .so-sig { flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; }
  .so-sig img { max-height:52px; width:auto; max-width:150px; opacity:.88; display:block; }
  .so-sl { width:100%; min-width:90px; height:1px; background:var(--line-2); margin-top:5px; }
  .so-fb { font-family:'Fraunces',serif; font-style:italic; color:var(--muted-2); font-size:12.5px; padding-bottom:2px; white-space:nowrap; }
  .so-fb-inv { color:#D93E3E; font-style:italic; font-size:12.5px; padding-bottom:2px; }
  /* FOOTER */
  .so-foot {
    display:flex; align-items:center; justify-content:space-between;
    padding:22px 56px 22px 60px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
  }
  .so-fb-brand { color:var(--blue-ink); font-weight:700; }
`

// ── Build HTML ──
function buildSheetHtml({ projectName, documentTitle, signatures, branding, logoDataUrl, sigDataUrls }) {
  const valid = signatures.filter(s => !s.invalidated)
  const total = signatures.length
  const company = branding?.companyName || 'CoreSite'
  const complete = valid.length === total
  const { code, human } = parseTitle(documentTitle)

  // Logo
  let logo
  if (logoDataUrl) {
    logo = `<img src="${logoDataUrl}" alt="${esc(company)} logo">`
  } else {
    const li = company.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    logo = `<span class="so-logo-fb">${li}</span>`
  }

  // Entries
  const entries = signatures.map((sig, i) => {
    const chip = ini(sig.operative_name)
    const dt = fmtDate(sig.signed_at)
    const tm = fmtTime(sig.signed_at)
    const dataUrl = sigDataUrls[i]

    let sigHtml
    if (sig.invalidated) {
      sigHtml = '<div class="so-sig"><span class="so-fb-inv">invalidated</span><div class="so-sl"></div></div>'
    } else if (dataUrl) {
      sigHtml = `<div class="so-sig"><img src="${dataUrl}" alt="${esc(sig.operative_name)} signature"><div class="so-sl"></div></div>`
    } else {
      sigHtml = '<div class="so-sig"><span class="so-fb">signed electronically</span><div class="so-sl"></div></div>'
    }

    return `<div class="so-e"><div class="so-el"><div class="so-chip">${chip}</div><div class="so-ei"><div class="so-en">${esc(sig.operative_name)}</div><div class="so-ed">${CHECK}<span>${esc(dt)}</span><span class="so-mid"></span><span>${esc(tm)}</span></div></div></div>${sigHtml}</div>`
  }).join('')

  return `<div class="so-root"><div class="so-sheet">` +
    // Masthead
    `<div class="so-mast"><div class="so-mast-l"><div class="so-logo">${logo}</div><div class="so-div"></div><div class="so-co"><div class="so-co-name">${esc(company)}</div></div></div><div class="so-mast-r"><div class="so-pill"><span class="so-led"></span><span>${complete ? 'Completed' : 'Open'}</span></div><span class="so-sc">${valid.length} of ${total} signed</span></div></div>` +
    `<div class="so-accent"></div>` +
    // Hero
    `<div class="so-hero"><div class="so-eye">Document Sign-off</div><h1 class="so-h1">${esc(human)}</h1>${code ? `<div class="so-code">${esc(code)}</div>` : ''}<div class="so-proj"><span class="so-pdot"></span><span class="so-pname">${esc(projectName)}</span></div></div>` +
    // Meta
    `<div class="so-meta"><div class="so-mc"><div class="so-ml">Issued</div><div class="so-mv">${esc(fmtDate(new Date()))}</div></div><div class="so-mc"><div class="so-ml">Signatories</div><div class="so-mv">${total}</div></div><div class="so-mc"><div class="so-ml">Valid</div><div class="so-mv">${valid.length}</div></div><div class="so-mc"><div class="so-ml">Completion</div><div class="so-mv ${complete ? 'so-mv-g' : ''}">${complete ? 'Complete' : Math.round(valid.length / total * 100) + '%'}</div></div></div>` +
    // Register
    `<div class="so-reg"><div class="so-rh"><h2 class="so-rt">Signatories</h2><span class="so-rc">${complete ? 'All ' + total + ' signed' : valid.length + ' of ' + total + ' signed'}</span></div><div class="so-grid">${entries}</div></div>` +
    // Footer
    `<div class="so-foot"><span>${esc(company)}</span><span>Powered by <span class="so-fb-brand">CoreSite</span></span><span>${fmtDate(new Date())}</span></div>` +
    `</div></div>`
}

// ── Main export ──
export async function generateSignOffSheet({ projectName, documentTitle, signatures, branding }) {
  ensureFonts()

  // Pre-load images via Supabase SDK (avoids CORS)
  const [logoDataUrl, ...sigDataUrls] = await Promise.all([
    branding?.logoUrl ? (branding.logoDataUrl || loadLogoImage(branding.logoUrl)) : Promise.resolve(null),
    ...signatures.map(sig =>
      sig.signature_url && !sig.invalidated
        ? fetchSignatureAsDataUrl(sig.signature_url).catch(() => null)
        : Promise.resolve(null)
    ),
  ])

  // Inject styles
  let style = document.getElementById('so-pdf-css')
  if (!style) {
    style = document.createElement('style')
    style.id = 'so-pdf-css'
    style.textContent = SHEET_CSS
    document.head.appendChild(style)
  }

  // Build off-screen container
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:absolute;left:-10000px;top:0;width:880px;z-index:-1;'
  wrapper.innerHTML = buildSheetHtml({ projectName, documentTitle, signatures, branding, logoDataUrl, sigDataUrls })
  document.body.appendChild(wrapper)

  // Wait for fonts to be ready
  await document.fonts.ready
  await new Promise(r => setTimeout(r, 350))

  // Render to canvas
  const sheet = wrapper.querySelector('.so-sheet')
  const canvas = await html2canvas(sheet, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  })

  // Build PDF (A4: 210 x 297 mm)
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pw = 210, ph = 297
  const imgW = pw
  const imgH = (canvas.height * imgW) / canvas.width

  if (imgH <= ph) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH)
  } else {
    const pxPerPage = (ph / imgW) * canvas.width
    let yOff = 0, page = 0
    while (yOff < canvas.height) {
      if (page > 0) pdf.addPage()
      const sliceH = Math.min(pxPerPage, canvas.height - yOff)
      const pc = document.createElement('canvas')
      pc.width = canvas.width
      pc.height = sliceH
      pc.getContext('2d').drawImage(canvas, 0, yOff, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, (sliceH * imgW) / canvas.width)
      yOff += pxPerPage
      page++
    }
  }

  // Cleanup
  document.body.removeChild(wrapper)

  // Save
  const fileName = `Sign-Off - ${documentTitle} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  pdf.save(fileName)
}
