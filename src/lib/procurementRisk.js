/**
 * Procurement risk calculation utility.
 * Used by both client (table rendering) and server (notifications).
 */

const PRE_PO_STATUSES = ['identified', 'specified', 'quoted', 'approved']
const POST_PO_STATUSES = ['po_raised', 'po_acknowledged', 'in_production', 'delivery_scheduled']

/**
 * Calculate the risk level for a procurement item.
 * @param {object} item — procurement_items row
 * @returns {{ level: 'green'|'amber'|'red'|'grey', label: string, reason: string }}
 */
export function calculateRisk(item) {
  if (!item) return { level: 'grey', label: 'Unknown', reason: '' }
  if (item.status === 'cancelled') return { level: 'grey', label: 'Cancelled', reason: 'Item cancelled' }
  if (item.status === 'received') {
    if (item.required_by_date && item.delivery_received_date > item.required_by_date) {
      return { level: 'amber', label: 'Received late', reason: `Received after required-by date` }
    }
    return { level: 'green', label: 'Received', reason: 'Delivered on time' }
  }

  const today = new Date().toISOString().split('T')[0]
  const in7 = addCalDays(today, 7)
  const in14 = addCalDays(today, 14)

  // Pre-PO risk: based on order_by_date
  if (PRE_PO_STATUSES.includes(item.status)) {
    if (!item.order_by_date) return { level: 'grey', label: 'No dates', reason: 'No order-by date set' }
    if (item.order_by_date < today) return { level: 'red', label: 'Order overdue', reason: `Order-by date was ${item.order_by_date}` }
    if (item.order_by_date <= in7) return { level: 'amber', label: 'Order soon', reason: `Order by ${item.order_by_date}` }
    return { level: 'green', label: 'On track', reason: `Order by ${item.order_by_date}` }
  }

  // Post-PO risk: based on delivery vs required-by
  if (POST_PO_STATUSES.includes(item.status)) {
    if (!item.required_by_date) return { level: 'green', label: 'On track', reason: 'No required-by date' }
    const rbd = item.required_by_date
    const rbd3 = addCalDays(rbd, -3)

    if (item.delivery_scheduled_date) {
      if (item.delivery_scheduled_date > rbd) return { level: 'red', label: 'Delivery late', reason: `Delivery after required-by` }
      if (item.delivery_scheduled_date > rbd3) return { level: 'amber', label: 'Tight delivery', reason: `Delivery within 3 days of required-by` }
      return { level: 'green', label: 'On track', reason: `Delivery before required-by` }
    }

    // No delivery scheduled
    if (rbd <= in14) return { level: 'red', label: 'No delivery date', reason: `Required by ${rbd}, no delivery scheduled` }
    return { level: 'amber', label: 'Schedule delivery', reason: `Required by ${rbd}` }
  }

  return { level: 'grey', label: item.status, reason: '' }
}

/**
 * Calculate order_by_date from required_by_date and lead_time_weeks.
 */
export function calculateOrderByDate(requiredByDate, leadTimeWeeks) {
  if (!requiredByDate || !leadTimeWeeks) return requiredByDate || null
  const days = Math.round(leadTimeWeeks * 7)
  return addCalDays(requiredByDate, -days)
}

function addCalDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Generate the next item number for a project (PT-001, PT-002, ...).
 */
export function nextItemNumber(existingNumbers) {
  if (!existingNumbers?.length) return 'PT-001'
  const nums = existingNumbers.map(n => parseInt(n.replace('PT-', ''), 10)).filter(n => !isNaN(n))
  const max = Math.max(0, ...nums)
  return `PT-${String(max + 1).padStart(3, '0')}`
}

/**
 * Risk pill colors for UI.
 */
export const RISK_COLORS = {
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#2EA043' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#D29922' },
  red: { bg: 'bg-red-100', text: 'text-red-700', dot: '#DA3633' },
  grey: { bg: 'bg-slate-100', text: 'text-slate-500', dot: '#94a3b8' },
}

export const STATUS_LABELS = {
  identified: 'Identified',
  specified: 'Specified',
  quoted: 'Quoted',
  approved: 'Approved',
  po_raised: 'PO Raised',
  po_acknowledged: 'PO Acknowledged',
  in_production: 'In Production',
  delivery_scheduled: 'Delivery Scheduled',
  received: 'Received',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS = {
  identified: 'bg-slate-100 text-slate-600',
  specified: 'bg-blue-100 text-blue-700',
  quoted: 'bg-violet-100 text-violet-700',
  approved: 'bg-indigo-100 text-indigo-700',
  po_raised: 'bg-cyan-100 text-cyan-700',
  po_acknowledged: 'bg-teal-100 text-teal-700',
  in_production: 'bg-amber-100 text-amber-700',
  delivery_scheduled: 'bg-orange-100 text-orange-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-400',
}
