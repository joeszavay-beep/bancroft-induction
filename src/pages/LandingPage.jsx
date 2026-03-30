import { useNavigate } from 'react-router-dom'
import { HardHat, Briefcase, ArrowRight, Shield, FileCheck, Users } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex items-center justify-between">
        <img src="/sitecore-logo.svg" alt="SiteCore" className="h-10" />
        <span className="text-[10px] text-slate-400 tracking-widest uppercase hidden sm:block">Site Compliance Platform</span>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="text-center mb-10 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-600 font-medium mb-6">
            <Shield size={12} />
            Secure Digital Induction Platform
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-slate-900 leading-tight mb-3">
            Site Induction &<br />
            <span className="font-semibold">RAMS Sign-Off</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Complete your site induction, review safety documents and provide digital sign-off — all in one place.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => navigate('/operative')}
            className="w-full group flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <HardHat size={22} className="text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-slate-900 font-semibold">I'm an Operative</p>
              <p className="text-slate-400 text-sm">Sign documents & complete induction</p>
            </div>
            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
          </button>

          <button
            onClick={() => navigate('/pm-login')}
            className="w-full group flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Briefcase size={22} className="text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-slate-900 font-semibold">Manager Login</p>
              <p className="text-slate-400 text-sm">Manage projects, team & documents</p>
            </div>
            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
          </button>
        </div>

        {/* Trust indicators */}
        <div className="flex items-center gap-6 mt-10 text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Shield size={12} className="text-blue-400" />
            <span>Verified Sign-Off</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <FileCheck size={12} className="text-blue-400" />
            <span>HSE Compliant</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <Users size={12} className="text-blue-400" />
            <span>IP Tracked</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
        <p className="text-[11px] text-slate-300">Powered by SiteCore</p>
        <p className="text-[11px] text-slate-300">&copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
