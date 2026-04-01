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

async function fetchAndCompressImage(url, maxDim = 1600, quality = 0.65) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const rawUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob) })
    const img = new Image()
    await new Promise(r => { img.onload = r; img.src = rawUrl })
    let w = img.width, h = img.height
    if (w > maxDim || h > maxDim) { const ratio = Math.min(maxDim / w, maxDim / h); w = Math.round(w * ratio); h = Math.round(h * ratio) }
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return { dataUrl: c.toDataURL('image/jpeg', quality), width: w, height: h, img }
  } catch { return null }
}

export async function generateProgressPDF({ drawing, project, items, companyName, companyLogo }) {
  const doc = new jsPDF('l', 'mm', 'a4') // landscape
  const pageW = 297
  const pageH = 210
  const margin = 10

  // === PAGE 1: Drawing with items overlaid ===

  // Header
  doc.setFillColor(13, 21, 38)
  doc.rect(0, 0, pageW, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`${companyName || 'Company'} — M&E Progress Drawing`, margin, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.name} | ${drawing.drawing_number || ''} Rev ${drawing.revision || ''} | ${new Date().toLocaleDateString('en-GB')}`, pageW - margin, 12, { align: 'right' })

  // Stats summary
  const total = items.length
  const greenCount = items.filter(i => i.status === 'green').length
  const yellowCount = items.filter(i => i.status === 'yellow').length
  const redCount = items.filter(i => i.status === 'red').length
  const pctGreen = total > 0 ? Math.round((greenCount / total) * 100) : 0
  const pctYellow = total > 0 ? Math.round((yellowCount / total) * 100) : 0
  const pctRed = total > 0 ? Math.round((redCount / total) * 100) : 0

  // Drawing image
  const imgData = drawing.image_url ? await fetchAndCompressImage(drawing.image_url) : null
  const drawingStartY = 22
  const drawingH = pageH - drawingStartY - 25 // leave room for legend

  if (imgData) {
    const ratio = imgData.width / imgData.height
    let imgW = pageW - margin * 2
    let imgH = imgW / ratio
    if (imgH > drawingH) { imgH = drawingH; imgW = imgH * ratio }
    const imgX = margin + ((pageW - margin * 2) - imgW) / 2
    const imgY = drawingStartY

    doc.addImage(imgData.dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

    // Overlay items
    for (const item of items) {
      const color = STATUS_COLORS_RGB[item.status] || [176, 184, 201]
      const px = imgX + (item.pin_x / 100) * imgW
      const py = imgY + (item.pin_y / 100) * imgH

      if (item.label === 'line' && item.notes) {
        try {
          const { x1, y1, x2, y2 } = JSON.parse(item.notes)
          const lx1 = imgX + (x1 / 100) * imgW, ly1 = imgY + (y1 / 100) * imgH
          const lx2 = imgX + (x2 / 100) * imgW, ly2 = imgY + (y2 / 100) * imgH
          doc.setDrawColor(...color)
          doc.setLineWidth(0.8)
          doc.line(lx1, ly1, lx2, ly2)
        } catch {}
      } else if (item.label === 'polyline' && item.notes) {
        try {
          const { points } = JSON.parse(item.notes)
          doc.setDrawColor(...color)
          doc.setLineWidth(0.8)
          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1], p2 = points[i]
            doc.line(
              imgX + (p1.x / 100) * imgW, imgY + (p1.y / 100) * imgH,
              imgX + (p2.x / 100) * imgW, imgY + (p2.y / 100) * imgH
            )
          }
        } catch {}
      } else if (item.label === 'photo') {
        doc.setFillColor(...color)
        doc.circle(px, py, 1.5, 'F')
        doc.setDrawColor(255, 255, 255)
        doc.circle(px, py, 1.5, 'D')
      } else {
        // Dot
        doc.setFillColor(color[0], color[1], color[2])
        doc.circle(px, py, 1.2, 'F')
      }
    }
  } else {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(12)
    doc.text('[Drawing image could not be loaded]', pageW / 2, pageH / 2, { align: 'center' })
  }

  // Legend bar at bottom
  const legendY = pageH - 18
  doc.setFillColor(245, 246, 248)
  doc.rect(0, legendY - 4, pageW, 22, 'F')
  doc.setDrawColor(226, 230, 234)
  doc.line(0, legendY - 4, pageW, legendY - 4)

  // Legend title
  doc.setTextColor(26, 26, 46)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('LEGEND', margin, legendY + 2)

  // Legend items
  let lx = margin + 20
  Object.entries(STATUS_COLORS_RGB).forEach(([status, rgb]) => {
    doc.setFillColor(...rgb)
    doc.circle(lx, legendY + 1, 2.5, 'F')
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(STATUS_LABELS[status], lx + 5, legendY + 2.5)
    lx += 55
  })

  // Stats on right side of legend
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 46)
  doc.text(`Total: ${total}`, pageW - margin - 90, legendY + 2)

  doc.setFillColor(...STATUS_COLORS_RGB.green)
  doc.circle(pageW - margin - 72, legendY + 1, 1.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.text(`${greenCount} (${pctGreen}%)`, pageW - margin - 68, legendY + 2.5)

  doc.setFillColor(...STATUS_COLORS_RGB.yellow)
  doc.circle(pageW - margin - 48, legendY + 1, 1.5, 'F')
  doc.text(`${yellowCount} (${pctYellow}%)`, pageW - margin - 44, legendY + 2.5)

  doc.setFillColor(...STATUS_COLORS_RGB.red)
  doc.circle(pageW - margin - 24, legendY + 1, 1.5, 'F')
  doc.text(`${redCount} (${pctRed}%)`, pageW - margin - 20, legendY + 2.5)

  // Footer
  doc.setTextColor(180, 180, 180)
  doc.setFontSize(5)
  doc.text('CoreSite — Site Compliance Platform', margin, pageH - 3)
  doc.text(`Page 1`, pageW - margin, pageH - 3, { align: 'right' })

  // === PAGE 2: Summary table ===
  doc.addPage('a4', 'p')
  const pW = 210, pH = 297

  // Header
  doc.setFillColor(13, 21, 38)
  doc.rect(0, 0, pW, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Progress Summary', 15, 12)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.name} | ${new Date().toLocaleDateString('en-GB')}`, pW - 15, 12, { align: 'right' })

  let y = 28

  // Project info
  doc.setTextColor(26, 26, 46)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Project: ${project?.name || 'N/A'}`, 15, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Drawing: ${drawing.name}`, 15, y + 6)
  doc.text(`Number: ${drawing.drawing_number || 'N/A'} Rev ${drawing.revision || 'N/A'}`, 15, y + 11)
  doc.text(`Trade: ${drawing.trade || 'N/A'} | Floor: ${drawing.floor_level || 'N/A'}`, 15, y + 16)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 15, y + 21)
  y += 30

  // Progress bar visual
  doc.setFillColor(245, 246, 248)
  doc.rect(15, y, 180, 14, 'F')
  const barW = 180
  if (total > 0) {
    const gW = (greenCount / total) * barW
    const yW = (yellowCount / total) * barW
    const rW = (redCount / total) * barW
    if (gW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.green); doc.rect(15, y + 2, gW, 10, 'F') }
    if (yW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.yellow); doc.rect(15 + gW, y + 2, yW, 10, 'F') }
    if (rW > 0) { doc.setFillColor(...STATUS_COLORS_RGB.red); doc.rect(15 + gW + yW, y + 2, rW, 10, 'F') }
  }
  y += 20

  // Legend
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 46)
  doc.text('Status Breakdown:', 15, y)
  y += 6

  Object.entries(STATUS_COLORS_RGB).forEach(([status, rgb]) => {
    const count = items.filter(i => i.status === status).length
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    doc.setFillColor(...rgb)
    doc.circle(18, y, 2, 'F')
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${STATUS_LABELS[status]}: ${count} items (${pct}%)`, 23, y + 1.5)
    y += 7
  })

  y += 8

  // Items table
  doc.setFillColor(13, 21, 38)
  doc.rect(15, y, 180, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('#', 17, y + 5.5)
  doc.text('Type', 27, y + 5.5)
  doc.text('Status', 52, y + 5.5)
  doc.text('Label / Notes', 82, y + 5.5)
  doc.text('Created By', 145, y + 5.5)
  doc.text('Date', 175, y + 5.5)
  y += 10

  items.forEach((item, i) => {
    if (y > 280) {
      doc.addPage('a4', 'p')
      y = 20
      doc.setFillColor(13, 21, 38)
      doc.rect(15, y, 180, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('#', 17, y + 5.5)
      doc.text('Type', 27, y + 5.5)
      doc.text('Status', 52, y + 5.5)
      doc.text('Label / Notes', 82, y + 5.5)
      doc.text('Created By', 145, y + 5.5)
      doc.text('Date', 175, y + 5.5)
      y += 10
    }

    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 252)
      doc.rect(15, y - 2, 180, 7, 'F')
    }

    const color = STATUS_COLORS_RGB[item.status] || [176, 184, 201]

    doc.setTextColor(80, 80, 80)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`${item.item_number}`, 17, y + 3)
    doc.text(item.label === 'line' ? 'Line' : item.label === 'polyline' ? 'Polyline' : item.label === 'photo' ? 'Photo' : 'Dot', 27, y + 3)

    // Status badge
    doc.setFillColor(...color)
    doc.roundedRect(52, y, 20, 5, 1, 1, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'bold')
    doc.text(STATUS_LABELS[item.status]?.split(' ')[0] || item.status, 62, y + 3.5, { align: 'center' })

    doc.setTextColor(80, 80, 80)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    const noteText = item.label === 'photo' ? (item.notes || 'Photo') : (item.notes?.substring(0, 40) || '—')
    doc.text(noteText, 82, y + 3)
    doc.text(item.created_by || '—', 145, y + 3)
    doc.text(item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB') : '—', 175, y + 3)

    y += 7
  })

  // Footer on last page
  doc.setTextColor(180, 180, 180)
  doc.setFontSize(5)
  doc.text('CoreSite — Site Compliance Platform', 15, 290)
  doc.text(`Page ${doc.getNumberOfPages()}`, pW - 15, 290, { align: 'right' })

  const fileName = `Progress - ${drawing.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
