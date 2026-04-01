import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('coresite-theme') || 'light'
  })

  useEffect(() => {
    localStorage.setItem('coresite-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  function toggleTheme() {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
