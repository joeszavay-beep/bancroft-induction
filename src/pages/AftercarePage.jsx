import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Send, Camera, CheckCircle2, AlertTriangle, Clock, ArrowLeft } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'
import toast from 'react-hot-toast'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function StatusBadge({ status }) {
  const styles = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600',
  }
  const icons = {
    open: <Clock size={12} />,
    in_progress: <AlertTriangle size={12} />,
    resolved: <CheckCircle2 size={12} />,
    closed: <CheckCircle2 size={12} />,
  }
  const label = (status || 'open').replace('_', ' ')
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status] || styles.open}`}>
      {icons[status] || icons.open}
      {label}
    </span>
  )
}

const initialForm = {
  reported_by: '',
  email: '',
  phone: '',
  unit_ref: '',
  location: '',
  description: '',
  priority: 'medium',
}

export default function AftercarePage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [previousDefects, setPreviousDefects] = useState([])

  // Fetch project info
  useEffect(() => {
    async function fetchProject() {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (error) {
        toast.error('Project not found')
      } else {
        setProject(data)
      }
      setLoading(false)
    }
    fetchProject()
  }, [projectId])

  // Fetch previously submitted defects by email
  useEffect(() => {
    if (!form.email || !projectId) return

    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('aftercare_defects')
        .select('*')
        .eq('project_id', projectId)
        .eq('email', form.email)
        .order('created_at', { ascending: false })

      if (data) setPreviousDefects(data)
    }, 500)

    return () => clearTimeout(timeout)
  }, [form.email, projectId, submitted])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.reported_by.trim()) {
      toast.error('Please enter your name')
      return
    }
    if (!form.description.trim()) {
      toast.error('Please describe the defect')
      return
    }

    setSubmitting(true)
    try {
      let photo_url = null

      // Upload photo if provided
      if (photo) {
        const timestamp = Date.now()
        const path = `aftercare/${projectId}/${timestamp}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('snag-photos')
          .upload(path, photo, { contentType: photo.type })

        if (uploadError) {
          toast.error('Photo upload failed')
          setSubmitting(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('snag-photos')
          .getPublicUrl(path)

        photo_url = urlData?.publicUrl || null
      }

      const { data, error } = await supabase
        .from('aftercare_defects')
        .insert({
          company_id: project.company_id,
          project_id: projectId,
          reported_by: form.reported_by.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          unit_ref: form.unit_ref.trim() || null,
          location: form.location.trim() || null,
          description: form.description.trim(),
          photo_url,
          priority: form.priority,
          status: 'open',
        })
        .select()
        .single()

      if (error) throw error

      setSubmitted(data)
      toast.success('Defect reported successfully')
    } catch (err) {
      console.error('Submit error:', err)
      toast.error('Failed to submit defect. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setSubmitted(null)
    setForm(initialForm)
    setPhoto(null)
    setPhotoPreview(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Project Not Found</h1>
          <p className="text-gray-500">This aftercare link may be invalid or expired.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#1B6FC8] text-white px-4 py-4">
        <div className="max-w-lg mx-auto">
          <p className="text-sm font-light tracking-widest">
            CORE<span className="font-bold">SITE</span>
          </p>
          <h1 className="text-lg font-semibold mt-1">{project.name}</h1>
          <p className="text-sm text-blue-100">Aftercare Defect Portal</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Success screen */}
        {submitted ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Defect Reported Successfully
            </h2>
            <p className="text-gray-600 mb-1">
              Reference: <span className="font-mono font-bold text-[#1B6FC8]">{submitted.id?.slice(0, 8)}</span>
            </p>
            <p className="text-gray-500 text-sm mb-8">
              We'll be in touch.
            </p>
            <button
              onClick={resetForm}
              className="inline-flex items-center gap-2 text-[#1B6FC8] font-medium hover:underline"
            >
              <ArrowLeft size={16} />
              Report another defect
            </button>
          </div>
        ) : (
          /* Submission form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Report a Defect</h2>

            {/* Reported by */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="reported_by"
                value={form.reported_by}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent"
                placeholder="John Smith"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent"
                placeholder="john@example.com"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent"
                placeholder="07700 900000"
              />
            </div>

            {/* Unit ref */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit / Apartment</label>
              <input
                type="text"
                name="unit_ref"
                value={form.unit_ref}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent"
                placeholder="e.g. Apartment 4B"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent"
                placeholder="e.g. Kitchen"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent resize-none"
                placeholder="Describe the defect in detail..."
              />
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 cursor-pointer hover:border-[#1B6FC8] hover:bg-blue-50 transition-colors">
                <Camera size={18} className="text-gray-400" />
                <span className="text-sm text-gray-500">
                  {photo ? photo.name : 'Tap to add a photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="mt-2 w-full h-40 object-cover rounded-lg border border-gray-200"
                />
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] focus:border-transparent bg-white"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit */}
            <LoadingButton
              type="submit"
              loading={submitting}
              className="w-full bg-[#1B6FC8] text-white hover:bg-[#1559A5]"
            >
              <Send size={16} />
              Submit Defect
            </LoadingButton>
          </form>
        )}

        {/* Previous defects */}
        {previousDefects.length > 0 && (
          <div className="mt-10 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Previous Reports</h3>
            <div className="space-y-3">
              {previousDefects.map((defect) => (
                <div
                  key={defect.id}
                  className="p-3 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {defect.unit_ref && `${defect.unit_ref} — `}{defect.location || 'No location'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {defect.description}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">
                        Ref: {defect.id?.slice(0, 8)}
                      </p>
                    </div>
                    <StatusBadge status={defect.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
