import { jsPDF } from 'jspdf'
import { loadLogoImage } from './reportTemplate'

const STATUS_COLORS_RGB = {
  green: [46, 160, 67],
  yellow: [210, 153, 34],
  red: [218, 54, 51],
}
const STATUS_LABELS = {
  green: 'Installed / Completed',
  yellow: 'Available Works',
  red: 'Not Available',
}

async function fetchHighResImage(url, maxDim = 5000) {
  try {
    const bustUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now()
    const res = await fetch(bustUrl)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const blob = await res.blob()
    const rawUrl = await new Promise((resolve, reject) => {
      const rd = new FileReader()
      rd.onload = () => resolve(rd.result)
      rd.onerror = reject
      rd.readAsDataURL(blob)
    })
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = rawUrl
    })
    const naturalW = img.width, naturalH = img.height
    let w = naturalW, h = naturalH
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)
    }
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), width: w, height: h, naturalWidth: naturalW, naturalHeight: naturalH }
  } catch (err) {
    console.error('fetchHighResImage failed:', err, 'URL:', url)
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const naturalW = img.width, naturalH = img.height
      let w = naturalW, h = naturalH
      const fallbackMax = Math.max(3000, maxDim - 1500)
      if (w > fallbackMax || h > fallbackMax) {
        const ratio = Math.min(fallbackMax / w, fallbackMax / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      return { dataUrl: c.toDataURL('image/jpeg', 0.92), width: w, height: h, naturalWidth: naturalW, naturalHeight: naturalH }
    } catch (err2) {
      console.error('fetchHighResImage fallback also failed:', err2)
      return null
    }
  }
}

export async function generateProgressPDF({ drawing, items, companyName, branding, pageSize = 'a1' }) {
  const doc = new jsPDF('l', 'mm', pageSize)
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 8

  // Calculate image resolution target: ~250 DPI, capped at 6000px for browser memory
  const targetMaxDim = Math.max(3000, Math.min(Math.round(pageW / 25.4 * 250), 6000))

  // Pre-load logo if branding is provided
  if (branding?.logoUrl && !branding.logoDataUrl) {
    branding.logoDataUrl = await loadLogoImage(branding.logoUrl)
  }
  const accent = branding?.accentColor || [27, 42, 61]

  // Stats
  const total = items.length
  const greenCount = items.filter(i => i.status === 'green').length
  const yellowCount = items.filter(i => i.status === 'yellow').length
  const redCount = items.filter(i => i.status === 'red').length
  const pctGreen = total > 0 ? Math.round((greenCount / total) * 100) : 0
  const pctYellow = total > 0 ? Math.round((yellowCount / total) * 100) : 0
  const pctRed = total > 0 ? Math.round((redCount / total) * 100) : 0

  // Scale header/footer proportionally to page size (reference: A4 landscape 297mm)
  const uiScale = pageW / 297

  // Header bar
  const headerH = 14 * uiScale
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageW, headerH, 'F')

  const logoSize = 12 * uiScale
  const logoX = 4 * uiScale
  const logoY = 1 * uiScale
  const textStartX = logoX + logoSize + 2 * uiScale

  if (branding?.logoDataUrl) {
    try { doc.addImage(branding.logoDataUrl, 'PNG', logoX, logoY, logoSize, logoSize) } catch { /* ignore */ }
  } else {
    // Logo crosshair
    const cx = logoX + logoSize / 2, cy = logoY + logoSize / 2
    const r = logoSize / 3
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.3 * uiScale)
    doc.circle(cx, cy, r, 'D')
    doc.setFillColor(255, 255, 255)
    doc.circle(cx, cy, r * 0.25, 'F')
    doc.line(cx, cy - r * 1.12, cx, cy - r * 0.62)
    doc.line(cx, cy + r * 0.62, cx, cy + r * 1.12)
    doc.line(cx - r * 1.12, cy, cx - r * 0.62, cy)
    doc.line(cx + r * 0.62, cy, cx + r * 1.12, cy)
  }
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9 * uiScale)
  doc.setFont('helvetica', 'bold')
  doc.text(`${companyName || 'Company'} \u2014 ${drawing.name}`, textStartX, headerH * 0.64)
  doc.setFontSize(7 * uiScale)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.drawing_number || ''} ${drawing.revision ? 'Rev ' + drawing.revision : ''} | ${drawing.trade || ''} | ${drawing.floor_level || ''} | ${new Date().toLocaleDateString('en-GB')}`, pageW - margin, headerH * 0.64, { align: 'right' })

  // Progress bar below header
  const barY = headerH + 2 * uiScale
  const barH = 5 * uiScale
  const barW = pageW - margin * 2
  doc.setFillColor(240, 240, 242)
  doc.rect(margin, barY, barW, barH, 'F')
  if (total > 0) {
    const gW = (greenCount / total) * barW
    const yW = (yellowCount / total) * barW
    const rW = (redCount / total) * barW
    if (gW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.green); doc.rect(margin, barY, gW, barH, 'F') }
    if (yW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.yellow); doc.rect(margin + gW, barY, yW, barH, 'F') }
    if (rW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.red); doc.rect(margin + gW + yW, barY, rW, barH, 'F') }
  }

  // Stats text positioned under each bar segment
  const statsY = barY + barH + 3 * uiScale
  doc.setFontSize(5.5 * uiScale)
  doc.setFont('helvetica', 'normal')
  if (total > 0) {
    const gW = (greenCount / total) * barW
    const yW = (yellowCount / total) * barW
    const rW = (redCount / total) * barW

    if (greenCount > 0) {
      const gMid = margin + gW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.green)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.green}: ${greenCount} (${pctGreen}%)`, gMid, statsY, { align: 'center' })
    }
    if (yellowCount > 0) {
      const yMid = margin + gW + yW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.yellow)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.yellow}: ${yellowCount} (${pctYellow}%)`, yMid, statsY, { align: 'center' })
    }
    if (redCount > 0) {
      const rMid = margin + gW + yW + rW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.red)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.red}: ${redCount} (${pctRed}%)`, rMid, statsY, { align: 'center' })
    }
  }
  doc.setTextColor(26, 26, 46)
  doc.setFontSize(6 * uiScale)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total: ${total} items | ${pctGreen}% Complete`, pageW - margin, statsY, { align: 'right' })

  // Drawing image — high res
  const drawingStartY = statsY + 4 * uiScale
  const legendH = 11 * uiScale
  const drawingAvailH = pageH - drawingStartY - legendH
  const imgData = drawing.image_url ? await fetchHighResImage(drawing.image_url, targetMaxDim) : null

  if (imgData) {
    const ratio = imgData.width / imgData.height
    let imgW = pageW - margin * 2
    let imgH = imgW / ratio
    if (imgH > drawingAvailH) { imgH = drawingAvailH; imgW = imgH * ratio }
    const imgX = margin + ((pageW - margin * 2) - imgW) / 2
    const imgY = drawingStartY

    doc.addImage(imgData.dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

    // Convert stored pixel values to mm using the image's NATURAL dimensions
    // Live view: renderScale = clientWidth / naturalWidth, strokeWidth = stored * renderScale
    // As fraction of image width: stored / naturalWidth
    // PDF equivalent: stored * (imgW_mm / naturalWidth_px) = mm in the PDF
    const pxToMm = imgW / (imgData.naturalWidth || imgData.width)
    console.log('[PDF Export] Image natural:', imgData.naturalWidth, 'x', imgData.naturalHeight, '| canvas:', imgData.width, 'x', imgData.height, '| PDF:', imgW.toFixed(1), 'x', imgH.toFixed(1), 'mm | pxToMm:', pxToMm.toFixed(4))

    // Match SVG rendering: round line caps, proportional opacity
    doc.setLineCap(1) // 1 = round cap (matches SVG strokeLinecap="round")
    // PDF renderers show GState opacity more solidly than SVG strokeOpacity —
    // lowered to match the visual appearance in the live view
    const lineGState = doc.GState({ opacity: 0.35 })
    const dotGState = doc.GState({ opacity: 0.30 })

    for (const item of items) {
      const color = STATUS_COLORS_RGB[item.status] || [176, 184, 201]

      // Parse stored size/width from notes (matches live view parsing)
      let storedWidth = 4
      let storedSize = 16
      try {
        if (item.notes) {
          const parsed = JSON.parse(item.notes)
          if (parsed.width) storedWidth = parsed.width
          if (parsed.size) storedSize = parsed.size
        }
      } catch { /* ignore */ }

      // Line width in mm — match the live view's rendering:
      // Live: strokeWidth = storedWidth * (clientWidth / naturalWidth) CSS pixels
      // That's storedWidth / naturalWidth fraction of the image width
      // PDF: same fraction * imgW = storedWidth * pxToMm mm
      const lineW = Math.max(0.15, storedWidth * pxToMm)

      if (item.label === 'line' && item.notes) {
        try {
          const { x1, y1, x2, y2 } = JSON.parse(item.notes)
          doc.saveGraphicsState()
          doc.setGState(lineGState)
          doc.setDrawColor(...color)
          doc.setLineWidth(lineW)
          doc.line(
            imgX + (x1 / 100) * imgW, imgY + (y1 / 100) * imgH,
            imgX + (x2 / 100) * imgW, imgY + (y2 / 100) * imgH
          )
          doc.restoreGraphicsState()
        } catch { /* ignore */ }
      } else if (item.label === 'polyline' && item.notes) {
        try {
          const { points } = JSON.parse(item.notes)
          doc.saveGraphicsState()
          doc.setGState(lineGState)
          doc.setDrawColor(...color)
          doc.setLineWidth(lineW)
          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1], p2 = points[i]
            doc.line(
              imgX + (p1.x / 100) * imgW, imgY + (p1.y / 100) * imgH,
              imgX + (p2.x / 100) * imgW, imgY + (p2.y / 100) * imgH
            )
          }
          doc.restoreGraphicsState()
        } catch { /* ignore */ }
      } else if (item.label === 'circle' && item.notes) {
        try {
          const { radius } = JSON.parse(item.notes)
          const px = imgX + (item.pin_x / 100) * imgW
          const py = imgY + (item.pin_y / 100) * imgH
          const r = Math.max(0.5, (radius || 16) * pxToMm)
          doc.saveGraphicsState()
          doc.setGState(lineGState)
          doc.setDrawColor(...color)
          doc.setLineWidth(Math.max(0.1, lineW * 0.5))
          doc.circle(px, py, r, 'D')
          doc.restoreGraphicsState()
        } catch { /* ignore */ }
      } else if ((item.label === 'text' || item.label === 'comment') && item.notes) {
        try {
          const { text, fontSize } = JSON.parse(item.notes)
          if (text) {
            const px = imgX + (item.pin_x / 100) * imgW
            const py = imgY + (item.pin_y / 100) * imgH
            const fsPt = Math.max(3, (fontSize || 12) * pxToMm * 2.83)
            doc.setTextColor(...color)
            doc.setFontSize(Math.min(fsPt, 14))
            doc.setFont('helvetica', 'bold')
            doc.text(text, px, py)
          }
        } catch { /* ignore */ }
      } else {
        // Dot or photo — storedSize is diameter in px, convert to radius in mm
        const px = imgX + (item.pin_x / 100) * imgW
        const py = imgY + (item.pin_y / 100) * imgH
        const dotR = Math.max(0.2, (storedSize * pxToMm) / 2)
        doc.saveGraphicsState()
        doc.setGState(dotGState)
        doc.setFillColor(...color)
        doc.circle(px, py, dotR, 'F')
        doc.restoreGraphicsState()
      }
    }
  } else {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(12 * uiScale)
    doc.text('[Drawing image could not be loaded]', pageW / 2, pageH / 2, { align: 'center' })
  }

  // Legend at bottom
  const legendY = pageH - 8 * uiScale
  doc.setFillColor(250, 250, 252)
  doc.rect(0, legendY - 3 * uiScale, pageW, legendH, 'F')
  doc.setDrawColor(226, 230, 234)
  doc.line(0, legendY - 3 * uiScale, pageW, legendY - 3 * uiScale)

  doc.setTextColor(26, 26, 46)
  doc.setFontSize(6 * uiScale)
  doc.setFont('helvetica', 'bold')
  doc.text('LEGEND:', margin, legendY + 1 * uiScale)

  let lx = margin + 16 * uiScale
  Object.entries(STATUS_COLORS_RGB).forEach(([status, rgb]) => {
    doc.setFillColor(...rgb)
    doc.circle(lx, legendY, 2 * uiScale, 'F')
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(6 * uiScale)
    doc.setFont('helvetica', 'normal')
    doc.text(`= ${STATUS_LABELS[status]}`, lx + 4 * uiScale, legendY + 1 * uiScale)
    lx += 50 * uiScale
  })

  // Footer
  doc.setTextColor(180, 180, 180)
  doc.setFontSize(5 * uiScale)
  const progressFooter = branding?.footerText
    ? branding.footerText + (branding.showCoreSiteBranding && branding.companyName ? ' \u00B7 Powered by CoreSite' : '')
    : 'CoreSite \u2014 Site Compliance Platform'
  doc.text(progressFooter, pageW - margin, legendY + 1 * uiScale, { align: 'right' })

  const fileName = `Progress - ${drawing.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
