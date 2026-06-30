import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { PLEX, PW, PX, PSIZE } from './theme'
import { formatDate } from './utils'

// ── Meta strip column ──
function MetaCol({ label, value, last }) {
  return (
    <View style={[s.metaCol, last ? { paddingRight: 0 } : null]}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value || '—'}</Text>
    </View>
  )
}

// ── KPI tile ──
const KPI_TONE = { ink: PX.ink, green: PX.green, amber: PX.amber, red: PX.red }
function KpiTile({ label, value, sub, tone = 'ink', last }) {
  return (
    <View style={[s.kpiTile, last ? { borderRightWidth: 0 } : null]}>
      <Text style={[s.kpiValue, { color: KPI_TONE[tone] || PX.ink }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  )
}

// ── Attention list item ──
function AttentionItem({ item }) {
  const dot = item.severity === 'red' ? PX.red : PX.amber
  // Message often reads "PM Inspection: Scaffolding — non-compliant" — split the
  // leading category into the eyebrow when present; otherwise show plain title.
  const msg = item.message || ''
  const ci = msg.indexOf(': ')
  const cat = ci > 0 ? msg.slice(0, ci) : null
  const title = ci > 0 ? msg.slice(ci + 2) : msg
  return (
    <View style={s.attItem}>
      <View style={[s.attDot, { backgroundColor: dot }]} />
      <View style={s.attBody}>
        {cat ? <Text style={s.attCat}>{cat.toUpperCase()}</Text> : null}
        <Text style={s.attTitle}>{title}</Text>
      </View>
      {item.page ? <Text style={s.attRef}>p.{item.page}</Text> : null}
    </View>
  )
}

// ── Contents row ──
function ContentsRow({ num, name, accent }) {
  return (
    <View style={s.contentsRow}>
      <Text style={[s.contentsNum, { color: accent }]}>{num}</Text>
      <Text style={s.contentsName}>{name}</Text>
    </View>
  )
}

export default function CoverPage({ data, summary, sections, theme }) {
  const accent = theme?.accent || PX.accent
  const weekStartFmt = formatDate(data.weekStart)
  const weekEndFmt = formatDate(data.weekEnd)

  const passRate = summary.inspectionsTotal > 0
    ? summary.inspectionsPassed / summary.inspectionsTotal
    : 0
  const passTone = summary.inspectionsTotal === 0
    ? 'ink'
    : passRate > 0.9 ? 'green' : passRate > 0.7 ? 'amber' : 'red'

  const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()
  const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()
  const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`

  const attention = summary.attentionItems || []
  const contents = (sections || []).filter(sec => sec.included)

  return (
    <Page size="A4" style={s.page}>
      {/* Accent header band */}
      <View style={[s.band, { backgroundColor: accent }]}>
        <View style={s.bandRow}>
          <View style={s.bandLeft}>
            {data.company?.logo_url
              ? <Image src={data.company.logo_url} style={s.logo} />
              : <Text style={s.eyebrow}>{(data.companyName || 'Company').toUpperCase()}</Text>}
            <Text style={s.h1}>Weekly Health &amp; Safety Report</Text>
            <Text style={s.weekLine}>
              Week ending {weekEndFmt}
              {weekStartFmt ? `    ·    ${weekStartFmt} — ${weekEndFmt}` : ''}
            </Text>
          </View>
          <View style={s.bandRight}>
            <Text style={s.repNoLabel}>REPORT NO.</Text>
            <Text style={s.repNo}>{reportRef}</Text>
          </View>
        </View>
      </View>

      {/* Meta strip */}
      <View style={s.metaStrip}>
        <MetaCol label="Client" value={data.project?.client} />
        <MetaCol label="Project" value={data.project?.name} />
        <MetaCol label="Phase / Address" value={data.project?.address || data.project?.location} />
        <MetaCol label="Issued by" value={data.issuedBy} last />
      </View>

      {/* Body */}
      <View style={s.body}>
        {/* KPI tiles */}
        <View style={s.kpiGrid}>
          <KpiTile
            label="Shifts worked"
            value={summary.totalShifts > 0 ? summary.totalShifts : '—'}
            sub={summary.totalShifts > 0 ? 'Headcount · week' : 'No data this period'}
          />
          <KpiTile
            label="Operatives on site"
            value={summary.operativeCount > 0 ? summary.operativeCount : '—'}
            sub={summary.operativeCount > 0 ? 'Unique sign-ins' : 'No data this period'}
          />
          <KpiTile
            label="Inspections passed"
            value={summary.inspectionsTotal > 0 ? `${summary.inspectionsPassed}/${summary.inspectionsTotal}` : '—'}
            tone={passTone}
            sub={summary.inspectionsTotal > 0 ? `${Math.round(passRate * 100)}% pass rate` : 'No data this period'}
          />
          <KpiTile
            label="Urgent certs"
            value={summary.expiringCertCount > 0 ? summary.expiringCertCount : '—'}
            tone={summary.expiringCertCount > 0 ? 'amber' : 'ink'}
            sub={summary.expiringCertCount > 0
              ? `${summary.expiredCertCount} Expired · ${summary.criticalCertCount} Expiring ≤30d`
              : 'No data this period'}
            last
          />
        </View>

        {/* Attention + contents */}
        <View style={s.twoCol}>
          <View style={s.attentionCol}>
            <View style={s.attHeader}>
              <Text style={s.h2}>Requires attention</Text>
              {attention.length > 0 && (
                <Text style={s.attBadge}>{attention.length} ITEM{attention.length !== 1 ? 'S' : ''}</Text>
              )}
            </View>
            <View style={s.attList}>
              {attention.length > 0
                ? attention.map((item, i) => <AttentionItem key={i} item={item} />)
                : <Text style={s.attEmpty}>Nothing flagged this period</Text>}
            </View>
          </View>

          <View style={s.contentsCol}>
            <Text style={s.h2}>In this report</Text>
            <View style={s.contentsList}>
              {contents.map(sec => (
                <ContentsRow key={sec.id} num={String(sec.num).padStart(2, '0')} name={sec.name} accent={accent} />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footText}>{reportRef}</Text>
        <Text style={s.footText}>WEEKLY H&S REPORT</Text>
        <Text
          style={s.footText}
          render={({ pageNumber, totalPages }) =>
            `PAGE ${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`}
        />
      </View>
    </Page>
  )
}

const s = StyleSheet.create({
  page: {
    fontFamily: PLEX.sans,
    fontSize: 9,
    color: PX.ink,
    backgroundColor: PX.white,
    paddingBottom: 42,
  },

  // ── Accent band ──
  band: {
    paddingTop: 33,
    paddingBottom: 28,
    paddingHorizontal: PSIZE.pageH,
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bandLeft: { flex: 1, paddingRight: 18 },
  logo: { maxHeight: 30, maxWidth: 150, objectFit: 'contain', marginBottom: 12 },
  eyebrow: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 8,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.55)',
  },
  h1: {
    fontFamily: PLEX.sans,
    fontWeight: PW.semibold,
    fontSize: 29,
    color: PX.white,
    letterSpacing: -0.6,
    marginTop: 14,
  },
  weekLine: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 11,
  },
  bandRight: { alignItems: 'flex-end' },
  repNoLabel: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 7.5,
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.5)',
  },
  repNo: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 9,
    color: PX.white,
    marginTop: 4,
  },

  // ── Meta strip ──
  metaStrip: {
    flexDirection: 'row',
    paddingHorizontal: PSIZE.pageH,
    borderBottomWidth: 1,
    borderBottomColor: PX.border,
  },
  metaCol: {
    flex: 1,
    paddingTop: 13,
    paddingBottom: 13,
    paddingRight: 16,
  },
  metaLabel: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    letterSpacing: 1,
    color: PX.muted,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontFamily: PLEX.sans,
    fontWeight: PW.medium,
    fontSize: 10.5,
    color: PX.ink,
    marginTop: 6,
  },

  // ── Body ──
  body: {
    paddingHorizontal: PSIZE.pageH,
    paddingTop: 22,
  },

  // ── KPI tiles ──
  kpiGrid: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: PX.border,
    borderRadius: 3,
  },
  kpiTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRightWidth: 0.5,
    borderRightColor: PX.borderLight,
  },
  kpiValue: {
    fontFamily: PLEX.sans,
    fontWeight: PW.semibold,
    fontSize: 25,
    letterSpacing: -0.4,
  },
  kpiLabel: {
    fontFamily: PLEX.sans,
    fontWeight: PW.medium,
    fontSize: 9.5,
    color: PX.inkSoft,
    marginTop: 8,
  },
  kpiSub: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 8,
    color: PX.muted,
    marginTop: 3,
  },

  // ── Two-column (attention + contents) ──
  twoCol: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 26,
  },
  attentionCol: { flex: 1.35 },
  contentsCol: { flex: 1 },
  h2: {
    fontFamily: PLEX.sans,
    fontWeight: PW.semibold,
    fontSize: 11.5,
    color: PX.ink,
    letterSpacing: -0.1,
  },

  attHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 11,
  },
  attBadge: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    letterSpacing: 0.4,
    color: PX.red,
    backgroundColor: PX.redTint,
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  attList: { borderTopWidth: 0.5, borderTopColor: PX.border },
  attItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
  },
  attDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  attBody: { flex: 1 },
  attCat: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: PX.muted,
  },
  attTitle: {
    fontFamily: PLEX.sans,
    fontWeight: PW.medium,
    fontSize: 9.5,
    color: PX.ink,
    marginTop: 3,
    lineHeight: 1.3,
  },
  attRef: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 7.5,
    color: PX.muted,
    marginTop: 2,
  },
  attEmpty: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 9,
    color: PX.muted,
    paddingVertical: 10,
  },

  // ── Contents ──
  contentsList: { borderTopWidth: 0.5, borderTopColor: PX.border, marginTop: 11 },
  contentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: PX.rowDivider,
  },
  contentsNum: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 8.5,
  },
  contentsName: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 9.5,
    color: PX.inkSoft,
    flex: 1,
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: PSIZE.pageH,
    borderTopWidth: 0.5,
    borderTopColor: PX.border,
  },
  footText: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 7.5,
    letterSpacing: 0.4,
    color: PX.muted,
  },
})
