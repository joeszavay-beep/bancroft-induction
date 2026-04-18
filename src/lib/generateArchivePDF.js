import { jsPDF } from 'jspdf'
import {
  drawHeader, drawTitle, drawInfoStrip, drawDescription,
  drawSectionLabel, drawCardGrid, drawSummaryRow, drawFooter,
  fetchSignatureAsDataUrl, formatDate, formatDateTime, COLORS, loadLogoImage
} from './reportTemplate'

export async function generateArchivePDF({ project, operatives, documents, signatures, toolboxTalks, toolboxSignatures, snags, branding }) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14
  let y
  let pageNum = 1

  // Pre-load logo if branding is provided
  if (branding?.logoUrl && !branding.logoDataUrl) {
    branding.logoDataUrl = await loadLogoImage(branding.logoUrl)
  }

  function checkPage() {
    doc.addPage()
    pageNum++
    return margin + 10
  }

  // Header
  y = drawHeader(doc, { docType: 'Project H&S archive', status: 'Completed', pageW, branding })

  // Title
  y = drawTitle(doc, {
    title: 'Project H&S Archive',
    projectName: `${project.name}${project.location ? ' \u2014 ' + project.location : ''}`,
    y, margin, branding,
  })

  // Info strip
  y = drawInfoStrip(doc, {
    items: [
      { label: 'Operatives', value: String(operatives.length) },
      { label: 'Documents', value: String(documents.length) },
      { label: 'Signatures', value: String(signatures.length) },
      { label: 'Toolbox Talks', value: String(toolboxTalks.length) },
      { label: 'Snags', value: String(snags.length) },
    ],
    y, margin, pageW,
  })

  // Description
  y = drawDescription(doc, {
    text: `Complete health & safety archive for "${project.name}". This document contains all operative registrations, document sign-offs, toolbox talks, and snagging records for the project.`,
    y, margin, pageW, branding,
  })

  // ─── SECTION 1: Operative register ───
  if (y > 270) y = checkPage()
  y = drawSectionLabel(doc, { label: 'Operative register', y, margin, branding })

  const opPeople = operatives.map(op => ({
    name: op.name || 'Unknown',
    secondary: op.role || 'Operative',
    signed: true,
  }))

  y = drawCardGrid(doc, { people: opPeople, y, margin, pageW, checkPage, branding })

  // ─── SECTION 2: Document sign-offs ───
  if (y > 270) y = checkPage()
  y = drawSectionLabel(doc, { label: 'Document sign-offs', y, margin, branding })

  const archivePrimary = branding?.primaryColor || COLORS.blue
  for (const document of documents) {
    if (y > 270) y = checkPage()

    // Sub-label for each document
    doc.setTextColor(...archivePrimary)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(document.title + (document.version > 1 ? ` (v${document.version})` : ''), margin + 8, y)
    y += 6

    const docSigs = signatures.filter(s => s.document_id === document.id)

    if (docSigs.length === 0) {
      doc.setTextColor(...COLORS.textTertiary)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('No signatures recorded', margin + 8, y)
      y += 8
    } else {
      const people = []
      for (const sig of docSigs) {
        let sigImg = null
        if (sig.signature_url && !sig.invalidated) {
          try { sigImg = await fetchSignatureAsDataUrl(sig.signature_url) } catch { /* ignore */ }
        }
        people.push({
          name: sig.operative_name || 'Unknown',
          secondary: sig.signed_at ? formatDateTime(sig.signed_at) : '—',
          signed: !sig.invalidated,
          signatureImg: sigImg,
        })
      }

      y = drawCardGrid(doc, { people, y, margin, pageW, checkPage, branding })
    }

    y += 2
  }

  // ─── SECTION 3: Toolbox talks ───
  if (y > 270) y = checkPage()
  y = drawSectionLabel(doc, { label: 'Toolbox talks', y, margin, branding })

  if (toolboxTalks.length === 0) {
    doc.setTextColor(...COLORS.textTertiary)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text('No toolbox talks recorded', margin + 8, y)
    y += 8
  }

  for (const talk of toolboxTalks) {
    if (y > 270) y = checkPage()

    // Talk title
    doc.setTextColor(...archivePrimary)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(talk.title, margin + 8, y)
    y += 5

    doc.setTextColor(...COLORS.textSecondary)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    const dateInfo = `${formatDate(talk.created_at)} | ${talk.is_open ? 'Open' : 'Closed'}`
    doc.text(dateInfo, margin + 8, y)
    y += 6

    const talkSigs = toolboxSignatures.filter(s => s.talk_id === talk.id)

    if (talkSigs.length === 0) {
      doc.setTextColor(...COLORS.textTertiary)
      doc.setFontSize(7)
      doc.text('No attendees recorded', margin + 8, y)
      y += 6
    } else {
      const people = []
      for (const sig of talkSigs) {
        let sigImg = null
        if (sig.signature_url) {
          try { sigImg = await fetchSignatureAsDataUrl(sig.signature_url) } catch { /* ignore */ }
        }
        people.push({
          name: sig.operative_name || 'Unknown',
          secondary: sig.signed_at ? formatDateTime(sig.signed_at) : '—',
          signed: true,
          signatureImg: sigImg,
        })
      }

      y = drawCardGrid(doc, { people, y, margin, pageW, checkPage, branding })
    }

    y += 4
  }

  // ─── SECTION 4: Snagging summary ───
  if (y > 270) y = checkPage()
  y = drawSectionLabel(doc, { label: 'Snagging summary', y, margin, branding })

  if (snags.length === 0) {
    doc.setTextColor(...COLORS.textTertiary)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text('No snags recorded', margin + 8, y)
    y += 8
  } else {
    const snagOpen = snags.filter(s => s.status === 'open').length
    const snagCompleted = snags.filter(s => s.status === 'completed').length
    const snagClosed = snags.filter(s => s.status === 'closed').length

    // Stats row using info strip style
    y = drawInfoStrip(doc, {
      items: [
        { label: 'Total', value: String(snags.length) },
        { label: 'Open', value: String(snagOpen) },
        { label: 'Completed', value: String(snagCompleted) },
        { label: 'Closed', value: String(snagClosed) },
      ],
      y, margin, pageW,
    })
  }

  // Summary row: total records
  if (y > 270) y = checkPage()
  const totalRecords = operatives.length + signatures.length + toolboxSignatures.length + snags.length
  y = drawSummaryRow(doc, {
    label: 'Total records',
    value: String(totalRecords),
    y, margin, pageW,
  })

  // Footer with page number
  drawFooter(doc, { y, margin, pageW, pageNum, branding })

  const fileName = `H&S Archive - ${project.name} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^a-zA-Z0-9 \-_.&]/g, '')
  doc.save(fileName)
}
