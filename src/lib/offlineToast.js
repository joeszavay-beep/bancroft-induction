import toast from 'react-hot-toast'

/**
 * Shows a toast with cloud icon styling for offline saves.
 * Use instead of toast.success() when an action was queued offline.
 */
export function toastOffline(message) {
  toast(message, {
    icon: '☁️',
    style: {
      background: '#FEF3C7',
      color: '#92400E',
      border: '1px solid #FCD34D',
    },
    duration: 3000,
  })
}

/**
 * Smart toast — shows offline-style if offline, normal success if online.
 */
export function toastSmart(onlineMsg, offlineMsg, isOffline) {
  if (isOffline) {
    toastOffline(offlineMsg || onlineMsg)
  } else {
    toast.success(onlineMsg)
  }
}
