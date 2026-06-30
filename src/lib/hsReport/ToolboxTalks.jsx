import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX } from './theme'
import { formatDate } from './utils'
import { PlexSectionHeader, StatusPill, EmptyState, SectionBlock } from './primitives'

// ── Helpers ──
function formatDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = String(dt.getFullYear()).slice(-2)
  const hours = String(dt.getHours()).padStart(2, '0')
  const mins = String(dt.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

// ── Inline stat row ──
function StatRow({ talkCount, totalAttendees, operativesCovered, totalOperatives }) {
  const stats = [
    { value: talkCount, label: 'Talks delivered' },
    { value: totalAttendees, label: 'Attendances' },
    { value: `${operativesCovered}/${totalOperatives}`, label: 'Operatives reached' },
  ]
  return (
    <View style={s.statRow}>
      {stats.map((st, i) => (
        <View key={i} style={s.stat}>
          <Text style={s.statValue}>{st.value}</Text>
          <Text style={s.statLabel}>{st.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Attendee table ──
function AttendeeHeader() {
  return (
    <View style={s.attHead}>
      <Text style={[s.attHeadCell, { width: 160 }]}>Name</Text>
      <Text style={[s.attHeadCell, { width: 150, textAlign: 'center' }]}>Signature</Text>
      <Text style={[s.attHeadCell, { flex: 1 }]}>Signed at</Text>
    </View>
  )
}

function AttendeeRow({ sig }) {
  const hasSignature = sig.signatureDataUrl != null
  return (
    <View style={s.attRow} wrap={false}>
      <Text style={s.attName}>{sig.operative_name || '—'}</Text>
      <View style={s.sigCell}>
        {hasSignature
          ? <Image src={sig.signatureDataUrl} style={s.sigImage} />
          : <StatusPill label="NOT SIGNED" tone="red" />}
      </View>
      <Text style={s.signedAt}>{formatDateTime(sig.signed_at)}</Text>
    </View>
  )
}

// ── Single talk block ──
function TalkBlock({ talk }) {
  const sigs = talk.toolbox_signatures || []
  const signedSigs = sigs.filter(sig => sig.signatureDataUrl != null)
  const hasZeroAttendees = sigs.length === 0
  const isManual = talk.isManual === true
  const manualCount = isManual ? (parseInt(talk.attendeeCount, 10) || 0) : 0
  const attendeeCount = isManual ? manualCount : sigs.length

  const desc = talk.description
    ? ` · ${talk.description.length > 80 ? talk.description.slice(0, 80) + '…' : talk.description}`
    : ''

  return (
    <View style={s.talkBlock} wrap={false}>
      <View style={s.talkHeader}>
        <View style={s.talkTitleRow}>
          <Text style={s.talkTitle}>{talk.title || '—'}</Text>
          {isManual && <StatusPill label="MANUAL ENTRY" tone="neutral" />}
          {!isManual && hasZeroAttendees && <StatusPill label="NO ATTENDEES" tone="red" />}
        </View>
        <Text style={s.talkMeta}>
          {formatDate(talk.created_at)} · {attendeeCount} attendee{attendeeCount !== 1 ? 's' : ''}{desc}
        </Text>
      </View>

      {isManual && (
        <Text style={s.note}>Manually recorded — no in-app signature sheet</Text>
      )}

      {!isManual && sigs.length > 0 && signedSigs.length > 0 && (
        <View style={s.attTable}>
          <AttendeeHeader />
          {signedSigs.map((sig, i) => <AttendeeRow key={sig.id || i} sig={sig} />)}
        </View>
      )}

      {!isManual && sigs.length > 0 && signedSigs.length === 0 && (
        <Text style={s.note}>No signed attendees for this talk</Text>
      )}

      {!isManual && hasZeroAttendees && (
        <Text style={s.note}>No attendees recorded for this talk</Text>
      )}
    </View>
  )
}

// ── Main component ──
export default function ToolboxTalks({ rawTalks, operatives, theme, number = 1 }) {
  const talks = Array.isArray(rawTalks) ? rawTalks : []
  const totalOperatives = Array.isArray(operatives) ? operatives.length : 0
  const accent = theme?.accent || PX.accent

  const totalAttendees = talks.reduce((sum, t) => sum + (t.toolbox_signatures || []).length, 0)
  const allAttendeeIds = new Set()
  talks.forEach(t => (t.toolbox_signatures || []).forEach(sig => { if (sig.operative_id) allAttendeeIds.add(sig.operative_id) }))
  const operativesCovered = allAttendeeIds.size

  if (talks.length === 0) {
    return (
      <SectionBlock keepTogether>
        <PlexSectionHeader number={number} title="Toolbox talks" count="0 talks" accent={accent} />
        <EmptyState text="No toolbox talks recorded for this period" />
      </SectionBlock>
    )
  }

  return (
    <SectionBlock>
      <View wrap={false}>
        <PlexSectionHeader
          number={number}
          title="Toolbox talks"
          count={`${talks.length} talk${talks.length !== 1 ? 's' : ''} delivered`}
          accent={accent}
        />
        <StatRow
          talkCount={talks.length}
          totalAttendees={totalAttendees}
          operativesCovered={operativesCovered}
          totalOperatives={totalOperatives}
        />
      </View>
      {talks.map((talk, i) => <TalkBlock key={talk.id || i} talk={talk} />)}
    </SectionBlock>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 14,
    marginBottom: 18,
  },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statValue: { fontFamily: PLEX.sans, fontWeight: PW.semibold, fontSize: 13, color: PX.ink },
  statLabel: { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 9, color: PX.grey },

  talkBlock: {
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: PX.border,
    borderRadius: 3,
  },
  talkHeader: {
    backgroundColor: PX.chipBg,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PX.border,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  talkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  talkTitle: { fontFamily: PLEX.sans, fontWeight: PW.semibold, fontSize: 10.5, color: PX.ink, flex: 1 },
  talkMeta: { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8, color: PX.muted, marginTop: 4, lineHeight: 1.3 },

  attTable: { paddingHorizontal: 12, paddingVertical: 6 },
  attHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: PX.headRule,
    paddingBottom: 6,
    marginBottom: 2,
  },
  attHeadCell: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    color: PX.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
    paddingVertical: 3,
  },
  attName: { width: 160, fontFamily: PLEX.sans, fontWeight: PW.medium, fontSize: 9, color: PX.ink, paddingRight: 4 },
  sigCell: { width: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sigImage: { width: 120, height: 36, objectFit: 'contain' },
  signedAt: { flex: 1, fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.muted },

  note: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 9,
    color: PX.muted,
    textAlign: 'center',
    paddingVertical: 14,
  },
})
