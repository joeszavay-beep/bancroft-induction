import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react'

const SUGGESTIONS_MAP = {
  '/app/programme': ['How do I upload a DXF?', "What's a baseline length?", 'How do I link a layer?', 'How is progress calculated?'],
  '/app/snags': ['How do I raise a snag?', 'How do I assign a snag?', 'What happens when overdue?', 'How do I close a snag?'],
  '/app/workers': ['How do I add a worker?', 'How does CSCS verification work?', 'When do cert alerts fire?', 'How do workers sign documents?'],
  '/app/diary': ['How does weather auto-fill work?', 'Can I edit past entries?', 'How do I export the diary?', 'What should I include?'],
  '/app/inspections': ['How do I create a checklist?', 'Can I reuse templates?', 'How do I attach photos?', 'How do I export?'],
  '/app/attendance': ['How do I print the QR poster?', 'How does fire muster work?', 'When does auto sign-out happen?', "Who's on site right now?"],
  '/app/bim': ['How do I upload an IFC?', 'What is X-ray mode?', 'How do I measure in 3D?', 'How do I update element status?'],
  '/app/master-programme': ['How do I import from Asta?', 'How do I update progress?', 'What do the bar colours mean?', 'How do I export to CSV?'],
  '/app/labour': ['How do I post a labour request?', 'How does matching work?', 'What are preferred agencies?', 'How does auto-onboarding work?'],
  '/app/agency': ['How do I post a labour request?', 'How does matching work?', 'What are preferred agencies?', 'How does auto-onboarding work?'],
}

const DEFAULT_SUGGESTIONS = ['How do I upload a drawing?', 'How does QR sign-in work?', 'How do I raise a snag?', "What's the programme tracker?"]

function getSuggestions() {
  const path = window.location.pathname
  for (const [prefix, suggestions] of Object.entries(SUGGESTIONS_MAP)) {
    if (path.startsWith(prefix)) return suggestions
  }
  return DEFAULT_SUGGESTIONS
}

function isAppRoute() {
  try {
    const path = window.location.pathname
    return path === '/app' || path.startsWith('/app/')
  } catch {
    return false
  }
}

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Numbered lists: lines starting with digits followed by . or )
  html = html.replace(/^(\d+[.)]\s.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
  // Wrap consecutive <li> in <ol>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ol class="my-1">$1</ol>')
  // Line breaks (but not inside list items)
  html = html.replace(/\n/g, '<br/>')
  // Clean up <br/> right after </ol> or before <ol>
  html = html.replace(/<br\/>\s*<ol/g, '<ol')
  html = html.replace(/<\/ol>\s*<br\/>/g, '</ol>')
  return html
}

export default function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPulse, setShowPulse] = useState(true)
  const [visible, setVisible] = useState(isAppRoute)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Check route visibility
  useEffect(() => {
    function check() {
      setVisible(isAppRoute())
    }
    check()
    window.addEventListener('popstate', check)
    // Also listen for pushState/replaceState via a periodic check
    const interval = setInterval(check, 500)
    return () => {
      window.removeEventListener('popstate', check)
      clearInterval(interval)
    }
  }, [])

  // Pulse for first 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 10000)
    return () => clearTimeout(timer)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

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
        body: JSON.stringify({ messages: newMessages, pageRoute: window.location.pathname }),
      })
      const data = await res.json()
      const assistantMsg = { role: 'assistant', content: data.message || data.reply || data.content || 'Sorry, I could not get a response.' }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
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

  const handleSuggestion = (text) => {
    sendMessage(text)
  }

  if (!visible) return null

  return (
    <>
      {/* Chat panel */}
      <div
        className={`fixed z-50 transition-all duration-300 ${
          open
            ? 'opacity-100 translate-y-0 inset-0 sm:inset-auto sm:bottom-20 sm:right-4'
            : 'opacity-0 translate-y-4 pointer-events-none bottom-20 right-4'
        }`}
      >
        <div className={`flex flex-col bg-white dark:bg-slate-900 shadow-2xl overflow-hidden ${
          open ? 'w-full h-full sm:w-[380px] sm:h-[520px] sm:rounded-xl rounded-none' : 'w-[380px] h-[520px] rounded-xl'
        }`}>
          {/* Header */}
          <div className="bg-[#1B6FC8] px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-white/80" />
              <h2 className="text-white font-semibold text-sm">CoreSite Help</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              /* Welcome state */
              <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
                <div className="w-12 h-12 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center">
                  <Sparkles size={24} className="text-[#1B6FC8]" />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1e293b)' }}>
                  How can I help?
                </h3>
                <div className="w-full space-y-2">
                  {getSuggestions().map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestion(q)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 hover:bg-[#1B6FC8]/5 hover:border-[#1B6FC8]/30 transition-colors"
                      style={{ color: 'var(--text-primary, #334155)' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#1B6FC8] text-white rounded-br-sm'
                          : 'bg-slate-100 dark:bg-slate-800 rounded-bl-sm'
                      }`}
                      style={msg.role === 'assistant' ? { color: 'var(--text-primary, #334155)' } : undefined}
                      dangerouslySetInnerHTML={
                        msg.role === 'assistant'
                          ? { __html: renderMarkdown(msg.content) }
                          : undefined
                      }
                    >
                      {msg.role === 'user' ? msg.content : undefined}
                    </div>
                  </div>
                ))}
                {/* Typing indicator */}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1B6FC8]/40 border border-slate-200 dark:border-slate-700"
              style={{ color: 'var(--text-primary, #334155)' }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-lg bg-[#1B6FC8] text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-[#155ba3] transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>

      {/* Floating button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-[#1B6FC8] text-white shadow-lg hover:bg-[#155ba3] transition-all duration-200 flex items-center justify-center ${
          open ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <MessageCircle size={26} />
        {showPulse && !open && (
          <span className="absolute inset-0 rounded-full bg-[#1B6FC8] animate-ping opacity-30" />
        )}
      </button>
    </>
  )
}
