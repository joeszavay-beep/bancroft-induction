import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { generateSignOffSheet } from '../lib/generateSignOffSheet'
import { FileText, Upload, Download, RefreshCw, Trash2, FileWarning } from 'lucide-react'

// One shared surface for a project's signable documents, mounted twice:
// the project Documents block (docType='general') and the Risk Assessments
// page (docType='rams'). A single code path means the two sections cannot
// drift — the same upload / version-update-invalidates / delete / sign-off
// sheet behaviour everywhere, differing only in the doc_type each mount
// reads and writes.
export default function ProjectDocumentsSection({ project, docs, signatures, docType, heading, emptyText, companyBranding, cid, onRefresh }) {
  const [showUpload, setShowUpload] = useState(false)
  const [showUpdateDoc, setShowUpdateDoc] = useState(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [docTitle, setDocTitle] = useState('')

  const noun = docType === 'rams' ? 'risk assessment' : 'document'

  async function uploadDocument(e) {
    e.preventDefault()
    if (!uploadFile || !docTitle.trim()) return
    setSaving(true)
    const fileExt = uploadFile.name.split('.').pop()
    const filePath = `${project.id}/${crypto.randomUUID()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, uploadFile)
    if (upErr) {
      setSaving(false)
      toast.error('Failed to upload file')
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const { error: dbErr } = await supabase.from('documents').insert({
      project_id: project.id,
      title: docTitle.trim(),
      file_url: urlData.publicUrl,
      file_name: uploadFile.name,
      company_id: cid,
      doc_type: docType,
    })
    setSaving(false)
    if (dbErr) {
      toast.error(`Failed to save ${noun} record`)
      return
    }
    toast.success(`${docType === 'rams' ? 'Risk assessment' : 'Document'} uploaded`)
    setShowUpload(false)
    setDocTitle('')
    setUploadFile(null)
    onRefresh()
  }

  async function deleteDocument(doc) {
    const sigCount = signatures.filter(s => s.document_id === doc.id).length
    const warning = sigCount > 0
      ? `Delete "${doc.title}"? Its ${sigCount} signature${sigCount !== 1 ? 's' : ''} will be permanently deleted with it. This cannot be undone.`
      : `Delete "${doc.title}"? This cannot be undone.`
    if (!confirm(warning)) return
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) {
      toast.error(`Failed to delete ${noun}`)
      return
    }
    toast.success(`${docType === 'rams' ? 'Risk assessment' : 'Document'} deleted`)
    onRefresh()
  }

  async function updateDocument(e) {
    e.preventDefault()
    if (!uploadFile || !showUpdateDoc) return
    setSaving(true)
    const fileExt = uploadFile.name.split('.').pop()
    const filePath = `${showUpdateDoc.project_id}/${crypto.randomUUID()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, uploadFile)
    if (upErr) {
      setSaving(false)
      toast.error('Failed to upload file')
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    // Update document with new file and increment version
    const { error: dbErr } = await supabase.from('documents').update({
      file_url: urlData.publicUrl,
      file_name: uploadFile.name,
      version: (showUpdateDoc.version || 1) + 1,
    }).eq('id', showUpdateDoc.id)
    if (dbErr) {
      setSaving(false)
      toast.error(`Failed to update ${noun}`)
      return
    }
    // Invalidate all existing signatures for this document so operatives re-sign
    const { error: invErr } = await supabase.from('signatures').update({ invalidated: true }).eq('document_id', showUpdateDoc.id)
    setSaving(false)
    if (invErr) {
      toast.error(`${docType === 'rams' ? 'Risk assessment' : 'Document'} updated, but flagging operatives to re-sign failed — please retry`)
    } else {
      toast.success(`${docType === 'rams' ? 'Risk assessment' : 'Document'} updated — operatives flagged to re-sign`)
    }
    setShowUpdateDoc(null)
    setUploadFile(null)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{heading}</h4>
        <button onClick={() => { setShowUpload(true); setDocTitle(''); setUploadFile(null) }} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--primary-color)' }}>
          <Upload size={12} /> Upload
        </button>
      </div>
      {docs.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map(d => {
            const allDocSigs = signatures.filter(s => s.document_id === d.id)
            const docSigs = allDocSigs.filter(s => !s.invalidated)
            const invalidatedCount = allDocSigs.length - docSigs.length
            return (
              <div key={d.id} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                <div className="flex items-center gap-2">
                  <FileText size={14} style={{ color: 'var(--primary-color)' }} className="shrink-0" />
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}>v{d.version || 1}</span>
                  {docSigs.length > 0 && (
                    <button disabled={downloading === d.id} onClick={async () => {
                      setDownloading(d.id)
                      try {
                        await generateSignOffSheet({ projectName: project.name, documentTitle: d.title, signatures: allDocSigs, branding: companyBranding })
                      } catch (err) { console.error('Sign-off sheet error:', err); toast.error('Failed to generate sign-off sheet') }
                      setDownloading(null)
                    }} className="p-1 transition-colors" style={{ color: 'var(--primary-color)' }} title="Download sign-off sheet">
                      {downloading === d.id ? <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary-color)' }} /> : <Download size={14} />}
                    </button>
                  )}
                  <button onClick={() => { setShowUpdateDoc(d); setUploadFile(null) }} className="p-1 text-[#D29922] hover:opacity-70" title="Upload new version"><RefreshCw size={14} /></button>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{docSigs.length} sig{docSigs.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => deleteDocument(d)} className="p-1 text-[#DA3633] hover:opacity-70"><Trash2 size={14} /></button>
                </div>
                {invalidatedCount > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[#D29922]">
                    <FileWarning size={12} />
                    <span className="text-[11px]">{invalidatedCount} invalidated — re-sign required</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title={docType === 'rams' ? 'Upload Risk Assessment' : 'Upload Document'}>
        <form onSubmit={uploadDocument} className="space-y-4">
          <input
            value={docTitle}
            onChange={e => setDocTitle(e.target.value)}
            placeholder={docType === 'rams' ? 'Risk assessment title' : 'Document title'}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            autoFocus
          />
          <div>
            <label className="block w-full px-4 py-3 bg-white border border-slate-200 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-slate-400 mb-1" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Tap to select file'}</p>
            </label>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
            Upload
          </LoadingButton>
        </form>
      </Modal>

      {/* Update Version Modal */}
      <Modal open={!!showUpdateDoc} onClose={() => setShowUpdateDoc(null)} title={`Update: ${showUpdateDoc?.title}`}>
        <form onSubmit={updateDocument} className="space-y-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-warning mb-1">
              <FileWarning size={16} />
              <span className="text-sm font-semibold">Version Control Warning</span>
            </div>
            <p className="text-xs text-slate-500">
              Uploading a new version will <strong className="text-slate-900">invalidate all existing signatures</strong> for this {noun}.
              All operatives will be flagged to re-sign.
            </p>
          </div>
          <p className="text-sm text-slate-500">Current version: <span className="text-slate-900 font-medium">v{showUpdateDoc?.version || 1}</span> → New version: <span className="text-blue-500 font-medium">v{(showUpdateDoc?.version || 1) + 1}</span></p>
          <div>
            <label className="block w-full px-4 py-3 bg-white border border-slate-200 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-slate-400 mb-1" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Tap to select new file'}</p>
            </label>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-warning hover:bg-yellow-600 text-black font-semibold">
            Update & Invalidate Signatures
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}
