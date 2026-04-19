import { Document, Text } from '@react-pdf/renderer'
import { computeReportSummary, formatDate } from './utils'
import { SUPERVISOR_ROLES } from './theme'
import { buildSectionList } from './sectionRegistry'
import { PageFrame, SectionHeader } from './primitives'
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

  // Build section list from registry (commit 3 will pass company.settings.report.section_config)
  const sections = buildSectionList(null)

  const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()
  const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()
  const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`

  const pageProps = {
    projectName: data.project?.name,
    weekStart: formatDate(data.weekStart),
    weekEnd: formatDate(data.weekEnd),
    clientName: data.companyName,
    reportRef,
  }

  // Pre-filter operatives for sections 02 and 03
  const allOps = Array.isArray(data.operatives) ? data.operatives : []
  const operativeOps = allOps.filter(op => !SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))
  const supervisorOps = allOps.filter(op => SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))

  const matrixProps = {
    weekEnd: data.weekEnd,
    projectName: data.project?.name,
    weekStart: formatDate(data.weekStart),
    weekEndFmt: formatDate(data.weekEnd),
    clientName: data.companyName,
    reportRef,
  }

  return (
    <Document>
      <CoverPage data={data} summary={summary} sections={sections} />
      {/* Section 1 — Toolbox Talks */}
      <ToolboxTalks
        rawTalks={data.rawTalks}
        operatives={data.operatives}
        pageProps={pageProps}
      />

      {/* Section 2 — Operative Training Matrix (excludes supervisors) */}
      <TrainingMatrix
        operatives={operativeOps}
        {...matrixProps}
      />

      {/* Section 3 — Management Training (supervisors only) */}
      <TrainingMatrix
        operatives={supervisorOps}
        sectionNumber={3}
        title="Management training"
        contextLabel="supervisor"
        {...matrixProps}
      />

      {/* Section 4 — Equipment Register */}
      <EquipmentRegister
        equipmentRows={data.equipmentRows}
        projectName={data.project?.name}
        pageProps={pageProps}
      />

      {/* Section 5 — PM Inspection */}
      <InspectionSection
        sectionNumber={5}
        title="PM inspection"
        checklist={data.pmChecklist}
        inspectorName={data.pmInspector}
        notes={data.pmComments}
        pageProps={pageProps}
      />
      {/* Section 6 — Environmental Inspection */}
      <InspectionSection
        sectionNumber={6}
        title="Environmental inspection"
        checklist={data.envChecklist}
        inspectorName={data.envInspector}
        notes={data.envComments}
        pageProps={pageProps}
      />
      {/* Section 7 — Operative Inspection */}
      <InspectionSection
        sectionNumber={7}
        title="Operative inspection"
        checklist={data.opChecklist}
        inspectorName={data.opInspector}
        notes={data.opComments}
        pageProps={pageProps}
      />

      {/* Section 8 — RAMS Register */}
      <RAMSRegister rawRams={data.rawRams} pageProps={pageProps} />

      {/* Section 9 — Labour Return */}
      <LabourReturn
        rawAttendance={data.rawAttendance}
        operatives={data.operatives}
        pageProps={pageProps}
      />

      {/* Section 10 — Safe Start Cards */}
      <SafeStartCards
        safeStartCards={data.safeStartCards}
        safeStartCompany={data.safeStartCompany}
        safeStartSupervisor={data.safeStartSupervisor}
        safeStartTrade={data.safeStartTrade}
        pageProps={pageProps}
      />
    </Document>
  )
}
