import { jsPDF } from 'jspdf'

export async function generateAuditReport({ project, documents, operatives, signatures }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = 210
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Header
  doc.setFillColor(10, 14, 26)
  doc.rect(0, 0, pageWidth, 50, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Bancroft Ltd', margin, y + 10)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text('Mechanical & Electrical Engineering', margin, y + 17)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('HSE Compliance Audit Trail', margin, y + 30)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margin, y + 38)

  y = 60

  // Project info
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Project: ${project.name}`, margin, y)
  y += 6
  if (project.location) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Location: ${project.location}`, margin, y)
    y += 6
  }

  y += 4

  // Summary box
  doc.setFillColor(240, 245, 255)
  doc.setDrawColor(59, 130, 246)
  doc.rect(margin, y, contentWidth, 20, 'FD')
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Documents: ${documents.length}`, margin + 5, y + 8)
  doc.text(`Operatives: ${operatives.length}`, margin + 55, y + 8)
  doc.text(`Total Signatures: ${signatures.length}`, margin + 110, y + 8)

  const validSigs = signatures.filter(s => !s.invalidated)
  const invalidSigs = signatures.filter(s => s.invalidated)
  doc.text(`Valid: ${validSigs.length}`, margin + 5, y + 15)
  doc.text(`Invalidated: ${invalidSigs.length}`, margin + 55, y + 15)

  const completedOps = operatives.filter(op => {
    const opSigs = validSigs.filter(s => s.operative_id === op.id)
    return opSigs.length >= documents.length
  })
  doc.text(`Operatives Complete: ${completedOps.length}/${operatives.length}`, margin + 110, y + 15)

  y += 30

  // Per-document breakdown
  for (const document of documents) {
    if (y > 250) {
      doc.addPage()
      y = margin
    }

    doc.setFillColor(245, 245, 245)
    doc.rect(margin, y, contentWidth, 8, 'F')
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${document.title} (v${document.version || 1})`, margin + 3, y + 6)
    y += 12

    // Table header
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('OPERATIVE', margin + 3, y)
    doc.text('SIGNATURE', margin + 55, y)
    doc.text('DOB VERIFIED', margin + 110, y)
    doc.text('IP ADDRESS', margin + 140, y)
    doc.text('DATE/TIME', margin + 165, y)
    y += 5

    const docSigs = signatures.filter(s => s.document_id === document.id)

    if (docSigs.length === 0) {
      doc.setTextColor(150, 150, 150)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('No signatures recorded', margin + 3, y + 3)
      y += 10
    } else {
      for (const sig of docSigs) {
        if (y > 275) {
          doc.addPage()
          y = margin
        }

        const rowY = y

        // Invalidated marker
        if (sig.invalidated) {
          doc.setFillColor(255, 240, 240)
          doc.rect(margin, rowY - 2, contentWidth, 14, 'F')
        }

        doc.setTextColor(sig.invalidated ? 150 : 30, sig.invalidated ? 50 : 30, sig.invalidated ? 50 : 30)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(sig.operative_name, margin + 3, rowY + 4)

        // Signature thumbnail
        if (sig.signature_url) {
          try {
            const response = await fetch(sig.signature_url)
            const blob = await response.blob()
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.readAsDataURL(blob)
            })
            doc.addImage(dataUrl, 'PNG', margin + 55, rowY - 1, 40, 12)
          } catch {
            doc.setTextColor(150, 150, 150)
            doc.text('[unavailable]', margin + 55, rowY + 4)
          }
        }

        // DOB verified
        doc.setTextColor(100, 100, 100)
        doc.text(sig.typed_name || 'N/A', margin + 110, rowY + 4)

        // IP
        doc.text(sig.ip_address || 'N/A', margin + 140, rowY + 4)

        // Date
        const d = new Date(sig.signed_at)
        doc.text(`${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margin + 165, rowY + 4)

        if (sig.invalidated) {
          doc.setTextColor(239, 68, 68)
          doc.setFontSize(6)
          doc.text('INVALIDATED - Document updated, re-sign required', margin + 3, rowY + 10)
        }

        // Row border
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, rowY + (sig.invalidated ? 13 : 8), pageWidth - margin, rowY + (sig.invalidated ? 13 : 8))

        y += sig.invalidated ? 16 : 12
      }
    }

    y += 6
  }

  // Operative completion summary
  if (y > 230) {
    doc.addPage()
    y = margin
  }

  y += 4
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Operative Completion Summary', margin, y)
  y += 8

  for (const op of operatives) {
    if (y > 275) {
      doc.addPage()
      y = margin
    }

    const opSigs = validSigs.filter(s => s.operative_id === op.id)
    const complete = opSigs.length >= documents.length

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.text(`${op.name}`, margin + 3, y)
    doc.text(`${op.role || 'Operative'}`, margin + 60, y)

    doc.setTextColor(complete ? 34 : 239, complete ? 197 : 68, complete ? 94 : 68)
    doc.setFont('helvetica', 'bold')
    doc.text(`${opSigs.length}/${documents.length} ${complete ? 'COMPLETE' : 'INCOMPLETE'}`, margin + 120, y)

    y += 7
  }

  // Footer
  y += 10
  if (y > 280) {
    doc.addPage()
    y = margin
  }
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.2)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.text('This audit trail was generated by the Bancroft Ltd Site Induction & RAMS Sign-Off Platform.', margin, y)
  doc.text('This document is intended for HSE compliance purposes and contains verified digital signatures with IP address records.', margin, y + 4)

  const fileName = `${project.name} - Audit Trail Report ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
