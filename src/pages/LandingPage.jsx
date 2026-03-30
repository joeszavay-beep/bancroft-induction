import { useNavigate } from 'react-router-dom'
import { HardHat, Briefcase } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-navy-950">
      <div className="text-center mb-12">
        <img src="/bancroft-logo.png" alt="Bancroft" className="h-16 mx-auto mb-6" />
        <p className="text-gray-400 text-sm">Site Induction & RAMS Sign-Off</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => navigate('/operative')}
          className="w-full flex items-center gap-4 p-5 bg-navy-800 border border-navy-600 rounded-xl hover:border-accent/50 hover:bg-navy-700 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center shrink-0">
            <HardHat size={24} className="text-accent" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">I'm an Operative</p>
            <p className="text-gray-400 text-sm">Sign documents & complete induction</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/pm-login')}
          className="w-full flex items-center gap-4 p-5 bg-navy-800 border border-navy-600 rounded-xl hover:border-accent/50 hover:bg-navy-700 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center shrink-0">
            <Briefcase size={24} className="text-accent" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">I'm a Project Manager</p>
            <p className="text-gray-400 text-sm">Manage projects, team & documents</p>
          </div>
        </button>
      </div>

      <p className="mt-12 text-gray-600 text-xs">Mechanical & Electrical Engineering</p>
    </div>
  )
}
