import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

// On mobile: persist sessions in localStorage (stay logged in)
// On web: use sessionStorage (login every time you open the page)
const store = isNative ? localStorage : sessionStorage

export function getSession(key) {
  return store.getItem(key)
}

export function setSession(key, value) {
  store.setItem(key, value)
}

export function removeSession(key) {
  store.removeItem(key)
}

export function hasStoredSession() {
  return !!store.getItem('pm_auth') || !!store.getItem('operative_session')
}

/**
 * Read operative session with backward-compat shim.
 * Old shape: { project_id, project_name, ... }
 * New shape: { projects: [{ id, name }], ... }
 */
export function getOperativeSession() {
  const raw = store.getItem('operative_session')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data.projects && (data.project_id || data.project_name)) {
      data.projects = data.project_id ? [{ id: data.project_id, name: data.project_name }] : []
      delete data.project_id
      delete data.project_name
    }
    return data
  } catch { return null }
}
