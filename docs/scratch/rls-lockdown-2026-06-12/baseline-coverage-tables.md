# Baseline — live table inventory (coverage gate), 2026-06-12

All 88 rows pasted by owner from the coverage query: EVERY public table has
rls_enabled=true. No RLS-off tables, no ad-hoc tables outside migrations,
no 'invoices' table (§5.6: absent live, confirmed).

Coverage verdict: all live tables are recreated by rls-deploy4-lockdown.sql
+ rls-deploy4-patches.sql (incl. section D: equipment, equipment_checks,
equipment_defects, equipment_checklist_templates, project_floors,
procurement_schedules). Verified by table-name diff 2026-06-12.

policy_count per table (live, pre-lockdown):

activity_feed
aftercare_defects
agencies
agency_connections
agency_operatives
agency_users
audit_logs
bim_drawing_calibration
bim_elements
bim_models
chat_messages
cis_records
companies
contra_charges
daywork_sheets
demo_requests
design_drawings
document_audit_log
document_hub
document_packs
document_signoffs
documents
drawing_layers
drawings
equipment
equipment_checklist_templates
equipment_checks
equipment_defects
holiday_audit_log
holiday_requests
hs_observations
incidents
inspection_templates
inspections
job_documents
job_operatives
job_variations
labour_bookings
labour_proposals
labour_requests
managers
markup_lines
master_activities
master_programme
notifications
operative_availability
operative_certifications
operative_invoices
operative_projects
operatives
payment_applications
pending_email_changes
permit_signatures
permit_templates
permits
postcode_cache
procurement_attachments
procurement_audit_log
procurement_invoices
procurement_items
procurement_quotes
procurement_schedules
profile_audit_log
profiles
programme_activities
programme_tasks
progress_drawings
progress_item_history
progress_items
progress_snapshots
progress_zones
project_calendar_settings
project_floors
project_non_working_periods
projects
settings
signatures
site_attendance
site_diary
snag_comments
snags
sub_invoices
subcontractor_jobs
timesheet_entries
toolbox_signatures
toolbox_talks
uk_bank_holidays
