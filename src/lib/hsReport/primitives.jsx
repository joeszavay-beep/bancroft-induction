import { Page, View, Text, Font, StyleSheet } from '@react-pdf/renderer'
import { C, FONT, SIZE } from './theme'

// ── Register Inter font ──
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf', fontWeight: 500 },
  ],
})

// ── PageFrame ──
// Wraps every page with repeating header, footer, and consistent padding.
export function PageFrame({ projectName, weekStart, weekEnd, clientName, reportRef, children, style }) {
  return (
    <Page size="A4" style={[frameStyles.page, style]}>
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
    borderRadius: 8,
    padding: 14,
  },
  label: {
    fontSize: 9,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
export function SectionHeader({ number, title, context }) {
  return (
    <View style={shStyles.band}>
      <View style={shStyles.left}>
        <Text style={shStyles.number}>{String(number).padStart(2, '0')}</Text>
        <Text style={shStyles.title}>{title}</Text>
      </View>
      {context ? <Text style={shStyles.context}>{context}</Text> : null}
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
    gap: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    gap: 4,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  message: {
    fontSize: 9,
    color: C.textPrimary,
    flex: 1,
    fontWeight: FONT.regular,
  },
  pageRef: {
    fontSize: 8,
    color: C.textFaint,
    fontWeight: FONT.regular,
  },
})
