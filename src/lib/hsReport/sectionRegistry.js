/**
 * Single source of truth for H&S report sections.
 *
 * Consumed by:
 *   - HSReportGenerator.jsx (UI sidebar navigation)
 *   - CoverPage.jsx (table of contents)
 *   - HSReportDocument.jsx (render order + conditional inclusion)
 *   - CompanySettings.jsx (section config editor)
 *
 * V1: default-only. Company settings override (custom names, include/exclude)
 * will be layered on in commit 3.
 */

export const DEFAULT_SECTIONS = [
  { id: 'toolbox',   defaultName: 'Toolbox Talks',             num: 1  },
  { id: 'training',  defaultName: 'Operative Training Matrix',  num: 2  },
  { id: 'mgmt',      defaultName: 'Management Training',        num: 3  },
  { id: 'equipment', defaultName: 'Equipment Register',         num: 4  },
  { id: 'pm',        defaultName: 'PM Inspection',              num: 5  },
  { id: 'env',       defaultName: 'Environmental Inspection',   num: 6  },
  { id: 'operative', defaultName: 'Operative Inspection',       num: 7  },
  { id: 'rams',      defaultName: 'RAMS Register',              num: 8  },
  { id: 'labour',    defaultName: 'Labour Return',              num: 9  },
  { id: 'safestart', defaultName: 'Safe Start Cards',           num: 10 },
]

/**
 * Build the resolved section list from defaults + company overrides.
 * For commit 2 (this commit), sectionConfig is always null/undefined — pure defaults.
 * Commit 3 will pass company.settings.report.section_config here.
 *
 * @param {Array|null} sectionConfig — array of { id, name, included } from company settings
 * @returns {Array} — [{ id, name, num, included }] with sequential numbering for included sections
 */
export function buildSectionList(sectionConfig) {
  // Start from defaults
  let sections = DEFAULT_SECTIONS.map(def => {
    const override = Array.isArray(sectionConfig)
      ? sectionConfig.find(s => s.id === def.id)
      : null
    return {
      id: def.id,
      name: override?.name || def.defaultName,
      included: override ? override.included !== false : true,
    }
  })

  // Assign sequential numbers to included sections only
  let seq = 1
  sections = sections.map(s => ({
    ...s,
    num: s.included ? seq++ : null,
  }))

  return sections
}
