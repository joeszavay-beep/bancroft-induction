import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PLEX_TABLE } from './theme'
import { PlexSectionHeader, Chips, EmptyState, SectionBlock } from './primitives'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_W = 44

// ── Cell mark (Y / N / N/A / —) ──
function Cell({ value }) {
  if (value === 'Y') return <Text style={[s.cell, { color: PX.green }]}>Y</Text>
  if (value === 'N') return <Text style={[s.cell, { color: PX.red }]}>N</Text>
  if (value === 'N/A' || value === 'NA') return <Text style={[s.cellNa]}>N/A</Text>
  return <Text style={[s.cellEmpty]}>—</Text>
}

function HeaderRow() {
  return (
    <View style={PLEX_TABLE.headRow}>
      <Text style={[PLEX_TABLE.headCell, { flex: 1 }]}>Item</Text>
      {DAY_HEADERS.map(d => <Text key={d} style={[PLEX_TABLE.headCell, { width: DAY_W, textAlign: 'center' }]}>{d}</Text>)}
    </View>
  )
}

function DataRow({ item, dayValues }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={[PLEX_TABLE.primary, { flex: 1, paddingRight: 4 }]}>{item}</Text>
      {dayValues.map((v, i) => (
        <View key={i} style={s.cellWrap}><Cell value={v} /></View>
      ))}
    </View>
  )
}

export default function SafeStartCards({ safeStartCards, safeStartCompany, safeStartSupervisor, safeStartTrade, theme, number = 10 }) {
  const cards = Array.isArray(safeStartCards) ? safeStartCards : []
  const accent = theme?.accent || PX.accent
  const daysWithData = cards.filter(c => c.hasData).length

  if (daysWithData === 0) {
    return (
      <SectionBlock keepTogether>
        <PlexSectionHeader number={number} title="Safe start cards" count="0 of 7 days recorded" accent={accent} />
        <EmptyState text="No safe start records for this period" />
      </SectionBlock>
    )
  }

  const itemLabels = cards[0]?.checks?.map(c => c.label) || []
  const totalCells = itemLabels.length * 7

  let confirmed = 0
  let flagged = 0
  for (const card of cards) {
    for (const check of (card.checks || [])) {
      if (check.value === 'Y') confirmed++
      else if (check.value === 'N') flagged++
    }
  }
  const notRecorded = totalCells - confirmed - flagged

  if (confirmed + flagged + notRecorded !== totalCells) {
    console.warn(`[SafeStartCards] Pill reconciliation failed: ${confirmed} + ${flagged} + ${notRecorded} !== ${totalCells}`)
  }

  const nonEmptyColumns = DAY_HEADERS.map((_, colIdx) =>
    cards[colIdx]?.checks?.some(c => c.value && c.value !== '') || false
  ).filter(Boolean).length
  if (daysWithData !== nonEmptyColumns) {
    console.warn(`[SafeStartCards] Day alignment mismatch: subtitle says ${daysWithData} days but ${nonEmptyColumns} columns have data`)
  }

  const chips = [
    { value: totalCells, label: 'Total items', dot: PX.ink },
    { value: confirmed, label: 'Confirmed', dot: PX.green },
    { value: flagged, label: 'Flagged', dot: PX.red },
    { value: notRecorded, label: 'Not recorded', dot: PX.amber },
  ]

  return (
    <SectionBlock>
      <View wrap={false}>
        <PlexSectionHeader number={number} title="Safe start cards" count={`${daysWithData} of 7 days recorded`} accent={accent} />
        <Chips items={chips} />
        <Text style={s.metadata}>
          Company: {safeStartCompany || '—'} · Supervisor: {safeStartSupervisor || '—'} · Trade: {safeStartTrade || '—'}
        </Text>
      </View>

      <HeaderRow />
      {itemLabels.map((label, rowIdx) => {
        const dayValues = cards.map(card => card.checks?.[rowIdx]?.value || '')
        return <DataRow key={rowIdx} item={label} dayValues={dayValues} />
      })}
    </SectionBlock>
  )
}

const s = StyleSheet.create({
  metadata: { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8, color: PX.muted, marginBottom: 10, marginTop: -4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
    paddingVertical: 7,
  },
  cellWrap: { width: DAY_W, alignItems: 'center', justifyContent: 'center' },
  cell: { fontFamily: PLEX.mono, fontWeight: PW.semibold, fontSize: 9 },
  cellNa: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 7.5, color: PX.amber },
  cellEmpty: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 9, color: PX.faint },
})
