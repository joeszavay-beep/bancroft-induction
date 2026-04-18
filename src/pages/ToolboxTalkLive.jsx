import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle2, Users, XCircle, Download } from 'lucide-react'
import { generateToolboxPDF } from '../lib/generateToolboxPDF'
import { buildBranding } from '../lib/reportTemplate'
import { getSession } from '../lib/storage'

export default function ToolboxTalkLive() {
  const { talkId } = useParams()
  const navigate = useNavigate()
  const [talk, setTalk] = useState(null)
  const [project, setProject] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [companyBranding, setCompanyBranding] = useState(null)

  const signUrl = `${window.location.origin}/toolbox/${talkId}`

  async function loadData() {
    const { data: t } = await supabase.from('toolbox_talks').select('*').eq('id', talkId).single()
    if (!t) { navigate('/pm'); return }
    setTalk(t)

    const [p, s, o] = await Promise.all([
      supabase.from('projects').select('*').eq('id', t.project_id).single(),
      supabase.from('toolbox_signatures').select('*').eq('talk_id', talkId).order('signed_at'),
      supabase.from('operatives').select('*').eq('project_id', t.project_id).order('name'),
    ])
    setProject(p.data)
    setSignatures(s.data || [])
    setOperatives(o.data || [])

    // Load company branding for PDF exports
    const cid = JSON.parse(getSession('manager_data') || '{}').company_id
    if (cid && !companyBranding) {
      try {
        const { data: co } = await supabase.from('companies').select('name,logo_url,primary_colour,secondary_colour,settings').eq('id', cid).single()
        if (co) setCompanyBranding(buildBranding(co))
      } catch { /* ignore */ }
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData() // eslint-disable-line react-hooks/set-state-in-effect
    // Real-time subscription
    const channel = supabase
      .channel(`toolbox-${talkId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'toolbox_signatures',
        filter: `talk_id=eq.${talkId}`,
      }, (payload) => {
        setSignatures(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [talkId])

  async function closeTalk() {
    if (!confirm('Close this toolbox talk? The QR code will stop working.')) return
    setClosing(true)
    await supabase.from('toolbox_talks').update({ is_open: false, closed_at: new Date().toISOString() }).eq('id', talkId)
    setClosing(false)
    toast.success('Toolbox talk closed')
    setTalk(prev => ({ ...prev, is_open: false, closed_at: new Date().toISOString() }))
  }

  async function handleExport() {
    setExporting(true)
    try {
      await generateToolboxPDF({ talk, project, signatures, branding: companyBranding })
      toast.success('PDF downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF')
    }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const signedIds = new Set(signatures.map(s => s.operative_id))
  const unsignedOps = operatives.filter(o => !signedIds.has(o.id))

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pm')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">{talk?.title}</h1>
            <p className="text-[11px] text-slate-400">{project?.name} · {talk?.is_open ? 'Live' : 'Closed'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
            {exporting ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Download size={18} />}
          </button>
          {talk?.is_open && (
            <button onClick={closeTalk} disabled={closing} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors">
              {closing ? 'Closing...' : 'Close Talk'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* QR Code */}
        {talk?.is_open && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-4">Scan to Sign</p>
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <QRCodeSVG value={signUrl} size={220} level="H" includeMargin />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center break-all max-w-xs">{signUrl}</p>
          </div>
        )}

        {!talk?.is_open && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <XCircle size={24} className="text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">This toolbox talk is closed</p>
            <p className="text-xs text-slate-400 mt-1">Closed {talk.closed_at ? new Date(talk.closed_at).toLocaleString() : ''}</p>
          </div>
        )}

        {/* Description */}
        {talk?.description && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{talk.description}</p>
          </div>
        )}

        {/* Live signatures */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-500" />
              <p className="text-sm font-semibold text-slate-700">Attendees</p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
              {signatures.length}/{operatives.length}
            </span>
          </div>

          {signatures.length === 0 && talk?.is_open && (
            <p className="text-sm text-slate-400 text-center py-4">Waiting for operatives to scan the QR code...</p>
          )}

          <div className="space-y-1.5">
            {signatures.map(sig => (
              <div key={sig.id} className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg p-3">
                <CheckCircle2 size={16} className="text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 font-medium truncate">{sig.operative_name}</p>
                  <p className="text-[11px] text-slate-400">{new Date(sig.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}

            {unsignedOps.map(op => (
              <div key={op.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg p-3 opacity-50">
                <div className="w-4 h-4 border-2 border-slate-300 rounded-full shrink-0" />
                <p className="text-sm text-slate-500 truncate">{op.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
