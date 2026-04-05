import { jsPDF } from 'jspdf'

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

async function fetchHighResImage(url) {
  try {
    // Method 1: Fetch as blob and convert
    // Bypass service worker cache by adding cache-bust param
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
    let w = img.width, h = img.height
    // Limit to 3000px to avoid canvas memory issues
    const maxDim = 3000
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)
    }
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), width: w, height: h }
  } catch (err) {
    console.error('fetchHighResImage failed:', err, 'URL:', url)
    // Method 2: Try using the image element directly with the URL
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      let w = img.width, h = img.height
      const maxDim = 2000
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      return { dataUrl: c.toDataURL('image/jpeg', 0.85), width: w, height: h }
    } catch (err2) {
      console.error('fetchHighResImage fallback also failed:', err2)
      return null
    }
  }
}

export async function generateProgressPDF({ drawing, project, items, companyName }) {
  const doc = new jsPDF('l', 'mm', 'a4') // landscape
  const pageW = 297
  const pageH = 210
  const margin = 8

  // Stats
  const total = items.length
  const greenCount = items.filter(i => i.status === 'green').length
  const yellowCount = items.filter(i => i.status === 'yellow').length
  const redCount = items.filter(i => i.status === 'red').length
  const pctGreen = total > 0 ? Math.round((greenCount / total) * 100) : 0
  const pctYellow = total > 0 ? Math.round((yellowCount / total) * 100) : 0
  const pctRed = total > 0 ? Math.round((redCount / total) * 100) : 0

  // Header bar — CoreSite design system
  doc.setFillColor(27, 42, 61)
  doc.rect(0, 0, pageW, 14, 'F')
  // Logo crosshair
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.3)
  doc.circle(12, 7, 4, 'D')
  doc.setFillColor(255, 255, 255)
  doc.circle(12, 7, 1, 'F')
  doc.line(12, 2.5, 12, 4.5); doc.line(12, 9.5, 12, 11.5)
  doc.line(7.5, 7, 9.5, 7); doc.line(14.5, 7, 16.5, 7)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`${companyName || 'Company'} — ${drawing.name}`, margin, 9)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.drawing_number || ''} ${drawing.revision ? 'Rev ' + drawing.revision : ''} | ${drawing.trade || ''} | ${drawing.floor_level || ''} | ${new Date().toLocaleDateString('en-GB')}`, pageW - margin, 9, { align: 'right' })

  // Progress bar below header
  const barY = 16
  const barH = 5
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
  const statsY = barY + barH + 3
  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  if (total > 0) {
    const gW = (greenCount / total) * barW
    const yW = (yellowCount / total) * barW
    const rW = (redCount / total) * barW

    // Green label — centred under green segment
    if (greenCount > 0) {
      const gMid = margin + gW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.green)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.green}: ${greenCount} (${pctGreen}%)`, gMid, statsY, { align: 'center' })
    }

    // Yellow label — centred under yellow segment
    if (yellowCount > 0) {
      const yMid = margin + gW + yW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.yellow)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.yellow}: ${yellowCount} (${pctYellow}%)`, yMid, statsY, { align: 'center' })
    }

    // Red label — centred under red segment
    if (redCount > 0) {
      const rMid = margin + gW + yW + rW / 2
      doc.setTextColor(...STATUS_COLORS_RGB.red)
      doc.setFont('helvetica', 'bold')
      doc.text(`${STATUS_LABELS.red}: ${redCount} (${pctRed}%)`, rMid, statsY, { align: 'center' })
    }
  }
  // Total on far right
  doc.setTextColor(26, 26, 46)
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total: ${total} items | ${pctGreen}% Complete`, pageW - margin, statsY, { align: 'right' })

  // Drawing image — high res
  const drawingStartY = statsY + 4
  const drawingAvailH = pageH - drawingStartY - 12
  const imgData = drawing.image_url ? await fetchHighResImage(drawing.image_url) : null

  if (imgData) {
    const ratio = imgData.width / imgData.height
    let imgW = pageW - margin * 2
    let imgH = imgW / ratio
    if (imgH > drawingAvailH) { imgH = drawingAvailH; imgW = imgH * ratio }
    const imgX = margin + ((pageW - margin * 2) - imgW) / 2
    const imgY = drawingStartY

    doc.addImage(imgData.dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

    // Overlay items with transparency via GState
    const gState = doc.GState({ opacity: 0.55 })

    for (const item of items) {
      const color = STATUS_COLORS_RGB[item.status] || [176, 184, 201]

      if (item.label === 'line' && item.notes) {
        try {
          const { x1, y1, x2, y2 } = JSON.parse(item.notes)
          doc.saveGraphicsState()
          doc.setGState(gState)
          doc.setDrawColor(...color)
          doc.setLineWidth(0.6)
          doc.line(
            imgX + (x1 / 100) * imgW, imgY + (y1 / 100) * imgH,
            imgX + (x2 / 100) * imgW, imgY + (y2 / 100) * imgH
          )
          doc.restoreGraphicsState()
        } catch {}
      } else if (item.label === 'polyline' && item.notes) {
        try {
          const { points } = JSON.parse(item.notes)
          doc.saveGraphicsState()
          doc.setGState(gState)
          doc.setDrawColor(...color)
          doc.setLineWidth(0.6)
          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1], p2 = points[i]
            doc.line(
              imgX + (p1.x / 100) * imgW, imgY + (p1.y / 100) * imgH,
              imgX + (p2.x / 100) * imgW, imgY + (p2.y / 100) * imgH
            )
          }
          doc.restoreGraphicsState()
        } catch {}
      } else if (item.label === 'circle' && item.notes) {
        try {
          const { radius } = JSON.parse(item.notes)
          const px = imgX + (item.pin_x / 100) * imgW
          const py = imgY + (item.pin_y / 100) * imgH
          const r = Math.max(1, (radius || 16) / 100 * imgW * 0.5)
          doc.saveGraphicsState()
          doc.setGState(gState)
          doc.setDrawColor(...color)
          doc.setLineWidth(0.4)
          doc.circle(px, py, Math.min(r, 15), 'D')
          doc.restoreGraphicsState()
        } catch {}
      } else if ((item.label === 'text' || item.label === 'comment') && item.notes) {
        try {
          const { text, fontSize } = JSON.parse(item.notes)
          if (text) {
            const px = imgX + (item.pin_x / 100) * imgW
            const py = imgY + (item.pin_y / 100) * imgH
            doc.setTextColor(...color)
            doc.setFontSize(Math.max(4, Math.min((fontSize || 12) * 0.4, 10)))
            doc.setFont('helvetica', 'bold')
            doc.text(text, px, py)
          }
        } catch {}
      } else {
        // Dot or photo
        const px = imgX + (item.pin_x / 100) * imgW
        const py = imgY + (item.pin_y / 100) * imgH
        let dotR = 1
        try { const p = JSON.parse(item.notes || '{}'); if (p.size) dotR = Math.max(0.5, p.size * 0.08) } catch {}
        doc.saveGraphicsState()
        doc.setGState(gState)
        doc.setFillColor(...color)
        doc.circle(px, py, dotR, 'F')
        doc.restoreGraphicsState()
      }
    }
  } else {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(12)
    doc.text('[Drawing image could not be loaded]', pageW / 2, pageH / 2, { align: 'center' })
  }

  // Legend at bottom
  const legendY = pageH - 8
  doc.setFillColor(250, 250, 252)
  doc.rect(0, legendY - 3, pageW, 11, 'F')
  doc.setDrawColor(226, 230, 234)
  doc.line(0, legendY - 3, pageW, legendY - 3)

  doc.setTextColor(26, 26, 46)
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.text('LEGEND:', margin, legendY + 1)

  let lx = margin + 16
  Object.entries(STATUS_COLORS_RGB).forEach(([status, rgb]) => {
    doc.setFillColor(...rgb)
    doc.circle(lx, legendY, 2, 'F')
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.text(`= ${STATUS_LABELS[status]}`, lx + 4, legendY + 1)
    lx += 50
  })

  // Footer
  doc.setTextColor(180, 180, 180)
  doc.setFontSize(5)
  doc.text('CoreSite — Site Compliance Platform', pageW - margin, legendY + 1, { align: 'right' })

  const fileName = `Progress - ${drawing.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
