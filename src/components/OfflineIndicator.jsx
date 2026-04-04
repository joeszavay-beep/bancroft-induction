import { useState, useEffect } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus()
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
    } else if (wasOffline) {
      setShowReconnected(true)
      const timer = setTimeout(() => {
        setShowReconnected(false)
        setWasOffline(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline])

  if (isOnline && !showReconnected) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white transition-all duration-300 ${
        isOnline
          ? 'bg-emerald-600'
          : 'bg-amber-600'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={14} />
          <span>Back online — syncing changes...</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>You're offline — changes will sync when connected</span>
        </>
      )}
    </div>
  )
}
