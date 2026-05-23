import { jsPDF } from 'jspdf'
import {
  drawHeader, drawTitle, drawInfoStrip, drawDescription,
  drawSectionLabel, drawCardGrid, drawSummaryRow, drawFooter, drawBodyFrame,
  fetchSignatureAsDataUrl, formatDate, formatDateTime, COLORS, loadLogoImage
} from './reportTemplate'

export async function generateToolboxPDF({ talk, project, signatures, branding }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14

  // Pre-load logo if branding is provided
  if (branding?.logoUrl && !branding.logoDataUrl) {
    branding.logoDataUrl = await loadLogoImage(branding.logoUrl)
  }

  // Header
  let y = drawHeader(doc, {
    docType: 'Toolbox talk sign-off',
    status: talk.is_open ? 'Open' : 'Closed',
    pageW, branding,
  })

  let pageStartY = y

  // Title
  y = drawTitle(doc, {
    title: talk.title,
    projectName: project?.name || '',
    y: y + 8,
    margin, branding,
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
    y, margin, pageW, branding,
  })

  // Sign-off section
  y = drawSectionLabel(doc, { label: 'Sign-off record', y, margin, branding })

  // Build people data with signature images
  const people = []
  for (const sig of signatures) {
    let sigImg = null
    if (sig.signature_url) {
      try {
        sigImg = await fetchSignatureAsDataUrl(sig.signature_url)
      } catch { /* ignore */ }
    }
    people.push({
      name: sig.operative_name,
      secondary: formatDateTime(sig.signed_at),
      signed: true,
      signatureImg: sigImg,
    })
  }

  // Card grid with pagination
  const checkPage = () => {
    drawBodyFrame(doc, { startY: pageStartY, endY: 280, pageW, branding })
    drawFooter(doc, { y: 282, margin, pageW, pageNum: doc.internal.getNumberOfPages(), branding })
    doc.addPage()
    pageStartY = 10
    return drawSectionLabel(doc, { label: 'Sign-off record (continued)', y: 14, margin, branding })
  }

  y = drawCardGrid(doc, { people, y, margin, pageW, branding, checkPage })

  // Summary
  y = drawSummaryRow(doc, {
    label: 'Completion',
    value: `${signatures.length} of ${signatures.length} signed`,
    y, margin, pageW,
  })

  // Close final page: body frame + footer
  drawBodyFrame(doc, { startY: pageStartY, endY: y + 6, pageW, branding })
  drawFooter(doc, { y: y + 8, margin, pageW, pageNum: doc.internal.getNumberOfPages(), branding })

  const fileName = `Toolbox Talk - ${talk.title} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
