-- Migration: Add settings JSONB column to companies table
-- Purpose: H&S report personalisation — company prefix, section config, numbering template
-- Run this in the Supabase SQL editor
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
