# Clinical Suggestions + Living Workspace — GATE A: plan, evidence-sourcing & CSO sign-off list

> **Status:** GATE A deliverable — plan + sourcing discipline + the CSO-sign-off list, for review. **No code built; no clinical content fetched/encoded yet.** Per the kickoff, the build (GATE B) does **not** start until **Fadhul (CSO)** signs the clinical content plan below. The whole initiative **extends the existing engines** (reasoning / triage / prescribing / exam / vitals); only the _content_ is the fetched-and-signed part.
> **Sign-off needed:** **Fadhul (CSO)** — the sourcing map + the first-tranche content list (§6); confirms the fetch-cite-version-stamp discipline (§4) and the UX (§5).

---

## 1. The two goals

- **A — Suggestions (headline):** close the **planning-layer gap**. Turn what the tool already knows (live differential, triage pathway, vitals, exam patterns, PMH) into **optional, sourced, confidence-tagged, tap-to-accept, overrideable, audited** suggestions for **investigations → management → disposition → safety-netting**. **Pre-fills nothing.**
- **B — Living workspace:** faster + safer on a busy ward + low-end device — capture speed (W2), no-lost-work autosave/offline (W3), continuity (pending-investigations + results-callback, re-clerking, cross-encounter trends, sticky reasoning rail) (W4).

## 2. Hard boundaries (non-negotiable — carried into every gate)

- **Decision-support, NEVER autonomous.** Nothing recorded until the clinician accepts. No auto-diagnosis, no auto-prescribe, no silent pre-fill.
- Every suggestion **sourced (guideline + threshold) + confidence-tagged + overrideable + audited**; **bias to over-safety; a must-not-miss is surfaced even at low probability and never dropped.**
- **Drug doses ONLY via the prescribing safety engine** (web-verified + CSO-signed). The Plan layer proposes **agent/class + hands off** — it **never carries a dose.**
- **Every clinical assertion is fetched from a current primary source + cited + version-stamped + CSO-signed at build — NEVER from memory** (§4). Staleness is a safety defect.
- **No fabricated data; "not done" ≠ normal; append-only + versioned + cadre-stamped + RLS + audited** (reuse the encounter spine — no parallel store).
- **Extend** existing engines — no duplicate logic. **Both themes; offline-friendly; WCAG 2.2 AA;** grounded in `DESIGN-medsync.md` + the shipped exam-kit + motion vocabulary; clinical-red reserved; no left-edge accents.

## 3. Architecture — what exists (extend, don't rebuild)

| Capability                                                                                                                                                 | Lives in                                            | Status for this build                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Live differential / must-not-miss / discriminators / exam-targets / red-flags / diagnostic-pause                                                           | `lib/clerkship/reasoning/*` + `reasoning-panel.tsx` | **Reuse** — the suggestion engine reads its output                 |
| Per-exam pattern/cluster recognition                                                                                                                       | `lib/clerkship/exam/* matchXPatterns`               | **Reuse** as a driver                                              |
| Triage recommendations — disposition / pathway / escalation / immediate-measures / monitoring / **investigations** (each sourced + rationale + confidence) | `lib/triage/recommend.ts`                           | **Reuse + surface** — computed today but **not shown in the Plan** |
| Prescribing catalog + 6 safety checks + crash-cart (web-verified, CSO-signed doses)                                                                        | `lib/prescribing/*`                                 | **Hand-off target** for any drug in a pathway                      |
| Vitals NEWS2 / PEWS / MEOWS + danger flags                                                                                                                 | vitals engine                                       | **Reuse** for disposition cross-check                              |
| Append-only versioned `clinical_documentation`; **`encounterOrders` + `encounterResults` (exist, no UI)**                                                  | `db/schema/encounter*` + the spine                  | **Reuse** — W4 builds the UI on these                              |
| Clerkship Plan step — investigations (kind/text/LOINC/justification rows), management (free-text), disposition (dropdown), safety-netting (free-text)      | `clerkship-form.tsx`                                | **The gap** — currently manual; suggestions feed these             |

**The gap:** Assessment differential is manual text + ICD-10; the whole Plan is essentially free-text. The tool _knows_ a lot at that point but offers nothing. W1 closes this.

## 4. Evidence-sourcing discipline (the heart of GATE A)

Per `clinical-suggestions-evidence-sourcing-reference.md`, **every clinical assertion** in the suggestion layer is:

1. **Fetched at build** from a current primary source (issuing body + **Uganda national** where it exists/differs) — never an LLM's memory, never a secondary blog.
2. **Encoded as a cited constant** — the assertion stored _with_ `{source name, version/year, the specific recommendation, retrieval date}`. No un-sourced clinical claim in the codebase.
3. **Version-stamped** — each pathway / investigation-set carries the guideline version it was built from; staleness is visible.
4. **CSO-signed** — Fadhul reviews + signs each set before it ships (GATED migration or code-module, never auto-applied).
5. **Doses excluded** — agent/class only; the prescribing engine owns doses.
6. **Re-verified on a cadence** — the version-stamp drives a scheduled re-check (wired in GATE D).

**Why (the staleness proof):** three of the most common Ugandan-ward emergencies each moved since 2021 — **sepsis → SSC 2026**, **malaria → WHO 13 Aug 2025**, **DKA → 2024 ADA/EASD/JBDS consensus** (β-hydroxybutyrate criteria + SC-insulin pathway). From-memory content would already be a version stale.

**Which-source flagship map (verify live at build):** Sepsis adult → **SSC 2026**; Sepsis paeds → **Phoenix (SCCM 2024)**; DKA → **2024 ADA/EASD/JBDS consensus**; Malaria → **WHO 13 Aug 2025 + Uganda national** (IV/IM artesunate; <20 kg = 3 mg/kg; **FEAST paediatric-fluid guardrail**); Asthma → **GINA 2025**; COPD → **GOLD 2025**; ACS → **ESC 2023**; Stroke → **AHA/ASA + local referral reality**; Anaphylaxis → **WAO/resus council** (IM adrenaline via prescribing engine); AKI → **KDIGO**; Hypertensive emergency → **ESC/ACC-AHA**; UGIB → **NICE CG141 (Glasgow-Blatchford)**; Meningitis/febrile, TB, HIV → **WHO + Uganda national**. **Uganda Clinical Guidelines / MoH throughout; FEAST encoded as a guardrail, not a footnote.**

## 5. Exact UX (what a suggestion looks like)

- A suggestion appears in its Plan sub-section (Investigations / Management / Disposition / Safety-netting) as an **optional, dismissible card/row** that shows: **what** (the test/action/agent-class), **why** (the driving differential / triage pathway / vital / exam pattern), **source + version**, and a **confidence** tag (high / medium / needs-CSO-input).
- **Tap-to-accept** → records it into the existing capture (investigations row / management item / disposition / safety-net text) — the acceptance is **audited**. **Override / dismiss** → records the divergence (audited).
- **Must-not-miss investigations/actions are always surfaced** (even at low differential probability) and visually distinct (reserved-red, per the design system) — bias to over-safety.
- **Disposition** pre-suggests from triage acuity + NEWS2/PEWS/MEOWS + red flags, and **flags when the clinician's choice diverges** (overrideable) — it does not invent a new scale.
- **Drug items** render as agent/class chips that **open the prescribing tool** (which carries the dose, safety checks, CSO-signed) — never a dose in the suggestion.
- Honest empty/uncertain states; nothing pre-filled; **not-done ≠ normal**.

## 6. CSO sign-off list (Fadhul signs before GATE B/C ship)

**First tranche (GATE B — suggested investigations exemplar):** the investigation sets for the highest-frequency presentations, each fetched + cited + version-stamped:

1. Chest pain → ACS workup (ESC 2023)
2. Sepsis / febrile-unwell → cultures + lactate + … (SSC 2026) **+ Uganda febrile/malaria overlay**
3. Suspected DKA / hyperglycaemia → glucose / ketones (β-OHB) / VBG / U&E (2024 consensus)
4. Breathlessness → asthma/COPD/HF workup (GINA/GOLD 2025)
5. Suspected stroke → glucose + imaging pathway (AHA/ASA + local)
6. Severe malaria workup (**WHO Aug-2025 + Uganda national**)
   Each test: rationale + source + confidence + **LOINC where known**; **Uganda core-vs-context honesty** (essential first; context-dependent marked; never assume availability).

**Later tranches (GATE C):** management pathways (sepsis, DKA, asthma, severe malaria incl. **FEAST guardrail**, …) — agent/class hand-off to prescribing; disposition cross-check; safety-netting templates. Each pathway version-stamped + CSO-signed.

## 7. Data model

- **Reuse the spine:** suggestions write through the existing capture (investigations rows / management / disposition / safety-netting) → `clinical_documentation` (append-only, versioned, cadre-stamped, RLS, audited). **No parallel store.**
- **W4 reuses `encounterOrders` / `encounterResults`** (already in schema) for the pending-investigations + results-callback UI — no new tables.
- **Suggestion content** (investigation sets, pathways, safety-net templates as cited constants) ships as **either a code-module** (reference data, like the reasoning maps) **or a GATED migration** — CSO-signed, never auto-applied. The acceptance/override **audit** reuses the existing audit log. **No new clinical data model for what's captured.**

## 8. Workstreams + build order (W1 first; stop between)

- **[GATE B]** W1 **suggested investigations** end-to-end for the first-tranche presentations (§6) — wired to the live reasoning + triage engines; fetched + cited + version-stamped + CSO-signed; tap-to-accept + override + audit; must-not-miss always surfaced; LOINC where known; Uganda core-vs-context. Verify safety + parity + a11y + both themes + offline. **Stop.**
- **[GATE C]** rest of W1 (management pathways → prescribing hand-off; disposition cross-check; safety-netting), then **W2** (capture speed: jump-to-tab, arrow-cycle + Enter, rest-normal/all-ROS-negative, copy-bilateral, typeahead ICD-10/LOINC — coordinate with the shipped exam-kit), **W3** (autosave + offline-resilient drafts + honest save-state), **W4** (pending-investigations/results-callback, re-clerking/ward-round follow-up, cross-encounter trends, sticky rail). Each its own slice; stop between.
- **[GATE D]** polish / perf / a11y / clinical-content-parity audit / version-stamp + re-verification cadence wired / ADR / CHANGELOG. **Stop for review.**

## 9. Confirmations & flags

- ✅ **Extends** existing engines; **no new captured-data model** (suggestion content is signed reference data; W4 reuses encounterOrders/results; audit reuses the spine).
- ✅ **Decision-support never autonomous**; doses only via the prescribing engine; must-not-miss never dropped; **all clinical content fetched + cited + version-stamped + CSO-signed, never from memory**; FEAST guardrail; re-verify on cadence.
- ⚠️ The cross-exam **shared-parameter QC sync** (PR #119, docs-only) is still unbuilt — W1 does not need it (it reads the live reasoning/triage output + the existing per-exam state).
- ⚠️ Coordinate with the just-shipped **Examination UI v2** (PR #123) + the live reasoning rail + the encounter spine.
- ⚠️ Font note (recurring): repo ships **Fraunces / Geist / Geist-Mono** (DESIGN-medsync.md still names Neue Haas) — follow the repo.

**STOP — GATE A. Awaiting Fadhul's clinical sign-off of the sourcing map + the first-tranche content list before GATE B begins.**
