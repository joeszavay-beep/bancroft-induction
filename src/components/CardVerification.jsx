import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { X, Shield, ExternalLink, ZoomIn, CheckCircle2, XCircle, CreditCard, Clock } from 'lucide-react'

/**
 * Card verification modal for managers.
 * Shows card photos, details, and verify/reject buttons.
 *
 * Props: operative (object), onClose, onUpdated
 */
export default function CardVerification({ operative, onClose, onUpdated }) {
  const [lightbox, setLightbox] = useState(null)
  const [saving, setSaving] = useState(false)
  const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')

  async function handleVerify(verified) {
    setSaving(true)
    const { error } = await supabase.from('operatives').update({
      card_verified: verified,
      card_verified_by: managerData.name || 'Manager',
      card_verified_at: new Date().toISOString(),
    }).eq('id', operative.id)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success(verified ? 'Card verified' : 'Card rejected')
    onUpdated()
  }

  const op = operative
  const hasCard = op.card_number || op.card_front_url || op.cscs_number

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Card" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><X size={24} /></button>
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-amber-500" />
              <h3 className="text-base font-bold text-slate-900">Card Verification</h3>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={20} /></button>
          </div>

          <div className="p-5 space-y-4">
            {/* Operative info */}
            <div className="flex items-center gap-3">
              {op.photo_url ? (
                <img src={op.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  {op.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-900">{op.name}</p>
                <p className="text-xs text-slate-500">{op.role || 'Operative'}</p>
              </div>
            </div>

            {!hasCard ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                <CreditCard size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No card uploaded yet</p>
                <p className="text-xs text-slate-400 mt-1">This operative hasn't submitted their CSCS/ECS card</p>
              </div>
            ) : (
              <>
                {/* Card details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Card Type</p>
                    <p className="text-sm text-slate-900 font-medium mt-0.5">{op.card_type || op.cscs_type || '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Card Number</p>
                    <p className="text-sm text-slate-900 font-medium font-mono mt-0.5">{op.card_number || op.cscs_number || '—'}</p>
                  </div>
                  {(op.card_expiry || op.cscs_expiry) && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Expiry</p>
                      <p className="text-sm text-slate-900 font-medium mt-0.5">
                        {new Date((op.card_expiry || op.cscs_expiry) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card photos */}
                <div className="grid grid-cols-2 gap-3">
                  {op.card_front_url ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Front</p>
                      <button onClick={() => setLightbox(op.card_front_url)} className="relative w-full group">
                        <img src={op.card_front_url} alt="Front" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                      <p className="text-xs text-slate-400">No front photo</p>
                    </div>
                  )}
                  {op.card_back_url ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Back</p>
                      <button onClick={() => setLightbox(op.card_back_url)} className="relative w-full group">
                        <img src={op.card_back_url} alt="Back" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                      <p className="text-xs text-slate-400">No back photo</p>
                    </div>
                  )}
                </div>

                {/* CSCS Smart Check link */}
                <a href="https://www.cscs.uk.com/smartcheck" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-medium hover:bg-blue-100 transition-colors">
                  <ExternalLink size={14} />
                  Verify on CSCS Smart Check
                </a>

                {/* Current status */}
                {op.card_verified === true && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-600" />
                    <div>
                      <p className="text-sm text-green-800 font-medium">Verified</p>
                      <p className="text-xs text-green-600">by {op.card_verified_by} on {new Date(op.card_verified_at).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                )}
                {op.card_verified === false && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <XCircle size={16} className="text-red-600" />
                    <div>
                      <p className="text-sm text-red-800 font-medium">Rejected</p>
                      <p className="text-xs text-red-600">by {op.card_verified_by} on {new Date(op.card_verified_at).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button onClick={() => handleVerify(true)} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                    <CheckCircle2 size={16} /> Verify Card
                  </button>
                  <button onClick={() => handleVerify(false)} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                    <XCircle size={16} /> Reject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
