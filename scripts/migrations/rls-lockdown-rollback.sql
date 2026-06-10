-- =====================================================================
-- CoreSite RLS ROLLBACK — Captured 2026-05-17
--
-- This is the EXACT live state of all RLS policies before the lockdown.
-- Running this restores the previous (permissive) policy state.
--
-- To use: run in Supabase SQL Editor if the lockdown migration breaks things.
-- It drops all policies first (clean slate), then recreates the originals.
-- =====================================================================

BEGIN;

-- Drop all current policies (the lockdown ones)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Also drop helper functions and RPC functions added by lockdown
DROP FUNCTION IF EXISTS get_my_operative_id();
DROP FUNCTION IF EXISTS get_operative_company_id();
DROP FUNCTION IF EXISTS get_project_public_info(uuid);
DROP FUNCTION IF EXISTS get_snag_for_reply(text);
DROP FUNCTION IF EXISTS submit_snag_reply(text, text, text, text);
DROP FUNCTION IF EXISTS get_aftercare_defects(uuid, text);
-- FIX (lockdown-prep): the real function is 10 args (uuid + 9 text), not 11.
-- The old 11-arg signature never matched, so submit_aftercare_defect SURVIVED a
-- "rollback". Corrected to the actual signature (see rls-deploy3-rpc-functions.sql:144).
DROP FUNCTION IF EXISTS submit_aftercare_defect(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS get_portal_data(uuid);
DROP FUNCTION IF EXISTS get_toolbox_for_signing(uuid);
DROP FUNCTION IF EXISTS submit_toolbox_signature(uuid, uuid, text, text);

-- FIX (lockdown-prep): the "Company isolation" policies recreated below
-- reference get_user_company_id(), which is defined ONLY in the live DB (no
-- migration file creates it). If it was dropped before a rollback, every such
-- CREATE POLICY would throw and ABORT the rollback mid-incident. Define it here
-- so the rollback is self-contained. Matches get_my_company_id()'s intent
-- (the signed-in user's company from profiles). ⚠️ CONFIRM this matches the
-- live definition before relying on it; harmless if identical.
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

-- NOTE (lockdown-prep): this rollback also drops the deploy3/deploy3b PUBLIC
-- RPCs that the migrated public pages now depend on. If you roll back deploy4,
-- you must ALSO redeploy the pre-RPC client (or immediately re-apply
-- rls-deploy3 + rls-deploy3b), or the public pages will break. The deploy3b
-- functions (resolve_login_route, submit_snag_comment, get_operative_public_info,
-- operative_exists_by_email, get_equipment_public_check, get_operative_for_setup,
-- complete_operative_setup) and the deploy4 helpers (get_my_company_id,
-- get_my_agency_ids) are intentionally NOT dropped here so a partial rollback
-- doesn't strand a still-deployed client.


-- =====================================================================
-- RECREATE ALL ORIGINAL POLICIES (exact pre-lockdown state)
-- =====================================================================

-- ACTIVITY_FEED
CREATE POLICY activity_feed_delete ON public.activity_feed FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY activity_feed_insert ON public.activity_feed FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY activity_feed_select ON public.activity_feed FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY activity_feed_update ON public.activity_feed FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- AFTERCARE_DEFECTS
CREATE POLICY aftercare_defects_insert ON public.aftercare_defects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY aftercare_defects_select ON public.aftercare_defects FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- AGENCIES
CREATE POLICY agencies_all ON public.agencies FOR ALL TO public USING (true) WITH CHECK (true);

-- AGENCY_CONNECTIONS
CREATE POLICY agency_connections_all ON public.agency_connections FOR ALL TO public USING (true) WITH CHECK (true);

-- AGENCY_OPERATIVES
CREATE POLICY agency_operatives_all ON public.agency_operatives FOR ALL TO public USING (true) WITH CHECK (true);

-- AGENCY_USERS
CREATE POLICY agency_users_all ON public.agency_users FOR ALL TO public USING (true) WITH CHECK (true);

-- AUDIT_LOGS
CREATE POLICY audit_logs_all ON public.audit_logs FOR ALL TO public USING (true) WITH CHECK (true);

-- BIM_DRAWING_CALIBRATION
CREATE POLICY bim_calibration_delete ON public.bim_drawing_calibration FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY bim_calibration_insert ON public.bim_drawing_calibration FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY bim_calibration_select ON public.bim_drawing_calibration FOR SELECT TO public USING (true);
CREATE POLICY bim_calibration_update ON public.bim_drawing_calibration FOR UPDATE TO public USING (company_id = get_my_company_id());

-- BIM_ELEMENTS
CREATE POLICY bim_elements_delete ON public.bim_elements FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY bim_elements_insert ON public.bim_elements FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text));
CREATE POLICY bim_elements_select ON public.bim_elements FOR SELECT TO public USING (true);

-- BIM_MODELS
CREATE POLICY bim_models_delete ON public.bim_models FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY bim_models_insert ON public.bim_models FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text));
CREATE POLICY bim_models_select ON public.bim_models FOR SELECT TO public USING (true);
CREATE POLICY bim_models_update ON public.bim_models FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text));

-- CHAT_MESSAGES
CREATE POLICY chat_messages_delete ON public.chat_messages FOR DELETE TO public USING (true);
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT TO public WITH CHECK (true);
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY chat_messages_update ON public.chat_messages FOR UPDATE TO public USING (true);

-- CIS_RECORDS
CREATE POLICY cis_records_all ON public.cis_records FOR ALL TO public USING (true) WITH CHECK (true);

-- COMPANIES
CREATE POLICY companies_delete_open ON public.companies FOR DELETE TO public USING (true);
CREATE POLICY companies_insert_signup ON public.companies FOR INSERT TO public WITH CHECK (true);
CREATE POLICY companies_select ON public.companies FOR SELECT TO public USING (true);
CREATE POLICY companies_update ON public.companies FOR UPDATE TO public USING (id = get_my_company_id());
CREATE POLICY companies_update_any ON public.companies FOR UPDATE TO public USING (true);

-- CONTRA_CHARGES
CREATE POLICY contra_charges_all ON public.contra_charges FOR ALL TO public USING (true) WITH CHECK (true);

-- DAYWORK_SHEETS
CREATE POLICY daywork_sheets_all ON public.daywork_sheets FOR ALL TO public USING (true) WITH CHECK (true);

-- DEMO_REQUESTS
CREATE POLICY allow_insert ON public.demo_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY allow_select ON public.demo_requests FOR SELECT TO public USING (true);

-- DESIGN_DRAWINGS
CREATE POLICY design_drawings_delete ON public.design_drawings FOR DELETE TO public USING (true);
CREATE POLICY design_drawings_insert ON public.design_drawings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY design_drawings_select ON public.design_drawings FOR SELECT TO public USING (true);
CREATE POLICY design_drawings_update ON public.design_drawings FOR UPDATE TO public USING (true);

-- DOCUMENT_AUDIT_LOG
CREATE POLICY document_audit_log_all ON public.document_audit_log FOR ALL TO public USING (true) WITH CHECK (true);

-- DOCUMENT_HUB
CREATE POLICY document_hub_all ON public.document_hub FOR ALL TO public USING (true) WITH CHECK (true);

-- DOCUMENT_PACKS
CREATE POLICY document_packs_all ON public.document_packs FOR ALL TO public USING (true) WITH CHECK (true);

-- DOCUMENT_SIGNOFFS
CREATE POLICY document_signoffs_all ON public.document_signoffs FOR ALL TO public USING (true) WITH CHECK (true);

-- DOCUMENTS
CREATE POLICY "Company isolation delete" ON public.documents FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.documents FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.documents FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.documents FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public read for documents" ON public.documents FOR SELECT TO public USING (true);
CREATE POLICY documents_delete ON public.documents FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY documents_insert ON public.documents FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY documents_select ON public.documents FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY documents_update ON public.documents FOR UPDATE TO public USING (company_id = get_my_company_id());

-- DRAWING_LAYERS
CREATE POLICY drawing_layers_delete ON public.drawing_layers FOR DELETE TO public USING (true);
CREATE POLICY drawing_layers_insert ON public.drawing_layers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY drawing_layers_select ON public.drawing_layers FOR SELECT TO public USING (true);
CREATE POLICY drawing_layers_update ON public.drawing_layers FOR UPDATE TO public USING (true);

-- DRAWINGS
CREATE POLICY "Company isolation delete" ON public.drawings FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.drawings FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.drawings FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.drawings FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY drawings_delete ON public.drawings FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY drawings_insert ON public.drawings FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY drawings_select ON public.drawings FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY drawings_update ON public.drawings FOR UPDATE TO public USING (company_id = get_my_company_id());

-- HOLIDAY_AUDIT_LOG
CREATE POLICY "Allow all on holiday_audit_log" ON public.holiday_audit_log FOR ALL TO public USING (true) WITH CHECK (true);

-- HOLIDAY_REQUESTS
CREATE POLICY "Allow all on holiday_requests" ON public.holiday_requests FOR ALL TO public USING (true) WITH CHECK (true);

-- HS_OBSERVATIONS
CREATE POLICY hs_observations_all ON public.hs_observations FOR ALL TO public USING (true) WITH CHECK (true);

-- INCIDENTS
CREATE POLICY incidents_delete ON public.incidents FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY incidents_insert ON public.incidents FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY incidents_select ON public.incidents FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY incidents_update ON public.incidents FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- INSPECTION_TEMPLATES
CREATE POLICY inspection_templates_delete ON public.inspection_templates FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY inspection_templates_insert ON public.inspection_templates FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY inspection_templates_select ON public.inspection_templates FOR SELECT TO public USING (company_id = get_my_company_id());

-- INSPECTIONS
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO public WITH CHECK (true);
CREATE POLICY inspections_select ON public.inspections FOR SELECT TO public USING (true);
CREATE POLICY inspections_update ON public.inspections FOR UPDATE TO public USING (true);

-- JOB_DOCUMENTS
CREATE POLICY job_documents_all ON public.job_documents FOR ALL TO public USING (true) WITH CHECK (true);

-- JOB_OPERATIVES
CREATE POLICY job_operatives_all ON public.job_operatives FOR ALL TO public USING (true) WITH CHECK (true);

-- JOB_VARIATIONS
CREATE POLICY job_variations_all ON public.job_variations FOR ALL TO public USING (true) WITH CHECK (true);

-- LABOUR_BOOKINGS
CREATE POLICY labour_bookings_all ON public.labour_bookings FOR ALL TO public USING (true) WITH CHECK (true);

-- LABOUR_PROPOSALS
CREATE POLICY labour_proposals_all ON public.labour_proposals FOR ALL TO public USING (true) WITH CHECK (true);

-- LABOUR_REQUESTS
CREATE POLICY labour_requests_all ON public.labour_requests FOR ALL TO public USING (true) WITH CHECK (true);

-- MANAGERS
CREATE POLICY "Company isolation insert" ON public.managers FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.managers FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.managers FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY managers_insert ON public.managers FOR INSERT TO public WITH CHECK (true);

-- MARKUP_LINES
CREATE POLICY markup_lines_delete ON public.markup_lines FOR DELETE TO public USING (true);
CREATE POLICY markup_lines_insert ON public.markup_lines FOR INSERT TO public WITH CHECK (true);
CREATE POLICY markup_lines_select ON public.markup_lines FOR SELECT TO public USING (true);
CREATE POLICY markup_lines_update ON public.markup_lines FOR UPDATE TO public USING (true);

-- MASTER_ACTIVITIES
CREATE POLICY master_activities_all ON public.master_activities FOR ALL TO public USING (true) WITH CHECK (true);

-- MASTER_PROGRAMME
CREATE POLICY master_programme_all ON public.master_programme FOR ALL TO public USING (true) WITH CHECK (true);

-- NOTIFICATIONS
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO public USING (true);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO public WITH CHECK (true);
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO public USING (true);

-- OPERATIVE_AVAILABILITY
CREATE POLICY operative_availability_all ON public.operative_availability FOR ALL TO public USING (true) WITH CHECK (true);

-- OPERATIVE_CERTIFICATIONS
CREATE POLICY operative_certifications_all ON public.operative_certifications FOR ALL TO public USING (true) WITH CHECK (true);

-- OPERATIVE_INVOICES
CREATE POLICY operative_invoices_all ON public.operative_invoices FOR ALL TO public USING (true) WITH CHECK (true);

-- OPERATIVE_PROJECTS
CREATE POLICY "Allow all on operative_projects" ON public.operative_projects FOR ALL TO public USING (true) WITH CHECK (true);

-- OPERATIVES
CREATE POLICY "Company isolation delete" ON public.operatives FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.operatives FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.operatives FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.operatives FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public read for operative flow" ON public.operatives FOR SELECT TO public USING (true);
CREATE POLICY operatives_delete ON public.operatives FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY operatives_insert ON public.operatives FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY operatives_select ON public.operatives FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY operatives_update ON public.operatives FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- PAYMENT_APPLICATIONS
CREATE POLICY payment_applications_all ON public.payment_applications FOR ALL TO public USING (true) WITH CHECK (true);

-- PENDING_EMAIL_CHANGES
CREATE POLICY "Allow all on pending_email_changes" ON public.pending_email_changes FOR ALL TO public USING (true) WITH CHECK (true);

-- PERMIT_SIGNATURES
CREATE POLICY permit_signatures_all ON public.permit_signatures FOR ALL TO public USING (true) WITH CHECK (true);

-- PERMIT_TEMPLATES
CREATE POLICY permit_templates_all ON public.permit_templates FOR ALL TO public USING (true) WITH CHECK (true);

-- PERMITS
CREATE POLICY permits_all ON public.permits FOR ALL TO public USING (true) WITH CHECK (true);

-- POSTCODE_CACHE
CREATE POLICY postcode_cache_all ON public.postcode_cache FOR ALL TO public USING (true) WITH CHECK (true);

-- PROCUREMENT_ATTACHMENTS
CREATE POLICY allow_all ON public.procurement_attachments FOR ALL TO public USING (true) WITH CHECK (true);

-- PROCUREMENT_AUDIT_LOG
CREATE POLICY allow_all ON public.procurement_audit_log FOR ALL TO public USING (true) WITH CHECK (true);

-- PROCUREMENT_INVOICES
CREATE POLICY allow_all ON public.procurement_invoices FOR ALL TO public USING (true) WITH CHECK (true);

-- PROCUREMENT_ITEMS
CREATE POLICY allow_all ON public.procurement_items FOR ALL TO public USING (true) WITH CHECK (true);

-- PROCUREMENT_QUOTES
CREATE POLICY allow_all ON public.procurement_quotes FOR ALL TO public USING (true) WITH CHECK (true);

-- PROFILE_AUDIT_LOG
CREATE POLICY "Allow all on profile_audit_log" ON public.profile_audit_log FOR ALL TO public USING (true) WITH CHECK (true);

-- PROFILES
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO public USING (id = auth.uid());

-- PROGRAMME_ACTIVITIES
CREATE POLICY programme_activities_delete ON public.programme_activities FOR DELETE TO public USING (true);
CREATE POLICY programme_activities_insert ON public.programme_activities FOR INSERT TO public WITH CHECK (true);
CREATE POLICY programme_activities_select ON public.programme_activities FOR SELECT TO public USING (true);
CREATE POLICY programme_activities_update ON public.programme_activities FOR UPDATE TO public USING (true);

-- PROGRAMME_TASKS
CREATE POLICY allow_all ON public.programme_tasks FOR ALL TO public USING (true) WITH CHECK (true);

-- PROGRESS_DRAWINGS
CREATE POLICY "Company isolation delete" ON public.progress_drawings FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.progress_drawings FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.progress_drawings FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.progress_drawings FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY progress_drawings_delete ON public.progress_drawings FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY progress_drawings_insert ON public.progress_drawings FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY progress_drawings_select ON public.progress_drawings FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY progress_drawings_update ON public.progress_drawings FOR UPDATE TO public USING (company_id = get_my_company_id());

-- PROGRESS_ITEM_HISTORY
CREATE POLICY "Company isolation insert" ON public.progress_item_history FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.progress_item_history FOR SELECT TO public USING (company_id = get_user_company_id());

-- PROGRESS_ITEMS
CREATE POLICY "Company isolation delete" ON public.progress_items FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.progress_items FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.progress_items FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.progress_items FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY progress_items_delete ON public.progress_items FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY progress_items_insert ON public.progress_items FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY progress_items_select ON public.progress_items FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY progress_items_update ON public.progress_items FOR UPDATE TO public USING (company_id = get_my_company_id());

-- PROGRESS_SNAPSHOTS
CREATE POLICY progress_snapshots_insert ON public.progress_snapshots FOR INSERT TO public WITH CHECK (true);
CREATE POLICY progress_snapshots_select ON public.progress_snapshots FOR SELECT TO public USING (true);

-- PROGRESS_ZONES
CREATE POLICY "Company isolation delete" ON public.progress_zones FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.progress_zones FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.progress_zones FOR SELECT TO public USING (company_id = get_user_company_id());

-- PROJECT_CALENDAR_SETTINGS
CREATE POLICY allow_all ON public.project_calendar_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- PROJECT_NON_WORKING_PERIODS
CREATE POLICY allow_all ON public.project_non_working_periods FOR ALL TO public USING (true) WITH CHECK (true);

-- PROJECTS
CREATE POLICY "Company isolation delete" ON public.projects FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.projects FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.projects FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.projects FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public read projects" ON public.projects FOR SELECT TO public USING (true);
CREATE POLICY projects_delete_open ON public.projects FOR DELETE TO public USING (true);
CREATE POLICY projects_insert ON public.projects FOR INSERT TO public WITH CHECK (company_id = get_my_company_id());
CREATE POLICY projects_insert_open ON public.projects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY projects_select ON public.projects FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY projects_update ON public.projects FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- SETTINGS
CREATE POLICY "Company isolation insert" ON public.settings FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.settings FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.settings FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY settings_select ON public.settings FOR SELECT TO public USING (true);
CREATE POLICY settings_update ON public.settings FOR UPDATE TO public USING (true);
CREATE POLICY settings_upsert ON public.settings FOR INSERT TO public WITH CHECK (true);

-- SIGNATURES
CREATE POLICY "Company isolation delete" ON public.signatures FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.signatures FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.signatures FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.signatures FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public insert signatures" ON public.signatures FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public read signatures" ON public.signatures FOR SELECT TO public USING (true);
CREATE POLICY signatures_delete ON public.signatures FOR DELETE TO public USING (true);
CREATE POLICY signatures_insert ON public.signatures FOR INSERT TO public WITH CHECK (true);
CREATE POLICY signatures_select ON public.signatures FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY signatures_update ON public.signatures FOR UPDATE TO public USING (company_id = get_my_company_id());

-- SITE_ATTENDANCE
CREATE POLICY site_attendance_delete ON public.site_attendance FOR DELETE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY site_attendance_insert ON public.site_attendance FOR INSERT TO public WITH CHECK (true);
CREATE POLICY site_attendance_select ON public.site_attendance FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- SITE_DIARY
CREATE POLICY site_diary_delete ON public.site_diary FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY site_diary_insert ON public.site_diary FOR INSERT TO public WITH CHECK (true);
CREATE POLICY site_diary_select ON public.site_diary FOR SELECT TO public USING (true);
CREATE POLICY site_diary_update ON public.site_diary FOR UPDATE TO public USING (company_id = get_my_company_id());

-- SNAG_COMMENTS
CREATE POLICY "Company isolation delete" ON public.snag_comments FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.snag_comments FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.snag_comments FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public insert snag comments" ON public.snag_comments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY snag_comments_delete ON public.snag_comments FOR DELETE TO public USING (true);
CREATE POLICY snag_comments_delete_company ON public.snag_comments FOR DELETE TO public USING (true);
CREATE POLICY snag_comments_insert ON public.snag_comments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY snag_comments_select ON public.snag_comments FOR SELECT TO public USING (true);

-- SNAGS
CREATE POLICY "Company isolation delete" ON public.snags FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.snags FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.snags FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.snags FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public read snags for reply" ON public.snags FOR SELECT TO public USING (reply_token IS NOT NULL);
CREATE POLICY "Public update snags for reply" ON public.snags FOR UPDATE TO public USING (reply_token IS NOT NULL);
CREATE POLICY snags_delete ON public.snags FOR DELETE TO public USING (company_id = get_my_company_id());
CREATE POLICY snags_insert ON public.snags FOR INSERT TO public WITH CHECK ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY snags_select ON public.snags FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY snags_update ON public.snags FOR UPDATE TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));

-- SUB_INVOICES
CREATE POLICY sub_invoices_all ON public.sub_invoices FOR ALL TO public USING (true) WITH CHECK (true);

-- SUBCONTRACTOR_JOBS
CREATE POLICY subcontractor_jobs_all ON public.subcontractor_jobs FOR ALL TO public USING (true) WITH CHECK (true);

-- TIMESHEET_ENTRIES
CREATE POLICY timesheet_entries_all ON public.timesheet_entries FOR ALL TO public USING (true) WITH CHECK (true);

-- TOOLBOX_SIGNATURES
CREATE POLICY "Company isolation insert" ON public.toolbox_signatures FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Company isolation select" ON public.toolbox_signatures FOR SELECT TO public USING (true);
CREATE POLICY toolbox_signatures_delete ON public.toolbox_signatures FOR DELETE TO public USING (true);
CREATE POLICY toolbox_signatures_insert ON public.toolbox_signatures FOR INSERT TO public WITH CHECK (true);
CREATE POLICY toolbox_signatures_select ON public.toolbox_signatures FOR SELECT TO public USING (true);
CREATE POLICY toolbox_signatures_update ON public.toolbox_signatures FOR UPDATE TO public USING (true);

-- TOOLBOX_TALKS
CREATE POLICY "Company isolation delete" ON public.toolbox_talks FOR DELETE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation insert" ON public.toolbox_talks FOR INSERT TO public WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company isolation select" ON public.toolbox_talks FOR SELECT TO public USING (company_id = get_user_company_id());
CREATE POLICY "Company isolation update" ON public.toolbox_talks FOR UPDATE TO public USING (company_id = get_user_company_id());
CREATE POLICY "Public read toolbox talks" ON public.toolbox_talks FOR SELECT TO public USING (true);
CREATE POLICY toolbox_talks_delete ON public.toolbox_talks FOR DELETE TO public USING (true);
CREATE POLICY toolbox_talks_insert ON public.toolbox_talks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY toolbox_talks_select ON public.toolbox_talks FOR SELECT TO public USING ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text));
CREATE POLICY toolbox_talks_update ON public.toolbox_talks FOR UPDATE TO public USING (true);

-- UK_BANK_HOLIDAYS
CREATE POLICY allow_all ON public.uk_bank_holidays FOR ALL TO public USING (true) WITH CHECK (true);

COMMIT;
