import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { X, CheckCircle2, Send } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()
  const [showDemo, setShowDemo] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSending(true)

    // Save to database
    await supabase.from('demo_requests').insert({
      name: name.trim(),
      email: email.trim(),
      company: company.trim() || null,
      phone: phone.trim() || null,
      message: message.trim() || null,
    })

    // Send notification email
    await fetch('/api/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim(),
        message: message.trim(),
      }),
    }).catch(() => {})

    setSending(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-dvh relative flex flex-col">
      {/* Hero background */}
      <div className="absolute inset-0">
        <img src="/hero.jpg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1526]/85 via-[#0D1526]/70 to-[#0D1526]/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Nav */}
        <header className="px-6 py-5 flex items-center justify-between">
          <img src="/coresite-logo.svg" alt="CoreSite" className="h-10 brightness-0 invert" />
          <button onClick={() => navigate('/login')} className="text-white/70 text-sm hover:text-white transition-colors">
            Sign In
          </button>
        </header>

        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="max-w-2xl">
            <img src="/coresite-logo.svg" alt="CoreSite" className="h-16 mx-auto mb-8 brightness-0 invert" />
            <h1 className="text-3xl sm:text-5xl font-light text-white leading-tight mb-4">
              The Smart Site Compliance<br />
              <span className="font-semibold">Platform for Contractors</span>
            </h1>
            <p className="text-white/60 text-base sm:text-lg leading-relaxed mb-10 max-w-lg mx-auto">
              Digital inductions, RAMS sign-off, toolbox talks, snagging and full H&S compliance — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg transition-colors text-base"
              >
                Sign In
              </button>
              <button
                onClick={() => setShowDemo(true)}
                className="w-full sm:w-auto px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg border border-white/20 transition-colors text-base"
              >
                Request a Demo
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-white/30 text-xs">&copy; {new Date().getFullYear()} CoreSite — Site Compliance Platform</p>
            <div className="flex items-center gap-3 text-[11px]">
              <Link to="/policies/privacy" className="text-white/30 hover:text-white/60 transition-colors">Privacy Policy</Link>
              <Link to="/policies/terms" className="text-white/30 hover:text-white/60 transition-colors">Terms of Service</Link>
              <Link to="/policies/cookies" className="text-white/30 hover:text-white/60 transition-colors">Cookies</Link>
              <Link to="/policies/acceptable" className="text-white/30 hover:text-white/60 transition-colors">Acceptable Use</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* Demo Request Modal */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !sending && setShowDemo(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-[#E8F4ED] rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-[#2D9D5F]" />
                </div>
                <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Thanks, {name.split(' ')[0]}!</h2>
                <p className="text-sm text-[#6B6B6B] mb-6">We've received your request and will be in touch within 24 hours to arrange your demo.</p>
                <button onClick={() => setShowDemo(false)} className="px-6 py-2.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-medium rounded-lg text-sm transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Modal header */}
                <div className="bg-[#1B2A3D] px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-semibold text-base">Request a Demo</h2>
                    <p className="text-white/50 text-xs mt-0.5">See CoreSite in action for your business</p>
                  </div>
                  <button onClick={() => setShowDemo(false)} className="p-1 text-white/40 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Full Name *</label>
                      <input value={name} onChange={e => setName(e.target.value)} required
                        className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm"
                        placeholder="Joe Szavay" />
                    </div>
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Email Address *</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                        className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm"
                        placeholder="joe@company.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Company Name</label>
                      <input value={company} onChange={e => setCompany(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm"
                        placeholder="ABC Construction Ltd" />
                    </div>
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Phone Number</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm"
                        placeholder="07..." />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Tell us about your needs</label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                      className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm resize-none"
                      placeholder="How many sites? How many operatives? What's your biggest compliance headache?" />
                  </div>
                  <button type="submit" disabled={sending || !name.trim() || !email.trim()}
                    className="w-full py-3 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Send size={14} /> Request Demo</>
                    )}
                  </button>
                  <p className="text-[10px] text-[#9A9A9A] text-center">
                    By submitting, you agree to our <Link to="/policies/privacy" className="text-[#3B7DD8] hover:underline">Privacy Policy</Link>. We'll only use your details to arrange the demo.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
