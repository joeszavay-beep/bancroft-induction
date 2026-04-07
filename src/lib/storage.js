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
