import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  formatMoney, calculateProjections, calculateBurnRate,
  TRAFFIC_LIGHT_COLORS,
} from '../lib/subcontractor'
import toast from 'react-hot-toast'
import {
  PoundSterling, TrendingUp, TrendingDown, Clock, Calendar,
  AlertTriangle, ChevronRight, Briefcase, Loader2, ArrowRight,
  Shield, X, Ban
} from 'lucide-react'

export default function SubcontractorDashboard() {
  const navigate = useNavigate()
  const { user } = useCompany()
  const cid = user?.company_id

  const [jobs, setJobs] = useState([])
  const [timesheetEntries, setTimesheetEntries] = useState([])
  const [variations, setVariations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState('all')
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set())

  async function loadData() {
    setLoading(true)
    try {
      const [jobRes, tsRes] = await Promise.all([
        supabase.from('subcontractor_jobs').select('*, practical_completion_date, defects_end_date, final_account_status, margin_alert_threshold, retention_pct').eq('company_id', cid).order('name'),
        supabase.from('timesheet_entries').select('job_id, date, cost_calculated, status').eq('company_id', cid),
      ])
      const jobIds = (jobRes.data || []).map(j => j.id)
      let varData = []
      if (jobIds.length > 0) {
        const { data } = await supabase.from('job_variations').select('job_id, value, status').in('job_id', jobIds)
        varData = data || []
      }
      setJobs(jobRes.data || [])
      setTimesheetEntries(tsRes.data || [])
      setVariations(varData)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load dashboard data')
    }
    setLoading(false)
  }

  useEffect(() => { if (cid) loadData() }, [cid]) // eslint-disable-line react-hooks/set-state-in-effect

  // Filter by selected job
  const filteredJobs = useMemo(() => {
    if (selectedJobId === 'all') return jobs.filter(j => j.status === 'active')
    return jobs.filter(j => j.id === selectedJobId)
  }, [jobs, selectedJobId])

  const filteredEntries = useMemo(() => {
    if (selectedJobId === 'all') return timesheetEntries
    return timesheetEntries.filter(e => e.job_id === selectedJobId)
  }, [timesheetEntries, selectedJobId])

  const filteredVariations = useMemo(() => {
    const jobIds = new Set(filteredJobs.map(j => j.id))
    return variations.filter(v => jobIds.has(v.job_id))
  }, [variations, filteredJobs])

  // Compute financials
  const financials = useMemo(() => {
    const originalContract = filteredJobs.reduce((s, j) => s + (j.contract_value || 0), 0)
    const approvedVars = filteredVariations.filter(v => v.status === 'approved')
    const variationsTotal = approvedVars.reduce((s, v) => s + (v.value || 0), 0)
    const revisedContract = originalContract + variationsTotal

    const totalSpend = filteredEntries.reduce((s, e) => s + (e.cost_calculated || 0), 0)

    // Weekly spends (last 8 weeks)
    const now = new Date()
    const weeklySpends = []
    for (let w = 0; w < 8; w++) {
      const wEnd = new Date(now)
      wEnd.setDate(wEnd.getDate() - w * 7)
      const wStart = new Date(wEnd)
      wStart.setDate(wStart.getDate() - 7)
      const wStartStr = wStart.toISOString().split('T')[0]
      const wEndStr = wEnd.toISOString().split('T')[0]
      const weekTotal = filteredEntries
        .filter(e => e.date >= wStartStr && e.date < wEndStr)
        .reduce((s, e) => s + (e.cost_calculated || 0), 0)
      weeklySpends.push(weekTotal)
    }

    const burnRate = calculateBurnRate(weeklySpends)

    // Build a synthetic job for projections
    const syntheticJob = {
      contract_value: originalContract,
      revised_contract_value: revisedContract,
      est_completion_date: filteredJobs.length === 1 ? filteredJobs[0].est_completion_date : null,
    }
    const projections = calculateProjections(syntheticJob, totalSpend, weeklySpends)

    return {
      originalContract,
      variationsTotal,
      revisedContract,
      totalSpend,
      burnRate,
      weeklySpends: weeklySpends.slice(0, 4),
      projections,
    }
  }, [filteredJobs, filteredEntries, filteredVariations])

  // Per-job projections for margin alerts
  const perJobProjections = useMemo(() => {
    return filteredJobs.map(job => {
      const jobEntries = timesheetEntries.filter(e => e.job_id === job.id)
      const jobSpend = jobEntries.reduce((s, e) => s + (e.cost_calculated || 0), 0)
      const now = new Date()
      const weeklySpends = []
      for (let w = 0; w < 8; w++) {
        const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - w * 7)
        const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 7)
        const wStartStr = wStart.toISOString().split('T')[0]
        const wEndStr = wEnd.toISOString().split('T')[0]
        const weekTotal = jobEntries
          .filter(e => e.date >= wStartStr && e.date < wEndStr)
          .reduce((s, e) => s + (e.cost_calculated || 0), 0)
        weeklySpends.push(weekTotal)
      }
      const burnRate = calculateBurnRate(weeklySpends)
      const jobVars = variations.filter(v => v.job_id === job.id && v.status === 'approved')
      const variationsTotal = jobVars.reduce((s, v) => s + (v.value || 0), 0)
      const syntheticJob = {
        contract_value: job.contract_value,
        revised_contract_value: (job.contract_value || 0) + variationsTotal,
        est_completion_date: job.est_completion_date,
      }
      const projections = calculateProjections(syntheticJob, jobSpend, weeklySpends)

      // Burn rate trend: compare recent 2 weeks vs prior 2 weeks
      const recent = (weeklySpends[0] || 0) + (weeklySpends[1] || 0)
      const prior = (weeklySpends[2] || 0) + (weeklySpends[3] || 0)
      let burnTrend = 'stable'
      if (prior > 0 && recent > prior * 1.1) burnTrend = 'increasing'
      else if (prior > 0 && recent < prior * 0.9) burnTrend = 'decreasing'

      return { ...job, projections, burnRate, burnTrend, weeklySpends }
    })
  }, [filteredJobs, timesheetEntries, variations])

  // Margin alerts
  const marginAlerts = useMemo(() => {
    return perJobProjections
      .filter(j => {
        if (dismissedAlerts.has(j.id)) return false
        const threshold = j.margin_alert_threshold ?? 5.0
        return j.projections.projectedMarginPct < threshold
      })
      .sort((a, b) => a.projections.projectedMarginPct - b.projections.projectedMarginPct)
  }, [perJobProjections, dismissedAlerts])

  // Cash flow forecast (next 8 weeks)
  const cashFlowForecast = useMemo(() => {
    const weeks = []
    const now = new Date()
    for (let w = 0; w < 8; w++) {
      let weekIncome = 0
      let weekSpend = 0
      perJobProjections.forEach(job => {
        const contractVal = job.projections.contractValue || 0
        const weeksToComp = job.projections.weeksToCompletion || 0
        const spent = job.projections.totalSpendToDate || 0
        const remaining = Math.max(0, contractVal - spent)
        // Income: monthly certification cycle — assume payment every 4 weeks
        // Divide remaining contract by weeks to completion for weekly income rate
        if (weeksToComp > 0) {
          const weeklyIncomeRate = remaining / weeksToComp
          weekIncome += weeklyIncomeRate
        }
        // Spend: burn rate per week
        weekSpend += job.burnRate || 0
      })
      weeks.push({
        weekNum: w + 1,
        startDate: new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000),
        income: Math.round(weekIncome),
        spend: Math.round(weekSpend),
        net: Math.round(weekIncome - weekSpend),
      })
    }
    // Cumulative position
    let cumulative = 0
    weeks.forEach(w => {
      cumulative += w.net
      w.cumulative = cumulative
    })
    return weeks
  }, [perJobProjections])

  // Retention tracker
  const retentionItems = useMemo(() => {
    const now = new Date()
    const items = []
    jobs.forEach(job => {
      if (!job.practical_completion_date && !job.defects_end_date) return
      const retPct = job.retention_pct || 0
      if (retPct <= 0) return
      const contractVal = job.contract_value || 0
      const totalRetention = Math.round(contractVal * retPct / 100)
      const halfRetention = Math.round(totalRetention / 2)

      if (job.practical_completion_date) {
        const releaseDate = new Date(job.practical_completion_date)
        const daysUntil = Math.round((releaseDate - now) / (1000 * 60 * 60 * 24))
        items.push({
          jobId: job.id, jobName: job.name, type: 'Practical Completion',
          amount: halfRetention, releaseDate, daysUntil,
        })
      }
      if (job.defects_end_date) {
        const releaseDate = new Date(job.defects_end_date)
        const daysUntil = Math.round((releaseDate - now) / (1000 * 60 * 60 * 24))
        items.push({
          jobId: job.id, jobName: job.name, type: 'Defects End',
          amount: halfRetention, releaseDate, daysUntil,
        })
      }
    })
    return items.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [jobs])

  // Dismiss margin alert — bumps threshold below current margin so it won't re-alert
  async function dismissMarginAlert(job) {
    const newThreshold = Math.floor(job.projections.projectedMarginPct - 1)
    setDismissedAlerts(prev => new Set([...prev, job.id]))
    try {
      await supabase.from('subcontractor_jobs')
        .update({ margin_alert_threshold: newThreshold })
        .eq('id', job.id)
    } catch (err) {
      console.error('Failed to update threshold', err)
    }
  }

  const tl = TRAFFIC_LIGHT_COLORS[financials.projections.trafficLight] || TRAFFIC_LIGHT_COLORS.green

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const spendPct = financials.revisedContract > 0
    ? Math.min(100, Math.round((financials.totalSpend / financials.revisedContract) * 100))
    : 0
  const projectedPct = financials.revisedContract > 0
    ? Math.min(150, Math.round((financials.projections.projectedTotalCost / financials.revisedContract) * 100))
    : 0
  const overspend = financials.projections.projectedTotalCost > financials.revisedContract
    ? financials.projections.projectedTotalCost - financials.revisedContract
    : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header + job selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Commercial Dashboard</h1>
          <p className="text-sm text-slate-500">Financial overview and cost forecasting</p>
        </div>
        <select
          value={selectedJobId}
          onChange={e => setSelectedJobId(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400 min-w-[200px]"
        >
          <option value="all">All Active Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl">
          <Briefcase size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No jobs yet</p>
          <button onClick={() => navigate('/app/jobs')} className="mt-3 text-sm text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 mx-auto">
            Create your first job <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <>
          {/* Traffic light + budget exhaustion */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className={`flex-1 flex items-center gap-4 p-5 rounded-xl border ${tl.bg} border-${financials.projections.trafficLight === 'green' ? 'green' : financials.projections.trafficLight === 'amber' ? 'amber' : 'red'}-200`}>
              <div className={`w-14 h-14 rounded-full ${tl.dot} shrink-0 flex items-center justify-center shadow-lg`}>
                {financials.projections.trafficLight === 'green' ? <TrendingUp size={24} className="text-white" /> :
                 financials.projections.trafficLight === 'amber' ? <AlertTriangle size={24} className="text-white" /> :
                 <TrendingDown size={24} className="text-white" />}
              </div>
              <div>
                <p className={`text-lg font-bold ${tl.text}`}>{tl.label}</p>
                <p className="text-sm text-slate-600">
                  Projected margin: {formatMoney(financials.projections.projectedMargin)} ({financials.projections.projectedMarginPct}%)
                </p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white">
              <div className="w-14 h-14 rounded-full bg-slate-100 shrink-0 flex items-center justify-center">
                <Calendar size={24} className="text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Budget runs out on</p>
                <p className="text-lg font-bold text-slate-900">
                  {financials.projections.exhaustionDate
                    ? financials.projections.exhaustionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'N/A'}
                </p>
                {financials.projections.weeksRemaining !== Infinity && (
                  <p className="text-xs text-slate-400">{Math.round(financials.projections.weeksRemaining)} weeks at current burn rate</p>
                )}
              </div>
            </div>
          </div>

          {/* Top metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricCard label="Original Contract" value={formatMoney(financials.originalContract)} />
            <MetricCard label="Variations" value={formatMoney(financials.variationsTotal)} color={financials.variationsTotal >= 0 ? 'green' : 'red'} />
            <MetricCard label="Revised Contract" value={formatMoney(financials.revisedContract)} emphasis />
            <MetricCard label="Labour Cost to Date" value={formatMoney(financials.totalSpend)} />
            <MetricCard label="Projected Total Cost" value={formatMoney(financials.projections.projectedTotalCost)} />
            <MetricCard label="Projected Margin" value={formatMoney(financials.projections.projectedMargin)} sub={`${financials.projections.projectedMarginPct}%`}
              color={financials.projections.projectedMargin >= 0 ? 'green' : 'red'} />
            <MetricCard label="Weekly Burn Rate" value={formatMoney(financials.burnRate)} />
          </div>

          {/* Forecast bar chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Cost Forecast</h3>

            {/* Actual spend bar */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Actual Spend</span>
                  <span className="tabular-nums">{formatMoney(financials.totalSpend)} ({spendPct}%)</span>
                </div>
                <div className="h-6 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, spendPct)}%` }}
                  />
                </div>
              </div>

              {/* Projected total bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Projected Total</span>
                  <span className="tabular-nums">{formatMoney(financials.projections.projectedTotalCost)} ({Math.min(projectedPct, 150)}%)</span>
                </div>
                <div className="h-6 bg-slate-100 rounded-full overflow-hidden relative">
                  {/* Spent portion */}
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full"
                    style={{ width: `${Math.min(100, (spendPct / Math.max(projectedPct, 100)) * 100)}%` }}
                  />
                  {/* Remaining projected */}
                  <div
                    className={`absolute inset-y-0 rounded-r-full ${overspend > 0 ? 'bg-red-400' : 'bg-blue-300'}`}
                    style={{
                      left: `${Math.min(100, (spendPct / Math.max(projectedPct, 100)) * 100)}%`,
                      width: `${Math.min(100 - (spendPct / Math.max(projectedPct, 100)) * 100, 100)}%`,
                    }}
                  />
                  {/* Contract value marker */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-slate-800"
                    style={{ left: `${Math.min(100, (100 / Math.max(projectedPct, 100)) * 100)}%` }}
                    title="Contract value"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>£0</span>
                  <span>Contract: {formatMoney(financials.revisedContract)}</span>
                </div>
              </div>

              {overspend > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={14} />
                  <span>Projected overspend of <strong>{formatMoney(overspend)}</strong> over contract value</span>
                </div>
              )}
            </div>
          </div>

          {/* Weekly spend breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Weekly Spend — Last 4 Weeks</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Week</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Cost</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 w-1/2">
                    {/* Visual bar column */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {financials.weeklySpends.map((cost, i) => {
                  const now = new Date()
                  const wEnd = new Date(now)
                  wEnd.setDate(wEnd.getDate() - i * 7)
                  const wStart = new Date(wEnd)
                  wStart.setDate(wStart.getDate() - 7)
                  const label = `${wStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${wEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  const maxCost = Math.max(...financials.weeklySpends, 1)
                  const barPct = Math.round((cost / maxCost) * 100)
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-700">{i === 0 ? 'This week' : label}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800">{formatMoney(cost)}</td>
                      <td className="px-5 py-3">
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cash Flow Forecast — Next 8 Weeks */}
          {cashFlowForecast.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Cash Flow Forecast — Next 8 Weeks</h3>
              <p className="text-xs text-slate-400 mb-4">Projected income vs spend based on current burn rates and contract remaining</p>

              {/* Bar chart */}
              {(() => {
                const maxVal = Math.max(...cashFlowForecast.map(w => Math.max(w.income, w.spend)), 1)
                return (
                  <div className="flex gap-1.5 items-end" style={{ minHeight: '160px' }}>
                    {cashFlowForecast.map(w => {
                      const incomeH = Math.max(4, Math.round((w.income / maxVal) * 140))
                      const spendH = Math.max(4, Math.round((w.spend / maxVal) * 140))
                      return (
                        <div key={w.weekNum} className="flex-1 flex flex-col items-center gap-1">
                          <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: '140px' }}>
                            <div
                              className="flex-1 max-w-[24px] bg-green-400 rounded-t"
                              style={{ height: `${incomeH}px` }}
                              title={`Income: ${formatMoney(w.income)}`}
                            />
                            <div
                              className="flex-1 max-w-[24px] bg-amber-500 rounded-t"
                              style={{ height: `${spendH}px` }}
                              title={`Spend: ${formatMoney(w.spend)}`}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 text-center leading-tight">
                            Wk {w.weekNum}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Legend */}
              <div className="flex gap-4 mt-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Projected Income</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Projected Spend</span>
              </div>

              {/* Cumulative row */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-medium text-slate-500 mb-1.5">Cumulative Cash Position</p>
                <div className="flex gap-1.5">
                  {cashFlowForecast.map(w => (
                    <div key={w.weekNum} className="flex-1 text-center">
                      <span className={`text-[10px] font-semibold tabular-nums ${w.cumulative >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoney(w.cumulative)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                cashFlowForecast[7]?.cumulative >= 0
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                Projected cash position in 8 weeks: {formatMoney(cashFlowForecast[7]?.cumulative || 0)}
              </div>
            </div>
          )}

          {/* Margin Alerts */}
          {marginAlerts.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">Margin Alerts</h3>
                <span className="ml-auto text-[10px] bg-red-100 text-red-600 font-medium rounded-full px-2 py-0.5">{marginAlerts.length} job{marginAlerts.length !== 1 ? 's' : ''} at risk</span>
              </div>
              <div className="divide-y divide-slate-100">
                {marginAlerts.map(job => {
                  const threshold = job.margin_alert_threshold ?? 5.0
                  const isNegative = job.projections.projectedMarginPct < 0
                  const cardColor = isNegative ? 'bg-red-50 border-l-4 border-l-red-400' : 'bg-amber-50 border-l-4 border-l-amber-400'
                  const trendIcon = job.burnTrend === 'increasing'
                    ? <TrendingUp size={13} className="text-red-500" />
                    : job.burnTrend === 'decreasing'
                    ? <TrendingDown size={13} className="text-green-500" />
                    : <span className="text-slate-400 text-[10px]">—</span>
                  return (
                    <div key={job.id} className={`px-5 py-3 flex items-center gap-3 ${cardColor}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{job.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span>Margin: <strong className={isNegative ? 'text-red-600' : 'text-amber-600'}>{job.projections.projectedMarginPct}%</strong></span>
                          <span>Threshold: {threshold}%</span>
                          <span className="flex items-center gap-1">Burn rate: {trendIcon} {job.burnTrend}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => dismissMarginAlert(job)}
                        className="shrink-0 text-[10px] font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1 hover:bg-slate-50 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Retention Tracker */}
          {retentionItems.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Shield size={15} className="text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-800">Retention Tracker</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Job</th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Release Type</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Amount</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Release Date</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {retentionItems.map((item, i) => {
                    const statusColor = item.daysUntil < 0 ? 'text-red-600 bg-red-50' : item.daysUntil < 30 ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'
                    const daysLabel = item.daysUntil < 0 ? `${Math.abs(item.daysUntil)}d overdue` : `${item.daysUntil}d`
                    return (
                      <tr key={`${item.jobId}-${item.type}-${i}`} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-700 font-medium truncate max-w-[200px]">{item.jobName}</td>
                        <td className="px-5 py-3 text-slate-500">{item.type}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800">{formatMoney(item.amount)}</td>
                        <td className="px-5 py-3 text-right text-slate-500">
                          {item.releaseDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${statusColor}`}>
                            {daysLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick links */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => navigate('/app/jobs')}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Briefcase size={15} /> View All Jobs <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, color, emphasis }) {
  const textColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-slate-900'
  return (
    <div className={`rounded-xl border p-3 ${emphasis ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[10px] font-medium text-slate-500 mb-1 truncate">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${textColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
