# RAMS/Document Sign-Off — Weak DOB Identity Check

## Status
Open. Documented 21 May 2026. Round 2 security item.

## What it is
The document sign-off flow (SignDocument.jsx) uses date of birth as the sole identity verification before recording a legally significant signature. An operative arrives at `/operative/:operativeId/sign/:documentId` (via invite email link), draws their signature, types their DOB, and submits. The DOB is compared against the stored value — if it matches, the signature is recorded.

## Why it's a problem
1. DOB is weak authentication — same class as Finding #26 (QR sign-in DOB fallback, now removed). DOBs are semi-public (social media, public records, colleagues knowing each other's birthdays).
2. RAMS signatures have legal/evidential weight in UK construction. A forged RAMS attestation could create liability.
3. The page is reachable without Supabase Auth login. OperativeGuard allows access for first-time operatives (no DOB set yet) and for operatives with a valid `operative_session` in localStorage.
4. An attacker who knows an operative's UUID, a document UUID, and their DOB can forge a signature. The UUIDs are in invite email links — anyone who intercepts or is forwarded the email has them.

## Where it lives
- `src/pages/SignDocument.jsx` lines 128-141
- DOB comparison at line 136-141
- The signature canvas + DOB input are the only controls before the signature is stored

## What should change (Round 2)
- Replace DOB with password-based verification (the operative now has a Supabase Auth account after the #26 changes)
- Or: require the operative to be logged in via Supabase Auth before signing (the OperativeGuard already has a login redirect path)
- Or: add a one-time code sent to the operative's email/phone as a signing verification step
- The fix should NOT break the first-time onboarding flow where the operative completes their profile AND signs documents in the same session

## Severity
Medium-High. The current DOB check is the same level of security that was in place before Round 1, so this isn't a regression — but it's a known gap that should be closed now that operatives have proper auth accounts.

## Owner
Round 2 security audit.
