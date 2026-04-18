import { Document, Text } from '@react-pdf/renderer'
import { computeReportSummary, formatDate } from './utils'
import { PageFrame, SectionHeader } from './primitives'
import CoverPage from './CoverPage'

export default function HSReportDocument({ data }) {
  const summary = computeReportSummary({
    operatives: data.operatives,
    weekEnd: data.weekEnd,
    pmChecklist: data.pmChecklist,
    envChecklist: data.envChecklist,
    opChecklist: data.opChecklist,
    labourData: data.labourData,
    equipmentRows: data.equipmentRows,
  })

  const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()
  const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()
  const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`

  return (
    <Document>
      <CoverPage data={data} summary={summary} />
      {/* Placeholder section pages - will be replaced in Phase 3+4 */}
      {[
        { num: 1, title: 'Toolbox talks' },
        { num: 2, title: 'Operative training matrix' },
        { num: 3, title: 'Management training' },
        { num: 4, title: 'Equipment register' },
        { num: 5, title: 'PM inspection' },
        { num: 6, title: 'Environmental inspection' },
        { num: 7, title: 'Operative inspection' },
        { num: 8, title: 'RAMS register' },
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
