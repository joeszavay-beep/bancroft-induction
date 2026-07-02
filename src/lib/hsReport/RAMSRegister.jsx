import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PLEX_TABLE } from './theme'
import { formatDate } from './utils'
import { PlexSectionHeader, Chips, EmptyState, SectionBlock } from './primitives'

// Reads the dedicated Risk Assessments section: `documents` rows with
// doc_type='rams' plus their valid operative `signatures` (loaded in
// HSReportGenerator, company+project scoped). Sign-off = signatures held /
// active operatives on the project.
const COL = { num: 16, ref: 64, rev: 32, review: 56, signoff: 48 }

function classifyReviewDate(reviewDate) {
  if (!reviewDate) return 'none'
  const review = new Date(reviewDate)
  if (isNaN(review.getTime())) return 'none'
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const diffDays = (review.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

function ReviewCell({ date }) {
  if (!date) return <Text style={[s.mono, { width: COL.review, color: PX.faint }]}>—</Text>
  const status = classifyReviewDate(date)
  const formatted = formatDate(date, { short: true })
  if (status === 'overdue') return <Text style={[s.mono, { width: COL.review, color: PX.red, fontWeight: PW.semibold }]}>*{formatted}</Text>
  if (status === 'soon') return <Text style={[s.mono, { width: COL.review, color: PX.amber, fontWeight: PW.semibold }]}>{formatted}</Text>
  return <Text style={[s.mono, { width: COL.review }]}>{formatted}</Text>
}

function HeaderRow() {
  return (
    <View style={PLEX_TABLE.headRow}>
      <Text style={[PLEX_TABLE.headCell, { width: COL.num }]}>#</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.ref }]}>Reference</Text>
      <Text style={[PLEX_TABLE.headCell, { flex: 1 }]}>Title</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.rev, textAlign: 'center' }]}>Rev</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.review }]}>Review due</Text>
      <Text style={[PLEX_TABLE.headCell, { width: COL.signoff, textAlign: 'center' }]}>Sign-off</Text>
    </View>
  )
}

function DataRow({ row, index }) {
  const complete = row.totalOps > 0 && row.signedCount >= row.totalOps
  return (
    <View style={PLEX_TABLE.row} wrap={false}>
      <Text style={[PLEX_TABLE.num, { width: COL.num }]}>{index + 1}</Text>
      <Text style={[s.mono, { width: COL.ref, color: PX.grey }]}>{row.doc_ref || '—'}</Text>
      <Text style={[PLEX_TABLE.primary, { flex: 1, paddingRight: 6 }]}>{row.title || '—'}</Text>
      <Text style={[PLEX_TABLE.cellMuted, { width: COL.rev, textAlign: 'center' }]}>{row.revision || `v${row.version || 1}`}</Text>
      <ReviewCell date={row.review_date} />
      <Text style={[s.mono, { width: COL.signoff, textAlign: 'center' }, complete ? { color: PX.green, fontWeight: PW.semibold } : null]}>
        {row.signedCount}/{row.totalOps}
      </Text>
    </View>
  )
}

function Legend() {
  const items = [
    { color: PX.red, label: 'Review overdue (*)' },
    { color: PX.amber, label: 'Review due ≤30 days' },
    { color: PX.faint, label: 'No record (—)' },
  ]
  return (
    <View style={PLEX_TABLE.legend}>
      {items.map((l, i) => (
        <View key={i} style={PLEX_TABLE.legendItem}>
          <View style={[PLEX_TABLE.legendDot, { backgroundColor: l.color }]} />
          <Text style={PLEX_TABLE.legendLabel}>{l.label}</Text>
        </View>
      ))}
    </View>
  )
}

export default function RAMSRegister({ rawRams, theme, number = 8 }) {
  const docs = rawRams?.docs || []
  const signatures = rawRams?.signatures || []
  const totalOps = rawRams?.totalOps || 0
  const accent = theme?.accent || PX.accent

  const rows = docs
    .map(d => ({
      ...d,
      signedCount: signatures.filter(sig => sig.document_id === d.id).length,
      totalOps,
    }))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))

  const active = rows.length
  const overdue = rows.filter(r => classifyReviewDate(r.review_date) === 'overdue').length
  const soon = rows.filter(r => classifyReviewDate(r.review_date) === 'soon').length
  const incomplete = rows.filter(r => r.signedCount < r.totalOps).length

  if (rows.length === 0) {
    return (
      <SectionBlock keepTogether>
        <PlexSectionHeader number={number} title="RAMS register" count="0 documents" accent={accent} />
        <EmptyState text="No risk assessments registered for this project" />
      </SectionBlock>
    )
  }

  const chips = [
    { value: active, label: 'Active', dot: PX.ink },
    { value: overdue, label: 'Review overdue', dot: PX.red },
    { value: soon, label: 'Review ≤30d', dot: PX.amber },
    { value: incomplete, label: 'Sign-off incomplete', dot: PX.red },
  ]

  return (
    <SectionBlock>
      <View wrap={false}>
        <PlexSectionHeader number={number} title="RAMS register" count={`${active} document${active !== 1 ? 's' : ''}`} accent={accent} />
        <Chips items={chips} />
      </View>
      <HeaderRow />
      {rows.map((row, i) => <DataRow key={row.id || i} row={row} index={i} />)}
      <Legend />
    </SectionBlock>
  )
}

const s = StyleSheet.create({
  mono: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 7.5, color: PX.ink },
})
