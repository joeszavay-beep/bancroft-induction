import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, HardHat, Search } from 'lucide-react'

export default function OperativeSelect() {
  const navigate = useNavigate()
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadOperatives()
  }, [])

  async function loadOperatives() {
    const { data } = await supabase
      .from('operatives')
      .select('*, projects(name)')
      .order('name')
    setOperatives(data || [])
    setLoading(false)
  }

  const filtered = operatives.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft size={22} />
        </button>
        <img src="/sitecore-logo.svg" alt="SiteCore" className="h-7" />
        <div className="flex-1">
          <h1 className="text-base font-semibold text-slate-900">Select Your Name</h1>
          <p className="text-[11px] text-slate-400">Tap your name to begin</p>
        </div>
      </header>

      <div className="p-4">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 transition-all"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <HardHat size={40} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400">{search ? 'No matching operatives' : 'No operatives registered yet'}</p>
            <p className="text-xs text-slate-300 mt-1">Ask your project manager to add you</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(op => (
              <button
                key={op.id}
                onClick={() => navigate(`/operative/${op.id}/documents`)}
                className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 active:scale-[0.98] transition-all text-left"
              >
                {op.photo_url ? (
                  <img src={op.photo_url} alt={op.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white font-bold">{op.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold truncate">{op.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {op.role && `${op.role} · `}{op.projects?.name || 'Unassigned'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
