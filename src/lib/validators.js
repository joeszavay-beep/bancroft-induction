/**
 * Shared validation functions for operative profile fields.
 * Used by both the frontend InlineEditField and the API endpoint.
 */
import { todayDateStr, daysBetween as daysBetweenDates } from './dates'

export function validateDOB(value) {
  if (!value) return 'Date of birth is required'
  const dob = new Date(value)
  if (isNaN(dob.getTime())) return 'Invalid date'
  const today = new Date()
  const age = (today - dob) / (365.25 * 24 * 60 * 60 * 1000)
  if (age < 16) return 'Must be at least 16 years old'
  if (age > 100) return 'Invalid date of birth'
  return null
}

export function validateNI(value) {
  if (!value) return null // optional field
  const ni = value.replace(/\s/g, '').toUpperCase()
  // HMRC format: 2 letters, 6 digits, 1 letter (A-D)
  if (!/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(ni)) return 'Invalid NI number (e.g. AB123456C)'
  // Disallowed prefixes
  const prefix = ni.slice(0, 2)
  if (['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ'].includes(prefix)) return 'Invalid NI number prefix'
  return null
}

export function validateEmail(value) {
  if (!value) return 'Email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address'
  return null
}

export function validateUKMobile(value) {
  if (!value) return null // optional
  const cleaned = value.replace(/[\s\-()]/g, '')
  if (/^07\d{9}$/.test(cleaned)) return null
  if (/^\+447\d{9}$/.test(cleaned)) return null
  return 'Enter a valid UK mobile (07XXXXXXXXX)'
}

export function validateUKPhone(value) {
  if (!value) return null // optional
  const cleaned = value.replace(/[\s\-()]/g, '')
  if (/^0\d{10,11}$/.test(cleaned)) return null
  if (/^\+44\d{10,11}$/.test(cleaned)) return null
  return 'Enter a valid UK phone number'
}

export function validateCardExpiry(value) {
  if (!value) return null // optional
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Invalid date'
  const today = todayDateStr()
  const dateStr = value.split('T')[0] || value
  if (dateStr < today) return 'Card has expired'
  const daysUntil = daysBetweenDates(today, dateStr)
  if (daysUntil <= 30) return { warning: `Expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}` }
  return null
}

/** Normalise UK mobile to E.164 (+44...) for storage */
export function normalisePhone(value) {
  if (!value) return value
  const cleaned = value.replace(/[\s\-()]/g, '')
  if (/^07\d{9}$/.test(cleaned)) return '+44' + cleaned.slice(1)
  if (/^\+447\d{9}$/.test(cleaned)) return cleaned
  return value.trim()
}

/** Display E.164 as UK-friendly 07... */
export function displayPhone(value) {
  if (!value) return ''
  if (value.startsWith('+44') && value.length === 13) return '0' + value.slice(3)
  return value
}
