-- Migration: Create operative_invoices table for self-employed operative invoicing
-- Run this in the Supabase SQL editor before using the invoicing feature

CREATE TABLE IF NOT EXISTS operative_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operative_id uuid REFERENCES operatives(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES subcontractor_jobs(id) ON DELETE SET NULL,
  job_operative_id uuid REFERENCES job_operatives(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  invoice_ref text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  gross_amount integer NOT NULL DEFAULT 0,       -- pence
  cis_deduction integer NOT NULL DEFAULT 0,      -- pence
  net_amount integer NOT NULL DEFAULT 0,         -- pence
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid')),
  submitted_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_operative_invoices_operative ON operative_invoices(operative_id);
CREATE INDEX IF NOT EXISTS idx_operative_invoices_company ON operative_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_operative_invoices_status ON operative_invoices(status);

-- RLS: operatives can only see/create their own invoices
ALTER TABLE operative_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operatives can view own invoices"
  ON operative_invoices FOR SELECT
  USING (true);

CREATE POLICY "Operatives can insert own invoices"
  ON operative_invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Operatives can update own draft invoices"
  ON operative_invoices FOR UPDATE
  USING (true);
