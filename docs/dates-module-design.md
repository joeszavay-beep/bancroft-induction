# CoreSite Date Utility Module — Design Document

## Problem Statement

The codebase has 24+ duplicated `formatDate`/`formatTime` functions across pages and components, each with slightly different formatting and timezone handling. The `setHours(0,0,0,0).toISOString()` pattern (used in 26 locations) creates a timezone bug: during BST (UTC+1), local midnight converts to 23:00 UTC the previous day, causing Friday evening sign-ins to display as Saturday.

## Audit Summary

### DB Column Types (source of truth)

| Column pattern | Type | Examples |
|---|---|---|
| `created_at`, `updated_at`, `signed_at`, `recorded_at`, `cancelled_at`, `closed_at` | TIMESTAMPTZ | Stored in UTC, includes offset |
| `start_date`, `end_date`, `due_date`, `date`, `incident_date`, `date_of_birth`, `*_expiry` | DATE | Date-only, no time component |
| `start_time`, `end_time`, `sign_in_time`, `sign_out_time` | TIMESTAMPTZ | Despite the name, stored as full timestamps |

### Duplicated Functions Found (24 definitions)

- `formatDate()` — 14 independent implementations
- `formatTime()` — 4 implementations
- `formatDateTime()` — 3 implementations
- `formatDuration()` — 1 (SiteAttendance only)
- `formatDateWithDay()` — 1 (programmeCalc)
- `formatDateRange()` — 1 (HolidayApprovals)
- `formatDateShort()` — 2 implementations

### The `setHours(0,0,0,0).toISOString()` Bug (26 locations)

**Pattern:**
```javascript
const d = new Date()
d.setHours(0, 0, 0, 0)        // sets to local midnight
return d.toISOString()          // converts to UTC → WRONG during BST
```

**What happens during BST (UTC+1):**
- Local midnight = 00:00 BST = 23:00 UTC *previous day*
- A query for "today's attendance" using this boundary misses the last hour of the day
- The auto-signout cron (23:59 UTC = 00:59 BST) runs in the wrong day during summer

**Files affected:** SiteSignIn.jsx (2), SiteAttendance.jsx (3), TodayOnSite.jsx (1), ActivityFeed.jsx (1), AppHome.jsx (1), MasterProgramme.jsx (3), SubcontractorJobDetail.jsx (3), OperativeDashboard.jsx (1), HSReportGenerator.jsx (1), DocumentHub.jsx (2), AgencyOperativeDetail.jsx (1), OperativeTimesheet.jsx (1), validators.js (1), DaysWithoutIncident.jsx (2), PCCountdown.jsx (2), auto-signout.js (1)

### Categories of Date Usage

| Category | Count | Examples |
|---|---|---|
| DISPLAY | ~60 | Show dates in lists, detail views, PDFs |
| BOUNDARY | ~26 | "Start of today" for queries |
| COMPARISON | ~15 | "Is this date in the past?" |
| ARITHMETIC | ~10 | "Add N working days" |
| STORAGE | ~8 | Writing dates to DB |
| AGGREGATION | ~5 | "Group attendance by day" |

## Design Decisions

### 1. Canonical timezone: `Europe/London`

All display dates use `Europe/London`. This is a construction industry app used exclusively in the UK. The timezone is not configurable — it's hardcoded. This is intentional: construction workers sign in at 7am UK time, not 7am UTC.

The DB stores TIMESTAMPTZ (UTC) which is correct. The conversion happens at the display/boundary layer only.

### 2. Two date types, handled differently

| Type | DB column | JS representation | Display approach |
|---|---|---|---|
| **Timestamps** (when something happened) | TIMESTAMPTZ | ISO string with offset or `Z` | Convert to `Europe/London` for display |
| **Calendar dates** (what day something is) | DATE | `YYYY-MM-DD` string | Parse at noon UTC to avoid DST edges, display directly |

### 3. No external library

The module uses `Intl.DateTimeFormat` with `timeZone: 'Europe/London'` for all timezone conversions. No dependency on `dayjs`, `date-fns`, or `moment`. The browser's built-in `Intl` API handles DST transitions correctly.

### 4. `programmeCalc.js` stays separate

The working-day calculation logic in `programmeCalc.js` is already well-tested and has a different concern (programme scheduling) than the display/boundary utilities here. This module provides building blocks that `programmeCalc.js` can optionally consume, but won't duplicate its logic.

### 5. Bank holidays are consumed, not owned

Bank holidays are fetched from the `uk_bank_holidays` table and cached. The dates module provides working-day arithmetic functions that accept a bank holiday list as a parameter — it doesn't fetch them itself.

### 6. No `startOfDayUTC` — it's a footgun

`startOfDayUTC` was initially included but removed after we discovered every legitimate call site needed `startOfDayUK` instead. The function produced UTC midnight on the UK calendar date — which is 1 hour *after* UK midnight during BST. This meant TIMESTAMPTZ queries using it as a boundary would miss records in the 00:00–01:00 BST window, reintroducing the exact class of bug the module was built to fix. Keeping it as an exported option invited the same regression. If a future call site genuinely needs UTC midnight on a UK calendar date, implement it locally with explicit reasoning rather than relying on this module.

### 7. No DB column re-typing needed

All date columns are already correctly typed:
- TIMESTAMPTZ for moments in time
- DATE for calendar dates

No schema migration is required.

## Module API

### File: `src/lib/dates.js`

```
TIMEZONE CONSTANT
  TZ = 'Europe/London'

DISPLAY FUNCTIONS (timestamp → human string)
  formatDate(isoOrDate)           → "17 May 2026"
  formatDateWithDay(isoOrDate)    → "Sat 17 May 2026"
  formatDateShort(isoOrDate)      → "17 May"
  formatTime(isoOrDate)           → "14:30"
  formatDateTime(isoOrDate)       → "17 May 2026, 14:30"
  formatDateRange(startISO, endISO) → "12–19 May 2026" or "28 May – 3 Jun 2026"
  formatDuration(minutes)         → "2h 15m"
  formatRelative(isoOrDate)       → "3 days ago" / "in 2 hours" / "just now"

CALENDAR DATE FUNCTIONS (YYYY-MM-DD strings)
  formatCalendarDate(dateStr)     → "17 May 2026" (from DATE column)
  formatCalendarDateWithDay(dateStr) → "Sat 17 May 2026"
  parseCalendarDate(dateStr)      → Date object at noon UTC (safe from DST)

BOUNDARY FUNCTIONS (the setHours bug fix)
  startOfDayUK(date?)             → ISO string for midnight UK time
  todayDateStr()                  → "2026-05-17" (current UK date as YYYY-MM-DD)
  ukDateStr(isoOrDate)            → "2026-05-17" (extract UK calendar date from timestamp)

COMPARISON FUNCTIONS
  isToday(isoOrDate)              → boolean (in UK time)
  isPast(dateStr)                 → boolean (calendar date before today UK)
  isFuture(dateStr)               → boolean (calendar date after today UK)
  daysBetween(dateStr1, dateStr2) → number (calendar days between two DATE values)

ARITHMETIC FUNCTIONS
  addCalendarDays(dateStr, n)     → "YYYY-MM-DD"
  addWorkingDays(dateStr, n, opts) → "YYYY-MM-DD" (opts: { bankHolidays, nonWorkingPeriods, workingDays })
  isWorkingDay(dateStr, opts)     → boolean
  countWorkingDays(startStr, endStr, opts) → number

UTILITY
  weekStart(date?)                → "YYYY-MM-DD" (Monday of the current week in UK time)
  monthStart(date?)               → "YYYY-MM-DD"
```

## Migration Story

1. **Phase 1 (this session):** Build `src/lib/dates.js` with tests. No call-site changes.
2. **Phase 2 (next session):** Replace each duplicated `formatDate` / `formatTime` / `setHours` pattern one file at a time, testing after each batch. Start with the BOUNDARY functions (the bug fix), then DISPLAY functions.
3. **Phase 3 (future):** Update `programmeCalc.js` to import shared helpers from `dates.js` where appropriate.

Each phase is a separate commit. Phase 2 can be done incrementally — one category of pages at a time — with a build check between each batch.
