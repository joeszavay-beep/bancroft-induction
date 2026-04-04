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

// Register service worker for offline support + update detection
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/service-worker.js',
        { type: import.meta.env.DEV ? 'module' : 'classic' }
      )
      console.log('SW registered:', registration.scope)

      // Detect new version available
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — show update banner
            const banner = document.createElement('div')
            banner.id = 'pwa-update-banner'
            banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;background:#1B6FC8;color:white;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px'
            banner.innerHTML = '<span style="font-size:16px">&#x1f504;</span> New version available — tap to update'
            banner.onclick = () => {
              newWorker.postMessage({ type: 'SKIP_WAITING' })
              window.location.reload()
            }
            document.body.appendChild(banner)
            // Auto-dismiss after 15 seconds
            setTimeout(() => banner.remove(), 15000)
          }
        })
      })
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
