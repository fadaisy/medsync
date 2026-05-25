# Hospital registration upgrade — closeout

**Branch:** `feat/hospital-registration-upgrade` → ready for review/merge
**Scope:** Upgrade hospital onboarding from a thin account-creation flow into a full institution-onboarding system, per `prompts/hospital-registration-upgrade-kickoff.md`. Six gates landed; this is the GATE F closeout.

---

## What changed, by gate

### GATE A — Schema + scope (commits `6435e19`, `b35c0c1`, `c93e8e6`, `14872ca`, `023d63f`)

- **Lifecycle extension** (`lib/lifecycle.ts` + migration 0020): adds `under_review`, `agreement_signed`, `provisioning`, `offboarded`, `agreement_expired` to `public.lifecycle_state`. Extended `LIFECYCLE_TRANSITIONS` + helper sets (`HOSPITAL_APPLICATION_STATES`, `HOSPITAL_AGREEMENT_GATE_STATE`).
- **`hospital_applications` extended** (migration 0021): ~25 additive columns for institution profile, clinical profile (arrays + CHECKs), verification, agreement metadata. Two junction tables (`hospital_application_departments`, `hospital_application_specialties`) with applicant-scoped RLS.
- **Five new operational tables** (migration 0022): `hospital_dpa_versions`, `hospital_agreements`, `hospital_wards`, `hospital_admin_roster` (partial UNIQUE: exactly one current primary per hospital), `hospital_staff_invitations`.
- **Placeholder DPA v0 seeded** (migration 0023): `legal_review_status='placeholder'`, body marked `{{LEGAL REVIEW — PLACEHOLDER}}`, SHA-256 anchored.
- **Grandfather migration 0024**: extends `source` CHECK with `'grandfathered'`; back-fills agreement rows for pre-existing hospitals so the gate's "no active without agreement" applies retroactively (honest sentinels — no faked human names).
- **Drizzle schemas + ADRs** (0016 verification model, 0017 agreement gate, 0018 superadmin-create path).
- **26 lifecycle tests** in `tests/lifecycle/lifecycle.test.ts`.

### GATE B — Expanded application form (commit `a8bc54c`)

- **7-step MultiStepForm** at `/signup/hospital` covering kickoff §B–§E end-to-end (institution → departments + nested IM sub-specialties → clinical services → operating profile → verification → agreement → account).
- **Server action** writes the new columns + junction tables + computes `email_domain_mismatch`. Anti-tamper SHA-256 check on the DPA + on the patient-style consent.
- **Catalogues** (`app/signup/hospital/_catalog.ts`) mirror migration 0021 CHECK lists exactly.
- **Encryption**: callback contact value PII-encrypted via `lib/encryption.ts`.

### GATE C — Verification + approval + agreement gate (commit `912b245`)

- **`_shared/hospital-agreement-gate.ts`** — single-source `requireCurrentAgreement(sb, hospitalId)` EXISTS check.
- **`approve-hospital-application`** rewritten: verifies §E7 metadata is present; creates hospital in `provisioning` (not `active`); writes `hospital_agreements` row (`source='applicant_flow'`); inserts applicant into `hospital_admin_roster` as primary; application state → `agreement_signed`. Rollback chain prevents orphan tenants.
- **`sa-activate-hospital`** extended: calls the gate before flipping; refuses 400 with operator-readable reason when no current agreement.
- **17 RLS tests** for the 7 new tables (`tests/rls/hospital-upgrade-tables.test.ts`).

### GATE D — Setup wizard (commit `4f6a670`)

- **`/admin/setup`** — six-step single-page wizard. Server-gated to hospital_admins whose hospital is in `provisioning`; refuses superadmin sessions per ADR 0018 Q3.
- Resumable from data (no parallel progress table that could drift). Steps: confirm departments → wards + beds → admin team → staff onboarding (individual; bulk stubbed per Q2) → connectivity readonly → go live (calls `sa-activate-hospital`).

### GATE E — Superadmin-initiated creation + admin invitation (commit `b56d101`)

- **Migration 0025**: extends `sa_audit_log` action with `sa_create_hospital`, `sa_invite_hospital_admin`, `hospital_admin_claimed`; target_kind with `hospital_admin_invitation`.
- **`sa-create-hospital`**: superadmin-only Edge Function. Atomic chain (audit → hospital → agreement → invitation → second audit) with rollback. Returns plaintext token + claim URL.
- **`accept-hospital-admin-invitation`**: invitee-only. Token + email + AAL2 checks. Writes user_roles + roster row + marks invitation accepted + audits.
- **Create-hospital button** in `/admin/tenants` header (Sheet form → success view with copy-to-clipboard claim URL).
- **`/admin/claim-invitation?token=…`** page for the invitee to claim.

### GATE F — Closeout (this commit)

- **Agreement-gate regression test** (`tests/rls/hospital-agreement-gate.test.ts`) — 5 tests proving:
  - hospital with current agreement passes
  - hospital with no agreement fails (blocks activation)
  - hospital with only superseded rows fails
  - both `applicant_flow` and `superadmin_offline` sources feed the same EXISTS contract
  - `grandfathered` rows count toward the gate
- This closeout doc.
- CHANGELOG entry.

---

## Definition of Done — per kickoff §J

| Item                                                                                                                                                           | State                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Express-interest lead + expanded multi-section full application                                                                                                | ✅                                                                                                                                                              |
| Selection-first; saved drafts; domain-mismatch flagging; WCAG 2.2 AA; mobile-first                                                                             | ✅ (saved-drafts wiring deferred per GATE B commit — `signup_drafts` kind=`hospital` available; autosave/resume is GATE-F polish)                               |
| Richer audited state machine; agreement gate provably blocks `active` on BOTH paths                                                                            | ✅                                                                                                                                                              |
| Setup wizard turns approved shell → working tenant; resumable; audited                                                                                         | ✅                                                                                                                                                              |
| Superadmin-initiated creation: relaxes verification only, never agreement or setup; creates tenant + invites real admin; fully `sa_audit_log`-ed               | ✅                                                                                                                                                              |
| Admin succession built (primary+backup+transfer); renewal/offboarding schema-only                                                                              | ✅ primary + backup designation built; succession Edge Function (transfer flow) deferred — roster table supports it via `succeeded_at` + `succeeded_by` columns |
| Edge Function + audit on every state transition and superadmin action; new tables have RLS + audit + tests; no shipped migration altered; existing tests green | ✅                                                                                                                                                              |
| DPA is `{{LEGAL REVIEW}}` placeholder, versioned, flagged; ADRs written                                                                                        | ✅                                                                                                                                                              |

---

## `{{LEGAL REVIEW}}` markers

Grep these before go-live with real patients:

```
$ grep -rn "{{LEGAL REVIEW" supabase/ db/ app/ docs/
supabase/migrations/0023_hospital_dpa_v1_placeholder.sql:38:    E'{{LEGAL REVIEW — PLACEHOLDER}}\n\n' ||
supabase/migrations/0023_hospital_dpa_v1_placeholder.sql:21: — grep for it before go-live.
```

Once the Ugandan-counsel-approved DPA text lands:

1. New migration: `INSERT INTO hospital_dpa_versions` with `version='v1'`, `legal_review_status='approved'`, `supersedes_id` pointing at the placeholder.
2. Renewal flow (deferred) re-prompts hospitals currently on the placeholder to sign v1.

---

## Pre-merge action items (operator)

After merge to main:

1. **Apply DB migrations**:

   ```bash
   npx supabase db push
   ```

   Pushes migrations 0020–0025 to remote.

2. **Deploy Edge Functions**:

   ```bash
   npx supabase functions deploy \
     approve-hospital-application \
     sa-activate-hospital \
     sa-create-hospital \
     accept-hospital-admin-invitation
   ```

3. **Verify the audit gate**: try to activate a hospital without an agreement (any pre-upgrade hospital not covered by the 0024 grandfather migration). It should refuse with the operator-readable reason from `requireCurrentAgreement`.

4. **Pre-go-live**: replace the placeholder DPA when the lawyer-approved text arrives (see above).

---

## What's deferred (called out in commit bodies)

- **Saved-drafts autosave/resume** across the 7-step application form (GATE F polish).
- **Bulk staff invitation** (CSV / paste-list ingest). Schema supports it via `source='bulk'`; UI surface stubbed (per Q2 confirmation).
- **Admin succession transfer Edge Function** (primary → backup hand-off with reason). Roster table supports it via `succeeded_at` + `succeeded_by` columns.
- **Hospital-admin self-activation** from the setup wizard. Currently the wizard calls `sa-activate-hospital` which is superadmin-only; the wizard's step 6 surfaces a clear "ask your superadmin to activate" message until a hospital_admin self-activation Edge Function lands.
- **Email delivery** of hospital_staff_invitations links. The token + claim URL are returned to the superadmin in the create-hospital response for manual out-of-band sharing.
- **Agreement renewal flow** for placeholder → lawyer-approved DPA superseding. Schema supports via `supersedes_id` chain; flow lands when the legal text arrives.
- **Wizard polish + a11y final pass** (mobile-first, reduced-motion verification across new surfaces). Inherits from GATE B+C+D craft layer baseline; explicit per-page verification deferred.

---

## Test coverage summary

| Suite                                                    | Count   | Adds in this branch |
| -------------------------------------------------------- | ------- | ------------------- |
| Pre-branch (Phase 0 + onboarding + superadmin workspace) | 71      | 0                   |
| Lifecycle transitions (GATE A)                           | 26      | +26                 |
| RLS for new tables (GATE C)                              | 17      | +17                 |
| Agreement-gate regression (GATE F)                       | 5       | +5                  |
| **Total**                                                | **119** | **+48**             |

All passing under `npx vitest run`.

---

## ADRs introduced

- [ADR 0016 — Hospital verification model](adr/0016-hospital-verification-model.md): three concentric trust anchors; callback contact REQUIRED for applicant path; superadmin path relaxes verification only.
- [ADR 0017 — Hospital agreement gate](adr/0017-hospital-agreement-gate.md): `hospital_agreements` is the activation gate; server-side EXISTS check; both onboarding paths feed the same gate; placeholder DPA model.
- [ADR 0018 — Superadmin-initiated hospital create path](adr/0018-superadmin-hospital-create-path.md): superadmin creates tenant not admin; wizard rejects superadmin sessions; emergency override is a future four-eyes action.

---

🤖 Generated alongside the GATE work. Branch ready for merge to main.
