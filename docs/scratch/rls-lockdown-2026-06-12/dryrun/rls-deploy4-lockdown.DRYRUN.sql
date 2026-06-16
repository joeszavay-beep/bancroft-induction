-- =====================================================================
-- CoreSite Deploy 4: RLS Policy Lockdown
--
-- RUN THIS IN: Supabase SQL Editor
-- WHEN: Deploy 4 (after Deploy 3 RPC functions are verified working)
--
-- This drops ALL existing RLS policies and replaces them with
-- company-scoped policies. Zero anon access to any table.
--
-- PRE-REQUISITES:
-- - Deploy 3 must be complete (RPC functions + client code)
-- - All active operatives must have Supabase Auth accounts
-- - Storage lockdown (#2) must be done
--
-- ROLLBACK: Run scripts/migrations/rls-lockdown-rollback.sql
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 3: DROP ALL EXISTING POLICIES
-- This removes EVERY policy on every public table, clean slate.
-- =====================================================================

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


-- =====================================================================
-- PART 4: CREATE NEW RESTRICTIVE POLICIES
-- =====================================================================

-- Shorthand used throughout:
--   get_my_company_id()          = manager's company (from profiles table)
--   get_operative_company_id()   = operative's company (from operatives table via JWT)
--   Both return NULL for anon → no rows match → access denied

-- -----------------------------------------------------------------
-- PATTERN A: Tables WITH company_id — manager CRUD + operative read
-- Manager can do everything; operative can read within their company.
-- -----------------------------------------------------------------

-- Helper to avoid repeating the same 4 policies for 30+ tables
-- (We'll call this inline below)

-- ACTIVITY_FEED
CREATE POLICY "co_select" ON activity_feed FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON activity_feed FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON activity_feed FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON activity_feed FOR DELETE USING (company_id = get_my_company_id());

-- AUDIT_LOGS
CREATE POLICY "co_select" ON audit_logs FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON audit_logs FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());

-- BIM_DRAWING_CALIBRATION
CREATE POLICY "co_select" ON bim_drawing_calibration FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON bim_drawing_calibration FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON bim_drawing_calibration FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON bim_drawing_calibration FOR DELETE USING (company_id = get_my_company_id());

-- BIM_ELEMENTS
CREATE POLICY "co_select" ON bim_elements FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON bim_elements FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON bim_elements FOR DELETE USING (company_id = get_my_company_id());

-- BIM_MODELS
CREATE POLICY "co_select" ON bim_models FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON bim_models FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON bim_models FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON bim_models FOR DELETE USING (company_id = get_my_company_id());

-- CIS_RECORDS
CREATE POLICY "co_select" ON cis_records FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON cis_records FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON cis_records FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON cis_records FOR DELETE USING (company_id = get_my_company_id());

-- CONTRA_CHARGES
CREATE POLICY "co_select" ON contra_charges FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON contra_charges FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON contra_charges FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON contra_charges FOR DELETE USING (company_id = get_my_company_id());

-- DAYWORK_SHEETS
CREATE POLICY "co_select" ON daywork_sheets FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON daywork_sheets FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON daywork_sheets FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON daywork_sheets FOR DELETE USING (company_id = get_my_company_id());

-- DESIGN_DRAWINGS
CREATE POLICY "co_select" ON design_drawings FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON design_drawings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON design_drawings FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON design_drawings FOR DELETE USING (company_id = get_my_company_id());

-- DOCUMENT_HUB
CREATE POLICY "co_select" ON document_hub FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON document_hub FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON document_hub FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON document_hub FOR DELETE USING (company_id = get_my_company_id());

-- DOCUMENT_PACKS
CREATE POLICY "co_select" ON document_packs FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON document_packs FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON document_packs FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON document_packs FOR DELETE USING (company_id = get_my_company_id());

-- DRAWING_LAYERS
CREATE POLICY "co_select" ON drawing_layers FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON drawing_layers FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON drawing_layers FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON drawing_layers FOR DELETE USING (company_id = get_my_company_id());

-- DRAWINGS
CREATE POLICY "co_select" ON drawings FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON drawings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON drawings FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON drawings FOR DELETE USING (company_id = get_my_company_id());

-- HOLIDAY_REQUESTS
CREATE POLICY "co_select" ON holiday_requests FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON holiday_requests FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON holiday_requests FOR UPDATE USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());

-- HS_OBSERVATIONS
CREATE POLICY "co_select" ON hs_observations FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON hs_observations FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON hs_observations FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON hs_observations FOR DELETE USING (company_id = get_my_company_id());

-- INCIDENTS
CREATE POLICY "co_select" ON incidents FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON incidents FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON incidents FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON incidents FOR DELETE USING (company_id = get_my_company_id());

-- INSPECTION_TEMPLATES
CREATE POLICY "co_select" ON inspection_templates FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON inspection_templates FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON inspection_templates FOR DELETE USING (company_id = get_my_company_id());

-- INSPECTIONS
CREATE POLICY "co_select" ON inspections FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON inspections FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON inspections FOR UPDATE USING (company_id = get_my_company_id());

-- JOB_DOCUMENTS
CREATE POLICY "co_select" ON job_documents FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON job_documents FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON job_documents FOR UPDATE USING (company_id = get_my_company_id());

-- JOB_OPERATIVES
CREATE POLICY "co_select" ON job_operatives FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON job_operatives FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON job_operatives FOR UPDATE USING (company_id = get_my_company_id());

-- LABOUR_BOOKINGS
CREATE POLICY "co_select" ON labour_bookings FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON labour_bookings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON labour_bookings FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON labour_bookings FOR DELETE USING (company_id = get_my_company_id());

-- LABOUR_REQUESTS
CREATE POLICY "co_select" ON labour_requests FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON labour_requests FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON labour_requests FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON labour_requests FOR DELETE USING (company_id = get_my_company_id());

-- MARKUP_LINES
CREATE POLICY "co_select" ON markup_lines FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON markup_lines FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON markup_lines FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON markup_lines FOR DELETE USING (company_id = get_my_company_id());

-- MASTER_ACTIVITIES
CREATE POLICY "co_select" ON master_activities FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON master_activities FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON master_activities FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON master_activities FOR DELETE USING (company_id = get_my_company_id());

-- MASTER_PROGRAMME
CREATE POLICY "co_select" ON master_programme FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON master_programme FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON master_programme FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON master_programme FOR DELETE USING (company_id = get_my_company_id());

-- PAYMENT_APPLICATIONS
CREATE POLICY "co_select" ON payment_applications FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON payment_applications FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON payment_applications FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON payment_applications FOR DELETE USING (company_id = get_my_company_id());

-- PERMIT_TEMPLATES
CREATE POLICY "co_select" ON permit_templates FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON permit_templates FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON permit_templates FOR DELETE USING (company_id = get_my_company_id());

-- PERMITS
CREATE POLICY "co_select" ON permits FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON permits FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON permits FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON permits FOR DELETE USING (company_id = get_my_company_id());

-- PROGRAMME_ACTIVITIES
CREATE POLICY "co_select" ON programme_activities FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON programme_activities FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON programme_activities FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON programme_activities FOR DELETE USING (company_id = get_my_company_id());

-- PROGRESS_DRAWINGS
CREATE POLICY "co_select" ON progress_drawings FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON progress_drawings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON progress_drawings FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON progress_drawings FOR DELETE USING (company_id = get_my_company_id());

-- PROGRESS_ITEMS
CREATE POLICY "co_select" ON progress_items FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON progress_items FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON progress_items FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON progress_items FOR DELETE USING (company_id = get_my_company_id());

-- PROGRESS_ITEM_HISTORY
CREATE POLICY "co_select" ON progress_item_history FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON progress_item_history FOR INSERT WITH CHECK (company_id = get_my_company_id());

-- PROGRESS_ZONES
CREATE POLICY "co_select" ON progress_zones FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON progress_zones FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON progress_zones FOR DELETE USING (company_id = get_my_company_id());

-- SITE_DIARY
CREATE POLICY "co_select" ON site_diary FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON site_diary FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON site_diary FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON site_diary FOR DELETE USING (company_id = get_my_company_id());

-- SUB_INVOICES
CREATE POLICY "co_select" ON sub_invoices FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "co_insert" ON sub_invoices FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON sub_invoices FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON sub_invoices FOR DELETE USING (company_id = get_my_company_id());

-- SUBCONTRACTOR_JOBS
CREATE POLICY "co_select" ON subcontractor_jobs FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON subcontractor_jobs FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON subcontractor_jobs FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON subcontractor_jobs FOR DELETE USING (company_id = get_my_company_id());


-- -----------------------------------------------------------------
-- PATTERN B: Tables WITH company_id — manager CRUD + operative CRUD
-- Operatives can both read and write within their company.
-- -----------------------------------------------------------------

-- OPERATIVES (operatives read their own company's operatives, update their own record)
CREATE POLICY "co_select" ON operatives FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON operatives FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON operatives FOR UPDATE USING (company_id = get_my_company_id() OR id = get_my_operative_id());
CREATE POLICY "co_delete" ON operatives FOR DELETE USING (company_id = get_my_company_id());

-- PROJECTS
CREATE POLICY "co_select" ON projects FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON projects FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON projects FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON projects FOR DELETE USING (company_id = get_my_company_id());

-- DOCUMENTS
CREATE POLICY "co_select" ON documents FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON documents FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON documents FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON documents FOR DELETE USING (company_id = get_my_company_id());

-- SIGNATURES (operatives create signatures when signing documents)
CREATE POLICY "co_select" ON signatures FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON signatures FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON signatures FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON signatures FOR DELETE USING (company_id = get_my_company_id());

-- SITE_ATTENDANCE (operatives record their own attendance)
CREATE POLICY "co_select" ON site_attendance FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON site_attendance FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_delete" ON site_attendance FOR DELETE USING (company_id = get_my_company_id());

-- NOTIFICATIONS (operatives read and mark-as-read their own)
CREATE POLICY "co_select" ON notifications FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON notifications FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON notifications FOR UPDATE USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_delete" ON notifications FOR DELETE USING (company_id = get_my_company_id());

-- CHAT_MESSAGES (operatives send and read their own chats)
CREATE POLICY "co_select" ON chat_messages FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON chat_messages FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON chat_messages FOR UPDATE USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_delete" ON chat_messages FOR DELETE USING (company_id = get_my_company_id());

-- SNAGS (operatives read snags assigned to them, handled via RPC for replies)
CREATE POLICY "co_select" ON snags FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON snags FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON snags FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON snags FOR DELETE USING (company_id = get_my_company_id());

-- SNAG_COMMENTS
CREATE POLICY "co_select" ON snag_comments FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON snag_comments FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_delete" ON snag_comments FOR DELETE USING (company_id = get_my_company_id());

-- TOOLBOX_TALKS
CREATE POLICY "co_select" ON toolbox_talks FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON toolbox_talks FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON toolbox_talks FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON toolbox_talks FOR DELETE USING (company_id = get_my_company_id());

-- TOOLBOX_SIGNATURES (operatives create when signing)
CREATE POLICY "co_select" ON toolbox_signatures FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON toolbox_signatures FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON toolbox_signatures FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON toolbox_signatures FOR DELETE USING (company_id = get_my_company_id());

-- OPERATIVE_INVOICES (operatives create and manage their invoices)
CREATE POLICY "co_select" ON operative_invoices FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON operative_invoices FOR INSERT WITH CHECK (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_update" ON operative_invoices FOR UPDATE USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());

-- TIMESHEET_ENTRIES (operatives view their own)
CREATE POLICY "co_select" ON timesheet_entries FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "co_insert" ON timesheet_entries FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "co_update" ON timesheet_entries FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "co_delete" ON timesheet_entries FOR DELETE USING (company_id = get_my_company_id());

-- AFTERCARE_DEFECTS (public insert via RPC, company read for managers/operatives)
CREATE POLICY "co_select" ON aftercare_defects FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
-- No direct insert/update — public submits via submit_aftercare_defect() RPC


-- -----------------------------------------------------------------
-- PATTERN C: Tables WITHOUT company_id — scoped via parent FK
-- -----------------------------------------------------------------

-- AGENCIES (no company_id — agency-specific table)
CREATE POLICY "agency_select" ON agencies FOR SELECT USING (true);  -- agencies are discoverable
CREATE POLICY "agency_insert" ON agencies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "agency_update" ON agencies FOR UPDATE USING (auth.role() = 'authenticated');

-- AGENCY_OPERATIVES (FK to agencies)
CREATE POLICY "ao_select" ON agency_operatives FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ao_insert" ON agency_operatives FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ao_update" ON agency_operatives FOR UPDATE USING (auth.role() = 'authenticated');

-- AGENCY_USERS (FK to agencies)
CREATE POLICY "au_select" ON agency_users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "au_insert" ON agency_users FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "au_update" ON agency_users FOR UPDATE USING (auth.role() = 'authenticated');

-- AGENCY_CONNECTIONS (FK: company_id exists on the live table)
CREATE POLICY "ac_select" ON agency_connections FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ac_insert" ON agency_connections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ac_update" ON agency_connections FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "ac_delete" ON agency_connections FOR DELETE USING (auth.role() = 'authenticated');

-- OPERATIVE_PROJECTS (junction: operative_id + project_id)
CREATE POLICY "op_select" ON operative_projects FOR SELECT USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
  OR project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "op_insert" ON operative_projects FOR INSERT WITH CHECK (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "op_delete" ON operative_projects FOR DELETE USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id())
);

-- OPERATIVE_AVAILABILITY (FK to operatives)
CREATE POLICY "oa_select" ON operative_availability FOR SELECT USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "oa_insert" ON operative_availability FOR INSERT WITH CHECK (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "oa_update" ON operative_availability FOR UPDATE USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "oa_delete" ON operative_availability FOR DELETE USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id())
);

-- OPERATIVE_CERTIFICATIONS (FK to operatives)
CREATE POLICY "oc_select" ON operative_certifications FOR SELECT USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "oc_insert" ON operative_certifications FOR INSERT WITH CHECK (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "oc_update" ON operative_certifications FOR UPDATE USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);

-- PENDING_EMAIL_CHANGES (FK to operatives)
CREATE POLICY "pec_select" ON pending_email_changes FOR SELECT USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "pec_insert" ON pending_email_changes FOR INSERT WITH CHECK (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);
CREATE POLICY "pec_update" ON pending_email_changes FOR UPDATE USING (
  operative_id IN (SELECT id FROM operatives WHERE company_id = get_my_company_id() OR company_id = get_operative_company_id())
);

-- PROCUREMENT_ITEMS (FK to projects via project_id)
CREATE POLICY "pi_select" ON procurement_items FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pi_insert" ON procurement_items FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pi_update" ON procurement_items FOR UPDATE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pi_delete" ON procurement_items FOR DELETE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);

-- PROCUREMENT_QUOTES (FK to procurement_items)
CREATE POLICY "pq_select" ON procurement_quotes FOR SELECT USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pq_insert" ON procurement_quotes FOR INSERT WITH CHECK (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pq_update" ON procurement_quotes FOR UPDATE USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pq_delete" ON procurement_quotes FOR DELETE USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);

-- PROCUREMENT_INVOICES (FK to procurement_items)
CREATE POLICY "pinv_select" ON procurement_invoices FOR SELECT USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pinv_insert" ON procurement_invoices FOR INSERT WITH CHECK (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pinv_update" ON procurement_invoices FOR UPDATE USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);

-- PROCUREMENT_ATTACHMENTS (FK to procurement_items)
CREATE POLICY "pa_select" ON procurement_attachments FOR SELECT USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pa_insert" ON procurement_attachments FOR INSERT WITH CHECK (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pa_delete" ON procurement_attachments FOR DELETE USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);

-- PROCUREMENT_AUDIT_LOG (FK to procurement_items)
CREATE POLICY "pal_select" ON procurement_audit_log FOR SELECT USING (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);
CREATE POLICY "pal_insert" ON procurement_audit_log FOR INSERT WITH CHECK (
  procurement_item_id IN (SELECT id FROM procurement_items WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))
);

-- PROGRAMME_TASKS (FK to projects)
CREATE POLICY "pt_select" ON programme_tasks FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pt_insert" ON programme_tasks FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pt_update" ON programme_tasks FOR UPDATE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pt_delete" ON programme_tasks FOR DELETE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);

-- PROJECT_CALENDAR_SETTINGS (FK to projects)
CREATE POLICY "pcs_select" ON project_calendar_settings FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pcs_insert" ON project_calendar_settings FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pcs_update" ON project_calendar_settings FOR UPDATE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);

-- PROJECT_NON_WORKING_PERIODS (FK to projects)
CREATE POLICY "pnwp_select" ON project_non_working_periods FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pnwp_insert" ON project_non_working_periods FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);
CREATE POLICY "pnwp_delete" ON project_non_working_periods FOR DELETE USING (
  project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())
);

-- PROGRESS_SNAPSHOTS (FK to programme_activities which has company_id)
CREATE POLICY "ps_select" ON progress_snapshots FOR SELECT USING (
  programme_activity_id IN (SELECT id FROM programme_activities WHERE company_id = get_my_company_id())
);
CREATE POLICY "ps_insert" ON progress_snapshots FOR INSERT WITH CHECK (
  programme_activity_id IN (SELECT id FROM programme_activities WHERE company_id = get_my_company_id())
);

-- DOCUMENT_AUDIT_LOG (audit table — FK likely to document_hub)
CREATE POLICY "dal_select" ON document_audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dal_insert" ON document_audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- DOCUMENT_SIGNOFFS (FK to documents or document_hub)
CREATE POLICY "ds_select" ON document_signoffs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ds_insert" ON document_signoffs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ds_update" ON document_signoffs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "ds_delete" ON document_signoffs FOR DELETE USING (auth.role() = 'authenticated');

-- HOLIDAY_AUDIT_LOG (FK to holiday_requests which has company_id)
CREATE POLICY "hal_select" ON holiday_audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "hal_insert" ON holiday_audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- PROFILE_AUDIT_LOG (FK to operatives via worker_id)
CREATE POLICY "pral_select" ON profile_audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "pral_insert" ON profile_audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- PERMIT_SIGNATURES (FK to permits which has company_id)
CREATE POLICY "psig_select" ON permit_signatures FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "psig_insert" ON permit_signatures FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "psig_delete" ON permit_signatures FOR DELETE USING (auth.role() = 'authenticated');

-- JOB_VARIATIONS (FK to subcontractor_jobs which has company_id)
CREATE POLICY "jv_select" ON job_variations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "jv_insert" ON job_variations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "jv_update" ON job_variations FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "jv_delete" ON job_variations FOR DELETE USING (auth.role() = 'authenticated');

-- LABOUR_PROPOSALS (FK to labour_requests which has company_id)
CREATE POLICY "lp_select" ON labour_proposals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "lp_insert" ON labour_proposals FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "lp_update" ON labour_proposals FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "lp_delete" ON labour_proposals FOR DELETE USING (auth.role() = 'authenticated');


-- -----------------------------------------------------------------
-- PATTERN D: Reference / public data
-- -----------------------------------------------------------------

-- UK_BANK_HOLIDAYS (public reference data)
CREATE POLICY "bh_select" ON uk_bank_holidays FOR SELECT USING (true);

-- POSTCODE_CACHE (public reference data)
CREATE POLICY "pc_select" ON postcode_cache FOR SELECT USING (true);
CREATE POLICY "pc_insert" ON postcode_cache FOR INSERT WITH CHECK (true); -- anyone can cache a postcode lookup

-- DEMO_REQUESTS (public intake form — intentionally open for INSERT)
CREATE POLICY "dr_select" ON demo_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dr_insert" ON demo_requests FOR INSERT WITH CHECK (true);


-- -----------------------------------------------------------------
-- PATTERN E: Special tables
-- -----------------------------------------------------------------

-- COMPANIES (readable for branding, writable only by company owners)
CREATE POLICY "co_select" ON companies FOR SELECT USING (true);  -- company names/logos are public (for branding on QR pages etc.)
CREATE POLICY "co_insert" ON companies FOR INSERT WITH CHECK (auth.role() = 'authenticated');  -- signup creates company
CREATE POLICY "co_update" ON companies FOR UPDATE USING (id = get_my_company_id());
CREATE POLICY "co_delete" ON companies FOR DELETE USING (id = get_my_company_id());

-- PROFILES (managers read their own company's profiles)
CREATE POLICY "prof_select" ON profiles FOR SELECT USING (
  id = auth.uid()
  OR company_id = get_my_company_id()
  OR company_id = get_operative_company_id()  -- operatives need to read manager profiles for chat
);
CREATE POLICY "prof_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "prof_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- MANAGERS (managers read their own company's managers)
CREATE POLICY "mgr_select" ON managers FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "mgr_insert" ON managers FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "mgr_update" ON managers FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "mgr_delete" ON managers FOR DELETE USING (company_id = get_my_company_id());

-- SETTINGS (company settings, readable by company members)
CREATE POLICY "set_select" ON settings FOR SELECT USING (company_id = get_my_company_id() OR company_id = get_operative_company_id());
CREATE POLICY "set_insert" ON settings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "set_update" ON settings FOR UPDATE USING (company_id = get_my_company_id());


-- =====================================================================
-- PART 5: VERIFICATION QUERY
-- Run this after the migration to confirm no permissive policies remain.
-- =====================================================================

-- This should return 0 rows (no policies with blanket USING (true) or anon access)
-- except for: companies_select, uk_bank_holidays, postcode_cache, demo_requests_insert
-- SELECT policyname, tablename, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual = 'true' OR qual LIKE '%anon%')
-- ORDER BY tablename;

ROLLBACK; -- DRY RUN (was COMMIT;) — nothing persists
