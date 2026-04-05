/**
 * CoreSite Report Design System
 * Shared template functions for all PDF generators
 */

// Brand colours
export const COLORS = {
  navy: [27, 42, 61],        // #1B2A3D
  blue: [59, 125, 216],      // #3B7DD8
  green: [45, 157, 95],      // #2D9D5F
  greenBg: [232, 244, 237],  // #E8F4ED
  greenDark: [27, 107, 66],  // #1B6B42
  greenLight: [107, 216, 158], // #6BD89E
  white: [255, 255, 255],
  bgSecondary: [245, 245, 242], // #F5F5F2
  border: [229, 229, 229],   // #E5E5E5
  textPrimary: [26, 26, 26], // #1A1A1A
  textSecondary: [107, 107, 107], // #6B6B6B
  textTertiary: [154, 154, 154], // #9A9A9A
  red: [217, 62, 62],        // #D93E3E
  redBg: [253, 236, 236],    // #FDECEC
  amber: [210, 153, 34],     // #D29922
}

// Status badge colours
export const STATUS_BADGE = {
  closed: { bg: COLORS.greenBg, text: COLORS.greenDark, dot: COLORS.green },
  completed: { bg: COLORS.greenBg, text: COLORS.greenDark, dot: COLORS.green },
  open: { bg: [230, 240, 251], text: [26, 77, 140], dot: COLORS.blue },
  pending_review: { bg: [243, 242, 238], text: [94, 93, 89], dot: [154, 153, 143] },
  reassigned: { bg: [253, 243, 226], text: [140, 90, 10], dot: COLORS.amber },
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function formatTime(d) {
  if (!d) return ''
  const date = new Date(d)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDateTime(d) {
  if (!d) return '—'
  return `${formatDate(d)} ${formatTime(d)}`
}

function getInitials(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/**
 * Draw the CoreSite header bar
 */
export function drawHeader(doc, { docType, status, pageW }) {
  const margin = 14
  const headerH = 44

  // Header background with rounded top corners
  doc.setFillColor(...COLORS.navy)
  doc.roundedRect(margin, 10, pageW - margin * 2, headerH, 5, 5, 'F')
  // Square off bottom corners
  doc.rect(margin, 10 + headerH - 5, pageW - margin * 2, 5, 'F')

  // Logo icon — crosshair
  const iconX = margin + 16
  const iconY = 32
  const iconR = 10
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.4)
  // Outer circle (45% opacity — simulated with lighter stroke)
  doc.setDrawColor(200, 210, 220)
  doc.circle(iconX, iconY, iconR, 'D')
  // Inner circle (full white)
  doc.setDrawColor(255, 255, 255)
  doc.setFillColor(255, 255, 255)
  doc.circle(iconX, iconY, 2.5, 'FD')
  // Crosshairs
  doc.setLineWidth(0.5)
  doc.line(iconX, iconY - iconR - 1, iconX, iconY - iconR + 5) // top
  doc.line(iconX, iconY + iconR + 1, iconX, iconY + iconR - 5) // bottom
  doc.line(iconX - iconR - 1, iconY, iconX - iconR + 5, iconY) // left
  doc.line(iconX + iconR + 1, iconY, iconX + iconR - 5, iconY) // right

  // Wordmark
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('CORE', iconX + iconR + 6, iconY - 2)
  doc.setFont('helvetica', 'bold')
  doc.text('SITE', iconX + iconR + 6, iconY + 5)

  // Centre — doc type
  const centreX = pageW / 2
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('CORE SITE', centreX, 27, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  doc.text(docType || '', centreX, 35, { align: 'center' })

  // Right — status badge
  if (status) {
    const badge = STATUS_BADGE[status.toLowerCase()] || STATUS_BADGE.open
    const statusText = status.charAt(0).toUpperCase() + status.slice(1)
    const rightX = pageW - margin - 16
    const badgeW = doc.getTextWidth(statusText) + 20
    // Badge bg
    doc.setFillColor(badge.dot[0], badge.dot[1], badge.dot[2])
    doc.setGState(doc.GState({ opacity: 0.2 }))
    doc.roundedRect(rightX - badgeW, 25, badgeW + 5, 14, 3, 3, 'F')
    doc.setGState(doc.GState({ opacity: 1 }))
    // Dot
    doc.setFillColor(badge.dot[0], badge.dot[1], badge.dot[2])
    doc.circle(rightX - badgeW + 7, 32, 2.5, 'F')
    // Text
    doc.setTextColor(badge.dot[0], badge.dot[1], badge.dot[2])
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(statusText, rightX - badgeW + 13, 34)
  }

  return 10 + headerH + 2 // return Y position after header
}

/**
 * Draw the content body frame with blue accent bar
 */
export function drawBodyFrame(doc, { startY, endY, pageW }) {
  const margin = 14
  const contentW = pageW - margin * 2

  // Border
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.rect(margin, startY, contentW, endY - startY)

  // Blue accent bar
  doc.setFillColor(...COLORS.blue)
  doc.rect(margin, startY, 3, endY - startY, 'F')

  // Round bottom corners (approximate with filled rect)
  doc.setFillColor(255, 255, 255)
}

/**
 * Draw title section
 */
export function drawTitle(doc, { title, projectName, y, margin }) {
  doc.setTextColor(...COLORS.textPrimary)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, margin + 8, y)
  y += 6
  if (projectName) {
    doc.setTextColor(...COLORS.blue)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(projectName, margin + 8, y)
    y += 4
  }
  return y + 6
}

/**
 * Draw info strip
 */
export function drawInfoStrip(doc, { items, y, margin, pageW }) {
  const contentLeft = margin + 8
  let x = contentLeft
  doc.setFontSize(10)
  items.forEach((item, i) => {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(`${item.label}: `, x, y)
    const labelW = doc.getTextWidth(`${item.label}: `)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.textPrimary)
    doc.text(item.value || '—', x + labelW, y)
    x += labelW + doc.getTextWidth(item.value || '—') + 12
    if (x > pageW - margin - 20 && i < items.length - 1) {
      x = contentLeft
      y += 5
    }
  })
  y += 4
  // Divider
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(contentLeft, y, pageW - margin - 5, y)
  return y + 6
}

/**
 * Draw description block
 */
export function drawDescription(doc, { text, y, margin, pageW }) {
  if (!text) return y
  const contentLeft = margin + 8
  const blockW = pageW - margin * 2 - 16

  // Background
  doc.setFillColor(...COLORS.bgSecondary)
  const lines = doc.splitTextToSize(text, blockW - 20)
  const blockH = Math.max(lines.length * 4.5 + 10, 20)
  doc.roundedRect(contentLeft, y, blockW, blockH, 4, 4, 'F')

  // Blue left border
  doc.setFillColor(...COLORS.blue)
  doc.rect(contentLeft, y, 2.5, blockH, 'F')

  // Text
  doc.setTextColor(...COLORS.textPrimary)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(lines, contentLeft + 10, y + 7)

  return y + blockH + 8
}

/**
 * Draw section label
 */
export function drawSectionLabel(doc, { label, y, margin }) {
  doc.setTextColor(...COLORS.navy)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(label.toUpperCase(), margin + 8, y)
  return y + 6
}

function drawCheck(doc, x, y) {
  doc.setFillColor(...COLORS.greenBg)
  doc.circle(x, y, 5, 'F')
  doc.setDrawColor(...COLORS.green)
  doc.setLineWidth(0.8)
  doc.line(x - 2.5, y, x - 0.5, y + 2)
  doc.line(x - 0.5, y + 2, x + 2.5, y - 2)
}

/**
 * Draw a 2-column card grid of people with sign-off status
 */
export function drawCardGrid(doc, { people, y, margin, pageW, checkPage }) {
  const contentLeft = margin + 8
  const cardW = (pageW - margin * 2 - 20) / 2
  const cardH = 22
  const gap = 5

  for (let i = 0; i < people.length; i += 2) {
    if (checkPage && y + cardH + 4 > 275) {
      y = checkPage()
    }

    for (let j = 0; j < 2 && i + j < people.length; j++) {
      const person = people[i + j]
      const cx = contentLeft + j * (cardW + gap)

      // Card border
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.3)
      doc.roundedRect(cx, y, cardW, cardH, 4, 4, 'D')

      // Avatar
      const avX = cx + 6
      const avY = y + cardH / 2
      doc.setFillColor(...COLORS.navy)
      doc.roundedRect(avX - 5, avY - 5, 10, 10, 2, 2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text(getInitials(person.name), avX, avY + 1.5, { align: 'center' })

      // Name
      doc.setTextColor(...COLORS.textPrimary)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      const nameText = person.name.length > 20 ? person.name.slice(0, 20) + '…' : person.name
      doc.text(nameText, avX + 8, avY - 1)

      // Secondary
      doc.setTextColor(...COLORS.textSecondary)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(person.secondary || '', avX + 8, avY + 4.5)

      // Signature image or checkmark
      if (person.signatureImg) {
        try {
          const sigW = 28
          const sigH = 9
          const sigX = cx + cardW - sigW - 4
          const sigY = avY - sigH / 2
          doc.addImage(person.signatureImg, 'PNG', sigX, sigY, sigW, sigH)
        } catch {
          // Fallback to checkmark if image fails
          drawCheck(doc, cx + cardW - 10, avY)
        }
      } else if (person.signed !== false) {
        drawCheck(doc, cx + cardW - 10, avY)
      }
    }
    y += cardH + gap
  }
  return y
}

/**
 * Draw summary row
 */
export function drawSummaryRow(doc, { label, value, y, margin, pageW }) {
  const contentLeft = margin + 8
  const rowW = pageW - margin * 2 - 16

  doc.setFillColor(...COLORS.bgSecondary)
  doc.roundedRect(contentLeft, y, rowW, 16, 4, 4, 'F')

  doc.setTextColor(...COLORS.textSecondary)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(label, contentLeft + 8, y + 10)

  doc.setTextColor(...COLORS.green)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(value, contentLeft + rowW - 8, y + 10, { align: 'right' })

  return y + 22
}

/**
 * Draw footer
 */
export function drawFooter(doc, { y, margin, pageW, pageNum }) {
  // Top border
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(margin + 8, y, pageW - margin - 5, y)
  y += 6

  doc.setTextColor(...COLORS.textTertiary)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Generated by CoreSite — Site Compliance Platform', margin + 8, y)

  const now = new Date()
  doc.text(`${formatDate(now)} ${formatTime(now)}`, pageW - margin - 5, y, { align: 'right' })

  if (pageNum) {
    doc.text(`Page ${pageNum}`, pageW / 2, y, { align: 'center' })
  }

  return y + 5
}

/**
 * SVG signature to PNG data URL converter
 */
export async function fetchSignatureAsDataUrl(url) {
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

export { formatDate, formatTime, formatDateTime, getInitials }
