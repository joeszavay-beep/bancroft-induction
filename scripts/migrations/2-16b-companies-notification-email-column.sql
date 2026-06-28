-- AUDIT §2.16b — wire up company sign-off email notifications (Option A).
--
-- The send path (SignDocument.jsx, api/notify.js) already reads
-- `companies.notification_email`, but the COLUMN never existed — the query
-- errored (42703), the error was swallowed, the recipient resolved to null,
-- and no sign-off email has ever been sent for any company. This adds the
-- column the send path already expects (so the security-gated api/notify
-- open-relay check is untouched); the settings UIs are repointed to write it.
--
-- Additive + nullable: safe to apply anytime (the pre-fix code already
-- references the column, so adding it only stops the swallowed error). All 6
-- companies are null today, so there is nothing to backfill.
--
-- DEPLOY ORDER: apply this in Supabase FIRST, then merge/deploy the code PR
-- (the repointed settings UIs write this column).

alter table companies add column if not exists notification_email text;
