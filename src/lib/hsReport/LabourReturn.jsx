import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { PageFrame, SectionHeader } from './primitives'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROWS_FIRST_PAGE = 18
const ROWS_PER_PAGE = 24

// ── Helpers ──
function dayIndex(dateStr) {
  const d = new Date(dateStr)
  const dow = d.getDay() // 0=Sun
  return dow === 0 ? 6 : dow - 1 // Mon=0 .. Sun=6
}

function buildTradeGrid(attendance, operatives) {
  const opMap = new Map()
  if (Array.isArray(operatives)) {
    operatives.forEach(op => opMap.set(op.id, op))
  }

  const signIns = (attendance || []).filter(r => r.type === 'sign_in')
  const trades = {}
  const uniqueOps = new Set()
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]

  signIns.forEach(rec => {
    const op = opMap.get(rec.operative_id)
    const trade = op?.role || 'General'
    if (!trades[trade]) trades[trade] = { trade, days: [0, 0, 0, 0, 0, 0, 0], total: 0 }
    const idx = dayIndex(rec.recorded_at)
    trades[trade].days[idx]++
    trades[trade].total++
    dayCounts[idx]++
    if (rec.operative_id) uniqueOps.add(rec.operative_id)
  })

  // Sort alphabetically
  const rows = Object.values(trades).sort((a, b) => a.trade.localeCompare(b.trade))

  // Compute avg per trade: total / days where trade had ≥1 sign_in
  rows.forEach(r => {
    const activeDays = r.days.filter(d => d > 0).length
    r.avg = activeDays > 0 ? (r.total / activeDays).toFixed(1) : '0.0'
  })

  // Grand totals
  const grandTotal = signIns.length
  const activeDaysOverall = dayCounts.filter(d => d > 0).length
  const avgDaily = activeDaysOverall > 0 ? (grandTotal / activeDaysOverall).toFixed(1) : '0.0'

  // Peak day
  const peakIdx = dayCounts.indexOf(Math.max(...dayCounts))
  const peakDay = dayCounts[peakIdx] > 0 ? `${DAY_NAMES[peakIdx]} (${dayCounts[peakIdx]})` : '\u2014'

  return { rows, dayCounts, grandTotal, uniqueOps: uniqueOps.size, avgDaily, peakDay }
}

// ── Summary strip ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Shifts worked',     value: stats.grandTotal },
    { label: 'Unique operatives', value: stats.uniqueOps },
    { label: 'Peak day',          value: stats.peakDay },
    { label: 'Avg daily headcount', value: stats.avgDaily },
  ]
  return (
    <View style={s.summaryRow}>
      {tiles.map((t, i) => (
        <View key={i} style={s.summaryTile}>
          <Text style={s.summaryValue}>{t.value}</Text>
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
      <Text style={[s.hText, { flex: 1 }]}>Trade</Text>
      {DAY_NAMES.map(d => (
        <Text key={d} style={[s.hText, s.dayCol]}>{d}</Text>
      ))}
      <Text style={[s.hText, s.totalCol]}>Total</Text>
      <Text style={[s.hText, s.avgCol]}>Avg</Text>
    </View>
  )
}

// ── Data row ──
function DataRow({ row, index }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.tradeCol}>{row.trade}</Text>
      {row.days.map((d, i) => (
        <Text key={i} style={s.dayCell}>{d > 0 ? d : '\u2014'}</Text>
      ))}
      <Text style={s.totalCell}>{row.total}</Text>
      <Text style={s.avgCell}>{row.avg}</Text>
    </View>
  )
}

// ── Totals row ──
function TotalsRow({ dayCounts, grandTotal, avgDaily }) {
  return (
    <View style={s.totalsRow}>
      <Text style={s.numCol}></Text>
      <Text style={[s.tradeCol, { fontWeight: FONT.medium }]}>Total</Text>
      {dayCounts.map((d, i) => (
        <Text key={i} style={[s.dayCell, { fontWeight: FONT.medium }]}>{d > 0 ? d : '\u2014'}</Text>
      ))}
      <Text style={[s.totalCell, { fontWeight: FONT.medium }]}>{grandTotal}</Text>
      <Text style={[s.avgCell, { fontWeight: FONT.medium, color: C.textPrimary }]}>{avgDaily}</Text>
    </View>
  )
}

// ── Main component ──
export default function LabourReturn({ rawAttendance, operatives, pageProps, theme }) {
  const stats = buildTradeGrid(rawAttendance, operatives)

  // Empty state
  if (stats.grandTotal === 0) {
    return (
      <PageFrame {...pageProps}>
        <SectionHeader number={9} title="Labour return" context="0 shifts" theme={theme} />
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No attendance recorded for this period</Text>
        </View>
      </PageFrame>
    )
  }

  // Chunk for pagination
  const chunks = []
  chunks.push(stats.rows.slice(0, ROWS_FIRST_PAGE))
  for (let i = ROWS_FIRST_PAGE; i < stats.rows.length; i += ROWS_PER_PAGE) {
    chunks.push(stats.rows.slice(i, i + ROWS_PER_PAGE))
  }

  return chunks.map((chunk, chunkIdx) => (
    <PageFrame key={`labour-${chunkIdx}`} {...pageProps}>
      {chunkIdx === 0 && (
        <SectionHeader
          number={9}
          title="Labour return"
          context={`${stats.grandTotal} shifts \u00b7 ${stats.uniqueOps} operatives`}
          theme={theme}
        />
      )}
      {chunkIdx > 0 && (
        <SectionHeader number={9} title="Labour return (continued)" theme={theme} />
      )}
      {chunkIdx === 0 && <SummaryStrip stats={stats} />}

      <HeaderRow />
      {chunk.map((row, i) => {
        const globalIdx = chunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0) + i
        return <DataRow key={row.trade} row={row} index={globalIdx} />
      })}

      {/* Totals row on last page only */}
      {chunkIdx === chunks.length - 1 && (
        <TotalsRow dayCounts={stats.dayCounts} grandTotal={stats.grandTotal} avgDaily={stats.avgDaily} />
      )}

      {/* Continuation cue */}
      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page {'\u00b7'} {chunks.slice(0, chunkIdx + 1).reduce((sum, c) => sum + c.length, 0)} of {stats.rows.length} trades
        </Text>
      )}
    </PageFrame>
  ))
}

// ── Styles ──
const s = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryTile: {
    flex: 1, borderWidth: 0.5, borderColor: C.border, borderRadius: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surfaceMuted,
  },
  summaryValue: { fontSize: 14, fontWeight: FONT.medium, color: C.textPrimary },
  summaryLabel: { fontSize: 8, color: C.textMuted, fontWeight: FONT.regular },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingBottom: 4, marginBottom: 2,
  },
  hText: { fontSize: 7.5, fontWeight: FONT.medium, color: C.textSecondary, letterSpacing: 0.3, flexShrink: 0 },
  dayCol: { width: 36, textAlign: 'center' },
  totalCol: { width: 38, textAlign: 'center' },
  avgCol: { width: 36, textAlign: 'center' },

  dataRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: SIZE.rowHeight, borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted, paddingVertical: 2,
  },
  rowShaded: { backgroundColor: C.rowShade },

  numCol: { width: 22, fontSize: 8, color: C.textFaint, textAlign: 'center' },
  tradeCol: { flex: 1, fontSize: 9, color: C.textPrimary, fontWeight: FONT.regular, paddingRight: 4 },
  dayCell: { width: 36, fontSize: 9, color: C.textPrimary, textAlign: 'center' },
  totalCell: { width: 38, fontSize: 9, color: C.textPrimary, textAlign: 'center', fontWeight: FONT.medium },
  avgCell: { width: 36, fontSize: 8, color: C.textMuted, textAlign: 'center' },

  totalsRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: SIZE.rowHeight, borderTopWidth: 1,
    borderTopColor: C.border, paddingVertical: 3,
    backgroundColor: C.rowShade,
  },

  emptyRow: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 10, color: C.textFaint, fontWeight: FONT.regular },

  continuation: {
    fontSize: 8, color: C.textFaint, textAlign: 'right',
    marginTop: 8, fontWeight: FONT.regular,
  },
})
