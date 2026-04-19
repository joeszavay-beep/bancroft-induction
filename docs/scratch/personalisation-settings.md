# H&S Report Personalisation Settings — Investigation

## 1. Current branding audit

### Hardcoded branding elements in the H&S report:

| Element | File | Line | Current value | V1 replacement |
|---|---|---|---|---|
| "CORESITE" wordmark | CoverPage.jsx | 59 | `<Text style={s.wordmark}>CORESITE</Text>` | Company name from `data.companyName`, or company logo if uploaded |
| "Construction Management Platform" subtitle | CoverPage.jsx | 60 | Hardcoded string | Configurable tagline, or hide if logo present |
| Navy header bar colour | theme.js | 2 | `navy: '#1E2A4A'` | `company.brand_colour` or `company.secondary_colour` (already exists on companies table) |
| Accent blue (section numbers, links, pills) | theme.js | 4 | `blue: '#3B82F6'` | `company.primary_colour` (already exists on companies table) |
| Footer company name | CoverPage.jsx | 122 | `data.companyName` | Already dynamic ✓ |
| Footer company name (page frames) | primitives.jsx | 33 | `clientName` prop | Already dynamic ✓ |
| Report reference format | HSReportDocument.jsx | 26-28 | `${pnAbbr}-${coAbbr}-XX-HS-X-${seq}` | Template-string from company settings |
| Report reference (cover) | CoverPage.jsx | 50-52 | Same format, duplicated | Should import from one place |
| Section titles (TOC) | CoverPage.jsx | 7-18 | `CONTENTS_SECTIONS` hardcoded array | Configurable names via company.section_config |
| Section titles (headers) | Each section component | Various | Hardcoded per-component | Passed as prop from section_config |
| Semantic colours (green/red/amber) | theme.js | 6-18 | Success/warning/danger tokens | NOT overridable — these are functional, not brand |

### Elements already dynamic (no work needed):
- Footer company name (`data.companyName` / `clientName` prop) ✓
- Cover project info strip (project name, address, issued by) ✓
- Report number (from `data.reportNumber` state) ✓

## 2. Schema plan

### `companies` table — current columns:

```
id, name, slug, logo_url, primary_colour, secondary_colour,
created_at, is_active, subscription_plan, trial_ends_at,
max_operatives, contact_email, contact_name, features,
onboarding_complete, onboarding_step, company_type, phone,
address, website, employee_count
```

**No `settings` column exists** (query confirmed). The `features` JSONB column exists for feature toggles but has a different purpose.

### Existing columns partially covering v1:
- `logo_url` — already stores company logo URL. **Reuse.** Currently used in app sidebar. Needs to propagate to PDF cover.
- `primary_colour` — already stores brand accent (`#1B6FC8`). **Reuse.** Currently used for app UI accent. Needs to propagate to PDF accent colour.
- `secondary_colour` — stores sidebar colour (`#1A2744`). **Candidate** for PDF header bar colour.
- `name` — company name. Already dynamic in PDF.

### Proposed migration:

```sql
-- Add report personalisation columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
-- settings will hold:
-- {
--   report: {
--     numbering_template: "{project_prefix}-{company_prefix}-XX-HS-X-{seq:05d}",
--     company_prefix: "ABC",
--     section_config: [
--       { id: "toolbox", name: "Toolbox Talks", included: true },
--       { id: "training", name: "Operative Training Matrix", included: true },
--       ...
--     ]
--   }
-- }
```

Single `settings` JSONB column. Additive — doesn't break existing queries. The `report` key is namespaced so other settings can coexist (e.g. `settings.notifications`, `settings.site_defaults` if CompanySettings grows).

**No new columns for logo/brand — they already exist as `logo_url`, `primary_colour`, `secondary_colour`.**

### Storage bucket for logos:
Logo uploads already use the existing `documents` storage bucket (path: `documents/logos/{companyId}/`). Some companies also use a `company-assets` bucket (Thomas Worley's logo is at `company-assets/thomas-worley-electrical-ltd/`). **No new bucket needed** — use whichever path the existing upload flow uses.

## 3. Section registry

### Current state: **two separate hardcoded lists, not linked.**

**List 1 — HSReportGenerator.jsx line 57-70:** `SECTIONS` array (12 entries including Settings and Cover Page). Used for the left-side section navigation in the UI form. Each entry: `{ id, label, icon }`.

**List 2 — CoverPage.jsx line 7-18:** `CONTENTS_SECTIONS` array (10 entries). Used for the PDF table of contents. Each entry: `{ num, title, page }`.

**List 3 — HSReportDocument.jsx line 52-129:** Each section is hardcoded as an individual JSX block in render order. No driving array — the order is implicit in the JSX.

**These three lists are not linked.** A rename in one doesn't propagate to the others. The section IDs don't match between lists 1 and 2 (e.g. `id: 'training'` vs `title: 'Operative Training Matrix'`).

**For v1 to work cleanly, these need unifying into a single section registry** that drives:
- The HSReportGenerator UI sidebar
- The CoverPage TOC
- The HSReportDocument render order
- The include/exclude filtering

Proposed registry shape:
```js
const REPORT_SECTIONS = [
  { id: 'toolbox',     num: 1,  defaultName: 'Toolbox Talks',             icon: BookOpen },
  { id: 'training',    num: 2,  defaultName: 'Operative Training Matrix',  icon: Users },
  { id: 'mgmt',        num: 3,  defaultName: 'Management Training',        icon: Shield },
  { id: 'equipment',   num: 4,  defaultName: 'Equipment Register',         icon: Wrench },
  { id: 'pm',          num: 5,  defaultName: 'PM Inspection',              icon: ClipboardList },
  { id: 'env',         num: 6,  defaultName: 'Environmental Inspection',   icon: Leaf },
  { id: 'operative',   num: 7,  defaultName: 'Operative Inspection',       icon: HardHat },
  { id: 'rams',        num: 8,  defaultName: 'RAMS Register',              icon: FileCheck },
  { id: 'labour',      num: 9,  defaultName: 'Labour Return',              icon: Calendar },
  { id: 'safestart',   num: 10, defaultName: 'Safe Start Cards',           icon: AlertTriangle },
]
```

Section config from `company.settings.report.section_config` overlays `defaultName` and `included` per-section. Missing config = all defaults.

## 4. Numbering scheme

### Current generation (two identical copies):

**HSReportDocument.jsx line 26-28:**
```js
const coAbbr = (data.companyName || 'CO').substring(0, 3).toUpperCase()  // "ABC"
const pnAbbr = (data.project?.name || 'PRJ').substring(0, 2).toUpperCase()  // "RI"
const reportRef = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(data.reportNumber || 1).padStart(5, '0')}`
// Result: "RI-ABC-XX-HS-X-00006"
```

**CoverPage.jsx line 50-52:** Identical logic, duplicated.

### Segment breakdown:

| Segment | Example | Source | Meaning |
|---|---|---|---|
| `pnAbbr` | RI | `project.name.substring(0,2).toUpperCase()` | Project prefix (first 2 chars of project name) |
| `coAbbr` | ABC | `companyName.substring(0,3).toUpperCase()` | Company prefix (first 3 chars of company name) |
| XX | XX | Hardcoded | Discipline code (always XX — placeholder) |
| HS | HS | Hardcoded | Document type (Health & Safety) |
| X | X | Hardcoded | Sub-type (always X — placeholder) |
| `seq` | 00006 | `data.reportNumber` padded to 5 digits | Running sequence number |

### Proposed template approach:

Store in `company.settings.report.numbering_template`:
```
"{project_prefix}-{company_prefix}-XX-HS-X-{seq:05d}"
```

Tokens:
- `{project_prefix}` — auto-derived from project name (first 2 chars), overridable per-project
- `{company_prefix}` — from `company.settings.report.company_prefix` (default: first 3 chars of company name)
- `{seq:05d}` — zero-padded sequence number, width from format spec
- All other characters are literal

### Risk of changing scheme:
Low. Report references are NOT persisted in the database — they're generated at render time and appear only in the PDF. No foreign keys, no lookups, no links depend on the format. Changing the template only affects future PDFs. Old PDFs retain their original reference on the page.

## 5. UI surface

### Existing settings page:
**Yes.** Route: `/app/settings` → `CompanySettings.jsx`. Currently has 6 sections:
1. Company Branding (name, logo, primary colour, sidebar colour)
2. PDF Templates (header style, footer text, powered-by toggle)
3. Notification Preferences
4. Site Defaults
5. Commercial Defaults
6. Account & Security

**Section 2 "PDF Templates" is the natural home** for report personalisation. It already has logo/colour controls. Extend it with:
- Section config table (10 rows, name edit + include toggle)
- Numbering scheme template + preview

Alternatively, add a new section 7 "H&S Report Settings" if section 2 is getting too long.

### Reusable components:
- **Logo upload**: CompanySettings already has one (line ~varies). Reuse.
- **Colour picker**: CompanySettings has preset swatches + custom hex input. Reuse.
- **Toggle switches**: Used in feature toggles section. Reuse for include/exclude.
- **Text input**: Standard across the app. Reuse for section names and numbering template.
- **No drag-reorder component exists.** If section reorder is v1, needs building. Recommend deferring reorder to v2.

## 6. Permissions

**No explicit permission model for report generation.** The H&S report page (`/app/hs-reports`) is inside `AppLayout` which requires `hasSession` (any logged-in manager). No role check, no `can_generate_reports` flag, no admin gate.

The CompanySettings page (`/app/settings`) also has no role restriction — any logged-in manager can access all settings.

**Implication:** "Anyone who can generate reports can edit settings" is already the reality. No permission changes needed.

## 7. Propagation surface

### Logo (company.logo_url → PDF cover):

| File | What changes |
|---|---|
| CoverPage.jsx | Replace "CORESITE" wordmark with `<Image>` from logo_url, or show company name if no logo |
| HSReportDocument.jsx | Pass `company.logo_url` in data (may already be in `data.company`) |
| HSReportGenerator.jsx | Ensure `company` object (with logo_url) reaches reportData |

3 files.

### Brand colour (company.primary_colour → PDF accent):

| File | What changes |
|---|---|
| theme.js | `C.blue` and `C.navy` would need to become dynamic, OR override at render time |
| CoverPage.jsx | Header bar background colour |
| primitives.jsx | SectionHeader navy background |
| Every section component | Section number colour (currently `C.blueLight`) |

**Risk: theme.js is a static import.** Making it dynamic requires either:
- (a) Passing brand colours as props through every component (verbose but safe)
- (b) A React context that @react-pdf/renderer components can consume (untested — react-pdf may not support React context)
- (c) Generate a custom theme object at render time in HSReportDocument and thread it through

Recommend (c): build the theme object once in HSReportDocument from company data, pass as a `theme` prop alongside `pageProps`. Each component reads `theme.navy` instead of `C.navy`. This is a significant refactor but scoped to the hsReport/ directory.

**4+ files, medium risk.**

### Section config (names + include/exclude):

| File | What changes |
|---|---|
| CoverPage.jsx | CONTENTS_SECTIONS becomes dynamic (filtered + renamed) |
| HSReportDocument.jsx | Conditional rendering per section based on `included` flag |
| primitives.jsx | SectionHeader title prop (already parameterised) |
| HSReportGenerator.jsx | SECTIONS sidebar list filtered/renamed |

4 files, low risk per file but high coordination risk (3 lists must stay in sync).

### Numbering scheme:

| File | What changes |
|---|---|
| HSReportDocument.jsx | reportRef generation uses template |
| CoverPage.jsx | Remove duplicate reportRef generation, receive as prop (already does) |

2 files, low risk. The duplicate in CoverPage should be removed regardless.

## 8. Proposed commit split

### Commit 1: Schema + settings UI skeleton
- Migration: add `settings` JSONB column to companies
- CompanySettings.jsx: add "H&S Report Settings" section with company_prefix input and section config table (name edit + include toggle)
- No PDF changes
- **Files:** CompanySettings.jsx, migration SQL
- **Risk:** Low. Independently releasable. Settings saved but not consumed yet.

### Commit 2: Section registry refactor
- Create `src/lib/hsReport/sectionRegistry.js` with the unified section list
- HSReportGenerator.jsx: replace SECTIONS array with import from registry
- CoverPage.jsx: replace CONTENTS_SECTIONS with filtered registry
- HSReportDocument.jsx: conditional rendering based on `included` flag
- **Files:** sectionRegistry.js (new), HSReportGenerator.jsx, CoverPage.jsx, HSReportDocument.jsx
- **Risk:** Medium. Touches the render pipeline. Must verify all 10 sections still render correctly.

### Commit 3: Logo + brand colour wiring
- CoverPage.jsx: replace "CORESITE" wordmark with logo image or company name
- HSReportDocument.jsx: build dynamic theme from company colours
- primitives.jsx: accept theme override for navy/blue
- Section components: thread theme prop
- **Files:** 6-8 files in hsReport/
- **Risk:** Medium-high. Broad surface, visual changes on every page. Needs full PDF re-verify.

### Commit 4: Numbering scheme wiring
- HSReportDocument.jsx: use template from settings, remove hardcoded format
- CoverPage.jsx: remove duplicate reportRef generation
- CompanySettings.jsx: numbering template editor with token preview
- **Files:** 3 files
- **Risk:** Low. Isolated change.

### Commit 5: Integration test + demo
- Update demo company settings with sample config
- Generate PDF, verify all personalisation surfaces
- **Files:** seed only
- **Risk:** Low.

## 9. Open questions for reviewer

1. **Logo vs wordmark.** When a company uploads a logo, does "CORESITE" disappear entirely? Or does it become "Powered by CoreSite" in small text below the company logo? Or does the wordmark always stay and the logo appears elsewhere?

2. **Brand colour scope.** The `primary_colour` already exists on companies. Does it replace:
   - Only the navy header bar? (safest)
   - Header bar + section number text + accent blue in pills? (broader)
   - All of navy + blue tokens? (maximum — risk of clashing with semantic red/green/amber)
   Recommend: header bar + section number colour only. Semantic colours stay fixed.

3. **Section rename propagation.** If a company renames "PM Inspection" to "Weekly Safety Inspection", where does the custom name appear?
   - Cover TOC — yes
   - Section header band — yes
   - Page footer — probably not (footer has report ref, not section name)
   - Cover attention callout ("PM Inspection: Scaffolding — non-compliant") — needs decision

4. **Section exclude and numbering.** If section 4 (Equipment Register) is excluded, do remaining sections renumber (01-09) or keep original numbers with a gap (01, 02, 03, 05, 06...)? Renumbering is cleaner. Gaps are simpler to implement and preserve cross-report consistency.

5. **Numbering prefix.** `coAbbr` is auto-derived as first 3 chars of company name ("ABC" for "ABC Construction"). Should the user be able to override this to any string (e.g. "ACLTD")? If yes, it's a separate `company_prefix` field. If no, it's always derived.

6. **"Powered by CoreSite" in PDF footer.** Currently the footer shows company name (left), report ref (centre), page number (right). No CoreSite branding in the footer. Should there be? The CompanySettings PDF Templates section has a "Show Powered by CoreSite" toggle — should this apply to the react-pdf report too?

7. **Migration timing.** The `settings` column doesn't exist yet. When should the migration run — before commit 1 (blocking), or can commit 1 handle the column not existing gracefully (defensive coding with fallback defaults)?
