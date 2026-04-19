# Management Training Schema Investigation

Reference doc for section 03 Management Training in the H&S report PDF.

## Key finding

**Management training records live in the `operatives` table, not the `managers` table.**

The `managers` table stores app login accounts (name, email, password, role, project_ids, company_id, is_active). It has **zero training/cert columns** — no card_expiry, no SSSTS, no SMSTS, nothing. It's an auth table, not a training table.

The people who appear in "Management Training" on the report are **operatives with supervisor-level roles** — the same rows that were filtered OUT of the section 02 Operative Training Matrix by the `SUPERVISOR_ROLES` filter in `TrainingMatrix.jsx`.

## Data source

Same table, same columns, inverse filter:

```js
// TrainingMatrix.jsx line 20
const SUPERVISOR_ROLES = ['supervisor', 'foreman', 'manager', 'director']

// TrainingMatrix.jsx line 215 — EXCLUDES these from section 02
const nonSupervisors = ops.filter(op => !SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))
```

Section 03 should use the complement:
```js
const supervisors = ops.filter(op => SUPERVISOR_ROLES.includes((op.role || '').toLowerCase()))
```

## Current supervisors (Riverside Tower demo)

| Name | Role | CSCS | SSSTS | SMSTS | Other certs |
|---|---|---|---|---|---|
| Sarah Chen | Supervisor | — | — | — | All null — MISSING RECORDS |
| Chris Morgan | Supervisor | Gold, 20/03/28 | 10/06/27 | — | — |
| Paul Wright | Supervisor | Gold, 18/10/27 | — | 01/12/27 | — |

3 operatives. Sarah has zero certs (will render MISSING RECORDS row). Chris and Paul have partial certs.

## Implementation approach

**Reuse `TrainingMatrix.jsx` with a different filter and section number.** The component already handles:
- Cert column layout, expiry pills, missing records rows
- Summary strip (5 buckets)
- Chunked pagination with repeated headers
- Legend

Options:
1. **Parameterise TrainingMatrix** — add a `filterFn` or `includeRoles` prop. Section 02 passes `exclude: SUPERVISOR_ROLES`, section 03 passes `include: SUPERVISOR_ROLES`. Title and section number as props.
2. **Duplicate as ManagementTraining.jsx** — copy TrainingMatrix, change the filter. More code, simpler props.

Recommendation: **Option 1** — TrainingMatrix already accepts `operatives` as a prop. The caller (HSReportDocument) can pre-filter and pass only supervisors. No changes to TrainingMatrix needed — just pass different data and different props for section number/title.

## No new tables, no new queries needed

The `operatives` array is already loaded in HSReportGenerator and passed to HSReportDocument as `data.operatives`. Section 03 just filters it differently from section 02.
