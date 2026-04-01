import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { CompanyProvider } from './lib/CompanyContext'
import { ThemeProvider } from './lib/ThemeContext'
import './index.css'
import App from './App.jsx'

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
