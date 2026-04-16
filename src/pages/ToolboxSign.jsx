import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { CheckCircle2, RotateCcw, FileText, XCircle } from 'lucide-react'
import { getSession, setSession } from '../lib/storage'

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

  // Check if operative is logged in — auto-select them
  const opSession = (() => { try { return JSON.parse(getSession('operative_session') || 'null') } catch { /* ignore */ return null } })()

  async function loadData() {
    const { data: t } = await supabase.from('toolbox_talks').select('*').eq('id', talkId).single()
    if (!t) { setLoading(false); return }
    setTalk(t)

    const [p, o, s] = await Promise.all([
      supabase.from('projects').select('*, companies(name, logo_url)').eq('id', t.project_id).single(),
      supabase.from('operatives').select('*').eq('project_id', t.project_id).order('name'),
      supabase.from('toolbox_signatures').select('operative_id').eq('talk_id', talkId),
    ])
    setProject(p.data)
    setOperatives(o.data || [])
    setExistingSigs(s.data || [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  useEffect(() => {
    if (opSession?.id && operatives.length > 0) {
      const match = operatives.find(o => o.id === opSession.id)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (match) setSelectedOp(match.id)
    }
  }, [operatives])

  function clearSignature() {
    sigRef.current?.clear()
    setHasSigned(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!hasSigned || !selectedOp) return
    setSaving(true)

    // Re-check for duplicate signature before submitting
    const { data: existing } = await supabase
      .from('toolbox_signatures')
      .select('id')
      .eq('talk_id', talkId)
      .eq('operative_id', selectedOp)
      .limit(1)
    if (existing && existing.length > 0) {
      setSaving(false)
      toast.error('You have already signed this toolbox talk')
      setShowSuccess(true)
      return
    }

    const op = operatives.find(o => o.id === selectedOp)
    const signatureDataUrl = sigRef.current.toDataURL('image/png')

    // Upload signature
    const blob = await (await fetch(signatureDataUrl)).blob()
    const filePath = `toolbox/${talkId}/${selectedOp}_${crypto.randomUUID()}.png`
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
          {project?.companies?.logo_url ? (
            <img src={project.companies.logo_url} alt={project.companies.name} className="h-7" />
          ) : (
            <span className="text-sm font-semibold text-slate-700">{project?.companies?.name || <><span className="font-light tracking-widest">CORE</span><span className="font-bold">SITE</span></>}</span>
          )}
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
            {/* Identity verification */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              {opSession ? (
                <div>
                  <label className="text-sm font-semibold text-slate-600 block mb-2">Signing as</label>
                  <div className={`flex items-center gap-3 p-3 ${selectedOp ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'} rounded-lg`}>
                    <div className={`w-9 h-9 rounded-full ${selectedOp ? 'bg-green-500' : 'bg-amber-500'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {opSession.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${selectedOp ? 'text-green-900' : 'text-amber-900'}`}>{opSession.name}</p>
                      {selectedOp ? (
                        opSession.role && <p className="text-xs text-green-700">{opSession.role}</p>
                      ) : (
                        <p className="text-xs text-amber-700">You are not assigned to this project. Please contact your manager.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-slate-600 mb-3">Sign in to record your attendance</p>
                  <button onClick={() => { setSession('operative_return_url', window.location.pathname); window.location.href = '/worker-login' }}
                    className="px-6 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg transition-colors">
                    Sign In
                  </button>
                </div>
              )}
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
