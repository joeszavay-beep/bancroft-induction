# Baseline "before" snapshot — §1 Query C (storage.objects policies)

Captured: 2026-06-12, Supabase SQL editor, pre-lockdown. COMPLETE (12 rows).

## KEY FINDING

An EARLIER version of storage-lockdown.sql (the 2026-05-17 one, with hard-coded
6-bucket lists and the hard-coded drop list) is ALREADY APPLIED in production:
the legacy "Allow public uploads/reads/deletes" / "Allow public on X" policies
are GONE, replaced by storage_public_read + storage_authenticated_* + the 5
anon-folder exceptions. The three floor_plans_* policies (add-floor-plans.sql,
2026-06-08) sit alongside and are the surviving anon upload/delete gap (§5.9):
- floor_plans_upload: INSERT WITH CHECK (bucket_id='floor-plans') — anon CAN upload
- floor_plans_delete: DELETE USING (bucket_id='floor-plans') — anon CAN delete
- storage_authenticated_* bucket lists do NOT include floor-plans (the old lists)

Consequences:
1. Today's patched storage-lockdown.sql is still exactly right: generic drop
   removes all 12, recreates 9 (floor-plans now in the authenticated lists).
2. storage-lockdown-rollback.sql must restore THIS 12-policy state (the live
   pre-change state), NOT the 2026-05-17 fully-public set — rewritten 2026-06-12.

## Raw output (as pasted)

| policyname | cmd | roles | qual | with_check |
| --- | --- | --- | --- | --- |
| floor_plans_delete | DELETE | {public} | (bucket_id = 'floor-plans'::text) | null |
| storage_authenticated_delete | DELETE | {public} | ((auth.role() = 'authenticated'::text) AND (bucket_id = ANY (ARRAY['documents'::text, 'snag-photos'::text, 'progress-drawings'::text, 'progress-photos'::text, 'company-assets'::text, 'drawings'::text]))) | null |
| floor_plans_upload | INSERT | {public} | null | (bucket_id = 'floor-plans'::text) |
| storage_anon_aftercare_upload | INSERT | {public} | null | ((auth.role() = 'anon'::text) AND (bucket_id = 'snag-photos'::text) AND ((storage.foldername(name))[1] = 'aftercare'::text)) |
| storage_anon_card_upload | INSERT | {public} | null | ((auth.role() = 'anon'::text) AND (bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = 'cards'::text)) |
| storage_anon_signature_upload | INSERT | {public} | null | ((auth.role() = 'anon'::text) AND (bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = 'signatures'::text)) |
| storage_anon_snag_reply_upload | INSERT | {public} | null | ((auth.role() = 'anon'::text) AND (bucket_id = 'snag-photos'::text) AND ((storage.foldername(name))[1] = 'snag-replies'::text)) |
| storage_anon_toolbox_upload | INSERT | {public} | null | ((auth.role() = 'anon'::text) AND (bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = 'toolbox'::text)) |
| storage_authenticated_upload | INSERT | {public} | null | ((auth.role() = 'authenticated'::text) AND (bucket_id = ANY (ARRAY['documents'::text, 'snag-photos'::text, 'progress-drawings'::text, 'progress-photos'::text, 'company-assets'::text, 'drawings'::text]))) |
| floor_plans_read | SELECT | {public} | (bucket_id = 'floor-plans'::text) | null |
| storage_public_read | SELECT | {public} | true | null |
| storage_authenticated_update | UPDATE | {public} | ((auth.role() = 'authenticated'::text) AND (bucket_id = ANY (ARRAY['documents'::text, 'snag-photos'::text, 'progress-drawings'::text, 'progress-photos'::text, 'company-assets'::text, 'drawings'::text]))) | null |
