import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { CheckCircle2, RotateCcw, FileText, XCircle } from 'lucide-react'

export default function ToolboxSign() {
  const { talkId } = useParams()
  const sigRef = useRef(null)
  const [talk, setTalk] = useState(null)
  const [project, setProject] = useState(null)
  const [operatives, setOperatives] = useState([])
  const [existingSigs, setExistingSigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedOp, setSelectedOp] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: t } = await supabase.from('toolbox_talks').select('*').eq('id', talkId).single()
    if (!t) { setLoading(false); return }
    setTalk(t)

    const [p, o, s] = await Promise.all([
      supabase.from('projects').select('*').eq('id', t.project_id).single(),
      supabase.from('operatives').select('*').eq('project_id', t.project_id).order('name'),
      supabase.from('toolbox_signatures').select('operative_id').eq('talk_id', talkId),
    ])
    setProject(p.data)
    setOperatives(o.data || [])
    setExistingSigs(s.data || [])
    setLoading(false)
  }

  function clearSignature() {
    sigRef.current?.clear()
    setHasSigned(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!hasSigned || !selectedOp) return
    setSaving(true)

    const op = operatives.find(o => o.id === selectedOp)
    const signatureDataUrl = sigRef.current.toDataURL('image/png')

    // Upload signature
    const blob = await (await fetch(signatureDataUrl)).blob()
    const filePath = `toolbox/${talkId}/${selectedOp}_${Date.now()}.png`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, blob, { contentType: 'image/png' })

    let sigUrl = null
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
      sigUrl = urlData.publicUrl
    }

    const { error } = await supabase.from('toolbox_signatures').insert({
      talk_id: talkId,
      operative_id: selectedOp,
      operative_name: op?.name || 'Unknown',
      signature_url: sigUrl,
    })

    setSaving(false)
    if (error) {
      toast.error('Failed to submit signature')
      return
    }
    setShowSuccess(true)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!talk) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <XCircle size={48} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Not Found</h2>
        <p className="text-slate-400 text-center">This toolbox talk doesn't exist.</p>
      </div>
    )
  }

  if (!talk.is_open) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <XCircle size={48} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Talk Closed</h2>
        <p className="text-slate-400 text-center">This toolbox talk has been closed and is no longer accepting signatures.</p>
      </div>
    )
  }

  if (showSuccess) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Signed!</h2>
        <p className="text-slate-500 text-center">Your attendance for this toolbox talk has been recorded.</p>
      </div>
    )
  }

  const signedOpIds = new Set(existingSigs.map(s => s.operative_id))
  const availableOps = operatives.filter(o => !signedOpIds.has(o.id))

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/bancroft-logo.png" alt="Bancroft" className="h-7" />
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Toolbox Talk</p>
            <p className="text-sm font-semibold text-slate-900 truncate">{project?.name}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Talk info */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-blue-500" />
            <h2 className="text-lg font-bold text-slate-900">{talk.title}</h2>
          </div>
          {talk.description && (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{talk.description}</p>
          )}
          <p className="text-xs text-slate-400 mt-2">{new Date(talk.created_at).toLocaleDateString()}</p>
        </div>

        {availableOps.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
            <CheckCircle2 size={32} className="text-success mx-auto mb-2" />
            <p className="text-slate-600 font-medium">All operatives have signed</p>
          </div>
        ) : (
          <>
            {/* Select name */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <label className="text-sm font-semibold text-slate-600 block mb-2">Select Your Name</label>
              <select
                value={selectedOp}
                onChange={e => setSelectedOp(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
              >
                <option value="">Choose your name...</option>
                {availableOps.map(op => (
                  <option key={op.id} value={op.id}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Signature */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-600">Your Signature</p>
                <button onClick={clearSignature} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                  <RotateCcw size={12} /> Clear
                </button>
              </div>
              <div className="bg-white rounded-lg overflow-hidden border border-slate-200" style={{ touchAction: 'none' }}>
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#000"
                  canvasProps={{
                    className: 'sig-canvas w-full',
                    style: { width: '100%', height: '180px' },
                  }}
                  onEnd={() => { if (sigRef.current && !sigRef.current.isEmpty()) setHasSigned(true) }}
                />
              </div>
            </div>

            <LoadingButton
              loading={saving}
              onClick={handleSubmit}
              disabled={!hasSigned || !selectedOp}
              className="w-full bg-success hover:bg-green-600 text-white text-lg py-4 rounded-xl"
            >
              Confirm Attendance
            </LoadingButton>
          </>
        )}
      </div>
    </div>
  )
}
