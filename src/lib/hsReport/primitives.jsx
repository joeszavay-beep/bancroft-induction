import { Page, View, Text, Font, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE, PLEX, PW, PX, PSIZE } from './theme'

// ── Register Inter font ──
// NOTE: still used by the not-yet-migrated sections. Once the whole report is on
// Plex this remote registration becomes dead and should be removed (final PR).
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf', fontWeight: 500 },
  ],
})

// ── Register IBM Plex (redesign) — bundled .ttf served from /public/fonts ──
// Local files so the report renders correctly offline and inside the Capacitor
// iOS app (Plex Mono carries every label/number, so a remote-fetch fallback
// would visibly break the document). Plex is OFL-licensed.
Font.register({
  family: PLEX.sans,
  fonts: [
    { src: '/fonts/IBMPlexSans-Regular.ttf',  fontWeight: PW.regular },
    { src: '/fonts/IBMPlexSans-Medium.ttf',   fontWeight: PW.medium },
    { src: '/fonts/IBMPlexSans-SemiBold.ttf', fontWeight: PW.semibold },
    { src: '/fonts/IBMPlexSans-Bold.ttf',     fontWeight: PW.bold },
  ],
})
Font.register({
  family: PLEX.mono,
  fonts: [
    { src: '/fonts/IBMPlexMono-Regular.ttf',  fontWeight: PW.regular },
    { src: '/fonts/IBMPlexMono-Medium.ttf',   fontWeight: PW.medium },
    { src: '/fonts/IBMPlexMono-SemiBold.ttf', fontWeight: PW.semibold },
  ],
})

// ── PageFrame ──
// Wraps every page with repeating header, footer, and consistent padding.
export function PageFrame({ projectName, weekStart, weekEnd, clientName, reportRef, children, style, orientation }) {
  return (
    <Page size="A4" orientation={orientation} style={[frameStyles.page, style]}>
      {/* Repeating header */}
      <View style={frameStyles.header} fixed>
        <Text style={frameStyles.headerLeft}>{projectName || ''}</Text>
        <Text style={frameStyles.headerRight}>
          {weekStart && weekEnd ? `${weekStart} \u2014 ${weekEnd}` : ''}
        </Text>
      </View>

      {/* Page body */}
      <View style={frameStyles.body}>
        {children}
      </View>

      {/* Repeating footer */}
      <View style={frameStyles.footer} fixed>
        <Text style={frameStyles.footerLeft}>{clientName || ''}</Text>
        <Text style={frameStyles.footerCentre}>{reportRef || ''}</Text>
        <Text
          style={frameStyles.footerRight}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  )
}

const frameStyles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: C.textPrimary,
    backgroundColor: C.white,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: SIZE.pageH,
  },
  header: {
    position: 'absolute',
    top: 10,
    left: SIZE.pageH,
    right: SIZE.pageH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  headerLeft: {
    fontSize: 10,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
  headerRight: {
    fontSize: 10,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
  body: {
    flex: 1,
  },
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

// ── Pill ──
const PILL_COLORS = {
  green:   { bg: C.greenBg,      text: C.greenTextDark },
  amber:   { bg: C.amberBg,      text: C.amberTextDark },
  red:     { bg: C.redBg,        text: C.redTextDark },
  neutral: { bg: C.surfaceMuted,  text: C.textSecondary },
  muted:   { bg: C.borderMuted,   text: C.textMuted },
}

export function Pill({ text, color = 'neutral', icon }) {
  const palette = PILL_COLORS[color] || PILL_COLORS.neutral
  return (
    <View style={[pillStyles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[pillStyles.text, { color: palette.text }]}>
        {icon ? `${icon} ` : ''}{text}
      </Text>
    </View>
  )
}

const pillStyles = StyleSheet.create({
  pill: {
    borderRadius: 3,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 8,
    fontWeight: FONT.medium,
  },
})

// ── KPITile ──
const KPI_BORDER = {
  green:   C.green,
  amber:   C.amber,
  red:     C.red,
  neutral: C.border,
}

export function KPITile({ label, value, context, color = 'neutral' }) {
  const borderColor = KPI_BORDER[color] || KPI_BORDER.neutral
  return (
    <View style={[kpiStyles.tile, { borderColor }]}>
      <Text style={kpiStyles.label}>{label}</Text>
      <Text style={kpiStyles.value}>{value != null ? String(value) : '\u2014'}</Text>
      {context ? <Text style={kpiStyles.context}>{context}</Text> : null}
    </View>
  )
}

const kpiStyles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: C.white,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 14,
    minHeight: 70,
  },
  label: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 4,
    fontWeight: FONT.regular,
  },
  value: {
    fontSize: 22,
    fontWeight: FONT.medium,
    color: C.textPrimary,
    marginBottom: 2,
  },
  context: {
    fontSize: 9,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
})

// ── SectionHeader ──
export function SectionHeader({ number, title, context, theme }) {
  const navyColor = theme?.navy || C.navy
  const blueColor = theme?.blueLight || C.blueLight
  return (
    <View style={[shStyles.band, { backgroundColor: navyColor }]}>
      <View style={shStyles.left}>
        <Text style={[shStyles.number, { color: blueColor }]}>{String(number).padStart(2, '0')}</Text>
        <Text style={shStyles.title}>{title}</Text>
      </View>
      {context ? <Text style={[shStyles.context, { color: blueColor }]}>{context}</Text> : null}
    </View>
  )
}

const shStyles = StyleSheet.create({
  band: {
    backgroundColor: C.navy,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: SIZE.pageH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: SIZE.sectionGap,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  number: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: C.blueLight,
    letterSpacing: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: FONT.medium,
    color: C.white,
  },
  context: {
    fontSize: 10,
    color: C.blueLight,
    fontWeight: FONT.regular,
  },
})

// ── Eyebrow ──
export function Eyebrow({ text }) {
  return <Text style={eyebrowStyle}>{text}</Text>
}

const eyebrowStyle = {
  fontSize: 9,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: C.textFaint,
  marginBottom: 4,
  fontWeight: FONT.regular,
}

// ── AttentionCallout ──
export function AttentionCallout({ items }) {
  if (!items || items.length === 0) return null
  return (
    <View style={acStyles.box}>
      <Text style={acStyles.title}>{'\u26A0'} Requires attention</Text>
      <View style={acStyles.grid}>
        {items.map((item, i) => (
          <View key={i} style={acStyles.item}>
            <View style={[acStyles.bullet, { backgroundColor: item.severity === 'red' ? C.red : C.amber }]} />
            <Text style={acStyles.message}>{item.message}</Text>
            {item.page ? <Text style={acStyles.pageRef}>p.{item.page}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  )
}

const acStyles = StyleSheet.create({
  box: {
    borderLeftWidth: 3,
    borderLeftColor: C.red,
    backgroundColor: C.redBgLight,
    borderWidth: 0.5,
    borderColor: C.red,
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: FONT.medium,
    color: C.redTextDark,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '48%',
    gap: 5,
    paddingVertical: 2,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    flexShrink: 0,
  },
  message: {
    fontSize: 8.5,
    color: C.textPrimary,
    flex: 1,
    fontWeight: FONT.regular,
    lineHeight: 1.3,
  },
  pageRef: {
    fontSize: 7.5,
    color: C.textFaint,
    fontWeight: FONT.regular,
    flexShrink: 0,
  },
})

// ═════════════════════════════════════════════════════════════════════════════
// Redesign primitives — "Weekly H&S Report" (IBM Plex). Additive: these do NOT
// replace the legacy PageFrame / SectionHeader / Pill above, which the
// not-yet-migrated sections still use. The training matrix is the first consumer.
// ═════════════════════════════════════════════════════════════════════════════

// ── PlexFrame ──
// Portrait A4 page shell: slim top bar (COMPANY · PROJECT/LOCATION) + footer
// (REF · WEEKLY H&S REPORT · PAGE 0X / 0Y). Both repeat on every page (fixed).
export function PlexFrame({ companyName, clientName, projectName, location, reportRef, children, style, orientation }) {
  const company = companyName || clientName || ''
  const projLine = location ? `${projectName || ''} · ${location}` : (projectName || '')
  return (
    <Page size="A4" orientation={orientation} style={[pfx.page, style]}>
      <View style={pfx.topbar} fixed>
        <Text style={pfx.company}>{company.toUpperCase()}</Text>
        <Text style={pfx.project}>{projLine.toUpperCase()}</Text>
      </View>

      <View style={pfx.body}>{children}</View>

      <View style={pfx.footer} fixed>
        <Text style={pfx.footRef}>{reportRef || ''}</Text>
        <Text style={pfx.footMid}>WEEKLY H&S REPORT</Text>
        <Text
          style={pfx.footPage}
          render={({ pageNumber, totalPages }) =>
            `PAGE ${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`}
        />
      </View>
    </Page>
  )
}

const pfx = StyleSheet.create({
  page: {
    fontFamily: PLEX.sans,
    fontSize: 9,
    color: PX.ink,
    backgroundColor: PX.white,
    paddingTop: 46,
    paddingBottom: 42,
    paddingHorizontal: PSIZE.pageH,
  },
  topbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: PSIZE.pageH,
    borderBottomWidth: 0.5,
    borderBottomColor: PX.border,
  },
  company: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 8,
    letterSpacing: 1.4,
    color: PX.ink,
  },
  project: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 8,
    letterSpacing: 0.4,
    color: PX.muted,
  },
  // No flex — content flows and paginates naturally across pages (the fixed top
  // bar + footer repeat). flex:1 would fight multi-page flow.
  body: {},
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
  footRef:  { fontFamily: PLEX.mono, fontWeight: PW.medium, fontSize: 7.5, letterSpacing: 0.4, color: PX.muted },
  footMid:  { fontFamily: PLEX.mono, fontWeight: PW.medium, fontSize: 7.5, letterSpacing: 0.4, color: PX.muted },
  footPage: { fontFamily: PLEX.mono, fontWeight: PW.medium, fontSize: 7.5, letterSpacing: 0.4, color: PX.muted },
})

// ── PlexSectionHeader ──
// Mono number + Plex Sans title + right-aligned count, underlined with a 1pt rule.
export function PlexSectionHeader({ number, title, count, accent }) {
  const ac = accent || PX.accent
  return (
    <View style={psh.wrap}>
      <Text style={[psh.num, { color: ac }]}>{String(number).padStart(2, '0')}</Text>
      <Text style={psh.title}>{title}</Text>
      {count != null ? <Text style={psh.count}>{count}</Text> : null}
    </View>
  )
}

const psh = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: PX.ink,
    paddingBottom: 7,
    marginBottom: 14,
  },
  num: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 9,
    marginRight: 10,
  },
  title: {
    fontFamily: PLEX.sans,
    fontWeight: PW.semibold,
    fontSize: 13.5,
    color: PX.ink,
    letterSpacing: -0.15,
  },
  count: {
    fontFamily: PLEX.mono,
    fontWeight: PW.medium,
    fontSize: 9,
    color: PX.grey,
    marginLeft: 'auto',
  },
})

// ── Chips ──
// Status summary row: each chip is dot + value + label.
// items: [{ value, label, dot }]  — dot is a colour string (omit for no dot).
export function Chips({ items }) {
  if (!items || items.length === 0) return null
  return (
    <View style={chp.row}>
      {items.map((it, i) => (
        <View key={i} style={chp.chip}>
          {it.dot ? <View style={[chp.dot, { backgroundColor: it.dot }]} /> : null}
          <Text style={chp.value}>{String(it.value)}</Text>
          <Text style={chp.label}>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}

const chp = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PX.chipBg,
    borderWidth: 0.5,
    borderColor: PX.borderLight,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  value: {
    fontFamily: PLEX.sans,
    fontWeight: PW.semibold,
    fontSize: 8.5,
    color: PX.ink,
  },
  label: {
    fontFamily: PLEX.sans,
    fontWeight: PW.medium,
    fontSize: 8.5,
    color: PX.inkSoft,
  },
})

// ── SectionBlock ──
// Wraps a flowing section. Sections pack against each other; minPresenceAhead stops
// a section from starting with too little room (avoids an orphaned header at a page
// bottom) while still letting a long section break across pages.
export function SectionBlock({ children, keepTogether }) {
  return (
    <View wrap={!keepTogether} minPresenceAhead={90} style={sbk.block}>
      {children}
    </View>
  )
}

const sbk = StyleSheet.create({
  block: { marginBottom: PSIZE.sectionGap },
})

// ── StatusPill ──
// Rounded mono pill with a tinted background — equipment/inspection/safe-start status.
const STATUS_TONES = {
  red:     { fg: PX.red,   bg: PX.redTint },
  amber:   { fg: PX.amber, bg: PX.amberTint },
  green:   { fg: PX.green, bg: 'rgba(46,125,91,0.10)' },
  neutral: { fg: PX.grey,  bg: PX.chipBg2 },
}

export function StatusPill({ label, tone = 'neutral' }) {
  const c = STATUS_TONES[tone] || STATUS_TONES.neutral
  return (
    <View style={[stp.pill, { backgroundColor: c.bg }]}>
      <Text style={[stp.text, { color: c.fg }]}>{label}</Text>
    </View>
  )
}

const stp = StyleSheet.create({
  pill: {
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    letterSpacing: 0.3,
  },
})

// ── EmptyState ──
// Dashed box used for "no records this period" states.
export function EmptyState({ text }) {
  return (
    <View style={est.box}>
      <Text style={est.text}>{text}</Text>
    </View>
  )
}

const est = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PX.dashed,
    borderRadius: 3,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 4,
  },
  text: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 9,
    color: PX.muted,
  },
})

// ── NotesCallout ──
// Left-accent-bar note block (inspection notes etc.).
export function NotesCallout({ title = 'Notes', text, accent }) {
  if (!text || !String(text).trim()) return null
  return (
    <View style={[ncl.box, { borderLeftColor: accent || PX.accent }]}>
      <Text style={ncl.title}>{title.toUpperCase()}</Text>
      <Text style={ncl.text}>{String(text).trim()}</Text>
    </View>
  )
}

const ncl = StyleSheet.create({
  box: {
    backgroundColor: PX.chipBg,
    borderLeftWidth: 2,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  title: {
    fontFamily: PLEX.mono,
    fontWeight: PW.semibold,
    fontSize: 7,
    letterSpacing: 1,
    color: PX.muted,
    textTransform: 'uppercase',
  },
  text: {
    fontFamily: PLEX.sans,
    fontWeight: PW.regular,
    fontSize: 8.5,
    color: PX.inkSoft,
    marginTop: 5,
    lineHeight: 1.4,
  },
})

// NOTE: shared table style fragments live in theme.js as `PLEX_TABLE` (a plain
// style object) — keeping non-component exports out of this components file.
