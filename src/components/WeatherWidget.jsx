import { useMemo } from 'react'
import { CloudSun, MapPin, AlertTriangle } from 'lucide-react'
import { useWeather } from '../hooks/useWeather'

const WARNING_COLORS = {
  blue: { bg: 'rgba(59,130,246,0.1)', text: '#3B82F6', border: 'rgba(59,130,246,0.2)' },
  amber: { bg: 'rgba(217,119,6,0.1)', text: '#D97706', border: 'rgba(217,119,6,0.2)' },
  sky: { bg: 'rgba(14,165,233,0.1)', text: '#0EA5E9', border: 'rgba(14,165,233,0.2)' },
  red: { bg: 'rgba(220,38,38,0.1)', text: '#DC2626', border: 'rgba(220,38,38,0.2)' },
}

function WarningPill({ warning }) {
  const colors = WARNING_COLORS[warning.color] || WARNING_COLORS.amber
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      <AlertTriangle size={10} />
      {warning.label}
    </span>
  )
}

function LoadingSkeleton() {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse mx-auto" />
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-14 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ErrorMessage({ error, fetchedAt }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-200/60 flex items-center justify-center">
          <CloudSun size={16} style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Weather</p>
      </div>
      <div className="px-4 pb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Weather unavailable
        </p>
        {fetchedAt && (
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Last updated {new Date(fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}

function NoLocationMessage({ projectName }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <MapPin size={14} style={{ color: 'var(--text-muted)' }} />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Set project location for weather{projectName ? ` (${projectName})` : ''}
      </p>
    </div>
  )
}

function FourDayForecast({ data, error, loading, projectName, fetchedAt }) {
  if (loading) return <LoadingSkeleton />
  if (error && !data) return <ErrorMessage error={error} fetchedAt={fetchedAt} />

  const days = data?.days || []

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
            <CloudSun size={16} className="text-[#3B82F6]" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Weather</p>
            {projectName && (
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{projectName}</p>
            )}
          </div>
        </div>
        {data?.current && (
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {data.current.weather.icon} {data.current.temp}&deg;C
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {data.current.weather.label}
            </p>
          </div>
        )}
      </div>

      {/* 4-day grid */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-4 gap-3">
          {days.map((day, i) => (
            <div key={day.date} className="text-center">
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: i === 0 ? 'var(--primary-color)' : 'var(--text-muted)' }}
              >
                {day.dayLabel}
              </p>
              <p className="text-2xl mt-1">{day.weather.icon}</p>
              <p className="text-xs font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                {day.tempHigh}&deg; <span style={{ color: 'var(--text-muted)' }}>{day.tempLow}&deg;</span>
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {day.precipProbability}% rain
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {day.windMph} mph
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Warning pills */}
      {days.some((d) => d.warnings && d.warnings.length > 0) && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {days.flatMap((day, dayIdx) =>
              (day.warnings || []).map((w, wIdx) => (
                <WarningPill key={`${dayIdx}-${wIdx}`} warning={w} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Stale data indicator */}
      {error && data && (
        <div className="px-4 pb-3">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Weather unavailable — showing cached data
            {data.fetchedAt && (
              <> (last updated {new Date(data.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function CompactProjectRow({ project }) {
  const lat = project.site_latitude
  const lng = project.site_longitude
  const { data, loading, error } = useWeather(lat, lng)

  if (!lat || !lng) {
    return (
      <div className="flex items-center gap-3 px-4 py-2">
        <p className="text-xs font-medium shrink-0 w-28 truncate" style={{ color: 'var(--text-primary)' }}>
          {project.name}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Set project location for weather
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-2">
        <p className="text-xs font-medium shrink-0 w-28 truncate" style={{ color: 'var(--text-primary)' }}>
          {project.name}
        </p>
        <div className="flex gap-2 flex-1">
          <div className="h-4 w-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-3 px-4 py-2">
        <p className="text-xs font-medium shrink-0 w-28 truncate" style={{ color: 'var(--text-primary)' }}>
          {project.name}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Weather unavailable</p>
      </div>
    )
  }

  const today = data?.days?.[0]
  if (!today) return null

  const hasWarnings = today.warnings && today.warnings.length > 0

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {/* Project name */}
      <p className="text-xs font-medium shrink-0 w-28 truncate" style={{ color: 'var(--text-primary)' }}>
        {project.name}
      </p>

      {/* Weather icon + temp */}
      <span className="text-sm">{today.weather.icon}</span>
      <p className="text-xs font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
        {today.tempHigh}&deg;<span style={{ color: 'var(--text-muted)' }}>/{today.tempLow}&deg;</span>
      </p>

      {/* Rain + wind */}
      <p className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
        {today.precipProbability}% rain
      </p>
      <p className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
        {today.windMph} mph
      </p>

      {/* Warnings */}
      {hasWarnings && (
        <div className="flex gap-1 ml-auto">
          {today.warnings.map((w, i) => (
            <WarningPill key={i} warning={w} />
          ))}
        </div>
      )}
    </div>
  )
}

function SingleProjectWeather({ project }) {
  const lat = project?.site_latitude
  const lng = project?.site_longitude
  const { data, loading, error } = useWeather(lat, lng)

  if (!project) return null

  if (!lat || !lng) {
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
            <CloudSun size={16} className="text-[#3B82F6]" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Weather</p>
        </div>
        <div className="px-4 pb-4">
          <NoLocationMessage projectName={project.name} />
        </div>
      </div>
    )
  }

  return (
    <FourDayForecast
      data={data}
      error={error}
      loading={loading}
      projectName={project.name}
      fetchedAt={data?.fetchedAt}
    />
  )
}

function AllProjectsWeather({ projects }) {
  const validProjects = projects || []

  if (validProjects.length === 0) return null

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
          <CloudSun size={16} className="text-[#3B82F6]" />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Site Weather
        </p>
      </div>

      {/* Project rows */}
      <div className="pb-2 divide-y" style={{ borderColor: 'var(--border-color)' }}>
        {validProjects.map((project) => (
          <CompactProjectRow key={project.id} project={project} />
        ))}
      </div>
    </div>
  )
}

export default function WeatherWidget({ projects, projectId }) {
  const selectedProject = useMemo(() => {
    if (!projectId || !projects) return null
    return projects.find((p) => p.id === projectId) || null
  }, [projects, projectId])

  // Single project view (projectId is set)
  if (projectId) {
    return <SingleProjectWeather project={selectedProject} />
  }

  // All projects view (no projectId — dashboard overview)
  return <AllProjectsWeather projects={projects} />
}
