import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import { Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Info } from 'lucide-react'

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

export default function OperativeCerts() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)
  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)

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
    setLoading(false)
  }

  if (!op) return null

  const primaryColor = op.primary_colour || '#1B6FC8'

  const certs = operative ? [
    {
      name: 'CSCS Card',
      type: operative.cscs_type || null,
      number: operative.cscs_number || null,
      expiry: operative.cscs_expiry,
      primary: true,
    },
    { name: 'IPAF', expiry: operative.ipaf_expiry },
    { name: 'PASMA', expiry: operative.pasma_expiry },
    { name: 'SSSTS', expiry: operative.sssts_expiry },
    { name: 'SMSTS', expiry: operative.smsts_expiry },
    { name: 'First Aid', expiry: operative.first_aid_expiry },
  ] : []

  // Count issues
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
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your training cards and certification status</p>
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
                  <p className="text-[11px] text-red-600 mt-0.5">Contact your manager to update expired or expiring certifications.</p>
                </div>
              </div>
            )}

            {/* CSCS Card — featured */}
            {certs.filter(c => c.primary).map(cert => {
              const certStatus = getCertStatus(cert.expiry)
              const colors = STATUS_COLORS[certStatus.color]
              const StatusIcon = STATUS_ICON[certStatus.status]

              return (
                <div key={cert.name} className={`rounded-xl border overflow-hidden ${colors.border}`}>
                  <div className="bg-[#1A2744] p-4 flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                      <Shield size={24} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{cert.name}</p>
                      {cert.type && <p className="text-white/50 text-xs">{cert.type}</p>}
                    </div>
                    <div className="ml-auto">
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
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: `${certStatus.color === 'green' ? '#bbf7d0' : certStatus.color === 'red' ? '#fecaca' : '#fde68a'}` }}>
                      <StatusIcon size={14} className={colors.icon} />
                      <p className={`text-xs font-medium ${colors.text}`}>{certStatus.label}</p>
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

                return (
                  <div key={cert.name} className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${colors.border}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
                      <StatusIcon size={18} className={colors.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{cert.name}</p>
                      <p className={`text-xs ${colors.text}`}>{certStatus.label}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {certStatus.status === 'valid' ? 'OK' : certStatus.status === 'none' ? '—' : certStatus.status === 'expired' ? 'EXP' : 'DUE'}
                    </span>
                  </div>
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
                <p className="text-xs font-semibold text-blue-800">Managed by your company</p>
                <p className="text-[11px] text-blue-600 mt-0.5">
                  Certifications are updated by your employer. If any details are incorrect or need updating, contact your site manager or HR department.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </WorkerSidebarLayout>
  )
}
