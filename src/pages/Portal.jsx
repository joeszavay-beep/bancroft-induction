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
      <div className="min-h-dvh flex items-center justify-center bg-navy-950">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  // Project list view
  if (!projectId) {
    return (
      <div className="min-h-dvh bg-navy-950 flex flex-col">
        <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => navigate('/')} className="p-1 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Sign-Off Portal</h1>
            <p className="text-xs text-gray-400">Bancroft Ltd</p>
          </div>
        </header>
        <div className="p-4 space-y-2">
          {documents.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/portal/${p.id}`)}
              className="w-full flex items-center gap-3 bg-navy-800 border border-navy-600 rounded-xl p-4 hover:border-accent/50 transition-colors text-left"
            >
              <FolderOpen size={20} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{p.name}</p>
                {p.location && <p className="text-xs text-gray-400 truncate">{p.location}</p>}
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
    <div className="min-h-dvh bg-navy-950 flex flex-col">
      <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/portal')} className="p-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{project?.name}</h1>
          <p className="text-xs text-gray-400">{project?.location || 'Sign-Off Record'}</p>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{documents.length}</p>
            <p className="text-xs text-gray-400">Documents</p>
          </div>
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{operatives.length}</p>
            <p className="text-xs text-gray-400">Operatives</p>
          </div>
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-success">{signatures.length}</p>
            <p className="text-xs text-gray-400">Signatures</p>
          </div>
        </div>

        {/* Per operative breakdown */}
        {operatives.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <User size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No operatives assigned</p>
          </div>
        ) : (
          <div className="space-y-4">
            {operatives.map(op => {
              const opSigs = signatures.filter(s => s.operative_id === op.id)
              const allDone = documents.length > 0 && opSigs.length >= documents.length
              return (
                <div key={op.id} className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${allDone ? 'bg-success/10' : 'bg-accent/10'}`}>
                      {allDone ? <CheckCircle2 size={20} className="text-success" /> : <User size={20} className="text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{op.name}</p>
                      <p className="text-xs text-gray-400">{op.role || 'Operative'} · {opSigs.length}/{documents.length} signed</p>
                    </div>
                    {allDone && <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Complete</span>}
                  </div>

                  {opSigs.length > 0 && (
                    <div className="border-t border-navy-600 p-3 space-y-2">
                      {opSigs.map(sig => (
                        <div key={sig.id} className="flex items-center gap-3 bg-navy-700 rounded-lg p-2.5">
                          {sig.signature_url ? (
                            <img src={sig.signature_url} alt="Signature" className="w-16 h-10 object-contain bg-white rounded" />
                          ) : (
                            <div className="w-16 h-10 bg-navy-600 rounded flex items-center justify-center">
                              <FileText size={14} className="text-gray-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{sig.document_title}</p>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Calendar size={10} />
                              {new Date(sig.signed_at).toLocaleDateString()} {new Date(sig.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
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
