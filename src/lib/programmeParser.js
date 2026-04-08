/**
 * Parse an Asta Powerproject / MS Project PDF export into structured activities.
 * Extracts activity names, dates, durations from the text content.
 */

const DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/g
const DURATION_RE = /(\d+w?\s*\d*\.?\d*d?\s*\d*\.?\d*h?)/

// Section headers — activities with sub-activities beneath them
const SECTION_KEYWORDS = [
  'Full Height Partitions', 'Low Level Works', 'High Level Mechanical',
  'High Level Electrical', 'Level 8 SER', 'Ceilings', 'Ceiling',
  'High Level - 2nd Fix', 'Finishes', 'Finals & Commissioning',
  'Network', 'Welfare', 'furniture',
]

/**
 * Parse raw text items from PDF.js into structured activities
 * @param {Array<{str: string, transform: number[]}>} textItems - from page.getTextContent()
 * @param {number} pageNum - page number
 * @returns {Array<{line, name, startDate, duration, finishDate, section, isSummary}>}
 */
export function parsePageItems(textItems, pageNum) {
  // Group items by Y position (same row)
  const rows = {}
  for (const item of textItems) {
    if (!item.str.trim()) continue
    const y = Math.round(item.transform[5] / 2) * 2 // group within 2px
    const key = `${pageNum}_${y}`
    if (!rows[key]) rows[key] = []
    rows[key].push({
      text: item.str.trim(),
      x: Math.round(item.transform[4]),
      y: item.transform[5],
    })
  }

  const activities = []
  let currentSection = ''

  // Sort rows by Y descending (PDF coordinates: top of page = high Y)
  const sortedRows = Object.entries(rows)
    .map(([key, items]) => ({ key, items: items.sort((a, b) => a.x - b.x), y: items[0].y }))
    .sort((a, b) => b.y - a.y)

  for (const row of sortedRows) {
    const texts = row.items.map(i => i.text)
    const joined = texts.join(' ')

    // Skip headers
    if (joined.includes('Morgan Lewis') || joined.includes('Page ') ||
        joined.includes('Line') && joined.includes('Name') && joined.includes('Start')) continue
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)/.test(joined)) continue

    // Parse: first item should be a line number
    const lineNum = parseInt(texts[0])
    if (!lineNum || lineNum < 1 || lineNum > 500) continue
    if (texts.length < 2) continue

    // Extract the activity name — everything before the first date
    const fullText = texts.slice(1).join(' ')
    const dateMatch = fullText.match(/\d{2}\/\d{2}\/\d{4}/)
    const name = dateMatch
      ? fullText.slice(0, dateMatch.index).replace(/\s+/g, ' ').trim()
      : fullText.replace(/\s+/g, ' ').trim()

    if (!name || name.length < 3) continue

    // Extract dates
    const dates = [...fullText.matchAll(DATE_RE)].map(m => {
      const [, day, month, year] = m
      return `${year}-${month}-${day}`
    })

    // Extract duration (between first and second date, or after name)
    const afterName = dateMatch ? fullText.slice(dateMatch.index) : ''
    const durMatch = afterName.match(/(\d+w\s*\d*\.?\d*d?)|(^\d+d)/)
    const duration = durMatch ? durMatch[0].trim() : ''

    // Check if this is a section header
    const isSummary = SECTION_KEYWORDS.some(kw => name.toLowerCase().includes(kw.toLowerCase()))
    if (isSummary) currentSection = name

    activities.push({
      line: lineNum,
      name,
      startDate: dates[0] || null,
      duration: duration || null,
      finishDate: dates[1] || dates[0] || null,
      section: currentSection || null,
      isSummary,
    })
  }

  return activities
}

/**
 * Parse a full programme PDF ArrayBuffer
 * @param {ArrayBuffer} pdfData
 * @returns {Promise<{activities: Array, metadata: object}>}
 */
export async function parseProgrammePDF(pdfData) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise
  const allActivities = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const textContent = await page.getTextContent()
    const pageActivities = parsePageItems(textContent.items, p)
    allActivities.push(...pageActivities)
  }

  // Deduplicate by line number (keep first occurrence with dates)
  const seen = new Map()
  for (const act of allActivities) {
    const existing = seen.get(act.line)
    if (!existing || (!existing.startDate && act.startDate)) {
      seen.set(act.line, act)
    }
  }

  const unique = [...seen.values()].sort((a, b) => a.line - b.line)

  // Assign sections to non-summary activities
  let lastSection = ''
  for (const act of unique) {
    if (act.isSummary) {
      lastSection = act.name
    } else if (!act.section) {
      act.section = lastSection
    }
  }

  // Extract metadata from first page text
  const firstPageText = allActivities.length > 0 ? '' : ''
  const metadata = {
    pageCount: doc.numPages,
    activityCount: unique.length,
    summaryCount: unique.filter(a => a.isSummary).length,
  }

  return { activities: unique, metadata }
}
