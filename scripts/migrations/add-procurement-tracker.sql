-- Procurement Tracker
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS procurement_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_number TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  specification TEXT,
  quantity NUMERIC(12,2),
  unit TEXT,
  linked_programme_task_id UUID REFERENCES programme_tasks(id) ON DELETE SET NULL,
  required_by_date DATE,
  lead_time_weeks NUMERIC(6,1) DEFAULT 0,
  order_by_date DATE,
  status TEXT NOT NULL DEFAULT 'identified',
  budget_cost NUMERIC(12,2),
  selected_quote_id UUID,
  po_number TEXT,
  po_raised_date DATE,
  po_acknowledged_date DATE,
  delivery_scheduled_date DATE,
  delivery_received_date DATE,
  received_by_user_id UUID,
  delivery_condition TEXT,
  delivery_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID
);

CREATE TABLE IF NOT EXISTS procurement_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  procurement_item_id UUID NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  supplier_contact_name TEXT,
  supplier_contact_email TEXT,
  supplier_contact_phone TEXT,
  quoted_price NUMERIC(12,2),
  quoted_lead_time_weeks NUMERIC(6,1),
  quote_date DATE,
  quote_reference TEXT,
  notes TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  procurement_item_id UUID NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  procurement_quote_id UUID REFERENCES procurement_quotes(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  attachment_type TEXT DEFAULT 'other',
  uploaded_by_user_id UUID,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS procurement_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  procurement_item_id UUID NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC(12,2),
  attachment_id UUID REFERENCES procurement_attachments(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID
);

CREATE TABLE IF NOT EXISTS procurement_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  procurement_item_id UUID REFERENCES procurement_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_procurement_items_project ON procurement_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_procurement_quotes_item ON procurement_quotes(procurement_item_id);
CREATE INDEX IF NOT EXISTS idx_procurement_attachments_item ON procurement_attachments(procurement_item_id);
CREATE INDEX IF NOT EXISTS idx_procurement_invoices_item ON procurement_invoices(procurement_item_id);
CREATE INDEX IF NOT EXISTS idx_procurement_audit_item ON procurement_audit_log(procurement_item_id);

-- RLS
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON procurement_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON procurement_quotes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON procurement_attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON procurement_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON procurement_audit_log FOR ALL USING (true) WITH CHECK (true);
