# Claude Code Build Prompt — Symptom Catalog & Emergency Pathway (booking update)

### Companion to `docs/prd/PRD-SYMPTOM-CATALOG-EMERGENCY.md` (MS-PRD-SYM-001). Read the PRD in full before Phase 0.

> Owner instruction on 2026-09-21, superseding every "STOP" below: run all phases and gates on the builder's own
> recommendations; surface only the end product. Phase reports are written to `docs/recon/` instead of pausing.

---

## ROLE

You are a senior full-stack engineer and clinical-safety-minded product engineer working on **MedSync v3**, a Ugandan hospital OS (Next.js 16 web + Expo mobile). You are updating the **existing** booking system (patient workspace book-or-queue + scheduling engine). You are not building booking from scratch. You write production code, migrations, RLS, tests, and you verify with real checks.

## NON-NEGOTIABLE LAWS (violating any = stop and report)

1. **Engine-first.** No UI reads or writes data without real tables, real RLS, and passing tests. Build Phase 2 (engines) before Phases 3–5 (surfaces) consume them.
2. **Red `#DC2626` is a safety property.** Only in the allowlisted components listed in Phase 6. Extend the existing red-token invariant test; never use red decoratively. Saturated red/amber/green only for clinical signals.
3. **Clinical surfaces are permanently light.** No dark mode on any screen in this feature.
4. **No dosing, no drug names, no numeric vital thresholds** anywhere in patient-facing copy.
5. **Persistent emergency affordance** stays on every screen, logged in or out, web and mobile. You are changing its target, not its presence.
6. **Gate CG:** no mobile clinical write ships enabled until Fadhul signs the CSO governance artifact. Mobile symptom submissions and pre-alerts go behind flags defaulting **off in production**. Calling (`tel:`) is not a clinical write and ships on.
7. **Gate CS:** catalog, rules, first-aid cards and emergency contacts are clinical content. Seed them as `status: draft`. Non-prod renders a visible "Unsigned clinical content" watermark. Prod renders only `signed` content; if none is signed, prod shows the danger-sign strip and Emergency pathway using `verified` contacts only, and booking proceeds without the catalog.
8. **Security model:** RLS on every new table; PHI encrypted app-level with `lib/encryption.ts` (AES-256-GCM); sensitive writes through the existing server-function pattern (Zod + auth + role + PII-safe logging + audit); audit log append-only; middleware uses `getUser()`; superadmin has no routine PHI access.
9. **DPPA 2019 data minimisation:** nearest-facility computation happens on device; precise location is never sent unless the user explicitly chooses "Share my location with this hospital".
10. **TypeScript strict, no `any`.** Tokens only, no hardcoded colours/spacing. Reuse existing primitives before creating new ones.
11. **Tooling floor:** the project must still run from a clean clone with Node 22 + pnpm only. If any step needs other software (Docker, a native SDK, a paid service), **STOP and flag** before doing it.
12. **Pharmacy regulator is the Pharmacy Board of Uganda** (never PSU) if any copy touches pharmacy.

## WORKING PROTOCOL (every phase)

- **Stage 1 — self-refinement:** draft the plan/code → critique against the phase checklist → revise (max two passes).
- **Stage 2 — verification:** run the real checks listed for the phase → fix → re-run until green.
- **STOP** at the end of each phase with a report: what changed (files), check results **with numbers**, screenshots where required, open questions, and any deviation from the PRD with reason. Do not start the next phase until told "proceed".
- Record every non-obvious decision as a short ADR in `docs/adr/` (continue the existing numbering).

---

## PHASE 0 — Reconnaissance (read-only) → STOP

Produce `docs/recon/RECON-SYMPTOM-CATALOG.md` answering, with file paths:

1. **Data layer actually in use:** Supabase (Drizzle) or local-first Prisma + Better Auth + server actions, or a mix. Where migrations live. How RLS is expressed and tested on this stack (policies vs. server-side guards). Whether realtime exists (Supabase Realtime) or needs SSE/polling. **All later phases follow whatever is real here; do not introduce a second data layer.**
2. The persistent emergency affordance component(s) on web and mobile and every place they mount; its current target.
3. Book-or-queue flow: entry route(s), step components, how appointment creation is called, the urgent/same-day slot path in the scheduling engine.
4. Unified intake record + entry-points taxonomy: model, service function that creates intake, `awaiting_triage` status, how entry-point sub-types are enumerated.
5. Triage engine v2: discriminator identifiers (list them) so catalog items can reference them.
6. Clinical reasoning engine token catalog: token id format; whether `morning stiffness > 30 min` and stimulant/drug-use tokens exist.
7. Receptionist workspace: layout, panel/slot pattern, role guard, how realtime/refresh currently works.
8. Facility model + hospital setup wizard: where capability/profile fields live; admin edit path.
9. Reference-data pattern (how catalogs like cadres/facility levels are stored, versioned, seeded).
10. Design system: tokens file(s), red-token invariant test location and allowlist mechanism, icon set, bottom-sheet primitive on mobile, i18n setup (or absence).
11. Test harnesses available: unit (Vitest/Jest), web E2E (Playwright?), mobile (Jest + RNTL? Maestro/Detox?), axe, Lighthouse CI. Note anything missing — do not install new heavy tooling without flagging.
12. Feature-flag mechanism.
13. Risks/conflicts with the PRD you found (e.g. a missing model the PRD assumes).

**Checks:** none beyond accuracy. **STOP.**

---

## PHASE 1 — Clinical content package + classifier (pure, no DB) → STOP

Create `packages/clinical-content/symptom-catalog/` (or the repo's equivalent shared-package location found in Phase 0):

- `schema.ts` — Zod schemas for `CatalogItem`, `Qualifier`, `Category`, `RuleSet`, `EmergencyContact`, per PRD §6.2. Hard caps in schema: ≤ 8 items per category per audience view, ≤ 2 qualifiers per item, English label ≤ 9 words, `sourceRefs` required for tiers E and U.
- `catalog.v0.1.json` — encode **PRD Appendix A** exactly (all categories, audiences, tiers, qualifiers, flags, service-line hints, source keys). Map `triageDiscriminatorRef` to real discriminator ids from Phase 0 where a clean match exists; leave `null` otherwise and list unmapped items in the report. Same for `reasoningTokenRef`.
- `rules.v0.1.json` — PRD §5.3 rules R1–R7 as data.
- `contacts.seed.json` — PRD Appendix B with `verification_status` exactly as stated (912 = `unverified`).
- `classify.ts` — pure function `classify(input: SubmissionInput, catalog, rules) => { tier, reasons: ItemKey[], flags, trace }`. No I/O, no Date.now inside (inject clock).
- `i18n/en.json` — every label/helper/prompt as a key. No concatenated strings.
- `checksum.ts` + a build step that fails if JSON fails schema or checksum is stale.

**Tests (Vitest/Jest):**

- Golden table: one case per E item → E; each rule R2–R4 with positive and negative cases; audience modifiers (child < 2m fever → E; pregnancy fever + too weak → E; fever + bleeding → E with `isolation`).
- **Monotonicity property test** (fast-check or equivalent already in repo; if absent, flag before adding): for ≥ 10,000 generated submissions, adding any item or positive qualifier never lowers tier.
- Free text never changes tier.
- Schema caps enforced (a fixture with 9 items in a category fails).
- Every E/U item has ≥ 1 source key resolving in the source registry.

**Report numbers:** item count per tier and category, test count/pass, property cases run, unmapped refs. **STOP.**

---

## PHASE 2 — Engines: data, access, server functions, jobs → STOP

Using the data layer from Phase 0:

1. **Migrations** per PRD §9.2: `symptom_catalog_versions`, `symptom_catalog_items`, `symptom_submissions`, `emergency_pre_arrivals`, `emergency_contacts`; alter `facilities` (emergency_capability, pre_alert_enabled, emergency_entrance_directions, emergency_sms_number, ambulance_number) and `appointments` (presenting_symptoms, symptom_tier, symptom_submission_id). Add entry-point sub-type `self_presentation_prealerted` via the existing enumeration mechanism.
2. **Encryption:** `free_text_enc`, `callback_phone_enc`, `location_enc` via `lib/encryption.ts`.
3. **Access rules** per PRD §9.3 (RLS policies or the stack's equivalent). Emergency-contact writes require four-eyes using the existing four-eyes wiring.
4. **Server functions** per PRD §9.4. `createPreArrival`: Zod-validate; rate-limit (3/h/device hash, 5/day/phone hash; hashes salted, never raw); set `verified` from auth; return a one-time reporter capability token (store only its hash). `markArrived` must call the **existing intake service**, not duplicate it; intake gets `awaiting_triage`, chief complaint from items, priority flag, and link back to the pre-arrival.
5. **Status machine** for pre-arrivals: `sent → seen → ready → arrived`; `sent|seen|ready → cancelled|not_arriving|hoax|expired`. Illegal transitions rejected server-side with tests.
6. **Outbox:** if a notification outbox exists, write `pre_arrival.facility_sms` rows with `awaiting_notifications_engine`; if not, create a minimal `notification_outbox` table (RLS: no client access) and ADR it. Nothing reports these as sent.
7. **Jobs:** expire non-arrived after 6 h; null `location_enc` after 72 h; nightly signed-version integrity check. Use the repo's scheduled-job mechanism; if none exists, flag.
8. **Seed:** catalog v0.1 (draft), contacts (with statuses), Mulago seed facility set to `emergency_capability = 24h`, `pre_alert_enabled = true` in dev only.
9. **Audit** every event listed in PRD §9.6.

**Checks:**

- Access probes (automated): patient A cannot read patient B's submission; facility X staff cannot read facility Y pre-arrivals; superadmin PHI read denied; unauthenticated token reads only its own row and can only cancel; anon cannot insert directly (only via server function); non-four-eyes contact write rejected.
- Status-machine tests; rate-limit tests; encryption round-trip; audit rows asserted.
- `pnpm typecheck`, lint, full test suite green.
  **Report numbers.** **STOP.**

---

## PHASE 3 — Patient symptom catalog UI (mobile first, then web) → STOP

Wire into the existing book-or-queue flow as a pre-step (skippable only via "I'm coming for a review / follow-up"). Behind flag `FEATURE_SYMPTOM_CATALOG` (mobile default off in prod per Gate CG; web default off in prod until CS signed).

**Screens** (PRD §7.2): S1 landing (audience selector, search, danger-sign strip, 3×4 category grid, selection tray), S2 category sheet (bottom sheet mobile / right pane web), S3 inline qualifiers, S4 review & outcome.

- U outcome: call the scheduling engine's existing urgent/same-day path; if no same-day slot, offer "Join today's queue"; always show the Emergency fallback line.
- R outcome: service-line hint → existing calendar; optional encrypted free text (≤ 500 chars).
- E selection: open the Emergency sheet immediately (Phase 4 provides it; in this phase stub the route with a clearly marked placeholder **inside dev only** — the placeholder must still expose working `tel:112`).
- "This is not happening now" path logs `emergency_declined`.
- Persist `presenting_symptoms`, `symptom_tier`, `symptom_submission_id` on the appointment/queue entry.

**Layout rules:** height budget per PRD §7.2; no nested scroll; no horizontal carousels; tap targets ≥ 48dp; icons always with words; tier word always rendered (never colour-only); supports 200% font scale by reflow.
**Offline:** catalog bundled; classification local; submission queued with retry when offline.
**Search:** local fuzzy match over labels + synonyms; zero-result state per PRD §7.4; log anonymised zero-result terms (no user id) for catalog-gap review.

**Checks:**

- Screenshot matrix: 360×640, 360×740, 390×844, 768×1024, 1280×800 for S1–S4, audience = adult, child 2m–5y, pregnant. Attach them.
- Navigation-budget E2E: assert any item reachable in ≤ 3 interactions from S1; assert S1 fully visible without scroll at 360×740.
- Unit/component tests for tray, qualifier escalation, emergency interrupt, declined path.
- axe: 0 serious/critical.
  **Report numbers + screenshots.** **STOP.**

---

## PHASE 4 — Emergency Pathway (patient side) → STOP

Replace the persistent affordance's target with the real flow (web + mobile, logged in and out).

- **E1 Emergency sheet** (PRD §8.2): full screen, no scroll at 360×640. Primary call = highest-priority `verified` contact for the user's district (fallback national 112); up to 3 secondary numbers each labelled by kind. `tel:` links. Log `call_tapped` with contact id only. Optional "What's happening?" tiles when entered from the pill. First-aid slot behind `FEATURE_FIRST_AID_CARDS` (off).
- **E2 Pre-alert** (PRD §8.3): all defaults pre-filled so Send is reachable in two taps. Nearest facilities computed **on device** from a cached, non-PHI facility list (name, coordinates, capability, pre_alert_enabled, phone, directions). Non-MedSync or non-enabled facilities show "Call only". Stroke flag prompts "When were they last normal?". Location sharing is an explicit, one-time, per-alert toggle, default off. Behind `FEATURE_PRE_ALERT` (mobile off in prod per Gate CG).
- **E3 Status** (PRD §8.4): realtime/polling status; directions and phone; Cancel; "We've arrived"; **ack timeout** (config, default 5 min) → "We couldn't confirm…" + call + SMS fallback.
- **SMS fallback:** `sms:` deep link to the facility's `emergency_sms_number` with a compact pre-filled body (≤ 160 chars: tier, top danger sign, ETA band, transport, callback). Only shown if the facility has the number.
- **Special routes:** crisis route and sexual-violence route per PRD §5.5 — calm screens, no red, no alarm haptics, no data collection beyond what the user chooses.
- Reduced motion: no pulsing. Haptic on emergency interrupt (mobile).

**Checks:**

- E2E: pill → call ≤ 2 interactions on every route (route-walk test enumerating all app routes, logged in and out).
- E2E: pill → pre-alert sent ≤ 2 interactions after E1 with defaults.
- Offline test: network disabled → E1 renders, `tel:` works, pre-alert shows queued + SMS fallback.
- Screenshot matrix for E1–E3 and both special routes.
  **Report numbers + screenshots.** **STOP.**

---

## PHASE 5 — Hospital receiving side (receptionist workspace) → STOP

Add an **Incoming** panel to the receptionist workspace (and make it available to triage/ED roles at the same facility via the existing role guard).

- Realtime subscription filtered to the user's facility (respecting access rules); polling fallback if Phase 0 found no realtime.
- Card per PRD §8.5: red "Incoming emergency", ETA band, transport, subject descriptor, danger signs (lay + clinical label from triage discriminator), `isolation` banner, stroke last-known-well, callback tap-to-call, verified/unverified badge.
- Actions: Acknowledge, Ready, Call, Arrived (→ `markArrived` → intake `awaiting_triage` with priority flag; open the intake in the existing reception flow), Not arriving, Hoax.
- Configurable chime; badge persists until acknowledged; > 2 min unacknowledged → escalated visual state for all board viewers at that facility.
- **Hospital admin settings:** minimal fields in the existing hospital profile/setup area to set `emergency_capability`, `pre_alert_enabled` (requires naming a board owner per shift — store as a required text/user reference), directions, emergency SMS number, ambulance number (ambulance number enters `emergency_contacts` as facility-scope, `unverified` until four-eyes verified).

**Checks:**

- E2E two-browser test: patient sends pre-alert → board shows card < 3 s (realtime) or < poll interval → Acknowledge → patient E3 shows "Seen" → Arrived → intake exists with `awaiting_triage`, entry point `self_presentation_prealerted`, linked pre-arrival.
- Access probe: a receptionist at facility Y never sees facility X's card.
- Hoax marking increments device/phone hash counter; downgrade path tested (calling never blocked).
  **Report numbers + screenshots.** **STOP.**

---

## PHASE 6 — Hardening, invariants, docs → STOP

1. **Red-token invariant:** extend the allowlist to exactly: Emergency pill, emergency-tier row marker, E1/E2/E3 primary actions and header, Incoming card, emergency interrupt banner. Test fails on any other use. Crisis and SV routes must contain no red.
2. **Accessibility:** axe on every new screen (0 serious/critical); screen-reader pass notes (VoiceOver/TalkBack labels include tier words); 200% font scale screenshots for S1 and E1.
3. **Performance (web):** Lighthouse mobile on S1 and E1 — accessibility ≥ 95, performance ≥ 85; E1 JS kept minimal (lazy-load nothing on the emergency route; it must be interactive fast). Report LCP/TBT.
4. **Security:** re-run all access probes; confirm no PHI in logs (grep test on log output during E2E); rate limits verified.
5. **Flags matrix documented:** which flags are on/off per environment and which Gate (CG, CS) unlocks each.
6. **Docs:** update PRD "Status" to Implemented-behind-flags; ADRs; `docs/runbooks/emergency-contacts-verification.md` (quarterly re-verification of numbers, including 912 status); `docs/runbooks/pre-alert-facility-onboarding.md` (board owner per shift, test alert, go-live checklist).
7. **Handover list for Fadhul (Gate A/CS/CG):** list every item still `draft`/`unverified` and every flag held off, mapped to PRD §13.

**Final report:** all numbers (tests, probes, property cases, Lighthouse, axe, navigation-budget results), screenshot index, open risks. **STOP.**

---

## DEFINITION OF DONE

- All PRD §14 acceptance criteria met with evidence.
- No emergency-tier path can end in routine booking without a logged explicit decline.
- Calling works on every screen, offline, logged out.
- Nothing claims an SMS/alert was delivered unless a human at the facility acknowledged it.
- Clinical content remains `draft` until Fadhul signs; production is safe in that state.
