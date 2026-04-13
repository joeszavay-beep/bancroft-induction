import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Loader2, HelpCircle, ArrowRight, ChevronDown, GripVertical } from 'lucide-react'

const SUGGESTIONS_MAP = {
  '/app/programme': ['How do I upload a DXF?', "What's a baseline length?", 'How do I link a layer?', 'How is progress calculated?'],
  '/app/snags': ['How do I raise a snag?', 'How do I assign a snag?', 'What happens when overdue?', 'How do I close a snag?'],
  '/app/workers': ['How do I add a worker?', 'How does CSCS verification work?', 'When do cert alerts fire?', 'How do workers sign documents?'],
  '/app/diary': ['How does weather auto-fill?', 'Can I edit past entries?', 'How do I export the diary?', 'What should I include?'],
  '/app/inspections': ['How do I create a checklist?', 'Can I reuse templates?', 'How do I attach photos?', 'How do I export?'],
  '/app/attendance': ['How do I print the QR poster?', 'How does fire muster work?', 'When does auto sign-out happen?', "Who's on site now?"],
  '/app/bim': ['How do I upload an IFC?', 'What is X-ray mode?', 'How do I measure in 3D?', 'How do I update element status?'],
  '/app/master-programme': ['How do I import from Asta?', 'How do I update progress?', 'What do the bar colours mean?', 'How do I export to CSV?'],
  '/app/labour': ['How do I post a labour request?', 'How does matching work?', 'What are preferred agencies?', 'How does auto-onboarding work?'],
  '/app/agency': ['How do I add operatives?', 'How do I respond to requests?', 'How does matching work?', 'How does auto-onboarding work?'],
}

const DEFAULT_SUGGESTIONS = ['How do I upload a drawing?', 'How does QR sign-in work?', 'How do I raise a snag?', "What's the programme tracker?"]

function getSuggestions() {
  try {
    const path = window.location.pathname
    for (const [prefix, suggestions] of Object.entries(SUGGESTIONS_MAP)) {
      if (path.startsWith(prefix)) return suggestions
    }
  } catch {}
  return DEFAULT_SUGGESTIONS
}

function renderMarkdown(text) {
  if (!text) return ''
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/^(\d+[.)]\s.+)$/gm, '<li class="ml-4 list-decimal text-[13px] leading-relaxed">$1</li>')
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ol class="my-1.5 space-y-0.5">$1</ol>')
  html = html.replace(/\n/g, '<br/>')
  html = html.replace(/<br\/>\s*<ol/g, '<ol').replace(/<\/ol>\s*<br\/>/g, '</ol>')
  return html
}

function loadWidgetState() {
  try {
    return JSON.parse(localStorage.getItem('coresite_help_widget') || 'null')
  } catch { return null }
}

function saveWidgetState(state) {
  localStorage.setItem('coresite_help_widget', JSON.stringify(state))
}

const DEFAULT_WIDTH = 400
const DEFAULT_HEIGHT = 560
const MIN_WIDTH = 320
const MIN_HEIGHT = 400

export default function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLabel, setShowLabel] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Position & size
  const saved = loadWidgetState()
  const [pos, setPos] = useState({ x: saved?.x ?? null, y: saved?.y ?? null })
  const [size, setSize] = useState({ w: saved?.w ?? DEFAULT_WIDTH, h: saved?.h ?? DEFAULT_HEIGHT })

  // Drag state
  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(false), 8000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // Save position/size when they change
  useEffect(() => {
    if (open && (pos.x !== null || size.w !== DEFAULT_WIDTH)) {
      saveWidgetState({ x: pos.x, y: pos.y, w: size.w, h: size.h })
    }
  }, [pos, size, open])

  // --- Drag handler ---
  const handleDragStart = (e) => {
    if (e.target.closest('button')) return // don't drag from close button
    e.preventDefault()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const panel = e.currentTarget.closest('[data-help-panel]')
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { offsetX: clientX - rect.left, offsetY: clientY - rect.top }

    const handleMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      const newX = Math.max(0, Math.min(window.innerWidth - size.w, cx - dragRef.current.offsetX))
      const newY = Math.max(0, Math.min(window.innerHeight - size.h, cy - dragRef.current.offsetY))
      setPos({ x: newX, y: newY })
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleUp)
      dragRef.current = null
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchend', handleUp)
  }

  // --- Resize handler ---
  const handleResizeStart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    resizeRef.current = { startX: clientX, startY: clientY, startW: size.w, startH: size.h }

    const handleMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      const newW = Math.max(MIN_WIDTH, resizeRef.current.startW + (cx - resizeRef.current.startX))
      const newH = Math.max(MIN_HEIGHT, resizeRef.current.startH + (cy - resizeRef.current.startY))
      setSize({ w: newW, h: newH })
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleUp)
      resizeRef.current = null
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchend', handleUp)
  }

  const sendMessage = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, I couldn\'t get a response.' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: err.message?.includes('Too many') ? err.message : 'Something went wrong — try again or email support@coresite.io' }])
    } finally {
      setLoading(false)
    }
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    sendMessage(text)
  }

  // Panel position: use saved position or default to bottom-right
  const panelStyle = pos.x !== null
    ? { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 60 }
    : { position: 'fixed', right: 20, bottom: 80, width: size.w, height: size.h, zIndex: 60 }

  // On mobile, override to full screen
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  return createPortal(
    <div id="coresite-help-widget">
      {/* Chat panel */}
      {open && (
        <div
          data-help-panel
          style={isMobile ? { position: 'fixed', inset: 0, zIndex: 60 } : panelStyle}
        >
          <div className="flex flex-col bg-white shadow-2xl shadow-black/20 overflow-hidden w-full h-full rounded-none sm:rounded-2xl border border-slate-200/50" style={{ userSelect: dragRef.current ? 'none' : 'auto' }}>

            {/* Header — draggable */}
            <div
              className="shrink-0 cursor-move select-none"
              style={{ background: 'linear-gradient(135deg, #1A2744 0%, #1B6FC8 100%)' }}
              onMouseDown={!isMobile ? handleDragStart : undefined}
              onTouchStart={!isMobile ? handleDragStart : undefined}
            >
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" opacity="0.4" />
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                      <circle cx="12" cy="12" r="2" fill="white" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-white font-semibold text-[13px] tracking-wide">CoreSite Help</h2>
                    <p className="text-white/40 text-[10px]">Drag header to move &middot; Drag corner to resize</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-white/50 hover:text-white transition-colors p-2 -mr-2 rounded-lg hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex flex-col h-full">
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A2744 0%, #1B6FC8 100%)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" opacity="0.3" />
                        <line x1="12" y1="2" x2="12" y2="6" />
                        <line x1="12" y1="18" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="6" y2="12" />
                        <line x1="18" y1="12" x2="22" y2="12" />
                        <circle cx="12" cy="12" r="2" fill="white" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <h3 className="text-[17px] font-bold text-slate-900">Need a hand?</h3>
                      <p className="text-[13px] text-slate-400 mt-1">I know CoreSite inside out. Ask me anything.</p>
                    </div>
                  </div>
                  <div className="space-y-2 pb-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">Quick questions</p>
                    {getSuggestions().map((q) => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] text-slate-700 bg-slate-50 hover:bg-[#1B6FC8]/5 border border-slate-100 hover:border-[#1B6FC8]/20 transition-all flex items-center justify-between group">
                        <span>{q}</span>
                        <ArrowRight size={14} className="text-slate-300 group-hover:text-[#1B6FC8] transition-colors shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'linear-gradient(135deg, #1A2744 0%, #1B6FC8 100%)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="2" fill="white" />
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                          </svg>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-[#1B6FC8] text-white rounded-br-md'
                            : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-md'
                        }`}
                        dangerouslySetInnerHTML={msg.role === 'assistant' ? { __html: renderMarkdown(msg.content) } : undefined}
                      >
                        {msg.role === 'user' ? msg.content : undefined}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start gap-2">
                      <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A2744 0%, #1B6FC8 100%)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="2" fill="white" />
                        </svg>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-[#1B6FC8]/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-[#1B6FC8]/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-[#1B6FC8]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your question..."
                  className="flex-1 bg-slate-50 rounded-xl px-4 py-2.5 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1B6FC8]/30 border border-slate-200 focus:border-[#1B6FC8]/40 transition-all"
                  disabled={loading} />
                <button type="submit" disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-xl bg-[#1B6FC8] text-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-[#155ba3] transition-all active:scale-95">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
              <p className="text-[10px] text-slate-300 text-center mt-2">Powered by CoreSite AI</p>
            </div>

            {/* Resize handle — bottom right corner (desktop only) */}
            {!isMobile && (
              <div
                className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize group"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" className="absolute bottom-1 right-1 text-slate-300 group-hover:text-[#1B6FC8] transition-colors">
                  <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => { setOpen(true); setShowLabel(false) }}
        className={`fixed bottom-5 right-5 z-[60] group transition-all duration-300 ${open ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
      >
        <div className={`absolute bottom-full right-0 mb-2 transition-all duration-500 ${showLabel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
          <div className="bg-slate-800 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            Need help? Ask me anything
            <div className="absolute -bottom-1 right-6 w-2 h-2 bg-slate-800 rotate-45" />
          </div>
        </div>
        <div className="w-14 h-14 rounded-full shadow-lg shadow-[#1B6FC8]/30 flex items-center justify-center transition-all group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#1B6FC8]/40 active:scale-95" style={{ background: 'linear-gradient(135deg, #1A2744 0%, #1B6FC8 100%)' }}>
          <HelpCircle size={26} className="text-white" />
        </div>
      </button>
    </div>,
    document.body
  )
}
