import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

// On mobile: persist sessions in localStorage (stay logged in)
// On web: sessionStorage by default, localStorage when "Remember Me" is checked
const store = isNative ? localStorage : sessionStorage

export function getSession(key) {
  // Check localStorage first (remember me / native), then sessionStorage
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

export function setSession(key, value, persistent = false) {
  const target = (isNative || persistent) ? localStorage : sessionStorage
  target.setItem(key, value)
}

export function removeSession(key) {
  localStorage.removeItem(key)
  sessionStorage.removeItem(key)
}

export function hasStoredSession() {
  return !!(localStorage.getItem('pm_auth') || sessionStorage.getItem('pm_auth') ||
    localStorage.getItem('operative_session') || sessionStorage.getItem('operative_session'))
}

export function setLastRole(role) {
  localStorage.setItem('last_role', role) // 'manager' or 'operative'
}

export function getLastRole() {
  return localStorage.getItem('last_role') // 'manager' | 'operative' | null
}

/**
 * Read operative session with backward-compat shim.
 * Old shape: { project_id, project_name, ... }
 * New shape: { projects: [{ id, name }], ... }
 */
export function getOperativeSession() {
  const raw = localStorage.getItem('operative_session') || sessionStorage.getItem('operative_session')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data.projects) {
      data.projects = data.project_id ? [{ id: data.project_id, name: data.project_name }] : []
      delete data.project_id
      delete data.project_name
    }
    return data
  } catch { return null }
}
