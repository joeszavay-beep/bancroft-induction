import { jsPDF } from 'jspdf'

async function fetchSignatureAsDataUrl(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    // If SVG, convert to PNG via canvas
    if (blob.type.includes('svg') || url.endsWith('.svg')) {
      const svgText = await blob.text()
      const img = new Image()
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
      const svgUrl = URL.createObjectURL(svgBlob)
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 300
          canvas.height = 100
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, 300, 100)
          URL.revokeObjectURL(svgUrl)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(null) }
        img.src = svgUrl
      })
    }
    // Regular image
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

export async function generateToolboxPDF({ talk, project, signatures, companyName }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = 210
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Header
  doc.setFillColor(10, 53, 96)
  doc.rect(0, 0, pageWidth, 48, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(companyName || 'CoreSite', margin, y + 10)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 200, 220)
  doc.text('Toolbox Talk Sign-Off Record', margin, y + 17)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(talk.title, margin, y + 32)

  y = 56

  // Info grid
  doc.setFillColor(240, 245, 255)
  doc.setDrawColor(21, 96, 170)
  doc.rect(margin, y, contentWidth, 24, 'FD')

  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('PROJECT', margin + 5, y + 6)
  doc.text('DATE', margin + 70, y + 6)
  doc.text('STATUS', margin + 130, y + 6)
  doc.text('ATTENDEES', margin + 160, y + 6)

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(project?.name || 'N/A', margin + 5, y + 14)
  doc.text(new Date(talk.created_at).toLocaleDateString(), margin + 70, y + 14)
  doc.text(talk.is_open ? 'Open' : 'Closed', margin + 130, y + 14)
  doc.text(`${signatures.length}`, margin + 160, y + 14)

  if (talk.closed_at) {
    doc.setFontSize(7)
    doc.setTextColor(100, 100, 100)
    doc.text(`Closed: ${new Date(talk.closed_at).toLocaleString()}`, margin + 130, y + 20)
  }

  y += 32

  // Description
  if (talk.description) {
    doc.setTextColor(80, 80, 80)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('DESCRIPTION', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(50, 50, 50)
    const lines = doc.splitTextToSize(talk.description, contentWidth)
    doc.text(lines, margin, y)
    y += lines.length * 4.5 + 6
  }

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Table header
  doc.setFillColor(21, 96, 170)
  doc.rect(margin, y, contentWidth, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('#', margin + 3, y + 5.5)
  doc.text('NAME', margin + 12, y + 5.5)
  doc.text('SIGNATURE', margin + 70, y + 5.5)
  doc.text('TIME', margin + 150, y + 5.5)
  y += 12

  // Rows
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i]
    const rowHeight = 18

    if (y + rowHeight > 278) {
      doc.addPage()
      y = margin
      doc.setFillColor(21, 96, 170)
      doc.rect(margin, y, contentWidth, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('#', margin + 3, y + 5.5)
      doc.text('NAME', margin + 12, y + 5.5)
      doc.text('SIGNATURE', margin + 70, y + 5.5)
      doc.text('TIME', margin + 150, y + 5.5)
      y += 12
    }

    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y - 2, contentWidth, rowHeight, 'F')
    }

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${i + 1}`, margin + 3, y + 6)

    doc.setTextColor(30, 30, 30)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(sig.operative_name, margin + 12, y + 6)

    if (sig.signature_url) {
      try {
        const dataUrl = await fetchSignatureAsDataUrl(sig.signature_url)
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', margin + 70, y - 1, 45, 14)
        } else {
          throw new Error('null')
        }
      } catch {
        doc.setTextColor(150, 150, 150)
        doc.setFontSize(7)
        doc.text('[signature]', margin + 70, y + 6)
      }
    }

    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const d = new Date(sig.signed_at)
    doc.text(`${d.toLocaleDateString()}`, margin + 150, y + 4)
    doc.text(`${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margin + 150, y + 9)

    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y + rowHeight - 2, pageWidth - margin, y + rowHeight - 2)
    y += rowHeight
  }

  // Footer
  y += 8
  if (y > 275) { doc.addPage(); y = margin }
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.text(`Generated by ${companyName || 'CoreSite'} via CoreSite — Site Compliance Platform`, margin, y)
  doc.text(`Toolbox Talk: ${talk.title} | ${new Date().toLocaleString()}`, margin, y + 4)

  const fileName = `Toolbox Talk - ${talk.title} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
