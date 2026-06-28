-- AUDIT §2.13 — prevent QR-timesheet double-counting at the schema level.
--
-- timesheet_entries had no UNIQUE on its natural key, so a failed "clear this
-- week's auto entries" followed by the insert could duplicate auto rows and
-- double-count hours/labour cost. The client (generateFromQR) now checks the
-- delete before inserting; THIS constraint makes the double-count structurally
-- impossible — a second auto insert for the same operative/day errors instead
-- of duplicating.
--
-- Natural key = (job_id, operative_id, date, is_manual_entry): is_manual_entry
-- separates the at-most-one AUTO row from the at-most-one MANUAL row for a given
-- operative/day. Confirmed against both insert paths:
--   * generateFromQR     -> is_manual_entry = false (grouped one-per-op-per-day)
--   * handleManualEntry  -> is_manual_entry = true  (operative_id + date required)
-- Business rule confirmed by owner: one manual + one auto entry per operative
-- per day (an auto row and a manual override can coexist; two of the same type
-- cannot).
--
-- APPLIED MANUALLY in prod 2026-06-28 (data pre-verified clean — the dup-check
-- below returned 0 rows), then committed here (the usual applied-then-committed
-- pattern).
--
-- Pre-flight — must return ZERO rows before adding the constraint:
--   select job_id, operative_id, date, is_manual_entry, count(*) as copies
--   from timesheet_entries
--   group by job_id, operative_id, date, is_manual_entry
--   having count(*) > 1;

alter table timesheet_entries
  add constraint timesheet_entries_natural_key_uniq
  unique (job_id, operative_id, date, is_manual_entry);
