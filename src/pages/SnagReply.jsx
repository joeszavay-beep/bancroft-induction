import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Camera, CheckCircle2, XCircle, Upload } from 'lucide-react'

export default function SnagReply() {
  const { token } = useParams()
  const [snag, setSnag] = useState(null)
  const [drawing, setDrawing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [comment, setComment] = useState('')

  useEffect(() => { loadSnag() }, [token])

  async function loadSnag() {
    const { data } = await supabase
      .from('snags')
      .select('*, drawings(name, level_ref, drawing_number)')
      .eq('reply_token', token)
      .single()

    if (!data) { setLoading(false); return }
    setSnag(data)
    setDrawing(data.drawings)

    // Already submitted?
    if (data.status === 'pending_review') setSubmitted(true)
    setLoading(false)
  }

  function handlePhoto(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!photoFile) { toast.error('Please take or upload a photo'); return }
    setUploading(true)

    // Upload photo
    const filePath = `snag-replies/${snag.id}/${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('snag-photos').upload(filePath, photoFile, { contentType: photoFile.type })
    if (upErr) { setUploading(false); toast.error('Failed to upload photo'); return }

    const { data: urlData } = supabase.storage.from('snag-photos').getPublicUrl(filePath)

    // Update snag
    const { error } = await supabase.from('snags').update({
      status: 'pending_review',
      review_photo_url: urlData.publicUrl,
      review_submitted_at: new Date().toISOString(),
      review_submitted_by: snag.assigned_to || 'Operative',
      updated_at: new Date().toISOString(),
    }).eq('id', snag.id)

    if (error) { setUploading(false); toast.error('Failed to submit'); return }

    // Add comment if provided
    if (comment.trim()) {
      await supabase.from('snag_comments').insert({
        snag_id: snag.id,
        comment: comment.trim(),
        author_name: snag.assigned_to || 'Operative',
        author_role: 'Operative',
        company_id: snag.company_id,
      })
    }

    // Add a comment logging the submission
    await supabase.from('snag_comments').insert({
      snag_id: snag.id,
      comment: 'Completion photo submitted for review',
      author_name: snag.assigned_to || 'Operative',
      author_role: 'Operative',
      company_id: snag.company_id,
    }).catch(() => {})

    setUploading(false)
    setSubmitted(true)
    toast.success('Submitted for review')
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!snag) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
        <XCircle size={48} className="text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Link Not Found</h1>
        <p className="text-slate-500 text-center">This snag reply link is invalid or has expired.</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={44} className="text-[#2EA043]" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Submitted for Review</h1>
        <p className="text-slate-500 text-center max-w-sm">
          Your completion photo for <strong>Snag #{snag.snag_number}</strong> has been submitted. Your project manager will review it shortly.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-[#0D1526] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src="/coresite-logo.svg" alt="CoreSite" className="h-7 brightness-0 invert" />
          <span className="text-white/40 text-xs">Snag Completion</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Snag info */}
        <div className="bg-white border border-[#E2E6EA] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded">
              {snag.status?.toUpperCase()}
            </span>
            <h1 className="text-lg font-bold text-slate-900">Snag #{snag.snag_number}</h1>
          </div>

          {snag.photo_url && (
            <img src={snag.photo_url} alt="Snag" className="w-full h-40 object-cover rounded-lg mb-3" />
          )}

          <div className="space-y-1.5 text-sm">
            {snag.trade && <p className="text-slate-700"><span className="text-slate-400 text-xs">Trade:</span> {snag.trade}</p>}
            {snag.description && <p className="text-slate-700"><span className="text-slate-400 text-xs">Description:</span> {snag.description}</p>}
            {drawing && <p className="text-slate-500 text-xs">Drawing: {drawing.name}{drawing.level_ref ? ` — ${drawing.level_ref}` : ''}</p>}
            {snag.priority && <p className="text-slate-500 text-xs">Priority: <span className={`font-semibold ${snag.priority === 'high' ? 'text-red-600' : snag.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'}`}>{snag.priority}</span></p>}
            {snag.due_date && <p className="text-slate-500 text-xs">Due: {new Date(snag.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
          </div>
        </div>

        {/* Photo upload */}
        <div className="bg-white border border-[#E2E6EA] rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Submit Completion Photo</h2>
          <p className="text-xs text-slate-500 mb-4">Take a photo showing the snag has been resolved, then submit for your PM to review.</p>

          {photoPreview ? (
            <div className="relative mb-4">
              <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70">✕</button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-6 bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-xl cursor-pointer transition-colors min-h-[56px]">
                <Camera size={20} />
                <span className="text-sm font-medium">Take Photo</span>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
              </label>
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-6 bg-[#F5F6F8] hover:bg-[#E2E6EA] text-[#1A1A2E] border border-[#E2E6EA] rounded-xl cursor-pointer transition-colors min-h-[56px]">
                <Upload size={20} />
                <span className="text-sm font-medium">Upload Image</span>
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              </label>
            </div>
          )}

          {/* Optional comment */}
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment (optional)..."
            rows={2}
            className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#1B6FC8] resize-none mb-4"
          />

          <button
            onClick={handleSubmit}
            disabled={!photoFile || uploading}
            className="w-full py-3.5 bg-[#2EA043] hover:bg-[#27903A] text-white font-semibold rounded-xl disabled:opacity-40 transition-colors min-h-[48px]"
          >
            {uploading ? 'Submitting...' : 'Submit for Review'}
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-300">CoreSite — Site Compliance Platform</p>
      </div>
    </div>
  )
}
