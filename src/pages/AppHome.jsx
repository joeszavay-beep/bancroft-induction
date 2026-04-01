import { useNavigate } from 'react-router-dom'
import { UserPlus, Mail, Users, BarChart3 } from 'lucide-react'

const quickActions = [
  { title: 'Add a New Worker', desc: "Enter your Worker's information here. You can invite them to training later.", icon: UserPlus, path: '/app/workers/new' },
  { title: 'Invite New Workers', desc: 'Invite your Workers to complete Pre-Enrolment.', icon: Mail, path: '/app/invite-workers' },
  { title: 'Invite Existing Workers', desc: 'Invite a Worker to another project.', icon: Users, path: '/app/invite-existing' },
  { title: 'View Progress', desc: "Monitor your Workers' training progress and induction status.", icon: BarChart3, path: '/app/pipeline' },
]

export default function AppHome() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-140px)] px-4">
      {/* Header */}
      <div className="text-center max-w-2xl mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Welcome to the Pre-Enrolment and Inductions Portal
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--primary-color)' }}>
          From here you can manage your operative registration and invite them to complete an Online Induction; required to ensure all persons on site are appropriately registered and can get to work after a short site and task specific briefing.
        </p>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {quickActions.map(action => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="rounded-xl p-5 sm:p-8 text-center transition-all group hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-5 transition-colors"
              style={{ backgroundColor: 'var(--bg-hover)', border: '2px solid var(--border-color)' }}>
              <action.icon size={32} className="transition-colors" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{action.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{action.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
