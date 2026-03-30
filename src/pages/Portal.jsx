import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, FileText, CheckCircle2, User, Calendar, FolderOpen } from 'lucide-react'

export default function Portal() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [documents, setDocuments] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) {
      loadProjects()
    } else {
      loadProjectData()
    }
  }, [projectId])

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setDocuments(data || []) // reuse state for project list
    setLoading(false)
  }

  async function loadProjectData() {
    const [proj, sigs, docs, ops] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('signatures').select('*').eq('project_id', projectId).order('signed_at', { ascending: false }),
      supabase.from('documents').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('operatives').select('*').eq('project_id', projectId).order('name'),
    ])
    setProject(proj.data)
    setSignatures(sigs.data || [])
    setDocuments(docs.data || [])
    setOperatives(ops.data || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Project list view
  if (!projectId) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
        <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => navigate('/')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div>
            <img src="/bancroft-logo.png" alt="Bancroft" className="h-7" />
            <span className="text-xs text-slate-500">Sign-Off Portal</span>
          </div>
        </header>
        <div className="p-4 space-y-2">
          {documents.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/portal/${p.id}`)}
              className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400/50 transition-colors text-left"
            >
              <FolderOpen size={20} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-medium truncate">{p.name}</p>
                {p.location && <p className="text-xs text-slate-500 truncate">{p.location}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Project detail with sign-off record
  const signedByOperative = {}
  operatives.forEach(op => {
    signedByOperative[op.id] = {
      operative: op,
      signedDocs: signatures.filter(s => s.operative_id === op.id),
    }
  })

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/portal')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{project?.name}</h1>
          <p className="text-xs text-slate-500">{project?.location || 'Sign-Off Record'}</p>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-900">{documents.length}</p>
            <p className="text-xs text-slate-500">Documents</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-900">{operatives.length}</p>
            <p className="text-xs text-slate-500">Operatives</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-success">{signatures.length}</p>
            <p className="text-xs text-slate-500">Signatures</p>
          </div>
        </div>

        {/* Per operative breakdown */}
        {operatives.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <User size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No operatives assigned</p>
          </div>
        ) : (
          <div className="space-y-4">
            {operatives.map(op => {
              const opSigs = signatures.filter(s => s.operative_id === op.id)
              const allDone = documents.length > 0 && opSigs.length >= documents.length
              return (
                <div key={op.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    {op.photo_url ? (
                      <img src={op.photo_url} alt={op.name} className={`w-10 h-10 rounded-full object-cover shrink-0 ${allDone ? 'ring-2 ring-success' : ''}`} />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${allDone ? 'bg-success/10' : 'bg-blue-50'}`}>
                        {allDone ? <CheckCircle2 size={20} className="text-success" /> : <User size={20} className="text-blue-500" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold truncate">{op.name}</p>
                      <p className="text-xs text-slate-500">{op.role || 'Operative'} · {opSigs.length}/{documents.length} signed</p>
                    </div>
                    {allDone && <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Complete</span>}
                  </div>

                  {opSigs.length > 0 && (
                    <div className="border-t border-slate-200 p-3 space-y-2">
                      {opSigs.map(sig => (
                        <div key={sig.id} className={`flex items-center gap-3 rounded-lg p-2.5 ${sig.invalidated ? 'bg-danger/10 border border-danger/20' : 'bg-slate-50'}`}>
                          {sig.signature_url ? (
                            <img src={sig.signature_url} alt="Signature" className={`w-16 h-10 object-contain bg-white rounded ${sig.invalidated ? 'opacity-40' : ''}`} />
                          ) : (
                            <div className="w-16 h-10 bg-slate-100 rounded flex items-center justify-center">
                              <FileText size={14} className="text-slate-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${sig.invalidated ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{sig.document_title}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Calendar size={10} />
                                {new Date(sig.signed_at).toLocaleDateString()} {new Date(sig.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {sig.ip_address && <span className="text-slate-400">IP: {sig.ip_address}</span>}
                            </div>
                            {sig.invalidated && <p className="text-[11px] text-danger mt-0.5">Invalidated — document updated, re-sign required</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
