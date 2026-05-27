/**
 * Templates registry.
 * Each entry defines a template tool available per project.
 * Adding a new template = add an entry here + create its page.
 */
export const TEMPLATES = [
  {
    key: 'procurement',
    label: 'Procurement Tracker',
    icon: 'Package',
    path: '/app/procurement',
    active: true,
    description: 'Track procurement from identification through delivery. Multi-supplier quotes, risk alerts, programme-linked dates.',
    color: '#0891B2',
  },
  {
    key: 'procurement-scheduler',
    label: 'Procurement Scheduler',
    icon: 'CalendarRange',
    path: '/app/procurement-scheduler',
    active: true,
    description: 'Reverse-scheduled procurement tracker. Enter On Site + Lead Time, get auto-calculated milestones with calendar view.',
    color: '#1B6FC8',
  },
  {
    key: 'rfi',
    label: 'RFI Tracker',
    icon: 'FileQuestion',
    path: null,
    active: false,
    description: 'Track Requests for Information with response deadlines and status.',
    color: '#7C3AED',
  },
  {
    key: 'variations',
    label: 'Variation Register',
    icon: 'FileDiff',
    path: null,
    active: false,
    description: 'Log and track contract variations with cost impact analysis.',
    color: '#EA580C',
  },
  {
    key: 'daywork',
    label: 'Daywork Sheets',
    icon: 'ClipboardList',
    path: null,
    active: false,
    description: 'Itemised labour, plant, and materials with rates and sign-off.',
    color: '#059669',
  },
]
