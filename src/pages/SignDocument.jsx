import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import PDFViewer from '../components/PDFViewer'
import { ArrowLeft, RotateCcw, CheckCircle2, Shield } from 'lucide-react'

export default function SignDocument() {
  const { operativeId, documentId } = useParams()
  const navigate = useNavigate()
  const sigRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [operative, setOperative] = useState(null)
  const [allDocs, setAllDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [typedDob, setTypedDob] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [hasReadDoc, setHasReadDoc] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [allComplete, setAllComplete] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [docRes, opRes] = await Promise.all([
      supabase.from('documents').select('*, projects(name)').eq('id', documentId).single(),
      supabase.from('operatives').select('*').eq('id', operativeId).single(),
    ])
    setDocument(docRes.data)
    setOperative(opRes.data)
    setLoading(false)
  }

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
      const res = await fetch('https://api.ipify.org?format=json')
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
      .eq('project_id', operative.project_id)

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
        key: `notification_${operativeId}_${Date.now()}`,
        value: JSON.stringify({
          type: 'completion',
          operative_name: operative.name,
          project_id: operative.project_id,
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
    e.preventDefault()
    if (!hasSigned || !typedDob.trim()) return

    // Verify DOB matches (if operative has DOB set)
    if (operative.date_of_birth) {
      if (typedDob.trim() !== operative.date_of_birth) {
        toast.error('Date of birth does not match our records')
        return
      }
    }

    setSaving(true)

    // Get IP address
    const ipAddress = await getIpAddress()

    const signatureDataUrl = sigRef.current.toDataURL('image/png')

    // Upload signature image
    const blob = await (await fetch(signatureDataUrl)).blob()
    const filePath = `signatures/${operativeId}/${documentId}_${Date.now()}.png`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, blob, { contentType: 'image/png' })

    if (upErr) {
      setSaving(false)
      toast.error('Failed to upload signature')
      return
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)

    const { error: dbErr } = await supabase.from('signatures').insert({
      operative_id: operativeId,
      document_id: documentId,
      project_id: operative.project_id,
      operative_name: operative.name,
      document_title: document.title,
      signature_url: urlData.publicUrl,
      typed_name: typedDob.trim(),
      ip_address: ipAddress,
    })

    if (dbErr) {
      setSaving(false)
      toast.error('Failed to save signature')
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
      <div className="min-h-dvh flex items-center justify-center bg-navy-950">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (showSuccess) {
    return (
      <div className="min-h-dvh bg-navy-950 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Document Signed!</h2>
        <p className="text-gray-400 text-center mb-2">
          You have successfully signed <span className="text-white font-medium">{document.title}</span>
        </p>
        {allComplete && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mt-4 mb-4 text-center">
            <CheckCircle2 size={24} className="text-success mx-auto mb-2" />
            <p className="text-success font-semibold">All documents complete!</p>
            <p className="text-sm text-gray-400 mt-1">Your project manager has been notified.</p>
          </div>
        )}
        <button
          onClick={() => navigate(`/operative/${operativeId}/documents`)}
          className="px-6 py-3 bg-accent hover:bg-accent-dark text-white font-medium rounded-lg transition-colors mt-4"
        >
          Back to Documents
        </button>
      </div>
    )
  }

  const canSign = hasReadDoc || !document?.file_url

  return (
    <div className="min-h-dvh bg-navy-950 flex flex-col">
      <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(`/operative/${operativeId}/documents`)} className="p-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{document?.title}</h1>
          <p className="text-xs text-gray-400 truncate">{document?.projects?.name}</p>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Built-in document viewer */}
        {document?.file_url && (
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Read Document</h3>
            <PDFViewer
              url={document.file_url}
              title={document.title}
              onConfirmRead={() => setHasReadDoc(true)}
            />
          </div>
        )}

        {/* Sign section - only visible after reading */}
        {canSign ? (
          <>
            {/* Signature pad */}
            <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-300">Your Signature</p>
                <button onClick={clearSignature} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <RotateCcw size={12} /> Clear
                </button>
              </div>
              <div className="bg-white rounded-lg overflow-hidden" style={{ touchAction: 'none' }}>
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
              <p className="text-xs text-gray-500 mt-2">Draw your signature above</p>
            </div>

            {/* Identity verification */}
            <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={16} className="text-accent" />
                <label className="text-sm font-semibold text-gray-300">Identity Verification</label>
              </div>
              <p className="text-xs text-gray-400 mb-3">Enter your date of birth to confirm your identity</p>
              <input
                type="date"
                value={typedDob}
                onChange={e => setTypedDob(e.target.value)}
                className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white focus:outline-none focus:border-accent"
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
          <div className="bg-navy-700/50 border border-navy-600 rounded-xl p-6 text-center">
            <Shield size={28} className="text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Read the document above and tick the confirmation box to proceed with signing</p>
          </div>
        )}
      </div>
    </div>
  )
}
