-- Rollback for 2-13-timesheet-natural-key-unique.sql (AUDIT §2.13).
-- Drops the natural-key UNIQUE constraint on timesheet_entries.

alter table timesheet_entries
  drop constraint if exists timesheet_entries_natural_key_uniq;
