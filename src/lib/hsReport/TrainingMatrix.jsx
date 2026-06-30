import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PSIZE } from './theme'
import { formatDate, classifyExpiry } from './utils'
import { PlexSectionHeader, Chips, EmptyState, SectionBlock } from './primitives'

// ── Cert column definitions ──
// Same 6 keys the data model has carried throughout — only the rendering changes.
const CERT_COLS = [
  { key: 'card_expiry',      label: 'CSCS / ECS' },
  { key: 'ipaf_expiry',      label: 'IPAF' },
  { key: 'pasma_expiry',     label: 'PASMA' },
  { key: 'sssts_expiry',     label: 'SSSTS' },
  { key: 'smsts_expiry',     label: 'SMSTS' },
  { key: 'first_aid_expiry', label: 'First aid' },
]
const CERT_KEYS = CERT_COLS.map(c => c.key)

// ── Layout constants (portrait A4: 595 × 842pt, ~523pt content width) ──
const COL = { num: 16, op: 155 }
const CERT_W = 58

// ── Helpers (data logic — unchanged from before) ──
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

// ── Cert cell text ──
// Colour-coded Plex Mono date. Per owner: expired AND ≤30d are RED (urgent);
// amber is reserved for the ≤90d "expiring soon" band. A leading "*" marks a
// genuinely-expired cert so it stays distinct from "expiring ≤30d" (both red).
function CertText({ value, weekEnd }) {
  if (value == null || value === '') {
    return <Text style={[t.cert, t.certNone]}>{'—'}</Text>
  }

  const status = classifyExpiry(value, weekEnd)
  const formatted = formatDate(value, { short: true }) // DD/MM/YY

  if (status === 'expired')  return <Text style={[t.cert, t.certRed]}>*{formatted}</Text>
  if (status === 'critical') return <Text style={[t.cert, t.certRed]}>{formatted}</Text>
  if (status === 'warning')  return <Text style={[t.cert, t.certAmber]}>{formatted}</Text>
  return <Text style={[t.cert, t.certValid]}>{formatted}</Text>
}

// ── Table header row ──
function HeaderRow() {
  return (
    <View style={t.head}>
      <Text style={[t.headCell, { width: COL.num }]}>#</Text>
      <Text style={[t.headCell, { width: COL.op }]}>Operative</Text>
      {CERT_COLS.map(col => (
        <Text key={col.key} style={[t.headCell, { width: CERT_W }]}>{col.label}</Text>
      ))}
    </View>
  )
}

// ── Data row ──
// No-cert operatives simply show six em-dashes; the flag lives in the Missing
// chip (and, later, the cover attention list) — no special inline pill-row.
function DataRow({ op, index, weekEnd }) {
  return (
    <View style={t.row} wrap={false}>
      <Text style={t.num}>{index + 1}</Text>
      <View style={[t.opCell, { width: COL.op }]}>
        <Text style={t.opName}>{op.name || '—'}</Text>
        <Text style={t.opRole}>{op.role || 'Role unknown'}</Text>
      </View>
      {CERT_COLS.map(col => (
        <View key={col.key} style={[t.certCell, { width: CERT_W }]}>
          <CertText value={op[col.key]} weekEnd={weekEnd} />
        </View>
      ))}
    </View>
  )
}

// ── Legend strip ──
const LEGEND = [
  { color: PX.red,   label: 'Expired (*) / expiring ≤30 days' },
  { color: PX.amber, label: 'Expiring ≤90 days' },
  { color: PX.ink,   label: 'Valid' },
  { color: PX.faint, label: 'No record (—)' },
]

function Legend() {
  return (
    <View style={t.legend}>
      {LEGEND.map((l, i) => (
        <View key={i} style={t.legendItem}>
          <View style={[t.legendDot, { backgroundColor: l.color }]} />
          <Text style={t.legendLabel}>{l.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Main component ──
// Presentation rebuilt for the redesign; props + data flow are IDENTICAL to before.
export default function TrainingMatrix({
  operatives, weekEnd, sectionNumber = 2,
  title = 'Operative training matrix', contextLabel = 'operative', theme,
}) {
  const ops = Array.isArray(operatives) ? operatives : []
  const sorted = [...ops].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const stats = computeSummary(sorted, weekEnd)
  const accent = theme?.accent || PX.accent

  // Status summary chips (driven entirely by computeSummary over the real data)
  const chips = [
    { value: stats.expired,  label: 'Expired',         dot: PX.red },
    { value: stats.critical, label: 'Expiring ≤30d', dot: PX.red },
    { value: stats.warning,  label: 'Expiring ≤90d', dot: PX.amber },
    { value: stats.valid,    label: 'Valid',           dot: PX.green },
    { value: stats.missing,  label: 'Missing records', dot: PX.faint },
  ]

  return (
    <SectionBlock keepTogether={sorted.length === 0}>
      <View wrap={false}>
        <PlexSectionHeader
          number={sectionNumber}
          title={title}
          count={`${sorted.length} ${contextLabel}${sorted.length !== 1 ? 's' : ''}`}
          accent={accent}
        />
        <Chips items={chips} />
      </View>

      {sorted.length === 0 ? (
        <EmptyState text="No operative training records for this period" />
      ) : (
        <>
          <HeaderRow />
          {sorted.map((op, i) => <DataRow key={op.id || i} op={op} index={i} weekEnd={weekEnd} />)}
          <Legend />
        </>
      )}
    </SectionBlock>
  )
}

// ── Styles ──
const t = StyleSheet.create({
  // Table header
  head: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: PX.headRule,
    paddingBottom: 7,
    marginBottom: 2,
  },
  headCell: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    color: PX.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Data row (dividers only — no zebra striping)
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
    paddingVertical: PSIZE.rowPad,
  },
  num: {
    width: COL.num,
    fontFamily: PLEX.mono,
    fontWeight: PW.regular,
    fontSize: 8,
    color: PX.muted,
  },
  opCell: {
    paddingRight: 8,
  },
  opName: {
    fontFamily: PLEX.sans,
    fontWeight: PW.medium,
    fontSize: 9,
    color: PX.ink,
    lineHeight: 1.2,
  },
  opRole: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 7.5,
    color: PX.muted,
    marginTop: 2,
    lineHeight: 1.2,
  },

  // Cert cells — colour-coded Plex Mono text (no pills)
  certCell: {
    paddingRight: 6,
  },
  cert: {
    fontFamily: PLEX.mono,
    fontSize: 8,
  },
  certNone:  { color: PX.faint, fontWeight: PW.regular },
  certValid: { color: PX.ink,   fontWeight: PW.regular },
  certRed:   { color: PX.red,   fontWeight: PW.semibold },
  certAmber: { color: PX.amber, fontWeight: PW.semibold },

  // Empty state
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PX.dashed,
    borderRadius: 3,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 4,
  },
  emptyText: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 9,
    color: PX.muted,
  },

  // Continuation cue
  continuation: {
    fontFamily: PLEX.mono,
    fontWeight: PW.regular,
    fontSize: 7.5,
    color: PX.muted,
    textAlign: 'right',
    marginTop: 8,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: PX.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 8,
    color: PX.muted,
  },
})
