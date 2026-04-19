import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { PageFrame, SectionHeader, Pill } from './primitives'

// ── Layout constants (portrait A4: 595 × 842pt, ~523pt content width) ──
const COL = {
  num: 24,
  result: 80,
  comment: 170,
}

const ROWS_FIRST_PAGE = 20
const ROWS_PER_PAGE = 28

// ── Ordering helpers ──
// #4: Explicit sort — Failed first, then compliant-with-actions (amber), then plain compliant.
// Not-assessed items are stripped out and collapsed into a single line (#3).
function sortAndSplitChecklist(items) {
  const failed = []
  const withActions = [] // passed but has comments
  const passed = []
  const notAssessed = []

  items.forEach(item => {
    const v = (item.value || '').toUpperCase()
    if (v === 'N') {
      failed.push(item)
    } else if (v === 'Y' && item.comment && item.comment.trim()) {
      withActions.push(item)
    } else if (v === 'Y' || v === 'NA') {
      passed.push(item)
    } else {
      notAssessed.push(item)
    }
  })

  return {
    assessed: [...failed, ...withActions, ...passed],
    notAssessed,
  }
}

// ── Summary strip (3 mini tiles) ──
function SummaryStrip({ stats }) {
  const tiles = [
    { label: 'Failed',         value: stats.failed,      color: 'red' },
    { label: 'Open actions',   value: stats.actions,     color: 'amber' },
    { label: 'Passed',         value: stats.passed,      color: 'green' },
    { label: 'Not assessed',   value: stats.notAssessed, color: 'neutral' },
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
function HeaderRow({ showComments }) {
  return (
    <View style={s.headerRow}>
      <Text style={[s.headerText, { width: COL.num }]}>#</Text>
      <Text style={[s.headerText, { flex: 1 }]}>Item</Text>
      <Text style={[s.headerText, { width: COL.result, textAlign: 'center' }]}>Result</Text>
      {showComments && (
        <Text style={[s.headerText, { width: COL.comment }]}>Comment / Action</Text>
      )}
    </View>
  )
}

// ── Result pill ──
function ResultPill({ value }) {
  if (value === 'Y') return <Pill text="Compliant" color="green" icon={'\u2713'} />
  if (value === 'N') return <Pill text="Non-compliant" color="red" icon={'\u2717'} />
  if (value === 'NA') return <Pill text="N/A" color="muted" />
  return <Text style={s.emptyDash}>{'\u2014'}</Text>
}

// ── Data row ──
function DataRow({ item, index, showComments }) {
  const shaded = index % 2 === 1
  const isFailed = item.value === 'N'

  // For failed items: show comment as action, or fallback message
  let commentText = item.comment && item.comment.trim() ? item.comment.trim() : null
  if (isFailed && !commentText) {
    commentText = 'Action required'
  }

  return (
    <View style={[s.dataRow, shaded ? s.rowShaded : null]} wrap={false}>
      <Text style={s.numCol}>{index + 1}</Text>
      <Text style={s.itemCol}>{item.label || '\u2014'}</Text>
      <View style={s.resultCol}>
        <ResultPill value={item.value} />
      </View>
      {showComments && (
        <Text style={[
          s.commentCol,
          isFailed && !item.comment?.trim() ? { color: C.amberTextDark } : null,
          isFailed && item.comment?.trim() ? { color: C.redTextDark } : null,
        ]}>
          {commentText || ''}
        </Text>
      )}
    </View>
  )
}

// ── Main component ──
export default function InspectionSection({ sectionNumber, title, checklist, inspectorName, notes, pageProps, theme }) {
  const items = Array.isArray(checklist) ? checklist : []
  const { assessed, notAssessed } = sortAndSplitChecklist(items)

  // Stats
  const failed = items.filter(i => (i.value || '').toUpperCase() === 'N').length
  const actions = items.filter(i => (i.value || '').toUpperCase() === 'N' && i.comment?.trim()).length
  const passed = items.filter(i => {
    const v = (i.value || '').toUpperCase()
    return v === 'Y' || v === 'NA'
  }).length
  const stats = { failed, actions, passed, notAssessed: notAssessed.length }

  // Does any assessed item have a comment?
  const showComments = assessed.some(i => i.comment?.trim()) || failed > 0

  // #1: Header shows "Compliance: passed/assessed"
  const assessedCount = assessed.length
  const headerContext = assessedCount > 0 ? `Compliance: ${passed}/${assessedCount}` : undefined

  // Chunk assessed items for pagination
  const chunks = []
  if (assessed.length > 0) {
    chunks.push(assessed.slice(0, ROWS_FIRST_PAGE))
    for (let i = ROWS_FIRST_PAGE; i < assessed.length; i += ROWS_PER_PAGE) {
      chunks.push(assessed.slice(i, i + ROWS_PER_PAGE))
    }
  }

  // Empty state: single page
  if (chunks.length === 0) {
    chunks.push([])
  }

  return chunks.map((chunk, chunkIdx) => (
    <PageFrame key={`insp-${sectionNumber}-${chunkIdx}`} {...pageProps}>
      {chunkIdx === 0 && (
        <SectionHeader
          number={sectionNumber}
          title={title}
          context={[inspectorName ? `Inspector: ${inspectorName}` : null, headerContext].filter(Boolean).join(' \u00b7 ')}
          theme={theme}
        />
      )}

      {chunkIdx > 0 && (
        <SectionHeader
          number={sectionNumber}
          title={`${title} (continued)`}
          theme={theme}
        />
      )}

      {chunkIdx === 0 && items.length > 0 && <SummaryStrip stats={stats} />}

      {chunk.length === 0 && (
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>
            No {title.toLowerCase()}s recorded for this period
          </Text>
        </View>
      )}

      {chunk.length > 0 && (
        <>
          <HeaderRow showComments={showComments} />
          {chunk.map((item, i) => {
            const globalIdx = chunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0) + i
            return (
              <DataRow
                key={globalIdx}
                item={item}
                index={globalIdx}
                showComments={showComments}
              />
            )
          })}
        </>
      )}

      {/* Continuation cue */}
      {chunkIdx < chunks.length - 1 && (
        <Text style={s.continuation}>
          Continues on next page {'\u00b7'} {chunks.slice(0, chunkIdx + 1).reduce((sum, c) => sum + c.length, 0)} of {assessed.length} items
        </Text>
      )}

      {/* #3: Not-assessed items collapsed into single muted line on last page */}
      {chunkIdx === chunks.length - 1 && notAssessed.length > 0 && (
        <Text style={s.notAssessedLine}>
          Not assessed this week: {notAssessed.map(i => i.label).join(', ')}
        </Text>
      )}

      {/* Overall notes box on last page */}
      {chunkIdx === chunks.length - 1 && notes && notes.trim() && (
        <View style={s.notesBox}>
          <Text style={s.notesTitle}>Inspection notes</Text>
          <Text style={s.notesText}>{notes.trim()}</Text>
        </View>
      )}
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

  // Inspector metadata
  inspectorMeta: {
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
    textAlign: 'right',
    marginBottom: 6,
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
  itemCol: {
    flex: 1,
    fontSize: 9,
    color: C.textPrimary,
    fontWeight: FONT.regular,
    paddingRight: 4,
  },
  resultCol: {
    width: COL.result,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentCol: {
    width: COL.comment,
    fontSize: 8,
    color: C.textSecondary,
    fontWeight: FONT.regular,
    paddingLeft: 4,
  },

  // Empty dash
  emptyDash: {
    fontSize: 9,
    color: C.empty,
    fontWeight: FONT.regular,
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

  // #3: Not-assessed collapse line
  notAssessedLine: {
    fontSize: 8,
    color: C.textFaint,
    fontWeight: FONT.regular,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.borderMuted,
    lineHeight: 1.4,
  },

  // Notes box
  notesBox: {
    backgroundColor: C.surfaceMuted,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 10,
    marginTop: 12,
  },
  notesTitle: {
    fontSize: 8,
    fontWeight: FONT.medium,
    color: C.textSecondary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 8,
    color: C.textMuted,
    fontWeight: FONT.regular,
    lineHeight: 1.4,
  },
})
