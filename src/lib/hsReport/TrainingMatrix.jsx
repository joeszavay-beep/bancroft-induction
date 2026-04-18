import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate, classifyExpiry } from './utils'
import { PageFrame, SectionHeader, Pill } from './primitives'

// ── Cert column definitions ──
// Fix #1: Explicit widths per cert column — no rotation, sentence case, no ALL CAPS
const CERT_COLS = [
  { key: 'card_expiry',     label: 'CSCS / ECS', width: 68 },
  { key: 'ipaf_expiry',     label: 'IPAF',       width: 55 },
  { key: 'pasma_expiry',    label: 'PASMA',      width: 58 },
  { key: 'sssts_expiry',    label: 'SSSTS',      width: 56 },
  { key: 'smsts_expiry',    label: 'SMSTS',      width: 58 },
  { key: 'first_aid_expiry', label: 'First aid',  width: 62 },
]

const CERT_KEYS = CERT_COLS.map(c => c.key)

// Supervisor roles excluded from operative matrix (they go in Management Training section 03)
const SUPERVISOR_ROLES = ['supervisor', 'foreman', 'manager', 'director']

// ── Layout constants (landscape A4: 842 × 595pt, ~770pt content width) ──
const COL = {
  num:  22,
  name: 145,
  role: 90,
}

// Page 1 has summary strip + section header taking ~80pt, so fewer rows fit.
// Subsequent pages have only the header row, so more rows fit.
const ROWS_FIRST_PAGE = 16
const ROWS_PER_PAGE = 22

// ── Helpers ──
function hasCerts(op) {
  return CERT_KEYS.some(k => op[k] != null && op[k] !== '')
}

function computeSummary(operatives, weekEnd) {
  let expired = 0, critical = 0, warning = 0, valid = 0, missing = 0

  operatives.forEach(op => {
    if (!hasCerts(op)) {
      missing++
      return
    }
    CERT_KEYS.forEach(k => {
      const status = classifyExpiry(op[k], weekEnd)
      if (status === 'expired') expired++
      else if (status === 'critical') critical++
      else if (status === 'warning') warning++
      else if (status === 'valid') valid++
    })
  })

  return { expired, critical, warning, valid, missing }
}

// ── Summary strip (4 mini tiles) ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Expired',           value: stats.expired,  color: 'red' },
    { label: 'Expiring \u226430d', value: stats.critical, color: 'red' },
    { label: 'Expiring \u226490d', value: stats.warning,  color: 'amber' },
    { label: 'Valid',              value: stats.valid,    color: 'green' },
    { label: 'Missing records',    value: stats.missing,  color: 'neutral' },
  ]

  return (
    <View style={s.summaryRow}>
      {tiles.map((t, i) => {
        const bg = t.color === 'green' ? C.greenBg
          : t.color === 'amber' ? C.amberBg
          : t.color === 'red' ? C.redBg
          : C.surfaceMuted
        const txt = t.color === 'green' ? C.greenTextDark
          : t.color === 'amber' ? C.amberTextDark
          : t.color === 'red' ? C.redTextDark
          : C.textSecondary
        const border = t.color === 'green' ? C.green
          : t.color === 'amber' ? C.amber
          : t.color === 'red' ? C.red
          : C.border

        return (
          <View key={i} style={[s.summaryTile, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[s.summaryValue, { color: txt }]}>{t.value}</Text>
            <Text style={s.summaryLabel}>{t.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Header row ──
function HeaderRow() {
  return (
    <View style={s.headerRow}>
      <Text style={[s.headerText, { width: COL.num }]}>#</Text>
      <Text style={[s.headerText, { width: COL.name }]}>Name</Text>
      <Text style={[s.headerText, { width: COL.role }]}>Role</Text>
      {CERT_COLS.map(col => (
        <Text key={col.key} style={[s.headerText, { width: col.width, textAlign: 'center', flexShrink: 0 }]}>{col.label}</Text>
      ))}
    </View>
  )
}

// ── Cert cell ──
// Fix #4: Cert cell with explicit pill styling inside fixed-width container
function CertCell({ value, weekEnd, width }) {
  if (value == null || value === '') {
    return (
      <View style={[s.certCell, { width }]}>
        <Text style={s.emptyDash}>{'\u2014'}</Text>
      </View>
    )
  }

  const status = classifyExpiry(value, weekEnd)
  const formatted = formatDate(value, { short: true })

  if (status === 'expired') {
    return (
      <View style={[s.certCell, { width }]}>
        <View style={s.pillRed}><Text style={s.pillRedText}>*{formatted}</Text></View>
      </View>
    )
  }
  if (status === 'critical') {
    return (
      <View style={[s.certCell, { width }]}>
        <View style={s.pillRed}><Text style={s.pillRedText}>{formatted}</Text></View>
      </View>
    )
  }
  if (status === 'warning') {
    return (
      <View style={[s.certCell, { width }]}>
        <View style={s.pillAmber}><Text style={s.pillAmberText}>{formatted}</Text></View>
      </View>
    )
  }

  return (
    <View style={[s.certCell, { width }]}>
      <Text style={s.certDate}>{formatted}</Text>
    </View>
  )
}

// ── Data row ──
function DataRow({ op, index, weekEnd }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.nameCol}>{op.name || '\u2014'}</Text>
      <Text style={s.roleCol}>{op.role || '\u2014'}</Text>
      {CERT_COLS.map(col => (
        <CertCell key={col.key} value={op[col.key]} weekEnd={weekEnd} width={col.width} />
      ))}
    </View>
  )
}

// ── Missing records row ──
function MissingRecordsRow({ op, index }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.nameCol}>{op.name || '—'}</Text>
      <Text style={s.roleCol}>{op.role || '—'}</Text>
      <View style={s.missingSpan}>
        <Pill text="MISSING RECORDS — chase this week" color="red" />
      </View>
    </View>
  )
}

// ── Legend strip ──
function Legend() {
  return (
    <View style={s.legend}>
      <View style={s.legendItem}>
        <View style={s.pillRed}>
          <Text style={s.pillRedText}>*DD/MM/YY</Text>
        </View>
        <Text style={s.legendLabel}>Expired</Text>
      </View>
      <View style={s.legendItem}>
        <View style={s.pillRed}>
          <Text style={s.pillRedText}>DD/MM/YY</Text>
        </View>
        <Text style={s.legendLabel}>Expires within 30 days</Text>
      </View>
      <View style={s.legendItem}>
        <View style={s.pillAmber}>
          <Text style={s.pillAmberText}>DD/MM/YY</Text>
        </View>
        <Text style={s.legendLabel}>Expires within 90 days</Text>
      </View>
      <View style={s.legendItem}>
        <Text style={s.emptyDash}>{'\u2014'}</Text>
        <Text style={s.legendLabel}>No record</Text>
      </View>
    </View>
  )
}

// ── Main component ──
export default function TrainingMatrix({ operatives, weekEnd, projectName, weekStart, weekEndFmt, clientName, reportRef }) {
  const ops = Array.isArray(operatives) ? operatives : []
  // Fix #2: Filter out supervisors — they belong in Management Training (section 03)
  const nonSupervisors = ops.filter(op => !SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))
  const sorted = [...nonSupervisors].sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const stats = computeSummary(sorted, weekEnd)

  // Chunk for pagination — first page holds fewer rows (summary strip takes space)
  const chunks = []
  if (sorted.length > 0) {
    chunks.push(sorted.slice(0, ROWS_FIRST_PAGE))
    for (let i = ROWS_FIRST_PAGE; i < sorted.length; i += ROWS_PER_PAGE) {
      chunks.push(sorted.slice(i, i + ROWS_PER_PAGE))
    }
  }

  // If no operatives, render a single page with empty state
  if (chunks.length === 0) {
    chunks.push([])
  }

  const pageProps = {
    projectName,
    weekStart,
    weekEnd: weekEndFmt,
    clientName,
    reportRef,
  }

  return chunks.map((chunk, chunkIdx) => (
    <PageFrame key={chunkIdx} {...pageProps} orientation="landscape">
      {chunkIdx === 0 && (
        <SectionHeader
          number={2}
          title="Operative training matrix"
          context={`${sorted.length} operative${sorted.length !== 1 ? 's' : ''}`}
        />
      )}
      {chunkIdx === 0 && <SummaryStrip stats={stats} />}

      <HeaderRow />

      {chunk.length === 0 && (
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No operatives recorded for this period</Text>
        </View>
      )}

      {chunk.map((op, i) => {
        const globalIdx = chunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0) + i
        return hasCerts(op)
          ? <DataRow key={op.id || globalIdx} op={op} index={globalIdx} weekEnd={weekEnd} />
          : <MissingRecordsRow key={op.id || globalIdx} op={op} index={globalIdx} />
      })}

      {/* Continuation cue between pages */}
      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page · {chunks.slice(0, chunkIdx + 1).reduce((s, c) => s + c.length, 0)} of {sorted.length} operatives
        </Text>
      )}

      {/* Legend on the last page */}
      {chunkIdx === chunks.length - 1 && chunk.length > 0 && <Legend />}
    </PageFrame>
  ))
}

// ── Styles ──
const s = StyleSheet.create({
  // Summary strip
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryTile: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: FONT.medium,
  },
  summaryLabel: {
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
  },

  // Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 4,
    marginBottom: 2,
  },
  headerText: {
    fontSize: 7.5,
    fontWeight: FONT.medium,
    color: C.textSecondary,
    letterSpacing: 0.3,
    flexShrink: 0,
  },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SIZE.rowHeight,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted,
    paddingVertical: 2,
  },
  rowShaded: {
    backgroundColor: C.rowShade,
  },
  numCol: {
    width: COL.num,
    fontSize: 8,
    color: C.textFaint,
    textAlign: 'center',
    fontWeight: FONT.regular,
  },
  nameCol: {
    width: 145,
    fontSize: 9,
    color: C.textPrimary,
    fontWeight: FONT.medium,
    paddingRight: 4,
  },
  roleCol: {
    width: COL.role,
    fontSize: 8,
    color: C.textSecondary,
    fontWeight: FONT.regular,
    paddingRight: 4,
  },

  // Cert cells — explicit flexDirection row, minHeight, and overflow visible
  // so pill backgrounds and borderRadius actually render
  certCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: 14,
    overflow: 'visible',
  },
  certDate: {
    fontSize: 8,
    color: C.textPrimary,
    fontWeight: FONT.regular,
  },
  emptyDash: {
    fontSize: 9,
    color: C.empty,
    fontWeight: FONT.regular,
  },
  // Pill styles — explicit minHeight and padding so @react-pdf doesn't collapse them
  pillRed: {
    backgroundColor: C.redBg,
    borderRadius: 3,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 5,
    paddingRight: 5,
    minHeight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillRedText: {
    fontSize: 7,
    fontWeight: FONT.medium,
    color: C.redTextDark,
    lineHeight: 1,
  },
  pillAmber: {
    backgroundColor: C.amberBg,
    borderRadius: 3,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 5,
    paddingRight: 5,
    minHeight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillAmberText: {
    fontSize: 7,
    fontWeight: FONT.medium,
    color: C.amberTextDark,
    lineHeight: 1,
  },

  // Missing records span
  missingSpan: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },

  // Continuation cue
  continuation: {
    fontSize: 8,
    color: C.textFaint,
    textAlign: 'right',
    marginTop: 8,
    fontWeight: FONT.regular,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLabel: {
    fontSize: 7.5,
    color: C.textMuted,
    fontWeight: FONT.regular,
  },
})
