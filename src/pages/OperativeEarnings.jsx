import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import { formatMoney, calculateCIS } from '../lib/subcontractor'
import { PoundSterling, TrendingUp, Calendar, Download, Briefcase } from 'lucide-react'

export default function OperativeEarnings() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [jobOps, setJobOps] = useState([])
  const [tab, setTab] = useState('summary') // summary | monthly | by-job

  async function loadEarnings(opData) {
    setLoading(true)

    // Get all job_operatives for this operative
    const { data: joData } = await supabase
      .from('job_operatives')
      .select('*, subcontractor_jobs(id, name)')
      .eq('operative_id', opData.id)

    const joList = joData || []
    setJobOps(joList)

    // Get all approved timesheet entries
    const { data: tsData } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('operative_id', opData.id)
      .in('status', ['approved', 'reviewed', 'auto'])
      .order('date')

    setEntries(tsData || [])
    setLoading(false)
  }

  useEffect(() => {
    const session = getSession('operative_session')
    if (!session) { navigate('/worker-login'); return }
    const data = JSON.parse(session)
    setOp(data)
    loadEarnings(data)
  }, [])

  if (!op) return null

  // Build a lookup: job_operative_id -> job_operative record
  const joById = {}
  jobOps.forEach(jo => { joById[jo.id] = jo; joById[jo.job_id] = jo })

  // Calculate earnings from entries
  function calcEntryEarnings(entry) {
    // Find the job_operative for this entry
    const jo = joById[entry.job_operative_id] || joById[entry.job_id] || jobOps[0]
    if (!jo) return { gross: 0, cis: 0, net: 0 }

    const cost = entry.cost_calculated || 0
    const cisRate = jo.cis_rate || 20
    const cisAmount = calculateCIS(cost, cisRate)
    return { gross: cost, cis: cisAmount, net: cost - cisAmount, cisRate }
  }

  // Totals
  let totalGross = 0, totalCIS = 0, totalNet = 0, totalDays = 0
  entries.forEach(e => {
    const { gross, cis, net } = calcEntryEarnings(e)
    totalGross += gross
    totalCIS += cis
    totalNet += net
    if ((e.hours_adjusted ?? e.hours_calculated ?? 0) > 0) totalDays++
  })

  // Monthly breakdown
  const monthlyMap = {}
  entries.forEach(e => {
    const monthKey = e.date?.slice(0, 7) // YYYY-MM
    if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { days: 0, gross: 0, cis: 0, net: 0 }
    const { gross, cis, net } = calcEntryEarnings(e)
    monthlyMap[monthKey].gross += gross
    monthlyMap[monthKey].cis += cis
    monthlyMap[monthKey].net += net
    if ((e.hours_adjusted ?? e.hours_calculated ?? 0) > 0) monthlyMap[monthKey].days++
  })
  const monthlyRows = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({ month, ...data }))

  // Per-job breakdown
  const jobMap = {}
  entries.forEach(e => {
    const jo = joById[e.job_operative_id] || joById[e.job_id] || jobOps[0]
    const jobName = jo?.subcontractor_jobs?.name || 'Unknown Job'
    const jobId = jo?.job_id || 'unknown'
    if (!jobMap[jobId]) jobMap[jobId] = { name: jobName, days: 0, gross: 0, cis: 0, net: 0 }
    const { gross, cis, net } = calcEntryEarnings(e)
    jobMap[jobId].gross += gross
    jobMap[jobId].cis += cis
    jobMap[jobId].net += net
    if ((e.hours_adjusted ?? e.hours_calculated ?? 0) > 0) jobMap[jobId].days++
  })
  const jobRows = Object.values(jobMap)

  function formatMonth(ym) {
    const [y, m] = ym.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(m) - 1]} ${y}`
  }

  function downloadCISStatement() {
    const lines = [
      `CIS Statement — ${op.name}`,
      `Generated: ${new Date().toLocaleDateString('en-GB')}`,
      '',
      `Total Gross: ${formatMoney(totalGross)}`,
      `Total CIS Deducted: ${formatMoney(totalCIS)}`,
      `Total Net: ${formatMoney(totalNet)}`,
      `Total Days Worked: ${totalDays}`,
      '',
      '--- Monthly Breakdown ---',
      '',
    ]
    monthlyRows.forEach(r => {
      lines.push(`${formatMonth(r.month)}: Gross ${formatMoney(r.gross)} | CIS ${formatMoney(r.cis)} | Net ${formatMoney(r.net)} | ${r.days} days`)
    })
    lines.push('')
    lines.push('--- Per Job Breakdown ---')
    lines.push('')
    jobRows.forEach(r => {
      lines.push(`${r.name}: Gross ${formatMoney(r.gross)} | CIS ${formatMoney(r.cis)} | Net ${formatMoney(r.net)} | ${r.days} days`)
    })
    lines.push('')
    lines.push('This is an indicative summary. Please refer to your official CIS deduction certificates for tax purposes.')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CIS-Statement-${op.name?.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const primaryColor = op.primary_colour || '#1B6FC8'
  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'by-job', label: 'By Job' },
  ]

  return (
    <WorkerSidebarLayout op={op}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>My Earnings</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Earnings from approved timesheet entries</p>
          </div>
          <button onClick={downloadCISStatement}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Download size={14} />
            CIS Statement
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard icon={PoundSterling} label="Gross Earned" value={formatMoney(totalGross)} color="#2EA043" />
              <SummaryCard icon={TrendingUp} label="CIS Deducted" value={formatMoney(totalCIS)} color="#DA3633" />
              <SummaryCard icon={PoundSterling} label="Net Pay" value={formatMoney(totalNet)} color={primaryColor} />
              <SummaryCard icon={Calendar} label="Days Worked" value={totalDays.toString()} color="#7C3AED" />
            </div>

            {/* Tab selector */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${
                    tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'summary' && (
              <div className="space-y-3">
                {entries.length === 0 ? (
                  <div className="bg-white border border-[#E2E6EA] rounded-xl p-8 text-center">
                    <PoundSterling size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No earnings data yet</p>
                    <p className="text-xs text-slate-400 mt-1">Earnings will appear here once you have approved timesheet entries</p>
                  </div>
                ) : (
                  <div className="bg-white border border-[#E2E6EA] rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Earnings Overview</p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Gross</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatMoney(totalGross)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>CIS Deduction{jobOps.length === 1 ? ` (${jobOps[0]?.cis_rate || 20}%)` : ''}</span>
                        <span className="text-sm font-bold text-red-600">-{formatMoney(totalCIS)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Net Pay</span>
                        <span className="text-base font-bold" style={{ color: primaryColor }}>{formatMoney(totalNet)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'monthly' && (
              <div className="space-y-2">
                {monthlyRows.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No monthly data</p>
                ) : monthlyRows.map(r => (
                  <div key={r.month} className="bg-white border border-[#E2E6EA] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatMonth(r.month)}</p>
                      <span className="text-[10px] font-semibold text-slate-400">{r.days} days</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">Gross</p>
                        <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatMoney(r.gross)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">CIS</p>
                        <p className="font-bold text-red-600">-{formatMoney(r.cis)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">Net</p>
                        <p className="font-bold" style={{ color: primaryColor }}>{formatMoney(r.net)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'by-job' && (
              <div className="space-y-2">
                {jobRows.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No job data</p>
                ) : jobRows.map((r, i) => (
                  <div key={i} className="bg-white border border-[#E2E6EA] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Briefcase size={14} style={{ color: primaryColor }} />
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">{r.days} days</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">Gross</p>
                        <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatMoney(r.gross)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">CIS</p>
                        <p className="font-bold text-red-600">-{formatMoney(r.cis)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 uppercase font-semibold text-[10px]">Net</p>
                        <p className="font-bold" style={{ color: primaryColor }}>{formatMoney(r.net)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              Figures are indicative based on timesheet data. Refer to official payslips and CIS certificates for tax purposes.
            </p>
          </>
        )}
      </div>
    </WorkerSidebarLayout>
  )
}

// eslint-disable-next-line no-unused-vars
function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white border border-[#E2E6EA] rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}
