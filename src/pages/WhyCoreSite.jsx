import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield, FileCheck, MapPin, Layers, QrCode, Users, Clock, Download, CheckCircle2, ArrowRight, Zap, Lock, Globe, Smartphone, X, Send, BookOpen, CheckSquare, Bell, BarChart3, WifiOff, HardHat, Activity } from 'lucide-react'

function AnimatedCounter({ end, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        let start = 0
        const step = end / (duration / 16)
        const timer = setInterval(() => {
          start += step
          if (start >= end) { setCount(end); clearInterval(timer) }
          else setCount(Math.floor(start))
        }, 16)
      }
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [end, duration])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

function FadeInSection({ children, delay = 0 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0.15 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

const features = [
  {
    icon: FileCheck,
    title: 'Digital RAMS Sign-Off',
    desc: 'Operatives review documents in-app and sign with a digital signature. Every sign-off is timestamped with IP verification — no more chasing paper.',
    color: '#3B7DD8',
  },
  {
    icon: MapPin,
    title: 'Snagging & Defect Tracking',
    desc: 'Drop pins directly on drawings, attach photos, assign to trades, and track resolution. Automatic overdue email chasing and contractor performance analytics.',
    color: '#D93E3E',
  },
  {
    icon: Layers,
    title: 'Progress Drawings',
    desc: 'Traffic-light marking system for installation progress. Mark dots, lines and polylines on drawings in green, yellow and red. Export high-res PDFs.',
    color: '#2D9D5F',
  },
  {
    icon: QrCode,
    title: 'QR Site Sign-In',
    desc: 'Print a QR poster for the gate. Workers scan to sign in and out — giving you live headcount, fire muster roll call, time tracking, and attendance history.',
    color: '#D29922',
  },
  {
    icon: BookOpen,
    title: 'Daily Site Diary',
    desc: 'Record weather (auto-filled from location), workforce count, deliveries, visitors, delays, and incidents. The daily log every site manager needs, digitised.',
    color: '#0891B2',
  },
  {
    icon: CheckSquare,
    title: 'Inspection Checklists',
    desc: 'Create reusable templates for void closure, fire stopping, pre-handover checks. Mark pass/fail per item with photo evidence. Auto-generates inspection reports.',
    color: '#059669',
  },
  {
    icon: Users,
    title: 'Worker Management & Certs',
    desc: 'Full operative profiles with CSCS card, IPAF, PASMA, first aid tracking. Automatic alerts 30 days before any certification expires. UK address lookup built in.',
    color: '#7C3AED',
  },
  {
    icon: HardHat,
    title: 'Worker Portal',
    desc: 'Operatives get their own login to see assigned snags, sign documents and toolbox talks, and track their compliance status. Mobile-first with bottom nav.',
    color: '#EA580C',
  },
  {
    icon: BarChart3,
    title: 'Contractor Performance',
    desc: 'Automatic analytics from your snag data — average resolution time by trade, operative league tables, on-time percentages. Data to back up every subcontractor meeting.',
    color: '#4F46E5',
  },
  {
    icon: Bell,
    title: 'Notifications & Auto-Chase',
    desc: 'In-app notification centre plus automated overdue snag emails sent to operatives every morning. 14+ days overdue auto-escalates to high priority.',
    color: '#DC2626',
  },
  {
    icon: Activity,
    title: 'Aftercare Portal',
    desc: 'Give clients a link to report defects during the 12-month liability period. They submit photos and descriptions — you manage them alongside your snags.',
    color: '#0D9488',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    desc: 'Full offline mode — create snags, place pins, take photos underground with no signal. Everything syncs automatically when you\'re back online.',
    color: '#6366F1',
  },
  {
    icon: Shield,
    title: 'Full H&S Archive',
    desc: 'One-click export of your entire project H&S pack — every signature, toolbox talk, snag, inspection, and diary entry compiled into a professional PDF.',
    color: '#1B2A3D',
  },
]

const stats = [
  { value: 13, suffix: '+', label: 'Features in one platform' },
  { value: 50, suffix: '%', label: 'Less time on admin' },
  { value: 100, suffix: '%', label: 'Digital paper trail' },
  { value: 0, suffix: '', label: 'Paper forms needed', display: 'Zero' },
]

export default function WhyCoreSite() {
  const navigate = useNavigate()
  useEffect(() => { document.title = 'CoreSite — Site Compliance Platform' }, [])
  const [showDemo, setShowDemo] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [dName, setDName] = useState('')
  const [dEmail, setDEmail] = useState('')
  const [dCompany, setDCompany] = useState('')
  const [dPhone, setDPhone] = useState('')
  const [dMessage, setDMessage] = useState('')

  async function handleDemoSubmit(e) {
    e.preventDefault()
    if (!dName.trim() || !dEmail.trim()) return
    setSending(true)
    await supabase.from('demo_requests').insert({ name: dName.trim(), email: dEmail.trim(), company: dCompany.trim() || null, phone: dPhone.trim() || null, message: dMessage.trim() || null })
    await fetch('/api/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: dName.trim(), email: dEmail.trim(), company: dCompany.trim(), phone: dPhone.trim(), message: dMessage.trim() }) }).catch(() => {})
    setSending(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* Dark hero with background image — matching landing page */}
      <div className="relative">
        <div className="absolute inset-0">
          <img src="/hero.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0D1526]/90 via-[#0D1526]/75 to-[#0D1526]/95" />
        </div>

        <div className="relative z-10">
          {/* Nav */}
          <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
            <Link to="/" className="flex items-center gap-2">
              <img src="/coresite-logo.svg" alt="CoreSite" className="h-9 brightness-0 invert" />
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">Home</Link>
              <Link to="/why" className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">Why CoreSite</Link>
              <button onClick={() => navigate('/login')} className="px-5 py-2 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white text-sm font-medium rounded-lg transition-colors">
                Sign In
              </button>
            </div>
          </header>

          {/* Hero content */}
          <div className="px-6 pt-12 pb-24 sm:pt-20 sm:pb-32">
            <div className="max-w-4xl mx-auto text-center">
              <FadeInSection>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm text-white/80 text-xs font-medium rounded-full mb-6 border border-white/10">
                  <Zap size={12} /> The future of site compliance
                </div>
              </FadeInSection>
              <FadeInSection delay={100}>
                <h1 className="text-4xl sm:text-6xl font-light text-white leading-tight mb-6">
                  Stop chasing paper.<br />
                  <span className="font-bold">Start running sites.</span>
                </h1>
              </FadeInSection>
              <FadeInSection delay={200}>
                <p className="text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
                  CoreSite replaces your paper inductions, printed RAMS, WhatsApp photo trails and Excel snagging lists with one platform that works on site, in the office, and everywhere in between.
                </p>
              </FadeInSection>
              <FadeInSection delay={300}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={() => setShowDemo(true)} className="w-full sm:w-auto px-8 py-3.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg transition-colors text-base flex items-center justify-center gap-2">
                    Request a Demo <ArrowRight size={16} />
                  </button>
                  <button onClick={() => navigate('/login')} className="w-full sm:w-auto px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg border border-white/20 transition-colors text-base">
                    Sign In
                  </button>
                </div>
              </FadeInSection>
            </div>
          </div>
        </div>
      </div>


      {/* Stats */}
      <section className="py-16 px-6 bg-[#1B2A3D]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <FadeInSection key={i} delay={i * 100}>
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  {stat.display || <AnimatedCounter end={stat.value} suffix={stat.suffix} />}
                </p>
                <p className="text-sm text-white/50">{stat.label}</p>
              </div>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-4">Built for contractors</h2>
              <p className="text-[#6B6B6B] max-w-2xl mx-auto">Every feature designed around how contractors actually work on site. From M&E and fit-out to civil engineering and beyond — just the tools you need.</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FadeInSection key={i} delay={i * 80}>
                <div className="bg-white border border-[#E5E5E5] rounded-xl p-6 hover:shadow-lg hover:border-[#3B7DD8]/30 transition-all group h-full">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors" style={{ backgroundColor: `${f.color}10` }}>
                    <f.icon size={24} style={{ color: f.color }} />
                  </div>
                  <h3 className="text-base font-bold text-[#1A1A1A] mb-2">{f.title}</h3>
                  <p className="text-sm text-[#6B6B6B] leading-relaxed">{f.desc}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-4">Up and running in minutes</h2>
              <p className="text-[#6B6B6B]">No installation. No training days. Just log in and go.</p>
            </div>
          </FadeInSection>

          <div className="space-y-8">
            {[
              { step: '01', title: 'We set up your company', desc: 'Your branding, your logo, your colours. The platform looks like yours from day one.', icon: Globe },
              { step: '02', title: 'Upload your drawings and RAMS', desc: 'PDFs are automatically converted to high-res images. Drag, drop, done.', icon: Download },
              { step: '03', title: 'Invite your operatives', desc: 'Add workers by name and email. They get a link to complete their profile and sign documents — no app download needed.', icon: Smartphone },
              { step: '04', title: 'Start running your site digitally', desc: 'Raise snags, mark progress, run toolbox talks, track inductions. Everything in one place, accessible from any device.', icon: CheckCircle2 },
            ].map((item, i) => (
              <FadeInSection key={i} delay={i * 100}>
                <div className="flex gap-5 items-start">
                  <div className="w-12 h-12 rounded-xl bg-[#3B7DD8] flex items-center justify-center shrink-0">
                    <item.icon size={22} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-bold text-[#3B7DD8] tracking-wider">{item.step}</span>
                      <h3 className="text-lg font-bold text-[#1A1A1A]">{item.title}</h3>
                    </div>
                    <p className="text-sm text-[#6B6B6B] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <FadeInSection>
            <div className="bg-[#1B2A3D] rounded-2xl p-8 sm:p-12 text-center">
              <Lock size={32} className="text-[#3B7DD8] mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Enterprise-grade security</h2>
              <p className="text-white/60 max-w-xl mx-auto mb-8 text-sm leading-relaxed">
                Every password is hashed with bcrypt. Every session uses JWT tokens. Every company's data is completely isolated. Built on Supabase with EU-hosted databases and full GDPR compliance.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
                {['Bcrypt hashing', 'JWT sessions', 'Company isolation', 'GDPR compliant'].map((item, i) => (
                  <div key={i} className="bg-white/5 rounded-lg py-3 px-2">
                    <CheckCircle2 size={16} className="text-[#2D9D5F] mx-auto mb-1.5" />
                    <p className="text-white/80 text-xs font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-3xl mx-auto text-center">
          <FadeInSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] mb-4">Ready to go digital?</h2>
            <p className="text-[#6B6B6B] mb-8 max-w-lg mx-auto">Join the contractors who are already saving hours every week with CoreSite. Book a free demo and see for yourself.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/" className="w-full sm:w-auto px-8 py-3.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg transition-colors text-base flex items-center justify-center gap-2">
                Request a Demo <ArrowRight size={16} />
              </Link>
              <a href="mailto:joe@coresite.io" className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-[#F5F5F5] text-[#1A1A1A] font-medium rounded-lg border border-[#E5E5E5] transition-colors text-base">
                Email joe@coresite.io
              </a>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1B2A3D] py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <img src="/coresite-logo.svg" alt="CoreSite" className="h-8 brightness-0 invert" />
            <div className="flex items-center gap-4 text-sm">
              <Link to="/" className="text-white/50 hover:text-white transition-colors">Home</Link>
              <Link to="/why" className="text-white/50 hover:text-white transition-colors">Why CoreSite</Link>
              <Link to="/login" className="text-white/50 hover:text-white transition-colors">Sign In</Link>
              <a href="mailto:joe@coresite.io" className="text-white/50 hover:text-white transition-colors">Contact</a>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/30 text-xs">&copy; {new Date().getFullYear()} CoreSite — Site Compliance Platform</p>
            <div className="flex items-center gap-3 text-[11px]">
              <Link to="/policies/privacy" className="text-white/30 hover:text-white/60 transition-colors">Privacy</Link>
              <Link to="/policies/terms" className="text-white/30 hover:text-white/60 transition-colors">Terms</Link>
              <Link to="/policies/cookies" className="text-white/30 hover:text-white/60 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Demo Request Modal */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !sending && setShowDemo(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-[#E8F4ED] rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-[#2D9D5F]" />
                </div>
                <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Thanks, {dName.split(' ')[0]}!</h2>
                <p className="text-sm text-[#6B6B6B] mb-6">We've received your request and will be in touch within 24 hours to arrange your demo.</p>
                <button onClick={() => setShowDemo(false)} className="px-6 py-2.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-medium rounded-lg text-sm transition-colors">Close</button>
              </div>
            ) : (
              <>
                <div className="bg-[#1B2A3D] px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-semibold text-base">Request a Demo</h2>
                    <p className="text-white/50 text-xs mt-0.5">See CoreSite in action for your business</p>
                  </div>
                  <button onClick={() => setShowDemo(false)} className="p-1 text-white/40 hover:text-white transition-colors"><X size={20} /></button>
                </div>
                <form onSubmit={handleDemoSubmit} className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Full Name *</label>
                      <input value={dName} onChange={e => setDName(e.target.value)} required className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm" placeholder="Your name" />
                    </div>
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Email Address *</label>
                      <input type="email" value={dEmail} onChange={e => setDEmail(e.target.value)} required className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm" placeholder="you@company.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Company Name</label>
                      <input value={dCompany} onChange={e => setDCompany(e.target.value)} className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm" placeholder="Your company" />
                    </div>
                    <div>
                      <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Phone Number</label>
                      <input type="tel" value={dPhone} onChange={e => setDPhone(e.target.value)} className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm" placeholder="07..." />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#6B6B6B] font-medium mb-1 block">Tell us about your needs</label>
                    <textarea value={dMessage} onChange={e => setDMessage(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-lg text-[#1A1A1A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm resize-none" placeholder="How many sites? How many operatives?" />
                  </div>
                  <button type="submit" disabled={sending || !dName.trim() || !dEmail.trim()} className="w-full py-3 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send size={14} /> Request Demo</>}
                  </button>
                  <p className="text-[10px] text-[#9A9A9A] text-center">By submitting, you agree to our <Link to="/policies/privacy" className="text-[#3B7DD8] hover:underline">Privacy Policy</Link>.</p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
