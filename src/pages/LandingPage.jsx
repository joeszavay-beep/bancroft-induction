import { useNavigate, Link } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

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
              <span className="font-semibold">Platform for M&E Contractors</span>
            </h1>
            <p className="text-white/60 text-base sm:text-lg leading-relaxed mb-10 max-w-lg mx-auto">
              Digital inductions, RAMS sign-off, toolbox talks, snagging and full H&S compliance — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg transition-colors text-base"
              >
                Sign In
              </button>
              <button
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
    </div>
  )
}
