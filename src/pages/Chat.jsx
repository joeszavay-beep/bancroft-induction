import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import {
  MessageSquare, Send, Search, ChevronLeft, Package, AlertTriangle,
  Wrench, Clock, CheckCircle2, User, Image
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
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    if (cid) loadConversations()
    // Poll for new messages every 10 seconds when on the conversation list
    const interval = setInterval(() => {
      if (cid && !selectedOp) loadConversations()
    }, 10000)
    return () => clearInterval(interval)
  }, [cid, selectedOp])

  async function loadConversations() {
    setLoading(true)
    // Get all messages for this company, grouped by operative
    const { data } = await supabase
      .from('chat_messages')
      .select('*, operatives(name, role, photo_url)')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })

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
    await loadMessages(conv.operative_id)

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
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      ).subscribe()

    loadConversations() // refresh unread counts
  }

  async function loadMessages(opId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('company_id', cid)
      .eq('operative_id', opId)
      .order('created_at')
    setMessages(data || [])
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedOp) return
    const msgText = newMsg.trim()
    setSending(true)
    // Optimistic: show immediately
    const tempMsg = {
      id: `temp-${Date.now()}`,
      company_id: cid,
      operative_id: selectedOp.operative_id,
      operative_name: selectedOp.operative_name,
      manager_id: user?.id,
      manager_name: user?.name || 'Manager',
      sender_type: 'manager',
      sender_name: user?.name || 'Manager',
      message: msgText,
      read_by_manager: true,
      read_by_operative: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    setNewMsg('')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    await supabase.from('chat_messages').insert({
      company_id: cid,
      project_id: null,
      operative_id: selectedOp.operative_id,
      operative_name: selectedOp.operative_name,
      manager_id: user?.id,
      manager_name: user?.name || 'Manager',
      sender_type: 'manager',
      sender_name: user?.name || 'Manager',
      message: msgText,
      read_by_manager: true,
      read_by_operative: false,
    })
    // Notify the operative
    await supabase.from('notifications').insert({
      company_id: cid,
      user_id: selectedOp.operative_id,
      title: `Message from ${user?.name || 'Manager'}`,
      body: msgText.length > 60 ? msgText.slice(0, 60) + '...' : msgText,
      type: 'info',
      link: '/worker',
    }).catch(() => {})
    setSending(false)
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
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
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

        {/* Input */}
        <div className="flex gap-2 px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Type a message..." className="flex-1 px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:border-[#1B6FC8]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }} />
          <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
            className="px-3.5 py-2.5 rounded-xl text-white disabled:opacity-40 transition-colors" style={{ backgroundColor: 'var(--primary-color)' }}>
            <Send size={18} />
          </button>
        </div>
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
      </div>

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
