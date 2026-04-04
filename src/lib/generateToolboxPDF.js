import { jsPDF } from 'jspdf'
import {
  drawHeader, drawTitle, drawInfoStrip, drawDescription,
  drawSectionLabel, drawCardGrid, drawSummaryRow, drawFooter,
  fetchSignatureAsDataUrl, formatDate, formatDateTime, COLORS
} from './reportTemplate'

export async function generateToolboxPDF({ talk, project, signatures, companyName }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14

  // Header
  let y = drawHeader(doc, {
    docType: 'Toolbox talk sign-off',
    status: talk.is_open ? 'Open' : 'Closed',
    pageW,
  })

  // Accent bar (draw after all content)
  const bodyStartY = y

  // Title
  y = drawTitle(doc, {
    title: talk.title,
    projectName: project?.name || '',
    y: y + 8,
    margin,
  })

  // Info strip
  y = drawInfoStrip(doc, {
    items: [
      { label: 'Date', value: formatDate(talk.created_at) },
      { label: 'Closed', value: talk.closed_at ? formatDateTime(talk.closed_at) : 'Still open' },
      { label: 'Attendees', value: `${signatures.length}` },
    ],
    y, margin, pageW,
  })

  // Description
  y = drawDescription(doc, {
    text: talk.description,
    y, margin, pageW,
  })

  // Sign-off section
  y = drawSectionLabel(doc, { label: 'Sign-off record', y, margin })

  // Build people data with signature images
  const people = []
  for (const sig of signatures) {
    let sigImg = null
    if (sig.signature_url) {
      sigImg = await fetchSignatureAsDataUrl(sig.signature_url)
    }
    people.push({
      name: sig.operative_name,
      secondary: formatDateTime(sig.signed_at),
      signed: true,
      signatureImg: sigImg,
    })
  }

  // Card grid
  y = drawCardGrid(doc, { people, y, margin, pageW })

  // Summary
  y = drawSummaryRow(doc, {
    label: 'Completion',
    value: `${signatures.length} of ${signatures.length} signed`,
    y, margin, pageW,
  })

  // Footer
  drawFooter(doc, { y: y + 4, margin, pageW, pageNum: 1 })

  // Draw body frame (accent bar + border)
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.rect(margin, bodyStartY, pageW - margin * 2, y + 10 - bodyStartY)
  doc.setFillColor(...COLORS.blue)
  doc.rect(margin, bodyStartY, 3, y + 10 - bodyStartY, 'F')

  const fileName = `Toolbox Talk - ${talk.title} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
