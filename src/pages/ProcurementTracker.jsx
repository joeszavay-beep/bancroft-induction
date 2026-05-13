import { useState, useEffect, useMemo } from 'react'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import { authFetch } from '../lib/authFetch'
import { getSession } from '../lib/storage'
import { calculateRisk, RISK_COLORS, STATUS_LABELS, STATUS_COLORS, calculateOrderByDate } from '../lib/procurementRisk'
import { formatDateWithDay } from '../lib/programmeCalc'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import { Package, Plus, Search, Filter, Download, Pencil, Trash2, ChevronDown, FolderOpen, AlertTriangle, Check, X, Truck, FileText } from 'lucide-react'

// ── Helpers ──

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function formatMoney(v) {
  if (v == null || v === '') return '--'
  return '\u00A3' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function truncate(str, len = 40) {
  if (!str) return '--'
  return str.length > len ? str.slice(0, len) + '...' : str
}

// ── Status filter options ──
const ALL_STATUSES = Object.keys(STATUS_LABELS)

// ── Category presets (server may return more) ──
const CATEGORY_OPTIONS = [
  'Structural Steel',
  'Mechanical',
  'Electrical',
  'Plumbing',
  'Facades',
  'Finishes',
  'Fixtures & Fittings',
  'Plant & Equipment',
  'Specialist',
  'Other',
]

export default function ProcurementTracker() {
  const { user } = useCompany()
  const { projectId, projectName } = useProject()
  const cid = user?.company_id

  // ── Data state ──
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ red: 0, amber: 0, green: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [programmeTasks, setProgrammeTasks] = useState([])

  // ── Filter state ──
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // ── Add/Edit item modal ──
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState({
    description: '',
    category: '',
    specification: '',
    quantity: '',
    unit: '',
    linked_task_id: '',
    required_by_date: '',
    lead_time_weeks: '',
    budget_cost: '',
    notes: '',
  })
  const [savingItem, setSavingItem] = useState(false)

  // ── Detail modal ──
  const [detailItem, setDetailItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ── Quote form within detail ──
  const [quoteForm, setQuoteForm] = useState({ supplier_name: '', quoted_price: '', lead_time_weeks: '', notes: '' })
  const [savingQuote, setSavingQuote] = useState(false)

  // ── Invoice form within detail ──
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: '', amount: '', date: todayISO(), notes: '' })
  const [savingInvoice, setSavingInvoice] = useState(false)

  // ── PO form within detail ──
  const [poForm, setPoForm] = useState({ po_number: '', po_date: todayISO() })
  const [savingPO, setSavingPO] = useState(false)

  // ── Mark as Received modal within detail ──
  const [showReceivedModal, setShowReceivedModal] = useState(false)
  const [receivedForm, setReceivedForm] = useState({ condition: 'good', delivery_notes: '' })
  const [savingReceived, setSavingReceived] = useState(false)

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Data loading ──
  async function loadSummary() {
    if (!projectId) return
    try {
      const res = await authFetch(`/api/procurement?action=summary&projectId=${projectId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSummary({
        red: data.red || 0,
        amber: data.amber || 0,
        green: data.green || 0,
        total: data.total || 0,
      })
    } catch (err) {
      console.error('Failed to load procurement summary:', err)
    }
  }

  async function loadItems() {
    if (!projectId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: 'items', projectId })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (riskFilter !== 'all') params.set('risk', riskFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (searchTerm.trim()) params.set('search', searchTerm.trim())

      const res = await authFetch(`/api/procurement?${params.toString()}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(data.items || [])
    } catch (err) {
      console.error('Failed to load procurement items:', err)
      toast.error('Failed to load items')
    }
    setLoading(false)
  }

  async function loadProgrammeTasks() {
    if (!projectId) return
    try {
      const res = await authFetch(`/api/programme-calc?action=tasks&projectId=${projectId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setProgrammeTasks(data.tasks || [])
    } catch (err) {
      console.error('Failed to load programme tasks:', err)
    }
  }

  useEffect(() => {
    if (projectId) {
      loadSummary()
      loadItems()
      loadProgrammeTasks()
    } else {
      setItems([])
      setSummary({ red: 0, amber: 0, green: 0, total: 0 })
      setProgrammeTasks([])
    }
  }, [projectId])

  // Reload items when filters change
  useEffect(() => {
    if (projectId) loadItems()
  }, [statusFilter, riskFilter, categoryFilter, searchTerm])

  // ── Derived: unique categories from items ──
  const categories = useMemo(() => {
    const cats = new Set(CATEGORY_OPTIONS)
    for (const item of items) {
      if (item.category) cats.add(item.category)
    }
    return [...cats].sort()
  }, [items])

  // ── Add/Edit item ──
  function openAddItem() {
    setEditingItem(null)
    setItemForm({
      description: '',
      category: '',
      specification: '',
      quantity: '',
      unit: '',
      linked_task_id: '',
      required_by_date: '',
      lead_time_weeks: '',
      budget_cost: '',
      notes: '',
    })
    setItemModalOpen(true)
  }

  function openEditItem(item) {
    setEditingItem(item)
    setItemForm({
      description: item.description || '',
      category: item.category || '',
      specification: item.specification || '',
      quantity: item.quantity ?? '',
      unit: item.unit || '',
      linked_task_id: item.linked_task_id || '',
      required_by_date: item.required_by_date || '',
      lead_time_weeks: item.lead_time_weeks ?? '',
      budget_cost: item.budget_cost ?? '',
      notes: item.notes || '',
    })
    setItemModalOpen(true)
  }

  function handleTaskLink(taskId) {
    const task = programmeTasks.find(t => t.id === taskId)
    if (task && task.start_date) {
      setItemForm(f => ({
        ...f,
        linked_task_id: taskId,
        required_by_date: task.start_date,
      }))
    } else {
      setItemForm(f => ({ ...f, linked_task_id: taskId }))
    }
  }

  async function handleSaveItem() {
    if (!itemForm.description.trim()) {
      toast.error('Description is required')
      return
    }
    setSavingItem(true)
    try {
      const method = editingItem ? 'PATCH' : 'POST'
      const body = {
        projectId,
        ...itemForm,
        quantity: itemForm.quantity !== '' ? Number(itemForm.quantity) : null,
        lead_time_weeks: itemForm.lead_time_weeks !== '' ? Number(itemForm.lead_time_weeks) : null,
        budget_cost: itemForm.budget_cost !== '' ? Number(itemForm.budget_cost) : null,
        ...(editingItem ? { id: editingItem.id } : {}),
      }
      const res = await authFetch('/api/procurement?action=item', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(editingItem ? 'Item updated' : 'Item created')
      setItemModalOpen(false)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to save item')
    }
    setSavingItem(false)
  }

  // ── Delete item ──
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/procurement?action=item&id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Item deleted')
      setDeleteTarget(null)
      if (detailItem?.id === deleteTarget.id) setDetailItem(null)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to delete item')
    }
    setDeleting(false)
  }

  // ── Item detail ──
  async function openDetail(item) {
    setDetailItem(item)
    setDetailLoading(true)
    // Reset forms
    setQuoteForm({ supplier_name: '', quoted_price: '', lead_time_weeks: '', notes: '' })
    setInvoiceForm({ invoice_number: '', amount: '', date: todayISO(), notes: '' })
    setPoForm({ po_number: item.po_number || '', po_date: item.po_date || todayISO() })
    setShowReceivedModal(false)
    setReceivedForm({ condition: 'good', delivery_notes: '' })
    try {
      const res = await authFetch(`/api/procurement?action=detail&id=${item.id}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDetailItem(data.item || item)
    } catch (err) {
      console.error('Failed to load item detail:', err)
    }
    setDetailLoading(false)
  }

  // ── Quotes ──
  async function handleAddQuote() {
    if (!quoteForm.supplier_name.trim() || !quoteForm.quoted_price) {
      toast.error('Supplier and price are required')
      return
    }
    setSavingQuote(true)
    try {
      const res = await authFetch('/api/procurement?action=quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: detailItem.id,
          supplier_name: quoteForm.supplier_name.trim(),
          quoted_price: Number(quoteForm.quoted_price),
          lead_time_weeks: quoteForm.lead_time_weeks ? Number(quoteForm.lead_time_weeks) : null,
          notes: quoteForm.notes,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Quote added')
      setQuoteForm({ supplier_name: '', quoted_price: '', lead_time_weeks: '', notes: '' })
      await openDetail(detailItem)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to add quote')
    }
    setSavingQuote(false)
  }

  async function handleSelectQuote(quoteId) {
    try {
      const res = await authFetch('/api/procurement?action=select-quote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: detailItem.id, quoteId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Quote selected')
      await openDetail(detailItem)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to select quote')
    }
  }

  // ── PO ──
  async function handleSavePO() {
    if (!poForm.po_number.trim()) {
      toast.error('PO number is required')
      return
    }
    setSavingPO(true)
    try {
      const res = await authFetch('/api/procurement?action=po', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: detailItem.id,
          po_number: poForm.po_number.trim(),
          po_date: poForm.po_date || todayISO(),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('PO saved')
      await openDetail(detailItem)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to save PO')
    }
    setSavingPO(false)
  }

  // ── Mark as Received ──
  async function handleMarkReceived() {
    setSavingReceived(true)
    try {
      const res = await authFetch('/api/procurement?action=mark-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: detailItem.id,
          condition: receivedForm.condition,
          delivery_notes: receivedForm.delivery_notes,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Marked as received')
      setShowReceivedModal(false)
      await openDetail(detailItem)
      await Promise.all([loadItems(), loadSummary()])
    } catch (err) {
      toast.error(err.message || 'Failed to mark as received')
    }
    setSavingReceived(false)
  }

  // ── Invoices ──
  async function handleAddInvoice() {
    if (!invoiceForm.amount) {
      toast.error('Amount is required')
      return
    }
    setSavingInvoice(true)
    try {
      const res = await authFetch('/api/procurement?action=invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: detailItem.id,
          invoice_number: invoiceForm.invoice_number.trim(),
          amount: Number(invoiceForm.amount),
          date: invoiceForm.date || todayISO(),
          notes: invoiceForm.notes,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Invoice added')
      setInvoiceForm({ invoice_number: '', amount: '', date: todayISO(), notes: '' })
      await openDetail(detailItem)
    } catch (err) {
      toast.error(err.message || 'Failed to add invoice')
    }
    setSavingInvoice(false)
  }

  // ── Export CSV ──
  async function handleExportCSV() {
    try {
      const res = await authFetch(`/api/procurement?action=export&projectId=${projectId}&format=csv`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `procurement-${projectName || 'export'}-${todayISO()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV')
    }
  }

  // ── Risk pill component ──
  function RiskPill({ item }) {
    const risk = calculateRisk(item)
    const colors = RISK_COLORS[risk.level] || RISK_COLORS.grey
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
        {risk.label}
      </span>
    )
  }

  function StatusPill({ status }) {
    const label = STATUS_LABELS[status] || status
    const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
    )
  }

  // ── Detail modal helpers ──
  const detailRisk = detailItem ? calculateRisk(detailItem) : null
  const detailQuotes = detailItem?.quotes || []
  const detailInvoices = detailItem?.invoices || []
  const selectedQuote = detailQuotes.find(q => q.id === detailItem?.selected_quote_id)

  const budgetCost = detailItem?.budget_cost ? Number(detailItem.budget_cost) : null
  const quotedCost = selectedQuote?.quoted_price ? Number(selectedQuote.quoted_price) : null
  const invoicedTotal = detailInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0)

  function variancePercent(actual, budget) {
    if (!budget || !actual) return null
    return ((actual - budget) / budget * 100).toFixed(1)
  }

  // ── No project selected ──
  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">Select a project</p>
        <p className="text-xs mt-1">Choose a project from the sidebar to use the Procurement Tracker</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'var(--primary-color)', color: '#fff' }}>
            <Package size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Procurement Tracker</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{projectName || 'Project'}</p>
          </div>
        </div>

        {/* Risk summary pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#DA3633' }} />
            Red: {summary.red}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D29922' }} />
            Amber: {summary.amber}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2EA043' }} />
            Green: {summary.green}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--border-color)', color: 'var(--text-muted)' }}>
            Total: {summary.total}
          </span>
        </div>
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Statuses</option>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Risk filter */}
          <div className="relative">
            <select
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Risk</option>
              <option value="red">Red</option>
              <option value="amber">Amber</option>
              <option value="green">Green</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Category filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Add Item */}
          <button
            onClick={openAddItem}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--primary-color)' }}
          >
            <Plus size={15} /> Add Item
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* ─── Items Table ─── */}
      <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-current border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color: 'var(--text-muted)' }}>
            <Package size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">No procurement items</p>
            <p className="text-xs mt-1">Add your first item to start tracking procurement</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
                  <th className="px-3 py-2.5 text-left">Risk</th>
                  <th className="px-3 py-2.5 text-left">Item #</th>
                  <th className="px-3 py-2.5 text-left">Description</th>
                  <th className="px-3 py-2.5 text-left hidden md:table-cell">Qty</th>
                  <th className="px-3 py-2.5 text-left hidden lg:table-cell">Required By</th>
                  <th className="px-3 py-2.5 text-left hidden lg:table-cell">Order By</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left hidden md:table-cell">Supplier</th>
                  <th className="px-3 py-2.5 text-left hidden md:table-cell">PO #</th>
                  <th className="px-2 py-2.5 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const supplierName = item.selected_quote?.supplier_name || (item.quotes || []).find(q => q.id === item.selected_quote_id)?.supplier_name
                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--border-color)' }}
                      onClick={() => openDetail(item)}
                    >
                      <td className="px-3 py-2.5"><RiskPill item={item} /></td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{item.item_number || '--'}</td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{truncate(item.description)}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell" style={{ color: 'var(--text-primary)' }}>
                        {item.quantity != null ? `${item.quantity} ${item.unit || ''}`.trim() : '--'}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-xs" style={{ color: 'var(--text-primary)' }}>
                        {formatDateWithDay(item.required_by_date) || '--'}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-xs" style={{ color: 'var(--text-primary)' }}>
                        {formatDateWithDay(item.order_by_date) || '--'}
                      </td>
                      <td className="px-3 py-2.5"><StatusPill status={item.status} /></td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>
                        {supplierName || '\u2014'}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {item.po_number || '\u2014'}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => openEditItem(item)}
                            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Add/Edit Item Modal ─── */}
      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title={editingItem ? 'Edit Item' : 'Add Procurement Item'}>
        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Description *</label>
            <input
              type="text"
              value={itemForm.description}
              onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Structural steelwork - Level 2"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Category</label>
            <select
              value={itemForm.category}
              onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            >
              <option value="">Select category...</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Specification */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Specification</label>
            <textarea
              value={itemForm.specification}
              onChange={e => setItemForm(f => ({ ...f, specification: e.target.value }))}
              placeholder="Technical specification, sizes, grades..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Qty + Unit */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={itemForm.quantity}
                onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Unit</label>
              <input
                type="text"
                value={itemForm.unit}
                onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="e.g. tonnes, nr, m"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
              />
            </div>
          </div>

          {/* Linked Programme Task */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Linked Programme Task</label>
            <select
              value={itemForm.linked_task_id}
              onChange={e => handleTaskLink(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            >
              <option value="">None</option>
              {programmeTasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.start_date ? ` (${formatDateWithDay(t.start_date)})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Required By Date */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Required By Date</label>
            <input
              type="date"
              value={itemForm.required_by_date}
              onChange={e => setItemForm(f => ({ ...f, required_by_date: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
            {itemForm.linked_task_id && itemForm.required_by_date && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Auto-filled from linked task start date</p>
            )}
          </div>

          {/* Lead Time */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Lead Time (weeks)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={itemForm.lead_time_weeks}
              onChange={e => setItemForm(f => ({ ...f, lead_time_weeks: e.target.value }))}
              placeholder="e.g. 8"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
            {itemForm.required_by_date && itemForm.lead_time_weeks && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Order by: {formatDateWithDay(calculateOrderByDate(itemForm.required_by_date, Number(itemForm.lead_time_weeks)))}
              </p>
            )}
          </div>

          {/* Budget Cost */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Budget Cost (\u00A3)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemForm.budget_cost}
              onChange={e => setItemForm(f => ({ ...f, budget_cost: e.target.value }))}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Notes</label>
            <textarea
              value={itemForm.notes}
              onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
            />
          </div>

          {/* Save */}
          <LoadingButton
            loading={savingItem}
            onClick={handleSaveItem}
            className="w-full text-sm text-white mt-2"
            style={{ background: 'var(--primary-color)' }}
          >
            {editingItem ? 'Update Item' : 'Create Item'}
          </LoadingButton>
        </div>
      </Modal>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Item">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Are you sure you want to delete <strong>{deleteTarget?.item_number}</strong> &mdash; {truncate(deleteTarget?.description, 60)}? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-black/[0.02]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <LoadingButton
              loading={deleting}
              onClick={handleDelete}
              className="flex-1 text-sm text-white bg-red-500 hover:bg-red-600"
            >
              Delete
            </LoadingButton>
          </div>
        </div>
      </Modal>

      {/* ─── Item Detail Modal ─── */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
          <div
            className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl pb-6 sm:pb-0"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl sm:rounded-t-xl">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>{detailItem.item_number}</span>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Item Detail</h3>
              </div>
              <button onClick={() => setDetailItem(null)} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-current border-t-transparent" />
              </div>
            ) : (
              <div className="p-4 space-y-5">
                {/* ── Overview Section ── */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Overview</h4>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {detailRisk && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_COLORS[detailRisk.level]?.bg} ${RISK_COLORS[detailRisk.level]?.text}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS[detailRisk.level]?.dot }} />
                        {detailRisk.label}
                      </span>
                    )}
                    <StatusPill status={detailItem.status} />
                    {detailRisk?.reason && (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{detailRisk.reason}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Description</p>
                      <p style={{ color: 'var(--text-primary)' }}>{detailItem.description || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Category</p>
                      <p style={{ color: 'var(--text-primary)' }}>{detailItem.category || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Quantity</p>
                      <p style={{ color: 'var(--text-primary)' }}>{detailItem.quantity != null ? `${detailItem.quantity} ${detailItem.unit || ''}`.trim() : '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Budget Cost</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatMoney(detailItem.budget_cost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Required By</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(detailItem.required_by_date) || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Order By</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(detailItem.order_by_date) || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Lead Time</p>
                      <p style={{ color: 'var(--text-primary)' }}>{detailItem.lead_time_weeks ? `${detailItem.lead_time_weeks} weeks` : '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Linked Task</p>
                      <p style={{ color: 'var(--text-primary)' }}>{programmeTasks.find(t => t.id === detailItem.linked_task_id)?.name || '--'}</p>
                    </div>
                  </div>
                  {detailItem.specification && (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Specification</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{detailItem.specification}</p>
                    </div>
                  )}
                  {detailItem.notes && (
                    <div className="mt-2">
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Notes</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{detailItem.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Quotes Section ── */}
                <div className="border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Quotes</h4>

                  {detailQuotes.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: 'var(--border-color)' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                            <th className="px-3 py-2 text-left w-8"></th>
                            <th className="px-3 py-2 text-left">Supplier</th>
                            <th className="px-3 py-2 text-right">Price</th>
                            <th className="px-3 py-2 text-right">Lead Time</th>
                            <th className="px-3 py-2 text-right">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailQuotes.map(q => {
                            const isSelected = q.id === detailItem.selected_quote_id
                            const lowestPrice = Math.min(...detailQuotes.map(qq => Number(qq.quoted_price)))
                            const pctVsLowest = detailQuotes.length > 1
                              ? ((Number(q.quoted_price) - lowestPrice) / lowestPrice * 100).toFixed(1)
                              : null
                            return (
                              <tr key={q.id} className="border-t" style={{ borderColor: 'var(--border-color)', background: isSelected ? 'rgba(46,160,67,0.06)' : 'transparent' }}>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="radio"
                                    name="selectedQuote"
                                    checked={isSelected}
                                    onChange={() => handleSelectQuote(q.id)}
                                    className="accent-current"
                                    style={{ accentColor: 'var(--primary-color)' }}
                                  />
                                </td>
                                <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {q.supplier_name}
                                  {isSelected && <span className="ml-2 text-[10px] font-semibold text-emerald-600">SELECTED</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{formatMoney(q.quoted_price)}</td>
                                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-muted)' }}>{q.lead_time_weeks ? `${q.lead_time_weeks}w` : '--'}</td>
                                <td className="px-3 py-2 text-right">
                                  {pctVsLowest !== null && Number(pctVsLowest) > 0 ? (
                                    <span className="text-xs text-amber-600">+{pctVsLowest}%</span>
                                  ) : pctVsLowest !== null ? (
                                    <span className="text-xs text-emerald-600">Lowest</span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>--</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>No quotes yet</p>
                  )}

                  {/* Add Quote form */}
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Add Quote</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Supplier name"
                        value={quoteForm.supplier_name}
                        onChange={e => setQuoteForm(f => ({ ...f, supplier_name: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="number"
                        placeholder="Price (\u00A3)"
                        min="0"
                        step="0.01"
                        value={quoteForm.quoted_price}
                        onChange={e => setQuoteForm(f => ({ ...f, quoted_price: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="number"
                        placeholder="Lead time (weeks)"
                        min="0"
                        value={quoteForm.lead_time_weeks}
                        onChange={e => setQuoteForm(f => ({ ...f, lead_time_weeks: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="text"
                        placeholder="Notes"
                        value={quoteForm.notes}
                        onChange={e => setQuoteForm(f => ({ ...f, notes: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                    </div>
                    <LoadingButton
                      loading={savingQuote}
                      onClick={handleAddQuote}
                      className="text-xs text-white"
                      style={{ background: 'var(--primary-color)' }}
                    >
                      <Plus size={13} /> Add Quote
                    </LoadingButton>
                  </div>
                </div>

                {/* ── PO & Delivery Section ── */}
                <div className="border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>PO & Delivery</h4>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>PO Number</p>
                      <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{detailItem.po_number || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>PO Date</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(detailItem.po_date) || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Delivery Scheduled</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(detailItem.delivery_scheduled_date) || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Received Date</p>
                      <p style={{ color: 'var(--text-primary)' }}>{formatDateWithDay(detailItem.delivery_received_date) || '--'}</p>
                    </div>
                  </div>

                  {/* PO form (if no PO yet) */}
                  {!detailItem.po_number && (
                    <div className="rounded-lg border p-3 space-y-2 mb-3" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Raise PO</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="PO Number"
                          value={poForm.po_number}
                          onChange={e => setPoForm(f => ({ ...f, po_number: e.target.value }))}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border text-sm"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                        />
                        <input
                          type="date"
                          value={poForm.po_date}
                          onChange={e => setPoForm(f => ({ ...f, po_date: e.target.value }))}
                          className="px-2.5 py-1.5 rounded-lg border text-sm"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                        />
                      </div>
                      <LoadingButton
                        loading={savingPO}
                        onClick={handleSavePO}
                        className="text-xs text-white"
                        style={{ background: 'var(--primary-color)' }}
                      >
                        <FileText size={13} /> Save PO
                      </LoadingButton>
                    </div>
                  )}

                  {/* Mark as Received button */}
                  {detailItem.status !== 'received' && detailItem.status !== 'cancelled' && (
                    <button
                      onClick={() => setShowReceivedModal(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                      style={{ background: '#2EA043' }}
                    >
                      <Truck size={15} /> Mark as Received
                    </button>
                  )}

                  {/* Mark as Received sub-modal */}
                  {showReceivedModal && (
                    <div className="mt-3 rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Delivery Condition</p>
                      <div className="space-y-1.5">
                        {['good', 'damaged', 'partial', 'rejected'].map(c => (
                          <label key={c} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="deliveryCondition"
                              value={c}
                              checked={receivedForm.condition === c}
                              onChange={() => setReceivedForm(f => ({ ...f, condition: c }))}
                              className="accent-current"
                              style={{ accentColor: 'var(--primary-color)' }}
                            />
                            <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{c}</span>
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Delivery Notes</label>
                        <textarea
                          value={receivedForm.delivery_notes}
                          onChange={e => setReceivedForm(f => ({ ...f, delivery_notes: e.target.value }))}
                          placeholder="Any notes about the delivery..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowReceivedModal(false)}
                          className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          Cancel
                        </button>
                        <LoadingButton
                          loading={savingReceived}
                          onClick={handleMarkReceived}
                          className="flex-1 text-sm text-white"
                          style={{ background: '#2EA043' }}
                        >
                          <Check size={14} /> Confirm Received
                        </LoadingButton>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Cost Variance Section ── */}
                <div className="border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Cost Variance</h4>

                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Budget</p>
                      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(budgetCost)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Quoted</p>
                      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(quotedCost)}</p>
                      {(() => {
                        const v = variancePercent(quotedCost, budgetCost)
                        if (v === null) return null
                        return (
                          <p className={`text-[11px] font-semibold ${Number(v) > 0 ? 'text-red-600' : Number(v) < 0 ? 'text-emerald-600' : ''}`}>
                            {Number(v) > 0 ? '+' : ''}{v}%
                          </p>
                        )
                      })()}
                    </div>
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Invoiced</p>
                      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(invoicedTotal || null)}</p>
                      {(() => {
                        const v = variancePercent(invoicedTotal, budgetCost)
                        if (v === null || invoicedTotal === 0) return null
                        return (
                          <p className={`text-[11px] font-semibold ${Number(v) > 0 ? 'text-red-600' : Number(v) < 0 ? 'text-emerald-600' : ''}`}>
                            {Number(v) > 0 ? '+' : ''}{v}%
                          </p>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Invoices list */}
                  {detailInvoices.length > 0 && (
                    <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: 'var(--border-color)' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                            <th className="px-3 py-2 text-left">Invoice #</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                            <th className="px-3 py-2 text-left">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailInvoices.map(inv => (
                            <tr key={inv.id} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                              <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{inv.invoice_number || '--'}</td>
                              <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{formatMoney(inv.amount)}</td>
                              <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateWithDay(inv.date) || '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add Invoice form */}
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Add Invoice</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Invoice #"
                        value={invoiceForm.invoice_number}
                        onChange={e => setInvoiceForm(f => ({ ...f, invoice_number: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="number"
                        placeholder="Amount (\u00A3)"
                        min="0"
                        step="0.01"
                        value={invoiceForm.amount}
                        onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="date"
                        value={invoiceForm.date}
                        onChange={e => setInvoiceForm(f => ({ ...f, date: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                      <input
                        type="text"
                        placeholder="Notes"
                        value={invoiceForm.notes}
                        onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                      />
                    </div>
                    <LoadingButton
                      loading={savingInvoice}
                      onClick={handleAddInvoice}
                      className="text-xs text-white"
                      style={{ background: 'var(--primary-color)' }}
                    >
                      <Plus size={13} /> Add Invoice
                    </LoadingButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
