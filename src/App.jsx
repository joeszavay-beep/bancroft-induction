import { Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useCompany } from './lib/CompanyContext'
import SidebarLayout from './components/SidebarLayout'
import BiometricGate from './components/BiometricGate'
import HelpWidget from './components/HelpWidget'

const isNative = Capacitor.isNativePlatform()

// Public pages
import LandingPage from './pages/LandingPage'
import PMLogin from './pages/PMLogin'
import OperativeSelect from './pages/OperativeSelect'
import OperativeDocuments from './pages/OperativeDocuments'
import SignDocument from './pages/SignDocument'
import OperativeProfile from './pages/OperativeProfile'
import Portal from './pages/Portal'
import ToolboxSign from './pages/ToolboxSign'
import Policies from './pages/Policies'
import SnagReply from './pages/SnagReply'
import ResetPassword from './pages/ResetPassword'
import WhyCoreSite from './pages/WhyCoreSite'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'

// App pages (inside sidebar layout)
import AppHome from './pages/AppHome'
import PMDashboard from './pages/PMDashboard'
import AdminDashboard from './pages/AdminDashboard'
import ToolboxTalkLive from './pages/ToolboxTalkLive'
import SnagDrawingView from './pages/SnagDrawingView'
import SuperAdminPanel from './pages/SuperAdminPanel'
import ProgressDrawingsList from './pages/ProgressDrawingsList'
import ProgressViewer from './pages/ProgressViewer'
import InviteNewWorkers from './pages/InviteNewWorkers'
import InviteExistingWorkers from './pages/InviteExistingWorkers'
import InvitationsPipeline from './pages/InvitationsPipeline'
import AllWorkers from './pages/AllWorkers'
import AddNewWorker from './pages/AddNewWorker'
import DailySiteDiary from './pages/DailySiteDiary'
import ContractorPerformance from './pages/ContractorPerformance'
import Inspections from './pages/Inspections'
import AftercarePage from './pages/AftercarePage'
import SiteSignIn from './pages/SiteSignIn'
import Chat from './pages/Chat'
import SiteAttendance from './pages/SiteAttendance'
import BIMModels from './pages/BIMModels'
import BIMViewer3D from './pages/BIMViewer3D'
import ProgrammeDashboard from './pages/ProgrammeDashboard'
import MasterProgramme from './pages/MasterProgramme'
import LabourRequests from './pages/LabourRequests'
import LabourRequestForm from './pages/LabourRequestForm'
import LabourRequestDetail from './pages/LabourRequestDetail'
import Bookings from './pages/Bookings'
import ProgrammeSetup from './pages/ProgrammeSetup'
import DXFViewer from './pages/DXFViewer'
import OperativeLogin from './pages/OperativeLogin'
import OperativeTimesheet from './pages/OperativeTimesheet'
import OperativeEarnings from './pages/OperativeEarnings'
import OperativeInvoices from './pages/OperativeInvoices'
import OperativeCerts from './pages/OperativeCerts'
import SandboxEntry from './pages/SandboxEntry'
import OperativeDashboard from './pages/OperativeDashboard'
import AgencyDashboard from './pages/AgencyDashboard'
import AgencyOperatives from './pages/AgencyOperatives'
import AgencyOperativeDetail from './pages/AgencyOperativeDetail'
import AgencyRequests from './pages/AgencyRequests'
import AgencyConnections from './pages/AgencyConnections'
import AgencyRegister from './pages/AgencyRegister'
import SubcontractorJobs from './pages/SubcontractorJobs'
import SubcontractorJobDetail from './pages/SubcontractorJobDetail'
import SubcontractorDashboard from './pages/SubcontractorDashboard'
import WorkerInvoiceReview from './pages/WorkerInvoiceReview'
import OperativeGuard from './components/OperativeGuard'
import { getSession } from './lib/storage'

// On native: redirect to /app if PM session exists, /worker if operative session, otherwise /login
function NativeEntry() {
  const { isAuthenticated, isLoading } = useCompany()
  const hasPmSession = isAuthenticated || getSession('pm_auth') === 'true'
  const hasOpSession = !!getSession('operative_session')
  if (isLoading) return <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#1A2744' }}><div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" /></div>
  if (hasPmSession) return <Navigate to="/app" replace />
  if (hasOpSession) return <Navigate to="/worker" replace />
  return <Navigate to="/login" replace />
}

// On native: redirect away from login if already authenticated
function LoginGuard() {
  const { isAuthenticated, isLoading } = useCompany()
  const hasSession = isAuthenticated || getSession('pm_auth') === 'true'
  if (isLoading) return <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#1A2744' }}><div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" /></div>
  if (isNative && hasSession) return <Navigate to="/app" replace />
  return <PMLogin />
}

function AppLayout() {
  const { isAuthenticated, isLoading } = useCompany()
  const hasSession = isAuthenticated || getSession('pm_auth') === 'true'
  if (isLoading) return <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}><div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>
  if (!hasSession) return <Navigate to="/login" replace />
  return (
    <SidebarLayout>
      <Routes>
        <Route path="/" element={<AppHome />} />
        <Route path="/dashboard" element={<PMDashboard key="home" />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="/projects" element={<PMDashboard key="projects" initialTab="projects" />} />
        <Route path="/workers" element={<AllWorkers />} />
        <Route path="/workers/new" element={<AddNewWorker />} />
        <Route path="/invite-workers" element={<InviteNewWorkers />} />
        <Route path="/invite-existing" element={<InviteExistingWorkers />} />
        <Route path="/pipeline" element={<InvitationsPipeline />} />
        <Route path="/diary" element={<DailySiteDiary />} />
        <Route path="/attendance" element={<SiteAttendance />} />
        <Route path="/messages" element={<Chat />} />
        <Route path="/performance" element={<ContractorPerformance />} />
        <Route path="/inspections" element={<Inspections />} />
        <Route path="/progress" element={<ProgressDrawingsList />} />
        <Route path="/bim" element={<BIMModels />} />
        <Route path="/programme" element={<ProgrammeDashboard />} />
        <Route path="/master-programme" element={<MasterProgramme />} />
        <Route path="/snags" element={<PMDashboard key="snags" initialTab="snags" />} />
        <Route path="/drawings" element={<PMDashboard key="drawings" initialTab="snags" />} />
        <Route path="/toolbox" element={<PMDashboard key="toolbox" initialTab="toolbox" />} />
        <Route path="/documents" element={<PMDashboard key="docs" initialTab="projects" />} />
        <Route path="/hs-reports" element={<PMDashboard key="hs" initialTab="hsreport" />} />
        <Route path="/portal" element={<PMDashboard key="portal" initialTab="portal" />} />
        <Route path="/account" element={<PMDashboard key="settings" initialTab="settings" />} />
        <Route path="/labour-requests" element={<LabourRequests />} />
        <Route path="/labour-requests/new" element={<LabourRequestForm />} />
        <Route path="/labour-requests/:id" element={<LabourRequestDetail />} />
        <Route path="/agency-connections" element={<AgencyConnections />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/agency" element={<AgencyDashboard />} />
        <Route path="/agency/operatives" element={<AgencyOperatives />} />
        <Route path="/agency/operatives/:id" element={<AgencyOperativeDetail />} />
        <Route path="/agency/requests" element={<AgencyRequests />} />
        <Route path="/agency/bookings" element={<Bookings />} />
        <Route path="/jobs" element={<SubcontractorJobs />} />
        <Route path="/jobs/:id" element={<SubcontractorJobDetail />} />
        <Route path="/sub-dashboard" element={<SubcontractorDashboard />} />
        <Route path="/worker-invoices" element={<WorkerInvoiceReview />} />
        <Route path="/toolbox-live/:talkId" element={<ToolboxTalkLive />} />
      </Routes>
    </SidebarLayout>
  )
}

export default function App() {
  return (
    <BiometricGate>
    <Routes>
      {/* Public routes */}
      <Route path="/" element={isNative ? <NativeEntry /> : <WhyCoreSite />} />
      <Route path="/login" element={<LoginGuard />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/why" element={<WhyCoreSite />} />
      <Route path="/old-landing" element={<LandingPage />} />
      {/* Legacy redirect */}
      <Route path="/pm-login" element={<Navigate to="/login" replace />} />
      <Route path="/pm" element={<Navigate to="/app/dashboard" replace />} />

      {/* Operative routes (auth guarded — must be logged in as the correct operative) */}
      <Route path="/operative" element={<Navigate to="/worker-login" replace />} />
      <Route path="/operative/:operativeId/documents" element={<OperativeGuard><OperativeDocuments /></OperativeGuard>} />
      <Route path="/operative/:operativeId/sign/:documentId" element={<OperativeGuard><SignDocument /></OperativeGuard>} />
      <Route path="/operative/:operativeId/profile" element={<OperativeGuard><OperativeProfile /></OperativeGuard>} />
      <Route path="/toolbox/:talkId" element={<ToolboxSign />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/portal/:projectId" element={<Portal />} />
      <Route path="/policies/:policyId" element={<Policies />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/snag-reply/:token" element={<SnagReply />} />
      <Route path="/aftercare/:projectId" element={<AftercarePage />} />
      <Route path="/site/:projectId" element={<SiteSignIn />} />
      <Route path="/worker-login" element={<OperativeLogin />} />
      <Route path="/try" element={<SandboxEntry />} />
      <Route path="/worker/timesheet" element={<OperativeTimesheet />} />
      <Route path="/worker/earnings" element={<OperativeEarnings />} />
      <Route path="/worker/invoices" element={<OperativeInvoices />} />
      <Route path="/worker/certs" element={<OperativeCerts />} />
      <Route path="/worker/*" element={<OperativeDashboard />} />

      {/* Agency registration (no sidebar) */}
      <Route path="/agency/register" element={<AgencyRegister />} />

      {/* Full screen viewers (no sidebar) */}
      <Route path="/snags/:drawingId" element={<SnagDrawingView />} />
      <Route path="/progress/:drawingId" element={<ProgressViewer />} />
      <Route path="/bim-3d/:modelId" element={<BIMViewer3D />} />
      <Route path="/programme/setup/:drawingId" element={<ProgrammeSetup />} />
      <Route path="/programme/drawing/:drawingId" element={<DXFViewer />} />

      {/* Super admin (no sidebar) */}
      <Route path="/superadmin" element={<SuperAdminPanel />} />

      {/* App routes (with sidebar) */}
      <Route path="/app/*" element={<AppLayout />} />
    </Routes>
    </BiometricGate>
  )
}
