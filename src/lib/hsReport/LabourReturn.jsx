import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PLEX_TABLE } from './theme'
import { PlexSectionHeader, Chips, EmptyState, SectionBlock } from './primitives'
import { buildLabourGrid } from './utils'

// Labour grid comes from the shared buildLabourGrid() in ./utils — the SAME helper
// the on-screen preview (HSReportGenerator) uses, so the two can never diverge
// (unique operatives per day, sign-ins only). Counting rules live in utils.js.
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DAY_W = 36
const TOTAL_W = 40
const AVG_W = 36

function HeaderRow() {
  return (
    <View style={PLEX_TABLE.headRow}>
      <Text style={[PLEX_TABLE.headCell, { flex: 1 }]}>Trade</Text>
      {DAY_NAMES.map(d => <Text key={d} style={[PLEX_TABLE.headCell, { width: DAY_W, textAlign: 'center' }]}>{d}</Text>)}
      <Text style={[PLEX_TABLE.headCell, { width: TOTAL_W, textAlign: 'center', color: PX.inkSoft }]}>Total</Text>
      <Text style={[PLEX_TABLE.headCell, { width: AVG_W, textAlign: 'center' }]}>Avg</Text>
    </View>
  )
}

function DataRow({ row }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={[PLEX_TABLE.primary, { flex: 1, paddingRight: 4 }]}>{row.trade}</Text>
      {row.days.map((d, i) => (
        <Text key={i} style={[s.dayCell, d > 0 ? null : s.dayEmpty]}>{d > 0 ? d : '—'}</Text>
      ))}
      <Text style={[s.dayCell, { width: TOTAL_W, fontWeight: PW.semibold }]}>{row.total}</Text>
      <Text style={[s.dayCell, { width: AVG_W, color: PX.grey }]}>{row.avg}</Text>
    </View>
  )
}

function TotalsRow({ dayCounts, grandTotal }) {
  return (
    <View style={s.totalsRow}>
      <Text style={[PLEX_TABLE.primary, { flex: 1, fontWeight: PW.semibold }]}>Total</Text>
      {dayCounts.map((d, i) => (
        <Text key={i} style={[s.dayCell, { fontWeight: PW.semibold }, d > 0 ? null : s.dayEmpty]}>{d > 0 ? d : '—'}</Text>
      ))}
      <Text style={[s.dayCell, { width: TOTAL_W, fontWeight: PW.semibold }]}>{grandTotal}</Text>
      <Text style={[s.dayCell, { width: AVG_W }]} />
    </View>
  )
}

export default function LabourReturn({ rawAttendance, operatives, theme, number = 9 }) {
  const stats = buildLabourGrid(rawAttendance, operatives)
  const accent = theme?.accent || PX.accent

  if (stats.grandTotal === 0) {
    return (
      <SectionBlock keepTogether>
        <PlexSectionHeader number={number} title="Labour return" count="0 shifts" accent={accent} />
        <EmptyState text="No attendance recorded for this period" />
      </SectionBlock>
    )
  }

  const chips = [
    { value: stats.grandTotal, label: 'Shifts worked', dot: PX.ink },
    { value: stats.uniqueOps, label: 'Unique operatives', dot: PX.ink },
    { value: stats.peakDay, label: 'Peak day', dot: PX.ink },
    { value: stats.avgDaily, label: 'Avg daily headcount', dot: PX.ink },
  ]

  return (
    <SectionBlock>
      <View wrap={false}>
        <PlexSectionHeader number={number} title="Labour return" count={`${stats.grandTotal} shifts · ${stats.uniqueOps} operatives`} accent={accent} />
        <Chips items={chips} />
      </View>
      <HeaderRow />
      {stats.rows.map(row => <DataRow key={row.trade} row={row} />)}
      <TotalsRow dayCounts={stats.dayCounts} grandTotal={stats.grandTotal} />
    </SectionBlock>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
    paddingVertical: 7,
  },
  dayCell: { width: DAY_W, fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8.5, color: PX.ink, textAlign: 'center' },
  dayEmpty: { color: PX.faint },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: PX.border,
    paddingVertical: 8,
  },
})
