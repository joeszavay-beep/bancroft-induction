import { Document } from '@react-pdf/renderer'
import { computeReportSummary } from './utils'
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

  return (
    <Document>
      <CoverPage data={data} summary={summary} />
      {/* Phase 3+4 sections will go here */}
    </Document>
  )
}
