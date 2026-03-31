import { jsPDF } from 'jspdf'

export async function generateArchivePDF({ project, operatives, documents, signatures, toolboxTalks, toolboxSignatures, snags, drawings }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 15
  const contentW = pageW - margin * 2
  let y = margin
  let pageNum = 1

  function addFooter() {
    doc.setTextColor(180, 180, 180)
    doc.setFontSize(7)
    doc.text('SiteCore — Project H&S Archive', margin, 290)
    doc.text(`${project.name} | Page ${pageNum}`, pageW - margin, 290, { align: 'right' })
    pageNum++
  }

  function checkPage(need) {
    if (y + need > 275) {
      addFooter()
      doc.addPage()
      y = margin
    }
  }

  function sectionHeader(title) {
    checkPage(20)
    doc.setFillColor(10, 53, 96)
    doc.rect(margin, y, contentW, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(title, margin + 4, y + 7)
    y += 14
  }

  // === COVER PAGE ===
  doc.setFillColor(10, 53, 96)
  doc.rect(0, 0, pageW, 297, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('BANCROFT LTD', margin, 50)

  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.text('PROJECT H&S', margin, 80)
  doc.text('ARCHIVE', margin, 95)

  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(1)
  doc.line(margin, 105, margin + 60, 105)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(project.name, margin, 120)
  if (project.location) {
    doc.setFontSize(11)
    doc.setTextColor(180, 200, 220)
    doc.text(project.location, margin, 128)
  }

  doc.setFontSize(10)
  doc.setTextColor(150, 170, 200)
  y = 160
  const stats = [
    `Operatives: ${operatives.length}`,
    `Documents: ${documents.length}`,
    `Document Signatures: ${signatures.length}`,
    `Toolbox Talks: ${toolboxTalks.length}`,
    `Toolbox Signatures: ${toolboxSignatures.length}`,
    `Snags: ${snags.length}`,
    `Drawings: ${drawings.length}`,
  ]
  stats.forEach(s => {
    doc.text(s, margin, y)
    y += 7
  })

  doc.setFontSize(9)
  doc.setTextColor(120, 140, 170)
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 260)
  doc.text('This document contains the complete H&S records for the above project.', margin, 267)
  doc.text('SiteCore — Site Compliance Platform', margin, 280)

  // === SECTION 1: OPERATIVES ===
  addFooter()
  doc.addPage()
  y = margin

  sectionHeader('1. OPERATIVE REGISTER')

  // Table header
  doc.setFillColor(240, 245, 255)
  doc.rect(margin, y, contentW, 7, 'F')
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Name', margin + 2, y + 5)
  doc.text('Role', margin + 45, y + 5)
  doc.text('DOB', margin + 80, y + 5)
  doc.text('NI Number', margin + 105, y + 5)
  doc.text('Next of Kin', margin + 140, y + 5)
  y += 9

  operatives.forEach((op, i) => {
    checkPage(8)
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 252)
      doc.rect(margin, y - 2, contentW, 7, 'F')
    }
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(op.name || '', margin + 2, y + 3)
    doc.text(op.role || '—', margin + 45, y + 3)
    doc.text(op.date_of_birth || '—', margin + 80, y + 3)
    doc.text(op.ni_number || '—', margin + 105, y + 3)
    doc.text(op.next_of_kin || '—', margin + 140, y + 3)
    y += 7
  })

  // === SECTION 2: DOCUMENT SIGN-OFFS (RAMS/Inductions) ===
  sectionHeader('2. DOCUMENT SIGN-OFFS (RAMS & INDUCTIONS)')

  documents.forEach(document => {
    checkPage(16)
    doc.setTextColor(21, 96, 170)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`${document.title}${document.version > 1 ? ` (v${document.version})` : ''}`, margin, y + 4)
    y += 8

    const docSigs = signatures.filter(s => s.document_id === document.id)

    if (docSigs.length === 0) {
      doc.setTextColor(150, 150, 150)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      doc.text('No signatures recorded', margin + 4, y + 3)
      y += 7
    } else {
      // Mini table header
      doc.setFillColor(245, 245, 250)
      doc.rect(margin, y, contentW, 6, 'F')
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text('Operative', margin + 2, y + 4)
      doc.text('Typed Name / DOB', margin + 55, y + 4)
      doc.text('IP Address', margin + 110, y + 4)
      doc.text('Date & Time', margin + 145, y + 4)
      doc.text('Valid', margin + 175, y + 4)
      y += 8

      docSigs.forEach(sig => {
        checkPage(7)
        doc.setTextColor(30, 30, 30)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(sig.operative_name || '', margin + 2, y + 3)
        doc.text(sig.typed_name || '—', margin + 55, y + 3)
        doc.text(sig.ip_address || '—', margin + 110, y + 3)
        doc.text(sig.signed_at ? new Date(sig.signed_at).toLocaleString() : '', margin + 145, y + 3)
        doc.setTextColor(sig.invalidated ? 239 : 34, sig.invalidated ? 68 : 197, sig.invalidated ? 68 : 94)
        doc.setFont('helvetica', 'bold')
        doc.text(sig.invalidated ? 'NO' : 'YES', margin + 175, y + 3)
        y += 6
      })
    }
    y += 4
  })

  // === SECTION 3: TOOLBOX TALKS ===
  sectionHeader('3. TOOLBOX TALKS')

  if (toolboxTalks.length === 0) {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(8)
    doc.text('No toolbox talks recorded', margin, y + 4)
    y += 10
  }

  toolboxTalks.forEach(talk => {
    checkPage(20)
    doc.setTextColor(21, 96, 170)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(talk.title, margin, y + 4)
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`${new Date(talk.created_at).toLocaleDateString()} | ${talk.is_open ? 'Open' : 'Closed'}`, margin + 2, y + 10)
    y += 14

    if (talk.description) {
      checkPage(10)
      doc.setTextColor(60, 60, 60)
      doc.setFontSize(7)
      const descLines = doc.splitTextToSize(talk.description, contentW - 4)
      doc.text(descLines.slice(0, 3), margin + 2, y + 3)
      y += Math.min(descLines.length, 3) * 4 + 4
    }

    const talkSigs = toolboxSignatures.filter(s => s.talk_id === talk.id)
    if (talkSigs.length > 0) {
      doc.setFillColor(245, 245, 250)
      doc.rect(margin, y, contentW, 6, 'F')
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text('Attendee', margin + 2, y + 4)
      doc.text('Signed At', margin + 100, y + 4)
      y += 8

      talkSigs.forEach(sig => {
        checkPage(6)
        doc.setTextColor(30, 30, 30)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(sig.operative_name, margin + 2, y + 3)
        doc.text(new Date(sig.signed_at).toLocaleString(), margin + 100, y + 3)
        y += 6
      })
    } else {
      doc.setTextColor(150, 150, 150)
      doc.setFontSize(7)
      doc.text('No attendees recorded', margin + 4, y + 3)
      y += 7
    }
    y += 6
  })

  // === SECTION 4: SNAG SUMMARY ===
  sectionHeader('4. SNAGGING SUMMARY')

  if (snags.length === 0) {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(8)
    doc.text('No snags recorded', margin, y + 4)
    y += 10
  } else {
    // Snag stats
    const snagOpen = snags.filter(s => s.status === 'open').length
    const snagCompleted = snags.filter(s => s.status === 'completed').length
    const snagClosed = snags.filter(s => s.status === 'closed').length

    doc.setFillColor(240, 245, 255)
    doc.rect(margin, y, contentW, 10, 'F')
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total: ${snags.length} | Open: ${snagOpen} | Completed: ${snagCompleted} | Closed: ${snagClosed}`, margin + 4, y + 7)
    y += 14

    // Group by drawing
    const snagsByDrawing = {}
    snags.forEach(s => {
      if (!snagsByDrawing[s.drawing_id]) snagsByDrawing[s.drawing_id] = []
      snagsByDrawing[s.drawing_id].push(s)
    })

    Object.entries(snagsByDrawing).forEach(([drawingId, drawingSnags]) => {
      const drw = drawings.find(d => d.id === drawingId)
      checkPage(14)
      doc.setTextColor(21, 96, 170)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(drw?.name || 'Unknown Drawing', margin, y + 4)
      y += 8

      doc.setFillColor(245, 245, 250)
      doc.rect(margin, y, contentW, 6, 'F')
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text('#', margin + 2, y + 4)
      doc.text('Trade', margin + 12, y + 4)
      doc.text('Description', margin + 40, y + 4)
      doc.text('Status', margin + 110, y + 4)
      doc.text('Priority', margin + 132, y + 4)
      doc.text('Assigned', margin + 155, y + 4)
      y += 8

      drawingSnags.forEach(snag => {
        checkPage(7)
        doc.setTextColor(30, 30, 30)
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'normal')
        doc.text(`${snag.snag_number}`, margin + 2, y + 3)
        doc.text(snag.trade || '—', margin + 12, y + 3)
        doc.text((snag.description || '').slice(0, 45), margin + 40, y + 3)

        const statusColor = snag.status === 'open' ? [239, 68, 68] : snag.status === 'completed' ? [34, 197, 94] : [156, 163, 175]
        doc.setTextColor(...statusColor)
        doc.setFont('helvetica', 'bold')
        doc.text(snag.status, margin + 110, y + 3)

        doc.setTextColor(80, 80, 80)
        doc.setFont('helvetica', 'normal')
        doc.text(snag.priority || '—', margin + 132, y + 3)
        doc.text(snag.assigned_to || '—', margin + 155, y + 3)
        y += 6
      })
      y += 4
    })
  }

  // === FINAL PAGE: DECLARATION ===
  addFooter()
  doc.addPage()
  y = margin

  doc.setFillColor(10, 53, 96)
  doc.rect(0, 0, pageW, 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Archive Declaration', margin, 28)

  y = 55
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const declaration = [
    `This document constitutes the complete Health & Safety archive for the project "${project.name}"${project.location ? ` at ${project.location}` : ''}.`,
    '',
    'It contains records of:',
    `  - ${operatives.length} operative(s) registered on the project`,
    `  - ${documents.length} RAMS/induction document(s) with ${signatures.filter(s => !s.invalidated).length} valid signature(s)`,
    `  - ${toolboxTalks.length} toolbox talk(s) with ${toolboxSignatures.length} attendee signature(s)`,
    `  - ${snags.length} snag(s) across ${drawings.length} drawing(s)`,
    '',
    'All digital signatures include timestamp and IP address verification.',
    '',
    `Archive generated on ${new Date().toLocaleString()} via the SiteCore Site Compliance Platform.`,
  ]
  declaration.forEach(line => {
    doc.text(line, margin, y)
    y += 6
  })

  y += 20
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, y, margin + 70, y)
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Project Manager Signature', margin, y + 5)

  doc.line(margin + 100, y, margin + 170, y)
  doc.text('Date', margin + 100, y + 5)

  addFooter()

  const fileName = `H&S Archive - ${project.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.&]/g, '')
  doc.save(fileName)
}
