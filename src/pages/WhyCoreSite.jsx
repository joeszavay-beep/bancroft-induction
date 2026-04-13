import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Shield, FileCheck, MapPin, Layers, QrCode, Users, Clock, Download, CheckCircle2,
  ArrowRight, Zap, Lock, Globe, Smartphone, X, Send, BookOpen, CheckSquare,
  Bell, BarChart3, WifiOff, HardHat, Activity, MessageSquare, CreditCard, ChevronRight, Eye,
  Cuboid, CalendarRange, Ruler, Pencil
} from 'lucide-react'

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

function FadeIn({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0.1 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

const features = [
  { icon: Cuboid, title: '3D BIM Viewer', desc: 'Upload IFC models and explore them in full 3D. X-ray mode, clipping planes, fly-to elements, colour by status. Click any element to see properties, raise snags, or update commissioning status.', color: '#7C3AED' },
  { icon: CalendarRange, title: 'Master Programme', desc: 'Import your Asta Powerproject programme as a live Gantt chart. Click-to-update progress, auto-status tracking, colour-coded bars, today line, CSV export back to Asta.', color: '#3B7DD8' },
  { icon: Pencil, title: 'DXF Programme Tracking', desc: 'Upload DXF design drawings, extract M&E routes by layer, auto-calculate baseline lengths. Draw progress markup on the PDF and watch percentages update live.', color: '#059669' },
  { icon: MapPin, title: 'Snagging & Defects', desc: 'Pin snags on drawings, attach photos, assign to trades, auto-chase overdue items, track resolution times. Link snags directly to BIM elements.', color: '#DA3633' },
  { icon: Layers, title: 'Progress Drawings', desc: 'Traffic-light system for installation progress. Dots, lines, polylines on drawings with real-world measurement. Export to PDF.', color: '#2EA043' },
  { icon: FileCheck, title: 'RAMS & Document Sign-Off', desc: 'Digital signatures with IP logging, timestamps, and automatic PDF generation. Sequential signing. No more chasing paper.', color: '#1B6FC8' },
  { icon: QrCode, title: 'QR Site Sign-In', desc: 'Print a QR poster for the gate. Live headcount, fire muster roll call, GPS capture, time tracking, auto sign-out at midnight.', color: '#D29922' },
  { icon: CheckSquare, title: 'Inspection Checklists', desc: 'Reusable templates for void closure, fire stopping, pre-handover, M&E commissioning. Pass/fail with photo evidence.', color: '#0891B2' },
  { icon: BookOpen, title: 'Daily Site Diary', desc: 'Weather auto-fill from location, workforce count, deliveries, delays, incidents. The log every site needs.', color: '#EA580C' },
  { icon: Users, title: 'Worker Management', desc: 'Full profiles with CSCS/ECS card verification, certification expiry alerts, and UK postcode address lookup.', color: '#4F46E5' },
  { icon: HardHat, title: 'Worker Portal', desc: 'Operatives get their own login. Sign documents, view assigned snags, chat with managers, track compliance.', color: '#F59E0B' },
  { icon: MessageSquare, title: 'Site Chat', desc: 'Real-time messaging between managers and operatives. Photo sharing, quick templates for material requests.', color: '#2563EB' },
  { icon: Ruler, title: '3D Measurement Tool', desc: 'Measure distances between any two points on a 3D BIM model. Snap-to-vertex for precision. Screenshot exports with CoreSite watermark.', color: '#6366F1' },
  { icon: BarChart3, title: 'Contractor Performance', desc: 'Resolution times by trade, operative league tables, on-time percentages. Data for every sub meeting.', color: '#0D9488' },
  { icon: Bell, title: 'Auto-Chase & Alerts', desc: 'Overdue snag emails every morning. Cert expiry warnings. In-app notifications. Escalation after 14 days.', color: '#DC2626' },
  { icon: Activity, title: 'Aftercare Portal', desc: 'Public defect reporting for clients during the 12-month liability period. Track alongside your snags.', color: '#F97316' },
  { icon: WifiOff, title: 'Works Offline', desc: 'Create snags, take photos, place pins with no signal. Everything syncs automatically when back online.', color: '#8B5CF6' },
  { icon: Shield, title: 'H&S Archive & Reports', desc: 'One-click PDF export: signatures, toolbox talks, snags, inspections, diary entries. Full project pack.', color: '#1B2A3D' },
]

const steps = [
  { num: '01', title: 'We set up your account', desc: 'Your logo, your colours, your projects. The platform looks like yours from day one.', icon: Globe },
  { num: '02', title: 'Upload drawings & documents', desc: 'Drag and drop PDFs — automatically converted to high-res images for pin placement.', icon: Download },
  { num: '03', title: 'Invite your workers', desc: 'Add by name and email. They verify their CSCS card, complete their profile, and sign documents.', icon: Smartphone },
  { num: '04', title: 'Run your site digitally', desc: 'Snags, progress, toolbox talks, diary, inspections, chat — all in one place, any device.', icon: CheckCircle2 },
]

export default function WhyCoreSite() {
  const navigate = useNavigate()
  useEffect(() => { document.title = 'CoreSite — Site Compliance Platform for Construction' }, [])
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

  const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#3B7DD8] focus:ring-2 focus:ring-[#3B7DD8]/10 text-sm"

  return (
    <div className="min-h-dvh bg-white">

      {/* ═══════════ HERO ═══════════ */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/hero.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1A2744]/92 via-[#1A2744]/80 to-[#1A2744]" />
        </div>

        <div className="relative z-10">
          {/* Nav */}
          <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
            <Link to="/">
              <span className="text-xl text-white font-light tracking-[3px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
            </Link>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/login')} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg border border-white/20 transition-colors">
                Sign In
              </button>
            </div>
          </header>

          {/* Hero */}
          <div className="px-6 pt-16 pb-28 sm:pt-24 sm:pb-36">
            <div className="max-w-4xl mx-auto text-center">
              <FadeIn>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm text-white/80 text-xs font-medium rounded-full mb-8 border border-white/10">
                  <Zap size={12} className="text-[#3B7DD8]" /> 18 features. One platform. Zero paper.
                </div>
              </FadeIn>
              <FadeIn delay={100}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light text-white leading-[1.15] mb-6">
                  The site compliance platform<br />
                  <span className="font-bold">contractors actually use.</span>
                </h1>
              </FadeIn>
              <FadeIn delay={200}>
                <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
                  3D BIM viewer, live programme tracking, DXF progress markup, snagging, RAMS, inspections, site diary, QR sign-in, worker management, chat — all in one place. Works on any device. Works offline.
                </p>
              </FadeIn>
              <FadeIn delay={300}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={() => setShowDemo(true)} className="w-full sm:w-auto px-8 py-4 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-xl transition-all text-base flex items-center justify-center gap-2 shadow-lg shadow-[#3B7DD8]/20">
                    Book a Free Demo <ArrowRight size={16} />
                  </button>
                  <button onClick={() => navigate('/signup')} className="w-full sm:w-auto px-8 py-4 bg-[#2EA043] hover:bg-[#27903A] text-white font-semibold rounded-xl transition-all text-base flex items-center justify-center gap-2 shadow-lg shadow-[#2EA043]/20">
                    Sign Up Free <ArrowRight size={16} />
                  </button>
                  <button onClick={() => navigate('/try')} className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl border border-white/15 transition-all text-base flex items-center justify-center gap-2">
                    <Eye size={16} /> Try it Yourself
                  </button>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ STATS ═══════════ */}
      <section className="bg-[#1A2744] py-14 px-6 -mt-1">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { value: 18, suffix: '', label: 'Features built in' },
            { value: 50, suffix: '%', label: 'Less admin time' },
            { value: 100, suffix: '%', label: 'Digital audit trail' },
            { value: 0, suffix: '', label: 'Paper forms', display: 'Zero' },
          ].map((stat, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  {stat.display || <AnimatedCounter end={stat.value} suffix={stat.suffix} />}
                </p>
                <p className="text-xs text-white/40 uppercase tracking-wider">{stat.label}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ═══════════ PROBLEM ═══════════ */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] mb-6">Sound familiar?</h2>
          </FadeIn>
          <FadeIn delay={100}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {[
                'Chasing operatives for RAMS signatures',
                'Snagging on printed drawings with sticky notes',
                'WhatsApp photos nobody can find later',
                'Paper sign-in sheets at the gate',
                'Manually writing site diaries',
                'Expired CSCS cards going unnoticed',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-left">
                  <X size={14} className="text-red-400 shrink-0" />
                  <p className="text-sm text-red-800">{item}</p>
                </div>
              ))}
            </div>
          </FadeIn>
          <FadeIn delay={200}>
            <div className="mt-8 flex items-center justify-center gap-2 text-[#3B7DD8]">
              <ArrowRight size={20} className="rotate-90" />
              <p className="text-lg font-semibold">CoreSite replaces all of it.</p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] mb-4">Everything you need. Nothing you don't.</h2>
              <p className="text-[#6B7A99] max-w-xl mx-auto">Built for M&E, fit-out, civils, and every contractor in between. Every feature designed around how sites actually work.</p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 50}>
                <div className="bg-white border border-[#E2E6EA] rounded-xl p-5 hover:shadow-lg hover:border-[#3B7DD8]/20 transition-all h-full group">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${f.color}10` }}>
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <h3 className="text-sm font-bold text-[#1A1A2E] mb-1.5">{f.title}</h3>
                  <p className="text-xs text-[#6B7A99] leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] mb-4">Up and running in minutes</h2>
              <p className="text-[#6B7A99]">No installation. No training days. No app downloads.</p>
            </div>
          </FadeIn>

          <div className="space-y-6">
            {steps.map((s, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="flex gap-4 items-start bg-white border border-[#E2E6EA] rounded-xl p-5 hover:shadow-md transition-all">
                  <div className="w-11 h-11 rounded-xl bg-[#3B7DD8] flex items-center justify-center shrink-0">
                    <s.icon size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[#3B7DD8] tracking-widest">{s.num}</span>
                      <h3 className="text-base font-bold text-[#1A1A2E]">{s.title}</h3>
                    </div>
                    <p className="text-sm text-[#6B7A99] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SECURITY ═══════════ */}
      <section className="py-20 px-6 bg-[#1A2744]">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <Lock size={28} className="text-[#3B7DD8] mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Enterprise-grade security</h2>
            <p className="text-white/50 max-w-xl mx-auto mb-10 text-sm leading-relaxed">
              Row-level security isolates every company's data at the database level. Bcrypt password hashing. JWT session tokens. CSCS card photo verification. Full GDPR compliance.
            </p>
          </FadeIn>
          <FadeIn delay={100}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {['Row-level security', 'Bcrypt hashing', 'JWT sessions', 'CSCS verification', 'Company isolation', 'GDPR compliant', 'Encrypted storage', 'Audit logging'].map((item, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-lg py-3 px-3">
                  <CheckCircle2 size={14} className="text-[#2EA043] mx-auto mb-1.5" />
                  <p className="text-white/70 text-[11px] font-medium">{item}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════ PRICING HINT ═══════════ */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] mb-4">Simple, transparent pricing</h2>
              <p className="text-[#6B7A99]">No per-user fees. No hidden costs. One price for your whole team.</p>
            </div>
          </FadeIn>
          <FadeIn delay={100}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { name: 'Starter', price: 'Free', period: '14-day trial', desc: '1 project, 10 workers', features: ['All core features', 'Email support', 'PDF exports'] },
                { name: 'Professional', price: 'Get in touch', period: '', desc: '5 projects, 50 workers', features: ['Everything in Starter', 'Priority support', 'Custom branding', 'API access'], highlight: true },
                { name: 'Enterprise', price: 'Custom', period: '', desc: 'Unlimited everything', features: ['Everything in Pro', 'Dedicated account manager', 'SLA guarantee', 'SSO integration'] },
              ].map((plan, i) => (
                <div key={i} className={`rounded-xl p-6 ${plan.highlight ? 'bg-[#1A2744] text-white ring-2 ring-[#3B7DD8] scale-[1.02]' : 'bg-white border border-[#E2E6EA]'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${plan.highlight ? 'text-[#3B7DD8]' : 'text-[#6B7A99]'}`}>{plan.name}</p>
                  <p className={`text-2xl font-bold mb-0.5 ${plan.highlight ? 'text-white' : 'text-[#1A1A2E]'}`}>{plan.price}</p>
                  {plan.period && <p className={`text-xs mb-3 ${plan.highlight ? 'text-white/50' : 'text-[#B0B8C9]'}`}>{plan.period}</p>}
                  <p className={`text-sm mb-4 ${plan.highlight ? 'text-white/60' : 'text-[#6B7A99]'}`}>{plan.desc}</p>
                  <ul className="space-y-2">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 size={12} className={plan.highlight ? 'text-[#3B7DD8]' : 'text-[#2EA043]'} />
                        <span className={plan.highlight ? 'text-white/80' : 'text-[#6B7A99]'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setShowDemo(true)}
                    className={`w-full mt-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${plan.highlight ? 'bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white' : 'bg-[#F5F6F8] hover:bg-[#E2E6EA] text-[#1A1A2E]'}`}>
                    {plan.highlight ? 'Book a Demo' : 'Get Started'}
                  </button>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] mb-4">Ready to go digital?</h2>
            <p className="text-[#6B7A99] mb-8 max-w-lg mx-auto">Join the contractors already saving hours every week. Book a free demo and see CoreSite on your projects.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => setShowDemo(true)} className="w-full sm:w-auto px-8 py-4 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-xl transition-all text-base flex items-center justify-center gap-2 shadow-lg shadow-[#3B7DD8]/20">
                Book a Free Demo <ArrowRight size={16} />
              </button>
              <a href="mailto:joe@coresite.io" className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-[#F5F6F8] text-[#1A1A2E] font-medium rounded-xl border border-[#E2E6EA] transition-all text-base">
                Email joe@coresite.io
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-[#1A2744] py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-lg text-white font-light tracking-[3px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
            <div className="flex items-center gap-5 text-sm">
              <Link to="/" className="text-white/40 hover:text-white transition-colors">Home</Link>
              <Link to="/login" className="text-white/40 hover:text-white transition-colors">Sign In</Link>
              <a href="mailto:joe@coresite.io" className="text-white/40 hover:text-white transition-colors">Contact</a>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/25 text-xs">&copy; {new Date().getFullYear()} CoreSite — Site Compliance Platform</p>
            <div className="flex items-center gap-4 text-[11px]">
              <Link to="/policies/privacy" className="text-white/25 hover:text-white/50 transition-colors">Privacy</Link>
              <Link to="/policies/terms" className="text-white/25 hover:text-white/50 transition-colors">Terms</Link>
              <Link to="/policies/cookies" className="text-white/25 hover:text-white/50 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════ DEMO MODAL ═══════════ */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !sending && setShowDemo(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-[#ECFDF5] rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-[#2EA043]" />
                </div>
                <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Thanks, {dName.split(' ')[0]}!</h2>
                <p className="text-sm text-[#6B7A99] mb-6">We'll be in touch within 24 hours to arrange your demo.</p>
                <button onClick={() => setShowDemo(false)} className="px-6 py-2.5 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-medium rounded-lg text-sm">Close</button>
              </div>
            ) : (
              <>
                <div className="bg-[#1A2744] px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-semibold">Book a Demo</h2>
                    <p className="text-white/40 text-xs mt-0.5">See CoreSite in action — it takes 15 minutes</p>
                  </div>
                  <button onClick={() => setShowDemo(false)} className="p-1 text-white/30 hover:text-white"><X size={20} /></button>
                </div>
                <form onSubmit={handleDemoSubmit} className="p-6 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Full Name *</label>
                      <input value={dName} onChange={e => setDName(e.target.value)} required className={inputCls} placeholder="Your name" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Email *</label>
                      <input type="email" value={dEmail} onChange={e => setDEmail(e.target.value)} required className={inputCls} placeholder="you@company.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Company</label>
                      <input value={dCompany} onChange={e => setDCompany(e.target.value)} className={inputCls} placeholder="Company name" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Phone</label>
                      <input type="tel" value={dPhone} onChange={e => setDPhone(e.target.value)} className={inputCls} placeholder="07..." />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Message</label>
                    <textarea value={dMessage} onChange={e => setDMessage(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Tell us about your business..." />
                  </div>
                  <button type="submit" disabled={sending} className="w-full py-3 bg-[#3B7DD8] hover:bg-[#2D6BC4] text-white font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                    {sending ? 'Sending...' : <><Send size={14} /> Request Demo</>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
