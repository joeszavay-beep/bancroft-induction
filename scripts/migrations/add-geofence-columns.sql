-- Add geofence columns to projects table
-- Run in Supabase SQL Editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_latitude DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_longitude DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 200;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT false;
