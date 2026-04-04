import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { CompanyProvider } from './lib/CompanyContext'
import { ThemeProvider } from './lib/ThemeContext'
import { startSyncListener } from './lib/syncEngine'
import './index.css'
import App from './App.jsx'

// Start background sync listener
startSyncListener()

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/service-worker.js',
        { type: import.meta.env.DEV ? 'module' : 'classic' }
      )
      console.log('SW registered:', registration.scope)
    } catch (err) {
      console.log('SW registration failed:', err)
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <CompanyProvider>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: {
              background: '#fff',
              color: '#1A1A2E',
              border: '1px solid #E2E6EA',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            },
            success: {
              iconTheme: { primary: '#2EA043', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#DA3633', secondary: '#fff' },
            },
          }}
        />
      </CompanyProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
