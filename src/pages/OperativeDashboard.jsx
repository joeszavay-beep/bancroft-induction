import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  Home, FileText, MapPin, MessageSquare, User, LogOut, Bell,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, Camera, X,
  Send, ZoomIn, Upload, ArrowLeft
} from 'lucide-react'

const TABS = ['home', 'documents', 'snags', 'chat', 'profile']

const QUICK_MESSAGES = [
  { icon: 'Package', label: 'Material Request', text: 'Material needed: ' },
  { icon: 'Wrench', label: 'Tool Request', text: 'Tool needed: ' },
  { icon: 'AlertTriangle', label: 'Report Issue', text: 'Issue on site: ' },
  { icon: 'Clock', label: 'Running Late', text: 'Running late — ETA: ' },
  { icon: 'CheckCircle2', label: 'Job Complete', text: 'Completed: ' },
]

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

  // Chat
  const [chatMessages, setChatMessages] = useState([])
  const [chatMsg, setChatMsg] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [managers, setManagers] = useState([])
  const [selectedManager, setSelectedManager] = useState(null)
  const chatEndRef = useRef(null)
  const chatChannelRef = useRef(null)

  // Snag detail
  const [selectedSnag, setSelectedSnag] = useState(null)
  const [snagComments, setSnagComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const session = sessionStorage.getItem('operative_session')
    if (!session) { navigate('/worker-login'); return }
    const data = JSON.parse(session)
    setOp(data)
    loadData(data)
    loadChat(data)
    // Poll chat every 5 seconds for new messages
    const chatPoll = setInterval(() => loadChat(data), 5000)
    return () => {
      clearInterval(chatPoll)
      if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current)
    }
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

  async function loadChat(opData) {
    // Load managers for this company
    const { data: mgrs } = await supabase.from('profiles').select('id, name, email, role')
      .eq('company_id', opData.company_id).order('name')
    setManagers(mgrs || [])

    // Load all messages for this operative
    const { data } = await supabase.from('chat_messages').select('*')
      .eq('operative_id', opData.id).order('created_at')
    setChatMessages(data || [])
    const unread = (data || []).filter(m => m.sender_type === 'manager' && !m.read_by_operative).length
    setUnreadChat(unread)

    // Realtime
    if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current)
    chatChannelRef.current = supabase
      .channel(`op-chat-${opData.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `operative_id=eq.${opData.id}` },
        (payload) => {
          setChatMessages(prev => [...prev, payload.new])
          if (payload.new.sender_type === 'manager') setUnreadChat(prev => prev + 1)
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      ).subscribe()
  }

  async function sendChat() {
    if (!chatMsg.trim() || !op || !selectedManager) return
    const msgText = chatMsg.trim()
    setChatSending(true)
    // Optimistic: show immediately
    const tempMsg = {
      id: `temp-${Date.now()}`,
      company_id: op.company_id,
      operative_id: op.id,
      operative_name: op.name,
      manager_id: selectedManager.id,
      manager_name: selectedManager.name,
      sender_type: 'operative',
      sender_name: op.name,
      message: msgText,
      read_by_manager: false,
      read_by_operative: true,
      created_at: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, tempMsg])
    setChatMsg('')
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    await supabase.from('chat_messages').insert({
      company_id: op.company_id,
      operative_id: op.id,
      operative_name: op.name,
      manager_id: selectedManager.id,
      manager_name: selectedManager.name,
      sender_type: 'operative',
      sender_name: op.name,
      message: msgText,
      read_by_manager: false,
      read_by_operative: true,
    })
    // Notify the manager
    await supabase.from('notifications').insert({
      company_id: op.company_id,
      user_id: selectedManager.id,
      title: `Message from ${op.name}`,
      body: msgText.length > 60 ? msgText.slice(0, 60) + '...' : msgText,
      type: 'info',
      link: '/app/messages',
    }).catch(() => {})
    setChatSending(false)
  }

  async function markChatRead(managerId) {
    if (!op) return
    let q = supabase.from('chat_messages').update({ read_by_operative: true })
      .eq('operative_id', op.id).eq('sender_type', 'manager').eq('read_by_operative', false)
    if (managerId) q = q.eq('manager_id', managerId)
    await q
    const remaining = chatMessages.filter(m => m.sender_type === 'manager' && !m.read_by_operative && (managerId ? m.manager_id !== managerId : false)).length
    setUnreadChat(remaining)
  }

  function handleLogout() {
    sessionStorage.removeItem('operative_session')
    navigate('/worker-login')
  }

  async function openSnag(snag) {
    setSelectedSnag(snag)
    const { data } = await supabase.from('snag_comments').select('*').eq('snag_id', snag.id).order('created_at')
    setSnagComments(data || [])
  }

  async function addSnagComment() {
    if (!newComment.trim() || !selectedSnag) return
    setSendingComment(true)
    await supabase.from('snag_comments').insert({
      snag_id: selectedSnag.id,
      comment: newComment.trim(),
      author_name: op.name,
      author_role: 'Operative',
    })
    setNewComment('')
    setSendingComment(false)
    const { data } = await supabase.from('snag_comments').select('*').eq('snag_id', selectedSnag.id).order('created_at')
    setSnagComments(data || [])
    toast.success('Comment added')
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
        {tab === 'snags' && <SnagsTab snags={snags} overdueSnags={overdueSnags} navigate={navigate} primaryColor={primaryColor} openSnag={openSnag} />}
        {tab === 'chat' && <OperativeChatTab op={op} messages={chatMessages} chatMsg={chatMsg} setChatMsg={setChatMsg} sendChat={sendChat} chatSending={chatSending} chatEndRef={chatEndRef} markChatRead={markChatRead} primaryColor={primaryColor} managers={managers} selectedManager={selectedManager} setSelectedManager={setSelectedManager} />}
        {tab === 'profile' && <ProfileTab op={op} handleLogout={handleLogout} navigate={navigate} primaryColor={primaryColor} />}
      </main>

      {/* Snag detail modal */}
      {selectedSnag && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Header */}
          <header className="bg-[#0D1526] text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <button onClick={() => setSelectedSnag(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><ArrowLeft size={20} /></button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Snag #{selectedSnag.snag_number}</p>
              <p className="text-[11px] text-white/50 truncate">{selectedSnag.drawings?.name}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
              selectedSnag.status === 'open' ? 'bg-red-500/20 text-red-300' :
              selectedSnag.status === 'completed' ? 'bg-green-500/20 text-green-300' :
              selectedSnag.status === 'pending_review' ? 'bg-purple-500/20 text-purple-300' :
              'bg-white/10 text-white/60'
            }`}>{selectedSnag.status?.toUpperCase()}</span>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {/* Photo */}
            {selectedSnag.photo_url && (
              <button onClick={() => setLightbox(selectedSnag.photo_url)} className="w-full relative group">
                <img src={selectedSnag.photo_url} alt="Snag" className="w-full h-48 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg" />
                </div>
              </button>
            )}

            <div className="p-4 space-y-4">
              {/* Description */}
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedSnag.description || 'No description'}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  {selectedSnag.trade && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{selectedSnag.trade}</span>}
                  {selectedSnag.priority && (
                    <span className={`px-2 py-0.5 rounded font-medium ${
                      selectedSnag.priority === 'high' ? 'bg-red-50 text-red-600' :
                      selectedSnag.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                    }`}>{selectedSnag.priority}</span>
                  )}
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-2">
                {selectedSnag.due_date && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Due Date</p>
                    <p className={`text-sm font-medium mt-0.5 ${selectedSnag.due_date && new Date(selectedSnag.due_date) < new Date() ? 'text-red-600' : 'text-slate-900'}`}>
                      {new Date(selectedSnag.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {selectedSnag.raised_by && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Raised By</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedSnag.raised_by}</p>
                  </div>
                )}
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Created</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{new Date(selectedSnag.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
                {selectedSnag.type && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Type</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedSnag.type}</p>
                  </div>
                )}
              </div>

              {/* Review photo if pending */}
              {selectedSnag.review_photo_url && (
                <div>
                  <p className="text-[10px] text-purple-600 uppercase font-semibold mb-1.5">Completion Photo Submitted</p>
                  <button onClick={() => setLightbox(selectedSnag.review_photo_url)} className="relative group w-full">
                    <img src={selectedSnag.review_photo_url} alt="Review" className="w-full h-36 object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                  </button>
                </div>
              )}

              {/* Submit photo button */}
              {selectedSnag.reply_token && (selectedSnag.status === 'open' || selectedSnag.status === 'reassigned') && (
                <button onClick={() => { setSelectedSnag(null); navigate(`/snag-reply/${selectedSnag.reply_token}`) }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#2EA043] hover:bg-[#27903A] text-white text-sm font-semibold rounded-xl transition-colors">
                  <Camera size={16} /> Submit Completion Photo
                </button>
              )}

              {/* Comments */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Comments ({snagComments.length})
                </p>

                {snagComments.length > 0 && (
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {snagComments.map(c => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold shrink-0">
                          {(c.author_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-slate-900">{c.author_name}</p>
                            <span className="text-[10px] text-slate-400">{c.author_role}</span>
                            <span className="text-[10px] text-slate-300 ml-auto">{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-0.5">{c.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addSnagComment() } }}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400"
                  />
                  <button onClick={addSnagComment} disabled={sendingComment || !newComment.trim()}
                    className="px-3 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg disabled:opacity-40 transition-colors">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><X size={24} /></button>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around py-2 px-1 z-40" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'documents', icon: FileText, label: 'Docs', badge: unsignedDocs.length },
          { id: 'snags', icon: MapPin, label: 'Snags', badge: snags.length },
          { id: 'chat', icon: MessageSquare, label: 'Chat', badge: unreadChat },
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
function SnagsTab({ snags, overdueSnags, navigate, primaryColor, openSnag }) {
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
              <button key={snag.id} onClick={() => openSnag(snag)} className={`w-full text-left bg-white border rounded-xl p-4 hover:shadow-md transition-all ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
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
                      <span className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                        <Camera size={12} /> Tap to view & respond
                      </span>
                    )}
                  </div>
                </div>
              </button>
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

/* ========== CHAT TAB ========== */
function OperativeChatTab({ op, messages, chatMsg, setChatMsg, sendChat, chatSending, chatEndRef, markChatRead, primaryColor, managers, selectedManager, setSelectedManager }) {
  useEffect(() => { if (selectedManager) markChatRead(selectedManager.id) }, [selectedManager])

  // Filter messages for selected manager
  const filteredMessages = selectedManager
    ? messages.filter(m => m.manager_id === selectedManager.id || (!m.manager_id && m.sender_type === 'manager'))
    : []

  // Compute unread per manager
  const unreadByManager = {}
  messages.forEach(m => {
    if (m.sender_type === 'manager' && !m.read_by_operative && m.manager_id) {
      unreadByManager[m.manager_id] = (unreadByManager[m.manager_id] || 0) + 1
    }
  })

  // Manager selection screen
  if (!selectedManager) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Messages</h2>
        <p className="text-sm text-slate-500">Select a manager to chat with</p>

        {managers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No managers available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {managers.map(mgr => {
              const unread = unreadByManager[mgr.id] || 0
              const lastMsg = [...messages].reverse().find(m => m.manager_id === mgr.id || (m.sender_type === 'operative' && m.manager_id === mgr.id))
              return (
                <button key={mgr.id} onClick={() => { setSelectedManager(mgr); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) }}
                  className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: primaryColor }}>
                    {mgr.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{mgr.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{mgr.role || 'Manager'}</p>
                  </div>
                  {unread > 0 && (
                    <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: primaryColor }}>
                      {unread}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Chat thread with selected manager
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Manager header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <button onClick={() => setSelectedManager(null)} className="p-1 text-slate-400"><ArrowLeft size={18} /></button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>
          {selectedManager.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{selectedManager.name}</p>
          <p className="text-[10px] text-slate-500 capitalize">{selectedManager.role || 'Manager'}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#F0F2F5' }}>
        {filteredMessages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Send the first message to {selectedManager.name?.split(' ')[0]}</p>
          </div>
        )}
        {filteredMessages.map(msg => {
          const isMe = msg.sender_type === 'operative'
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isMe ? 'rounded-br-md text-white' : 'rounded-bl-md bg-white border border-slate-200'}`}
                style={isMe ? { backgroundColor: primaryColor } : {}}>
                {!isMe && <p className="text-[10px] font-semibold mb-0.5" style={{ color: primaryColor }}>{msg.sender_name}</p>}
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p className={`text-[10px] mt-1 ${isMe ? 'text-white/50' : 'text-slate-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Quick messages */}
      <div className="flex gap-1.5 px-4 py-2 overflow-x-auto shrink-0 bg-white border-t border-slate-200">
        {QUICK_MESSAGES.map(qm => (
          <button key={qm.label} onClick={() => setChatMsg(qm.text)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border border-slate-200 text-slate-500 whitespace-nowrap shrink-0 hover:border-blue-300 hover:text-blue-600 transition-colors">
            {qm.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 bg-white border-t border-slate-200 shrink-0">
        <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
          placeholder={`Message ${selectedManager.name?.split(' ')[0]}...`}
          className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400" />
        <button onClick={sendChat} disabled={chatSending || !chatMsg.trim()}
          className="px-3.5 py-2.5 rounded-xl text-white disabled:opacity-40 transition-colors" style={{ backgroundColor: primaryColor }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
