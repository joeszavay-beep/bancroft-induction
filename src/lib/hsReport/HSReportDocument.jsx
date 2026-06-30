import { Document } from '@react-pdf/renderer'
import { computeReportSummary, formatDate } from './utils'
import { C, SUPERVISOR_ROLES, PX } from './theme'
import { buildSectionList } from './sectionRegistry'
import { PlexFrame } from './primitives'
import CoverPage from './CoverPage'
import ToolboxTalks from './ToolboxTalks'
import TrainingMatrix from './TrainingMatrix'
import InspectionSection from './InspectionSection'
import EquipmentRegister from './EquipmentRegister'
import RAMSRegister from './RAMSRegister'
import LabourReturn from './LabourReturn'
import SafeStartCards from './SafeStartCards'

export default function HSReportDocument({ data }) {
  const summary = computeReportSummary({
    operatives: data.operatives,
    weekEnd: data.weekEnd,
    pmChecklist: data.pmChecklist,
    envChecklist: data.envChecklist,
    opChecklist: data.opChecklist,
    labourData: data.labourData,
    rawAttendance: data.rawAttendance,
    equipmentRows: data.equipmentRows,
  })

  // Resolve which sections are included + their sequential numbers from the report's
  // section config (per-report toggles; falls back to all-on defaults). buildSectionList
  // renumbers included sections, so excluding one shifts the rest up (no gaps).
  const sections = buildSectionList(data.sectionConfig)
  const inc = {} // id -> included?
  const num = {} // id -> sequential section number (null when excluded)
  sections.forEach(s => { inc[s.id] = s.included; num[s.id] = s.num })

  // Dynamic theme — override navy/blue from company brand colours
  const theme = {
    // Redesign accent (used by the new Plex sections, e.g. training matrix);
    // same brand source as navy, falls back to the handoff default.
    accent: data.company?.secondary_colour || PX.accent,
    navy: data.company?.secondary_colour || C.navy,
    navyLight: C.navyLight,
    blue: data.company?.primary_colour || C.blue,
    blueLight: C.blueLight,
    green: C.green, greenBg: C.greenBg, greenText: C.greenText, greenTextDark: C.greenTextDark,
    amber: C.amber, amberBg: C.amberBg, amberText: C.amberText, amberTextDark: C.amberTextDark,
    red: C.red, redBg: C.redBg, redBgLight: C.redBgLight, redText: C.redText, redTextDark: C.redTextDark,
    textPrimary: C.textPrimary, textSecondary: C.textSecondary, textMuted: C.textMuted, textFaint: C.textFaint,
    empty: C.empty, border: C.border, borderMuted: C.borderMuted, rowShade: C.rowShade, surfaceMuted: C.surfaceMuted,
    white: C.white,
  }

  const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()
  const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()
  const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`

  const pageProps = {
    projectName: data.project?.name,
    location: data.project?.address || data.project?.location || '',
    weekStart: formatDate(data.weekStart),
    weekEnd: formatDate(data.weekEnd),
    clientName: data.companyName,
    reportRef,
  }

  // Pre-filter operatives for sections 02 and 03
  const allOps = Array.isArray(data.operatives) ? data.operatives : []
  const operativeOps = allOps.filter(op => !SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))
  const supervisorOps = allOps.filter(op => SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))

  return (
    <Document>
      <CoverPage data={data} summary={summary} sections={sections} theme={theme} />

      {/* All sections flow inside ONE page shell so short/empty sections pack
          together instead of each owning a full page. react-pdf paginates the
          flow automatically, repeating the fixed top bar + footer. */}
      <PlexFrame {...pageProps}>
        {/* Each section renders only when included; its number is the renumbered
            sequential value from buildSectionList so excluded sections leave no gap. */}
        {inc.toolbox && (
          <ToolboxTalks number={num.toolbox} rawTalks={data.rawTalks} operatives={data.operatives} theme={theme} />
        )}

        {inc.training && (
          <TrainingMatrix operatives={operativeOps} weekEnd={data.weekEnd} sectionNumber={num.training} theme={theme} />
        )}

        {inc.mgmt && (
          <TrainingMatrix
            operatives={supervisorOps}
            weekEnd={data.weekEnd}
            sectionNumber={num.mgmt}
            title="Management training"
            contextLabel="supervisor"
            theme={theme}
          />
        )}

        {inc.equipment && (
          <EquipmentRegister number={num.equipment} equipmentRows={data.equipmentRows} theme={theme} />
        )}

        {inc.pm && (
          <InspectionSection
            sectionNumber={num.pm}
            title="PM inspection"
            checklist={data.pmChecklist}
            inspectorName={data.pmInspector}
            notes={data.pmComments}
            theme={theme}
          />
        )}
        {inc.env && (
          <InspectionSection
            sectionNumber={num.env}
            title="Environmental inspection"
            checklist={data.envChecklist}
            inspectorName={data.envInspector}
            notes={data.envComments}
            theme={theme}
          />
        )}
        {inc.operative && (
          <InspectionSection
            sectionNumber={num.operative}
            title="Operative inspection"
            checklist={data.opChecklist}
            inspectorName={data.opInspector}
            notes={data.opComments}
            theme={theme}
          />
        )}

        {inc.rams && (
          <RAMSRegister number={num.rams} rawRams={data.rawRams} theme={theme} />
        )}

        {inc.labour && (
          <LabourReturn number={num.labour} rawAttendance={data.rawAttendance} operatives={data.operatives} theme={theme} />
        )}

        {inc.safestart && (
          <SafeStartCards
            number={num.safestart}
            safeStartCards={data.safeStartCards}
            safeStartCompany={data.safeStartCompany}
            safeStartSupervisor={data.safeStartSupervisor}
            safeStartTrade={data.safeStartTrade}
            theme={theme}
          />
        )}
      </PlexFrame>
    </Document>
  )
}
