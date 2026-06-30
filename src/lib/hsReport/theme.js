export const C = {
  navy:           '#1E2A4A',
  navyLight:      '#2D3B5F',
  blue:           '#3B82F6',
  blueLight:      '#93C5FD',
  green:          '#22C55E',
  greenBg:        '#F0FDF4',
  greenText:      '#15803D',
  greenTextDark:  '#166534',
  amber:          '#F59E0B',
  amberBg:        '#FEF3C7',
  amberText:      '#92400E',
  amberTextDark:  '#B45309',
  red:            '#EF4444',
  redBg:          '#FEE2E2',
  redBgLight:     '#FEF2F2',
  redText:        '#DC2626',
  redTextDark:    '#991B1B',
  textPrimary:    '#0F172A',
  textSecondary:  '#475569',
  textMuted:      '#64748B',
  textFaint:      '#94A3B8',
  empty:          '#CBD5E1',
  border:         '#E2E8F0',
  borderMuted:    '#F1F5F9',
  rowShade:       '#F8FAFC',
  surfaceMuted:   '#F1F5F9',
  white:          '#FFFFFF',
}

export const FONT = {
  regular: 400,
  medium: 500,
}

export const SIZE = {
  pageH: 36,
  sectionGap: 20,
  rowHeight: 22,
}

// Single source of truth for supervisor-level roles.
// Section 02 (operative training) excludes these; section 03 (management training) includes them.
export const SUPERVISOR_ROLES = ['supervisor', 'foreman', 'manager', 'director']

// ─────────────────────────────────────────────────────────────────────────────
// Redesign theme — "Weekly H&S Report" (Claude Design handoff), IBM Plex.
// ADDITIVE: the legacy C / FONT / SIZE above stay in use by the not-yet-migrated
// sections. These tokens drive the redesigned sections (training matrix first).
// ─────────────────────────────────────────────────────────────────────────────

// Plex font families (registered from bundled .ttf in primitives.jsx)
export const PLEX = {
  sans: 'IBM Plex Sans',
  mono: 'IBM Plex Mono',
}

// Weight scale used by the redesign (Plex Sans 400/500/600/700, Mono 400/500/600)
export const PW = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
}

// Redesign palette (extracted from the handoff)
export const PX = {
  // Accent — brand-overridable via company.secondary_colour.
  // Handoff default #1C2E45; design also offers #16191C / #264A3A / #5A4632.
  accent:      '#1C2E45',

  // Text
  ink:         '#14181B',  // primary text + valid cert dates
  inkSoft:     '#3A3F44',  // strong grey (KPI labels, chip text)
  grey:        '#5C6166',  // medium grey (section counts, role, serial)
  muted:       '#9AA0A6',  // mono labels, footers, secondary
  faint:       '#C2C5C8',  // em-dashes / no-record / ≤90d de-emphasis

  // Status — ≤30d kept RED (urgent) per owner; amber reserved for ≤90d.
  red:         '#C13B33',  // expired + expiring ≤30d
  amber:       '#A8761B',  // expiring ≤90d ("expiring soon")
  green:       '#2E7D5B',  // valid dot / inspection pass
  redTint:     'rgba(193,59,51,0.10)',
  amberTint:   'rgba(168,118,27,0.10)',

  // Borders / rules
  border:      '#E6E6E2',
  borderLight: '#EEEDE9',
  rowDivider:  '#F0EFEB',
  headRule:    '#DADAD5',
  dashed:      '#D8D8D3',

  // Surfaces
  chipBg:      '#F7F6F2',
  chipBg2:     '#F2F1ED',
  white:       '#FFFFFF',
}

// Redesign spacing — pt @72dpi (handoff px @96dpi × 0.75 as a guide)
export const PSIZE = {
  pageH:      36,  // ≈ 48px side margin
  rowPad:     6,   // comfortable row padding (compact ≈ 4)
  sectionGap: 22,
}

// Shared table style fragments for the redesigned sections. Plain style objects
// (react-pdf accepts these directly) — each section applies column widths on top,
// e.g. [PLEX_TABLE.headCell, { width: 70 }]. Mono uppercase headers, divider rows,
// NO zebra striping — matching the training-matrix pattern. Lives here (not in
// primitives.jsx) so that components file only exports components.
export const PLEX_TABLE = {
  headRow:    { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: PX.headRule, paddingBottom: 7, marginBottom: 2 },
  headCell:   { fontFamily: PLEX.mono, fontWeight: PW.semibold, fontSize: 7, color: PX.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  row:        { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 0.5, borderBottomColor: PX.rowDivider, paddingVertical: PSIZE.rowPad },
  num:        { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.muted },
  primary:    { fontFamily: PLEX.sans, fontWeight: PW.medium, fontSize: 9, color: PX.ink },
  cell:       { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8.5, color: PX.inkSoft },
  cellMuted:  { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8, color: PX.muted },
  mono:       { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.ink },
  monoMuted:  { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 8, color: PX.faint },
  continuation: { fontFamily: PLEX.mono, fontWeight: PW.regular, fontSize: 7.5, color: PX.muted, textAlign: 'right', marginTop: 8 },
  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: PX.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendLabel: { fontFamily: PLEX.sans, fontWeight: PW.regular, fontSize: 8, color: PX.muted },
}
