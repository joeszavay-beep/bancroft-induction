import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  Home, FileText, MapPin, MessageSquare, User, LogOut, Bell,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, Camera, X
} from 'lucide-react'

const TABS = ['home', 'documents', 'snags', 'toolbox', 'profile']

export default function OperativeDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('home')
  const [op, setOp] = useState(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [snags, setSnags] = useState([])
  const [talks, setTalks] = useState([])
  const [talkSigs, setTalkSigs] = useState([])
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const session = sessionStorage.getItem('operative_session')
    if (!session) { navigate('/worker-login'); return }
    const data = JSON.parse(session)
    setOp(data)
    loadData(data)
  }, [])

  async function loadData(opData) {
    setLoading(true)
    const pid = opData.project_id
    const cid = opData.company_id

    const [docs, sigs, snagData, talkData, talkSigData, notifData] = await Promise.all([
      pid ? supabase.from('documents').select('*').eq('project_id', pid).order('created_at', { ascending: false }) : { data: [] },
      supabase.from('signatures').select('*').eq('operative_id', opData.id).order('signed_at', { ascending: false }),
      supabase.from('snags').select('*, drawings(name)').eq('assigned_to', opData.name).in('status', ['open', 'reassigned']).order('due_date'),
      pid ? supabase.from('toolbox_talks').select('*').eq('project_id', pid).eq('is_open', true).order('created_at', { ascending: false }) : { data: [] },
      supabase.from('toolbox_signatures').select('talk_id').eq('operative_id', opData.id),
      cid ? supabase.from('notifications').select('*').eq('user_id', opData.id).eq('read', false).order('created_at', { ascending: false }).limit(10) : { data: [] },
    ])

    setDocuments(docs.data || [])
    setSignatures(sigs.data || [])
    setSnags(snagData.data || [])
    setTalks(talkData.data || [])
    setTalkSigs(talkSigData.data || [])
    setNotifications(notifData.data || [])
    setLoading(false)
  }

  function handleLogout() {
    sessionStorage.removeItem('operative_session')
    navigate('/worker-login')
  }

  if (!op) return null

  // Computed
  const signedDocIds = new Set(signatures.filter(s => !s.invalidated).map(s => s.document_id))
  const unsignedDocs = documents.filter(d => !signedDocIds.has(d.id))
  const signedTalkIds = new Set(talkSigs.map(s => s.talk_id))
  const unsignedTalks = talks.filter(t => !signedTalkIds.has(t.id))
  const overdueSnags = snags.filter(s => s.due_date && new Date(s.due_date) < new Date())
  const pendingActions = unsignedDocs.length + unsignedTalks.length + snags.length

  const primaryColor = op.primary_colour || '#1B6FC8'

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#F5F6F8' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: primaryColor }} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: '#F5F6F8' }}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {op.company_logo ? (
            <img src={op.company_logo} alt={op.company_name} className="h-7" />
          ) : (
            <span className="text-sm font-semibold text-slate-700">{op.company_name || <><span className="font-light tracking-widest">CORE</span><span className="font-bold">SITE</span></>}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <div className="relative">
              <Bell size={18} className="text-slate-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{notifications.length}</span>
            </div>
          )}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>
            {op.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'home' && <HomeTab op={op} unsignedDocs={unsignedDocs} unsignedTalks={unsignedTalks} snags={snags} overdueSnags={overdueSnags} pendingActions={pendingActions} setTab={setTab} navigate={navigate} primaryColor={primaryColor} />}
        {tab === 'documents' && <DocumentsTab op={op} documents={documents} signatures={signatures} signedDocIds={signedDocIds} navigate={navigate} primaryColor={primaryColor} />}
        {tab === 'snags' && <SnagsTab snags={snags} overdueSnags={overdueSnags} navigate={navigate} primaryColor={primaryColor} />}
        {tab === 'toolbox' && <ToolboxTab talks={talks} signedTalkIds={signedTalkIds} unsignedTalks={unsignedTalks} navigate={navigate} primaryColor={primaryColor} />}
        {tab === 'profile' && <ProfileTab op={op} handleLogout={handleLogout} navigate={navigate} primaryColor={primaryColor} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around py-2 px-1 z-40" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'documents', icon: FileText, label: 'Docs', badge: unsignedDocs.length },
          { id: 'snags', icon: MapPin, label: 'Snags', badge: snags.length },
          { id: 'toolbox', icon: MessageSquare, label: 'Toolbox', badge: unsignedTalks.length },
          { id: 'profile', icon: User, label: 'Profile' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center gap-0.5 relative min-w-[56px]">
            <t.icon size={20} className={tab === t.id ? '' : 'text-slate-400'} style={tab === t.id ? { color: primaryColor } : {}} />
            {t.badge > 0 && (
              <span className="absolute -top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{t.badge}</span>
            )}
            <span className={`text-[10px] ${tab === t.id ? 'font-semibold' : 'text-slate-400'}`} style={tab === t.id ? { color: primaryColor } : {}}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ========== HOME TAB ========== */
function HomeTab({ op, unsignedDocs, unsignedTalks, snags, overdueSnags, pendingActions, setTab, navigate, primaryColor }) {
  return (
    <div className="p-4 space-y-4">
      {/* Welcome */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <p className="text-lg font-bold text-slate-900">Hi {op.name?.split(' ')[0]} 👋</p>
        <p className="text-sm text-slate-500">{op.project_name || 'No project assigned'}{op.role ? ` · ${op.role}` : ''}</p>
      </div>

      {/* Pending actions */}
      {pendingActions > 0 ? (
        <div className="rounded-xl p-4 text-white" style={{ backgroundColor: primaryColor }}>
          <p className="text-2xl font-bold">{pendingActions}</p>
          <p className="text-sm opacity-80">pending action{pendingActions !== 1 ? 's' : ''}</p>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-600" />
            <p className="text-sm font-semibold text-green-800">You're all up to date</p>
          </div>
        </div>
      )}

      {/* Unsigned documents */}
      {unsignedDocs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documents to Sign</p>
          <div className="space-y-1.5">
            {unsignedDocs.slice(0, 3).map(doc => (
              <button key={doc.id} onClick={() => navigate(`/operative/${op.id}/sign/${doc.id}`)}
                className="w-full bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3 text-left hover:border-blue-300 transition-colors">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                  <p className="text-xs text-amber-600 font-medium">Awaiting your signature</p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            ))}
            {unsignedDocs.length > 3 && (
              <button onClick={() => setTab('documents')} className="text-xs font-medium hover:underline" style={{ color: primaryColor }}>
                View all {unsignedDocs.length} documents →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Assigned snags */}
      {snags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Snags</p>
          <div className="space-y-1.5">
            {snags.slice(0, 3).map(snag => {
              const isOverdue = snag.due_date && new Date(snag.due_date) < new Date()
              return (
                <div key={snag.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isOverdue ? 'bg-red-50' : 'bg-blue-50'}`}>
                    <MapPin size={18} className={isOverdue ? 'text-red-500' : 'text-blue-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">#{snag.snag_number} — {snag.description?.slice(0, 40) || 'No description'}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">{snag.drawings?.name || 'Unknown drawing'}</span>
                      {isOverdue && <span className="text-red-600 font-bold">OVERDUE</span>}
                      {snag.due_date && !isOverdue && <span className="text-slate-400">Due {new Date(snag.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {snags.length > 3 && (
              <button onClick={() => setTab('snags')} className="text-xs font-medium hover:underline" style={{ color: primaryColor }}>
                View all {snags.length} snags →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unsigned toolbox talks */}
      {unsignedTalks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Toolbox Talks to Sign</p>
          <div className="space-y-1.5">
            {unsignedTalks.map(talk => (
              <button key={talk.id} onClick={() => navigate(`/toolbox/${talk.id}`)}
                className="w-full bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3 text-left hover:border-blue-300 transition-colors">
                <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                  <MessageSquare size={18} className="text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{talk.title}</p>
                  <p className="text-xs text-purple-600 font-medium">Awaiting your signature</p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ========== DOCUMENTS TAB ========== */
function DocumentsTab({ op, documents, signatures, signedDocIds, navigate, primaryColor }) {
  const unsigned = documents.filter(d => !signedDocIds.has(d.id))
  const signed = documents.filter(d => signedDocIds.has(d.id))

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Documents</h2>

      {unsigned.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Awaiting Signature ({unsigned.length})</p>
          <div className="space-y-1.5">
            {unsigned.map(doc => (
              <button key={doc.id} onClick={() => navigate(`/operative/${op.id}/sign/${doc.id}`)}
                className="w-full bg-white border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-amber-50 transition-colors">
                <FileText size={20} className="text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                  {doc.version > 1 && <p className="text-xs text-slate-500">Version {doc.version}</p>}
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-amber-100 text-amber-700 rounded-full shrink-0">Sign</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {signed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Signed ({signed.length})</p>
          <div className="space-y-1.5">
            {signed.map(doc => {
              const sig = signatures.find(s => s.document_id === doc.id && !s.invalidated)
              return (
                <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                    {sig && <p className="text-xs text-slate-500">Signed {new Date(sig.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {documents.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <FileText size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No documents assigned yet</p>
        </div>
      )}
    </div>
  )
}

/* ========== SNAGS TAB ========== */
function SnagsTab({ snags, overdueSnags, navigate, primaryColor }) {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Assigned Snags</h2>

      {overdueSnags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">{overdueSnags.length} overdue snag{overdueSnags.length !== 1 ? 's' : ''} — action required</p>
        </div>
      )}

      {snags.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <MapPin size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No snags assigned to you</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {snags.map(snag => {
            const isOverdue = snag.due_date && new Date(snag.due_date) < new Date()
            return (
              <div key={snag.id} className={`bg-white border rounded-xl p-4 ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {snag.snag_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{snag.description || 'No description'}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                      <span className="text-slate-500">{snag.drawings?.name}</span>
                      {snag.trade && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{snag.trade}</span>}
                      {snag.priority && (
                        <span className={`px-1.5 py-0.5 rounded font-medium ${
                          snag.priority === 'high' ? 'bg-red-50 text-red-600' :
                          snag.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                          'bg-blue-50 text-blue-600'
                        }`}>{snag.priority}</span>
                      )}
                      {isOverdue && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">OVERDUE</span>}
                    </div>
                    {snag.due_date && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                        <Clock size={10} /> Due {new Date(snag.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {snag.reply_token && (
                      <button onClick={() => navigate(`/snag-reply/${snag.reply_token}`)}
                        className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                        <Camera size={12} /> Submit Completion Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ========== TOOLBOX TAB ========== */
function ToolboxTab({ talks, signedTalkIds, unsignedTalks, navigate, primaryColor }) {
  const signed = talks.filter(t => signedTalkIds.has(t.id))

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Toolbox Talks</h2>

      {unsignedTalks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Awaiting Signature ({unsignedTalks.length})</p>
          <div className="space-y-1.5">
            {unsignedTalks.map(talk => (
              <button key={talk.id} onClick={() => navigate(`/toolbox/${talk.id}`)}
                className="w-full bg-white border border-purple-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-purple-50 transition-colors">
                <MessageSquare size={20} className="text-purple-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{talk.title}</p>
                  <p className="text-xs text-slate-500">{new Date(talk.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-purple-100 text-purple-700 rounded-full shrink-0">Sign</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {signed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Completed ({signed.length})</p>
          <div className="space-y-1.5">
            {signed.map(talk => (
              <div key={talk.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{talk.title}</p>
                  <p className="text-xs text-slate-500">{new Date(talk.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {talks.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No toolbox talks for your project</p>
        </div>
      )}
    </div>
  )
}

/* ========== PROFILE TAB ========== */
function ProfileTab({ op, handleLogout, navigate, primaryColor }) {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center">
        {op.photo_url ? (
          <img src={op.photo_url} alt={op.name} className="w-20 h-20 rounded-full object-cover border-4 border-slate-100" />
        ) : (
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: primaryColor }}>
            {op.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        )}
        <h2 className="text-lg font-bold text-slate-900 mt-3">{op.name}</h2>
        <p className="text-sm text-slate-500">{op.role || 'Operative'}</p>
        <p className="text-xs text-slate-400 mt-1">{op.company_name} · {op.project_name}</p>
      </div>

      <div className="space-y-2">
        <button onClick={() => navigate(`/operative/${op.id}/profile`)}
          className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 text-left hover:border-blue-300 transition-colors">
          <User size={20} className="text-slate-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Edit Profile</p>
            <p className="text-xs text-slate-500">Update your personal details</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <button onClick={() => navigate(`/operative/${op.id}/documents`)}
          className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 text-left hover:border-blue-300 transition-colors">
          <FileText size={20} className="text-slate-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">View & Sign Documents</p>
            <p className="text-xs text-slate-500">RAMS, induction packs</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <button onClick={handleLogout}
          className="w-full bg-white border border-red-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-red-50 transition-colors">
          <LogOut size={20} className="text-red-400" />
          <p className="text-sm font-medium text-red-600">Sign Out</p>
        </button>
      </div>
    </div>
  )
}
