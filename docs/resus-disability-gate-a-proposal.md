# Resus · DISABILITY step — GATE A proposal (clinical sign-off)

**Status:** Proposed — **awaiting CSO sign-off before any build.** The clinical content is the **CSO-supplied catalog** ([`docs/clinical/resus-disability-clinical-catalog.md`](clinical/resus-disability-clinical-catalog.md), committed verbatim, encoding normalised). This is the engineering proposal + reuse confirmation; **GATE A is a clinical gate — B–E are NOT built yet.**
**Scope:** the **Disability (D)** step — disability's **findings → neuro-state + suspected-cause → triggered-actions → action-states**, built by **reusing the Airway/Breathing/Circulation engine + visual system** with neurological-emergency medicine; D's drugs route through the **smart prescribing tool**. Record + decision-support + escalation now; full SE second/third-line, stroke-pathway, ICP-monitoring/osmotherapy, RSI _procedural_ tooling + paediatric-GCS/weight + obstetric depth deferred (§C).

> **Honesty posture.** **No new web-verification pass has been run for this GATE A** (it is the clinical-model proposal). The clinical reasoning is the CSO's signed catalog; **D's drugs route through the prescribing tool already web-verified 2026-06-03** — glucose, glucagon, naloxone, the seizure benzodiazepines, flumazenil are all present and verified there. **The one NEW dose D needs — the eclampsia magnesium regimen — is NOT yet in the catalog and must be added + web-verified + CSO-signed at GATE C** (it is a distinct regimen from the arrest 2 g / asthma 1.2–2 g entries; never a remembered dose). Thresholds (GCS≤8, glucose <3.0/<4.0, status ≥5 min) are the catalog's; re-verified at build.

---

## Preface — reuses the A/B/C pattern (no rebuild)

D **reuses** the findings→action→state engine, the action-state lifecycle (`indicated/in_progress/performed/not_indicated/deferred/failed`, `failed`→escalation), the severity colour + action-state tokens + the step bar, and the urgency-ordered display ([ADRs 0048–0050, 0053](adr/0053-resus-circulation-findings-action-engine.md)) — populated with disability content. Mirrors `lib/resus/circulation.ts` + `circulation-catalog.ts` as `lib/resus/disability.ts` + `disability-catalog.ts`, and `disability-panel.tsx` mirroring the circulation panel. **No new migration** — findings/actions are step-`D` timeline events (`step: "D"`), exactly as C is `step: "C"`.

## A. Clinical model

### A.1 — Two outputs (mirrors C's severity + type)

- **Neuro-state** (severity, worst-finding-wins): `alert → mild_moderate_impairment → severe_impairment_coma (GCS≤8) → active_seizure_status → raised_icp_herniation`. **A normal GCS total must never downgrade** a recorded seizure / raised-ICP / fixed-pupil sign (mirrors C's "normal BP never downgrades shock"). `classifyDisability(fs)`.
- **Suspected cause / syndrome** (`identifyNeuroSyndrome`, the action-driving axis — because the cause determines the reversible-first action): `hypoglycaemia → opioid_toxicity → status_epilepticus → eclampsia → raised_icp_herniation → stroke → meningitis_encephalitis → dka_hhs → non_convulsive_status → secondary_to_abc → undifferentiated`. Ordered reversible-first + catastrophic (glucose always considered first).
- **The D-distinctive element: GCS.** Unlike A/B/C, D computes a **GCS total from its components** (eye /4 + verbal /5 + motor /6, "T" when intubated) and shows the **serial trend** (successive step-D assessment events — a _falling_ GCS is the danger signal + a return-to-A trigger). The trend IS the monitoring.

### A.2 — Findings (catalog §1)

Headline **neuro-state** + **conscious level** (AVPU; **GCS components + serial trend**) + **pupils** (size / equality / reaction) + **GLUCOSE value** + **focal deficit + onset time** + **seizure activity + duration** + **posturing** (decorticate/decerebrate) + **meningism** + the **cause-screen** differential. Discrete signs are finding codes (e.g. `pinpoint_pupils`, `unequal_pupil`, `fixed_dilated_pupil`, `cushings_triad`, `focal_deficit`, `active_seizure`, `decorticate`, `decerebrate`, `meningism`); numeric/structured data (GCS components, glucose mmol/L, pupil size, onset time, seizure duration) are D-specific fields (§B). Context flags: `opioidsSuspected`, `pregnancyPostpartum` (eclampsia), `headInjury`, `alcoholMalnourished` (thiamine/Wernicke's), `feverMeningism`, `abcAbnormal` (reduced GCS likely secondary), `noPulse`.

### A.3 — Actions (catalog §2)

- **Tier 1 baseline:** re-confirm/optimise A-B-C, **CHECK GLUCOSE NOW**, high-flow O₂/perfusion, position/protect airway, continuous monitoring (incl. GCS trend), IV access, **GCS≤8 → back-to-A → prepare definitive airway**, serial GCS + pupils.
- **Tier 2 cause-specific:** hypoglycaemia → **IV glucose / IM glucagon + recheck**; opioid → **naloxone + ventilate (back to B)**; status → **FULL-dose benzodiazepine → second-line → anaesthesia/EEG**; raised ICP → **neurosurgery + CT + head-up + osmotherapy**; stroke → **CT + stroke pathway**; eclampsia → **magnesium (not benzo-first)**; DKA/HHS; meningitis → **don't-delay antimicrobials**; flumazenil cautiously.
- **Tier 3 advanced (skilled operator, record + escalate):** definitive airway (RSI), neurosurgery/EVD/ICP-monitoring, thrombectomy, EEG + anaesthesia for refractory status, ICU.
- **Drug actions route through the prescribing tool** — new `d_*` codes in `RECOMMENDATION_DRUG_MAP` (none exist yet; added at GATE C). Doses are NOT duplicated here.

### A.4 — The traps (to be enforced in `triggeredActions` + the colour/guard)

1. **⚠️ "DON'T EVER FORGET GLUCOSE"** — a **missing glucose** in any reduced-consciousness patient is a **prominent flag** (like ESI's missing-vital), and **"check glucose" is pinned at/near the top** of the action ordering whenever consciousness is reduced.
2. **Reduced GCS is usually A/B/C** — the engine surfaces **re-confirm/optimise A-B-C** before attributing to a primary neuro cause (`secondary_to_abc` when `abcAbnormal`).
3. **GCS ≤8 → back to A → definitive airway** — enforced as a return-to-A trigger in `disabilityProceedGuard` + a back-to-A flag.
4. **Cushing's (HTN + bradycardia + irregular breathing) = raised ICP / herniation** — classifies `raised_icp_herniation`; the action rationale states **do NOT treat the hypertension as primary.**
5. **Benzodiazepine — FULL guideline dose, don't underdose** (the dominant real-world SE error) — the prescribing tool presents lorazepam 4 mg / midazolam 10 mg (the full first-line dose), not a timid one; the engine never nudges toward underdosing.
6. **Eclampsia → magnesium FIRST** (not a benzodiazepine) — seizure + `pregnancyPostpartum` routes to magnesium, not the benzo-first status path.
7. **Falling GCS → return-to-A + neurosurgical-emergency** (the serial trend drives it).
8. **Non-convulsive status** — seizure stopped but not waking → escalate/EEG.
9. **Pinpoint pupils + low RR + reduced GCS → opioid** → naloxone + back to B.

These map to the severity colour (GCS≤8 / active-seizure / raised-ICP / fixed-pupil = critical-red), urgency ordering (glucose pinned; life-threats at top; `failed`→top), and treat-before-proceeding (gate E) + GCS≤8→return-to-A.

### A.5 — Drug coverage + gaps (the honest audit)

**Already in the verified prescribing catalog (cover hypoglycaemia / opioid / status / benzo-toxicity):** `glucose_iv`, `glucagon_im`, `naloxone_iv`, `lorazepam_seizure_iv` (4 mg, controlled, 2-dose cap), `midazolam_seizure_buccal` (10 mg, controlled, 2-dose cap), `flumazenil_iv` (category, `needs-CSO-verification`). All web-verified 2026-06-03.

**Gap that MUST be added + verified at GATE C (a named trap):** **eclampsia magnesium** — the existing magnesium entries are arrest (2 g) and asthma (1.2–2 g); eclampsia is a **distinct regimen** (loading + maintenance per obstetric protocol). A new catalog entry is required, with the dose **web-verified + CSO-signed at build** (highest-risk content — never a remembered dose).

**Gaps deferred to record + escalation now (per kickoff §5), full dosing tooling later:** second-line anticonvulsants (levetiracetam / valproate / fosphenytoin), osmotherapy (hypertonic saline / mannitol), thiamine (Wernicke's), optional diazepam (PR alternative). These surface as **record-capable actions + escalation prompts** now; exhaustive workflows are later sub-modules.

## B. Schema (no new migration)

Reuse the findings/actions/states timeline model (step `D`). **D-specific finding-set fields** on the `assessment` payload (`payload.disability`):

- `state`: headline `DisabilityState | null` (gestalt; engine upgrades).
- `gcs`: `{ eye: 1–4, verbal: 1–5, motor: 1–6, intubated?: boolean }` → `gcsTotal` computed; **serial trend** derived from successive step-D assessment events (no new field — the trend is the record, like reassessment).
- `avpu`: `"A" | "V" | "P" | "U"` (rapid alternative).
- `pupils`: `{ left: { sizeMm, reaction }, right: { sizeMm, reaction } }` (or `{ sizeMm, equal, reaction }`).
- `glucoseMmol`: `number | null` (null + reduced consciousness → the **mandatory-glucose** flag).
- `present`: string[] of discrete finding codes; `context`: the flags in §A.2.
- focal deficit + `onsetTime`, `seizureDurationMin`, `posturing`, `causeScreen[]`.

Recorded payload also stores `neuroState` + `suspectedCause` + `gcsTotal` + `mandatoryGlucoseMissing`. Findings via a new `recordDisabilityFindings`; action/procedure states via `setDisabilityActionState`; **drug administrations via the existing `recordEmergencyAdministration`** (the prescribing tool). All append-only/timestamped/versioned, linked to the encounter; serial GCS = successive immutable assessment events.

## C. Scope / deferrals

- **Now:** findings + neuro-state + GCS (components + serial trend) + suspected-cause, the cause-driven action engine + the traps, action-state lifecycle (`failed`→escalation), the inherited urgency-ordered display (glucose pinned, surfacing-not-filtering), treat-before-proceeding gate to E, **GCS≤8→back-to-A**, reassess (GCS/pupils/glucose) prompts, falling-GCS→return-to-A, one-tap escalation + return-to-A/B/C/D, no-pulse→arrest stub, drugs via the prescribing tool (+ the new eclampsia-magnesium entry, CSO-verified).
- **Deferred (record + escalation only, flagged):** full SE second/third-line algorithm, detailed stroke-pathway/thrombolysis workflow, ICP-monitoring/osmotherapy protocols, RSI procedural tooling; paediatric (paediatric-GCS + weight-based glucose/benzo/naloxone + febrile-seizure) + obstetric depth.

## D. Build order (B–E built only after this sign-off)

- **[GATE A]** model + reuse + scope + schema + the honest drug audit (this doc). **← you are here. Stop for CSO sign-off.**
- **[GATE B]** disability findings capture + neuro-state classification + **serial-GCS** + severity colour + the mandatory-glucose flag (TDD).
- **[GATE C]** cause-driven findings→action engine + the traps + the inherited state lifecycle + urgency ordering + the prescribing-tool link (**+ add & web-verify the eclampsia-magnesium catalog entry, CSO-signed; new `d_*` codes**) (TDD).
- **[GATE D]** panel (GCS/serial-trend + pupil display + neuro-state chip) + desk wiring + GCS≤8→back-to-A + treat-before-proceeding gate to E + reassess prompts + arrest stub.
- **[GATE E]** adversarial clinical-safety review (fix-then-ship) + the traps' scenario tests + ADR (disability findings→action + serial-GCS + D-specific fields) + CHANGELOG + all tests/build green. **Stop for CSO sign-off.**

---

### What I need from you at this gate (CSO sign-off)

1. **The clinical model** — neuro-state ladder + the cause/syndrome list + the GCS-component/serial-trend approach (§A.1–A.2).
2. **The traps** (§A.4) — especially glucose-always, reduced-GCS-is-ABC, GCS≤8→A, Cushing's=raised-ICP-don't-treat-BP, **benzo-full-dose**, **eclampsia=magnesium-first**.
3. **The drug audit** (§A.5) — OK to add the **eclampsia-magnesium** entry at GATE C (web-verified, you sign the dose), and to treat second-line anticonvulsants / osmotherapy / thiamine as record+escalation deferrals?
4. **Scope** (§C) — record + decision-support + escalation now; the deep SE/stroke/ICP/RSI tooling + paediatric/obstetric depth deferred.
5. **Reuse** — confirm D reuses the A/B/C engine + state lifecycle + severity/action-state colour + urgency ordering (no rebuild).

On your sign-off (and a "go through all gates" / "build everything" instruction if you want B–E in one pass, as with C), I'll proceed — TDD per gate, the eclampsia-magnesium dose web-verified for your sign-off, an adversarial clinical-safety review before the PR, and a stop at GATE E.
