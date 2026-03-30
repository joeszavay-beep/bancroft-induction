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
    <div className="min-h-dvh bg-navy-950 flex flex-col">
      <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="p-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Select Your Name</h1>
          <p className="text-xs text-gray-400">Tap your name to begin</p>
        </div>
      </header>

      <div className="p-4">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-10 pr-4 py-3 bg-navy-800 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <HardHat size={40} className="mx-auto mb-3 opacity-50" />
            <p>{search ? 'No matching operatives' : 'No operatives registered yet'}</p>
            <p className="text-xs mt-1">Ask your project manager to add you</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(op => (
              <button
                key={op.id}
                onClick={() => navigate(`/operative/${op.id}/documents`)}
                className="w-full flex items-center gap-3 bg-navy-800 border border-navy-600 rounded-xl p-4 hover:border-accent/50 active:scale-[0.98] transition-all text-left"
              >
                <div className="w-11 h-11 bg-accent/10 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-accent font-bold">{op.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{op.name}</p>
                  <p className="text-xs text-gray-400 truncate">
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
