# Safe Start Cards Schema Investigation

Reference doc for section 10 Safe Start Cards in the H&S report PDF.

## 1. Schema reality check

**No dedicated safe start table exists.** Checked: `safe_start_cards`, `safe_start`, `daily_briefings`, `briefings`, `start_cards`, `toolbox_start`, `safe_starts` — all missing from schema.

Safe Start Card data is **derived from `site_diary`** entries. The HSReportGenerator (lines 305-317) creates one card per day of the reporting week (Mon-Sun = 7 cards). For each day, it checks if a `site_diary` entry exists for that date+project. If one exists, all 10 checklist items get pre-filled with `'Y'`; if not, they're left empty.

The 10 checklist items are hardcoded in `SS_ITEMS` (line 50-55):
```
RAMS Relevant, Operatives Briefed, Fire Alarm Isolated,
RAMS Displayed, Permit Issued, Access Equipment Checked,
Other Teams Risk Assessed, Tools Suitable, Training Adequate,
Environment Changed
```

These are the daily pre-start safe working checks that a supervisor runs through before work begins each morning. On UK construction sites this is typically called a "Safe Start" or "Start of Shift" briefing card.

## 2. Product meaning

A Safe Start Card is a **daily pre-start checklist**. Each morning, the supervisor:
1. Gathers the team
2. Runs through the 10 items (RAMS relevant? PPE correct? Permits issued? etc.)
3. Marks Y / N / N/A for each item
4. Signs off — ready to start work

In the H&S report, section 10 shows these daily checks across the reporting week. It's the H&S supervisor's proof that daily briefings were conducted.

The data shape per card:
```js
{
  date: '2026-04-14',         // YYYY-MM-DD
  hasData: true,               // whether a site_diary entry exists for this day
  checks: [
    { label: 'RAMS Relevant', value: 'Y' },
    { label: 'Operatives Briefed', value: 'Y' },
    // ... 10 items total
  ]
}
```

Metadata stored separately in React state (NOT per-card — shared across all cards):
- `ssCompany` — company name (defaults to `company.name`)
- `ssSupervisor` — supervisor name (defaults to `managerData.name`)
- `ssTrade` — trade description (defaults to empty)

These metadata fields are **not currently passed to reportData** in the `previewPDF` function. They'll need to be added.

## 3. Data availability for Riverside Tower

`site_diary` has **6 entries** for the week:
- 2026-04-14 (Mon) ✓
- 2026-04-15 (Tue) ✓ (2 entries — one sunny by Demo Manager, one rain by Sarah Chen)
- 2026-04-16 (Wed) ✓
- 2026-04-17 (Thu) ✓
- 2026-04-18 (Fri) ✓
- 2026-04-19 (Sat) ✗
- 2026-04-20 (Sun) ✗

So 5 of 7 cards will have `hasData: true`. Weekend cards will be empty. The form allows the user to override Y/N/N/A per item, but the auto-populated values default all 10 items to 'Y' when a diary entry exists.

**Demo fallback is NOT needed** — the data auto-populates from `site_diary` which already has demo data. Unlike equipment (manual entry only), safe start cards derive from existing database records.

## 4. Existing placeholder

HSReportDocument.jsx, the section 10 placeholder:
```jsx
<PageFrame ...>
  <SectionHeader number={10} title="Safe start cards" />
  <Text style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 40 }}>
    Content will be added in Phase 3 & 4
  </Text>
</PageFrame>
```

Location: currently the only entry in the final placeholder array after section 9 (Labour Return) was implemented.

## 5. Proposed render shape

### The brief's key requirement (from the original redesign spec):

> **Safe Start Cards — collapse to one table.**
> Single table. Rows are the 10 checklist items. Columns are Mon / Tue / Wed / Thu / Fri / Sat / Sun.
> Cells contain Yes (green pill) / No (red pill) / — (muted em-dash for not-recorded).
> Company + supervisor + trade info moves to a small metadata strip above the table, not repeated per day.
> Result: one page instead of seven.

This was explicit in the original redesign brief. The old jsPDF report rendered one full page per day = 7 pages of near-identical content. The new design compresses to a single table.

### Layout:

**Section header:** "10 Safe start cards" + right-aligned "5 of 7 days recorded" (count of days with `hasData: true`)

**Metadata strip** (small, muted, above table):
- Company: {ssCompany} · Supervisor: {ssSupervisor} · Trade: {ssTrade}
- Falls back to company name / manager name / em-dash

**Summary strip (3 pills):**
- Days recorded — count of cards where hasData is true (green if 5/5 weekdays, amber otherwise)
- Items checked — total Y+N+NA values across all cards (not just Y)
- Compliance rate — percentage of checked items that are Y, expressed as "X%" (green >90%, amber 70-90%, red <70%)

**Table:**
- Row 0 (header): blank | Mon DD/MM | Tue DD/MM | Wed DD/MM | Thu DD/MM | Fri DD/MM | Sat DD/MM | Sun DD/MM
- Rows 1-10: one per SS_ITEM
  - Col 0: item label (left-aligned)
  - Col 1-7: Y = green pill "Y", N = red pill "N", N/A = muted pill, empty = em-dash
- No Total row (items are binary, not summable)

**Portrait orientation** — the 7 day columns are narrow (pill only, no date in the cell) so portrait fits.

**Empty state:** "No safe start records for this period" — skip pills and grid.

### Column widths (portrait A4, ~523pt content):
- Item label: flex (takes remaining space, ~200pt)
- Each day column: ~44pt (7 × 44 = 308pt)
- Total: ~508pt — fits portrait

### Demo fallback strategy:
Not needed. `safeStartCards` auto-populates from `site_diary` data which is already seeded. The only scenario producing empty state is a project with zero diary entries for the week.

## 6. Open questions for reviewer

1. **Metadata fields (ssCompany, ssSupervisor, ssTrade) need wiring.** They exist in HSReportGenerator state but are NOT passed in `reportData`. Should I add them to reportData (3-line wiring change), or derive company/supervisor from `data.companyName` / `data.issuedBy` which are already available?

2. **Weekend columns.** The brief says "always render Sat/Sun even when empty." The current demo data has no Sat/Sun diary entries, so those columns will show em-dashes for all 10 items. Confirm this is the expected render — not an error state.

3. **Compliance rate pill.** The auto-populated data defaults all items to 'Y' when a diary entry exists. This means compliance will always be 100% unless the user manually changes items to 'N' or 'N/A' in the form. Is a 100% compliance rate meaningful in the demo, or should I set 1-2 items to 'N' in the auto-population to make the pill visually interesting?

4. **Day header format.** Proposed: "Mon 14/04" (abbreviated day + DD/MM, no year). Confirm or adjust.
