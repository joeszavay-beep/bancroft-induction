/**
 * Equipment QR Label Printing
 * Generates an A4 sheet of QR code sticker labels (3 columns x 5 rows = 15 per page)
 * Uses HTML + window.print() pattern from SiteAttendance printQR()
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { createElement } from 'react'

/**
 * Print QR labels for one or more equipment items
 * @param {Array} items - [{ id, description, type, serial_number }]
 * @param {{ name, logo_url }} company - Company branding
 */
export function printEquipmentLabels(items, company) {
  const origin = window.location.origin

  const labelHtml = items.map(item => {
    const url = `${origin}/equipment-check/${item.id}`
    const qrSvg = renderToStaticMarkup(createElement(QRCodeSVG, {
      value: url,
      size: 120,
      level: 'H',
      includeMargin: false,
    }))

    return `
      <div class="label">
        <div class="qr">${qrSvg}</div>
        <div class="info">
          <div class="type">${esc(item.type)}</div>
          <div class="desc">${esc(item.description)}</div>
          ${item.serial_number ? `<div class="serial">${esc(item.serial_number)}</div>` : ''}
        </div>
        <div class="brand">CoreSite</div>
      </div>
    `
  }).join('')

  const pageCount = Math.ceil(items.length / 15)

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Equipment Labels — ${esc(company?.name || 'CoreSite')}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4mm;
      page-break-after: always;
    }
    .grid:last-child { page-break-after: auto; }
    .label {
      border: 1px solid #E8EBF1;
      padding: 5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3mm;
      min-height: 50mm;
      position: relative;
      page-break-inside: avoid;
    }
    .qr { flex-shrink: 0; }
    .qr svg { display: block; }
    .info { text-align: center; width: 100%; }
    .type {
      font-size: 11px;
      font-weight: 700;
      color: #0D1426;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1mm;
    }
    .desc {
      font-size: 9px;
      color: #3A4254;
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .serial {
      font-size: 8px;
      color: #7C828F;
      margin-top: 1mm;
    }
    .brand {
      font-size: 7px;
      color: #A2A7B2;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      position: absolute;
      bottom: 2mm;
      right: 3mm;
    }
    @media screen {
      body { background: #f0f0f0; padding: 20px; }
      .grid { max-width: 210mm; margin: 0 auto 20px; background: white; padding: 8mm; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    }
  </style>
</head>
<body>
  ${chunkLabels(labelHtml, 15)}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
}

function chunkLabels(allLabelsHtml, perPage) {
  // Split individual labels and group into pages
  const labels = allLabelsHtml.split('</div>\n    ').filter(l => l.includes('class="label"'))
  // Reconstruct — simpler approach: just wrap all in one grid, CSS handles page breaks
  return `<div class="grid">${allLabelsHtml}</div>`
}

function esc(s) {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
