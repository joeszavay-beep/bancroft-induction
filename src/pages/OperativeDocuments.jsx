import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, FileText, CheckCircle2, Clock, Lock, AlertTriangle } from 'lucide-react'

export default function OperativeDocuments() {
  const { operativeId } = useParams()
  const navigate = useNavigate()
  const [operative, setOperative] = useState(null)
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [operativeId])

  async function loadData() {
    setLoading(true)
    const { data: op } = await supabase
      .from('operatives')
      .select('*, projects(id, name)')
      .eq('id', operativeId)
      .single()

    if (!op) {
      navigate('/operative')
      return
    }
    setOperative(op)

    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('project_id', op.project_id)
      .order('created_at')

    const { data: sigs } = await supabase
      .from('signatures')
      .select('*')
      .eq('operative_id', operativeId)

    setDocuments(docs || [])
    setSignatures(sigs || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy-950">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  // Only count valid (non-invalidated) signatures
  const validSigs = signatures.filter(s => !s.invalidated)
  const signedDocIds = new Set(validSigs.map(s => s.document_id))
  const invalidatedDocIds = new Set(signatures.filter(s => s.invalidated).map(s => s.document_id))
  const allSigned = documents.length > 0 && documents.every(d => signedDocIds.has(d.id))
  const totalDocs = documents.length
  const signedCount = documents.filter(d => signedDocIds.has(d.id)).length

  return (
    <div className="min-h-dvh bg-navy-950 flex flex-col">
      <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/operative')} className="p-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{operative?.name}</h1>
          <p className="text-xs text-gray-400 truncate">{operative?.projects?.name}</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Progress */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-400">Progress</p>
            <p className="text-sm font-semibold text-white">{signedCount}/{totalDocs}</p>
          </div>
          <div className="w-full h-2 bg-navy-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: totalDocs > 0 ? `${(signedCount / totalDocs) * 100}%` : '0%' }}
            />
          </div>
          {allSigned && totalDocs > 0 && (
            <div className="mt-3 flex items-center gap-2 text-success">
              <CheckCircle2 size={16} />
              <span className="text-sm font-medium">All documents signed - induction complete!</span>
            </div>
          )}
        </div>

        {/* Document list */}
        {documents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p>No documents assigned yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc, idx) => {
              const isSigned = signedDocIds.has(doc.id)
              const needsResign = invalidatedDocIds.has(doc.id) && !isSigned
              // Must sign in order: lock if any previous doc is unsigned
              const isLocked = !isSigned && !needsResign && documents.slice(0, idx).some(d => !signedDocIds.has(d.id))

              return (
                <button
                  key={doc.id}
                  disabled={(isSigned && !needsResign) || isLocked}
                  onClick={() => navigate(`/operative/${operativeId}/sign/${doc.id}`)}
                  className={`w-full flex items-center gap-3 bg-navy-800 border rounded-xl p-4 text-left transition-all ${
                    needsResign
                      ? 'border-warning/50 hover:border-warning active:scale-[0.98]'
                      : isSigned
                        ? 'border-success/30 opacity-70'
                        : isLocked
                          ? 'border-navy-600 opacity-40 cursor-not-allowed'
                          : 'border-navy-600 hover:border-accent/50 active:scale-[0.98]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    needsResign ? 'bg-warning/10' : isSigned ? 'bg-success/10' : isLocked ? 'bg-navy-700' : 'bg-accent/10'
                  }`}>
                    {needsResign ? <AlertTriangle size={20} className="text-warning" /> :
                     isSigned ? <CheckCircle2 size={20} className="text-success" /> :
                     isLocked ? <Lock size={20} className="text-gray-600" /> :
                     <FileText size={20} className="text-accent" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${needsResign ? 'text-warning' : isSigned ? 'text-gray-400' : 'text-white'}`}>{doc.title}</p>
                    <p className="text-xs text-gray-500">
                      {needsResign ? 'Document updated — re-sign required' : isSigned ? 'Signed' : isLocked ? 'Complete previous documents first' : 'Tap to review & sign'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
