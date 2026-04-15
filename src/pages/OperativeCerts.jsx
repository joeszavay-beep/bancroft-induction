import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import { Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Info, Upload, Camera, FileText, X } from 'lucide-react'
import toast from 'react-hot-toast'

function getCertStatus(expiryDate) {
  if (!expiryDate) return { status: 'none', label: 'Not on file', color: 'slate' }
  const now = new Date()
  const expiry = new Date(expiryDate)
  const daysUntil = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))

  if (daysUntil < 0) return { status: 'expired', label: `Expired ${Math.abs(daysUntil)} days ago`, color: 'red', daysUntil }
  if (daysUntil <= 30) return { status: 'warning', label: `Expires in ${daysUntil} days`, color: 'amber', daysUntil }
  if (daysUntil <= 60) return { status: 'soon', label: `Expires in ${daysUntil} days`, color: 'yellow', daysUntil }
  return { status: 'valid', label: `Valid until ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, color: 'green', daysUntil }
}

const STATUS_ICON = {
  expired: XCircle,
  warning: AlertTriangle,
  soon: Clock,
  valid: CheckCircle2,
  none: Info,
}

const STATUS_COLORS = {
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500', badge: 'bg-red-100 text-red-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-700' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-500', badge: 'bg-green-100 text-green-700' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', icon: 'text-slate-400', badge: 'bg-slate-100 text-slate-500' },
}

// Map cert key to operatives table columns
const CERT_FIELDS = {
  cscs: { expiry: 'cscs_expiry', number: 'cscs_number', type: 'cscs_type' },
  ipaf: { expiry: 'ipaf_expiry' },
  pasma: { expiry: 'pasma_expiry' },
  sssts: { expiry: 'sssts_expiry' },
  smsts: { expiry: 'smsts_expiry' },
  first_aid: { expiry: 'first_aid_expiry' },
}

const CSCS_TYPES = [
  'Red - Trainee/Apprentice',
  'Green - Construction Site Operative',
  'Blue - Skilled Worker',
  'Gold - Supervisor',
  'Black - Manager',
  'White - Professionally Qualified',
  'Yellow - Visitor',
  'Other',
]

export default function OperativeCerts() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)
  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)

  // Upload modal state
  const [editCert, setEditCert] = useState(null)
  const [certExpiry, setCertExpiry] = useState('')
  const [certNumber, setCertNumber] = useState('')
  const [certType, setCertType] = useState('')
  const [certFile, setCertFile] = useState(null)
  const [certPreview, setCertPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [existingDocs, setExistingDocs] = useState({})
  const fileRef = useRef(null)

  useEffect(() => {
    const session = getSession('operative_session')
    if (!session) { navigate('/worker-login'); return }
    const data = JSON.parse(session)
    setOp(data)
    loadCerts(data)
  }, [])

  async function loadCerts(opData) {
    setLoading(true)
    const { data } = await supabase
      .from('operatives')
      .select('*')
      .eq('id', opData.id)
      .single()

    setOperative(data)

    // Check which certs have uploaded documents
    if (data) {
      const docs = {}
      for (const key of Object.keys(CERT_FIELDS)) {
        const folder = `certs/${data.id}/${key}`
        const { data: files } = await supabase.storage.from('documents').list(folder, { limit: 1 })
        if (files?.length > 0) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`${folder}/${files[0].name}`)
          docs[key] = urlData.publicUrl
        }
      }
      setExistingDocs(docs)
    }

    setLoading(false)
  }

  function openUpload(certKey, certName) {
    const fields = CERT_FIELDS[certKey]
    setEditCert({ key: certKey, name: certName })
    setCertExpiry(operative?.[fields.expiry] || '')
    setCertNumber(fields.number ? (operative?.[fields.number] || '') : '')
    setCertType(fields.type ? (operative?.[fields.type] || '') : '')
    setCertFile(null)
    setCertPreview(existingDocs[certKey] || null)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB')
      return
    }
    setCertFile(file)
    if (file.type.startsWith('image/')) {
      setCertPreview(URL.createObjectURL(file))
    } else {
      setCertPreview(null)
    }
  }

  async function saveCert() {
    if (!editCert || !operative) return
    setUploading(true)

    try {
      const fields = CERT_FIELDS[editCert.key]
      const updates = {}

      if (certExpiry) updates[fields.expiry] = certExpiry
      if (fields.number && certNumber) updates[fields.number] = certNumber
      if (fields.type && certType) updates[fields.type] = certType

      // Update operative record
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('operatives')
          .update(updates)
          .eq('id', operative.id)
        if (error) {
          toast.error('Failed to save cert details')
          setUploading(false)
          return
        }
      }

      // Upload document if provided
      if (certFile) {
        const ext = certFile.name.split('.').pop()
        const path = `certs/${operative.id}/${editCert.key}/${Date.now()}.${ext}`

        // Remove old files in this folder first
        const folder = `certs/${operative.id}/${editCert.key}`
        const { data: oldFiles } = await supabase.storage.from('documents').list(folder)
        if (oldFiles?.length > 0) {
          await supabase.storage.from('documents').remove(oldFiles.map(f => `${folder}/${f.name}`))
        }

        const { error: upErr } = await supabase.storage.from('documents').upload(path, certFile)
        if (upErr) {
          toast.error('Failed to upload document')
          setUploading(false)
          return
        }
      }

      toast.success(`${editCert.name} updated`)
      setEditCert(null)
      loadCerts(op)
    } catch (err) {
      console.error('Save cert error:', err)
      toast.error('Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  if (!op) return null

  const primaryColor = op.primary_colour || '#1B6FC8'

  const certs = operative ? [
    { key: 'cscs', name: 'CSCS Card', type: operative.cscs_type || null, number: operative.cscs_number || null, expiry: operative.cscs_expiry, primary: true },
    { key: 'ipaf', name: 'IPAF', expiry: operative.ipaf_expiry },
    { key: 'pasma', name: 'PASMA', expiry: operative.pasma_expiry },
    { key: 'sssts', name: 'SSSTS', expiry: operative.sssts_expiry },
    { key: 'smsts', name: 'SMSTS', expiry: operative.smsts_expiry },
    { key: 'first_aid', name: 'First Aid', expiry: operative.first_aid_expiry },
  ] : []

  const issues = certs.filter(c => {
    const s = getCertStatus(c.expiry)
    return s.status === 'expired' || s.status === 'warning'
  }).length

  return (
    <WorkerSidebarLayout op={op}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>My Certifications</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Upload and manage your training cards</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : !operative ? (
          <div className="bg-white border border-[#E2E6EA] rounded-xl p-8 text-center">
            <Shield size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">Could not load your certification data</p>
          </div>
        ) : (
          <>
            {/* Status summary */}
            {issues > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-800">{issues} certification{issues !== 1 ? 's' : ''} need{issues === 1 ? 's' : ''} attention</p>
                  <p className="text-[11px] text-red-600 mt-0.5">Tap a certification below to upload or update your details.</p>
                </div>
              </div>
            )}

            {/* CSCS Card — featured */}
            {certs.filter(c => c.primary).map(cert => {
              const certStatus = getCertStatus(cert.expiry)
              const colors = STATUS_COLORS[certStatus.color]
              const StatusIcon = STATUS_ICON[certStatus.status]
              const hasDoc = !!existingDocs[cert.key]

              return (
                <div key={cert.key} className={`rounded-xl border overflow-hidden ${colors.border}`}>
                  <div className="bg-[#1A2744] p-4 flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                      <Shield size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm">{cert.name}</p>
                      {cert.type && <p className="text-white/50 text-xs">{cert.type}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasDoc && <FileText size={14} className="text-green-400" />}
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${colors.badge}`}>
                        {certStatus.status === 'valid' ? 'VALID' : certStatus.status === 'none' ? 'N/A' : certStatus.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className={`p-4 ${colors.bg}`}>
                    <div className="grid grid-cols-2 gap-3">
                      {cert.number && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Card Number</p>
                          <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{cert.number}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Expiry Date</p>
                        <p className={`text-sm font-semibold ${colors.text}`}>
                          {cert.expiry ? new Date(cert.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}
                        </p>
                      </div>
                      {operative.card_verified !== undefined && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Verification</p>
                          <p className={`text-sm font-semibold flex items-center gap-1 ${operative.card_verified ? 'text-green-700' : 'text-amber-600'}`}>
                            {operative.card_verified ? <><CheckCircle2 size={12} /> Verified</> : <><Clock size={12} /> Pending</>}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: `${certStatus.color === 'green' ? '#bbf7d0' : certStatus.color === 'red' ? '#fecaca' : '#fde68a'}` }}>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon size={14} className={colors.icon} />
                        <p className={`text-xs font-medium ${colors.text}`}>{certStatus.label}</p>
                      </div>
                      <button
                        onClick={() => openUpload(cert.key, cert.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Upload size={12} />
                        {cert.expiry ? 'Update' : 'Upload'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Other certs */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Other Certifications</p>
              {certs.filter(c => !c.primary).map(cert => {
                const certStatus = getCertStatus(cert.expiry)
                const colors = STATUS_COLORS[certStatus.color]
                const StatusIcon = STATUS_ICON[certStatus.status]
                const hasDoc = !!existingDocs[cert.key]

                return (
                  <button
                    key={cert.key}
                    onClick={() => openUpload(cert.key, cert.name)}
                    className={`w-full bg-white border rounded-xl p-4 flex items-center gap-3 ${colors.border} text-left hover:shadow-sm transition-shadow`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
                      <StatusIcon size={18} className={colors.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{cert.name}</p>
                        {hasDoc && <FileText size={12} className="text-green-500" />}
                      </div>
                      <p className={`text-xs ${colors.text}`}>{certStatus.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                        {certStatus.status === 'valid' ? 'OK' : certStatus.status === 'none' ? '—' : certStatus.status === 'expired' ? 'EXP' : 'DUE'}
                      </span>
                      <Upload size={14} className="text-slate-400" />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Photo */}
            {operative.photo_url && (
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">ID Photo</p>
                <div className="bg-white border border-[#E2E6EA] rounded-xl p-3">
                  <img src={operative.photo_url} alt="Operative photo" className="w-24 h-24 rounded-lg object-cover" />
                </div>
              </div>
            )}

            {/* Info notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
              <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800">Keep your certs up to date</p>
                <p className="text-[11px] text-blue-600 mt-0.5">
                  Upload photos of your cards and enter expiry dates. Your manager will verify the details.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upload/Edit Modal */}
      {editCert && (
        <Modal onClose={() => setEditCert(null)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{editCert.name}</h2>
              <p className="text-xs text-slate-500">Upload a photo of your card and enter the details</p>
            </div>

            {/* File upload area */}
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1.5 block">Card Photo / Document</label>
              {certPreview || certFile ? (
                <div className="relative">
                  {certPreview ? (
                    <img src={certPreview} alt="Certificate" className="w-full h-48 object-contain rounded-lg border border-[#E2E6EA] bg-slate-50" />
                  ) : (
                    <div className="w-full h-24 rounded-lg border border-[#E2E6EA] bg-slate-50 flex items-center justify-center gap-2">
                      <FileText size={20} className="text-slate-400" />
                      <p className="text-sm text-slate-600">{certFile.name}</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setCertFile(null); setCertPreview(existingDocs[editCert.key] || null) }}
                    className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
                  >
                    <X size={14} className="text-slate-600" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-[#E2E6EA] rounded-lg p-6 flex flex-col items-center gap-2 hover:border-blue-300 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Camera size={20} className="text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">Take a photo or choose file</p>
                  <p className="text-[11px] text-slate-400">JPG, PNG or PDF up to 10MB</p>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              {!certFile && !certPreview && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  Browse files instead
                </button>
              )}
            </div>

            {/* CSCS-specific fields */}
            {editCert.key === 'cscs' && (
              <>
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1.5 block">Card Type</label>
                  <select
                    value={certType}
                    onChange={e => setCertType(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-lg text-sm focus:outline-none focus:border-[#1B6FC8]"
                  >
                    <option value="">Select card type</option>
                    {CSCS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1.5 block">Card Number</label>
                  <input
                    type="text"
                    value={certNumber}
                    onChange={e => setCertNumber(e.target.value)}
                    placeholder="e.g. 1234567890"
                    className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-lg text-sm focus:outline-none focus:border-[#1B6FC8]"
                  />
                </div>
              </>
            )}

            {/* Expiry date */}
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1.5 block">Expiry Date</label>
              <input
                type="date"
                value={certExpiry}
                onChange={e => setCertExpiry(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-lg text-sm focus:outline-none focus:border-[#1B6FC8]"
              />
            </div>

            <LoadingButton
              loading={uploading}
              onClick={saveCert}
              className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg"
            >
              Save {editCert.name}
            </LoadingButton>
          </div>
        </Modal>
      )}
    </WorkerSidebarLayout>
  )
}
