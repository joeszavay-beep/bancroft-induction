import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Award,
} from 'lucide-react'

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24))
}

export default function ContractorPerformance() {
  const { user } = useCompany()
  const company_id = user?.company_id
  const [snags, setSnags] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company_id) return
    async function fetchData() {
      setLoading(true)
      const [snagsRes, opsRes] = await Promise.all([
        supabase.from('snags').select('*').eq('company_id', company_id),
        supabase.from('operatives').select('*').eq('company_id', company_id),
      ])
      setSnags(snagsRes.data || [])
      setOperatives(opsRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [company_id])

  const today = new Date().toISOString().split('T')[0]

  const completedSnags = useMemo(
    () => snags.filter((s) => s.status === 'completed'),
    [snags]
  )

  const overdue = useMemo(
    () => snags.filter((s) => s.status === 'open' && s.due_date && s.due_date < today),
    [snags, today]
  )

  const avgResolutionDays = useMemo(() => {
    if (completedSnags.length === 0) return 0
    const total = completedSnags.reduce(
      (sum, s) => sum + daysBetween(s.created_at, s.updated_at),
      0
    )
    return (total / completedSnags.length).toFixed(1)
  }, [completedSnags])

  const onTimePercent = useMemo(() => {
    const withDue = completedSnags.filter((s) => s.due_date)
    if (withDue.length === 0) return 0
    const onTime = withDue.filter(
      (s) => s.updated_at.split('T')[0] <= s.due_date
    )
    return Math.round((onTime.length / withDue.length) * 100)
  }, [completedSnags])

  // --- By Trade ---
  const tradeStats = useMemo(() => {
    const map = {}
    snags.forEach((s) => {
      const trade = s.trade || 'Unassigned'
      if (!map[trade]) map[trade] = { trade, total: 0, completed: [], withDue: [] }
      map[trade].total++
      if (s.status === 'completed') {
        map[trade].completed.push(s)
        if (s.due_date) map[trade].withDue.push(s)
      }
    })
    return Object.values(map)
      .map((t) => {
        const avgDays =
          t.completed.length > 0
            ? (
                t.completed.reduce(
                  (sum, s) => sum + daysBetween(s.created_at, s.updated_at),
                  0
                ) / t.completed.length
              ).toFixed(1)
            : '-'
        const onTime =
          t.withDue.length > 0
            ? Math.round(
                (t.withDue.filter((s) => s.updated_at.split('T')[0] <= s.due_date)
                  .length /
                  t.withDue.length) *
                  100
              )
            : '-'
        return { ...t, avgDays, onTime, completedCount: t.completed.length }
      })
      .sort((a, b) => b.total - a.total)
  }, [snags])

  const maxTradeTotal = useMemo(
    () => Math.max(...tradeStats.map((t) => t.total), 1),
    [tradeStats]
  )

  // --- By Operative ---
  const operativeStats = useMemo(() => {
    const map = {}
    snags.forEach((s) => {
      const key = s.assigned_to
      if (!key) return
      if (!map[key]) map[key] = { name: key, total: 0, completed: [], withDue: [] }
      map[key].total++
      if (s.status === 'completed') {
        map[key].completed.push(s)
        if (s.due_date) map[key].withDue.push(s)
      }
    })

    // Try to match operative name from operatives table
    const opsById = {}
    operatives.forEach((o) => {
      opsById[o.id] = o.name || `${o.first_name || ''} ${o.last_name || ''}`.trim()
    })

    return Object.values(map)
      .map((op) => {
        const displayName = opsById[op.name] || op.name
        const avgDays =
          op.completed.length > 0
            ? parseFloat(
                (
                  op.completed.reduce(
                    (sum, s) => sum + daysBetween(s.created_at, s.updated_at),
                    0
                  ) / op.completed.length
                ).toFixed(1)
              )
            : Infinity
        const onTime =
          op.withDue.length > 0
            ? Math.round(
                (op.withDue.filter((s) => s.updated_at.split('T')[0] <= s.due_date)
                  .length /
                  op.withDue.length) *
                  100
              )
            : 0
        return {
          name: displayName,
          total: op.total,
          completedCount: op.completed.length,
          avgDays: avgDays === Infinity ? '-' : avgDays,
          avgDaysRaw: avgDays,
          onTime,
        }
      })
      .sort((a, b) => a.avgDaysRaw - b.avgDaysRaw)
  }, [snags, operatives])

  function getBadgeClasses(onTime) {
    if (onTime >= 80) return 'bg-green-100 text-green-800'
    if (onTime >= 50) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: 'var(--bg-main)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 border-4 rounded-full animate-spin"
            style={{
              borderColor: 'var(--border-color)',
              borderTopColor: 'var(--primary-color)',
            }}
          />
          <p style={{ color: 'var(--text-muted)' }} className="text-sm">
            Loading performance data...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3
            className="w-7 h-7"
            style={{ color: 'var(--primary-color)' }}
          />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Contractor Performance
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Analytics based on snag data across your projects
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Total Snags"
          value={snags.length}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Avg Resolution"
          value={`${avgResolutionDays}d`}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="On-Time %"
          value={`${onTimePercent}%`}
          valueColor={
            onTimePercent >= 80
              ? '#16a34a'
              : onTimePercent >= 50
              ? '#d97706'
              : '#dc2626'
          }
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Overdue Now"
          value={overdue.length}
          valueColor={overdue.length > 0 ? '#dc2626' : undefined}
        />
      </div>

      {/* By Trade */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--primary-color)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Performance by Trade
          </h2>
        </div>
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Trade
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Total
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Avg Days
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    On-Time %
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium hidden sm:table-cell"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Volume
                  </th>
                </tr>
              </thead>
              <tbody>
                {tradeStats.map((t) => (
                  <tr
                    key={t.trade}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <td className="px-4 py-3 font-medium">{t.trade}</td>
                    <td className="px-4 py-3">{t.total}</td>
                    <td className="px-4 py-3">{t.avgDays}</td>
                    <td className="px-4 py-3">
                      {t.onTime === '-' ? (
                        '-'
                      ) : (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeClasses(
                            t.onTime
                          )}`}
                        >
                          {t.onTime}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.round((t.total / maxTradeTotal) * 100)}%`,
                            minWidth: '4px',
                            backgroundColor: 'var(--primary-color)',
                            opacity: 0.7,
                          }}
                        />
                        <span
                          className="text-xs whitespace-nowrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {t.total}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {tradeStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      No snag data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* By Operative — League Table */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5" style={{ color: 'var(--primary-color)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Operative League Table
          </h2>
        </div>
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <th
                    className="text-left px-4 py-3 font-medium w-8"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    #
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Operative
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Assigned
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Completed
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Avg Days
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    On-Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {operativeStats.map((op, idx) => (
                  <tr
                    key={op.name}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <td className="px-4 py-3">
                      {idx < 3 ? (
                        <Award
                          className="w-4 h-4"
                          style={{
                            color:
                              idx === 0
                                ? '#eab308'
                                : idx === 1
                                ? '#9ca3af'
                                : '#b45309',
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{op.name}</td>
                    <td className="px-4 py-3">{op.total}</td>
                    <td className="px-4 py-3">{op.completedCount}</td>
                    <td className="px-4 py-3">{op.avgDays}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeClasses(
                          op.onTime
                        )}`}
                      >
                        {op.onTime}%
                      </span>
                    </td>
                  </tr>
                ))}
                {operativeStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      No operative data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Overdue Right Now */}
      {overdue.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Overdue Right Now ({overdue.length})
            </h2>
          </div>
          <div
            className="rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {overdue.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <p className="font-medium text-sm truncate">{s.title || s.description || 'Untitled snag'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Due: {s.due_date}
                    </span>
                    <span className="text-xs font-medium text-red-600">
                      {daysBetween(s.due_date, today)}d overdue
                    </span>
                  </div>
                  {s.assigned_to && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Assigned: {s.assigned_to}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, valueColor }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: 'var(--primary-color)' }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <p
        className="text-2xl font-bold"
        style={{ color: valueColor || 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}
