import { Document, Text } from '@react-pdf/renderer'
import { computeReportSummary, formatDate } from './utils'
import { PageFrame, SectionHeader } from './primitives'
import CoverPage from './CoverPage'
import ToolboxTalks from './ToolboxTalks'
import TrainingMatrix from './TrainingMatrix'
import InspectionSection from './InspectionSection'
import RAMSRegister from './RAMSRegister'

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

  return (
    <Document>
      <CoverPage data={data} summary={summary} />
      {/* Section 1 — Toolbox Talks */}
      <ToolboxTalks
        rawTalks={data.rawTalks}
        operatives={data.operatives}
        pageProps={pageProps}
      />

      {/* Section 2 — Operative Training Matrix */}
      <TrainingMatrix
        operatives={data.operatives}
        weekEnd={data.weekEnd}
        projectName={data.project?.name}
        weekStart={formatDate(data.weekStart)}
        weekEndFmt={formatDate(data.weekEnd)}
        clientName={data.companyName}
        reportRef={reportRef}
      />

      {/* Placeholder sections 3–4 */}
      {[
        { num: 3, title: 'Management training' },
        { num: 4, title: 'Equipment register' },
      ].map(sec => (
        <PageFrame key={sec.num} projectName={data.project?.name} weekStart={formatDate(data.weekStart)} weekEnd={formatDate(data.weekEnd)} clientName={data.companyName} reportRef={reportRef}>
          <SectionHeader number={sec.num} title={sec.title} />
          <Text style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 40 }}>Content will be added in Phase 3 & 4</Text>
        </PageFrame>
      ))}

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

      {/* Placeholder sections 9–10 */}
      {[
        { num: 9, title: 'Labour return' },
        { num: 10, title: 'Safe start cards' },
      ].map(sec => (
        <PageFrame key={sec.num} projectName={data.project?.name} weekStart={formatDate(data.weekStart)} weekEnd={formatDate(data.weekEnd)} clientName={data.companyName} reportRef={reportRef}>
          <SectionHeader number={sec.num} title={sec.title} />
          <Text style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 40 }}>Content will be added in Phase 3 & 4</Text>
        </PageFrame>
      ))}
    </Document>
  )
}
