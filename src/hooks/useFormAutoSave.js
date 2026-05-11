import { useEffect, useState, useCallback, useRef } from 'react'

const PREFIX = 'coresite_autosave_'

/**
 * Auto-saves form data to localStorage and offers recovery on mount.
 *
 * @param {string} formKey — unique key for this form (e.g. 'add_worker')
 * @param {object} formData — current form state to save
 * @param {function} restoreData — callback to restore saved data
 * @param {object} options — { intervalMs: 10000 }
 * @returns {{ hasRecovery, acceptRecovery, dismissRecovery, clearSaved }}
 */
export default function useFormAutoSave(formKey, formData, restoreData, options = {}) {
  const { intervalMs = 10000 } = options
  const key = PREFIX + formKey
  const [hasRecovery, setHasRecovery] = useState(false)
  const savedRef = useRef(null)
  const formDataRef = useRef(formData)
  formDataRef.current = formData

  // Check for saved data on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Only offer recovery if saved less than 24 hours ago
        if (parsed._savedAt && Date.now() - parsed._savedAt < 24 * 60 * 60 * 1000) {
          savedRef.current = parsed
          setHasRecovery(true)
        } else {
          localStorage.removeItem(key)
        }
      }
    } catch { /* ignore corrupt data */ }
  }, [key])

  // Auto-save on interval
  useEffect(() => {
    const timer = setInterval(() => {
      const data = formDataRef.current
      // Only save if at least one field has content
      const hasContent = Object.values(data).some(v => v && v !== '' && v !== false && v !== 0)
      if (hasContent) {
        localStorage.setItem(key, JSON.stringify({ ...data, _savedAt: Date.now() }))
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }, [key, intervalMs])

  const acceptRecovery = useCallback(() => {
    if (savedRef.current) {
      const { _savedAt, ...data } = savedRef.current
      restoreData(data)
    }
    setHasRecovery(false)
    localStorage.removeItem(key)
  }, [restoreData, key])

  const dismissRecovery = useCallback(() => {
    setHasRecovery(false)
    localStorage.removeItem(key)
    savedRef.current = null
  }, [key])

  const clearSaved = useCallback(() => {
    localStorage.removeItem(key)
  }, [key])

  return { hasRecovery, acceptRecovery, dismissRecovery, clearSaved }
}
