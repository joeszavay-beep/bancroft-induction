import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PLEX_TABLE } from './theme'
import { formatDate } from './utils'
import { PlexSectionHeader, Chips, StatusPill, EmptyState, SectionBlock } from './primitives'

const COL = { num: 16, serial: 80, last: 60, next: 58, status: 80 }

// ── Next-due classification ──
function classifyNextDue(dateStr) {
  if (!dateStr) return 'none'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'none'
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

// ── Next-due cell (colour-coded mono, matching the matrix convention) ──
function NextDueCell({ date }) {
  if (!date) return <Text style={[PLEX_TABLE.monoMuted, { width: COL.next }]}>—</Text>
  const status = classifyNextDue(date)
  const formatted = formatDate(date, { short: true })
  if (status === 'overdue') return <Text style={[s.mono, { width: COL.next, color: PX.red, fontWeight: PW.semibold }]}>*{formatted}</Text>
  if (status === 'soon') return <Text style={[s.mono, { width: COL.next, color: PX.amber, fontWeight: PW.semibold }]}>{formatted}</Text>
  return <Text style={[s.mono, { width: COL.next }]}>{formatted}</Text>
}

// ── Status pill (right-aligned) ──
function EquipStatus({ value }) {
  let tone = 'amber', label = 'NOT INSPECTED'
  if (value === 'Yes') { tone = 'green'; label = 'INSPECTED' }
  else if (value === 'No') { tone = 'red'; label = 'FAILED' }
  return (
    <View style={s.statusCell}>
      <StatusPill label={label} tone={tone} />
    </View>
  )
}

function HeaderRow() {
  return (
    <View style={PLEX_TABLE.headRow}>
      <Text style={[PLEX_TABLE.headCell, { width: COL.num }]}>#</Text>
      <Text style={[PLEX_TABLE.headCell, { flex: 1 }]}>Item</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.serial }]}>Serial / ID</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.last }]}>Last insp.</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.next }]}>Next due</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.status, textAlign: 'right' }]}>Status</Text>
    </View>
  )
}

function DataRow({ row, index }) {
  return (
    <View style={PLEX_TABLE.row} wrap={false}>
      <Text style={[PLEX_TABLE.num, { width: COL.num }]}>{index + 1}</Text>
      <Text style={[PLEX_TABLE.primary, { flex: 1, paddingRight: 6 }]}>{row.description || '—'}</Text>
      <Text style={[s.mono, { width: COL.serial, color: PX.grey }]}>{row.ref || row.serial || '—'}</Text>
      <Text style={[s.mono, { width: COL.last }]}>{row.patExpiry ? formatDate(row.patExpiry, { short: true }) : '—'}</Text>
      <NextDueCell date={row.certExpiry || row.nextDue} />
      <EquipStatus value={row.safe || row.status} />
    </View>
  )
}

export default function EquipmentRegister({ equipmentRows, theme, number = 4 }) {
  const rows = Array.isArray(equipmentRows) ? equipmentRows : []
  const accent = theme?.accent || PX.accent

  if (rows.length === 0) {
    return (
      <SectionBlock keepTogether>
        <PlexSectionHeader number={number} title="Equipment register" count="0 items" accent={accent} />
        <EmptyState text="No equipment on register for this period" />
      </SectionBlock>
    )
  }

  const inspected = rows.filter(r => (r.safe || r.status) === 'Yes').length
  const failed = rows.filter(r => (r.safe || r.status) === 'No').length
  const notInspected = rows.filter(r => { const v = r.safe || r.status; return !v || v === '' }).length
  const total = rows.length

  if (inspected + failed + notInspected !== total) {
    console.warn(`[EquipmentRegister] Pill reconciliation failed: ${inspected} + ${failed} + ${notInspected} !== ${total}`)
  }

  const chips = [
    { value: total, label: 'Total items', dot: PX.ink },
    { value: inspected, label: 'Inspected', dot: PX.green },
    { value: failed, label: 'Failed', dot: PX.red },
    { value: notInspected, label: 'Not inspected', dot: PX.amber },
  ]

  return (
    <SectionBlock>
      <View wrap={false}>
        <PlexSectionHeader number={number} title="Equipment register" count={`${total} item${total !== 1 ? 's' : ''}`} accent={accent} />
        <Chips items={chips} />
      </View>
      <HeaderRow />
      {rows.map((row, i) => <DataRow key={i} row={row} index={i} />)}
    </SectionBlock>
  )
}

const s = StyleSheet.create({
  mono: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.ink },
  statusCell: { width: COL.status, flexDirection: 'row', justifyContent: 'flex-end' },
})
