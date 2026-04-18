import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import { formatMoney, calculateCIS } from '../lib/subcontractor'
import { FileText, Plus, X, Send, Clock, CheckCircle2, AlertTriangle, Paperclip, Image, Download } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  submitted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid' },
}

export default function OperativeInvoices() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [jobOps, setJobOps] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [isSelfEmployed, setIsSelfEmployed] = useState(false)
  const [tableExists, setTableExists] = useState(true)

  // Create form
  const [selectedJobOp, setSelectedJobOp] = useState(null)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [calculatedData, setCalculatedData] = useState(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invoiceFiles, setInvoiceFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  async function loadData(opData) {
    setLoading(true)

    // Check job_operatives for self-employed status
    const { data: joData } = await supabase
      .from('job_operatives')
      .select('*, subcontractor_jobs(id, name)')
      .eq('operative_id', opData.id)

    const joList = joData || []
    setJobOps(joList)
    const selfEmp = joList.some(jo => jo.employment_status === 'self_employed')
    setIsSelfEmployed(selfEmp)

    // Try to load invoices from operative_invoices table
    try {
      const { data: invData, error } = await supabase
        .from('operative_invoices')
        .select('*')
        .eq('operative_id', opData.id)
        .order('created_at', { ascending: false })

      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        setTableExists(false)
        setInvoices([])
      } else {
        setInvoices(invData || [])
      }
    } catch {
      setTableExists(false)
      setInvoices([])
    }

    setLoading(false)
  }

  useEffect(() => {
    const session = getSession('operative_session')
    if (!session) { navigate('/worker-login'); return }
    const data = JSON.parse(session)
    setOp(data) // eslint-disable-line react-hooks/set-state-in-effect
    loadData(data)
  }, [])

  async function calculateInvoice() {
    if (!selectedJobOp || !periodFrom || !periodTo) return
    const jo = jobOps.find(j => j.id === selectedJobOp)
    if (!jo) return

    const { data: tsData } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('operative_id', op.id)
      .eq('job_id', jo.job_id)
      .in('status', ['approved', 'reviewed', 'auto'])
      .gte('date', periodFrom)
      .lte('date', periodTo)

    const entries = tsData || []
    const gross = entries.reduce((sum, e) => sum + (e.cost_calculated || 0), 0)
    const days = entries.filter(e => (e.hours_adjusted ?? e.hours_calculated ?? 0) > 0).length
    const cisRate = jo.cis_rate || 20
    const cis = calculateCIS(gross, cisRate)
    const net = gross - cis

    setCalculatedData({ gross, cis, net, days, cisRate, entries: entries.length })
  }

  useEffect(() => {
    if (selectedJobOp && periodFrom && periodTo) calculateInvoice() // eslint-disable-line react-hooks/set-state-in-effect
    else setCalculatedData(null)
  }, [selectedJobOp, periodFrom, periodTo])

  async function uploadInvoiceFiles(invoiceId, files) {
    const uploaded = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `invoices/${invoiceId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ name: file.name, url: urlData.publicUrl, type: file.type })
      }
    }
    return uploaded
  }

  async function submitInvoice(asDraft = false) {
    if (!calculatedData || !selectedJobOp) return
    if (!tableExists) {
      toast.error('Invoice system coming soon — table not yet configured')
      return
    }

    setSubmitting(true)
    const jo = jobOps.find(j => j.id === selectedJobOp)

    // Generate reference: OP-001, OP-002 etc.
    const existingNums = invoices.map(inv => {
      const match = inv.invoice_ref?.match(/^OP-(\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    const nextNum = (existingNums.length > 0 ? Math.max(...existingNums) : 0) + 1
    const ref = `OP-${String(nextNum).padStart(3, '0')}`

    const record = {
      operative_id: op.id,
      job_id: jo.job_id,
      job_operative_id: jo.id,
      company_id: op.company_id,
      invoice_ref: ref,
      period_from: periodFrom,
      period_to: periodTo,
      gross_amount: calculatedData.gross,
      cis_deduction: calculatedData.cis,
      net_amount: calculatedData.net,
      status: asDraft ? 'draft' : 'submitted',
      submitted_at: asDraft ? null : new Date().toISOString(),
      notes: notes.trim() || null,
    }

    const { data: inserted, error } = await supabase.from('operative_invoices').insert(record).select().single()
    if (error) {
      toast.error('Failed to create invoice')
      console.error(error)
    } else {
      // Upload attachments if any
      if (invoiceFiles.length > 0) {
        setUploadingFiles(true)
        const attachments = await uploadInvoiceFiles(inserted.id, invoiceFiles)
        if (attachments.length > 0) {
          await supabase.from('operative_invoices').update({ attachments }).eq('id', inserted.id)
        }
        setUploadingFiles(false)
      }
      toast.success(asDraft ? 'Draft saved' : 'Invoice submitted')
      setShowCreate(false)
      resetForm()
      loadData(op)
    }
    setSubmitting(false)
  }

  function resetForm() {
    setSelectedJobOp(null)
    setPeriodFrom('')
    setPeriodTo('')
    setCalculatedData(null)
    setNotes('')
    setInvoiceFiles([])
  }

  if (!op) return null

  const primaryColor = op.primary_colour || '#1B6FC8'

  if (!isSelfEmployed && !loading) {
    return (
      <WorkerSidebarLayout op={op}>
        <div className="max-w-lg mx-auto py-16 text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Invoicing Not Available</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Self-service invoicing is only available for self-employed operatives. Contact your manager if you believe this is incorrect.
          </p>
        </div>
      </WorkerSidebarLayout>
    )
  }

  return (
    <WorkerSidebarLayout op={op}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>My Invoices</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create and track your invoices</p>
          </div>
          {tableExists && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white font-semibold transition-colors"
              style={{ backgroundColor: primaryColor }}>
              <Plus size={14} />
              Create Invoice
            </button>
          )}
        </div>

        {!tableExists && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Coming Soon</p>
              <p className="text-xs text-amber-600 mt-0.5">
                The invoicing system is being set up. Your company admin will enable this feature shortly.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Invoice list */}
            {invoices.length === 0 ? (
              <div className="bg-white border border-[#E2E6EA] rounded-xl p-8 text-center">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">No invoices yet</p>
                <p className="text-xs text-slate-400 mt-1">Create your first invoice to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => {
                  const style = STATUS_STYLES[inv.status] || STATUS_STYLES.draft
                  return (
                    <div key={inv.id} className="bg-white border border-[#E2E6EA] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{inv.invoice_ref}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {inv.period_from && new Date(inv.period_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' — '}
                          {inv.period_to && new Date(inv.period_to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Gross</p>
                          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatMoney(inv.gross_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">CIS</p>
                          <p className="font-bold text-red-600">-{formatMoney(inv.cis_deduction)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Net</p>
                          <p className="font-bold" style={{ color: primaryColor }}>{formatMoney(inv.net_amount)}</p>
                        </div>
                      </div>
                      {inv.notes && <p className="text-xs text-slate-400 mt-2 italic">{inv.notes}</p>}
                      {/* Attachments */}
                      {inv.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-50">
                          {inv.attachments.map((att, i) => (
                            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-blue-600 hover:border-blue-300">
                              {att.type?.startsWith('image/') ? <Image size={12} /> : <FileText size={12} />}
                              <span className="truncate max-w-[100px]">{att.name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Manager comment */}
                      {inv.manager_comment && (
                        <div className="mt-2 pt-2 border-t border-slate-50 bg-blue-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-blue-500 font-semibold mb-0.5">Manager Comment</p>
                          <p className="text-xs text-blue-800">{inv.manager_comment}</p>
                          {inv.reviewed_by && <p className="text-[10px] text-blue-400 mt-1">— {inv.reviewed_by}{inv.reviewed_at ? `, ${new Date(inv.reviewed_at).toLocaleDateString('en-GB')}` : ''}</p>}
                        </div>
                      )}
                      {inv.status === 'paid' && inv.paid_at && (
                        <p className="text-[10px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                          <CheckCircle2 size={10} /> Paid {new Date(inv.paid_at).toLocaleDateString('en-GB')}
                        </p>
                      )}
                      {inv.status === 'draft' && (
                        <button onClick={async () => {
                          const { error } = await supabase.from('operative_invoices').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', inv.id)
                          if (!error) { toast.success('Invoice submitted'); loadData(op) }
                        }} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors" style={{ backgroundColor: primaryColor }}>
                          <Send size={12} className="inline mr-1" /> Submit to Manager
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowCreate(false); resetForm() }} />
          <div className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-base font-bold text-slate-900">Create Invoice</h3>
              <button onClick={() => { setShowCreate(false); resetForm() }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Select job */}
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Job / Assignment</label>
                <select
                  value={selectedJobOp || ''}
                  onChange={e => setSelectedJobOp(e.target.value || null)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                >
                  <option value="">Select a job...</option>
                  {jobOps.filter(j => j.employment_status === 'self_employed').map(jo => (
                    <option key={jo.id} value={jo.id}>
                      {jo.subcontractor_jobs?.name || 'Job'} — {jo.trade_role || jo.pay_type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">From</label>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">To</label>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              {/* Calculated amounts */}
              {calculatedData && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calculated from {calculatedData.entries} timesheet entries ({calculatedData.days} days)</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Gross</span>
                      <span className="font-bold text-slate-900">{formatMoney(calculatedData.gross)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">CIS ({calculatedData.cisRate}%)</span>
                      <span className="font-bold text-red-600">-{formatMoney(calculatedData.cis)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200">
                      <span className="font-semibold text-slate-900">Net Amount</span>
                      <span className="font-bold text-lg" style={{ color: primaryColor }}>{formatMoney(calculatedData.net)}</span>
                    </div>
                  </div>
                  {calculatedData.gross === 0 && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                      <AlertTriangle size={12} />
                      No approved timesheet entries found for this period
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Any additional notes..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 resize-none" />
              </div>

              {/* Attachments */}
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Attachments (optional)</label>
                <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                  <Paperclip size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-500">{invoiceFiles.length ? `${invoiceFiles.length} file${invoiceFiles.length > 1 ? 's' : ''} selected` : 'Attach invoice PDF, receipts, photos...'}</span>
                  <input type="file" accept="image/*,.pdf" multiple className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      if (files.some(f => f.size > 25 * 1024 * 1024)) { toast.error('Max 25MB per file'); return }
                      setInvoiceFiles(prev => [...prev, ...files])
                    }}
                  />
                </label>
                {invoiceFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {invoiceFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                        {f.type?.startsWith('image/') ? <Image size={12} /> : <FileText size={12} />}
                        <span className="truncate max-w-[120px]">{f.name}</span>
                        <button type="button" onClick={() => setInvoiceFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => submitInvoice(true)} disabled={submitting || !calculatedData}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                  <Clock size={14} /> Save Draft
                </button>
                <button onClick={() => submitInvoice(false)} disabled={submitting || uploadingFiles || !calculatedData || calculatedData.gross === 0}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: primaryColor }}>
                  <Send size={14} /> {uploadingFiles ? 'Uploading...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkerSidebarLayout>
  )
}
