import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { BIM_CATEGORIES } from '../lib/bimUtils'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { Upload, Box, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { getSession } from '../lib/storage'

/**
 * BIM Model upload and management panel.
 * Handles IFC file upload, client-side parsing, and element extraction.
 */
export default function BIMUpload({ open, onClose, projectId, companyId, models, onModelsChanged }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [deleting, setDeleting] = useState(null)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      toast.error('Please upload an IFC file')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('IFC file must be under 100MB')
      return
    }

    setUploading(true)
    setProgress(0)
    setProgressLabel('Reading file...')

    try {
      // Read file
      const buffer = await file.arrayBuffer()
      setProgress(5)
      setProgressLabel('Uploading to storage...')

      // Upload IFC to Supabase storage
      const filePath = `bim/${projectId}/${crypto.randomUUID()}.ifc`
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, new Blob([buffer]), {
        contentType: 'application/x-step',
      })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
      const fileUrl = urlData.publicUrl

      setProgress(10)
      setProgressLabel('Parsing IFC model...')

      // Lazy-load parser (web-ifc is ~1.3MB WASM, only load when needed)
      const { parseIFC } = await import('../lib/ifcParser')
      const { elements, ifcSchema } = await parseIFC(buffer, (p) => {
        setProgress(10 + Math.floor(p * 0.7))
        if (p < 20) setProgressLabel('Initialising parser...')
        else if (p < 50) setProgressLabel('Scanning elements...')
        else if (p < 90) setProgressLabel('Extracting properties...')
        else setProgressLabel('Finalising...')
      })

      setProgress(85)
      setProgressLabel(`Found ${elements.length} MEP elements. Saving...`)

      const managerData = JSON.parse(getSession('manager_data') || '{}')

      // Create BIM model record
      const { data: model, error: modelErr } = await supabase.from('bim_models').insert({
        company_id: companyId,
        project_id: projectId,
        name: file.name.replace(/\.ifc$/i, ''),
        file_url: fileUrl,
        file_size: file.size,
        ifc_schema: ifcSchema,
        element_count: elements.length,
        status: 'ready',
        uploaded_by: managerData.name || 'Unknown',
      }).select().single()

      if (modelErr) throw new Error(`Failed to save model: ${modelErr.message}`)

      setProgress(90)
      setProgressLabel('Saving elements...')

      // Insert elements in batches of 200
      if (elements.length > 0) {
        const batchSize = 200
        for (let i = 0; i < elements.length; i += batchSize) {
          const batch = elements.slice(i, i + batchSize).map(el => ({
            model_id: model.id,
            company_id: companyId,
            project_id: projectId,
            ifc_id: el.ifc_id,
            global_id: el.global_id,
            ifc_type: el.ifc_type,
            name: el.name,
            description: el.description,
            category: el.category,
            system_type: el.system_type,
            floor_name: el.floor_name,
            x: el.x,
            y: el.y,
            z: el.z,
            properties: el.properties,
          }))

          const { error: elErr } = await supabase.from('bim_elements').insert(batch)
          if (elErr) console.warn('Element batch insert error:', elErr.message)

          setProgress(90 + Math.floor(((i + batchSize) / elements.length) * 10))
        }
      }

      setProgress(100)
      setProgressLabel('Done!')
      toast.success(`${elements.length} MEP elements extracted`)
      onModelsChanged?.()

      // Reset after brief delay
      setTimeout(() => { setUploading(false); setProgress(0) }, 1500)
    } catch (err) {
      console.error('BIM upload error:', err)
      toast.error(err.message || 'Failed to process IFC file')
      setUploading(false)
      setProgress(0)
    }

    // Reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(modelId) {
    setDeleting(modelId)
    // Delete elements first (cascade should handle it, but be safe)
    await supabase.from('bim_elements').delete().eq('model_id', modelId)
    const { error } = await supabase.from('bim_models').delete().eq('id', modelId)
    setDeleting(null)

    if (error) {
      toast.error('Failed to delete model')
      return
    }
    toast.success('BIM model deleted')
    onModelsChanged?.()
  }

  return (
    <Modal open={open} onClose={onClose} title="BIM Models">
      <div className="space-y-4">
        {/* Upload area */}
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-purple-400 transition-colors">
          {uploading ? (
            <div className="space-y-3">
              <Box size={32} className="text-purple-500 mx-auto animate-pulse" />
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-500">{progressLabel}</p>
              <p className="text-[10px] text-slate-400">{progress}%</p>
            </div>
          ) : (
            <label className="cursor-pointer">
              <Upload size={24} className="text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">Upload IFC Model</p>
              <p className="text-xs text-slate-400 mt-1">Drag & drop or click to browse</p>
              <p className="text-[10px] text-slate-300 mt-1">IFC2x3 or IFC4 supported</p>
              <input ref={fileRef} type="file" accept=".ifc" onChange={handleUpload} className="hidden" />
            </label>
          )}
        </div>

        {/* Existing models */}
        {models?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">Uploaded Models</p>
            <div className="space-y-2">
              {models.map(m => {
                const sizeKB = m.file_size ? Math.round(m.file_size / 1024) : null
                const sizeMB = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : (sizeKB ? sizeKB + ' KB' : null)
                return (
                  <div key={m.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
                    <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                      {m.status === 'ready' ? <CheckCircle2 size={18} className="text-purple-500" /> : <AlertCircle size={18} className="text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {m.element_count} elements · {m.ifc_schema} {sizeMB && ` · ${sizeMB}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      {deleting === m.id
                        ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Category legend */}
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] font-bold text-slate-400 mb-2">ELEMENT CATEGORIES</p>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(BIM_CATEGORIES).map(([key, cat]) => (
              <div key={key} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.icon} {cat.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
