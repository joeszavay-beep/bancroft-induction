import { Routes, Route, Navigate } from 'react-router-dom'
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

// App pages (inside sidebar layout)
import AppHome from './pages/AppHome'
import PMDashboard from './pages/PMDashboard'
import AdminDashboard from './pages/AdminDashboard'
import ToolboxTalkLive from './pages/ToolboxTalkLive'
import SnagDrawingView from './pages/SnagDrawingView'

function AppLayout() {
  // Redirect if not logged in
  if (sessionStorage.getItem('pm_auth') !== 'true') {
    return <Navigate to="/login" replace />
  }
  return (
    <SidebarLayout>
      <Routes>
        <Route path="/" element={<AppHome />} />
        <Route path="/dashboard" element={<PMDashboard />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="/projects" element={<PMDashboard initialTab="projects" />} />
        <Route path="/workers" element={<PMDashboard initialTab="team" />} />
        <Route path="/workers/new" element={<PMDashboard initialTab="team" />} />
        <Route path="/invite-workers" element={<PMDashboard initialTab="team" />} />
        <Route path="/invite-existing" element={<PMDashboard initialTab="team" />} />
        <Route path="/pipeline" element={<PMDashboard initialTab="team" />} />
        <Route path="/snags" element={<PMDashboard initialTab="snags" />} />
        <Route path="/drawings" element={<PMDashboard initialTab="snags" />} />
        <Route path="/toolbox" element={<PMDashboard initialTab="toolbox" />} />
        <Route path="/documents" element={<PMDashboard initialTab="projects" />} />
        <Route path="/hs-reports" element={<PMDashboard initialTab="hsreport" />} />
        <Route path="/portal" element={<PMDashboard initialTab="portal" />} />
        <Route path="/account" element={<PMDashboard initialTab="settings" />} />
        <Route path="/toolbox-live/:talkId" element={<ToolboxTalkLive />} />
      </Routes>
    </SidebarLayout>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PMLogin />} />
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

      {/* Snag drawing viewer (full screen, no sidebar) */}
      <Route path="/snags/:drawingId" element={<SnagDrawingView />} />

      {/* App routes (with sidebar) */}
      <Route path="/app/*" element={<AppLayout />} />
    </Routes>
  )
}
