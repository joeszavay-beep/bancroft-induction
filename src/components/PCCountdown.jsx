import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'

function getDaysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getUrgencyStyle(days) {
  if (days > 30) return { color: '#0D9488', bg: 'rgba(13,148,136,0.08)', border: 'rgba(13,148,136,0.2)' }
  if (days >= 8) return { color: '#D97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)' }
  return { color: '#DC2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' }
}

function getDayLabel(days) {
  if (days === 0) return 'PC TODAY'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
  return `${days} day${days !== 1 ? 's' : ''}`
}

function buildProjectData(project) {
  const { practical_completion_date, practical_completion_completed_at, name, id } = project

  if (practical_completion_completed_at) {
    return {
      id,
      name,
      status: 'complete',
      label: 'Practically complete',
      sublabel: formatDate(practical_completion_completed_at),
      style: { color: '#16A34A', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.2)' },
    }
  }

  if (!practical_completion_date) {
    return {
      id,
      name,
      status: 'unset',
      label: 'Set PC date',
      sublabel: 'No date configured',
      style: { color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border-color)' },
    }
  }

  const days = getDaysUntil(practical_completion_date)
  const urgency = getUrgencyStyle(days)

  return {
    id,
    name,
    status: days === 0 ? 'today' : days < 0 ? 'overdue' : 'upcoming',
    days,
    label: getDayLabel(days),
    sublabel: `PC ${formatDate(practical_completion_date)}`,
    style: urgency,
  }
}

function HeroCard({ data }) {
  const isNumeric = data.status === 'upcoming' || data.status === 'overdue' || data.status === 'today'

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: data.style.bg }}
        >
          <CalendarDays size={16} style={{ color: data.style.color }} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Practical Completion
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.name}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-1 text-center">
        {isNumeric && data.status !== 'today' ? (
          <>
            <p className="text-3xl font-bold" style={{ color: data.style.color }}>
              {data.status === 'overdue' ? `-${Math.abs(data.days)}` : data.days}
            </p>
            <p className="text-xs mt-0.5" style={{ color: data.style.color }}>
              {data.status === 'overdue' ? `day${Math.abs(data.days) !== 1 ? 's' : ''} overdue` : `day${data.days !== 1 ? 's' : ''} remaining`}
            </p>
          </>
        ) : data.status === 'today' ? (
          <p className="text-2xl font-bold" style={{ color: data.style.color }}>
            PC TODAY
          </p>
        ) : data.status === 'complete' ? (
          <p className="text-2xl font-bold" style={{ color: data.style.color }}>
            {data.label}
          </p>
        ) : (
          <p className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>
            {data.label}
          </p>
        )}

        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {data.sublabel}
        </p>
      </div>
    </div>
  )
}

function CompactCard({ data }) {
  const isNumeric = data.status === 'upcoming' || data.status === 'overdue' || data.status === 'today'

  return (
    <div
      className="rounded-xl border overflow-hidden shrink-0 min-w-[140px] max-w-[180px]"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      <div className="px-3 py-3">
        {/* Project name */}
        <p
          className="text-[10px] font-bold uppercase tracking-wider truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          {data.name}
        </p>

        {/* Big number / label */}
        <div className="mt-2">
          {isNumeric && data.status !== 'today' ? (
            <p className="text-2xl font-bold" style={{ color: data.style.color }}>
              {data.status === 'overdue' ? `-${Math.abs(data.days)}` : data.days}
            </p>
          ) : data.status === 'today' ? (
            <p className="text-lg font-bold" style={{ color: data.style.color }}>
              PC TODAY
            </p>
          ) : data.status === 'complete' ? (
            <p className="text-sm font-bold" style={{ color: data.style.color }}>
              Complete
            </p>
          ) : (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              {data.label}
            </p>
          )}
        </div>

        {/* Sublabel */}
        <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
          {isNumeric
            ? data.label
            : data.sublabel}
        </p>

        {/* PC date */}
        {data.sublabel && isNumeric && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {data.sublabel}
          </p>
        )}
      </div>

      {/* Urgency bar */}
      <div className="h-1" style={{ backgroundColor: data.style.color }} />
    </div>
  )
}

export default function PCCountdown({ projects }) {
  const projectData = useMemo(() => {
    if (!projects || projects.length === 0) return []
    return projects.map(buildProjectData)
  }, [projects])

  if (projectData.length === 0) return null

  // Single project: hero card
  if (projectData.length === 1) {
    return <HeroCard data={projectData[0]} />
  }

  // Multiple projects: horizontal scrollable row
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#0D9488]/10 flex items-center justify-center">
          <CalendarDays size={16} className="text-[#0D9488]" />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          PC Countdown
        </p>
      </div>

      {/* Scrollable row */}
      <div className="px-4 pb-4 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        {projectData.map((data) => (
          <CompactCard key={data.id} data={data} />
        ))}
      </div>
    </div>
  )
}
