import { useSyncStatus } from '../hooks/useSyncStatus'
import { Cloud, CloudOff, Loader2 } from 'lucide-react'

export default function SyncBadge() {
  const { syncing, pendingCount } = useSyncStatus()

  if (pendingCount === 0 && !syncing) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 mx-2 rounded-md bg-white/5 text-white/60 text-[11px]">
      {syncing ? (
        <>
          <Loader2 size={13} className="animate-spin text-blue-400" />
          <span className="text-blue-400">Syncing{pendingCount > 0 ? ` (${pendingCount})` : ''}...</span>
        </>
      ) : (
        <>
          <CloudOff size={13} className="text-amber-400" />
          <span className="text-amber-400">{pendingCount} pending</span>
        </>
      )}
    </div>
  )
}
