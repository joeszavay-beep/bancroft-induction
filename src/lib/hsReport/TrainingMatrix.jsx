import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate, classifyExpiry } from './utils'
import { PageFrame, SectionHeader, Pill } from './primitives'

// ── Cert column definitions ──
const CERT_COLS = [
  { key: 'card_expiry',     label: 'CSCS / ECS' },
  { key: 'ipaf_expiry',     label: 'IPAF' },
  { key: 'pasma_expiry',    label: 'PASMA' },
  { key: 'sssts_expiry',    label: 'SSSTS' },
  { key: 'smsts_expiry',    label: 'SMSTS' },
  { key: 'first_aid_expiry', label: 'First Aid' },
]

const CERT_KEYS = CERT_COLS.map(c => c.key)

// ── Layout constants (landscape A4: 842 × 595pt, ~770pt content width) ──
const COL = {
  num:  22,
  name: 130,
  role: 90,
  cert: 88,
}

const ROWS_PER_PAGE = 18

// ── Helpers ──
function hasCerts(op) {
  return CERT_KEYS.some(k => op[k] != null && op[k] !== '')
}

function computeSummary(operatives, weekEnd) {
  let valid = 0, warning = 0, critical = 0, missing = 0

  operatives.forEach(op => {
    if (!hasCerts(op)) {
      missing++
      return
    }
    CERT_KEYS.forEach(k => {
      const status = classifyExpiry(op[k], weekEnd)
      if (status === 'valid') valid++
      else if (status === 'warning') warning++
      else if (status === 'critical' || status === 'expired') critical++
    })
  })

  return { valid, warning, critical, missing }
}

// ── Summary strip (4 mini tiles) ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Valid certs',       value: stats.valid,    color: 'green' },
    { label: 'Expiring ≤90d',    value: stats.warning,  color: 'amber' },
    { label: 'Expiring / expired', value: stats.critical, color: 'red' },
    { label: 'Missing records',   value: stats.missing,  color: 'neutral' },
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
        <View key={col.key} style={s.certHeaderCell}>
          <Text style={s.headerText}>{col.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Cert cell ──
function CertCell({ value, weekEnd }) {
  if (value == null || value === '') {
    return (
      <View style={s.certCell}>
        <Text style={s.emptyDash}>—</Text>
      </View>
    )
  }

  const status = classifyExpiry(value, weekEnd)
  const formatted = formatDate(value, { short: true })

  if (status === 'expired') {
    return (
      <View style={s.certCell}>
        <Pill text={`*${formatted}`} color="red" />
      </View>
    )
  }
  if (status === 'critical') {
    return (
      <View style={s.certCell}>
        <Pill text={formatted} color="red" />
      </View>
    )
  }
  if (status === 'warning') {
    return (
      <View style={s.certCell}>
        <Pill text={formatted} color="amber" />
      </View>
    )
  }

  // valid
  return (
    <View style={s.certCell}>
      <Text style={s.certDate}>{formatted}</Text>
    </View>
  )
}

// ── Data row (operative with at least one cert) ──
function DataRow({ op, index, weekEnd }) {
  const shaded = index % 2 === 1
  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.nameCol}>{op.name || '—'}</Text>
      <Text style={s.roleCol}>{op.role || '—'}</Text>
      {CERT_COLS.map(col => (
        <CertCell key={col.key} value={op[col.key]} weekEnd={weekEnd} />
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
        <View style={[s.legendSwatch, { backgroundColor: C.redBg }]}>
          <Text style={[s.legendSwatchText, { color: C.redTextDark }]}>*01/01/25</Text>
        </View>
        <Text style={s.legendLabel}>Expired</Text>
      </View>
      <View style={s.legendItem}>
        <View style={[s.legendSwatch, { backgroundColor: C.redBg }]}>
          <Text style={[s.legendSwatchText, { color: C.redTextDark }]}>01/01/25</Text>
        </View>
        <Text style={s.legendLabel}>Expires ≤30 days</Text>
      </View>
      <View style={s.legendItem}>
        <View style={[s.legendSwatch, { backgroundColor: C.amberBg }]}>
          <Text style={[s.legendSwatchText, { color: C.amberTextDark }]}>01/01/25</Text>
        </View>
        <Text style={s.legendLabel}>Expires ≤90 days</Text>
      </View>
      <View style={s.legendItem}>
        <Text style={s.legendDash}>—</Text>
        <Text style={s.legendLabel}>No record</Text>
      </View>
    </View>
  )
}

// ── Main component ──
export default function TrainingMatrix({ operatives, weekEnd, projectName, weekStart, weekEndFmt, clientName, reportRef }) {
  const ops = Array.isArray(operatives) ? operatives : []
  const sorted = [...ops].sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const stats = computeSummary(sorted, weekEnd)

  // Chunk for pagination
  const chunks = []
  for (let i = 0; i < sorted.length; i += ROWS_PER_PAGE) {
    chunks.push(sorted.slice(i, i + ROWS_PER_PAGE))
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
          <Text style={s.emptyText}>No operatives recorded for this project</Text>
        </View>
      )}

      {chunk.map((op, i) => {
        const globalIdx = chunkIdx * ROWS_PER_PAGE + i
        return hasCerts(op)
          ? <DataRow key={op.id || globalIdx} op={op} index={globalIdx} weekEnd={weekEnd} />
          : <MissingRecordsRow key={op.id || globalIdx} op={op} index={globalIdx} />
      })}

      {/* Continuation cue between pages */}
      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page · {(chunkIdx + 1) * ROWS_PER_PAGE} of {sorted.length} operatives
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  certHeaderCell: {
    width: COL.cert,
    alignItems: 'center',
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
    width: COL.name,
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

  // Cert cells
  certCell: {
    width: COL.cert,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  legendSwatch: {
    borderRadius: 2,
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  legendSwatchText: {
    fontSize: 7,
    fontWeight: FONT.medium,
  },
  legendLabel: {
    fontSize: 7.5,
    color: C.textMuted,
    fontWeight: FONT.regular,
  },
  legendDash: {
    fontSize: 9,
    color: C.empty,
    fontWeight: FONT.regular,
    paddingHorizontal: 2,
  },
})
