import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { PageFrame, SectionHeader } from './primitives'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_COL_WIDTH = 44

// ── Summary strip ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Total items',   value: stats.total,       bg: C.surfaceMuted, txt: C.textPrimary,   border: C.border },
    { label: 'Confirmed',     value: stats.confirmed,   bg: C.greenBg,      txt: C.greenTextDark, border: C.green },
    { label: 'Flagged',       value: stats.flagged,      bg: C.redBg,        txt: C.redTextDark,   border: C.red },
    { label: 'Not recorded',  value: stats.notRecorded,  bg: C.amberBg,      txt: C.amberTextDark, border: C.amber },
  ]
  return (
    <View style={s.summaryRow}>
      {tiles.map((t, i) => (
        <View key={i} style={[s.summaryTile, { backgroundColor: t.bg, borderColor: t.border }]}>
          <Text style={[s.summaryValue, { color: t.txt }]}>{t.value}</Text>
          <Text style={s.summaryLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Metadata strip ──
function MetadataStrip({ company, supervisor, trade }) {
  return (
    <Text style={s.metadata}>
      Company: {company || '\u2014'} {'\u00b7'} Supervisor: {supervisor || '\u2014'} {'\u00b7'} Trade: {trade || '\u2014'}
    </Text>
  )
}

// ── Header row ──
function HeaderRow() {
  return (
    <View style={s.headerRow}>
      <Text style={[s.hText, { flex: 1 }]}>Item</Text>
      {DAY_HEADERS.map(d => (
        <Text key={d} style={[s.hText, { width: DAY_COL_WIDTH, textAlign: 'center' }]}>{d}</Text>
      ))}
    </View>
  )
}

// ── Cell pill ──
function CellPill({ value }) {
  if (value === 'Y') {
    return (
      <View style={s.cellView}>
        <View style={s.pillGreen}><Text style={s.pillGreenText}>Y</Text></View>
      </View>
    )
  }
  if (value === 'N') {
    return (
      <View style={s.cellView}>
        <View style={s.pillRed}><Text style={s.pillRedText}>N</Text></View>
      </View>
    )
  }
  if (value === 'N/A' || value === 'NA') {
    return (
      <View style={s.cellView}>
        <View style={s.pillAmber}><Text style={s.pillAmberText}>N/A</Text></View>
      </View>
    )
  }
  return (
    <View style={s.cellView}>
      <Text style={s.emDash}>{'\u2014'}</Text>
    </View>
  )
}

// ── Data row ──
function DataRow({ item, dayValues, index }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.itemCol}>{item}</Text>
      {dayValues.map((v, i) => (
        <CellPill key={i} value={v} />
      ))}
    </View>
  )
}

// ── Main component ──
export default function SafeStartCards({ safeStartCards, safeStartCompany, safeStartSupervisor, safeStartTrade, pageProps }) {
  const cards = Array.isArray(safeStartCards) ? safeStartCards : []

  // Check if any day has data
  const daysWithData = cards.filter(c => c.hasData).length

  // Empty state — all 7 days empty
  if (daysWithData === 0) {
    return (
      <PageFrame {...pageProps}>
        <SectionHeader number={10} title="Safe start cards" context="0 of 7 days recorded" />
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No safe start records for this period</Text>
        </View>
      </PageFrame>
    )
  }

  // Build the items × days matrix
  // Assume all cards have the same checks in the same order (they do — SS_ITEMS)
  const itemLabels = cards[0]?.checks?.map(c => c.label) || []
  const itemCount = itemLabels.length
  const totalCells = itemCount * 7 // 10 items × 7 days = 70

  // Count stats across all cells
  let confirmed = 0
  let flagged = 0
  for (const card of cards) {
    for (const check of (card.checks || [])) {
      if (check.value === 'Y') confirmed++
      else if (check.value === 'N') flagged++
    }
  }
  const notRecorded = totalCells - confirmed - flagged

  // Reconciliation checks
  if (confirmed + flagged + notRecorded !== totalCells) {
    console.warn(`[SafeStartCards] Pill reconciliation failed: ${confirmed} + ${flagged} + ${notRecorded} !== ${totalCells}`)
  }

  // Day-column alignment check: subtitle day count must match non-empty column count
  const nonEmptyColumns = DAY_HEADERS.map((_, colIdx) => {
    return cards[colIdx]?.checks?.some(c => c.value && c.value !== '') || false
  }).filter(Boolean).length
  if (daysWithData !== nonEmptyColumns) {
    console.warn(`[SafeStartCards] Day alignment mismatch: subtitle says ${daysWithData} days but ${nonEmptyColumns} columns have data`)
  }

  return (
    <PageFrame {...pageProps}>
      <SectionHeader
        number={10}
        title="Safe start cards"
        context={`${daysWithData} of 7 days recorded`}
      />

      <SummaryStrip stats={{ total: totalCells, confirmed, flagged, notRecorded }} />

      <MetadataStrip
        company={safeStartCompany}
        supervisor={safeStartSupervisor}
        trade={safeStartTrade}
      />

      <HeaderRow />

      {itemLabels.map((label, rowIdx) => {
        // For each item, collect the value from each day's card
        const dayValues = cards.map(card => {
          const check = card.checks?.[rowIdx]
          return check?.value || ''
        })
        return <DataRow key={rowIdx} item={label} dayValues={dayValues} index={rowIdx} />
      })}
    </PageFrame>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryTile: {
    flex: 1, borderWidth: 0.5, borderRadius: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  summaryValue: { fontSize: 14, fontWeight: FONT.medium },
  summaryLabel: { fontSize: 8, color: C.textMuted, fontWeight: FONT.regular },

  metadata: {
    fontSize: 8, color: C.textMuted, fontWeight: FONT.regular,
    marginBottom: 8,
  },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingBottom: 4, marginBottom: 2,
  },
  hText: { fontSize: 7.5, fontWeight: FONT.medium, color: C.textSecondary, letterSpacing: 0.3, flexShrink: 0 },

  dataRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: SIZE.rowHeight, borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted, paddingVertical: 2,
  },
  rowShaded: { backgroundColor: C.rowShade },

  itemCol: { flex: 1, fontSize: 9, color: C.textPrimary, fontWeight: FONT.regular, paddingRight: 4 },

  cellView: {
    width: DAY_COL_WIDTH, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  emDash: { fontSize: 9, color: C.empty },

  pillGreen: {
    backgroundColor: C.greenBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  pillGreenText: { fontSize: 7.5, fontWeight: FONT.medium, color: C.greenTextDark },
  pillRed: {
    backgroundColor: C.redBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  pillRedText: { fontSize: 7.5, fontWeight: FONT.medium, color: C.redTextDark },
  pillAmber: {
    backgroundColor: C.amberBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  pillAmberText: { fontSize: 7, fontWeight: FONT.medium, color: C.amberTextDark },

  emptyRow: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 10, color: C.textFaint, fontWeight: FONT.regular },
})
