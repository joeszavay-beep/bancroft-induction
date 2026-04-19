import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate } from './utils'
import { PageFrame, SectionHeader } from './primitives'

// ── Demo fallback data (Riverside Tower only) ──
const DEMO_PROJECT = 'Riverside Tower - Phase 1'
const DEMO_EQUIPMENT = [
  { description: 'PECO Lift #1',       ref: 'PL-2024-0891', patExpiry: '2026-04-14', certExpiry: '2026-04-21', safe: 'Yes' },
  { description: 'PECO Lift #2',       ref: 'PL-2024-0892', patExpiry: '2026-04-14', certExpiry: '2026-04-21', safe: 'Yes' },
  { description: 'Scaffold Tower A',   ref: 'ST-2023-4410', patExpiry: '2026-04-07', certExpiry: '2026-04-14', safe: 'No' },
  { description: 'Scaffold Tower B',   ref: 'ST-2023-4411', patExpiry: '2026-04-14', certExpiry: '2026-04-21', safe: 'Yes' },
  { description: '110V Transformer',   ref: 'TX-2022-1190', patExpiry: '2026-03-10', certExpiry: '2026-06-10', safe: 'Yes' },
  { description: 'SDS Drill (Hilti)',   ref: 'HD-2024-2281', patExpiry: '',           certExpiry: '',           safe: '' },
  { description: 'Podium Steps #3',    ref: 'PS-2023-1003', patExpiry: '2026-04-14', certExpiry: '2026-04-21', safe: 'Yes' },
  { description: 'Cable Drum Trailer', ref: 'CDT-001',      patExpiry: '2026-04-01', certExpiry: '2026-05-01', safe: 'Yes' },
]

// ── Layout ──
const ROWS_FIRST_PAGE = 18
const ROWS_PER_PAGE = 24

// ── Next-due classification (mirrors RAMS review-due logic) ──
function classifyNextDue(dateStr) {
  if (!dateStr) return 'none'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'none'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

// ── Summary strip ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Total items',    value: stats.total,         bg: C.surfaceMuted, txt: C.textPrimary,   border: C.border },
    { label: 'Inspected',      value: stats.inspected,     bg: C.greenBg,      txt: C.greenTextDark, border: C.green },
    { label: 'Failed',         value: stats.failed,        bg: C.redBg,        txt: C.redTextDark,   border: C.red },
    { label: 'Not inspected',  value: stats.notInspected,  bg: C.amberBg,      txt: C.amberTextDark, border: C.amber },
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

// ── Header row ──
function HeaderRow() {
  return (
    <View style={s.headerRow}>
      <Text style={[s.hText, { width: 22 }]}>#</Text>
      <Text style={[s.hText, { flex: 1 }]}>Item</Text>
      <Text style={[s.hText, { width: 75 }]}>Serial / ID</Text>
      <Text style={[s.hText, { width: 68, textAlign: 'center' }]}>Last inspected</Text>
      <Text style={[s.hText, { width: 65, textAlign: 'center' }]}>Next due</Text>
      <Text style={[s.hText, { width: 65, textAlign: 'center' }]}>Status</Text>
    </View>
  )
}

// ── Next due cell ──
function NextDueCell({ date }) {
  if (!date) return <Text style={[s.dateCell, { width: 65, color: C.empty }]}>{'\u2014'}</Text>
  const status = classifyNextDue(date)
  const formatted = formatDate(date, { short: true })
  if (status === 'overdue') {
    return (
      <View style={[s.dateCellView, { width: 65 }]}>
        <View style={s.pillRed}><Text style={s.pillRedText}>*{formatted}</Text></View>
      </View>
    )
  }
  if (status === 'soon') {
    return (
      <View style={[s.dateCellView, { width: 65 }]}>
        <View style={s.pillAmber}><Text style={s.pillAmberText}>{formatted}</Text></View>
      </View>
    )
  }
  return <Text style={[s.dateCell, { width: 65 }]}>{formatted}</Text>
}

// ── Status pill ──
function StatusPill({ value }) {
  if (value === 'Yes') {
    return (
      <View style={s.statusCell}>
        <View style={s.pillGreen}><Text style={s.pillGreenText}>{'\u2713'} Inspected</Text></View>
      </View>
    )
  }
  if (value === 'No') {
    return (
      <View style={s.statusCell}>
        <View style={s.pillRedStatus}><Text style={s.pillRedStatusText}>{'\u2717'} Failed</Text></View>
      </View>
    )
  }
  return (
    <View style={s.statusCell}>
      <View style={s.pillAmberStatus}><Text style={s.pillAmberStatusText}>Not inspected</Text></View>
    </View>
  )
}

// ── Data row ──
function DataRow({ row, index }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.itemCol}>{row.description || '\u2014'}</Text>
      <Text style={s.serialCol}>{row.ref || row.serial || '\u2014'}</Text>
      <Text style={s.dateCell}>{row.patExpiry ? formatDate(row.patExpiry, { short: true }) : '\u2014'}</Text>
      <NextDueCell date={row.certExpiry || row.nextDue} />
      <StatusPill value={row.safe || row.status} />
    </View>
  )
}

// ── Main component ──
export default function EquipmentRegister({ equipmentRows, projectName, pageProps }) {
  // Resolve data — use demo fallback for Riverside Tower when empty
  let rows = Array.isArray(equipmentRows) && equipmentRows.length > 0
    ? equipmentRows
    : (projectName === DEMO_PROJECT ? DEMO_EQUIPMENT : [])

  // Empty state
  if (rows.length === 0) {
    return (
      <PageFrame {...pageProps}>
        <SectionHeader number={4} title="Equipment register" context="0 items" />
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No equipment on register for this period</Text>
        </View>
      </PageFrame>
    )
  }

  // Stats
  const inspected = rows.filter(r => (r.safe || r.status) === 'Yes').length
  const failed = rows.filter(r => (r.safe || r.status) === 'No').length
  const notInspected = rows.filter(r => { const v = r.safe || r.status; return !v || v === '' }).length
  const total = rows.length

  // Reconciliation check
  if (inspected + failed + notInspected !== total) {
    console.warn(`[EquipmentRegister] Pill reconciliation failed: ${inspected} + ${failed} + ${notInspected} !== ${total}`)
  }

  // Chunk for pagination
  const chunks = []
  chunks.push(rows.slice(0, ROWS_FIRST_PAGE))
  for (let i = ROWS_FIRST_PAGE; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE))
  }

  return chunks.map((chunk, chunkIdx) => (
    <PageFrame key={`equip-${chunkIdx}`} {...pageProps}>
      {chunkIdx === 0 && (
        <SectionHeader
          number={4}
          title="Equipment register"
          context={`${total} item${total !== 1 ? 's' : ''}`}
        />
      )}
      {chunkIdx > 0 && (
        <SectionHeader number={4} title="Equipment register (continued)" />
      )}
      {chunkIdx === 0 && <SummaryStrip stats={{ total, inspected, failed, notInspected }} />}

      <HeaderRow />
      {chunk.map((row, i) => {
        const globalIdx = chunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0) + i
        return <DataRow key={globalIdx} row={row} index={globalIdx} />
      })}

      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page {'\u00b7'} {chunks.slice(0, chunkIdx + 1).reduce((sum, c) => sum + c.length, 0)} of {total} items
        </Text>
      )}
    </PageFrame>
  ))
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

  numCol: { width: 22, fontSize: 8, color: C.textFaint, textAlign: 'center' },
  itemCol: { flex: 1, fontSize: 9, color: C.textPrimary, fontWeight: FONT.medium, paddingRight: 4 },
  serialCol: { width: 75, fontSize: 8, color: C.textSecondary, paddingRight: 4 },
  dateCell: { width: 68, fontSize: 8, color: C.textPrimary, textAlign: 'center' },
  dateCellView: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  statusCell: { width: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Pill styles — match training matrix and RAMS conventions
  pillRed: {
    backgroundColor: C.redBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  pillRedText: { fontSize: 7, fontWeight: FONT.medium, color: C.redTextDark },
  pillAmber: {
    backgroundColor: C.amberBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  pillAmberText: { fontSize: 7, fontWeight: FONT.medium, color: C.amberTextDark },
  pillGreen: {
    backgroundColor: C.greenBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  pillGreenText: { fontSize: 7, fontWeight: FONT.medium, color: C.greenTextDark },
  pillRedStatus: {
    backgroundColor: C.redBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  pillRedStatusText: { fontSize: 7, fontWeight: FONT.medium, color: C.redTextDark },
  pillAmberStatus: {
    backgroundColor: C.amberBg, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  pillAmberStatusText: { fontSize: 7, fontWeight: FONT.medium, color: C.amberTextDark },

  emptyRow: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 10, color: C.textFaint, fontWeight: FONT.regular },

  continuation: {
    fontSize: 8, color: C.textFaint, textAlign: 'right',
    marginTop: 8, fontWeight: FONT.regular,
  },
})
