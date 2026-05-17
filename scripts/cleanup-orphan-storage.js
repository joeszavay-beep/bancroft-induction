/**
 * Storage Orphan Cleanup
 *
 * Deletes storage files that are not referenced by any DB row.
 * Only deletes files older than 30 days by default.
 *
 * Usage:
 *   node scripts/cleanup-orphan-storage.js                    # dry-run (default)
 *   node scripts/cleanup-orphan-storage.js --confirm           # actually delete
 *   node scripts/cleanup-orphan-storage.js --confirm --all     # include files < 30 days old
 *
 * Environment:
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output:
 *   - Console summary
 *   - Deletion log written to scripts/orphan-cleanup-log-{timestamp}.json
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const DRY_RUN = !process.argv.includes('--confirm')
const INCLUDE_RECENT = process.argv.includes('--all')
const MIN_AGE_DAYS = INCLUDE_RECENT ? 0 : 30

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) { console.error('Missing env vars'); process.exit(1) }

const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const BUCKETS = ['documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings']

const DB_COLS = [
  ['operatives', ['card_front_url', 'card_back_url', 'photo_url']],
  ['signatures', ['signature_url']],
  ['snags', ['photo_url', 'review_photo_url']],
  ['aftercare_defects', ['photo_url']],
  ['toolbox_signatures', ['signature_url']],
  ['documents', ['file_url']],
  ['drawings', ['file_url']],
  ['progress_drawings', ['image_url']],
  ['companies', ['logo_url']],
  ['design_drawings', ['file_url', 'visual_url']],
  ['document_hub', ['file_url']],
  ['master_programme', ['file_url']],
  ['bim_models', ['file_url']],
  ['chat_messages', ['photo_url']],
  ['operative_invoices', ['attachments']],
]

async function listAll(bucket, prefix = '') {
  const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  if (!data) return []
  const files = []
  for (const item of data) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id && item.metadata) {
      files.push({
        path: full,
        size: item.metadata?.size || 0,
        mimetype: item.metadata?.mimetype || 'unknown',
        lastModified: item.updated_at || item.created_at || null,
      })
    } else {
      const sub = await listAll(bucket, full)
      files.push(...sub)
    }
  }
  return files
}

function extractPath(url) {
  if (!url) return null
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/)
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null
}

async function main() {
  const now = new Date()
  const cutoff = new Date(now - MIN_AGE_DAYS * 24 * 60 * 60 * 1000)

  console.log(`\n=== STORAGE ORPHAN CLEANUP ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE DELETE'}`)
  console.log(`Min age: ${MIN_AGE_DAYS} days (cutoff: ${cutoff.toISOString().split('T')[0]})`)
  console.log()

  // 1. Collect all DB-referenced paths
  const refsByBucket = {}
  for (const b of BUCKETS) refsByBucket[b] = new Set()

  for (const [table, cols] of DB_COLS) {
    try {
      const { data } = await sb.from(table).select(cols.join(','))
      if (!data) continue
      for (const row of data) {
        for (const col of cols) {
          const val = row[col]
          if (!val) continue
          if (col === 'attachments' && Array.isArray(val)) {
            for (const item of val) {
              const url = typeof item === 'string' ? item : item?.url
              if (!url) continue
              const p = extractPath(url)
              if (p && refsByBucket[p.bucket]) refsByBucket[p.bucket].add(p.path)
            }
          } else if (typeof val === 'string') {
            const p = extractPath(val)
            if (p && refsByBucket[p.bucket]) refsByBucket[p.bucket].add(p.path)
          }
        }
      }
    } catch {}
  }

  // 2. Find orphans per bucket
  const log = { timestamp: now.toISOString(), mode: DRY_RUN ? 'dry-run' : 'live', deletions: [] }
  let totalOrphans = 0, totalDeleted = 0, totalSkippedRecent = 0, totalSizeKB = 0

  for (const bucket of BUCKETS) {
    const allFiles = await listAll(bucket)
    const refs = refsByBucket[bucket]
    const orphans = allFiles.filter(f => !refs.has(f.path))

    if (orphans.length === 0) {
      console.log(`${bucket}: 0 orphans`)
      continue
    }

    const eligible = orphans.filter(f => {
      if (!f.lastModified) return true // unknown age = treat as old
      return new Date(f.lastModified) < cutoff
    })
    const skipped = orphans.length - eligible.length

    console.log(`\n${bucket}: ${orphans.length} orphans (${eligible.length} eligible, ${skipped} recent — skipped)`)
    totalOrphans += orphans.length
    totalSkippedRecent += skipped

    for (const file of eligible) {
      const sizeKB = Math.round(file.size / 1024)
      const age = Math.round((now - new Date(file.lastModified)) / (24 * 60 * 60 * 1000))
      totalSizeKB += sizeKB

      console.log(`  ${DRY_RUN ? '[would delete]' : '[deleting]'} ${file.path} (${sizeKB}KB, ${file.mimetype}, ${age}d old)`)

      if (!DRY_RUN) {
        const { error } = await sb.storage.from(bucket).remove([file.path])
        if (error) {
          console.error(`    ERROR: ${error.message}`)
          log.deletions.push({ bucket, path: file.path, size: file.size, status: 'error', error: error.message, timestamp: new Date().toISOString() })
        } else {
          totalDeleted++
          log.deletions.push({ bucket, path: file.path, size: file.size, mimetype: file.mimetype, age, status: 'deleted', timestamp: new Date().toISOString() })
        }
      } else {
        totalDeleted++
        log.deletions.push({ bucket, path: file.path, size: file.size, mimetype: file.mimetype, age, status: 'would-delete' })
      }
    }
  }

  // 3. Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`Total orphans found:     ${totalOrphans}`)
  console.log(`Eligible (> ${MIN_AGE_DAYS}d old):    ${totalDeleted}`)
  console.log(`Skipped (< ${MIN_AGE_DAYS}d old):     ${totalSkippedRecent}`)
  console.log(`Total size:              ${Math.round(totalSizeKB / 1024)}MB`)
  console.log(`Mode:                    ${DRY_RUN ? 'DRY RUN — nothing deleted' : 'LIVE — files deleted'}`)
  console.log(`${'='.repeat(50)}`)

  // 4. Write log
  const logPath = `scripts/orphan-cleanup-log-${now.toISOString().replace(/[:.]/g, '-').split('T')[0]}.json`
  writeFileSync(logPath, JSON.stringify(log, null, 2))
  console.log(`\nLog written to: ${logPath}`)

  if (DRY_RUN) {
    console.log(`\nRe-run with --confirm to actually delete.`)
    console.log(`Add --all to include files < ${MIN_AGE_DAYS} days old.`)
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
