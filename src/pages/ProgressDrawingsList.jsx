import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import { Upload, Trash2, ChevronRight, Layers, BarChart3 } from 'lucide-react'

const TRADES = ['Electrical', 'Fire Alarm', 'Sound Masking', 'Pipework', 'Ductwork', 'BMS', 'Lighting', 'Other']
const STATUS_COLORS = { green: '#2EA043', yellow: '#D29922', red: '#DA3633' }

export default function ProgressDrawingsList() {
  const navigate = useNavigate()
  const { company } = useCompany()
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [drawings, setDrawings] = useState([])
  const [itemCounts, setItemCounts] = useState({})
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterTrade, setFilterTrade] = useState('all')
  const [filterLevel, setFilterLevel] = useState('all')

  // Upload form
  const [dName, setDName] = useState('')
  const [dNumber, setDNumber] = useState('')
  const [dRevision, setDRevision] = useState('')
  const [dTrade, setDTrade] = useState('')
  const [dLevel, setDLevel] = useState('')
  const [dProject, setDProject] = useState('')
  const [dFile, setDFile] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [d, p] = await Promise.all([
      cid ? supabase.from('progress_drawings').select('*').eq('company_id', cid).order('created_at', { ascending: false })
           : supabase.from('progress_drawings').select('*').order('created_at', { ascending: false }),
      cid ? supabase.from('projects').select('*').eq('company_id', cid).order('name')
           : supabase.from('projects').select('*').order('name'),
    ])
    setDrawings(d.data || [])
    setProjects(p.data || [])

    // Load item counts per drawing
    if (d.data && d.data.length > 0) {
      const { data: items } = await supabase.from('progress_items').select('drawing_id, status')
      const counts = {}
      ;(items || []).forEach(item => {
        if (!counts[item.drawing_id]) counts[item.drawing_id] = { total: 0, green: 0, yellow: 0, red: 0 }
        counts[item.drawing_id].total++
        counts[item.drawing_id][item.status] = (counts[item.drawing_id][item.status] || 0) + 1
      })
      setItemCounts(counts)
    }
    setLoading(false)
  }

  async function uploadDrawing(e) {
    e.preventDefault()
    if (!dName.trim() || !dProject || !dFile) return
    setSaving(true)

    let fileToUpload = dFile
    let fileExt = dFile.name.split('.').pop().toLowerCase()

    if (fileExt === 'pdf') {
      try {
        const { pdfToImage } = await import('../lib/pdfToImage')
        fileToUpload = await pdfToImage(dFile)
        fileExt = 'png'
      } catch (err) {
        console.error('PDF conversion failed:', err)
        setSaving(false)
        toast.error('Failed to convert PDF')
        return
      }
    }

    const filePath = `${cid || 'default'}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('progress-drawings').upload(filePath, fileToUpload, {
      contentType: fileExt === 'png' ? 'image/png' : fileToUpload.type || 'image/jpeg',
    })
    if (upErr) { setSaving(false); toast.error('Upload failed'); return }

    const { data: urlData } = supabase.storage.from('progress-drawings').getPublicUrl(filePath)
    const mgr = JSON.parse(sessionStorage.getItem('manager_data') || '{}')

    const { data: newDrawing, error: dbErr } = await supabase.from('progress_drawings').insert({
      company_id: cid,
      project_id: dProject,
      name: dName.trim(),
      drawing_number: dNumber.trim() || null,
      revision: dRevision.trim() || null,
      trade: dTrade || null,
      floor_level: dLevel.trim() || null,
      image_url: urlData.publicUrl,
      uploaded_by: mgr.name || 'PM',
    }).select().single()

    setSaving(false)
    if (dbErr) { toast.error('Failed to save drawing'); return }
    toast.success('Drawing uploaded')
    setShowUpload(false)
    setDName(''); setDNumber(''); setDRevision(''); setDTrade(''); setDLevel(''); setDProject(''); setDFile(null)
    navigate(`/progress/${newDrawing.id}`)
  }

  async function deleteDrawing(id, name) {
    if (!confirm(`Delete "${name}" and all its items?`)) return
    await supabase.from('progress_item_history').delete().eq('drawing_id', id)
    await supabase.from('progress_items').delete().eq('drawing_id', id)
    await supabase.from('progress_zones').delete().eq('drawing_id', id)
    await supabase.from('progress_drawings').delete().eq('id', id)
    toast.success('Drawing deleted')
    loadAll()
  }

  const levels = [...new Set(drawings.map(d => d.floor_level).filter(Boolean))]
  let filtered = drawings
  if (filterTrade !== 'all') filtered = filtered.filter(d => d.trade === filterTrade)
  if (filterLevel !== 'all') filtered = filtered.filter(d => d.floor_level === filterLevel)

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
            <Layers size={20} className="text-[#1B6FC8]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Progress Drawings</h1>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-md transition-colors">
          <Upload size={14} /> Upload Drawing
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} className="px-3 py-1.5 text-xs border border-[#E2E6EA] rounded-md text-[#1A1A2E]">
          <option value="all">All Trades</option>
          {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {levels.length > 0 && (
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="px-3 py-1.5 text-xs border border-[#E2E6EA] rounded-md text-[#1A1A2E]">
            <option value="all">All Levels</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      {/* Drawings */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Layers size={48} className="mx-auto mb-3 text-[#E2E6EA]" />
          <p className="text-[#6B7A99]">No progress drawings yet</p>
          <p className="text-xs text-[#B0B8C9] mt-1">Upload a drawing to start marking progress</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const c = itemCounts[d.id] || { total: 0, green: 0, yellow: 0, red: 0 }
            const proj = projects.find(p => p.id === d.project_id)
            const pctGreen = c.total > 0 ? Math.round((c.green / c.total) * 100) : 0
            const pctYellow = c.total > 0 ? Math.round((c.yellow / c.total) * 100) : 0
            const pctRed = c.total > 0 ? Math.round((c.red / c.total) * 100) : 0

            return (
              <div key={d.id} className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-4 hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/progress/${d.id}`)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-[#1A1A2E] truncate">{d.name}</h3>
                      {d.trade && <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5F6F8] text-[#6B7A99] font-medium shrink-0">{d.trade}</span>}
                    </div>
                    <p className="text-xs text-[#6B7A99] truncate mb-2">
                      {d.drawing_number && `${d.drawing_number} `}{d.revision && `Rev ${d.revision} · `}{d.floor_level && `${d.floor_level} · `}{proj?.name || ''}
                    </p>

                    {/* Progress bar */}
                    {c.total > 0 && (
                      <div className="mb-2">
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-[#F5F6F8]">
                          {c.green > 0 && <div style={{ width: `${pctGreen}%`, backgroundColor: STATUS_COLORS.green }} />}
                          {c.yellow > 0 && <div style={{ width: `${pctYellow}%`, backgroundColor: STATUS_COLORS.yellow }} />}
                          {c.red > 0 && <div style={{ width: `${pctRed}%`, backgroundColor: STATUS_COLORS.red }} />}
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-[#6B7A99]">
                          <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: STATUS_COLORS.green }} /> {pctGreen}% ({c.green})</span>
                          <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: STATUS_COLORS.yellow }} /> {pctYellow}% ({c.yellow})</span>
                          <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: STATUS_COLORS.red }} /> {pctRed}% ({c.red})</span>
                          <span className="text-[#B0B8C9]">{c.total} items</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => navigate(`/progress/${d.id}`)} className="p-2 text-[#6B7A99] hover:text-[#1B6FC8] transition-colors">
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => deleteDrawing(d.id, d.name)} className="p-2 text-[#6B7A99] hover:text-[#DA3633] transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Progress Drawing">
        <form onSubmit={uploadDrawing} className="space-y-3">
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Drawing Name *</label>
            <input value={dName} onChange={e => setDName(e.target.value)} placeholder="e.g. Level 08 Lighting"
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" autoFocus />
          </div>
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Project *</label>
            <select value={dProject} onChange={e => setDProject(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
              <option value="">Select project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Drawing Number</label>
              <input value={dNumber} onChange={e => setDNumber(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Revision</label>
              <input value={dRevision} onChange={e => setDRevision(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Trade</label>
              <select value={dTrade} onChange={e => setDTrade(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
                <option value="">Select trade</option>
                {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Floor Level</label>
              <input value={dLevel} onChange={e => setDLevel(e.target.value)} placeholder="e.g. Level 08"
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
          </div>
          <label className="flex items-center justify-center gap-2 w-full px-3 py-4 border-2 border-dashed border-[#E2E6EA] rounded-lg cursor-pointer hover:border-[#1B6FC8] transition-colors">
            <Upload size={16} className="text-[#6B7A99]" />
            <span className="text-sm text-[#6B7A99]">{dFile ? dFile.name : 'Select PDF or image'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setDFile(e.target.files[0])} className="hidden" />
          </label>
          <LoadingButton loading={saving} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-md">
            Upload & Open
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}
