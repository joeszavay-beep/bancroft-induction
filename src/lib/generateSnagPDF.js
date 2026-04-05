import { jsPDF } from 'jspdf'

const STATUS_COLORS = {
  open: [239, 68, 68],
  completed: [34, 197, 94],
  closed: [156, 163, 175],
  reassigned: [245, 158, 11],
}

async function fetchImageAsDataUrl(url) {
  try {
    const bustUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now()
    const res = await fetch(bustUrl)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const blob = await res.blob()
    // Compress by drawing to canvas at reduced size
    const origUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!origUrl) return null
    // Downscale large images
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const maxDim = 800
        let w = img.width, h = img.height
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.6))
      }
      img.onerror = () => resolve(origUrl)
      img.src = origUrl
    })
  } catch { return null }
}

function generateLocationMapDataUrl(img, pinX, pinY, snagNumber) {
  const canvas = document.createElement('canvas')
  const size = 200
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const cropW = img.width * 0.2
  const cropH = img.height * 0.2
  let sx = (pinX / 100) * img.width - cropW / 2
  let sy = (pinY / 100) * img.height - cropH / 2
  sx = Math.max(0, Math.min(sx, img.width - cropW))
  sy = Math.max(0, Math.min(sy, img.height - cropH))

  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, size, size)

  const mx = ((pinX / 100) * img.width - sx) / cropW * size
  const my = ((pinY / 100) * img.height - sy) / cropH * size

  // Red crosshair
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(mx, my, 16, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(mx - 24, my); ctx.lineTo(mx + 24, my)
  ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my + 24)
  ctx.stroke()
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(mx, my, 4, 0, Math.PI * 2)
  ctx.fill()

  return canvas.toDataURL('image/jpeg', 0.5)
}

export async function generateSnagPDF({ drawing, project, snags, imageUrl, options }) {
  const doc = new jsPDF('l', 'mm', 'a4') // landscape for drawing
  const pageW = 297
  const pageH = 210
  const margin = 10
  const contentW = pageW - margin * 2
  const contentH = pageH - margin * 2

  // === PAGE 1: Drawing with pins ===
  // Header — CoreSite design system
  doc.setFillColor(27, 42, 61) // navy
  doc.rect(0, 0, pageW, 18, 'F')
  // Logo crosshair
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.4)
  doc.circle(14, 9, 5, 'D')
  doc.setFillColor(255, 255, 255)
  doc.circle(14, 9, 1.5, 'F')
  doc.line(14, 3, 14, 6); doc.line(14, 12, 14, 15)
  doc.line(8, 9, 11, 9); doc.line(17, 9, 20, 9)
  // Wordmark
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('CORE', 22, 7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('SITE', 22, 11.5)
  // Centre text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Snag report', pageW / 2, 8, { align: 'center' })
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.name} | ${drawing.drawing_number || ''} Rev ${drawing.revision || ''}`, pageW / 2, 13, { align: 'center' })
  // Right — project
  doc.setFontSize(8)
  doc.text(project?.name || '', pageW - margin, 10, { align: 'right' })

  // Draw the image (compressed for PDF)
  let drawingH = contentH - 15
  if (imageUrl) {
    try {
      // Fetch and compress drawing for page 1
      const response = await fetch(imageUrl + (imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now())
      if (!response.ok) throw new Error(`Drawing fetch failed: ${response.status}`)
      const blob = await response.blob()
      const rawUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      const img = new Image()
      await new Promise((resolve) => { img.onload = resolve; img.src = rawUrl })

      // Downscale to max 1600px for page 1
      const maxP1 = 1600
      let cw = img.width, ch = img.height
      if (cw > maxP1 || ch > maxP1) {
        const r = Math.min(maxP1 / cw, maxP1 / ch)
        cw = Math.round(cw * r); ch = Math.round(ch * r)
      }
      const compCanvas = document.createElement('canvas')
      compCanvas.width = cw; compCanvas.height = ch
      compCanvas.getContext('2d').drawImage(img, 0, 0, cw, ch)
      const dataUrl = compCanvas.toDataURL('image/jpeg', 0.65)

      const ratio = img.width / img.height
      let imgW = contentW
      let imgH = imgW / ratio
      if (imgH > drawingH) {
        imgH = drawingH
        imgW = imgH * ratio
      }
      const imgX = margin + (contentW - imgW) / 2
      const imgY = 24

      doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

      // Draw pins on top
      for (const snag of snags) {
        const pinX = imgX + (snag.pin_x / 100) * imgW
        const pinY = imgY + (snag.pin_y / 100) * imgH
        const color = STATUS_COLORS[snag.status] || STATUS_COLORS.open
        doc.setFillColor(...color)
        doc.circle(pinX, pinY, 2.5, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(5)
        doc.setFont('helvetica', 'bold')
        doc.text(`${snag.snag_number}`, pinX, pinY + 1, { align: 'center' })
      }
    } catch (e) {
      doc.setTextColor(150, 150, 150)
      doc.setFontSize(12)
      doc.text('[Drawing image could not be loaded]', pageW / 2, pageH / 2, { align: 'center' })
    }
  }

  // Legend
  const legendY = pageH - 8
  doc.setFontSize(6)
  let legendX = margin
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    doc.setFillColor(...color)
    doc.circle(legendX + 1.5, legendY, 1.5, 'F')
    doc.setTextColor(80, 80, 80)
    doc.text(status.charAt(0).toUpperCase() + status.slice(1), legendX + 5, legendY + 0.5)
    legendX += 25
  }
  doc.setTextColor(180, 180, 180)
  doc.text('CoreSite — Site Compliance Platform', pageW - margin, legendY + 0.5, { align: 'right' })

  // === Load drawing image for location maps ===
  let drawingImg = null
  if (imageUrl) {
    try {
      const drawingDataUrl = await fetchImageAsDataUrl(imageUrl)
      if (drawingDataUrl) {
        drawingImg = new Image()
        await new Promise((resolve, reject) => {
          drawingImg.onload = resolve
          drawingImg.onerror = reject
          drawingImg.src = drawingDataUrl
        })
      }
    } catch { drawingImg = null }
  }

  // === SUBSEQUENT PAGES: Snag details (2 per page) ===
  doc.setFont('helvetica', 'normal')

  for (let i = 0; i < snags.length; i++) {
    const snag = snags[i]

    if (i % 2 === 0) {
      doc.addPage('a4', 'p')
      doc.setFillColor(27, 42, 61)
      doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`${project?.name} — ${drawing.name}`, 10, 10)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(`${drawing.drawing_number || ''} Rev ${drawing.revision || ''} | ${new Date().toLocaleDateString()}`, 200, 10, { align: 'right' })
    }

    const yOffset = 22 + (i % 2) * 130
    const cardW = 190
    let y = yOffset
    const cardH = 124

    // Card border with status colour
    const color = STATUS_COLORS[snag.status] || STATUS_COLORS.open
    doc.setDrawColor(...color)
    doc.setLineWidth(0.8)
    doc.rect(10, y - 2, cardW, cardH, 'D')
    doc.setFillColor(...color)
    doc.rect(10, y - 2, 3, cardH, 'F')

    // Snag number and status badges
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`#${snag.snag_number}`, 16, y + 7)

    doc.setFillColor(...color)
    doc.roundedRect(38, y + 1.5, 22, 6, 1, 1, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(snag.status.toUpperCase(), 49, y + 5.5, { align: 'center' })

    if (snag.priority) {
      const priColor = snag.priority === 'high' ? [239, 68, 68] : snag.priority === 'medium' ? [245, 158, 11] : [59, 130, 246]
      doc.setFillColor(...priColor)
      doc.roundedRect(63, y + 1.5, 16, 6, 1, 1, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(snag.priority.toUpperCase(), 71, y + 5.5, { align: 'center' })
    }

    // Trade and type
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${snag.trade || ''} ${snag.type ? '· ' + snag.type : ''}`, 16, y + 15)

    // Description
    doc.setTextColor(50, 50, 50)
    doc.setFontSize(9)
    const maxDescW = 100
    const descLines = doc.splitTextToSize(snag.description || 'No description', maxDescW)
    doc.text(descLines.slice(0, 5), 16, y + 23)

    // Photo (right side, top)
    const imgX = 130
    let photoLoaded = false
    if (snag.photo_url) {
      const photoDataUrl = await fetchImageAsDataUrl(snag.photo_url)
      if (photoDataUrl) {
        try {
          doc.addImage(photoDataUrl, 'JPEG', imgX, y + 2, 66, 44)
          doc.setTextColor(150, 150, 150)
          doc.setFontSize(5)
          doc.text('Photo', imgX, y + 48)
          photoLoaded = true
        } catch {}
      }
    }

    // Location map (right side, below photo or at photo position if no photo)
    if (drawingImg) {
      const locMapDataUrl = generateLocationMapDataUrl(drawingImg, snag.pin_x, snag.pin_y, snag.snag_number)
      const locY = photoLoaded ? y + 52 : y + 2
      const locSize = photoLoaded ? 40 : 50
      try {
        doc.addImage(locMapDataUrl, 'JPEG', imgX, locY, locSize, locSize)
        // Border around location map
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.3)
        doc.rect(imgX, locY, locSize, locSize, 'D')
        doc.setTextColor(150, 150, 150)
        doc.setFontSize(5)
        doc.text(`Location — Pin #${snag.snag_number}`, imgX, locY + locSize + 3)
      } catch {}
    }

    // Meta info
    const metaY = y + 70
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.setFont('helvetica', 'bold')
    doc.text('Assigned To:', 16, metaY)
    doc.text('Raised By:', 16, metaY + 6)
    doc.text('Due Date:', 16, metaY + 12)
    doc.text('Created:', 16, metaY + 18)
    doc.text('Location:', 16, metaY + 24)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    doc.text(snag.assigned_to || 'Unassigned', 46, metaY)
    doc.text(snag.raised_by || 'Unknown', 46, metaY + 6)
    const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
    if (isOverdue) doc.setTextColor(239, 68, 68)
    doc.text((snag.due_date ? new Date(snag.due_date).toLocaleDateString() : 'Not set') + (isOverdue ? ' — OVERDUE' : ''), 46, metaY + 12)
    doc.setTextColor(50, 50, 50)
    doc.text(new Date(snag.created_at).toLocaleDateString(), 46, metaY + 18)
    doc.text(drawing.level_ref || drawing.name, 46, metaY + 24)

    // Footer
    if (i % 2 === 1 || i === snags.length - 1) {
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(6)
      doc.text('CoreSite — Site Compliance Platform', 10, 290)
      doc.text(`Page ${doc.getNumberOfPages()}`, 200, 290, { align: 'right' })
    }
  }

  const fileName = `Snag Report - ${drawing.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  if (options?.returnBlob) {
    return doc.output('blob')
  }
  doc.save(fileName)
}

export async function generateSnagPDFBlob(params) {
  return generateSnagPDF({ ...params, options: { returnBlob: true } })
}
