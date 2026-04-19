# Equipment Register Schema Investigation

Reference doc for section 04 Equipment Register in the H&S report PDF.

## 1. Existing table

**No equipment table exists.** Checked: `equipment`, `plant`, `assets`, `plant_register`, `equipment_register`, `site_equipment`, `plant_items` — all return "not found in schema cache". No `document_hub` rows with `category = 'Equipment'` either.

Equipment data in the H&S report is currently **manual-entry only** — the HSReportGenerator UI has an editable table where users type in rows. Data is stored in React state (`equipmentRows`) and persisted to localStorage as part of the report draft. It is NOT backed by any Supabase table.

## 2. Existing seed data

**None.** `equipmentRows` initialises as `[]`. The demo account has never had equipment rows populated (they'd need to be typed manually in the H&S report UI). The current PDF renders "No equipment recorded" as a single-row fallback.

## 3. Existing UI field shape

The HSReportGenerator UI currently captures per-row:

| Field | UI widget | Maps to |
|---|---|---|
| description | text input | Item/description |
| ref | text input | Serial/ID |
| certExpiry | text input (free-form) | "Next Due" date |
| patExpiry | text input (free-form) | "Inspection Date" |
| safe | dropdown (Yes/No/--) | Status |

The old jsPDF report columns: `#`, `ITEM`, `SERIAL / ID`, `INSPECTION DATE`, `NEXT DUE`, `STATUS`.

## 3b. What construction sites actually track

A weekly equipment register on a UK construction site typically includes:

**Essential (V1):**
- Asset tag / ID — site-specific identifier (e.g. "PECO-003", "ST-007")
- Description — "PECO lift", "Scaffold tower", "110V transformer"
- Category — MEWP / Scaffold / Power tool / Lifting gear / Hand tool / Electrical
- Serial number — manufacturer serial
- Inspection date — last inspected (weekly for scaffold, pre-use for MEWPs)
- Next inspection due — derived or manual
- Status — In use / Defective / Off-hired / Quarantined
- Owner — Hired (supplier name) / Owned

**Nice-to-have (V2):**
- LOLER due date (for lifting equipment specifically)
- PAT test date (for electrical equipment)
- Location on site (level/zone)
- Off-hire date
- Photo of inspection tag

## 4. Adjacent tables

**Inspections** — the `inspections` table has results like "Plant & equipment condition — pass" and "Access equipment checked — pass" in PM/Operative checklists. These are binary compliance checks, not per-asset records. No join useful.

**Permit to Work** — the `permits` table records equipment referenced in permits (e.g. "MEWP" in a Working at Height permit), but as free-text in the description, not as FK to an equipment table.

**No joinable data exists.** Equipment register is standalone.

## 5. Decision: table migration or manual-only?

**Two options:**

### Option A — Manual-only (match current UI)
The PDF component reads `data.equipmentRows` from the H&S report form state (same as today). No new table. Users type equipment rows into the report form. Data lives in localStorage draft, not in the database.

**Pro:** Zero migration. Ships immediately. Matches the current workflow.
**Con:** Data not persistent across sessions (only in localStorage). Not queryable for analytics. Can't auto-populate from a central register.

### Option B — New `site_equipment` table
Create a proper equipment register table. The H&S report queries it. Equipment persists in the database. Can be managed separately from the report.

**Pro:** Persistent, queryable, shareable across reports. Enables a future "Equipment Register" page in the app.
**Con:** Requires migration + seed + potentially a new UI page. Larger scope than other report sections.

**Recommendation:** Option A for this report section. The equipment register is the only section that's manual-entry by design — it changes week to week as plant comes on/off site, and there's no existing digital source to auto-populate from. A future database-backed equipment register is a product feature, not a report feature.

## 6. Proposed summary strip (4 pills)

| Pill | Value | Border |
|---|---|---|
| Total items | count of rows | default |
| Inspected | count where status = "Yes" | green |
| Defective / overdue | count where status = "No" OR nextDue is past | red |
| Not inspected | count where status is empty/null | amber |

## 7. Proposed column set (portrait A4)

| Column | Width | Content |
|---|---|---|
| # | 22pt | row index |
| Item | flex | description |
| Serial / ID | 70pt | ref field |
| Last inspected | 65pt | patExpiry / inspectionDate, DD/MM/YY |
| Next due | 65pt | certExpiry / nextDue, DD/MM/YY, colour-coded like RAMS review dates |
| Status | 55pt | Yes = green pill, No = red pill, empty = em-dash |

6 columns, portrait orientation. Fits comfortably without overflow. Matches the existing old-jsPDF layout almost exactly.

## Answers to reviewer questions

### Q1 — Manager workflow in V1

**The form already exists.** HSReportGenerator.jsx lines 1498-1535 render an editable table for equipment. The manager:
1. Opens H&S Reports page
2. Selects project + week
3. Scrolls to section 6 "Equipment Register"
4. Clicks "+ Add Row" for each piece of equipment on site that week
5. Types: Item description, Serial/ID, Inspection Date, Next Due, Status (Yes/No dropdown)
6. Clicks "Save Draft" (persists to localStorage keyed by `project_id + weekStart`)
7. Clicks "Preview PDF" — equipment rows render in section 04

**Persistence model:** localStorage draft, keyed per project+week. The same manager on the same browser can reload and restore a draft via `tryLoadDraft()`. But:
- Different browser = lost
- Different user = lost
- Cleared localStorage = lost
- No database backing, no API, no cross-user sharing

**This is the ONLY manual-entry section in the report.** The other 9 sections auto-populate from Supabase. Equipment is manual because:
- Plant changes daily (hired in, off-hired, moved between sites)
- No existing equipment tracking system in the app to pull from
- The statutory requirement (LOLER, PUWER) is for a physical register/tag system, not a digital one — the weekly report just summarises what's on site

**No form UI work is in scope for this section.** The form exists. The PDF component just reads `data.equipmentRows` from the already-populated state.

### Q2 — Demo data

**Proposed approach: (a) — hardcode demo array in the PDF component.**

When `data.equipmentRows` is empty AND the project name matches "Riverside Tower", inject a realistic demo set of ~8 items. This:
- Only affects the PDF render, not the form state
- Doesn't leak demo data into real users' browsers
- Exercises all pill counts, column layout, status pills, and date colour coding
- Is obvious to maintain (remove when demo project changes)

Proposed demo items:
```
PECO Lift #1      | SN: PL-2024-0891 | Inspected: 14/04/26 | Next: 21/04/26 | Yes
PECO Lift #2      | SN: PL-2024-0892 | Inspected: 14/04/26 | Next: 21/04/26 | Yes
Scaffold Tower A  | SN: ST-2023-4410 | Inspected: 07/04/26 | Next: 14/04/26 | No (tag expired)
Scaffold Tower B  | SN: ST-2023-4411 | Inspected: 14/04/26 | Next: 21/04/26 | Yes
110V Transformer  | SN: TX-2022-1190 | Inspected: 10/03/26 | Next: 10/06/26 | Yes
SDS Drill (Hilti) | SN: HD-2024-2281 | Inspected: —        | Next: —        | (empty)
Podium Steps #3   | SN: PS-2023-1003 | Inspected: 14/04/26 | Next: 21/04/26 | Yes
Cable Drum Trailer| SN: CDT-001      | Inspected: 01/04/26 | Next: 01/05/26 | Yes
```

This gives: 6 inspected (Yes), 1 defective (No), 1 not inspected (empty). Scaffold Tower A has an overdue next-due date (14/04/26, before report week end 19/04/26). Cable Drum Trailer next due 01/05/26 = within 30 days. SDS Drill has no dates = em-dash fallback.

### Q3 — Pill reconciliation confirmed

Categories are **mutually exclusive** based on the `safe` field:
- `safe === 'Yes'` → Inspected (green)
- `safe === 'No'` → Defective / overdue (red)
- `safe` is empty/null → Not inspected (amber)

`Inspected + Defective + Not inspected === Total items` — always reconciles.

The "overdue" part of the red pill is additive context, not a separate category: if `nextDue` is past AND status is anything, the row appears in the Defective/overdue count. But since a defective item would have `safe === 'No'`, and an overdue-but-not-inspected item would have `safe` empty... actually these overlap.

**Revised pill logic (mutually exclusive):**
- `safe === 'Yes'` → **Inspected** (green border)
- `safe === 'No'` → **Failed** (red border)
- `safe` is empty → **Not inspected** (amber border)
- Total = sum of all three

This always reconciles. The "overdue next-due" colour coding applies to individual cells in the Next Due column, not to the pill categorisation.

### Q4 — Empty-state copy

Confirmed: "No equipment on register for this period"

## Gaps

- **Date fields are free-text.** The UI uses plain text inputs, not date pickers. `formatDate()` will return em-dash for malformed input, which is the correct fallback.
- **No database persistence.** Equipment data lives in localStorage only. This is a known product limitation, not a report-redesign concern.
- **Demo data is hardcoded, not seeded.** The demo array lives in the PDF component as a fallback when `equipmentRows` is empty for the demo project. Removing it requires one edit when the demo project changes.
