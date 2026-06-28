-- Rollback for 2-16b-companies-notification-email-column.sql (AUDIT §2.16b).
-- Drops the notification_email column. NOTE: only safe once the code that
-- reads/writes it (SignDocument, api/notify, CompanySettings, PMDashboard) is
-- reverted — otherwise the send path's swallowed-error bug returns.

alter table companies drop column if exists notification_email;
