import { jsPDF } from 'jspdf'

const STATUS_COLORS = {
  open: [239, 68, 68],
  completed: [34, 197, 94],
  closed: [156, 163, 175],
  reassigned: [245, 158, 11],
}

export async function generateSnagPDF({ drawing, project, snags, imageUrl }) {
  const doc = new jsPDF('l', 'mm', 'a4') // landscape for drawing
  const pageW = 297
  const pageH = 210
  const margin = 10
  const contentW = pageW - margin * 2
  const contentH = pageH - margin * 2

  // === PAGE 1: Drawing with pins ===
  // Header
  doc.setFillColor(10, 53, 96)
  doc.rect(0, 0, pageW, 20, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`${project?.name || 'Project'} — Snag Report`, margin, 13)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`${drawing.name} | ${drawing.drawing_number || ''} Rev ${drawing.revision || ''} | ${new Date().toLocaleDateString()}`, pageW - margin, 13, { align: 'right' })

  // Draw the image
  let drawingH = contentH - 15
  if (imageUrl) {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })

      // Calculate aspect ratio
      const img = new Image()
      await new Promise((resolve) => { img.onload = resolve; img.src = dataUrl })
      const ratio = img.width / img.height
      let imgW = contentW
      let imgH = imgW / ratio
      if (imgH > drawingH) {
        imgH = drawingH
        imgW = imgH * ratio
      }
      const imgX = margin + (contentW - imgW) / 2
      const imgY = 24

      doc.addImage(dataUrl, 'PNG', imgX, imgY, imgW, imgH)

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
  doc.text('SiteCore — Site Compliance Platform', pageW - margin, legendY + 0.5, { align: 'right' })

  // === SUBSEQUENT PAGES: Snag details ===
  doc.setFont('helvetica', 'normal')

  // Switch to portrait for snag listings
  for (let i = 0; i < snags.length; i++) {
    const snag = snags[i]

    if (i % 3 === 0) {
      doc.addPage('a4', 'p')
      // Page header
      doc.setFillColor(10, 53, 96)
      doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`${project?.name} — ${drawing.name}`, 10, 10)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(`${drawing.drawing_number || ''} Rev ${drawing.revision || ''} | ${new Date().toLocaleDateString()}`, 200, 10, { align: 'right' })
    }

    const yOffset = 22 + (i % 3) * 88
    const cardW = 190
    let y = yOffset

    // Card border
    const color = STATUS_COLORS[snag.status] || STATUS_COLORS.open
    doc.setDrawColor(...color)
    doc.setLineWidth(0.8)
    doc.rect(10, y - 2, cardW, 84, 'D')

    // Status bar
    doc.setFillColor(...color)
    doc.rect(10, y - 2, 3, 84, 'F')

    // Snag number and status
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`#${snag.snag_number}`, 16, y + 6)

    doc.setFillColor(...color)
    doc.roundedRect(35, y + 1, 22, 6, 1, 1, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(snag.status.toUpperCase(), 46, y + 5.5, { align: 'center' })

    // Priority
    if (snag.priority) {
      const priColor = snag.priority === 'high' ? [239, 68, 68] : snag.priority === 'medium' ? [245, 158, 11] : [59, 130, 246]
      doc.setFillColor(...priColor)
      doc.roundedRect(60, y + 1, 16, 6, 1, 1, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(snag.priority.toUpperCase(), 68, y + 5.5, { align: 'center' })
    }

    // Trade and type
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${snag.trade || ''} ${snag.type ? '· ' + snag.type : ''}`, 16, y + 14)

    // Description
    doc.setTextColor(50, 50, 50)
    doc.setFontSize(9)
    const descLines = doc.splitTextToSize(snag.description || 'No description', snag.photo_url ? 110 : cardW - 10)
    doc.text(descLines.slice(0, 4), 16, y + 22)

    // Photo
    if (snag.photo_url) {
      try {
        const response = await fetch(snag.photo_url)
        const blob = await response.blob()
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
        doc.addImage(dataUrl, 'JPEG', 140, y + 2, 56, 42)
      } catch {}
    }

    // Meta info
    const metaY = y + 55
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.setFont('helvetica', 'bold')
    doc.text('Assigned To:', 16, metaY)
    doc.text('Raised By:', 16, metaY + 6)
    doc.text('Due Date:', 100, metaY)
    doc.text('Created:', 100, metaY + 6)
    doc.text('Location:', 16, metaY + 12)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    doc.text(snag.assigned_to || 'Unassigned', 42, metaY)
    doc.text(snag.raised_by || 'Unknown', 42, metaY + 6)
    doc.text(snag.due_date ? new Date(snag.due_date).toLocaleDateString() : 'Not set', 122, metaY)
    doc.text(new Date(snag.created_at).toLocaleDateString(), 122, metaY + 6)
    doc.text(drawing.level_ref || drawing.name, 42, metaY + 12)

    // Footer on each page
    if (i % 3 === 2 || i === snags.length - 1) {
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(6)
      doc.text('SiteCore — Site Compliance Platform', 10, 290)
      doc.text(`Page ${doc.getNumberOfPages()}`, 200, 290, { align: 'right' })
    }
  }

  const fileName = `Snag Report - ${drawing.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
