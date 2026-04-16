import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { BIM_CATEGORIES } from '../lib/bimUtils'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import {
  Box, Upload, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  Search, Cuboid
} from 'lucide-react'
import { getSession } from '../lib/storage'

export default function BIMModels() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [models, setModels] = useState([])
  const [elements, setElements] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [expandedModel, setExpandedModel] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const managerData = JSON.parse(getSession('manager_data') || '{}')

  async function loadProjects() {
    try {
      let query = supabase.from('projects').select('id, name').order('name')
      if (managerData.company_id) query = query.eq('company_id', managerData.company_id)
      const { data, error } = await query
      if (error) console.error('BIM loadProjects error:', error)
      setProjects(data || [])
      if (data?.length > 0) setSelectedProject(data[0].id)
    } catch (err) {
      console.error('BIM loadProjects crash:', err)
    }
    setLoading(false)
  }

  async function loadModels() {
    try {
      const { data } = await supabase.from('bim_models').select('*').eq('project_id', selectedProject).order('created_at', { ascending: false })
      setModels(data || [])

      if (data?.length) {
        const modelIds = data.map(m => m.id)
        const { data: els } = await supabase.from('bim_elements').select('*').in('model_id', modelIds)
        setElements(els || [])
      } else {
        setElements([])
      }
    } catch (err) {
      console.error('BIM loadModels crash:', err)
      setModels([])
      setElements([])
    }
  }

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (selectedProject) loadModels() }, [selectedProject])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selectedProject) return
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
      const buffer = await file.arrayBuffer()
      setProgress(5)
      setProgressLabel('Uploading...')

      const filePath = `bim/${selectedProject}/${crypto.randomUUID()}.ifc`
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, new Blob([buffer]), {
        contentType: 'application/x-step',
      })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)

      setProgress(10)
      setProgressLabel('Parsing IFC...')

      const { parseIFC } = await import('../lib/ifcParser')
      const { elements: parsed, ifcSchema } = await parseIFC(buffer, (p) => {
        setProgress(10 + Math.floor(p * 0.7))
        if (p < 20) setProgressLabel('Initialising parser...')
        else if (p < 50) setProgressLabel('Scanning elements...')
        else if (p < 90) setProgressLabel('Extracting properties...')
        else setProgressLabel('Finalising...')
      })

      setProgress(85)
      setProgressLabel(`Found ${parsed.length} elements. Saving...`)

      const { data: model, error: modelErr } = await supabase.from('bim_models').insert({
        company_id: managerData.company_id,
        project_id: selectedProject,
        name: file.name.replace(/\.ifc$/i, ''),
        file_url: urlData.publicUrl,
        file_size: file.size,
        ifc_schema: ifcSchema,
        element_count: parsed.length,
        status: 'ready',
        uploaded_by: managerData.name || 'Unknown',
      }).select().single()

      if (modelErr) throw new Error(modelErr.message)

      setProgress(90)

      if (parsed.length > 0) {
        const batchSize = 200
        for (let i = 0; i < parsed.length; i += batchSize) {
          const batch = parsed.slice(i, i + batchSize).map(el => ({
            model_id: model.id,
            company_id: managerData.company_id,
            project_id: selectedProject,
            ifc_id: el.ifc_id,
            global_id: el.global_id,
            ifc_type: el.ifc_type,
            name: el.name,
            description: el.description,
            category: el.category,
            system_type: el.system_type,
            floor_name: el.floor_name,
            x: el.x, y: el.y, z: el.z,
            properties: el.properties,
          }))
          await supabase.from('bim_elements').insert(batch)
          setProgress(90 + Math.floor(((i + batchSize) / parsed.length) * 10))
        }
      }

      toast.success(`${parsed.length} MEP elements extracted from ${file.name}`)
      loadModels()
      setUploading(false)
      setProgress(0)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to process IFC')
      setUploading(false)
      setProgress(0)
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(modelId) {
    setDeleting(modelId)
    await supabase.from('bim_elements').delete().eq('model_id', modelId)
    await supabase.from('bim_drawing_calibration').delete().eq('model_id', modelId)
    await supabase.from('bim_models').delete().eq('id', modelId)
    setDeleting(null)
    toast.success('Model deleted')
    loadModels()
  }

  const modelElements = expandedModel ? elements.filter(el => el.model_id === expandedModel) : []
  const filteredElements = modelElements.filter(el => {
    if (categoryFilter && el.category !== categoryFilter) return false
    if (searchTerm && !el.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !el.ifc_type?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const categoryCounts = {}
  for (const el of modelElements) {
    categoryCounts[el.category] = (categoryCounts[el.category] || 0) + 1
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">BIM Models</h1>
        <p className="text-sm text-slate-500">Upload IFC models to overlay MEP elements on your drawings</p>
      </div>

      {/* Project selector + upload */}
      <div className="flex items-center gap-3 flex-wrap">
        {projects.length > 0 ? (
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <p className="text-sm text-slate-400">No projects found</p>
        )}

        {selectedProject && (
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            uploading ? 'bg-purple-100 text-purple-600' : 'bg-purple-500 hover:bg-purple-600 text-white'
          }`}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                {progressLabel} ({progress}%)
              </span>
            ) : (
              <>
                <Upload size={16} /> Upload IFC
              </>
            )}
            <input ref={fileRef} type="file" accept=".ifc" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
        )}
      </div>

      {/* Upload progress bar */}
      {uploading && (
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Models list */}
      {models.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Box size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No BIM models yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload an IFC file to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map(m => {
            const isExpanded = expandedModel === m.id
            const sizeMB = m.file_size ? (m.file_size / (1024 * 1024)).toFixed(1) : null
            return (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedModel(isExpanded ? null : m.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    {m.status === 'ready' ? <CheckCircle2 size={20} className="text-purple-500" /> : <AlertCircle size={20} className="text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-slate-800">{m.name}</p>
                    <p className="text-xs text-slate-400">
                      {m.element_count} elements · {m.ifc_schema} {sizeMB && `· ${sizeMB} MB`} · {new Date(m.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  {m.status === 'ready' && (
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/bim-3d/${m.id}`) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors">
                      <Cuboid size={14} /> View 3D
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(m.id) }}
                    disabled={deleting === m.id}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    {deleting === m.id ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
                  </button>
                  {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setCategoryFilter('')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${!categoryFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        All ({modelElements.length})
                      </button>
                      {Object.entries(BIM_CATEGORIES).map(([key, cat]) => {
                        if (!categoryCounts[key]) return null
                        return (
                          <button key={key}
                            onClick={() => setCategoryFilter(categoryFilter === key ? '' : key)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${categoryFilter === key ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
                            style={categoryFilter === key ? { backgroundColor: cat.color } : {}}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.label} ({categoryCounts[key]})
                          </button>
                        )
                      })}
                    </div>

                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search elements..."
                        className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400" />
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Name</th>
                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Type</th>
                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Category</th>
                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Floor</th>
                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Coords</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredElements.slice(0, 100).map(el => {
                            const cat = BIM_CATEGORIES[el.category] || BIM_CATEGORIES.other
                            return (
                              <tr key={el.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-[200px]">{el.name}</td>
                                <td className="px-3 py-2 text-slate-500">{el.ifc_type}</td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                                    {cat.icon} {cat.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-400">{el.floor_name || '—'}</td>
                                <td className="px-3 py-2 text-right text-slate-400 font-mono">
                                  {el.x != null ? `${Number(el.x).toFixed(0)}, ${Number(el.y).toFixed(0)}` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {filteredElements.length > 100 && (
                        <p className="text-[10px] text-slate-400 text-center py-2">Showing 100 of {filteredElements.length}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* How it works */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <p className="text-xs font-bold text-purple-700 mb-1">How BIM Integration Works</p>
        <ol className="text-xs text-purple-600 space-y-1 list-decimal ml-4">
          <li>Upload your IFC model here — MEP elements are automatically extracted</li>
          <li>Open a snag drawing and click the settings icon to calibrate the BIM overlay</li>
          <li>Toggle the BIM layer on the drawing to see elements overlaid on your floor plan</li>
          <li>When you place a snag pin near a BIM element, you can link them together</li>
        </ol>
      </div>
    </div>
  )
}
