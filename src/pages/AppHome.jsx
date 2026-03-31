import { useNavigate } from 'react-router-dom'
import { UserPlus, Mail, Users, BarChart3, FolderOpen, MapPin, MessageSquare, FileText } from 'lucide-react'

const quickActions = [
  { title: 'Add a New Worker', desc: "Enter your Worker's information here. You can invite them to training later.", icon: UserPlus, path: '/app/workers/new' },
  { title: 'Invite New Workers', desc: 'Invite your Workers to complete Pre-Enrolment.', icon: Mail, path: '/app/invite-workers' },
  { title: 'Invite Existing Workers', desc: 'Invite a Worker to another project.', icon: Users, path: '/app/invite-existing' },
  { title: 'View Progress', desc: "Monitor your Workers' training progress and induction status.", icon: BarChart3, path: '/app/pipeline' },
]

export default function AppHome() {
  const navigate = useNavigate()

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">Welcome to the Pre-Enrolment and Inductions Portal</h1>
      <p className="text-sm text-[#1B6FC8] mb-8">
        From here you can manage your operative registration and invite them to complete an Online Induction; required to ensure all persons on site are appropriately registered and can get to work after a short site and task specific briefing.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl">
        {quickActions.map(action => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="bg-white border border-[#E2E6EA] rounded-xl p-6 text-center hover:shadow-lg hover:border-[#1B6FC8]/30 transition-all group"
          >
            <div className="w-20 h-20 rounded-full bg-[#F5F6F8] border-2 border-[#E2E6EA] group-hover:border-[#1B6FC8]/30 flex items-center justify-center mx-auto mb-4 transition-colors">
              <action.icon size={32} className="text-[#3D4F6F] group-hover:text-[#1B6FC8] transition-colors" />
            </div>
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-1">{action.title}</h3>
            <p className="text-sm text-[#6B7A99]">{action.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
