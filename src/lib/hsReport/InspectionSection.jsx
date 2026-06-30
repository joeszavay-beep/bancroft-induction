import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX } from './theme'
import { PlexSectionHeader, Chips, EmptyState, NotesCallout, SectionBlock } from './primitives'

// ── Ordering: Failed first, then compliant-with-actions, then plain compliant.
// Not-assessed items are stripped out and collapsed into a single line.
function sortAndSplitChecklist(items) {
  const failed = []
  const withActions = []
  const passed = []
  const notAssessed = []

  items.forEach(item => {
    const v = (item.value || '').toUpperCase()
    if (v === 'N') failed.push(item)
    else if (v === 'Y' && item.comment && item.comment.trim()) withActions.push(item)
    else if (v === 'Y' || v === 'NA') passed.push(item)
    else notAssessed.push(item)
  })

  return { assessed: [...failed, ...withActions, ...passed], notAssessed }
}

// ── Result mark (✓ / ✕ / N/A) ──
// NOTE: IBM Plex Sans embeds U+2713 (✓) but NOT U+2717 (✗) — the latter renders
// blank. Use U+00D7 (×, multiplication sign) for the fail mark, which Plex covers.
function Mark({ value }) {
  if (value === 'Y') return <Text style={[s.mark, { color: PX.green }]}>✓</Text>
  if (value === 'N') return <Text style={[s.mark, s.markFail, { color: PX.red }]}>×</Text>
  if (value === 'NA') return <Text style={[s.markNa]}>N/A</Text>
  return <Text style={[s.markNa]}>—</Text>
}

// ── Item row ──
function ItemRow({ item, index }) {
  const isFailed = item.value === 'N'
  let action = item.comment && item.comment.trim() ? item.comment.trim() : null
  if (isFailed && !action) action = 'Action required'

  return (
    <View style={s.row} wrap={false}>
      <Text style={s.num}>{index + 1}</Text>
      <View style={s.itemCol}>
        <Text style={s.itemName}>{item.label || '—'}</Text>
        {action ? (
          <Text style={[s.action, { color: isFailed ? PX.red : PX.muted }]}>{action}</Text>
        ) : null}
      </View>
      <View style={s.markCol}><Mark value={(item.value || '').toUpperCase()} /></View>
    </View>
  )
}

export default function InspectionSection({ sectionNumber, title, checklist, inspectorName, notes, theme }) {
  const items = Array.isArray(checklist) ? checklist : []
  const accent = theme?.accent || PX.accent
  const { assessed, notAssessed } = sortAndSplitChecklist(items)

  const failed = items.filter(i => (i.value || '').toUpperCase() === 'N').length
  const actions = items.filter(i => (i.value || '').toUpperCase() === 'N' && i.comment?.trim()).length
  const passed = items.filter(i => {
    const v = (i.value || '').toUpperCase()
    return v === 'Y' || v === 'NA'
  }).length

  const chips = [
    { value: passed, label: 'Passed', dot: PX.green },
    { value: failed, label: 'Failed', dot: PX.red },
    { value: actions, label: 'Open actions', dot: PX.amber },
    { value: notAssessed.length, label: 'Not assessed', dot: PX.faint },
  ]

  const assessedCount = assessed.length
  const headerContext = [
    inspectorName ? `Inspector: ${inspectorName}` : null,
    assessedCount > 0 ? `Compliance: ${passed}/${assessedCount}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <SectionBlock keepTogether={assessed.length === 0}>
      <View wrap={false}>
        <PlexSectionHeader number={sectionNumber} title={title} count={headerContext || undefined} accent={accent} />
        {items.length > 0 && <Chips items={chips} />}
      </View>

      {assessed.length === 0
        ? <EmptyState text={`No ${title.toLowerCase()}s recorded for this period`} />
        : assessed.map((item, i) => <ItemRow key={i} item={item} index={i} />)}

      {notAssessed.length > 0 && (
        <Text style={s.notAssessed}>
          Not assessed this week: {notAssessed.map(i => i.label).join(', ')}
        </Text>
      )}

      <NotesCallout title="Inspection notes" text={notes} accent={accent} />
    </SectionBlock>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
    paddingVertical: 7,
  },
  num: { width: 18, fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.faint },
  itemCol: { flex: 1, paddingRight: 8 },
  itemName: { fontFamily: PLEX.sans, fontWeight: PW.medium, fontSize: 9.5, color: PX.ink },
  action: { fontFamily: PLEX.sans, fontWeight: PW.medium, fontSize: 8, marginTop: 2, lineHeight: 1.3 },
  markCol: { width: 28, alignItems: 'flex-end' },
  mark: { fontFamily: PLEX.sans, fontWeight: PW.semibold, fontSize: 11 },
  markFail: { fontSize: 13, lineHeight: 0.85 },
  markNa: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 7.5, color: PX.muted },

  continuation: {
    fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 7.5,
    color: PX.muted, textAlign: 'right', marginTop: 8,
  },
  notAssessed: {
    fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8,
    color: PX.muted, marginTop: 10, paddingTop: 7,
    borderTopWidth: 0.5, borderTopColor: PX.rowDivider, lineHeight: 1.4,
  },
})
