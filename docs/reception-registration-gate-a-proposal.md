# Reception Registration in the Staff Path — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Most of the foundation is in place from migration 0033 (`cadres.is_clinical`, RECEPTION cadre + role, `user_roles 'reception'`, the non-clinical RLS boundary). This addendum is the **signup path** that lets a reception/records applicant onboard without a council/licence — and the admin-panel adaptation that approves them.

## 1. What's reuse vs net-new

| Piece                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cadres.is_clinical` boolean + RECEPTION cadre + RECEPTION_OFFICER role + `user_roles 'reception'` + non-clinical RLS boundary | **Reuse** — all shipped in migration 0033.                                                                                                                                                                                                                                                                               |
| `staff_affiliations` lifecycle (`pending_approval → approved → active`), MFA enforcement, audit, hospital-admin approval queue | **Reuse** — the lifecycle is identical for clinical and non-clinical. Reception affiliations are already accepted by the existing approval surfaces.                                                                                                                                                                     |
| `/signup/clinical` form + actions                                                                                              | **Reuse the primitives** (`Field`, `Input`, `Combobox`, `CascadingCombobox`, `SegmentedControl`, `FileUpload`, consent), **NOT the route**. The council/licence anchor is wrong for non-clinical and forcing nullable council into the existing form muddies a clean clinical-safety design. New parallel route instead. |
| `clinician_profiles` table                                                                                                     | **Reuse** — for clinical applicants only. Non-clinical applicants do NOT get a `clinician_profiles` row (FK is to councils which they have none of).                                                                                                                                                                     |
| `clinician-licences` Storage bucket                                                                                            | **Reuse pattern** — new sibling bucket `staff-identity-documents` for the optional appointment-letter upload.                                                                                                                                                                                                            |
| Pending-queue + detail sheet (`app/hospital-admin/staff/_components/pending-detail-sheet.tsx`)                                 | **Reuse + adapt** — the panel branches its content by the applicant's `cadres.is_clinical`.                                                                                                                                                                                                                              |

**Net-new — migration 0034 (additive only):**

| Schema delta                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staff_identity_profiles` table — minimal: `user_id` (PK, FK auth.users), `nin_encrypted`, `staff_number`, `appointment_letter_url`, `authorising_officer_name`, `authorising_officer_role`, `created_at`, `updated_at`. RLS: own + hospital_admin (scoped via the user's affiliations) + superadmin. | The clinical analog (`clinician_profiles`) is wrong for non-clinical staff — its `council_id` + `registration_number` + `licence_url` are NOT NULL. A new sibling table keeps the two tracks clean. Future non-clinical cadres (records HOD, finance, housekeeping) write to the SAME table — it's `staff_identity_profiles`, not `reception_profiles`. |
| New Storage bucket `staff-identity-documents` (private, RLS scoped to the user + their hospital admin + superadmin).                                                                                                                                                                                  | Mirrors `clinician-licences`. The appointment letter is optional but stored encrypted-at-rest if uploaded.                                                                                                                                                                                                                                              |

**Net-new code:**

- `app/signup/non-clinical/` — page + form + actions, parallel to `/signup/clinical`. Same form primitives, no council/licence fields, plus NIN + optional staff number + optional appointment-letter upload + optional authorising-officer.
- `app/get-started/page.tsx` — adds a tile **"Reception / records / non-clinical staff"** pointing at `/signup/non-clinical`.
- `app/hospital-admin/staff/_components/pending-detail-sheet.tsx` — branches panel content on the applicant's cadre's `is_clinical`. Clinical view stays unchanged (council, registration number, licence link). Non-clinical view shows employment evidence (NIN masked, staff number, appointment letter link if uploaded, authorising officer).
- Sign-in routing already sends RECEPTION cadre on active/approved affiliations → `/reception` (shipped in 0033).

## 2. Verification basis — the key decision

The clinical path's anchor is **"prove your professional licence."** It's impersonation-proof because the council registry is external + queryable + a different actor (the regulator).

The non-clinical anchor cannot copy that — there's no national registry of receptionists. The kickoff's proposed substitute is **"prove the hospital authorises you in this role."** That can mean several things, with different anti-fraud strengths:

| Verification level                             | What the applicant supplies                                                                        | What the admin checks                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. Admin-approval-as-attestation (minimal)** | NIN (encrypted)                                                                                    | The admin's own knowledge that this person is genuinely employed. Approval IS the attestation. |
| **B. + Internal staff number**                 | NIN, internal staff number                                                                         | The admin matches the staff number against the hospital's HR records.                          |
| **C. + Appointment letter upload**             | NIN, staff number, appointment-letter document                                                     | Admin opens the letter, sees the official appointment.                                         |
| **D. + Authorising officer named**             | All of the above + the name + role of a senior who can vouch (records HOD, hospital administrator) | Admin can call the named officer to confirm.                                                   |

**My recommendation: A is the floor, B–D are encouraged but not required.** Here's why:

- The hospital admin is already the verification step in EVERY other staff approval flow today (they approve nurses, MOs, consultants too). If we trust the admin to verify a doctor's licence document, we can trust them to verify "this person works at the front desk."
- Requiring an appointment letter blocks onboarding for hospitals that don't issue formal letters for reception roles (small private hospitals especially). The lift is real, the security gain is marginal once admin approval is the gate.
- The marginal anti-fraud value of staff number / authorising officer is captured by _encouraging_ them in the form (the admin sees "no staff number provided" and can ask), not by blocking the form.
- **NIN is captured + encrypted regardless** — that's the identity check independent of employment. It also gives forensic traceability if a reception account is ever misused.

**The flagged sign-off question:** is A acceptable as the floor, or do you want C (appointment letter) required for higher-risk roles? My read is A; reverting to C is an easy single-line form change if you want it.

## 3. The form (what the applicant fills)

Three steps, same multi-step shell as `/signup/clinical`:

**Step 1 — Account basics** (identical to clinical):

- Title · First name · Surname · Phone (+256) · Email · Password.
- Consent checkbox.

**Step 2 — Identity** (non-clinical specific):

- **NIN** (text, required, encrypted on insert — the identity anchor in absence of a licence).
- **Staff number** (text, optional — "if your hospital has assigned you one").
- **Authorising officer** — name (text, optional) + role (text, optional).
- **Appointment letter** (file upload, optional — pdf/image, ≤ 5MB, stored in `staff-identity-documents`).

**Step 3 — Affiliation** (mirrors clinical, MINUS council/cadre cascade):

- Hospital (combobox — active hospitals).
- Department (cascading combobox — by hospital).
- Cadre (combobox — **filtered to `is_clinical = false`**; defaults to RECEPTION).
- Role (combobox — children of selected cadre; for RECEPTION today, that's just RECEPTION_OFFICER).
- Employment type (segmented: full-time / part-time / locum).
- "Add another affiliation" repeats.

Then: MFA enrolment → `pending_approval` holding screen → admin approves → routed to `/reception`.

## 4. Admin pending-queue panel — branching

The existing `PendingDetailSheet` renders council + registration number + licence document. For non-clinical applicants the same sheet shows a different block:

| Block             | Clinical                                                       | Non-clinical                                                                                             |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Identity          | Title, name, contact, email-domain match signal                | + NIN (masked: `CM*****1234`, click-to-reveal once, audited)                                             |
| Credential anchor | Council, registration number (masked), licence document link   | Staff number (if provided), authorising officer (if provided), appointment letter link (if uploaded)     |
| Affiliation       | Hospital · department · cadre · grade · role · employment type | Hospital · department · cadre · role · employment type (no grade — non-clinical cadres don't use grades) |
| Approval CTA      | "Approve" / "Request more info" / "Reject"                     | identical                                                                                                |

The branch is driven by querying `cadres.is_clinical` for the applicant's affiliation — no UI hardcoding of role names.

## 5. Boundary preservation

- **Reception role grant is operational-only.** Approval here calls the existing affiliation-approval Edge Function, which inserts `staff_affiliations(state='approved')`. The RECEPTION cadre row is `is_clinical = false`. Clinical-content RLS policies require `is_clinical = true`. Reception inherits **no clinical capability** from approval — verified by the boundary tests added in migration 0033.
- **Clinical path stays untouched.** `/signup/clinical` continues to require council + licence; the schemas, validations, and pending-panel for clinical applicants don't change.
- **Per-affiliation, MFA, audit, lifecycle states** — all reused, no divergence.

## 6. Out of scope (deferred)

- **Invitation-driven non-clinical onboarding** (admin sends an invite link that pre-fills hospital + cadre, mirroring `hospital_staff_invitations` for clinical). The current `hospital_staff_invitations.invited_role_id` FK's to the clinical `roles` table — widening that to accept any role is the right path, but it's a separate small ticket. For MVP applicants visit `/signup/non-clinical` directly (sharing the URL is fine).
- **Other non-clinical cadres beyond RECEPTION** (records HOD, hospital administrator if non-clinical, billing, housekeeping). The schema + form already accept them — just seed the cadre rows and they appear in the cadre combobox.
- **NIN verification against an external register** (NIRA lookup). Deferred — manual review by hospital admin for now.
- **Audit log of admin-revealing of NIN** (the masked-reveal pattern from `directory-table.tsx`'s `MaskedReg`). Should be added but is a small follow-up.

## 7. Asks before I migrate

1. **§2 verification basis** — admin-approval as the floor, appointment letter optional-but-encouraged, NIN required and encrypted. OK? Or escalate to C (appointment letter required)?
2. **§1 schema** — new `staff_identity_profiles` table + `staff-identity-documents` Storage bucket. Additive only. OK?
3. **§3 form shape** — three-step form parallel to `/signup/clinical`, cadre combobox filtered to `is_clinical = false`. OK?
4. **§4 pending-panel branch** — same sheet, different content block driven by cadre's `is_clinical`. OK?
5. **§6 deferred list** — anything to pull back in?

Once signed off: migration 0034 + `/signup/non-clinical` route + `/get-started` tile + pending-panel branch in one PR.
