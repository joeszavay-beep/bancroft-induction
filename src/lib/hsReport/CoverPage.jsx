import { Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'
import { formatDate } from './utils'
import { KPITile, Eyebrow, AttentionCallout } from './primitives'

function InfoCol({ label, value }) {
  return (
    <View style={s.infoCol}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || '\u2014'}</Text>
    </View>
  )
}

function ContentsRow({ num, title, page }) {
  return (
    <View style={s.contentsRow}>
      <Text style={s.contentsNum}>{num}</Text>
      <Text style={s.contentsTitle}>{title}</Text>
      <View style={s.contentsDots} />
      <Text style={s.contentsPage}>{page}</Text>
    </View>
  )
}

export default function CoverPage({ data, summary, sections }) {
  const weekStartFmt = formatDate(data.weekStart)
  const weekEndFmt = formatDate(data.weekEnd)
  const passRate = summary.inspectionsTotal > 0
    ? summary.inspectionsPassed / summary.inspectionsTotal
    : 0
  const passColour = summary.inspectionsTotal === 0
    ? 'neutral'
    : passRate > 0.9 ? 'green' : passRate > 0.7 ? 'amber' : 'red'

  const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()
  const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()
  const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`

  return (
    <Page size="A4" style={s.page}>
      {/* Navy header band */}
      <View style={s.headerBand}>
        <View style={s.headerLeft}>
          <Text style={s.wordmark}>CORESITE</Text>
          <Text style={s.subtitle}>Construction Management Platform</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.reportTitle}>Weekly H&S Report</Text>
          <Text style={s.reportNum}>{reportRef}</Text>
          <Text style={s.weekEnding}>Week ending {weekEndFmt}</Text>
        </View>
      </View>

      {/* Project info strip */}
      <View style={s.projectStrip}>
        <InfoCol label="Client" value={data.project?.client} />
        <InfoCol label="Project" value={data.project?.name} />
        <InfoCol label="Phase / Address" value={data.project?.address || data.project?.location} />
        <InfoCol label="Issued by" value={data.issuedBy} />
      </View>

      {/* 4 KPI tiles — em-dash + "No data" for zero-data states */}
      <View style={s.kpiRow}>
        <KPITile
          label="Shifts worked"
          value={summary.totalShifts > 0 ? summary.totalShifts : '\u2014'}
          context={summary.totalShifts > 0 ? 'Headcount \u00b7 week' : 'No data this period'}
        />
        <KPITile
          label="Operatives on site"
          value={summary.operativeCount > 0 ? summary.operativeCount : '\u2014'}
          context={summary.operativeCount > 0 ? 'Unique sign-ins' : 'No data this period'}
        />
        <KPITile
          label="Inspections passed"
          value={summary.inspectionsTotal > 0 ? `${summary.inspectionsPassed}/${summary.inspectionsTotal}` : '\u2014'}
          color={passColour}
          context={summary.inspectionsTotal > 0 ? `${Math.round(passRate * 100)}% pass rate` : 'No data this period'}
        />
        <KPITile
          label="Urgent certs"
          value={summary.expiringCertCount > 0 ? summary.expiringCertCount : '\u2014'}
          color={summary.expiringCertCount > 0 ? 'red' : 'neutral'}
          context={summary.expiringCertCount > 0
            ? `${summary.expiredCertCount} Expired \u00b7 ${summary.criticalCertCount} Expiring \u226430d`
            : 'No data this period'}
        />
      </View>

      {/* Attention callout */}
      {summary.attentionItems.length > 0 && (
        <View style={{ paddingHorizontal: SIZE.pageH, marginTop: 16 }}>
          <AttentionCallout items={summary.attentionItems} />
        </View>
      )}

      {/* Contents list */}
      <View style={s.contents}>
        <Eyebrow text="In this report" />
        {(sections || []).filter(s => s.included).map(sec => (
          <ContentsRow key={sec.id} num={String(sec.num).padStart(2, '0')} title={sec.name} page="" />
        ))}
      </View>

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerLeft}>{data.companyName || ''}</Text>
        <Text style={s.footerCentre}>{reportRef}</Text>
        <Text
          style={s.footerRight}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  )
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: C.textPrimary,
    backgroundColor: C.white,
    paddingBottom: 40,
  },

  // ── Header band ──
  headerBand: {
    backgroundColor: C.navy,
    paddingVertical: 28,
    paddingHorizontal: SIZE.pageH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    minHeight: 120,
  },
  headerLeft: {
    justifyContent: 'flex-end',
  },
  wordmark: {
    fontSize: 26,
    fontWeight: FONT.medium,
    color: C.white,
    letterSpacing: 3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: C.blueLight,
    fontWeight: FONT.regular,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: C.white,
    marginBottom: 4,
  },
  reportNum: {
    fontSize: 10,
    color: C.blueLight,
    fontWeight: FONT.regular,
    marginBottom: 2,
  },
  weekEnding: {
    fontSize: 10,
    color: C.blueLight,
    fontWeight: FONT.regular,
  },

  // ── Project info strip ──
  projectStrip: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: SIZE.pageH,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    backgroundColor: C.surfaceMuted,
  },
  infoCol: {
    flex: 1,
    paddingRight: 8,
  },
  infoLabel: {
    fontSize: 8,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
    fontWeight: FONT.medium,
  },
  infoValue: {
    fontSize: 10,
    color: C.textPrimary,
    fontWeight: FONT.regular,
  },

  // ── KPI row ──
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: SIZE.pageH,
    marginTop: 20,
  },

  // ── Contents ──
  contents: {
    paddingHorizontal: SIZE.pageH,
    marginTop: 24,
  },
  contentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderMuted,
  },
  contentsNum: {
    fontSize: 9,
    fontWeight: FONT.medium,
    color: C.blue,
    width: 24,
  },
  contentsTitle: {
    fontSize: 10,
    color: C.textPrimary,
    fontWeight: FONT.regular,
    flex: 1,
  },
  contentsDots: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    borderStyle: 'dotted',
    marginHorizontal: 4,
    height: 6,
  },
  contentsPage: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
    width: 20,
    textAlign: 'right',
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 12,
    left: SIZE.pageH,
    right: SIZE.pageH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  footerLeft: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
  footerCentre: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
  footerRight: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
})
