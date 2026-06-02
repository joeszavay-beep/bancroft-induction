/**
 * Default pre-use checklist templates per equipment type.
 * These are seeded into equipment_checklist_templates with company_id = NULL.
 * Companies can override by creating their own row for a type.
 */

export const EQUIPMENT_TYPES = [
  { value: 'MEWP', label: 'MEWP' },
  { value: 'Scaffold Tower', label: 'Scaffold Tower' },
  { value: 'Podium', label: 'Podium' },
  { value: 'Step Ladder', label: 'Step Ladder' },
  { value: 'Power Tool', label: 'Power Tool' },
  { value: 'Fire Extinguisher', label: 'Fire Extinguisher' },
  { value: 'Temp Electrics', label: 'Temp Electrics' },
  { value: 'Other', label: 'Other' },
]

export const DEFAULT_CHECKLISTS = {
  'MEWP': [
    'Outriggers deployed and locked',
    'Guardrails secure and undamaged',
    'Emergency lowering tested',
    'Battery charge adequate',
    'Ground conditions stable and level',
    'Controls responsive and correct',
    'Safety harness anchor points checked',
    'No visible damage or leaks',
  ],
  'Scaffold Tower': [
    'Base plates or castors locked',
    'All braces in place and secure',
    'Platform boards secure with no gaps',
    'Toe boards fitted',
    'Guardrails at correct height',
    'No visible damage or corrosion',
    'Scaffold tag in date',
    'Outriggers deployed if required',
  ],
  'Podium': [
    'Platform locked in position',
    'Wheels locked',
    'Guardrails secure',
    'No visible damage or cracks',
    'Steps secure and non-slip',
  ],
  'Step Ladder': [
    'Feet / rubber pads intact',
    'No cracks, bends, or damage',
    'Locking mechanism works',
    'Rungs clean and non-slip',
    'Correct height for task',
  ],
  'Power Tool': [
    'Cable and plug undamaged',
    'Guard in place and secure',
    'PAT test in date',
    'Trigger / switch functional',
    'Blade / bit in good condition',
  ],
  'Fire Extinguisher': [
    'Pin intact and sealed',
    'Pressure gauge in green zone',
    'No visible damage or corrosion',
    'Service tag in date',
    'Nozzle clear and undamaged',
  ],
  'Temp Electrics': [
    'RCD tested and functional',
    'Cables undamaged and routed safely',
    'All connections secure',
    'Distribution board door closes and locks',
    'No signs of overheating or burning',
    'Labels legible and correct',
  ],
  'Other': [
    'General visual inspection passed',
    'No visible damage',
    'Safe to use',
  ],
}

export const EQUIPMENT_STATUSES = [
  { value: 'In Service', label: 'In Service', color: '#2C9C5E' },
  { value: 'Defective', label: 'Defective', color: '#D93E3E' },
  { value: 'Off-Site', label: 'Off-Site', color: '#D29922' },
  { value: 'Off-Hire', label: 'Off-Hire', color: '#7C828F' },
]

export const DEFECT_SEVERITIES = [
  { value: 'Minor', label: 'Minor', color: '#D29922' },
  { value: 'Major', label: 'Major', color: '#EA580C' },
  { value: 'Critical', label: 'Critical', color: '#D93E3E' },
]
