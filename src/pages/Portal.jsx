import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, FileText, CheckCircle2, User, Calendar, FolderOpen, X, Shield, Globe, Clock } from 'lucide-react'

export default function Portal() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [documents, setDocuments] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSig, setSelectedSig] = useState(null)

  useEffect(() => {
    if (!projectId) {
      loadProjects()
    } else {
      loadProjectData()
    }
  }, [projectId])

  async function loadProjects() {
    // Don't list all projects publicly — redirect to login
    setLoading(false)
  }

  async function loadProjectData() {
    const [proj, sigs, docs, ops] = await Promise.all([
      supabase.from('projects').select('*, companies(name, logo_url)').eq('id', projectId).single(),
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
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Sign-Off Portal</h2>
          <p className="text-sm text-slate-500 mb-4">Access a project's sign-off record via the link provided by your manager.</p>
          <button onClick={() => navigate('/worker-login')} className="px-6 py-2.5 bg-[#1B6FC8] text-white text-sm font-semibold rounded-lg">
            Worker Login
          </button>
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
                        <button key={sig.id} onClick={() => setSelectedSig({ ...sig, operative: op })} className={`w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:ring-1 hover:ring-blue-300 ${sig.invalidated ? 'bg-danger/10 border border-danger/20' : 'bg-slate-50 hover:bg-blue-50/50'}`}>
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Signature detail modal */}
      {selectedSig && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => setSelectedSig(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">Signature Record</h3>
                <p className="text-xs text-slate-500">Digital signature verification</p>
              </div>
              <button onClick={() => setSelectedSig(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Signature image */}
            <div className="px-5 py-5 bg-slate-50 border-b border-slate-200">
              {selectedSig.signature_url ? (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center">
                  <img src={selectedSig.signature_url} alt="Signature" className="max-w-full h-20 object-contain" />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center">
                  <p className="text-slate-400 text-sm">No signature image</p>
                </div>
              )}
              {selectedSig.invalidated && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
                  This signature has been invalidated — the document was updated after signing.
                </div>
              )}
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><User size={10} /> Signed By</p>
                  <p className="text-sm text-slate-900 font-medium">{selectedSig.operative_name}</p>
                  {selectedSig.operative?.role && <p className="text-xs text-slate-500">{selectedSig.operative.role}</p>}
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><FileText size={10} /> Document</p>
                  <p className="text-sm text-slate-900 font-medium leading-tight">{selectedSig.document_title}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><Clock size={10} /> Date & Time</p>
                  <p className="text-sm text-slate-900 font-medium">{new Date(selectedSig.signed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <p className="text-xs text-slate-500">{new Date(selectedSig.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><Globe size={10} /> IP Address</p>
                  <p className="text-sm text-slate-900 font-medium font-mono">{selectedSig.ip_address || 'Not recorded'}</p>
                </div>
              </div>

              {selectedSig.typed_name && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><Shield size={10} /> Typed Confirmation</p>
                  <p className="text-sm text-slate-900 font-medium">{selectedSig.typed_name}</p>
                </div>
              )}

              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-[10px] text-blue-600 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1"><Shield size={10} /> Verification</p>
                <p className="text-xs text-blue-800">Record ID: <span className="font-mono">{selectedSig.id?.slice(0, 8)}</span></p>
                <p className="text-xs text-blue-800">This signature is stored securely and cannot be modified after submission.</p>
              </div>
            </div>

            {/* Close button */}
            <div className="px-5 py-4 border-t border-slate-200">
              <button onClick={() => setSelectedSig(null)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
