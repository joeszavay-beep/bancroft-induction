import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
// notify doesn't need auth — called from operative pages
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import PDFViewer from '../components/PDFViewer'
import { ArrowLeft, RotateCcw, CheckCircle2, Shield } from 'lucide-react'
import { getSession } from '../lib/storage'

export default function SignDocument() {
  const { operativeId, documentId } = useParams()
  const navigate = useNavigate()
  const sigRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [typedDob, setTypedDob] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [hasReadDoc, setHasReadDoc] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [allComplete, setAllComplete] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)

  async function loadData() {
    const [docRes, opRes, existingSigRes] = await Promise.all([
      supabase.from('documents').select('*, projects(name)').eq('id', documentId).single(),
      supabase.from('operatives').select('*, operative_projects(project_id)').eq('id', operativeId).single(),
      supabase.from('signatures').select('id').eq('operative_id', operativeId).eq('document_id', documentId).eq('invalidated', false).limit(1),
    ])
    setDocument(docRes.data)
    setOperative(opRes.data)
    if (existingSigRes.data && existingSigRes.data.length > 0) {
      setAlreadySigned(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  function clearSignature() {
    sigRef.current?.clear()
    setHasSigned(false)
  }

  function onSignEnd() {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setHasSigned(true)
    }
  }

  async function getIpAddress() {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
      clearTimeout(timeout)
      const data = await res.json()
      return data.ip
    } catch {
      return 'unknown'
    }
  }

  async function checkAllComplete() {
    const { data: docs } = await supabase
      .from('documents')
      .select('id')
      .in('project_id', (operative.operative_projects || []).map(r => r.project_id))

    const { data: sigs } = await supabase
      .from('signatures')
      .select('document_id')
      .eq('operative_id', operativeId)
      .eq('invalidated', false)

    if (!docs || !sigs) return false
    const signedIds = new Set(sigs.map(s => s.document_id))
    return docs.every(d => signedIds.has(d.id))
  }

  async function sendCompletionNotification() {
    try {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pm_email')
        .single()

      if (!setting?.value) return

      // Store notification in settings for PM to see
      await supabase.from('settings').upsert({
        key: `notification_${operativeId}_${crypto.randomUUID()}`,
        value: JSON.stringify({
          type: 'completion',
          operative_name: operative.name,
          project_id: operative.operative_projects?.[0]?.project_id || null,
          timestamp: new Date().toISOString(),
          read: false,
        }),
      })

      // Send email via Vercel API route
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: setting.value,
          operativeName: operative.name,
          projectName: document.projects?.name,
        }),
      }).catch(() => {}) // Silent fail if email endpoint not configured
    } catch {
      // Non-critical, don't block the flow
    }
  }

  async function handleSubmit(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!hasSigned || !typedDob.trim()) {
      toast.error('Please sign and enter your date of birth')
      return
    }

    // Verify DOB matches (if operative has DOB set)
    if (operative.date_of_birth) {
      if (typedDob.trim() !== operative.date_of_birth) {
        toast.error('Date of birth does not match our records')
        return
      }
    }

    setSaving(true)

    try {
      // Get IP address (with timeout)
      const ipAddress = await getIpAddress()

      const signatureDataUrl = sigRef.current.toDataURL('image/png')

      // Upload signature image
      const blob = await (await fetch(signatureDataUrl)).blob()
      const filePath = `signatures/${operativeId}/${documentId}_${crypto.randomUUID()}.png`
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, blob, { contentType: 'image/png' })

      if (upErr) {
        setSaving(false)
        toast.error(`Failed to upload signature: ${upErr.message}`)
        return
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)

      const { error: dbErr } = await supabase.from('signatures').insert({
        operative_id: operativeId,
        document_id: documentId,
        project_id: document.project_id,
        company_id: operative.company_id,
        operative_name: operative.name,
        document_title: document.title,
        signature_url: urlData.publicUrl,
        typed_name: operative.name,
        ip_address: ipAddress,
      })

      if (dbErr) {
        setSaving(false)
        toast.error(`Failed to save signature: ${dbErr.message}`)
        return
      }
    } catch (err) {
      setSaving(false)
      toast.error(`Something went wrong: ${err.message}`)
      return
    }

    // Check if all documents are now complete
    const complete = await checkAllComplete()
    setAllComplete(complete)

    if (complete) {
      await sendCompletionNotification()
    }

    setSaving(false)
    setShowSuccess(true)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (alreadySigned) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Already Signed</h2>
        <p className="text-slate-500 text-center mb-2">
          You have already signed <span className="text-slate-900 font-medium">{document?.title}</span>
        </p>
        <button
          onClick={() => navigate(getSession('operative_session') ? '/worker' : `/operative/${operativeId}/documents`)}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors mt-4"
        >
          {getSession('operative_session') ? 'Back to Dashboard' : 'Back to Documents'}
        </button>
      </div>
    )
  }

  if (showSuccess) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Document Signed!</h2>
        <p className="text-slate-500 text-center mb-2">
          You have successfully signed <span className="text-slate-900 font-medium">{document.title}</span>
        </p>
        {allComplete && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mt-4 mb-4 text-center">
            <CheckCircle2 size={24} className="text-success mx-auto mb-2" />
            <p className="text-success font-semibold">All documents complete!</p>
            <p className="text-sm text-slate-500 mt-1">Your project manager has been notified.</p>
          </div>
        )}
        <button
          onClick={() => navigate(getSession('operative_session') ? '/worker' : `/operative/${operativeId}/documents`)}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors mt-4"
        >
          {getSession('operative_session') ? 'Back to Dashboard' : 'Back to Documents'}
        </button>
      </div>
    )
  }

  const canSign = hasReadDoc || !document?.file_url

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(getSession('operative_session') ? '/worker' : `/operative/${operativeId}/documents`)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{document?.title}</h1>
          <p className="text-xs text-slate-500 truncate">{document?.projects?.name}</p>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Built-in document viewer */}
        {document?.file_url && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Read Document</h3>
            <PDFViewer
              url={document.file_url}
              title={document.title}
              onConfirmRead={(checked) => setHasReadDoc(checked)}
            />
          </div>
        )}

        {/* Sign section - only visible after reading */}
        {canSign ? (
          <>
            {/* Signature pad */}
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
                    style: { width: '100%', height: '200px' },
                  }}
                  onEnd={onSignEnd}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Draw your signature above</p>
            </div>

            {/* Identity verification */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={16} className="text-blue-500" />
                <label className="text-sm font-semibold text-slate-600">Identity Verification</label>
              </div>
              <p className="text-xs text-slate-500 mb-3">Enter your date of birth to confirm your identity</p>
              <input
                type="date"
                value={typedDob}
                onChange={e => setTypedDob(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
              />
            </div>

            {/* Submit */}
            <LoadingButton
              loading={saving}
              onClick={handleSubmit}
              disabled={!hasSigned || !typedDob.trim()}
              className="w-full bg-success hover:bg-green-600 text-white text-lg py-4"
            >
              Confirm & Sign
            </LoadingButton>
          </>
        ) : (
          <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-6 text-center">
            <Shield size={28} className="text-slate-400 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Read the document above and tick the confirmation box to proceed with signing</p>
          </div>
        )}
      </div>
    </div>
  )
}
