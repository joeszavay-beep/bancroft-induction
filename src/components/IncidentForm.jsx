import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { todayDateStr, isFuture } from '../lib/dates'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import { AlertTriangle, X, Upload, Loader2 } from 'lucide-react'

const INCIDENT_TYPES = [
  { value: 'near_miss', label: 'Near Miss' },
  { value: 'first_aid', label: 'First Aid' },
  { value: 'reportable', label: 'Reportable (RIDDOR)' },
  { value: 'dangerous_occurrence', label: 'Dangerous Occurrence' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'other', label: 'Other' },
]

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const SEVERITY_COLOURS = {
  low: '#2EA043',
  medium: '#D29922',
  high: '#DC2626',
}


export default function IncidentForm({ projects, projectId, onClose, onSaved }) {
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const cid = managerData.company_id

  const [selectedProject, setSelectedProject] = useState(projectId || '')
  const [incidentDate, setIncidentDate] = useState(todayDateStr())
  const [incidentType, setIncidentType] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // Pre-select project if projectId changes
  useEffect(() => {
    if (projectId) setSelectedProject(projectId)
  }, [projectId])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    setPhoto(null)
    setPhotoPreview(null)
  }

  function validate() {
    const errs = {}
    if (!selectedProject) errs.project = 'Please select a project'
    if (!incidentDate) errs.date = 'Date is required'
    if (incidentDate && isFuture(incidentDate)) errs.date = 'Date cannot be in the future'
    if (!incidentType) errs.type = 'Please select an incident type'
    if (!description.trim()) errs.description = 'Description is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    try {
      let photoUrl = null

      // Upload photo if provided
      if (photo) {
        const fileExt = 'jpg'
        const filePath = `incidents/${cid}/${crypto.randomUUID()}.${fileExt}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, photo, { contentType: photo.type })

        if (uploadError) {
          console.error('Photo upload failed:', uploadError)
          toast.error('Photo upload failed, saving without photo')
        } else {
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(filePath)
          photoUrl = urlData?.publicUrl || null
        }
      }

      // Insert into incidents table
      const { data: incidentData, error: incidentError } = await supabase
        .from('incidents')
        .insert({
          company_id: cid,
          project_id: selectedProject,
          incident_date: incidentDate,
          incident_type: incidentType,
          severity,
          description: description.trim(),
          reported_by: managerData.name || 'Unknown',
          reported_by_id: managerData.id || null,
          photo_url: photoUrl,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (incidentError) {
        console.error('Insert error:', incidentError)
        toast.error('Failed to save incident')
        setSaving(false)
        return
      }

      // Insert into activity_feed
      await supabase.from('activity_feed').insert({
        company_id: cid,
        project_id: selectedProject,
        event_type: 'incident',
        title: 'Incident reported',
        description: `${INCIDENT_TYPES.find(t => t.value === incidentType)?.label || incidentType} - ${severity} severity`,
        actor_name: managerData.name || 'Unknown',
        link: '/app/observations',
        created_at: new Date().toISOString(),
      })

      toast.success('Incident logged successfully')
      if (onSaved) onSaved()
      if (onClose) onClose()
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const projectName = projects?.find(p => p.id === selectedProject)?.name

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-500" />
            </div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Log Incident
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Project */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Project *
            </label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8]/30 focus:border-[#1B6FC8]"
              style={{ color: 'var(--text-primary)', borderColor: errors.project ? '#DC2626' : 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
            >
              <option value="">Select a project</option>
              {(projects || []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.project && <p className="text-[11px] text-red-500 mt-1">{errors.project}</p>}
          </div>

          {/* Date and Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Date *
              </label>
              <input
                type="date"
                value={incidentDate}
                onChange={e => setIncidentDate(e.target.value)}
                max={todayDateStr()}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8]/30 focus:border-[#1B6FC8]"
                style={{ color: 'var(--text-primary)', borderColor: errors.date ? '#DC2626' : 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
              />
              {errors.date && <p className="text-[11px] text-red-500 mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Type *
              </label>
              <select
                value={incidentType}
                onChange={e => setIncidentType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8]/30 focus:border-[#1B6FC8]"
                style={{ color: 'var(--text-primary)', borderColor: errors.type ? '#DC2626' : 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
              >
                <option value="">Select type</option>
                {INCIDENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {errors.type && <p className="text-[11px] text-red-500 mt-1">{errors.type}</p>}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Severity
            </label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                    severity === s.value ? 'text-white' : ''
                  }`}
                  style={{
                    backgroundColor: severity === s.value ? SEVERITY_COLOURS[s.value] : 'transparent',
                    borderColor: severity === s.value ? SEVERITY_COLOURS[s.value] : 'var(--border-color)',
                    color: severity === s.value ? '#FFFFFF' : 'var(--text-primary)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Description *
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what happened, where, and any immediate actions taken..."
              rows={4}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8]/30 focus:border-[#1B6FC8] resize-none"
              style={{
                color: 'var(--text-primary)',
                borderColor: errors.description ? '#DC2626' : 'var(--border-color)',
                backgroundColor: 'var(--bg-card)',
              }}
            />
            {errors.description && <p className="text-[11px] text-red-500 mt-1">{errors.description}</p>}
          </div>

          {/* Photo upload */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Photo (optional)
            </label>
            {photoPreview ? (
              <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
                <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-3 py-4 border border-dashed rounded-lg cursor-pointer hover:bg-black/[0.02] transition-colors"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
              >
                <Upload size={16} />
                <span className="text-xs font-medium">Upload photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border rounded-lg text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving...' : 'Log Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
