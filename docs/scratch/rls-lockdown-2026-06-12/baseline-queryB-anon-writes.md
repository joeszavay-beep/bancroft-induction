# Baseline "before" snapshot — §1 Query B (anon-exposed write/delete policies)

Captured: 2026-06-12, Supabase SQL editor, pre-lockdown.
Status: LIKELY PARTIAL — ends at `permit_templates`; tail (postcode_cache,
profiles, progress_*, projects, settings, signatures, site_attendance,
snag_comments, snags, toolbox_*, …) to be appended.

## Raw output (as pasted)

| schemaname | tablename | policyname | cmd | roles | qual | with_check |
| --- | --- | --- | --- | --- | --- | --- |
| public | activity_feed | activity_feed_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | activity_feed | activity_feed_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) |
| public | activity_feed | activity_feed_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | aftercare_defects | aftercare_defects_insert | INSERT | {public} | null | true |
| public | agencies | agencies_all | ALL | {public} | true | true |
| public | agency_connections | agency_connections_all | ALL | {public} | true | true |
| public | agency_operatives | agency_operatives_all | ALL | {public} | true | true |
| public | agency_users | agency_users_all | ALL | {public} | true | true |
| public | audit_logs | audit_logs_all | ALL | {public} | true | true |
| public | bim_drawing_calibration | bim_calibration_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | bim_drawing_calibration | bim_calibration_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | bim_drawing_calibration | bim_calibration_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | bim_elements | bim_elements_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | bim_elements | bim_elements_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text)) |
| public | bim_models | bim_models_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | bim_models | bim_models_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text)) |
| public | bim_models | bim_models_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text)) | null |
| public | chat_messages | chat_messages_delete | DELETE | {public} | true | null |
| public | chat_messages | chat_messages_insert | INSERT | {public} | null | true |
| public | chat_messages | chat_messages_update | UPDATE | {public} | true | null |
| public | cis_records | cis_records_all | ALL | {public} | true | true |
| public | companies | companies_delete_open | DELETE | {public} | true | null |
| public | companies | companies_insert_signup | INSERT | {public} | null | true |
| public | companies | companies_update | UPDATE | {public} | (id = get_my_company_id()) | null |
| public | companies | companies_update_any | UPDATE | {public} | true | null |
| public | contra_charges | contra_charges_all | ALL | {public} | true | true |
| public | daywork_sheets | daywork_sheets_all | ALL | {public} | true | true |
| public | demo_requests | allow_insert | INSERT | {public} | null | true |
| public | design_drawings | design_drawings_delete | DELETE | {public} | true | null |
| public | design_drawings | design_drawings_insert | INSERT | {public} | null | true |
| public | design_drawings | design_drawings_update | UPDATE | {public} | true | null |
| public | document_audit_log | document_audit_log_all | ALL | {public} | true | true |
| public | document_hub | document_hub_all | ALL | {public} | true | true |
| public | document_packs | document_packs_all | ALL | {public} | true | true |
| public | document_signoffs | document_signoffs_all | ALL | {public} | true | true |
| public | documents | documents_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | documents | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | documents | documents_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | documents | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | documents | documents_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | documents | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | drawing_layers | drawing_layers_delete | DELETE | {public} | true | null |
| public | drawing_layers | drawing_layers_insert | INSERT | {public} | null | true |
| public | drawing_layers | drawing_layers_update | UPDATE | {public} | true | null |
| public | drawings | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | drawings | drawings_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | drawings | drawings_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | drawings | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | drawings | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | drawings | drawings_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | equipment | equipment_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | equipment | equipment_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | equipment | equipment_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | equipment_checklist_templates | checklist_templates_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | equipment_checklist_templates | checklist_templates_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | equipment_checklist_templates | checklist_templates_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | equipment_checks | equipment_checks_insert | INSERT | {public} | null | true |
| public | equipment_defects | equipment_defects_insert | INSERT | {public} | null | true |
| public | equipment_defects | equipment_defects_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | holiday_audit_log | Allow all on holiday_audit_log | ALL | {public} | true | true |
| public | holiday_requests | Allow all on holiday_requests | ALL | {public} | true | true |
| public | hs_observations | hs_observations_all | ALL | {public} | true | true |
| public | incidents | incidents_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | incidents | incidents_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) |
| public | incidents | incidents_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | inspection_templates | inspection_templates_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | inspection_templates | inspection_templates_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | inspections | inspections_insert | INSERT | {public} | null | true |
| public | inspections | inspections_update | UPDATE | {public} | true | true |
| public | job_documents | job_documents_all | ALL | {public} | true | true |
| public | job_operatives | job_operatives_all | ALL | {public} | true | true |
| public | job_variations | job_variations_all | ALL | {public} | true | true |
| public | labour_bookings | labour_bookings_all | ALL | {public} | true | true |
| public | labour_proposals | labour_proposals_all | ALL | {public} | true | true |
| public | labour_requests | labour_requests_all | ALL | {public} | true | true |
| public | managers | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | managers | managers_insert | INSERT | {public} | null | true |
| public | managers | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | markup_lines | markup_lines_delete | DELETE | {public} | true | null |
| public | markup_lines | markup_lines_insert | INSERT | {public} | null | true |
| public | markup_lines | markup_lines_update | UPDATE | {public} | true | null |
| public | master_activities | master_activities_all | ALL | {public} | true | true |
| public | master_programme | master_programme_all | ALL | {public} | true | true |
| public | notifications | notifications_delete | DELETE | {public} | true | null |
| public | notifications | notifications_insert | INSERT | {public} | null | true |
| public | notifications | notifications_update | UPDATE | {public} | true | null |
| public | operative_availability | operative_availability_all | ALL | {public} | true | true |
| public | operative_certifications | operative_certifications_all | ALL | {public} | true | true |
| public | operative_invoices | operative_invoices_all | ALL | {public} | true | true |
| public | operative_projects | Allow all on operative_projects | ALL | {public} | true | true |
| public | operatives | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | operatives | operatives_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | operatives | operatives_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) |
| public | operatives | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | operatives | operatives_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | operatives | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | payment_applications | payment_applications_all | ALL | {public} | true | true |
| public | pending_email_changes | Allow all on pending_email_changes | ALL | {public} | true | true |
| public | permit_signatures | permit_signatures_all | ALL | {public} | true | true |
| public | permit_templates | permit_templates_all | ALL | {public} | true | true |

## B-tail (tablename >= 'permit_templates'), pasted 2026-06-12 — query B now COMPLETE

| schemaname | tablename | policyname | cmd | roles | qual | with_check |
| --- | --- | --- | --- | --- | --- | --- |
| public | permit_templates | permit_templates_all | ALL | {public} | true | true |
| public | permits | permits_all | ALL | {public} | true | true |
| public | postcode_cache | postcode_cache_all | ALL | {public} | true | true |
| public | procurement_attachments | allow_all | ALL | {public} | true | true |
| public | procurement_audit_log | allow_all | ALL | {public} | true | true |
| public | procurement_invoices | allow_all | ALL | {public} | true | true |
| public | procurement_items | allow_all | ALL | {public} | true | true |
| public | procurement_quotes | allow_all | ALL | {public} | true | true |
| public | procurement_schedules | Company members can delete their schedules | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | procurement_schedules | Company members can insert schedules | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | procurement_schedules | Company members can update their schedules | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | profile_audit_log | Allow all on profile_audit_log | ALL | {public} | true | true |
| public | profiles | profiles_update | UPDATE | {public} | (id = auth.uid()) | null |
| public | programme_activities | programme_activities_delete | DELETE | {public} | true | null |
| public | programme_activities | programme_activities_insert | INSERT | {public} | null | true |
| public | programme_activities | programme_activities_update | UPDATE | {public} | true | null |
| public | programme_tasks | allow_all | ALL | {public} | true | true |
| public | progress_drawings | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | progress_drawings | progress_drawings_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | progress_drawings | progress_drawings_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | progress_drawings | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | progress_drawings | progress_drawings_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | progress_drawings | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | progress_item_history | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | progress_items | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | progress_items | progress_items_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | progress_items | progress_items_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) |
| public | progress_items | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | progress_items | progress_items_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | progress_items | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | progress_snapshots | progress_snapshots_insert | INSERT | {public} | null | true |
| public | progress_zones | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | progress_zones | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | project_calendar_settings | allow_all | ALL | {public} | true | true |
| public | project_floors | pf_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | project_floors | pf_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | project_floors | pf_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | project_non_working_periods | allow_all | ALL | {public} | true | true |
| public | projects | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | projects | projects_delete_open | DELETE | {public} | true | null |
| public | projects | projects_insert_open | INSERT | {public} | null | true |
| public | projects | projects_insert | INSERT | {public} | null | (company_id = get_my_company_id()) |
| public | projects | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | projects | projects_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | projects | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | settings | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | settings | settings_upsert | INSERT | {public} | null | true |
| public | settings | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | settings | settings_update | UPDATE | {public} | true | null |
| public | signatures | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | signatures | signatures_delete | DELETE | {public} | true | null |
| public | signatures | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | signatures | Public insert signatures | INSERT | {public} | null | true |
| public | signatures | signatures_insert | INSERT | {public} | null | true |
| public | signatures | signatures_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | signatures | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | site_attendance | site_attendance_delete | DELETE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | site_attendance | site_attendance_insert | INSERT | {public} | null | true |
| public | site_diary | site_diary_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | site_diary | site_diary_insert | INSERT | {public} | null | true |
| public | site_diary | site_diary_update | UPDATE | {public} | (company_id = get_my_company_id()) | null |
| public | snag_comments | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | snag_comments | snag_comments_delete_company | DELETE | {public} | true | null |
| public | snag_comments | snag_comments_delete | DELETE | {public} | true | null |
| public | snag_comments | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | snag_comments | Public insert snag comments | INSERT | {public} | null | true |
| public | snag_comments | snag_comments_insert | INSERT | {public} | null | true |
| public | snags | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | snags | snags_delete | DELETE | {public} | (company_id = get_my_company_id()) | null |
| public | snags | snags_insert | INSERT | {public} | null | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) |
| public | snags | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | snags | Public update snags for reply | UPDATE | {public} | (reply_token IS NOT NULL) | null |
| public | snags | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | snags | snags_update | UPDATE | {public} | ((company_id = get_my_company_id()) OR (auth.role() = 'anon'::text)) | null |
| public | sub_invoices | sub_invoices_all | ALL | {public} | true | true |
| public | subcontractor_jobs | subcontractor_jobs_all | ALL | {public} | true | true |
| public | timesheet_entries | timesheet_entries_all | ALL | {public} | true | true |
| public | toolbox_signatures | toolbox_signatures_delete | DELETE | {public} | true | null |
| public | toolbox_signatures | toolbox_signatures_insert | INSERT | {public} | null | true |
| public | toolbox_signatures | Company isolation insert | INSERT | {public} | null | true |
| public | toolbox_signatures | toolbox_signatures_update | UPDATE | {public} | true | true |
| public | toolbox_talks | toolbox_talks_delete | DELETE | {public} | true | null |
| public | toolbox_talks | Company isolation delete | DELETE | {public} | (company_id = get_user_company_id()) | null |
| public | toolbox_talks | Company isolation insert | INSERT | {public} | null | (company_id = get_user_company_id()) |
| public | toolbox_talks | toolbox_talks_insert | INSERT | {public} | null | true |
| public | toolbox_talks | Company isolation update | UPDATE | {public} | (company_id = get_user_company_id()) | null |
| public | toolbox_talks | toolbox_talks_update | UPDATE | {public} | true | true |
| public | uk_bank_holidays | allow_all | ALL | {public} | true | true |
