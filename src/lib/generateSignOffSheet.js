import { jsPDF } from 'jspdf'
import {
  drawHeader, drawTitle, drawInfoStrip, drawSectionLabel,
  drawCardGrid, drawSummaryRow, drawFooter,
  fetchSignatureAsDataUrl, formatDate, formatDateTime, COLORS, loadLogoImage
} from './reportTemplate'

export async function generateSignOffSheet({ projectName, documentTitle, signatures, branding }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14

  // Pre-load logo if branding is provided
  if (branding?.logoUrl && !branding.logoDataUrl) {
    branding.logoDataUrl = await loadLogoImage(branding.logoUrl)
  }

  const validSigs = signatures.filter(s => !s.invalidated)
  const totalSigs = signatures.length

  // Header
  let y = drawHeader(doc, {
    docType: 'Document sign-off',
    status: validSigs.length === totalSigs ? 'Completed' : 'Open',
    pageW, branding,
  })

  const bodyStartY = y

  // Title
  y = drawTitle(doc, {
    title: documentTitle,
    projectName: projectName,
    y: y + 8,
    margin, branding,
  })

  // Info strip
  y = drawInfoStrip(doc, {
    items: [
      { label: 'Date', value: formatDate(new Date()) },
      { label: 'Signatories', value: `${validSigs.length}` },
      { label: 'Total', value: `${totalSigs}` },
    ],
    y, margin, pageW,
  })

  // Sign-off section
  y = drawSectionLabel(doc, { label: 'Sign-off record', y, margin, branding })

  // Build people data with signature images
  const people = []
  for (const sig of signatures) {
    let sigImg = null
    if (sig.signature_url && !sig.invalidated) {
      try {
        sigImg = await fetchSignatureAsDataUrl(sig.signature_url)
      } catch { /* ignore */ }
    }
    people.push({
      name: sig.operative_name,
      secondary: sig.invalidated ? 'Invalidated' : formatDateTime(sig.signed_at),
      signed: !sig.invalidated,
      signatureImg: sigImg,
    })
  }

  y = drawCardGrid(doc, { people, y, margin, pageW, branding })

  // Summary
  y = drawSummaryRow(doc, {
    label: 'Completion',
    value: `${validSigs.length} of ${totalSigs} signed`,
    y, margin, pageW,
  })

  // Footer
  drawFooter(doc, { y: y + 4, margin, pageW, pageNum: 1, branding })

  // Body frame
  const primary = branding?.primaryColor || COLORS.blue
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.rect(margin, bodyStartY, pageW - margin * 2, y + 10 - bodyStartY)
  doc.setFillColor(...primary)
  doc.rect(margin, bodyStartY, 3, y + 10 - bodyStartY, 'F')

  const fileName = `Sign-Off - ${documentTitle} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.]/g, '')
  doc.save(fileName)
}
