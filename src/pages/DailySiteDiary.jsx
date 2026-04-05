import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import {
  Plus, ChevronDown, ChevronRight, Calendar, Cloud, Sun, CloudRain, CloudSnow, Wind, Thermometer,
  Users, Truck, AlertTriangle, Clock, FileText, Edit3, Trash2, X, CloudLightning, MapPin, Loader2, CloudDrizzle
} from 'lucide-react'

// WMO weather codes → our weather values
function wmoToWeather(code) {
  if (code <= 1) return 'sunny'
  if (code <= 3) return 'cloudy'
  if (code >= 51 && code <= 55) return 'rain'       // drizzle
  if (code >= 56 && code <= 67) return 'heavy_rain'  // freezing rain / rain
  if (code >= 61 && code <= 65) return 'rain'
  if (code >= 66 && code <= 67) return 'heavy_rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'        // showers
  if (code >= 85 && code <= 86) return 'snow'
  if (code >= 95) return 'heavy_rain'                 // thunderstorm
  return 'cloudy'
}

async function fetchWeatherForLocation(location) {
  // Step 1: Geocode the location
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`)
  const geoData = await geoRes.json()
  if (!geoData.results?.length) throw new Error('Location not found')

  const { latitude, longitude, name } = geoData.results[0]

  // Step 2: Get current weather + daily high/low
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  )
  const weatherData = await weatherRes.json()

  return {
    locationName: name,
    weather: wmoToWeather(weatherData.current?.weather_code ?? 3),
    currentTemp: Math.round(weatherData.current?.temperature_2m ?? 0),
    tempHigh: Math.round(weatherData.daily?.temperature_2m_max?.[0] ?? 0),
    tempLow: Math.round(weatherData.daily?.temperature_2m_min?.[0] ?? 0),
    windSpeed: Math.round(weatherData.current?.wind_speed_10m ?? 0),
  }
}

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Sunny', icon: Sun, color: 'text-amber-500' },
  { value: 'cloudy', label: 'Cloudy', icon: Cloud, color: 'text-slate-400' },
  { value: 'rain', label: 'Rain', icon: CloudRain, color: 'text-blue-500' },
  { value: 'heavy_rain', label: 'Heavy Rain', icon: CloudLightning, color: 'text-blue-700' },
  { value: 'snow', label: 'Snow', icon: CloudSnow, color: 'text-cyan-400' },
  { value: 'windy', label: 'Windy', icon: Wind, color: 'text-teal-500' },
]

export default function DailySiteDiary() {
  const { user, company } = useCompany()
  const cid = user?.company_id
  const [entries, setEntries] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [expandedEntry, setExpandedEntry] = useState(null)
  const [filterProject, setFilterProject] = useState('all')

  // Form state
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [weather, setWeather] = useState('sunny')
  const [tempHigh, setTempHigh] = useState('')
  const [tempLow, setTempLow] = useState('')
  const [workforceCount, setWorkforceCount] = useState('')
  const [subcontractors, setSubcontractors] = useState('')
  const [deliveries, setDeliveries] = useState('')
  const [visitors, setVisitors] = useState('')
  const [delays, setDelays] = useState('')
  const [incidents, setIncidents] = useState('')
  const [workCompleted, setWorkCompleted] = useState('')
  const [workPlanned, setWorkPlanned] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [locationInput, setLocationInput] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [e, p] = await Promise.all([
      supabase.from('site_diary').select('*').eq('company_id', cid).order('date', { ascending: false }),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
    ])
    setEntries(e.data || [])
    setProjects(p.data || [])
    if (p.data?.length > 0 && !projectId) setProjectId(p.data[0].id)
    setLoading(false)
  }

  function resetForm() {
    setDate(new Date().toISOString().split('T')[0])
    setWeather('sunny')
    setTempHigh('')
    setTempLow('')
    setWorkforceCount('')
    setSubcontractors('')
    setDeliveries('')
    setVisitors('')
    setDelays('')
    setIncidents('')
    setWorkCompleted('')
    setWorkPlanned('')
    setNotes('')
    setEditingEntry(null)
  }

  function openEdit(entry) {
    setEditingEntry(entry)
    setProjectId(entry.project_id)
    setDate(entry.date)
    setWeather(entry.weather || 'sunny')
    setTempHigh(entry.temp_high?.toString() || '')
    setTempLow(entry.temp_low?.toString() || '')
    setWorkforceCount(entry.workforce_count?.toString() || '')
    setSubcontractors(entry.subcontractors || '')
    setDeliveries(entry.deliveries || '')
    setVisitors(entry.visitors || '')
    setDelays(entry.delays || '')
    setIncidents(entry.incidents || '')
    setWorkCompleted(entry.work_completed || '')
    setWorkPlanned(entry.work_planned || '')
    setNotes(entry.notes || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!projectId) { toast.error('Select a project'); return }
    setSaving(true)

    const record = {
      company_id: cid,
      project_id: projectId,
      date,
      weather,
      temp_high: tempHigh ? parseInt(tempHigh) : null,
      temp_low: tempLow ? parseInt(tempLow) : null,
      workforce_count: workforceCount ? parseInt(workforceCount) : null,
      subcontractors: subcontractors.trim() || null,
      deliveries: deliveries.trim() || null,
      visitors: visitors.trim() || null,
      delays: delays.trim() || null,
      incidents: incidents.trim() || null,
      work_completed: workCompleted.trim() || null,
      work_planned: workPlanned.trim() || null,
      notes: notes.trim() || null,
      created_by: user?.name || 'Unknown',
    }

    let error
    if (editingEntry) {
      ({ error } = await supabase.from('site_diary').update(record).eq('id', editingEntry.id))
    } else {
      ({ error } = await supabase.from('site_diary').insert(record))
    }

    setSaving(false)
    if (error) { toast.error('Failed to save entry'); console.error(error); return }
    toast.success(editingEntry ? 'Entry updated' : 'Diary entry saved')
    resetForm()
    setShowForm(false)
    loadData()
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this diary entry?')) return
    const { error } = await supabase.from('site_diary').delete().eq('id', id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Entry deleted')
    loadData()
  }

  function handleLocationChange(value) {
    setLocationInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) { setLocationSuggestions([]); setShowSuggestions(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value.trim())}&count=5&language=en&format=json`)
        const data = await res.json()
        if (data.results?.length) {
          setLocationSuggestions(data.results.map(r => ({
            name: r.name,
            region: r.admin1 || '',
            country: r.country || '',
            latitude: r.latitude,
            longitude: r.longitude,
          })))
          setShowSuggestions(true)
        } else {
          setLocationSuggestions([])
          setShowSuggestions(false)
        }
      } catch { setLocationSuggestions([]); setShowSuggestions(false) }
    }, 300)
  }

  async function handleSelectLocation(loc) {
    setLocationInput(`${loc.name}, ${loc.region}`)
    setShowSuggestions(false)
    setLocationSuggestions([])
    setFetchingWeather(true)
    try {
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
      )
      const weatherData = await weatherRes.json()
      const w = wmoToWeather(weatherData.current?.weather_code ?? 3)
      const high = Math.round(weatherData.daily?.temperature_2m_max?.[0] ?? 0)
      const low = Math.round(weatherData.daily?.temperature_2m_min?.[0] ?? 0)
      const wind = Math.round(weatherData.current?.wind_speed_10m ?? 0)
      const temp = Math.round(weatherData.current?.temperature_2m ?? 0)
      setWeather(wind > 40 ? 'windy' : w)
      setTempHigh(high.toString())
      setTempLow(low.toString())
      toast.success(`${loc.name}: ${temp}°C, ${WEATHER_OPTIONS.find(o => o.value === (wind > 40 ? 'windy' : w))?.label || w}`)
    } catch {
      toast.error('Failed to fetch weather')
    }
    setFetchingWeather(false)
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))
  const filtered = filterProject === 'all' ? entries : entries.filter(e => e.project_id === filterProject)

  // Group by date
  const grouped = {}
  filtered.forEach(e => {
    const key = e.date
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  })

  const inputCls = "w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10"
  const labelCls = "text-xs font-medium mb-1 block"

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Daily Site Diary</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{entries.length} entries</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-color)] hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-colors">
          <Plus size={16} /> New Entry
        </button>
      </div>

      {/* Project filter */}
      {projects.length > 1 && (
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className={`${inputCls} max-w-xs`} style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No diary entries yet</p>
          <p className="text-xs mt-1">Create your first daily site diary entry</p>
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(grouped).map(([dateKey, dayEntries]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold uppercase tracking-wider px-1 mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {new Date(dateKey + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {dayEntries.map(entry => {
                const weatherObj = WEATHER_OPTIONS.find(w => w.value === entry.weather) || WEATHER_OPTIONS[0]
                const WeatherIcon = weatherObj.icon
                const isExpanded = expandedEntry === entry.id
                return (
                  <div key={entry.id} className="rounded-xl border overflow-hidden mb-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <button onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors">
                      <WeatherIcon size={20} className={weatherObj.color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{projectMap[entry.project_id] || 'Unknown Project'}</p>
                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {entry.workforce_count != null && <span className="flex items-center gap-1"><Users size={10} /> {entry.workforce_count}</span>}
                          {entry.temp_high != null && <span className="flex items-center gap-1"><Thermometer size={10} /> {entry.temp_high}°C</span>}
                          <span className="flex items-center gap-1"><Clock size={10} /> {entry.created_by}</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t space-y-3" style={{ borderColor: 'var(--border-color)' }}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                          <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Weather</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <WeatherIcon size={14} className={weatherObj.color} />
                              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{weatherObj.label}</span>
                            </div>
                          </div>
                          {entry.temp_high != null && (
                            <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                              <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Temperature</p>
                              <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{entry.temp_low != null ? `${entry.temp_low}° – ` : ''}{entry.temp_high}°C</p>
                            </div>
                          )}
                          {entry.workforce_count != null && (
                            <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                              <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Workforce</p>
                              <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{entry.workforce_count} on site</p>
                            </div>
                          )}
                          <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                            <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Recorded By</p>
                            <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{entry.created_by}</p>
                          </div>
                        </div>

                        {entry.subcontractors && <Detail label="Subcontractors on Site" text={entry.subcontractors} />}
                        {entry.work_completed && <Detail label="Work Completed" text={entry.work_completed} />}
                        {entry.work_planned && <Detail label="Work Planned Tomorrow" text={entry.work_planned} />}
                        {entry.deliveries && <Detail label="Deliveries" text={entry.deliveries} icon={Truck} />}
                        {entry.visitors && <Detail label="Visitors" text={entry.visitors} />}
                        {entry.delays && <Detail label="Delays" text={entry.delays} icon={AlertTriangle} warn />}
                        {entry.incidents && <Detail label="Incidents / Near Misses" text={entry.incidents} icon={AlertTriangle} warn />}
                        {entry.notes && <Detail label="Additional Notes" text={entry.notes} />}

                        <div className="flex items-center gap-2 pt-2">
                          <button onClick={() => openEdit(entry)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-blue-50 text-[#1B6FC8]">
                            <Edit3 size={12} /> Edit
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-red-50 text-red-500">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* New/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="text-base font-bold text-slate-900">{editingEntry ? 'Edit Entry' : 'New Diary Entry'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Project *</label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls} required>
                    <option value="">Select...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Date *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
                </div>
              </div>

              {/* Weather auto-fetch with autocomplete */}
              <div>
                <label className={labelCls}>Site Location (auto-fill weather)</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                  {fetchingWeather && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin z-10" />}
                  <input
                    value={locationInput}
                    onChange={e => handleLocationChange(e.target.value)}
                    onFocus={() => { if (locationSuggestions.length) setShowSuggestions(true) }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className={`${inputCls} pl-9`}
                    placeholder="Start typing a city or town..."
                    autoComplete="off"
                  />
                  {showSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                      {locationSuggestions.map((loc, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => handleSelectLocation(loc)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                        >
                          <MapPin size={14} className="text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{loc.name}</p>
                            <p className="text-xs text-slate-500 truncate">{[loc.region, loc.country].filter(Boolean).join(', ')}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Weather */}
              <div>
                <label className={labelCls}>Weather</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEATHER_OPTIONS.map(w => (
                    <button key={w.value} type="button" onClick={() => setWeather(w.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${weather === w.value ? 'border-[#1B6FC8] bg-blue-50 text-[#1B6FC8]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <w.icon size={14} className={w.color} /> {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>High °C</label>
                  <input type="number" value={tempHigh} onChange={e => setTempHigh(e.target.value)} className={inputCls} placeholder="18" />
                </div>
                <div>
                  <label className={labelCls}>Low °C</label>
                  <input type="number" value={tempLow} onChange={e => setTempLow(e.target.value)} className={inputCls} placeholder="8" />
                </div>
                <div>
                  <label className={labelCls}>Workforce</label>
                  <input type="number" value={workforceCount} onChange={e => setWorkforceCount(e.target.value)} className={inputCls} placeholder="24" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Subcontractors on Site</label>
                <input value={subcontractors} onChange={e => setSubcontractors(e.target.value)} className={inputCls} placeholder="e.g. ABC Electrical (4), XYZ Plumbing (2)" />
              </div>

              <div>
                <label className={labelCls}>Work Completed Today</label>
                <textarea value={workCompleted} onChange={e => setWorkCompleted(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Summary of work completed..." />
              </div>

              <div>
                <label className={labelCls}>Work Planned for Tomorrow</label>
                <textarea value={workPlanned} onChange={e => setWorkPlanned(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="What's planned for next day..." />
              </div>

              <div>
                <label className={labelCls}>Deliveries</label>
                <input value={deliveries} onChange={e => setDeliveries(e.target.value)} className={inputCls} placeholder="Materials, equipment received today..." />
              </div>

              <div>
                <label className={labelCls}>Visitors</label>
                <input value={visitors} onChange={e => setVisitors(e.target.value)} className={inputCls} placeholder="Client visit, H&S inspector, etc." />
              </div>

              <div>
                <label className={labelCls}>Delays / Issues</label>
                <textarea value={delays} onChange={e => setDelays(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Weather delays, access issues, waiting on materials..." />
              </div>

              <div>
                <label className={labelCls}>Incidents / Near Misses</label>
                <textarea value={incidents} onChange={e => setIncidents(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Any H&S incidents or near misses..." />
              </div>

              <div>
                <label className={labelCls}>Additional Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Anything else to record..." />
              </div>

              <LoadingButton loading={saving} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-xl text-sm font-semibold">
                {editingEntry ? 'Update Entry' : 'Save Entry'}
              </LoadingButton>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, text, icon: Icon, warn }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: warn ? 'rgb(254 242 242)' : 'var(--bg-main)' }}>
      <p className={`text-[10px] uppercase font-semibold tracking-wider mb-1 flex items-center gap-1 ${warn ? 'text-red-500' : ''}`} style={warn ? {} : { color: 'var(--text-muted)' }}>
        {Icon && <Icon size={10} />} {label}
      </p>
      <p className="text-sm whitespace-pre-wrap" style={{ color: warn ? '#991b1b' : 'var(--text-primary)' }}>{text}</p>
    </div>
  )
}
