# ADR-0010: Auth + MFA + Next.js 16 proxy route protection

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.9
- **Deciders:** Usama Fadhul

## Context

Phase 0.9 wires identity. Every later sub-phase (and Phase 1+) assumes the platform knows who's calling. Three non-negotiables from the kickoff:

1. **TOTP MFA is mandatory** for any clinical or administrative role; the session must reach AAL2 before they can see protected surfaces. Patients are optional.
2. **`getUser()` everywhere, never `getSession()`** — the session cookie is forgeable; only the server-validated `getUser()` is safe for authorisation.
3. The middleware is now called **proxy** in Next.js 16. The pattern + cookie handling for `@supabase/ssr` works the same; the file is just renamed.

## Decisions

### 1. Identity row creation: trigger, not server action

[`supabase/migrations/0004_auth_user_mirror.sql`](../../supabase/migrations/0004_auth_user_mirror.sql) installs an `AFTER INSERT ON auth.users` trigger that copies the new auth row into `public.users` (id, email, full_name from `raw_user_meta_data`). Falls back to email when `full_name` isn't provided.

Why a trigger over an explicit Server Action insert:

- One source of truth — every code path that creates an auth.users row (Server Action sign-up, Edge Function invite, dashboard manual create) gets the mirror for free.
- Atomic with the auth.users INSERT — no race window where auth.users exists without public.users.
- Survives `supabase.auth.admin.createUser()` from tests and ops scripts.
- Supabase grants project owners the `CREATE TRIGGER ON auth.users` privilege specifically; we don't fight permissions.

`SECURITY DEFINER` + `ON CONFLICT (id) DO NOTHING` make it idempotent and authorisation-agnostic.

### 2. Single auth helper: `lib/auth.ts` → `getAuthState()`

Returns `{ user, roles, mfaRequired, aal, nextAal }`. Every Server Component and the proxy call this; nothing reads `getUser()` / `mfa.getAuthenticatorAssuranceLevel()` / `user_roles` directly. Single place to evolve when role evaluation changes (Phase 1+ may move roles into JWT app_metadata for proxy performance).

`MFA_REQUIRED_ROLES = { clinician, nurse, pharmacist, lab_tech, hospital_admin, superadmin }`. Patient role is intentionally excluded — TOTP is optional for them.

### 3. Server Actions with `useActionState` for forms

Sign-up / sign-in / MFA challenge / MFA verify all use:

- Zod schema validates `FormData` server-side.
- Field-level errors return as `{ errors: { fieldName: 'message' } }`.
- The client form is a thin `"use client"` wrapper using React 19's `useActionState` to render errors + a `pending` button state.
- Forms work without JavaScript (progressive enhancement) because Server Actions accept a `<form action={...}>` POST.

Why not react-hook-form for these flows: server-side validation is the actual source of truth (we don't want to ship the password regex to the client), and the forms have 1–3 fields. The extra client-side library would buy us nothing.

`shadcn add form` was tried again and remains absent from the `base-nova` registry; the AuthCard + Label + Input + FieldError + FormError primitives in [`components/medsync/auth-card.tsx`](../../components/medsync/auth-card.tsx) cover what we need with much less ceremony.

### 4. MFA: TOTP, enrol once, challenge once per session

- **Setup** ([`/onboarding/mfa-setup`](<../../app/(auth)/onboarding/mfa-setup/>)) — Server Component calls `mfa.enroll({ factorType: 'totp', issuer: 'MedSync' })`, renders the resulting URI as an SVG QR code server-side using `qrcode` (no client roundtrip; the secret never leaves the server's response stream). User scans, types 6-digit code, Server Action calls `mfa.challenge` + `mfa.verify`. On success the session is elevated to AAL2.
- **Challenge** ([`/sign-in/mfa`](<../../app/(auth)/sign-in/mfa/>)) — Same `challenge` + `verify` against the user's first verified TOTP factor.
- **Cleanup** — On every visit to `/onboarding/mfa-setup` we sweep stale unverified factors (`mfa.unenroll`) from previous abandoned attempts, then enrol a fresh one. Keeps the user's factor list clean.

Supabase's `mfa.listFactors().totp` is pre-filtered to verified-only; unverified factors live in `.all`. Code reflects that.

### 5. Route protection: `proxy.ts` at root

[`proxy.ts`](../../proxy.ts) runs on every matched request. Three responsibilities, in order:

1. **Refresh the Supabase session** via [`lib/supabase/proxy.ts`](../../lib/supabase/proxy.ts) `updateSession()`. Mandatory: the SSR server client's cookie-`setAll` fallback assumes this happens here.
2. **Public vs protected route gate**. Public prefixes (`/sign-up`, `/sign-in`, `/styleguide`, `/api/health`, plus exact `/` and `/sign-out`) pass through. Protected prefixes (`/dashboard`, `/onboarding`, `/admin`) require an authenticated user; anonymous requests redirect to `/sign-in?redirect=<original>`.
3. **AAL2 enforcement** via `getAuthState()`:
   - If `nextAal === 'aal2'` but `aal === 'aal1'` → user has MFA enrolled but hasn't passed today's challenge → redirect to `/sign-in/mfa?redirect=<original>`.
   - If `mfaRequired && nextAal !== 'aal2'` → user holds a clinical/admin role but hasn't enrolled MFA → redirect to `/onboarding/mfa-setup` (which the user can't leave until they enrol, except via sign-out).

The matcher excludes `_next`, the Sentry tunnel `/monitoring`, favicon, and common image extensions so we don't pay the cost on every chunk request.

### 6. Sign-out is POST-only

[`/sign-out`](../../app/sign-out/route.ts) accepts POST only. No GET handler. A `<a href="/sign-out">` link cannot log someone out (CSRF-safe-ish; we'd add a CSRF token for write actions that mutate other state, but sign-out is idempotent).

### 7. Tests

[`tests/auth/auth-flow.test.ts`](../../tests/auth/auth-flow.test.ts) — 4 cases:

- Trigger mirrors auth.users → public.users with `full_name` from metadata.
- Falls back to email when `full_name` metadata is missing.
- Duplicate email signup fails at the auth layer; no second `public.users` row.
- A fresh user's `getAuthenticatorAssuranceLevel()` returns `{ currentLevel: 'aal1', nextLevel: 'aal1' }` (MFA not enrolled).

UI tests (sign-up form submission, MFA challenge UI) are not in scope for Phase 0.9 — we don't have a browser-driving test infrastructure yet. The Server Action functions themselves are tested implicitly via the trigger test; e2e UI coverage is a Phase 1 follow-up.

Total suite: **71/71 across 10 files** (~70s).

## Consequences

**Positive**

- `getAuthState()` is the single seam for "who is the user". One place to optimise (cache, move to JWT, etc.) without touching call sites.
- Trigger mirror means we never have an orphan auth row without a profile, regardless of how the auth row was created.
- Proxy gates run on every request — there's no "I forgot to add `await getUser()` at the top of this page" failure mode.
- MFA enrolment QR renders server-side, so the secret never travels through a client API; reduces leak surface to logged HTML if any.

**Negative / trade-offs**

- The proxy runs `getAuthState()` for every protected request, which means a DB query (user_roles + getAuthenticatorAssuranceLevel) per page navigation. Cost is ~50-150ms per request to Supabase. Acceptable for Phase 0 traffic; move roles into JWT `app_metadata` in Phase 1 if it becomes a bottleneck.
- The `(auth)` route group + `dashboard` placeholder means the protected/public split is implicit in proxy.ts's `ALWAYS_AUTH_REQUIRED_PREFIXES` array, not in the file system. Easy to forget when adding a new route. Mitigated by the default-protected pattern (anything new defaults to "needs auth" unless added to the public list).
- Sign-up enrols every new user with `email_confirmed_at` set automatically because Supabase's default for our project requires no email verification. For real patient data we should turn on email verification (Supabase Auth settings → Email Confirmations) and add a `/verify-email` callback handler. Tracked as a follow-up.
- The default new-user role is implicit (`patient`, never explicitly assigned at signup). Role assignment happens via the Edge Function in 0.10. Until that's deployed, a fresh sign-up has zero roles and `mfaRequired === false` → can access `/dashboard` without MFA.

## Alternatives considered

- **NextAuth.js / Auth.js.** Rejected — Supabase Auth ships everything we need (TOTP, AAL, session refresh) and our backend is already on Supabase. Two auth stores would be a nightmare.
- **JWT-only auth (no DB round-trip in proxy).** Considered for performance. Would require encoding roles into `app_metadata` via Edge Function on every role change. Phase 1+ follow-up.
- **Email magic links.** Rejected for Phase 0 — patients need predictable login from any device; password + TOTP covers it. Magic links are a Phase 5+ option for the SMS-first patient surface.
- **WebAuthn / passkeys.** Deferred. Higher security; better UX. Add as an alternative MFA factor in Phase 1+ when Supabase's WebAuthn support stabilises.
- **shadcn `Form` primitive.** Tried; not in the base-nova registry. Hand-rolled `AuthCard` + field components are simpler for our 1-3 field forms.

## Follow-ups

- Phase 0.10 Edge Function `assign-role` lets a superadmin grant clinical roles. Once a role is granted, the proxy's MFA enforcement kicks in immediately.
- Phase 0.12 deployment: enable email verification in Supabase Auth settings before any real users land.
- Phase 1+: move role evaluation into JWT `app_metadata` to avoid the per-request user_roles query.
- Phase 1+: add WebAuthn as a second MFA factor option.
- Add browser-driven e2e tests (Playwright) for the full sign-up → MFA setup → dashboard flow once the test infrastructure is in place.
