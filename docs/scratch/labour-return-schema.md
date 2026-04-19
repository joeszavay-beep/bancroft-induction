# Labour Return Schema Investigation

Reference doc for the B5 Labour Return section of the H&S report PDF.

## 1. Tables

One table: **`site_attendance`**. No `operative_shifts`, `attendance_logs`, `operative_signins`, `shifts`, or `timesheets` tables exist. All attendance data lives in this single event-log table.

## 2. Schema: site_attendance

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK, gen_random_uuid() |
| company_id | UUID | NULL | FK → companies(id) ON DELETE CASCADE |
| project_id | UUID | NULL | FK → projects(id) ON DELETE CASCADE |
| operative_id | UUID | NULL | FK → operatives(id) — direct |
| operative_name | TEXT | NULL | denormalized name at time of sign-in |
| type | TEXT | NULL | `'sign_in'` or `'sign_out'` |
| recorded_at | TIMESTAMPTZ | NULL | event timestamp |
| ip_address | TEXT | NULL | captured on sign-in (web) |
| latitude | REAL/FLOAT | NULL | GPS if available |
| longitude | REAL/FLOAT | NULL | GPS if available |
| method | TEXT | NULL | e.g. `'qr'`, `'manual'`, `'auto'` |
| notes | TEXT | NULL | timing flag notes (e.g. "Late — arrived at 08:15") |
| created_at | TIMESTAMPTZ | NULL | row creation |

No `timing_flag` column exists as a separate field — timing flags are embedded in the `notes` text. No `is_valid`, `is_test`, `deleted_at`, `is_archived`, `edited_by`, or `trade` columns exist on this table.

## 3. Granularity

**Per-event.** Each sign-in is one row, each sign-out is a separate row. For a typical operative day: 1 sign_in row + 1 sign_out row = 2 rows.

Sign-in/sign-out pairing is **not explicit** — no shared shift_id or pair_id. The app pairs them by finding the most recent sign_in for an operative when processing a sign_out (see `SiteSignIn.jsx`). For reporting, the code counts raw event rows without pairing.

One operative can have multiple sign-in rows per day (no unique constraint prevents it), though the current demo data has zero duplicates.

## 4. Time fields

| Column | Type | Purpose | Nullable |
|---|---|---|---|
| recorded_at | TIMESTAMPTZ | event timestamp (sign-in or sign-out time) | NULL |
| created_at | TIMESTAMPTZ | row creation | NULL |

No separate `shift_date`, `shift_duration`, `sign_in_time`, or `sign_out_time` columns. The date is derived from `recorded_at` at query time. Duration is not stored — it would need to be computed by pairing sign_in and sign_out events.

## 5. Operative association

**Direct FK.** `operative_id` references `operatives(id)`. One operative can have multiple rows per day (sign_in + sign_out minimum, potentially more if they leave and return).

`operative_name` is denormalized at write time — it matches `operatives.name` at the moment of sign-in but won't update if the operative's name changes later.

## 6. Project / location association

**Direct FK.** `project_id` references `projects(id)`. One row = one event at one project. No site/gate/zone concept — project level only.

## 7. Contractor / trade / role association

**Not on the attendance row.** No `trade`, `role`, `contractor_id`, or `employer` columns exist on `site_attendance`. The current labour return aggregation in `HSReportGenerator.jsx` joins to the `operatives` table at query time to get `op.role` (used as trade) and `op.employer` (used as company). Falls back to `'General'` if neither exists.

This means the labour return grid groups by the operative's **current** role, not their role at the time of sign-in.

## 8. Data quality flags

None. No `is_valid`, `is_test`, `edited_by`, `deleted_at`, `is_archived`, or anomaly flag columns. Every row in the table is treated as valid.

## 9. How cover KPIs are currently computed

### "Shifts worked: 130"

Source: `computeReportSummary()` in `src/lib/hsReport/utils.js` (line 69-76).

```js
let totalShifts = 0
if (Array.isArray(labourData)) {
  labourData.forEach(row => {
    if (Array.isArray(row.days)) {
      totalShifts += row.days.reduce((sum, d) => sum + (Number(d) || 0), 0)
    }
  })
}
```

`labourData` is `labourRows` from `HSReportGenerator.jsx` (line 286-301). The aggregation:

1. Queries `site_attendance` filtered by `company_id`, `project_id`, `recorded_at` within the week (Mon 00:00:00 → Sun 23:59:59).
2. **Counts ALL records** — both `sign_in` and `sign_out` events. Does NOT filter by `type`.
3. For each record, looks up the operative in the `operatives` array to get `role` (as trade) and `employer` (as company).
4. Groups by `{company}_{trade}` key. Each group has a `days` array of 7 integers (Mon-Sun).
5. For each record, increments `days[dayIndex]++` where dayIndex is derived from `dayOfWeek(rec.recorded_at)` (Mon=0 through Sun=6).

**Critical finding:** The "130 shifts" figure is actually 130 **attendance events** (65 sign-ins + 65 sign-outs), not 65 shifts. The doubling happens because both sign_in and sign_out rows increment the day counter. The cover KPI label "Shifts worked" is misleading — it's really "Attendance events".

For B5 Labour Return, the component should decide whether to:
- (a) Match the cover KPI exactly (count all events = 130), or
- (b) Count only sign_in events (= 65 actual person-days), which is the real headcount

### "Operatives on site: 26"

Source: `computeReportSummary()` line 79:
```js
const operativeCount = Array.isArray(operatives) ? operatives.length : 0
```

This counts the total number of operatives loaded for the company (the `operatives` query at line 234-237), NOT the number who actually signed in during the week. The query loads all operatives matching `company_id` and `project_id` (or null project_id). So "26" is the total headcount on the project roster, not unique sign-ins for the period.

The actual unique sign-ins for the week is **14** (from the 65 sign_in records across 14 distinct operative_ids).

## 10. Sample rows (Riverside Tower, week 14-20 Apr 2026)

130 total rows (65 sign_in + 65 sign_out). Per-day sign_in distribution:

| Day | Date | Sign-ins | Unique ops |
|---|---|---|---|
| Mon | 2026-04-14 | 14 | 14 |
| Tue | 2026-04-15 | 12 | 12 |
| Wed | 2026-04-16 | 14 | 14 |
| Thu | 2026-04-17 | 14 | 14 |
| Fri | 2026-04-18 | 11 | 11 |
| Sat | — | 0 | 0 |
| Sun | — | 0 | 0 |

No same-operative-multiple-sign-ins-same-day in the demo data. Every sign_in has a matching sign_out (65 pairs). No partial shifts.

Sample row:
```json
{
  "id": "663fb2c4-...",
  "operative_id": "d92918e0-...",
  "operative_name": "Mark Robinson",
  "type": "sign_in",
  "method": "qr",
  "recorded_at": "2026-04-14T07:16:00+00:00",
  "project_id": "68c8298f-...",
  "company_id": "a3a6b344-...",
  "latitude": null,
  "longitude": null,
  "notes": null
}
```

## Gaps / uncertainties

- **Double-counting in cover KPI.** The "130 shifts" figure counts both sign_in and sign_out events. B5 must decide whether to reproduce this number (for consistency with the cover) or fix it to count only sign_ins (for accuracy). Flagging for reviewer decision.
- **"26 operatives" is roster size, not weekly actuals.** The cover shows 26 but only 14 unique operatives actually signed in during the week. B5's headcount total should use the actual sign-in count (14), not the roster count.
- **No trade/role on attendance rows.** Labour return grouping by trade depends on a join to the `operatives` table. If an operative's role changes, historical labour returns would retroactively change grouping. Not fixable without denormalizing.
- **No employer/contractor field on operatives.** The `op.employer` fallback in the aggregation code is always undefined in the current data — the `operatives` table doesn't have an `employer` column. The grouping falls back to using `trade` as both company and trade key.
