import { Routes, Route, Navigate } from 'react-router-dom'
import { useCompany } from './lib/CompanyContext'
import SidebarLayout from './components/SidebarLayout'

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
import SiteAttendance from './pages/SiteAttendance'

function AppLayout() {
  const { isAuthenticated, isLoading } = useCompany()
  // Also check sessionStorage as fallback during state transitions
  const hasSession = isAuthenticated || sessionStorage.getItem('pm_auth') === 'true'
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
        <Route path="/performance" element={<ContractorPerformance />} />
        <Route path="/inspections" element={<Inspections />} />
        <Route path="/progress" element={<ProgressDrawingsList />} />
        <Route path="/snags" element={<PMDashboard key="snags" initialTab="snags" />} />
        <Route path="/drawings" element={<PMDashboard key="drawings" initialTab="snags" />} />
        <Route path="/toolbox" element={<PMDashboard key="toolbox" initialTab="toolbox" />} />
        <Route path="/documents" element={<PMDashboard key="docs" initialTab="projects" />} />
        <Route path="/hs-reports" element={<PMDashboard key="hs" initialTab="hsreport" />} />
        <Route path="/portal" element={<PMDashboard key="portal" initialTab="portal" />} />
        <Route path="/account" element={<PMDashboard key="settings" initialTab="settings" />} />
        <Route path="/toolbox-live/:talkId" element={<ToolboxTalkLive />} />
      </Routes>
    </SidebarLayout>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<WhyCoreSite />} />
      <Route path="/login" element={<PMLogin />} />
      <Route path="/why" element={<WhyCoreSite />} />
      <Route path="/old-landing" element={<LandingPage />} />
      {/* Legacy redirect */}
      <Route path="/pm-login" element={<Navigate to="/login" replace />} />
      <Route path="/pm" element={<Navigate to="/app/dashboard" replace />} />

      {/* Operative routes (public, no sidebar) */}
      <Route path="/operative" element={<OperativeSelect />} />
      <Route path="/operative/:operativeId/documents" element={<OperativeDocuments />} />
      <Route path="/operative/:operativeId/sign/:documentId" element={<SignDocument />} />
      <Route path="/operative/:operativeId/profile" element={<OperativeProfile />} />
      <Route path="/toolbox/:talkId" element={<ToolboxSign />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/portal/:projectId" element={<Portal />} />
      <Route path="/policies/:policyId" element={<Policies />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/snag-reply/:token" element={<SnagReply />} />
      <Route path="/aftercare/:projectId" element={<AftercarePage />} />
      <Route path="/site/:projectId" element={<SiteSignIn />} />

      {/* Snag drawing viewer (full screen, no sidebar) */}
      <Route path="/snags/:drawingId" element={<SnagDrawingView />} />
      <Route path="/progress/:drawingId" element={<ProgressViewer />} />

      {/* Super admin (no sidebar) */}
      <Route path="/superadmin" element={<SuperAdminPanel />} />

      {/* App routes (with sidebar) */}
      <Route path="/app/*" element={<AppLayout />} />
    </Routes>
  )
}
