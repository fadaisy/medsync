# ADR-0013: Onboarding architecture — lifecycle, drafts, approvals, form primitives

- **Status:** Accepted
- **Date:** 2026-05-23
- **Phase:** 1.0 (gates A–G)
- **Deciders:** Usama Fadhul

## Context

Phase 1 opens the front door of MedSync to four audiences (patient,
clinician, hospital, superadmin), each with a different verification
gradient. Phase 0 shipped only an empty authenticated shell — Phase 1
needs to:

1. Take a stranger from `/get-started` to a usable account, with
   the right second factor and the right scope, in the right order.
2. Capture identity + PHI (NIN, phone, council registration) without
   ever leaking it before the email has been confirmed.
3. Hold approval-gated accounts in an inert state until the
   appropriate reviewer (hospital admin for staff, superadmin for
   hospital applications) explicitly promotes them.
4. Stay buildable: keep the data model honest, share form primitives
   across the three signup paths, and route the approval logic through
   one auditable place.

This ADR records the shape of the system that ships at the end of
Phase 1 (gates A–F, plus the closeout in G).

## Decision

### 1. Lifecycle state machine

Single Postgres enum `public.lifecycle_state` applied to `users.state`,
`staff_affiliations.state`, and `hospital_applications.state`. States:

```
unverified · verified · pending_approval · approved · active
             · rejected · suspended · deactivated
```

The valid forward transitions are encoded in TS in
[`db/schema/lifecycle.ts`](../../db/schema/lifecycle.ts) and enforced
at the DB layer by the trigger that audits every column change.
Mutations happen exclusively through `transitionUserState()` and
`transitionAffiliationState()` in [`lib/lifecycle.ts`](../../lib/lifecycle.ts);
direct UPDATEs from a route handler are a code-review failure.

Ladders per audience:

- **Patient:** `unverified → verified → active`. Email OTP is the only
  gate; MFA optional.
- **Clinician:** `unverified → verified → pending_approval → approved → active`.
  Email OTP + hospital_admin approval. MFA mandatory.
- **Hospital admin:** `unverified → verified → pending_approval → approved → active`.
  Email OTP + superadmin approval. MFA mandatory. On approval their
  `user_roles` row is set to `hospital_admin` scoped to the new
  `public.hospitals` row.
- **Superadmin:** seeded by migration; never created via the public
  signup paths.

### 2. PHI handling at signup

`MEDSYNC_PHI_KEY` AES-256-GCM (ADR-0008) encrypts NIN and phone in
`patient_profiles` before any DB write. Plaintext phone lives on
`public.users.phone` for operational routing (SMS, support); the
ciphertext copy on `patient_profiles.phone_encrypted` is the
record-of-source for PHI access patterns.

The trickier constraint: a multi-step form must collect PHI across
several screens, but **must not** stash that PHI against an
unverified email. The solution:

1. The form's submit action creates the auth user (Supabase signUp),
   triggering Supabase's email OTP.
2. For paths that need a file (clinician, hospital) the file is
   uploaded via the _service role_ immediately after account creation
   — the user has no usable session yet but the bucket is a private
   `<user_id>/...` path with RLS scoping reads to the owner +
   superadmin + the relevant hospital_admin.
3. All other form fields are packed into a 30-minute httpOnly,
   `sameSite=strict`, `Secure-in-prod` cookie scoped to the signup
   path. The cookie carries no password.
4. The OTP verify action reads the cookie, calls
   `supabase.auth.verifyOtp`, then runs the database inserts under
   service role and transitions lifecycle state.
5. On verify success the cookie is deleted.

If the user abandons signup the auth user remains unverified; the
authorization material lives in the bucket; cleanup runs in the
`signup_drafts` sweeper (the table exists from GATE A; the cron is
deferred to Phase 2). The trade-off vs. moving the cookie payload
into `signup_drafts` immediately is rejected for this gate because
the row would carry PHI keyed by email _before_ the email is
verified — exactly what step (1) was protecting against.

### 3. Approval workflow

`/admin/applications` (superadmin only) and `/admin/affiliations`
(superadmin sees all; hospital_admin sees affiliations scoped to
their hospital via `adminHospitalIds`).

The approval business logic is in
[`lib/approvals.ts`](../../lib/approvals.ts) — one module, four
functions:

- `approveHospitalApplication` → insert `hospitals` → set
  `approved_hospital_id` → application `→ approved` → insert
  `user_roles` (hospital_admin scoped to the new hospital) → user
  lifecycle `pending_approval → approved → active`.
- `rejectHospitalApplication` → set `rejection_reason` → application
  `→ rejected`. User stays `pending_approval` so they can edit + retry.
- `approveStaffAffiliation` → affiliation `pending_approval → approved
→ active`, and lift the user lifecycle if it's still pending.
- `rejectStaffAffiliation` → affiliation `→ rejected`. User lifecycle
  untouched (they may hold other affiliations elsewhere).

Authorization is enforced in the _server action_ before
`lib/approvals.ts` is called — `requireSuperadmin()` and
`requireAdminish()` in [`lib/auth.ts`](../../lib/auth.ts) plus a
hospital-scope re-check on every affiliation mutation. A forged
`affiliation_id` posted from the client can't bypass the scope
filter.

Every meaningful mutation lands in `audit_log` via the trigger from
0003 + 0015. `actor_id` resolves to `auth.uid()` of the reviewing
admin; `before_data`/`after_data` carry the full row state.

### 4. Form primitives

[`components/form/`](../../components/form/) ships seven primitives
that power the three signup paths and the future dashboard surfaces:
`Combobox`, `CascadingCombobox`, `SegmentedControl`, `RadioCards`,
`FileUpload`, `OtpInput`, `DatePicker` (single / range / datetime).

All seven are interactive on `/styleguide §14` so reviewers exercise
them in both themes before relying on them in production.

Built on Base UI primitives (`@base-ui/react`) for ARIA correctness +
react-day-picker v10 for the calendar engine. Wrapping happens once
in `components/ui/popover.tsx` so every floating panel inherits the
same surface style. The form primitives surface labels as `aria-label`
or `htmlFor`-linked `<Label>` and submit values via hidden `<input>`
elements where the underlying widget is custom (segmented, date,
file) — so server actions can stay form-data first without bespoke
encoding per primitive.

### 5. Multi-step form pattern

Each signup form is a single React component with three steps
implemented as CSS-visible/hidden sections that all post their inputs
in one FormData. The advantages over a wizard with per-step server
roundtrips:

- No per-step server actions; one validate-everything action at the
  end.
- Browser back/forward works inside the form without losing state.
- Server-side validation errors are returned as a `{ errors, values }`
  bag and the form jumps to the first errored step via React's
  "store-prior-values" pattern (no `useEffect`-setState; ESLint-clean).
- `useActionState` returns `(state, action, pending)` — pending state
  flows into the submit button automatically.

## Consequences

**Positive**

- Approval logic is in one module with one shape; the same functions
  can later be lifted into a Supabase Edge Function variant without
  changing the route handlers.
- Audit trail covers every transition + every insert/update/delete
  across the Phase 1 tables (0015).
- PHI never lands against an unverified email. The cookie expires in
  30 minutes; abandoned signups leave no PHI footprint in the
  database.
- Form primitives are reusable across the three signup paths; the
  /styleguide demo shows each in isolation with real Uganda data.

**Negative / trade-offs**

- The pending-profile cookie holds 5–10 KB of plaintext including NIN
  and phone for the duration of the OTP step. It's `httpOnly` +
  `sameSite=strict` + `Secure-in-prod` + 30-min TTL, so the exposure
  window is small, but a hostile browser extension on the user's
  device could see it. Moving this to a server-side `signup_drafts`
  row keyed by a random server-side token is the planned Phase 2
  swap; we accept the trade for now to keep the signup flow stateless
  on the server.
- The lifecycle enum + transition table is the contract between
  every approval flow. Adding a new state requires both an ENUM ALTER
  and an edit to `LIFECYCLE_TRANSITIONS`. The existing 8 states cover
  every known flow; if Phase 2 needs more, the enum is `pg_temp`-free
  so an `ALTER TYPE … ADD VALUE` migration is forward-only.
- The form pattern has every step rendered in the DOM and toggled by
  display, which means inputs from hidden steps are still in the
  FormData — required for the "validate everything" submit, but it
  means client-side scripts could read across steps via the DOM.
  That's acceptable because the form is single-user, single-tab; if
  Phase 2 needs progressive disclosure (e.g. for very long
  applications) we'll swap to truly conditional rendering.

## Alternatives considered

- **Supabase Edge Functions for approval logic** — rejected for this
  gate. Edge Functions deploy separately, change a moving part on
  every release, and double the testing surface for a flow that only
  superadmin/hospital_admin will ever hit. The Server Action variant
  in `lib/approvals.ts` is service-role + audit-trail-equivalent and
  the same code lifts into an Edge Function later if the contract
  needs to be callable from outside Next.js.
- **Per-step server actions / multi-page wizard** — rejected because
  the bookkeeping cost (route per step, draft row per step, browser
  history confusion) outweighed any UX win for forms with three
  steps. Reconsider if any flow grows past five steps.
- **Phone OTP via Africa's Talking** — kickoff specifies phone is the
  patient's primary contact, but Supabase phone OTP needs a Twilio /
  AT integration we haven't built yet. We use Supabase's email OTP
  for verification at this gate and store the phone (encrypted) on
  `patient_profiles` for downstream SMS routing. Swap to phone OTP
  is a per-path config flip when SMS is live in Phase 5.
- **Full UBOS NPHC 2024 district + subcounty pull at GATE A** —
  rejected as out-of-scope for the bootstrap; placeholder seed +
  tracker doc ([`docs/reference-data-sources.md`](../reference-data-sources.md))
  ships in the same gate. The form already works for the 21 seeded
  districts; the catalog upgrade is a data-only migration.
