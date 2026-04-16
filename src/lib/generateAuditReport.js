import { jsPDF } from 'jspdf'
import {
  drawHeader, drawTitle, drawInfoStrip,
  drawSectionLabel, drawCardGrid, drawSummaryRow, drawFooter,
  formatDate, formatDateTime, COLORS
} from './reportTemplate'

export async function generateAuditReport({ project, documents, operatives, signatures }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14

  const validSigs = signatures.filter(s => !s.invalidated)
  const allComplete = operatives.every(op => {
    const opSigs = validSigs.filter(s => s.operative_id === op.id)
    return opSigs.length >= documents.length
  })
  const status = allComplete ? 'Completed' : 'Open'

  // Header
  let y = drawHeader(doc, { docType: 'HSE Compliance audit trail', status, pageW })

  // Title
  y = drawTitle(doc, { title: 'HSE Compliance Audit Trail', projectName: project.name, y, margin })

  // Info strip
  y = drawInfoStrip(doc, {
    items: [
      { label: 'Date', value: formatDate(new Date()) },
      { label: 'Documents', value: String(documents.length) },
      { label: 'Operatives', value: String(operatives.length) },
      { label: 'Signatures', value: String(signatures.length) },
    ],
    y, margin, pageW,
  })

  // Per-document sign-off sections
  for (const document of documents) {
    if (y > 270) {
      doc.addPage()
      y = margin + 10
    }

    y = drawSectionLabel(doc, { label: document.title, y, margin })

    const docSigs = signatures.filter(s => s.document_id === document.id)

    if (docSigs.length === 0) {
      doc.setTextColor(...COLORS.textTertiary)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('No signatures recorded', margin + 8, y)
      y += 8
    } else {
      const people = docSigs.map(sig => ({
        name: sig.operative_name || 'Unknown',
        secondary: sig.signed_at ? formatDateTime(sig.signed_at) : '—',
        signed: !sig.invalidated,
      }))

      y = drawCardGrid(doc, {
        people,
        y,
        margin,
        pageW,
        checkPage: () => {
          doc.addPage()
          return margin + 10
        },
      })
    }

    y += 4
  }

  // Summary
  if (y > 260) {
    doc.addPage()
    y = margin + 10
  }

  y = drawSummaryRow(doc, {
    label: 'Valid signatures',
    value: String(validSigs.length),
    y, margin, pageW,
  })

  // Footer
  drawFooter(doc, { y, margin, pageW })

  const fileName = `${project.name} - Audit Trail Report ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
