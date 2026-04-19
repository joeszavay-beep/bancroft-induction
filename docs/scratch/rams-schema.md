# RAMS Schema Investigation

Reference doc for the B4 RAMS Register section of the H&S report PDF.

## 1. Tables

There are **no dedicated RAMS tables**. RAMS documents are stored in the general-purpose `document_hub` table, filtered by `category = 'RAMS'`. No `rams_documents`, `rams_versions`, `rams_reviews`, `rams_approvals`, or `rams_submissions` tables exist.

Related tables:
- **`document_hub`** — primary storage for all document types including RAMS
- **`document_signoffs`** — operative sign-off records per document
- **`document_audit_log`** — action history per document
- **`document_packs`** — grouped document bundles (RAMS can be in packs)
- **`documents`** — legacy table (older, simpler schema; some RAMS-like titles exist here but the active system uses `document_hub`)

## 2. Schema: document_hub

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | | FK → companies(id) ON DELETE CASCADE |
| project_id | UUID | NULL | | FK → projects(id) ON DELETE SET NULL; NULL = company-wide |
| category | TEXT | NOT NULL | | e.g. 'RAMS', 'Method Statement', 'Drawing', etc. |
| subcategory | TEXT | NULL | | free-text |
| title | TEXT | NOT NULL | | |
| description | TEXT | NULL | | |
| file_url | TEXT | NULL | | Supabase Storage public URL (currently NULL for seeded data) |
| file_name | TEXT | NULL | | original filename |
| file_size | BIGINT | NULL | | bytes |
| file_type | TEXT | NULL | | MIME type |
| version | INT | NULL | 1 | integer version number |
| previous_version_id | UUID | NULL | | FK → document_hub(id); self-referential for version chains |
| tags | JSONB | NULL | '[]' | array of strings |
| requires_signoff | BOOLEAN | NULL | false | |
| signoff_roles | JSONB | NULL | '[]' | array of role strings |
| expiry_date | DATE | NULL | | |
| review_date | DATE | NULL | | next review due |
| is_template | BOOLEAN | NULL | false | |
| is_archived | BOOLEAN | NULL | false | |
| pack_id | UUID | NULL | | FK → document_packs(id) |
| uploaded_by | TEXT | NULL | | free-text name |
| uploaded_by_id | UUID | NULL | | |
| created_at | TIMESTAMPTZ | NULL | now() | |
| updated_at | TIMESTAMPTZ | NULL | now() | |
| doc_ref | TEXT | NULL | | document reference number |
| revision | TEXT | NULL | 'P01' | e.g. P01, C1, AB1 |
| issued_for | TEXT | NULL | 'Information' | e.g. Information, Construction, Approval, As Built |
| issue_reason | TEXT | NULL | 'Information' | |
| register | TEXT | NULL | | contractor/trade register name |
| is_read | BOOLEAN | NULL | false | |
| issued_date | TIMESTAMPTZ | NULL | now() | |

### Schema: document_signoffs

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| document_id | UUID | NOT NULL | FK → document_hub(id) ON DELETE CASCADE |
| operative_id | UUID | NOT NULL | FK → operatives(id) ON DELETE CASCADE |
| status | TEXT | NULL | 'pending' or 'signed' |
| signed_at | TIMESTAMPTZ | NULL | |
| viewed_at | TIMESTAMPTZ | NULL | |
| signature_url | TEXT | NULL | |
| ip_address | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NULL | now() |

### Schema: document_audit_log

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| document_id | UUID | NOT NULL | FK → document_hub(id) ON DELETE CASCADE |
| action | TEXT | NOT NULL | e.g. 'uploaded', 'viewed' |
| actor_name | TEXT | NULL | |
| actor_id | UUID | NULL | |
| details | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NULL | now() |

## 3. Versioning model

Single-row with an integer `version` column (default 1). A `previous_version_id` column exists for linking to the prior version's row, but **no rows currently use it** — all 20 RAMS docs have `previous_version_id = NULL`. The app's DocumentHub UI creates a new row with `version + 1` and sets `previous_version_id` when uploading a new version, but no seeded data exercises this.

Current version identification: **max version number** for a given title+project. No `is_current` flag.

## 4. Review / approval model

**No separate approval table.** There is no multi-signature approval workflow for RAMS documents in the schema.

Sign-off tracking uses `document_signoffs` — this tracks operative acknowledgement (they've read and signed the RAMS), not managerial approval. The `uploaded_by` field on `document_hub` is the closest thing to "issued by", and there is no "approved by" column.

The H&S report's RAMS register currently renders an "Approved by" column from `ramsRows[].approvedBy`, which is populated by looking for the first signed signoff. This is a display convention, not a schema-level approval.

## 5. Status / lifecycle

No `status` column on `document_hub` for RAMS. Lifecycle is implicit:
- `is_archived = false` → active
- `is_archived = true` → archived
- `requires_signoff = true` → operatives need to sign
- Sign-off completion tracked via `document_signoffs` rows (count signed vs total)

No draft/published/approved/withdrawn states.

## 6. Date columns

| Column | Purpose | Nullable |
|---|---|---|
| created_at | row creation | NULL (defaults to now()) |
| updated_at | last modification | NULL (defaults to now()) |
| review_date | next review due date | NULL |
| expiry_date | document expiry | NULL |
| issued_date | when formally issued | NULL (defaults to now()) |

No `deleted_at` column.

## 7. Project association

**Direct.** `document_hub.project_id` is a FK to `projects(id)`. NULL means company-wide (not project-specific). No intermediate table.

## 8. Soft-delete / archival

`is_archived` BOOLEAN (default false). No `deleted_at`, `is_active`, or `deleted` columns. Archived documents are excluded from active views by filtering `is_archived = false`.

## 9. File storage

- Column: `file_url` on `document_hub` — stores the Supabase Storage public URL
- Storage path convention: `hub/{companyId}/{category}/{filename}` (from DocumentHub.jsx upload logic)
- **Current state:** All 20 seeded RAMS docs have `file_url = NULL` and `file_name` set to a placeholder filename (e.g. `RAMS-Elec-FirstFix-Riverside.pdf`). No actual PDFs uploaded for demo data.

## 10. Sample rows (Riverside Tower project)

```
Title:          RAMS — Electrical First Fix
Revision:       P01
Version:        2
Doc Ref:        NULL
Uploaded by:    Sarah Chen
Requires sign:  true
Signoffs:       11/11 signed
Review date:    2026-07-01
Tags:           ["electrical","first fix","containment"]
Created:        2026-04-18
```

```
Title:          RAMS — Cable Pulling & Termination
Revision:       P01
Version:        1
Doc Ref:        NULL
Uploaded by:    Sarah Chen
Requires sign:  true
Signoffs:       8/11 signed
Review date:    2026-06-15
Tags:           ["cable","termination","SWA"]
Created:        2026-04-18
```

```
Title:          RAMS - Fire Stopping
Revision:       P01
Version:        1
Doc Ref:        NULL
Uploaded by:    Demo Manager
Requires sign:  true
Signoffs:       4/9 signed
Review date:    NULL
Tags:           (not checked)
Created:        (seeded)
```

## Gaps / uncertainties

- **No actual PDF files** exist for any RAMS document — `file_url` is NULL across all 20 rows. The report can only show metadata, not link to or embed the actual document.
- **No approval workflow** exists in the schema. The "Approved by" column in the report is derived from signoff data, not a dedicated field. The component will need to either drop this column or clearly label it as "First signed by" rather than "Approved by".
- **`previous_version_id` is unused** in practice — version chains are theoretical but no data exercises them.
- **Two RAMS systems coexist:** the legacy `documents` table has RAMS-like titles (e.g. "HV Isolation RAMS", "Working at Height RAMS") used by the older sign-off flow (`OperativeDocuments` → `SignDocument`). The newer `document_hub` table is used by the Document Hub UI. The H&S report currently queries `document_hub` only.
- **`doc_ref` is NULL** on all seeded RAMS. The report will show em-dashes in the Reference column unless users populate this field.
