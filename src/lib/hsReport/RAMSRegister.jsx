import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate } from './utils'
import { PageFrame, SectionHeader } from './primitives'

// ── Layout ──
const ROWS_FIRST_PAGE = 16
const ROWS_PER_PAGE = 22

// ── Helpers ──
function classifyReviewDate(reviewDate) {
  if (!reviewDate) return 'none'
  const review = new Date(reviewDate)
  if (isNaN(review.getTime())) return 'none'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = (review.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

// ── Summary strip ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Active',              value: stats.active,     bg: C.surfaceMuted, txt: C.textPrimary,    border: C.border },
    { label: 'Review overdue',      value: stats.overdue,    bg: C.redBg,        txt: C.redTextDark,    border: C.red },
    { label: 'Review \u226430d',   value: stats.soon,       bg: C.amberBg,      txt: C.amberTextDark,  border: C.amber },
    { label: 'Sign-off incomplete', value: stats.incomplete,  bg: C.redBg,        txt: C.redTextDark,    border: C.red },
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
      <Text style={[s.hText, { width: 70 }]}>Reference</Text>
      <Text style={[s.hText, { flex: 1 }]}>Title</Text>
      <Text style={[s.hText, { width: 36, textAlign: 'center' }]}>Rev</Text>
      <Text style={[s.hText, { width: 65 }]}>Issued for</Text>
      <Text style={[s.hText, { width: 58, textAlign: 'center' }]}>Review due</Text>
      <Text style={[s.hText, { width: 50, textAlign: 'center' }]}>Sign-off</Text>
      <Text style={[s.hText, { width: 80 }]}>Uploaded by</Text>
    </View>
  )
}

// ── Review date cell ──
function ReviewCell({ date }) {
  if (!date) return <Text style={[s.cellCenter, { width: 58, color: C.empty }]}>{'\u2014'}</Text>
  const status = classifyReviewDate(date)
  const formatted = formatDate(date, { short: true })
  if (status === 'overdue') {
    return (
      <View style={[s.cellCenter, { width: 58 }]}>
        <View style={s.pillRed}><Text style={s.pillRedText}>*{formatted}</Text></View>
      </View>
    )
  }
  if (status === 'soon') {
    return (
      <View style={[s.cellCenter, { width: 58 }]}>
        <View style={s.pillAmber}><Text style={s.pillAmberText}>{formatted}</Text></View>
      </View>
    )
  }
  return <Text style={[s.cellCenter, { width: 58 }]}>{formatted}</Text>
}

// ── Data row ──
function DataRow({ row, index }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.refCol}>{row.doc_ref || '\u2014'}</Text>
      <Text style={s.titleCol}>{row.title || '\u2014'}</Text>
      <Text style={s.revCol}>{row.revision || '\u2014'}</Text>
      <Text style={s.issuedForCol}>{row.issued_for || '\u2014'}</Text>
      <ReviewCell date={row.review_date} />
      <Text style={s.signoffCol}>
        {row.requires_signoff ? `${row.signedCount}/${row.totalSignoffs}` : '\u2014'}
      </Text>
      <Text style={s.uploadedByCol}>{row.uploaded_by || '\u2014'}</Text>
    </View>
  )
}

// ── Legend ──
function Legend() {
  return (
    <View style={s.legend}>
      <View style={s.legendItem}>
        <View style={s.pillRed}><Text style={s.pillRedText}>*DD/MM/YY</Text></View>
        <Text style={s.legendLabel}>Review overdue</Text>
      </View>
      <View style={s.legendItem}>
        <View style={s.pillAmber}><Text style={s.pillAmberText}>DD/MM/YY</Text></View>
        <Text style={s.legendLabel}>Review due within 30 days</Text>
      </View>
      <View style={s.legendItem}>
        <Text style={{ fontSize: 9, color: C.empty }}>{'\u2014'}</Text>
        <Text style={s.legendLabel}>No record</Text>
      </View>
    </View>
  )
}

// ── Main component ──
export default function RAMSRegister({ rawRams, pageProps }) {
  const docs = rawRams?.docs || []
  const signoffs = rawRams?.signoffs || []

  // Build rows with signoff counts, sorted by title
  const rows = docs
    .filter(d => !d.is_archived)
    .map(d => {
      const docSigs = signoffs.filter(s => s.document_id === d.id)
      const signedCount = docSigs.filter(s => s.status === 'signed').length
      return {
        ...d,
        signedCount,
        totalSignoffs: docSigs.length,
      }
    })
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))

  // Stats
  const active = rows.length
  const overdue = rows.filter(r => classifyReviewDate(r.review_date) === 'overdue').length
  const soon = rows.filter(r => classifyReviewDate(r.review_date) === 'soon').length
  const incomplete = rows.filter(r => r.requires_signoff && r.signedCount < r.totalSignoffs).length

  // Empty state
  if (rows.length === 0) {
    return (
      <PageFrame {...pageProps}>
        <SectionHeader number={8} title="RAMS register" context="0 documents" />
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No RAMS documents registered for this project</Text>
        </View>
      </PageFrame>
    )
  }

  // Chunk for pagination
  const chunks = []
  chunks.push(rows.slice(0, ROWS_FIRST_PAGE))
  for (let i = ROWS_FIRST_PAGE; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE))
  }

  return chunks.map((chunk, chunkIdx) => (
    <PageFrame key={`rams-${chunkIdx}`} {...pageProps}>
      {chunkIdx === 0 && (
        <SectionHeader
          number={8}
          title="RAMS register"
          context={`${active} document${active !== 1 ? 's' : ''}`}
        />
      )}
      {chunkIdx > 0 && (
        <SectionHeader number={8} title="RAMS register (continued)" />
      )}
      {chunkIdx === 0 && <SummaryStrip stats={{ active, overdue, soon, incomplete }} />}

      <HeaderRow />
      {chunk.map((row, i) => {
        const globalIdx = chunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0) + i
        return <DataRow key={row.id || globalIdx} row={row} index={globalIdx} />
      })}

      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page {'\u00b7'} {chunks.slice(0, chunkIdx + 1).reduce((sum, c) => sum + c.length, 0)} of {rows.length} documents
        </Text>
      )}
      {chunkIdx === chunks.length - 1 && <Legend />}
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
  hText: {
    fontSize: 7.5, fontWeight: FONT.medium,
    color: C.textSecondary, letterSpacing: 0.3, flexShrink: 0,
  },

  dataRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: SIZE.rowHeight, borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted, paddingVertical: 2,
  },
  rowShaded: { backgroundColor: C.rowShade },

  numCol: { width: 22, fontSize: 8, color: C.textFaint, textAlign: 'center' },
  refCol: { width: 70, fontSize: 8, color: C.textSecondary, fontFamily: 'Inter', paddingRight: 4 },
  titleCol: { flex: 1, fontSize: 9, color: C.textPrimary, fontWeight: FONT.medium, paddingRight: 4 },
  revCol: { width: 36, fontSize: 8, color: C.textSecondary, textAlign: 'center' },
  issuedForCol: { width: 65, fontSize: 8, color: C.textSecondary, paddingRight: 4 },
  cellCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  signoffCol: { width: 50, fontSize: 8, color: C.textPrimary, textAlign: 'center' },
  uploadedByCol: { width: 80, fontSize: 8, color: C.textSecondary, paddingLeft: 4 },

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

  legend: {
    flexDirection: 'row', gap: 16, marginTop: 12,
    paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { fontSize: 7.5, color: C.textMuted, fontWeight: FONT.regular },

  emptyRow: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 10, color: C.textFaint, fontWeight: FONT.regular },

  continuation: {
    fontSize: 8, color: C.textFaint, textAlign: 'right',
    marginTop: 8, fontWeight: FONT.regular,
  },
})
