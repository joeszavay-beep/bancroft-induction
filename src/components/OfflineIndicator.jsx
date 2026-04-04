import { useState, useEffect } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { WifiOff, Wifi, Loader2 } from 'lucide-react'

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus()
  const { syncing, pendingCount } = useSyncStatus()
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
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [isOnline])

  // Hide when online, not reconnecting, and not actively syncing
  if (isOnline && !showReconnected && !syncing) return null

  // Show syncing state even after reconnect banner would normally hide
  const showSyncing = isOnline && syncing

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white transition-all duration-300 ${
        !isOnline
          ? 'bg-amber-600'
          : showSyncing
            ? 'bg-blue-600'
            : 'bg-emerald-600'
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff size={14} />
          <span>You're offline — changes will sync when connected</span>
          {pendingCount > 0 && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{pendingCount} queued</span>
          )}
        </>
      ) : showSyncing ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>Syncing {pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? 's' : ''}` : ''}...</span>
        </>
      ) : (
        <>
          <Wifi size={14} />
          <span>Back online — all changes synced</span>
        </>
      )}
    </div>
  )
}
