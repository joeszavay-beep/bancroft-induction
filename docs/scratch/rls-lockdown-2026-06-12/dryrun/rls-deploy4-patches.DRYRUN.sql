-- =====================================================================
-- CoreSite Deploy 4 PATCHES — corrections to rls-deploy4-lockdown.sql
--
-- RUN THIS IN: Supabase SQL Editor, IMMEDIATELY AFTER rls-deploy4-lockdown.sql
-- (same maintenance window). Idempotent: DROP POLICY IF EXISTS then CREATE.
--
-- ⚠️ REVIEW BATCH — NOT YET APPLIED TO PRODUCTION. Owner approves the lockdown
--    (deploy4 + this patch + storage-lockdown) separately, as one deliberate step.
--
-- Fixes the defects called out in RLS-REMEDIATION-PLAN.md §4:
--   A. operatives UPDATE had no WITH CHECK → operative could tenant-hop (§5.10)
--   B. ~11 "Pattern C" tables were scoped only by auth.role()='authenticated'
--      → any logged-in user of any company could read/write them (§5.7)
--   C. site_attendance had no UPDATE policy → manager sign-out corrections
--      silently 0-rowed (§5.5)
--   D. tables created after deploy4 was authored (equipment×4, project_floors,
--      procurement_schedules) — deploy4's drop-all loop would leave them with
--      zero policies (coverage gap found in the 2026-06-12 live baseline)
--
-- Depends on rls-deploy3 helpers: get_my_company_id(), get_operative_company_id(),
-- get_my_operative_id(). Adds get_my_agency_ids() below.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper: the agencies the current auth user belongs to. SECURITY DEFINER so
-- it bypasses RLS on agency_users — without this, an agency_users policy that
-- subqueries agency_users would recurse infinitely.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- agency_users is keyed by EMAIL in the app — it NEVER populates user_id
  -- (Signup.jsx / AgencyRegister.jsx insert {agency_id,email,name,role}; all
  -- reads filter by email). Match the client's lowercased-email writes.
  SELECT agency_id FROM agency_users WHERE lower(email) = lower(auth.jwt() ->> 'email')
$$;
GRANT EXECUTE ON FUNCTION get_my_agency_ids() TO authenticated;

-- =====================================================================
-- A. operatives UPDATE — add WITH CHECK to pin company_id (§5.10)
-- An operative may update their OWN row but must not move it to another tenant
-- or escalate; a manager may update their own company's operatives.
-- =====================================================================
DROP POLICY IF EXISTS "co_update" ON operatives;
CREATE POLICY "co_update" ON operatives FOR UPDATE
  USING (company_id = get_my_company_id() OR id = get_my_operative_id())
  WITH CHECK (
    company_id = get_my_company_id()
    OR (id = get_my_operative_id() AND company_id = get_operative_company_id())
  );

-- =====================================================================
-- C. site_attendance UPDATE — managers correct sign-out records (§5.5)
-- (deploy4 created SELECT/INSERT/DELETE but no UPDATE.)
-- =====================================================================
DROP POLICY IF EXISTS "co_update" ON site_attendance;
CREATE POLICY "co_update" ON site_attendance FOR UPDATE
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- =====================================================================
-- B. Pattern-C tables — replace auth.role()='authenticated' with tenant scope (§5.7)
-- =====================================================================

-- agencies: marketplace entity, no company_id.
-- SELECT is no longer blanket-readable (that exposed insurance docs, VAT/reg
-- numbers, addresses to every authenticated user). It is now scoped to the
-- agency's own users + companies already connected to that agency. Marketplace
-- DISCOVERY of unconnected agencies goes through search_agencies() (deploy3b),
-- which returns only the minimal connect-flow fields.
DROP POLICY IF EXISTS "agency_select" ON agencies;
CREATE POLICY "agency_select" ON agencies FOR SELECT USING (
  id IN (SELECT get_my_agency_ids())
  OR id IN (SELECT agency_id FROM agency_connections WHERE company_id = get_my_company_id())
);
-- Writes restricted to the agency's own users (insert stays open for registration,
-- where the agency_users row doesn't exist yet).
DROP POLICY IF EXISTS "agency_update" ON agencies;
CREATE POLICY "agency_update" ON agencies FOR UPDATE
  USING (id IN (SELECT get_my_agency_ids()));

-- agency_operatives (agency_id): the agency's own users manage them; connected
-- companies may view them.
DROP POLICY IF EXISTS "ao_select" ON agency_operatives;
DROP POLICY IF EXISTS "ao_insert" ON agency_operatives;
DROP POLICY IF EXISTS "ao_update" ON agency_operatives;
CREATE POLICY "ao_select" ON agency_operatives FOR SELECT USING (
  agency_id IN (SELECT get_my_agency_ids())
  OR agency_id IN (SELECT agency_id FROM agency_connections WHERE company_id = get_my_company_id())
);
CREATE POLICY "ao_insert" ON agency_operatives FOR INSERT WITH CHECK (
  agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "ao_update" ON agency_operatives FOR UPDATE USING (
  agency_id IN (SELECT get_my_agency_ids())
);

-- agency_users (agency_id, user_id): a user sees/manages users of their own agency
-- (and their own row, so a new registrant can link themselves).
DROP POLICY IF EXISTS "au_select" ON agency_users;
DROP POLICY IF EXISTS "au_insert" ON agency_users;
DROP POLICY IF EXISTS "au_update" ON agency_users;
CREATE POLICY "au_select" ON agency_users FOR SELECT USING (
  lower(email) = lower(auth.jwt() ->> 'email') OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "au_insert" ON agency_users FOR INSERT WITH CHECK (
  lower(email) = lower(auth.jwt() ->> 'email') OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "au_update" ON agency_users FOR UPDATE USING (
  agency_id IN (SELECT get_my_agency_ids())
);

-- agency_connections (company_id, agency_id): the company or the agency sees its links.
DROP POLICY IF EXISTS "ac_select" ON agency_connections;
DROP POLICY IF EXISTS "ac_insert" ON agency_connections;
DROP POLICY IF EXISTS "ac_update" ON agency_connections;
DROP POLICY IF EXISTS "ac_delete" ON agency_connections;
CREATE POLICY "ac_select" ON agency_connections FOR SELECT USING (
  company_id = get_my_company_id() OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "ac_insert" ON agency_connections FOR INSERT WITH CHECK (
  company_id = get_my_company_id() OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "ac_update" ON agency_connections FOR UPDATE USING (
  company_id = get_my_company_id() OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "ac_delete" ON agency_connections FOR DELETE USING (
  company_id = get_my_company_id() OR agency_id IN (SELECT get_my_agency_ids())
);

-- document_audit_log (document_id → document_hub): scope via the document's company.
-- NB document_id references document_hub (the DocumentHub table), NOT the legacy
-- documents table — confirmed by tracing a live row. Neither audit table has its
-- own company_id (the client's DocumentHub.jsx:224 .eq('company_id') filter on
-- document_signoffs is a separate pre-existing bug — see AUDIT §2.x follow-up).
DROP POLICY IF EXISTS "dal_select" ON document_audit_log;
DROP POLICY IF EXISTS "dal_insert" ON document_audit_log;
CREATE POLICY "dal_select" ON document_audit_log FOR SELECT USING (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
);
CREATE POLICY "dal_insert" ON document_audit_log FOR INSERT WITH CHECK (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
);

-- document_signoffs (document_id, operative_id): the document's company, or the
-- operative themselves.
DROP POLICY IF EXISTS "ds_select" ON document_signoffs;
DROP POLICY IF EXISTS "ds_insert" ON document_signoffs;
DROP POLICY IF EXISTS "ds_update" ON document_signoffs;
DROP POLICY IF EXISTS "ds_delete" ON document_signoffs;
CREATE POLICY "ds_select" ON document_signoffs FOR SELECT USING (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
  OR operative_id = get_my_operative_id()
);
CREATE POLICY "ds_insert" ON document_signoffs FOR INSERT WITH CHECK (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
  OR operative_id = get_my_operative_id()
);
CREATE POLICY "ds_update" ON document_signoffs FOR UPDATE USING (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
  OR operative_id = get_my_operative_id()
);
CREATE POLICY "ds_delete" ON document_signoffs FOR DELETE USING (
  document_id IN (SELECT id FROM document_hub WHERE company_id = get_my_company_id())
);

-- holiday_audit_log (holiday_request_id → holiday_requests): scope via the request's company.
DROP POLICY IF EXISTS "hal_select" ON holiday_audit_log;
DROP POLICY IF EXISTS "hal_insert" ON holiday_audit_log;
CREATE POLICY "hal_select" ON holiday_audit_log FOR SELECT USING (
  holiday_request_id IN (SELECT id FROM holiday_requests WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "hal_insert" ON holiday_audit_log FOR INSERT WITH CHECK (
  holiday_request_id IN (SELECT id FROM holiday_requests WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);

-- profile_audit_log (worker_id → operatives): scope via the operative's company.
DROP POLICY IF EXISTS "pral_select" ON profile_audit_log;
DROP POLICY IF EXISTS "pral_insert" ON profile_audit_log;
CREATE POLICY "pral_select" ON profile_audit_log FOR SELECT USING (
  worker_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "pral_insert" ON profile_audit_log FOR INSERT WITH CHECK (
  worker_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);

-- permit_signatures (permit_id → permits): scope via the permit's company.
DROP POLICY IF EXISTS "psig_select" ON permit_signatures;
DROP POLICY IF EXISTS "psig_insert" ON permit_signatures;
DROP POLICY IF EXISTS "psig_delete" ON permit_signatures;
CREATE POLICY "psig_select" ON permit_signatures FOR SELECT USING (
  permit_id IN (SELECT id FROM permits WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "psig_insert" ON permit_signatures FOR INSERT WITH CHECK (
  permit_id IN (SELECT id FROM permits WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "psig_delete" ON permit_signatures FOR DELETE USING (
  permit_id IN (SELECT id FROM permits WHERE company_id = get_my_company_id())
);

-- job_variations (job_id → subcontractor_jobs): scope via the job's company.
DROP POLICY IF EXISTS "jv_select" ON job_variations;
DROP POLICY IF EXISTS "jv_insert" ON job_variations;
DROP POLICY IF EXISTS "jv_update" ON job_variations;
DROP POLICY IF EXISTS "jv_delete" ON job_variations;
CREATE POLICY "jv_select" ON job_variations FOR SELECT USING (
  job_id IN (SELECT id FROM subcontractor_jobs WHERE company_id = get_my_company_id())
);
CREATE POLICY "jv_insert" ON job_variations FOR INSERT WITH CHECK (
  job_id IN (SELECT id FROM subcontractor_jobs WHERE company_id = get_my_company_id())
);
CREATE POLICY "jv_update" ON job_variations FOR UPDATE USING (
  job_id IN (SELECT id FROM subcontractor_jobs WHERE company_id = get_my_company_id())
);
CREATE POLICY "jv_delete" ON job_variations FOR DELETE USING (
  job_id IN (SELECT id FROM subcontractor_jobs WHERE company_id = get_my_company_id())
);

-- labour_proposals (labour_request_id → labour_requests, agency_id): the
-- requesting company OR the proposing agency.
DROP POLICY IF EXISTS "lp_select" ON labour_proposals;
DROP POLICY IF EXISTS "lp_insert" ON labour_proposals;
DROP POLICY IF EXISTS "lp_update" ON labour_proposals;
DROP POLICY IF EXISTS "lp_delete" ON labour_proposals;
CREATE POLICY "lp_select" ON labour_proposals FOR SELECT USING (
  labour_request_id IN (SELECT id FROM labour_requests WHERE company_id = get_my_company_id())
  OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "lp_insert" ON labour_proposals FOR INSERT WITH CHECK (
  agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "lp_update" ON labour_proposals FOR UPDATE USING (
  labour_request_id IN (SELECT id FROM labour_requests WHERE company_id = get_my_company_id())
  OR agency_id IN (SELECT get_my_agency_ids())
);
CREATE POLICY "lp_delete" ON labour_proposals FOR DELETE USING (
  agency_id IN (SELECT get_my_agency_ids())
);

-- =====================================================================
-- D. Tables created AFTER deploy4 was authored (2026-05-17) — coverage gap
-- found against the live policy dump (2026-06-12 §1 baseline). deploy4's
-- PART 3 drops EVERY public policy; without this section these tables would
-- be left RLS-enabled with ZERO policies, bricking their features for
-- legitimate users (and equipment_checks/equipment_defects INSERT also
-- currently carry WITH CHECK(true) anon-write holes this section closes).
--
-- Client call sites (verified 2026-06-12):
--   equipment            — SubcontractorJobDetail.jsx direct SELECT (manager);
--                          everything else via service-role /api/plant-equipment
--   equipment_checks/defects/checklist_templates — no direct client access
--                          (service-role API + get_equipment_public_check RPC);
--                          scoped SELECTs kept as belt-and-braces
--   project_floors       — PMDashboard.jsx CRUD + PlantEquipment.jsx SELECT
--                          (manager pages) → recreate add-floor-plans.sql set
--   procurement_schedules — ProcurementScheduler.jsx (manager) → recreate
--                          add-procurement-schedules.sql set (already scoped)
-- =====================================================================

-- equipment (company_id): standard tenant pattern — company read, manager CUD
DROP POLICY IF EXISTS "equipment_select" ON equipment;
DROP POLICY IF EXISTS "equipment_insert" ON equipment;
DROP POLICY IF EXISTS "equipment_update" ON equipment;
DROP POLICY IF EXISTS "equipment_delete" ON equipment;
CREATE POLICY "equipment_select" ON equipment FOR SELECT
  USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "equipment_insert" ON equipment FOR INSERT
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "equipment_update" ON equipment FOR UPDATE
  USING (company_id = get_my_company_id());
CREATE POLICY "equipment_delete" ON equipment FOR DELETE
  USING (company_id = get_my_company_id());

-- equipment_checks (company_id): company read. Inserts go through the
-- service-role API (bypasses RLS) — the old WITH CHECK(true) is NOT recreated.
DROP POLICY IF EXISTS "equipment_checks_select" ON equipment_checks;
DROP POLICY IF EXISTS "equipment_checks_insert" ON equipment_checks;
CREATE POLICY "equipment_checks_select" ON equipment_checks FOR SELECT
  USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());

-- equipment_defects (company_id): company read, manager update. Inserts via
-- service-role API — the old WITH CHECK(true) is NOT recreated.
DROP POLICY IF EXISTS "equipment_defects_select" ON equipment_defects;
DROP POLICY IF EXISTS "equipment_defects_insert" ON equipment_defects;
DROP POLICY IF EXISTS "equipment_defects_update" ON equipment_defects;
CREATE POLICY "equipment_defects_select" ON equipment_defects FOR SELECT
  USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "equipment_defects_update" ON equipment_defects FOR UPDATE
  USING (company_id = get_my_company_id());

-- equipment_checklist_templates (company_id): company read (was USING(true)),
-- manager CUD
DROP POLICY IF EXISTS "checklist_templates_select" ON equipment_checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_insert" ON equipment_checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_update" ON equipment_checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_delete" ON equipment_checklist_templates;
CREATE POLICY "checklist_templates_select" ON equipment_checklist_templates FOR SELECT
  USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "checklist_templates_insert" ON equipment_checklist_templates FOR INSERT
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "checklist_templates_update" ON equipment_checklist_templates FOR UPDATE
  USING (company_id = get_my_company_id());
CREATE POLICY "checklist_templates_delete" ON equipment_checklist_templates FOR DELETE
  USING (company_id = get_my_company_id());

-- project_floors (company_id): recreate the add-floor-plans.sql set verbatim
DROP POLICY IF EXISTS "pf_select" ON project_floors;
DROP POLICY IF EXISTS "pf_insert" ON project_floors;
DROP POLICY IF EXISTS "pf_update" ON project_floors;
DROP POLICY IF EXISTS "pf_delete" ON project_floors;
CREATE POLICY "pf_select" ON project_floors FOR SELECT USING (
  company_id = get_my_company_id()
);
CREATE POLICY "pf_insert" ON project_floors FOR INSERT WITH CHECK (
  company_id = get_my_company_id()
);
CREATE POLICY "pf_update" ON project_floors FOR UPDATE USING (
  company_id = get_my_company_id()
);
CREATE POLICY "pf_delete" ON project_floors FOR DELETE USING (
  company_id = get_my_company_id()
);

-- procurement_schedules (company_id): recreate the add-procurement-schedules.sql
-- set verbatim (already company-scoped)
DROP POLICY IF EXISTS "Company members can view their schedules" ON procurement_schedules;
DROP POLICY IF EXISTS "Company members can insert schedules" ON procurement_schedules;
DROP POLICY IF EXISTS "Company members can update their schedules" ON procurement_schedules;
DROP POLICY IF EXISTS "Company members can delete their schedules" ON procurement_schedules;
CREATE POLICY "Company members can view their schedules"
  ON procurement_schedules FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "Company members can insert schedules"
  ON procurement_schedules FOR INSERT
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "Company members can update their schedules"
  ON procurement_schedules FOR UPDATE
  USING (company_id = get_my_company_id());
CREATE POLICY "Company members can delete their schedules"
  ON procurement_schedules FOR DELETE
  USING (company_id = get_my_company_id());

ROLLBACK; -- DRY RUN (was COMMIT;) — nothing persists

-- =====================================================================
-- VERIFY (read-only, after running): no Pattern-C table is still wide-open to
-- any authenticated user, and operatives/site_attendance UPDATE have WITH CHECK.
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('agencies','agency_operatives','agency_users','agency_connections',
--       'document_audit_log','document_signoffs','holiday_audit_log','profile_audit_log',
--       'permit_signatures','job_variations','labour_proposals','operatives','site_attendance')
--   ORDER BY tablename, cmd;
-- Expect: no qual/with_check equal to "(auth.role() = 'authenticated'::text)" remains
-- except agencies/agency_users INSERT (registration) and agencies SELECT (if kept discoverable).
-- =====================================================================
