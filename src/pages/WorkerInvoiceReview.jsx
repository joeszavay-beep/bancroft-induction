import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import { formatMoney } from '../lib/subcontractor'
import { FileText, CheckCircle2, Clock, PoundSterling, MessageSquare, ExternalLink, Paperclip, Filter, Send } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  submitted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  changes_requested: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Changes Requested' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid' },
}

const FILTER_OPTIONS = ['all', 'submitted', 'approved', 'changes_requested', 'paid']

export default function WorkerInvoiceReview() {
  const { company } = useCompany()
  const cid = company?.id
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const managerName = managerData.name || 'Manager'

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [commentingId, setCommentingId] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    if (cid) loadInvoices()
  }, [cid])

  async function loadInvoices() {
    setLoading(true)
    const { data, error } = await supabase
      .from('operative_invoices')
      .select('*, operatives(id, name, photo_url)')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load invoices:', error)
      toast.error('Failed to load invoices')
    } else {
      setInvoices(data || [])
    }
    setLoading(false)
  }

  async function handleApprove(inv) {
    setActionLoading(inv.id)
    const { error } = await supabase
      .from('operative_invoices')
      .update({
        status: 'approved',
        reviewed_by: managerName,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to approve invoice')
    } else {
      toast.success(`Invoice ${inv.invoice_ref} approved`)
      loadInvoices()
    }
    setActionLoading(null)
  }

  async function handleRequestChanges(inv) {
    if (!commentText.trim()) {
      toast.error('Please add a comment explaining what changes are needed')
      return
    }
    setActionLoading(inv.id)
    const { error } = await supabase
      .from('operative_invoices')
      .update({
        status: 'changes_requested',
        manager_comment: commentText.trim(),
        reviewed_by: managerName,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to request changes')
    } else {
      toast.success('Changes requested')
      setCommentingId(null)
      setCommentText('')
      loadInvoices()
    }
    setActionLoading(null)
  }

  async function handleMarkPaid(inv) {
    setActionLoading(inv.id)
    const { error } = await supabase
      .from('operative_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to mark as paid')
    } else {
      toast.success(`Invoice ${inv.invoice_ref} marked as paid`)
      loadInvoices()
    }
    setActionLoading(null)
  }

  async function handleSaveComment(inv) {
    if (!commentText.trim()) return
    setActionLoading(inv.id)
    const { error } = await supabase
      .from('operative_invoices')
      .update({ manager_comment: commentText.trim() })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to save comment')
    } else {
      toast.success('Comment saved')
      setCommentingId(null)
      setCommentText('')
      loadInvoices()
    }
    setActionLoading(null)
  }

  const filtered = filter === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === filter)

  const counts = {
    all: invoices.length,
    submitted: invoices.filter(i => i.status === 'submitted').length,
    approved: invoices.filter(i => i.status === 'approved').length,
    changes_requested: invoices.filter(i => i.status === 'changes_requested').length,
    paid: invoices.filter(i => i.status === 'paid').length,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Worker Invoices</h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Review and manage operative invoice submissions</p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter size={14} style={{ color: 'var(--text-muted)' }} />
        {FILTER_OPTIONS.map(opt => {
          const style = STATUS_STYLES[opt] || { bg: 'bg-slate-100', text: 'text-slate-600', label: 'All' }
          const label = opt === 'all' ? 'All' : style.label
          const count = counts[opt] || 0
          return (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === opt
                  ? 'bg-[var(--primary-color)] text-white'
                  : 'bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
              }`}
              style={filter === opt ? { backgroundColor: 'var(--primary-color)' } : { color: 'var(--text-secondary)' }}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <FileText size={36} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No invoices found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {filter === 'all' ? 'No operative invoices have been submitted yet.' : `No invoices with status "${STATUS_STYLES[filter]?.label || filter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => {
            const style = STATUS_STYLES[inv.status] || STATUS_STYLES.draft
            const operative = inv.operatives
            const isCommenting = commentingId === inv.id
            const isBusy = actionLoading === inv.id

            return (
              <div key={inv.id} className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                {/* Top row: operative + status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {operative?.photo_url ? (
                      <img src={operative.photo_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {(operative?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {operative?.name || 'Unknown Operative'}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {inv.invoice_ref}
                        {inv.period_from && (
                          <> &middot; {new Date(inv.period_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' — '}
                          {new Date(inv.period_to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Gross</p>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatMoney(inv.gross_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>CIS</p>
                    <p className="font-bold text-red-600">-{formatMoney(inv.cis_deduction)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Net</p>
                    <p className="font-bold" style={{ color: 'var(--primary-color)' }}>{formatMoney(inv.net_amount)}</p>
                  </div>
                </div>

                {/* Attachments */}
                {inv.attachments && Array.isArray(inv.attachments) && inv.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {inv.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.url || att}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <Paperclip size={10} />
                        {att.name || `Attachment ${i + 1}`}
                        <ExternalLink size={9} />
                      </a>
                    ))}
                  </div>
                )}

                {/* Operative notes */}
                {inv.notes && (
                  <div className="text-xs italic px-3 py-2 rounded-lg mb-3" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-secondary)' }}>
                    <span className="font-medium not-italic" style={{ color: 'var(--text-muted)' }}>Note:</span> {inv.notes}
                  </div>
                )}

                {/* Manager comment */}
                {inv.manager_comment && !isCommenting && (
                  <div className="text-xs px-3 py-2 rounded-lg mb-3 bg-amber-50 border border-amber-100">
                    <span className="font-medium text-amber-700">Manager:</span>{' '}
                    <span className="text-amber-800">{inv.manager_comment}</span>
                  </div>
                )}

                {/* Paid date */}
                {inv.status === 'paid' && inv.paid_at && (
                  <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mb-3">
                    <CheckCircle2 size={12} /> Paid {new Date(inv.paid_at).toLocaleDateString('en-GB')}
                  </p>
                )}

                {/* Reviewed info */}
                {inv.reviewed_by && inv.status !== 'paid' && (
                  <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
                    Reviewed by {inv.reviewed_by} on {inv.reviewed_at ? new Date(inv.reviewed_at).toLocaleDateString('en-GB') : '—'}
                  </p>
                )}

                {/* Comment input */}
                {isCommenting && (
                  <div className="mb-3 space-y-2">
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      rows={2}
                      placeholder="Explain what changes are needed..."
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestChanges(inv)}
                        disabled={isBusy || !commentText.trim()}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold disabled:opacity-40 hover:bg-amber-600 transition-colors flex items-center gap-1"
                      >
                        <Send size={11} /> Request Changes
                      </button>
                      <button
                        onClick={() => handleSaveComment(inv)}
                        disabled={isBusy || !commentText.trim()}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition-colors"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                      >
                        Save Comment Only
                      </button>
                      <button
                        onClick={() => { setCommentingId(null); setCommentText('') }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  {inv.status === 'submitted' && (
                    <>
                      <button
                        onClick={() => handleApprove(inv)}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-40 hover:bg-green-700 transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        onClick={() => { setCommentingId(inv.id); setCommentText(inv.manager_comment || '') }}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold disabled:opacity-40 hover:bg-amber-600 transition-colors flex items-center gap-1"
                      >
                        <MessageSquare size={12} /> Request Changes
                      </button>
                      <button
                        onClick={() => handleMarkPaid(inv)}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 hover:opacity-80 transition-colors flex items-center gap-1"
                        style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}
                      >
                        <PoundSterling size={12} /> Mark as Paid
                      </button>
                    </>
                  )}
                  {inv.status === 'approved' && (
                    <button
                      onClick={() => handleMarkPaid(inv)}
                      disabled={isBusy}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 hover:opacity-80 transition-colors flex items-center gap-1"
                      style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}
                    >
                      <PoundSterling size={12} /> Mark as Paid
                    </button>
                  )}
                  {inv.status === 'changes_requested' && (
                    <button
                      onClick={() => handleApprove(inv)}
                      disabled={isBusy}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-40 hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 size={12} /> Approve
                    </button>
                  )}
                  {/* Comment button for any non-paid status */}
                  {inv.status !== 'paid' && !isCommenting && inv.status !== 'submitted' && (
                    <button
                      onClick={() => { setCommentingId(inv.id); setCommentText(inv.manager_comment || '') }}
                      disabled={isBusy}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                      style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                    >
                      <MessageSquare size={12} /> {inv.manager_comment ? 'Edit Comment' : 'Add Comment'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
