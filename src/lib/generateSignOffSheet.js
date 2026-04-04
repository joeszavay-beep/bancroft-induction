import { jsPDF } from 'jspdf'

async function fetchSignatureAsDataUrl(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    if (blob.type.includes('svg') || url.endsWith('.svg')) {
      const svgText = await blob.text()
      const img = new Image()
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
      const svgUrl = URL.createObjectURL(svgBlob)
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 300; canvas.height = 100
          canvas.getContext('2d').drawImage(img, 0, 0, 300, 100)
          URL.revokeObjectURL(svgUrl)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(null) }
        img.src = svgUrl
      })
    }
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

export async function generateSignOffSheet({ projectName, documentTitle, signatures, companyName }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = 210
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Header background
  doc.setFillColor(10, 14, 26)
  doc.rect(0, 0, pageWidth, 45, 'F')

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(companyName || 'CoreSite', margin, y + 10)

  // Subtitle
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text('Mechanical & Electrical Engineering', margin, y + 17)

  // Document title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Document Sign-Off Sheet', margin, y + 30)

  y = 55

  // Project & document info
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('PROJECT', margin, y)
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(projectName || 'N/A', margin, y + 6)

  doc.setTextColor(80, 80, 80)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('DOCUMENT', margin + 90, y)
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(documentTitle || 'N/A', margin + 90, y + 6)

  doc.setTextColor(80, 80, 80)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margin, y + 16)
  doc.text(`Total signatures: ${signatures.length}`, margin + 90, y + 16)

  y += 26

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Table header
  doc.setFillColor(245, 245, 245)
  doc.rect(margin, y - 4, contentWidth, 10, 'F')
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('#', margin + 2, y + 2)
  doc.text('NAME', margin + 12, y + 2)
  doc.text('SIGNATURE', margin + 70, y + 2)
  doc.text('TYPED CONFIRMATION', margin + 130, y + 2)
  doc.text('DATE & TIME', margin + 165, y + 2)
  y += 12

  // Signature rows
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i]
    const rowHeight = 22

    // New page if needed
    if (y + rowHeight > 280) {
      doc.addPage()
      y = margin

      // Repeat header on new page
      doc.setFillColor(245, 245, 245)
      doc.rect(margin, y - 4, contentWidth, 10, 'F')
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('#', margin + 2, y + 2)
      doc.text('NAME', margin + 12, y + 2)
      doc.text('SIGNATURE', margin + 70, y + 2)
      doc.text('TYPED CONFIRMATION', margin + 130, y + 2)
      doc.text('DATE & TIME', margin + 165, y + 2)
      y += 12
    }

    // Row background (alternating)
    if (i % 2 === 0) {
      doc.setFillColor(252, 252, 252)
      doc.rect(margin, y - 4, contentWidth, rowHeight, 'F')
    }

    // Number
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${i + 1}`, margin + 2, y + 6)

    // Name
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(sig.operative_name || 'Unknown', margin + 12, y + 6)

    // Signature image
    if (sig.signature_url) {
      try {
        const dataUrl = await fetchSignatureAsDataUrl(sig.signature_url)
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', margin + 70, y - 3, 50, 18)
        } else { throw new Error('null') }
      } catch (e) {
        doc.setTextColor(150, 150, 150)
        doc.setFontSize(8)
        doc.text('[signature unavailable]', margin + 70, y + 6)
      }
    }

    // Typed name
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(sig.typed_name || '', margin + 130, y + 6)

    // Date
    const signedDate = new Date(sig.signed_at)
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.text(signedDate.toLocaleDateString(), margin + 165, y + 3)
    doc.text(signedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), margin + 165, y + 9)

    // Row bottom border
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y + rowHeight - 4, pageWidth - margin, y + rowHeight - 4)

    y += rowHeight
  }

  // Footer
  y += 10
  if (y > 270) {
    doc.addPage()
    y = margin
  }
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.text(`This document was generated by the ${companyName || 'CoreSite'} Site Compliance Platform.`, margin, y)
  doc.text(`Document: ${documentTitle} | Project: ${projectName}`, margin, y + 5)

  // Save
  const fileName = `${projectName} - ${documentTitle} - Sign-Off Sheet.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
