import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import PMLogin from './pages/PMLogin'
import PMDashboard from './pages/PMDashboard'
import OperativeSelect from './pages/OperativeSelect'
import OperativeDocuments from './pages/OperativeDocuments'
import SignDocument from './pages/SignDocument'
import OperativeProfile from './pages/OperativeProfile'
import Portal from './pages/Portal'
import AdminDashboard from './pages/AdminDashboard'
import ToolboxTalkLive from './pages/ToolboxTalkLive'
import ToolboxSign from './pages/ToolboxSign'
import SnagDrawingView from './pages/SnagDrawingView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pm-login" element={<PMLogin />} />
      <Route path="/pm" element={<PMDashboard />} />
      <Route path="/operative" element={<OperativeSelect />} />
      <Route path="/operative/:operativeId/documents" element={<OperativeDocuments />} />
      <Route path="/operative/:operativeId/sign/:documentId" element={<SignDocument />} />
      <Route path="/operative/:operativeId/profile" element={<OperativeProfile />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/snags/:drawingId" element={<SnagDrawingView />} />
      <Route path="/toolbox-live/:talkId" element={<ToolboxTalkLive />} />
      <Route path="/toolbox/:talkId" element={<ToolboxSign />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/portal/:projectId" element={<Portal />} />
    </Routes>
  )
}
