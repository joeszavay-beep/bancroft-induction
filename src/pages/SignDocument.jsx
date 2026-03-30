import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { ArrowLeft, FileText, RotateCcw, CheckCircle2, ExternalLink } from 'lucide-react'

export default function SignDocument() {
  const { operativeId, documentId } = useParams()
  const navigate = useNavigate()
  const sigRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!hasSigned || !typedName.trim()) return

    // Verify typed name matches operative name (case-insensitive)
    if (typedName.trim().toLowerCase() !== operative.name.toLowerCase()) {
      toast.error('Typed name must match your registered name')
      return
    }

    setSaving(true)
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
      typed_name: typedName.trim(),
    })

    setSaving(false)
    if (dbErr) {
      toast.error('Failed to save signature')
      return
    }

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
        <p className="text-gray-400 text-center mb-8">
          You have successfully signed <span className="text-white font-medium">{document.title}</span>
        </p>
        <button
          onClick={() => navigate(`/operative/${operativeId}/documents`)}
          className="px-6 py-3 bg-accent hover:bg-accent-dark text-white font-medium rounded-lg transition-colors"
        >
          Back to Documents
        </button>
      </div>
    )
  }

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
        {/* Document preview / link */}
        {document?.file_url && (
          <a
            href={document.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-navy-800 border border-navy-600 rounded-xl p-4 hover:border-accent/50 transition-colors"
          >
            <FileText size={24} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">View Document</p>
              <p className="text-xs text-gray-400 truncate">{document.file_name || 'Open in new tab'}</p>
            </div>
            <ExternalLink size={18} className="text-gray-500" />
          </a>
        )}

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

        {/* Type name to confirm */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
          <label className="text-sm font-semibold text-gray-300 block mb-2">Type your full name to confirm</label>
          <input
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder={operative?.name || 'Full name'}
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Submit */}
        <LoadingButton
          loading={saving}
          onClick={handleSubmit}
          disabled={!hasSigned || !typedName.trim()}
          className="w-full bg-success hover:bg-green-600 text-white text-lg py-4"
        >
          Confirm & Sign
        </LoadingButton>
      </div>
    </div>
  )
}
