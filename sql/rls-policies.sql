-- =====================================================
-- CoreSite RLS Policies
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- Strategy:
-- 1. Authenticated managers: can read/write their own company's data
--    (matched via auth.uid() → profiles.company_id)
-- 2. Anon key (public/operative routes): limited read access for
--    specific use cases (sign-in, document signing, etc.)
-- 3. Service role key (API routes): bypasses RLS entirely
--
-- We use a helper function to get the current user's company_id
-- =====================================================

-- Helper function: get current user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

-- =====================================================
-- Drop all existing permissive policies first
-- =====================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND policyname LIKE '%_all'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- =====================================================
-- PROFILES
-- =====================================================
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- =====================================================
-- COMPANIES
-- =====================================================
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (true);  -- companies are readable (for branding)
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = get_my_company_id());

-- =====================================================
-- PROJECTS
-- =====================================================
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives need to read their project
  );
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- OPERATIVES
-- =====================================================
CREATE POLICY "operatives_select" ON operatives
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives need to read their own record
  );
CREATE POLICY "operatives_insert" ON operatives
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "operatives_update" ON operatives
  FOR UPDATE USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives update their own profile
  );
CREATE POLICY "operatives_delete" ON operatives
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- DOCUMENTS
-- =====================================================
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives view docs to sign
  );
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- SIGNATURES
-- =====================================================
CREATE POLICY "signatures_select" ON signatures
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "signatures_insert" ON signatures
  FOR INSERT WITH CHECK (true);  -- operatives sign via anon key
CREATE POLICY "signatures_update" ON signatures
  FOR UPDATE USING (company_id = get_my_company_id());

-- =====================================================
-- DRAWINGS
-- =====================================================
CREATE POLICY "drawings_select" ON drawings
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "drawings_insert" ON drawings
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "drawings_update" ON drawings
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "drawings_delete" ON drawings
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- SNAGS
-- =====================================================
CREATE POLICY "snags_select" ON snags
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "snags_insert" ON snags
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "snags_update" ON snags
  FOR UPDATE USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operative snag replies
  );
CREATE POLICY "snags_delete" ON snags
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- SNAG_COMMENTS
-- =====================================================
CREATE POLICY "snag_comments_select" ON snag_comments
  FOR SELECT USING (true);  -- readable by anyone with the snag
CREATE POLICY "snag_comments_insert" ON snag_comments
  FOR INSERT WITH CHECK (true);  -- operatives and managers can comment
CREATE POLICY "snag_comments_delete" ON snag_comments
  FOR DELETE USING (true);

-- =====================================================
-- PROGRESS_DRAWINGS
-- =====================================================
CREATE POLICY "progress_drawings_select" ON progress_drawings
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "progress_drawings_insert" ON progress_drawings
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "progress_drawings_update" ON progress_drawings
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "progress_drawings_delete" ON progress_drawings
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- PROGRESS_ITEMS
-- =====================================================
CREATE POLICY "progress_items_select" ON progress_items
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "progress_items_insert" ON progress_items
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "progress_items_update" ON progress_items
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "progress_items_delete" ON progress_items
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- TOOLBOX_TALKS
-- =====================================================
CREATE POLICY "toolbox_talks_select" ON toolbox_talks
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'
  );
CREATE POLICY "toolbox_talks_insert" ON toolbox_talks
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "toolbox_talks_update" ON toolbox_talks
  FOR UPDATE USING (company_id = get_my_company_id());

-- =====================================================
-- TOOLBOX_SIGNATURES
-- =====================================================
CREATE POLICY "toolbox_signatures_select" ON toolbox_signatures
  FOR SELECT USING (true);
CREATE POLICY "toolbox_signatures_insert" ON toolbox_signatures
  FOR INSERT WITH CHECK (true);  -- operatives sign via anon key

-- =====================================================
-- SITE_DIARY
-- =====================================================
CREATE POLICY "site_diary_select" ON site_diary
  FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "site_diary_insert" ON site_diary
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "site_diary_update" ON site_diary
  FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "site_diary_delete" ON site_diary
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- INSPECTION_TEMPLATES
-- =====================================================
CREATE POLICY "inspection_templates_select" ON inspection_templates
  FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "inspection_templates_insert" ON inspection_templates
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "inspection_templates_delete" ON inspection_templates
  FOR DELETE USING (company_id = get_my_company_id());

-- =====================================================
-- INSPECTIONS
-- =====================================================
CREATE POLICY "inspections_select" ON inspections
  FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "inspections_insert" ON inspections
  FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "inspections_update" ON inspections
  FOR UPDATE USING (company_id = get_my_company_id());

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives read their notifications
  );
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);  -- system creates notifications
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (true);  -- mark as read

-- =====================================================
-- AFTERCARE_DEFECTS
-- =====================================================
CREATE POLICY "aftercare_defects_select" ON aftercare_defects
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- public aftercare portal
  );
CREATE POLICY "aftercare_defects_insert" ON aftercare_defects
  FOR INSERT WITH CHECK (true);  -- public submissions

-- =====================================================
-- SITE_ATTENDANCE
-- =====================================================
CREATE POLICY "site_attendance_select" ON site_attendance
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- QR sign-in reads today's records
  );
CREATE POLICY "site_attendance_insert" ON site_attendance
  FOR INSERT WITH CHECK (true);  -- QR sign-in uses anon key

-- =====================================================
-- CHAT_MESSAGES
-- =====================================================
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR auth.role() = 'anon'  -- operatives read their chats
  );
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (true);  -- both sides send messages
CREATE POLICY "chat_messages_update" ON chat_messages
  FOR UPDATE USING (true);  -- mark as read

-- =====================================================
-- SETTINGS
-- =====================================================
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);
CREATE POLICY "settings_upsert" ON settings
  FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_update" ON settings
  FOR UPDATE USING (true);

-- =====================================================
-- DONE
-- =====================================================
-- Note: The service_role key (used by API routes) bypasses
-- all RLS policies. Only the anon key and authenticated
-- user JWTs are affected by these policies.
