import { useState, useEffect, useRef } from 'react'
import { Pencil, Check, X, Loader2, AlertTriangle, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import AddressLookup from './AddressLookup'
import DateOfBirthPicker from './DateOfBirthPicker'
import { displayPhone } from '../lib/validators'

const CARD_TYPES = [
  { value: 'Green - Labourer', label: 'Green - Labourer' },
  { value: 'Blue - Skilled Worker', label: 'Blue - Skilled Worker' },
  { value: 'Gold - Supervisor', label: 'Gold - Supervisor' },
  { value: 'Black - Manager', label: 'Black - Manager' },
  { value: 'White - Professionally Qualified', label: 'White - Prof. Qualified' },
  { value: 'Red - Trainee', label: 'Red - Trainee' },
]

export default function InlineEditField({
  label, value, fieldKey, editable = false, type = 'text',
  dropdownOptions, onSave, validate,
  pendingEmail, onCancelPending, onResendVerification,
}) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value || '')
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setLocalValue(value || '') }, [value])
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  function formatDisplay(v) {
    if (!v) return '—'
    if (type === 'phone') return displayPhone(v)
    if (type === 'time') return v
    if (type === 'date' && v.includes('-')) {
      try { return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return v }
    }
    return v
  }

  function startEdit() {
    if (!editable || saving) return
    setLocalValue(value || '')
    setError(null)
    setWarning(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setLocalValue(value || '')
    setError(null)
    setWarning(null)
  }

  async function save() {
    const trimmed = typeof localValue === 'string' ? localValue.trim() : localValue
    // No-op if unchanged
    if (trimmed === (value || '')) { setEditing(false); return }

    // Validate
    if (validate) {
      const result = validate(trimmed)
      if (result && typeof result === 'string') { setError(result); return }
      if (result && result.warning) { setWarning(result.warning); setError(null) }
      else { setWarning(null); setError(null) }
    }

    setSaving(true)
    const result = await onSave(fieldKey, trimmed)
    setSaving(false)

    if (result?.success) {
      setEditing(false)
      toast.success('Saved', { duration: 2000 })
    } else {
      setError(result?.error || 'Couldn\'t save, try again')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  // Expired card badge
  const isExpired = type === 'date' && fieldKey === 'card_expiry' && value && new Date(value) < new Date()

  // Read-only display
  if (!editable) {
    return (
      <div className="py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {formatDisplay(value)}
          {isExpired && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Expired</span>}
        </p>
      </div>
    )
  }

  // Email with pending state
  if (type === 'email' && pendingEmail) {
    return (
      <div className="py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{value || '—'}</p>
        <div className="mt-1.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Mail size={13} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-800 font-medium">Pending — verification sent to <span className="font-semibold">{pendingEmail}</span></p>
            <div className="flex gap-3 mt-1">
              {onResendVerification && <button onClick={onResendVerification} className="text-[10px] font-semibold text-amber-700 underline">Resend</button>}
              {onCancelPending && <button onClick={onCancelPending} className="text-[10px] font-semibold text-amber-600 underline">Cancel</button>}
            </div>
          </div>
        </div>
        {!pendingEmail && editable && (
          <button onClick={startEdit} className="mt-1 text-[10px] font-medium underline" style={{ color: 'var(--primary-color)' }}>Change email</button>
        )}
      </div>
    )
  }

  // Edit mode
  if (editing) {
    return (
      <div className="py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {type === 'address' ? (
              <AddressLookup value={localValue} onChange={setLocalValue} placeholder="Start typing a postcode..." />
            ) : type === 'date' ? (
              <DateOfBirthPicker value={localValue} onChange={setLocalValue} />
            ) : type === 'time' ? (
              <input
                ref={inputRef}
                type="time"
                value={localValue}
                onChange={e => { setLocalValue(e.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm focus:outline-none focus:border-[#1B6FC8]"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
              />
            ) : type === 'dropdown' ? (
              <select value={localValue} onChange={e => setLocalValue(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm focus:outline-none focus:border-[#1B6FC8]"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
                disabled={saving}>
                <option value="">Select...</option>
                {(dropdownOptions || CARD_TYPES).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                ref={inputRef}
                type={type === 'email' ? 'email' : type === 'phone' ? 'tel' : 'text'}
                value={localValue}
                onChange={e => { setLocalValue(e.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm focus:outline-none focus:border-[#1B6FC8]"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
                placeholder={type === 'ni_number' ? 'AB123456C' : type === 'phone' ? '07XXXXXXXXX' : ''}
              />
            )}
            {error && <p className="text-[11px] text-[#DA3633] mt-1">{error}</p>}
            {warning && <p className="text-[11px] text-[#D29922] mt-1 flex items-center gap-1"><AlertTriangle size={11} /> {warning}</p>}
          </div>
          <div className="flex gap-1 pt-1.5">
            <button onClick={save} disabled={saving}
              className="p-1.5 rounded-md hover:bg-green-50 transition-colors text-green-600 disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
            <button onClick={cancel} disabled={saving}
              className="p-1.5 rounded-md hover:bg-red-50 transition-colors text-red-500 disabled:opacity-40">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Display mode with pencil
  return (
    <div className="py-2 group cursor-pointer" onClick={startEdit}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          {formatDisplay(value)}
          {isExpired && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Expired</span>}
        </p>
        <Pencil size={13} className="text-slate-300 opacity-0 group-hover:opacity-100 sm:opacity-0 transition-opacity shrink-0" style={{ touchAction: 'manipulation' }} />
      </div>
      {type === 'email' && !pendingEmail && (
        <button onClick={e => { e.stopPropagation(); startEdit() }} className="mt-0.5 text-[10px] font-medium underline" style={{ color: 'var(--primary-color)' }}>Change email</button>
      )}
    </div>
  )
}
