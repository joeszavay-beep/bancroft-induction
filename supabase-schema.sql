-- ============================================
-- Bancroft Ltd - Site Induction & RAMS Sign-Off
-- Supabase Database Schema
-- ============================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Projects table
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Documents table
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Operatives table
CREATE TABLE operatives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3b. Operative-project many-to-many junction
CREATE TABLE operative_projects (
  operative_id UUID REFERENCES operatives(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (operative_id, project_id)
);

-- 4. Signatures table
CREATE TABLE signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operative_id UUID REFERENCES operatives(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  operative_name TEXT NOT NULL,
  document_title TEXT NOT NULL,
  signature_url TEXT,
  typed_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable Row Level Security (allow all for now - no auth)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE operative_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- 6. Create policies to allow all operations (public access via anon key)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on documents" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on operatives" ON operatives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on operative_projects" ON operative_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on signatures" ON signatures FOR ALL USING (true) WITH CHECK (true);

-- 7. H&S report personalisation settings (JSONB on companies table)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 8. Cascade delete function for operatives (called by /api/delete-operative)
CREATE OR REPLACE FUNCTION delete_operative_cascade(op_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  op_record RECORD;
BEGIN
  SELECT id, name, email, card_front_url, card_back_url, photo_url
    INTO op_record FROM operatives WHERE id = op_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Operative not found');
  END IF;
  DELETE FROM site_attendance WHERE operative_id = op_id;
  DELETE FROM toolbox_signatures WHERE operative_id = op_id;
  DELETE FROM chat_messages WHERE operative_id = op_id;
  DELETE FROM notifications WHERE user_id = op_id;
  DELETE FROM job_operatives WHERE operative_id = op_id;
  DELETE FROM operative_availability WHERE operative_id = op_id;
  DELETE FROM operative_certifications WHERE operative_id = op_id;
  DELETE FROM labour_bookings WHERE operative_id = op_id;
  DELETE FROM operatives WHERE id = op_id;
  RETURN json_build_object(
    'success', true, 'name', op_record.name, 'email', op_record.email,
    'card_front_url', op_record.card_front_url,
    'card_back_url', op_record.card_back_url,
    'photo_url', op_record.photo_url
  );
END;
$$;

-- 9. Create indexes for performance
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_operative_projects_operative ON operative_projects(operative_id);
CREATE INDEX idx_operative_projects_project ON operative_projects(project_id);
CREATE INDEX idx_signatures_operative ON signatures(operative_id);
CREATE INDEX idx_signatures_project ON signatures(project_id);
CREATE INDEX idx_signatures_document ON signatures(document_id);
