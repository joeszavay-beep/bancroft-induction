import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '../lib/ProjectContext'
import { authFetch } from '../lib/authFetch'
import { TEMPLATES } from '../lib/templates'
import { Package, FileQuestion, FileDiff, ClipboardList, FolderOpen, Lock } from 'lucide-react'

const ICON_MAP = { Package, FileQuestion, FileDiff, ClipboardList }

export default function TemplatesHub() {
  const navigate = useNavigate()
  const { projectId, projectName } = useProject()
  const [metrics, setMetrics] = useState({})

  useEffect(() => {
    if (!projectId) return
    authFetch(`/api/procurement?action=summary&projectId=${projectId}`)
      .then(r => r.json())
      .then(data => setMetrics(prev => ({ ...prev, procurement: data })))
      .catch(() => {})
  }, [projectId])

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">Select a project</p>
        <p className="text-xs mt-1">Choose a project from the sidebar to view templates</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Templates</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{projectName} — project tools and trackers</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(t => {
          const Icon = ICON_MAP[t.icon] || Package
          const metric = metrics[t.key]
          return (
            <button
              key={t.key}
              onClick={() => t.active && t.path && navigate(t.path)}
              disabled={!t.active}
              className={`text-left rounded-xl border p-5 transition-all ${
                t.active ? 'hover:shadow-md hover:scale-[1.01] cursor-pointer' : 'opacity-50 cursor-default'
              }`}
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}15` }}>
                  <Icon size={20} style={{ color: t.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t.label}</p>
                    {!t.active && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                        <Lock size={9} /> Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                  {t.active && metric && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>{metric.total} items</span>
                      {metric.red > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{metric.red} at risk</span>}
                      {metric.amber > 0 && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{metric.amber} soon</span>}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
