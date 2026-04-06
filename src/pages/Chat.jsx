import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import {
  MessageSquare, Send, Search, ChevronLeft, Package, AlertTriangle,
  Wrench, Clock, CheckCircle2, User, Image, Paperclip, X, ZoomIn
} from 'lucide-react'

const QUICK_MESSAGES = [
  { icon: Package, label: 'Material Request', text: 'Material needed: ' },
  { icon: Wrench, label: 'Tool Request', text: 'Tool needed: ' },
  { icon: AlertTriangle, label: 'Report Issue', text: 'Issue on site: ' },
  { icon: Clock, label: 'Running Late', text: 'Running late — ETA: ' },
]

/**
 * Manager chat page — shows all conversations with operatives.
 * Used inside SidebarLayout at /app/messages.
 */
export default function Chat() {
  const { user } = useCompany()
  const cid = user?.company_id || JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [conversations, setConversations] = useState([])
  const [selectedOp, setSelectedOp] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [allOperatives, setAllOperatives] = useState([])
  const [opSearch, setOpSearch] = useState('')
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!cid) return
    loadConversations()
    const interval = setInterval(() => {
      if (!selectedOp) loadConversations()
    }, 10000)
    return () => clearInterval(interval)
  }, [cid, selectedOp])

  async function loadConversations() {
    if (!cid) return
    setLoading(true)
    // Get all messages for this company, grouped by operative
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, operatives(name, role, photo_url)')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
    if (error) { console.error('Chat load error:', error); setLoading(false); return }

    // Group by operative and get latest message + unread count
    const opMap = {}
    for (const msg of (data || [])) {
      const opId = msg.operative_id
      if (!opMap[opId]) {
        opMap[opId] = {
          operative_id: opId,
          operative_name: msg.operative_name || msg.operatives?.name || 'Unknown',
          operative_role: msg.operatives?.role,
          operative_photo: msg.operatives?.photo_url,
          lastMessage: msg.message,
          lastTime: msg.created_at,
          lastSender: msg.sender_type,
          unread: 0,
        }
      }
      if (msg.sender_type === 'operative' && !msg.read_by_manager) {
        opMap[opId].unread++
      }
    }
    setConversations(Object.values(opMap).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime)))
    setLoading(false)
  }

  async function openConversation(conv) {
    setSelectedOp(conv)
    await loadMessages(conv.operative_id, true)

    // Mark as read
    await supabase.from('chat_messages')
      .update({ read_by_manager: true })
      .eq('company_id', cid)
      .eq('operative_id', conv.operative_id)
      .eq('sender_type', 'operative')
      .eq('read_by_manager', false)

    // Subscribe to realtime
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel(`chat-${conv.operative_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `operative_id=eq.${conv.operative_id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new])
          if (payload.new.sender_type === 'operative') {
            supabase.from('chat_messages').update({ read_by_manager: true }).eq('id', payload.new.id).then(() => {})
          }
          setTimeout(() => messagesEndRef.current?.parentElement?.scrollTo({ top: messagesEndRef.current.parentElement.scrollHeight, behavior: 'smooth' }), 100)
        }
      ).subscribe()

    loadConversations() // refresh unread counts
  }

  async function loadMessages(opId, scroll = false) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('company_id', cid)
      .eq('operative_id', opId)
      .order('created_at')
    const newMsgs = data || []
    const hadNew = newMsgs.length !== messages.length
    setMessages(newMsgs)
    if (scroll || hadNew) {
      setTimeout(() => messagesEndRef.current?.parentElement?.scrollTo({ top: messagesEndRef.current.parentElement.scrollHeight, behavior: 'smooth' }), 100)
    }
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function sendMessage() {
    if ((!newMsg.trim() && !photoFile) || !selectedOp) return
    const msgText = newMsg.trim()
    setSending(true)

    // Upload photo if attached
    let photoUrl = null
    if (photoFile) {
      const path = `chat/${cid}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('documents').upload(path, photoFile, { contentType: photoFile.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }
    }

    // Optimistic: show immediately
    const tempMsg = {
      id: `temp-${crypto.randomUUID()}`,
      company_id: cid,
      operative_id: selectedOp.operative_id,
      operative_name: selectedOp.operative_name,
      manager_id: user?.id,
      manager_name: user?.name || 'Manager',
      sender_type: 'manager',
      sender_name: user?.name || 'Manager',
      message: msgText || (photoUrl ? '📷 Photo' : ''),
      photo_url: photoUrl || photoPreview,
      read_by_manager: true,
      read_by_operative: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    setNewMsg('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setTimeout(() => messagesEndRef.current?.parentElement?.scrollTo({ top: messagesEndRef.current.parentElement.scrollHeight, behavior: 'smooth' }), 50)

    await supabase.from('chat_messages').insert({
      company_id: cid,
      project_id: null,
      operative_id: selectedOp.operative_id,
      operative_name: selectedOp.operative_name,
      manager_id: user?.id,
      manager_name: user?.name || 'Manager',
      sender_type: 'manager',
      sender_name: user?.name || 'Manager',
      message: msgText || (photoUrl ? '📷 Photo' : ''),
      photo_url: photoUrl,
      read_by_manager: true,
      read_by_operative: false,
    })
    // Notify the operative
    await supabase.from('notifications').insert({
      company_id: cid,
      user_id: selectedOp.operative_id,
      title: `Message from ${user?.name || 'Manager'}`,
      body: photoUrl ? '📷 Sent a photo' : (msgText.length > 60 ? msgText.slice(0, 60) + '...' : msgText),
      type: 'info',
      link: '/worker',
    }).catch(() => {})
    setSending(false)
  }

  async function openNewChat() {
    const { data } = await supabase.from('operatives').select('id, name, role, photo_url')
      .eq('company_id', cid).order('name')
    setAllOperatives(data || [])
    setShowNewChat(true)
    setOpSearch('')
  }

  function startChatWith(op) {
    setShowNewChat(false)
    const conv = {
      operative_id: op.id,
      operative_name: op.name,
      operative_role: op.role,
      operative_photo: op.photo_url,
    }
    openConversation(conv)
  }

  // Poll the active conversation for new messages every 5 seconds
  useEffect(() => {
    if (!selectedOp) return
    const interval = setInterval(() => loadMessages(selectedOp.operative_id), 5000)
    return () => {
      clearInterval(interval)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [selectedOp])

  const filteredConvs = conversations.filter(c =>
    c.operative_name.toLowerCase().includes(search.toLowerCase())
  )
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)

  const timeAgo = (d) => {
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    return `${Math.floor(mins / 1440)}d`
  }

  // Chat thread view
  if (selectedOp) {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => { setSelectedOp(null); loadConversations() }} className="p-1" style={{ color: 'var(--text-muted)' }}>
            <ChevronLeft size={20} />
          </button>
          {selectedOp.operative_photo ? (
            <img src={selectedOp.operative_photo} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: 'var(--primary-color)' }}>
              {selectedOp.operative_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{selectedOp.operative_name}</p>
            {selectedOp.operative_role && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{selectedOp.operative_role}</p>}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: 'var(--bg-main)' }}>
          {messages.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>No messages yet. Send the first one.</p>
          )}
          {messages.map(msg => {
            const isMe = msg.sender_type === 'manager'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isMe ? 'rounded-br-md' : 'rounded-bl-md'}`}
                  style={{ backgroundColor: isMe ? 'var(--primary-color)' : 'var(--bg-card)', color: isMe ? '#fff' : 'var(--text-primary)', border: isMe ? 'none' : '1px solid var(--border-color)' }}>
                  {!isMe && <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--primary-color)' }}>{msg.sender_name}</p>}
                  {msg.photo_url && (
                    <button onClick={() => setLightbox(msg.photo_url)} className="w-full mb-1.5 rounded-lg overflow-hidden">
                      <img src={msg.photo_url} alt="" className="w-full max-h-48 object-cover rounded-lg" />
                    </button>
                  )}
                  {msg.message && msg.message !== '📷 Photo' && <p className="text-sm whitespace-pre-wrap">{msg.message}</p>}
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-white/50' : ''}`} style={isMe ? {} : { color: 'var(--text-muted)' }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isMe && msg.read_by_operative && ' ✓✓'}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick messages */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto shrink-0 border-t" style={{ borderColor: 'var(--border-color)' }}>
          {QUICK_MESSAGES.map(qm => (
            <button key={qm.label} onClick={() => setNewMsg(qm.text)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border whitespace-nowrap shrink-0"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              <qm.icon size={10} /> {qm.label}
            </button>
          ))}
        </div>

        {/* Photo preview */}
        {photoPreview && (
          <div className="px-4 py-2 border-t shrink-0" style={{ borderColor: 'var(--border-color)' }}>
            <div className="relative inline-block">
              <img src={photoPreview} alt="" className="h-20 rounded-lg object-cover" />
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={10} /></button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <label className="px-2.5 py-2.5 rounded-xl cursor-pointer hover:opacity-70 transition-colors flex items-center" style={{ color: 'var(--text-muted)' }}>
            <Paperclip size={18} />
            <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
          </label>
          <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Type a message..." className="flex-1 px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:border-[#1B6FC8]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }} />
          <button onClick={sendMessage} disabled={sending || (!newMsg.trim() && !photoFile)}
            className="px-3.5 py-2.5 rounded-xl text-white disabled:opacity-40 transition-colors" style={{ backgroundColor: 'var(--primary-color)' }}>
            <Send size={18} />
          </button>
        </div>

        {/* Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><X size={24} /></button>
          </div>
        )}
      </div>
    )
  }

  // Conversation list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Messages</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
          </p>
        </div>
        <button onClick={openNewChat}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: 'var(--primary-color)' }}>
          <Send size={14} /> New Chat
        </button>
      </div>

      {/* New chat — operative picker */}
      {showNewChat && (
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Select an operative</p>
            <button onClick={() => setShowNewChat(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
          </div>
          <div className="p-3">
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input value={opSearch} onChange={e => setOpSearch(e.target.value)} placeholder="Search operatives..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-[#1B6FC8]"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }} autoFocus />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {allOperatives.filter(o => o.name.toLowerCase().includes(opSearch.toLowerCase())).map(op => (
                <button key={op.id} onClick={() => startChatWith(op)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-main)' }}>
                  {op.photo_url ? (
                    <img src={op.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
                      {op.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{op.name}</p>
                    {op.role && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{op.role}</p>}
                  </div>
                </button>
              ))}
              {allOperatives.length === 0 && (
                <p className="text-center py-4 text-sm" style={{ color: 'var(--text-muted)' }}>No operatives found</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..."
          className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:border-[#1B6FC8]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--primary-color)' }} /></div>
      ) : filteredConvs.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{search ? 'No matching conversations' : 'No messages yet'}</p>
          <p className="text-xs mt-1">Messages from operatives will appear here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredConvs.map(conv => (
            <button key={conv.operative_id} onClick={() => openConversation(conv)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors hover:opacity-90"
              style={{ backgroundColor: conv.unread > 0 ? 'var(--primary-color)08' : 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {conv.operative_photo ? (
                <img src={conv.operative_photo} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
                  {conv.operative_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{conv.operative_name}</p>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(conv.lastTime)}</span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {conv.lastSender === 'manager' ? 'You: ' : ''}{conv.lastMessage}
                </p>
              </div>
              {conv.unread > 0 && (
                <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
                  {conv.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
