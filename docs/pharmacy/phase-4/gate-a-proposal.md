# Pharmacy Phase 4: GATE A proposal

Branch `feat/pharmacy-network` (worktree `~/Desktop/medsync-network`). Written 26 Oct 2026. STOP 0 is in `STOP-REPORTS.md`. Numbers claimed: migrations 0230–0249 and ADRs 0425–0444. The hazard log is in `hazard-log.md` and the ADR drafts are in `adr-drafts.md`.

**Status: draft, unsigned.** Nothing past Step 1 is built until the signatures at the end are given and the open inputs are in.

## Open inputs (the prompt requires these before GATE A can be signed)

| Input                                                                                                                                     | Gates                                        | State                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ |
| Interim written answers to legal questions 1 and 2 (Appendix E)                                                                           | GATE A, `pharmacyRepeats`                    | **Open**                             |
| A record of whether the National Drug and Health Products Authority Act, 2026 has commenced, with ss.119 and 120 read (Appendix F)        | GATE A                                       | **Open**                             |
| The name of the MedSync partner verifier, and a second approver (D-PH4-09)                                                                | GATE A, `networkRegistry`                    | **Open**                             |
| Legal questions 3 and 5                                                                                                                   | `pharmacyNetwork` (Step 7 onward)            | Open; not needed for the first merge |
| Legal question 6                                                                                                                          | Any agreement naming a programme medicine    | Open                                 |
| The named pharmacist reviewer (D-PH-13), the pilot site's pharmacy in charge, and the hospital's data-protection officer or legal adviser | The signatures listed in the prompt's header | **Open**; see D-PH4-29               |
| 90-day counts (Q6 queries in STOP 0)                                                                                                      | Sizing for the CSO; not a blocker            | Open                                 |

## 1. The repeat authorisation and its print (6.1, Appendix F)

- **Record.** `prescription_repeat_authorisations` belongs to one prescription line version. It holds:
  - further supplies (n);
  - at least d days apart;
  - not after;
  - review by (optional);
  - the prescriber, the time and the signed rule version.

  It is written only by a prescribing action. `prescription_repeat_events` holds `stopped` only. `ended` is a projection over a line change, a cancellation, a replacement or a renewal (RP-3). No column is added to `prescriptions`.

- **Quantity (P4 as found).** `prescriptions.quantity` and `duration` are free text, so the authorisation stores **no quantity**. Each repeat supplies the line's quantity as written, or as the dispenser types it (Phase 1 D-PH1-15). This is D-PH4-23.
- **The step.** The Repeats step comes after the Check step in the plan dialog (`components/clerking/plan/prescribe-dialog.tsx`), only for medicines on the signed repeat list and not on the never-repeat list. It is not shown on the resus (emergency) dialog. Every value is typed by the prescriber; the system computes nothing.
- **The print.** One more line goes under the line in `PrescriptionLine` (`components/emr/prescribing/views`), in the signed wording: _"Repeats: {n}, at least {d} days apart, not after {date}. Prescriber: {name}, {council number}."_
- **Legal reading.** s.37(5) of the 2026 Act treats a prescription as fully dispensed after one supply unless it states "the number of times and the intervals". The printed line states both, plus a "not after" date. **Whether that satisfies s.37(5), and the position under the 1993 Act until commencement, is legal question 2: open.** Until it is answered in writing, `pharmacyRepeats` stays off everywhere.

## 2. Refills and renewals, end to end (6.2, 6.4)

```
Patient (web) or window or phone ──► refill request (RF-1: requested)
        │ per line: repeatStatus(line, now)  (RP-6, pure)
        ├─ allowed ─────────► repeat instance k of n (RI-1: to_prepare)
        │                        │ pharmacist-first? ─► fresh acceptance of this instance (D-PH4-21)
        │                        ├─ Prepare ► Set aside ─► prepared location (SA-1, two-leg movement)
        │                        │               │ held until hold days pass ─► "Not collected" list
        │                        │               │      └─ a person: Release to shelf / Hold longer (once)
        │                        │               └─ Hand over (Law 9 identity) ─► supply; remaining −1 (RP-4)
        │                        └─ Send to a partner (network merge only; Law 5) ─► routed
        ├─ too_early ───────► waits at to_prepare, labelled with the date; clinic only if asked
        └─ none_left · expired · stopped · blocked (RF-4) · not_allowed
                             ─► renewal request (RN-1: open) ─► line goes to needs_clinic
                                   │ answered by a clinician who may prescribe (RN-2), first answer wins
                                   ├─ Renew: new prescription placed in the dialog; old authorisation ends (RN-3)
                                   ├─ Visit needed
                                   └─ Declined (signed reasons)
Nothing closes by itself (RF-5, RN-4, SA-3).
```

**Renewal requests in the doctor's workspace (P6 as found).** `LaneId` is a closed union, and `FlowTask` needs an `encounterId`. Step 4 therefore adds:

- a `renewals` lane id;
- a `FlowInput` source for open renewal requests;
- a branch in `lib/workspace/flow.ts` keyed `n:<renewalId>`, with no encounter.

This is D-PH4-24.

## 3. Holding (6.3)

- **The location kind.** A migration widens `pharmacy_locations.kind` (0180) with `prepared`. It adds the movement kinds `set_aside_out`, `set_aside_in`, `released_out` and `released_in`, using Phase 2's `pair_id` pairs. Phase 2 is merged, so SA-7's fallback is not used.
- **What held stock counts as.** Stock in `prepared` is excluded from availability, from the stock-out projection and from shelf counts. The order adds it back as "held".
- **How it moves.** Only by a person: hand over, release, hold longer (once), or quarantine on a recall.
- **The reversal.** This reverses Phase 1 E-PH1-03, D-PH1-31 and the "no patient is told a medicine is held" line, **for prepared refills only** (D-PH4-06).

## 4. The partner register, verification and agreement (6.5, 6.6)

**The organisation model (P8 and P9 as found).** There is no organisations table. `hospitals` is the tenant, `user_roles.hospital_id` is NOT NULL, and supplies reference `hospitals`. Two options:

| Option                                                                                           | For                                                                                              | Against                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) `partner_pharmacies` table**, with `partner_staff` (user, partner, `network.*` permission) | Hospital RLS, roles and approvals are untouched. A partner can never be mistaken for a hospital. | `pharmacy_supplies` gains a nullable `supplying_partner_id`, and `supplying_hospital_id` becomes nullable, with a CHECK that exactly one is set and that a partner supply has no stock keys (RT-5). Sign-up gains a partner branch. |
| (b) a `hospitals` row of a new level                                                             | Fewer schema changes                                                                             | Every hospital-scoped policy, list and report would see partners as hospitals. That is a privacy hazard (H4-15).                                                                                                                    |

**Recommendation: (a).** This is D-PH4-22.

**The register.** The register holds:

- the licence (number, class, expiry, document reference);
- the responsible pharmacist (name, registration, expiry);
- disclosed interests;
- status events.

Verification is append-only: what was checked, how, by whom, and confirmed by a second person (PN-4). "In force" is a projection evaluated at every routing and supply (PN-2), never a scheduled job. Re-verification falls due at the signed period or at licence expiry, whichever is earlier (PN-3).

**The verification standard (template; values signed later).**

- The documents seen:
  - the premises licence;
  - the responsible pharmacist's registration;
  - the superintendent's identity.
- Where a public register can be consulted, the date it was consulted and what it showed. None is known to exist (Appendix E), so the record says "documents seen" and **never "verified by the regulator"**.
- The verifier and the confirmer, who must be two different people with no disclosed interest.

**The agreement template (headings for the lawyer; D-PH4-10).**

- Parties: the hospital and the partner. MedSync is not a party unless the lawyer advises otherwise.
- Purpose and scope (refills, out-of-stock lines), with the routing list and any programmes (with their authority, D-PH4-05).
- The minimum data (Law 6), the lawful basis (legal question 3) and retention.
- No onward routing, marketing or re-use.
- Supply standards: pharmacist or supervised technician (s.32), paper presented (D-PH4-11), identity check.
- Breach notice, audit access, suspension, termination and records (s.40).
- Payment between the patient and the partner, with no MedSync record of price (D-PH4-13).

**Partner staff (P9 as found).**

- Clinical sign-up is hospital- and department-shaped. Step 6 adds a partner branch with the same council-anchored identity (`clinician_profiles`) and MFA.
- The affiliation goes into `partner_staff`, not `staff_affiliations`.
- The first user is confirmed by the MedSync verifier. After that, the responsible pharmacist approves staff (D-PH4-15). This is D-PH4-25.

## 5. Consent and the partner read (Law 6, RT-2, RT-6)

- **Consent** is one event per routing in `pharmacy_routing_consents`. It records:
  - who gave it: the patient, or a recorded proxy;
  - how: the app with the wording version, or the window, by a named staff member;
  - the partner, the lines and the time.

  Withdrawing consent before supply withdraws the routing (RT-7).

- **Wording.** Appendix B "Consent" and "Consent tick", draft.
- **The partner read.** `partnerLineView` returns exactly:
  - name, age, sex;
  - medicine, form, strength;
  - directions as written;
  - quantity;
  - prescriber name, cadre and council number;
  - hospital, pharmacy phone and routing reference.

  A schema test fails on any other field. There is no date of birth, phone number, MedSync number, diagnosis, other medicines or results.

- **Proxy (P13 as found).** The patient record has next of kin but no proxy or nominated collector. `patient_collectors` is added (name, relationship, phone optional, saved by the patient). This is D-PH4-26.

## 6. Annotated wireframes (boards 4.1 to 4.4, corrected per 5.12)

```
4.1 Patient · My medicines (web)                                       [Help]
  Metformin [strength]                     Next supply due around 3 Nov
    {n} more supplies allowed until {date}. Next review by {date}.
    [Ask for my next supply]
  Amlodipine [strength]   Your doctor needs to renew this before the next supply
    [Ask my clinic to renew it]
  Ceftriaxone             Not refilled without seeing a clinician
  ✗ board: "About 5 days left", quantities, strengths → only a recorded refill date; [strength]/[quantity] until signed

4.4 Where to collect
  The hospital: Main pharmacy (OPD) · Mon–Fri 8:00–17:00 (text from the hub)
  Partner pharmacies (district, then A–Z; interests disclosed)
    Example Pharmacy · Kawempe · opening times as text · "No interests disclosed"
  ✗ board: "Both in stock", price → removed; the partner accepts before the patient travels
  On choosing a partner: the consent paragraph, then the [ ] I agree to {Pharmacy} seeing this tick
  A line that cannot be routed: "Collect this one at the hospital" (the request is split)

4.2 Pharmacy · Refills   To prepare 4 · Needs the clinic 2 · Prepared, waiting 3 · Collected today 5 · Not collected 1 · With a partner 0
  Patient | Medicines | What the prescription allows          | Last supply              | Collect at | Collector | ·
  MS-…    | Metformin | {n} more supplies, ≥ {d} days apart, until … | 1 Oct · asked 2 days early | OPD       | Self      | [Prepare]
  Early/late: amber word and icon, never blocking. ✗ board: "Ran out about 12 days ago" → only from a recorded refill date

4.3 Partner · /network   Incoming · To supply · Supplied · Licence and staff
  Routed line: name, age, sex · medicine, form, strength · directions · quantity · prescriber + council no. · hospital, phone, ref
  [Accept (quantity)] [Decline: not in stock / cannot supply this product / other]
  Record supply: name said ☐ · DOB or phone typed (compared on the server) · paper presented ☐ · product, batch, expiry, quantity · explained ☐ · pharmacist
  ✗ board: "checked by MedSync … each year" → "Documents checked by MedSync on {date}"
```

Every patient, medicine, date and count above is an example.

## 7. The permission map, version 5 (Appendix A)

As in Appendix A of the prompt, with no change. There is no new `pharmacy.*` permission. The three `network.*` permissions (`admin`, `supply`, `record`) live on `partner_staff` (D-PH4-22). The MedSync network verifier is a superadmin role held by two people. Hospital admins and the pharmacy in charge co-own agreements.

## 8. Packs, strings and messages

- **Packs.** Every Appendix D pack is a template, **unsigned**. Nothing clinical is proposed: no maxima, intervals, hold days, windows or lists. While a pack is unsigned, its feature does what Appendix D's right-hand column says.
- **Strings.** Every Appendix B string, and the seven message kinds in 5.10, go into `content/pharmacy-network.ts` at Step 4 as `draft`. No `*_COPY_STATUS` is edited.
- **The regulator's name** is one string (D-PH4-19): "National Drug Authority" until commencement is recorded.

## 9. Decisions to sign

**From the prompt.** D-PH4-01 to D-PH4-21 and E-PH4-01 to E-PH4-04, as recommended in Section 14. **No clinical value is proposed.** D-PH4-09 still needs the verifier's name, and D-PH4-14 applies to any pharmacy Fadhul or MedSync owns.

**New, from STOP 0 (the repo wins):**

| #        | Decision                                                     | Recommendation                                                                                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-PH4-22 | The partner organisation model                               | Option (a): `partner_pharmacies` and `partner_staff`; a nullable `supplying_partner_id` on supplies, with an exactly-one CHECK. Partners are never `hospitals` rows.                                                                                                                                                                     |
| D-PH4-23 | Repeat quantity                                              | No structured quantity; each instance supplies the line's quantity as written or typed (Phase 1 D-PH1-15)                                                                                                                                                                                                                                |
| D-PH4-24 | Renewal requests in the doctor's workspace                   | A new `renewals` lane and flow source, with no encounter                                                                                                                                                                                                                                                                                 |
| D-PH4-25 | Partner staff sign-up                                        | A partner branch of clinical sign-up, council-anchored, with MFA; the verifier confirms the first user, then the responsible pharmacist approves the rest                                                                                                                                                                                |
| D-PH4-26 | Named collectors                                             | A new `patient_collectors` table; next of kin is not reused as a collector                                                                                                                                                                                                                                                               |
| D-PH4-27 | Not collected and the NCD recall list (P10: not wired today) | Step 5 adds a read of "not collected" refills to the recall list, behind `pharmacyRefills`                                                                                                                                                                                                                                               |
| D-PH4-28 | The patient medicines page is not Tide                       | Add the refill parts in the page's current design. Moving the page to Tide stays with the patient-web track.                                                                                                                                                                                                                             |
| D-PH4-29 | Signers                                                      | The prompt names four signers. Until the pharmacist reviewer and the pilot's pharmacy in charge are named, **the CSO signs alone by recorded exception for Steps 2 to 5 only** (ADR 0281 and D-PH3-26 precedent). Partner routing (Steps 6 to 8) has **no exception**: it needs the hospital's data-protection officer or legal adviser. |

## Signatures

| Item                                                                                                                 | Signer                                       | Signed                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| D-PH4-29 (CSO alone, by recorded exception, Steps 2 to 5 only; partner routing still needs the DPO or legal adviser) | Fadhul (CSO)                                 | Signed 26 Oct 2026, in session |
| D-PH4-01 to D-PH4-28, E-PH4-01 to E-PH4-04                                                                           | Fadhul (CSO)                                 | —                              |
| Permission map v5                                                                                                    | Fadhul (CSO)                                 | —                              |
| Hazard log (`hazard-log.md`)                                                                                         | Fadhul (CSO)                                 | —                              |
| Strings (Appendix B and 5.10), as draft                                                                              | Fadhul (CSO) + pharmacist reviewer           | —                              |
| Packs (Appendix D)                                                                                                   | As Appendix D                                | — (signed later, as content)   |
| Partner routing, consent wording, agreement template                                                                 | Hospital DPO or legal adviser + CSO          | —                              |
| Legal questions 1 and 2 (interim, written)                                                                           | Lawyer                                       | **Open**                       |
| 2026 Act commencement record                                                                                         | Lawyer or CSO, from the statutory instrument | **Open**                       |
| Partner verifier and second approver named                                                                           | Fadhul                                       | **Open**                       |
