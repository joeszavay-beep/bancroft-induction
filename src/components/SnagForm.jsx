import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { offlineInsert } from '../lib/syncQueue'
import { smartCompress } from '../lib/imageCompressor'
import { toastSmart } from '../lib/offlineToast'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { Camera, Upload } from 'lucide-react'

const TRADES = ['Electrical', 'Fire Alarm', 'Sound Masking', 'Pipework', 'Ductwork', 'BMS', 'Other']
const TYPES = ['General', 'Installation', 'Commissioning', 'Design', 'Other']
const PRIORITIES = [
  { value: 'high', label: 'High (2 day fix)', days: 2 },
  { value: 'medium', label: 'Medium (5 day fix)', days: 5 },
  { value: 'low', label: 'Low (10 day fix)', days: 10 },
]

export default function SnagForm({ open, onClose, drawingId, projectId, pinX, pinY, nextNumber, operatives, onCreated }) {
  const [trade, setTrade] = useState('')
  const [type, setType] = useState('General')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState(getDueDate(5))
  const [assignedTo, setAssignedTo] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  function getDueDate(days) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  function handlePriorityChange(p) {
    setPriority(p)
    const pObj = PRIORITIES.find(pr => pr.value === p)
    if (pObj) setDueDate(getDueDate(pObj.days))
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const compressed = await smartCompress(file)
      setPhoto(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      // Fallback to original if compression fails
      setPhoto(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('Please add a description')
      return
    }
    setSaving(true)

    const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')

    const snagRecord = {
      company_id: managerData.company_id || null,
      drawing_id: drawingId,
      project_id: projectId,
      snag_number: nextNumber,
      trade: trade || null,
      type: type || null,
      description: description.trim(),
      photo_url: null,
      priority,
      due_date: dueDate,
      status: 'open',
      assigned_to: assignedTo || null,
      raised_by: managerData.name || 'PM',
      pin_x: pinX,
      pin_y: pinY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const fileUpload = photo ? {
      bucket: 'snag-photos',
      path: `${projectId}/${drawingId}/${Date.now()}.jpg`,
      blob: photo,
      contentType: photo.type,
      field: 'photo_url',
    } : undefined

    const { data, offline } = await offlineInsert('snags', snagRecord, { fileUpload })
    setSaving(false)

    if (!data) {
      toast.error('Failed to create snag')
      return
    }

    toastSmart(`Snag #${nextNumber} raised`, `Snag #${nextNumber} saved offline`, offline)
    onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title={`New Snag #${nextNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">Trade</label>
            <select value={trade} onChange={e => setTrade(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400">
              <option value="">Select trade</option>
              {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">Description *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the snag..."
            rows={3}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 resize-none"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">Photo</label>
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Snag" className="w-full h-32 object-cover rounded-lg" />
              <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null) }} className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-xs">✕</button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 w-full px-3 py-3 bg-slate-50 border border-slate-200 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
              <Camera size={16} className="text-slate-400" />
              <span className="text-sm text-slate-400">Take photo or upload</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">Priority</label>
            <select value={priority} onChange={e => handlePriorityChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400">
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400" />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">Assign To</label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400">
            <option value="">Unassigned</option>
            {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
          </select>
        </div>

        <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl">
          Raise Snag #{nextNumber}
        </LoadingButton>
      </form>
    </Modal>
  )
}
