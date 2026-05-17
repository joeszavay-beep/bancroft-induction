# Password Reset — Production Bug

## Status
Open. Confirmed on production (coresite.io) on Sun 17 May 2026.

## Symptom
1. User goes to login page, clicks "forgot password"
2. Enters their email, gets the reset email
3. Clicks the email link within 2 minutes of requesting it
4. Lands on /reset-password page
5. Page shows "Set New Password" header, then "Verifying reset link..."
6. Then displays in red: "Reset link has expired or is invalid. Please request a new one."
7. Both messages visible simultaneously — page is in inconsistent state

## Key fact
The link was clicked 2 minutes after requesting it. Reset tokens normally last 1 hour. So this is NOT real expiry — it's a real bug being masked by a generic error message.

## What we know
- Affects production (coresite.io) — user joe.szavay@bancroft.uk.com
- Reset email DOES arrive
- /reset-password route exists in App.jsx
- ResetPassword.jsx component uses PKCE code exchange (line ~24-30) or hash token detection (lines ~42-47)
- redirectTo URL uses window.location.origin + '/reset-password' (constructed in PMLogin.jsx line ~145 via CompanyContext.resetPassword, and OperativeLogin.jsx line ~89 directly)
- An earlier diagnosis incorrectly classified this as "configuration-only / production fine" — that conclusion was wrong

## What to investigate next session
1. Is the email URL using a hash fragment (#access_token=...) or query param (?code=...)? Different code paths handle each.
2. Does the PKCE code exchange call (`supabase.auth.exchangeCodeForSession`) succeed or fail? What error does it return?
3. Is the "verifying reset link..." UI state ever cleared on success, or is it always shown alongside the error?
4. Race condition? The simultaneous "verifying" + "expired" display suggests the verification finishes but the loading state isn't being unset properly.
5. Is there a session conflict — was the user logged in as a different account in another tab when they clicked the link?
6. Check Supabase Auth logs in the dashboard for the reset attempt — what's the actual error returned?

## Reproducer
1. Log out of CoreSite entirely
2. Go to coresite.io login
3. Click "Forgot password"
4. Enter a real manager email
5. Click the link in the email immediately (within 5 minutes)
6. Observe: lands on /reset-password but shows expired error

## Related context
- Discovered during dates-utility branch preview testing, but the bug is on main (production) and predates Phase 2 date utility work
- NOT a regression from Round 1 security lockdown — git history shows no changes to reset flow in commit f0e6309
- NOT a regression from Phase 2 dates work — no date code touches auth
- NOT caused by Supabase URL allowlist (production URL is whitelisted)

## Priority
High — password reset being broken is a serious UX bug. Users who genuinely forget their password cannot recover.

## Owner
Round 2 of the security/bug audit work.
