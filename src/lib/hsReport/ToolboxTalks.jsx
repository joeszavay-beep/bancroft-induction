import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate } from './utils'
import { PageFrame, SectionHeader, Pill, Eyebrow } from './primitives'

const ROWS_PER_PAGE = 12 // signatures take vertical space

// ── Helpers ──
function formatDateTime(d) {
  if (!d) return '\u2014'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '\u2014'
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = String(dt.getFullYear()).slice(-2)
  const hours = String(dt.getHours()).padStart(2, '0')
  const mins = String(dt.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

// ── Summary strip ──
function SummaryStrip({ talkCount, totalAttendees, operativesCovered, totalOperatives, unsigned }) {
  return (
    <View style={s.summaryRow}>
      <View style={[s.summaryTile, { backgroundColor: C.surfaceMuted, borderColor: C.border }]}>
        <Text style={[s.summaryValue, { color: C.textPrimary }]}>{talkCount}</Text>
        <Text style={s.summaryLabel}>Talks delivered</Text>
      </View>
      <View style={[s.summaryTile, { backgroundColor: C.surfaceMuted, borderColor: C.border }]}>
        <Text style={[s.summaryValue, { color: C.textPrimary }]}>{totalAttendees}</Text>
        <Text style={s.summaryLabel}>Attendances</Text>
      </View>
      <View style={[s.summaryTile, { backgroundColor: C.greenBg, borderColor: C.green }]}>
        <Text style={[s.summaryValue, { color: C.greenTextDark }]}>{operativesCovered}/{totalOperatives}</Text>
        <Text style={s.summaryLabel}>Operatives reached</Text>
      </View>
      {unsigned > 0 && (
        <View style={[s.summaryTile, { backgroundColor: C.redBg, borderColor: C.red }]}>
          <Text style={[s.summaryValue, { color: C.redTextDark }]}>{unsigned}</Text>
          <Text style={s.summaryLabel}>Unsigned</Text>
        </View>
      )}
    </View>
  )
}

// ── Attendee header row ──
function AttendeeHeader() {
  return (
    <View style={s.attendeeHeaderRow}>
      <Text style={[s.attendeeHeaderText, { width: 160 }]}>Name</Text>
      <Text style={[s.attendeeHeaderText, { width: 160, textAlign: 'center' }]}>Signature</Text>
      <Text style={[s.attendeeHeaderText, { flex: 1 }]}>Signed at</Text>
    </View>
  )
}

// ── Single attendee row ──
function AttendeeRow({ sig, index }) {
  const shaded = index % 2 === 1
  const hasSignature = sig.signatureDataUrl != null

  return (
    <View style={[s.attendeeRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.attendeeName}>{sig.operative_name || '\u2014'}</Text>
      <View style={s.signatureCell}>
        {hasSignature ? (
          <Image src={sig.signatureDataUrl} style={s.signatureImage} />
        ) : (
          <Pill text="Not signed" color="red" />
        )}
      </View>
      <Text style={s.signedAt}>{formatDateTime(sig.signed_at)}</Text>
    </View>
  )
}

// ── Single talk block ──
function TalkBlock({ talk, isFirst }) {
  const sigs = talk.toolbox_signatures || []
  const unsignedCount = sigs.filter(s => !s.signatureDataUrl && !s.signature_url).length
  const hasZeroAttendees = sigs.length === 0

  return (
    <View style={s.talkBlock}>
      {/* Talk header: title + pill on row 1, meta on row 2 */}
      <View style={s.talkHeader}>
        <View style={s.talkTitleRow}>
          <Text style={s.talkTitle}>{talk.title || '\u2014'}</Text>
          {hasZeroAttendees && <Pill text="No attendees" color="red" />}
          {!hasZeroAttendees && unsignedCount > 0 && <Pill text={`Unsigned: ${unsignedCount}`} color="amber" />}
        </View>
        <Text style={s.talkMeta}>
          {formatDate(talk.created_at)} {'\u00b7'} {sigs.length} attendee{sigs.length !== 1 ? 's' : ''}
          {talk.description ? ` \u00b7 ${talk.description.length > 80 ? talk.description.slice(0, 80) + '\u2026' : talk.description}` : ''}
        </Text>
      </View>

      {/* Attendee table */}
      {sigs.length > 0 && (
        <View style={s.attendeeTable}>
          <AttendeeHeader />
          {sigs.map((sig, i) => (
            <AttendeeRow key={sig.id || i} sig={sig} index={i} />
          ))}
        </View>
      )}

      {/* Zero attendees callout */}
      {hasZeroAttendees && (
        <View style={s.noAttendeesBox}>
          <Text style={s.noAttendeesText}>No attendees recorded for this talk</Text>
        </View>
      )}
    </View>
  )
}

// ── Main component ──
export default function ToolboxTalks({ rawTalks, operatives, pageProps }) {
  const talks = Array.isArray(rawTalks) ? rawTalks : []
  const totalOperatives = Array.isArray(operatives) ? operatives.length : 0

  // Compute summary stats
  const totalAttendees = talks.reduce((sum, t) => sum + (t.toolbox_signatures || []).length, 0)
  const allAttendeeIds = new Set()
  talks.forEach(t => (t.toolbox_signatures || []).forEach(s => { if (s.operative_id) allAttendeeIds.add(s.operative_id) }))
  const operativesCovered = allAttendeeIds.size
  const unsigned = talks.reduce((sum, t) =>
    sum + (t.toolbox_signatures || []).filter(s => !s.signatureDataUrl && !s.signature_url).length, 0)

  // Empty state
  if (talks.length === 0) {
    return (
      <PageFrame {...pageProps}>
        <SectionHeader number={1} title="Toolbox talks" context="0 talks" />
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No toolbox talks recorded for this period</Text>
        </View>
      </PageFrame>
    )
  }

  // Paginate: each talk is a block. Estimate: talk header ~30pt + rows * 40pt (signature height).
  // We'll render each talk as a wrap={false} block and let react-pdf handle page breaks.
  // For the "(continued)" header pattern, we track page overflow manually via chunking.
  // Simple approach: one PageFrame, let content flow with wrap. Add continuation on overflow.

  return (
    <PageFrame {...pageProps}>
      <SectionHeader
        number={1}
        title="Toolbox talks"
        context={`${talks.length} talk${talks.length !== 1 ? 's' : ''} delivered`}
      />
      <SummaryStrip
        talkCount={talks.length}
        totalAttendees={totalAttendees}
        operativesCovered={operativesCovered}
        totalOperatives={totalOperatives}
        unsigned={unsigned}
      />
      {talks.map((talk, i) => (
        <TalkBlock key={talk.id || i} talk={talk} isFirst={i === 0} />
      ))}
    </PageFrame>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  // Summary strip
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: FONT.medium,
  },
  summaryLabel: {
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
  },

  // Talk block
  talkBlock: {
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  talkHeader: {
    backgroundColor: C.surfaceMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  talkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  talkTitle: {
    fontSize: 11,
    fontWeight: FONT.medium,
    color: C.textPrimary,
    flex: 1,
  },
  talkMeta: {
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
    lineHeight: 1.3,
    marginTop: 1,
  },

  // Attendee table
  attendeeTable: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attendeeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingBottom: 3,
    marginBottom: 2,
  },
  attendeeHeaderText: {
    fontSize: 7,
    fontWeight: FONT.medium,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted,
    paddingVertical: 2,
  },
  rowShaded: {
    backgroundColor: C.rowShade,
  },
  attendeeName: {
    width: 160,
    fontSize: 9,
    fontWeight: FONT.medium,
    color: C.textPrimary,
    paddingRight: 4,
  },
  signatureCell: {
    width: 160,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  signatureImage: {
    width: 120,
    height: 40,
    objectFit: 'contain',
  },
  signedAt: {
    flex: 1,
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
  },

  // No attendees
  noAttendeesBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  noAttendeesText: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
    textAlign: 'center',
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
})
