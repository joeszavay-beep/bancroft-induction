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
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
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
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- 6. Create policies to allow all operations (public access via anon key)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on documents" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on operatives" ON operatives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on signatures" ON signatures FOR ALL USING (true) WITH CHECK (true);

-- 7. Create indexes for performance
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_operatives_project ON operatives(project_id);
CREATE INDEX idx_signatures_operative ON signatures(operative_id);
CREATE INDEX idx_signatures_project ON signatures(project_id);
CREATE INDEX idx_signatures_document ON signatures(document_id);
