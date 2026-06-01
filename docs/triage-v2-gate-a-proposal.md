# Smart Triage Engine v2 — GATE A: guideline currency + clinical model

**Status:** CSO-approved to proceed through all gates (2026-05-31, "do everything, go through all gates"). This document + the ADRs are the clinical-safety artifacts; the guideline-currency table below is the sign-off surface.
**Branch:** `feat/triage-engine`
**Clinical sources:** verified at build against primary sources (Part 0) — see table.

> v2 reworks the shipped v1 triage engine to top-tier on three axes: medical accuracy anchored to **current verified guidelines**, a **clinically operative UX**, and **Attio-grade craft**. v1 is architecturally sound and reused; v2 adds the five gaps below.

---

## §1 — Guideline currency table (verified at build, 2026-05-31)

Each tool re-verified against its primary source this build. Thresholds are encoded as engine **constants (facts), with the source cited** — no copyrighted chart artwork is copied into the repo.

| Tool                 | Version                                          | Current?                        | Primary source                                          | Confidence                            | Notes                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------ | ------------------------------- | ------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEWS2**            | RCP **2017**                                     | ✅ confirmed current            | rcp.ac.uk/resources/national-early-warning-score-news-2 | high                                  | RCP Independent Advisory Group **2023 review formally recommended NO revision**. 2024–25 modification research exists but is not an official change.                                                                                                                          |
| **ESI**              | ENA **v5 (2023-03-28)**                          | ✅ confirmed current            | ena.org ESI v5; JEM 2025 validation                     | high (adult) / medium (paeds numbers) | **v5 mandate confirmed: HR+RR+SpO₂ required for every non-L1/L2 patient; high-risk vitals reassess UP.** Adult danger-zone HR>100, RR>20, SpO₂<92. Paeds numeric cutoffs are in the paid handbook — **not fabricated**.                                                       |
| **SATS / TEWS**      | EMSSA **2012 manual**                            | ✅ confirmed current            | emssa.org.za SATS                                       | high                                  | Two-track (TEWS OR discriminator → worse); colour bands TEWS 0-2 G / 3-4 Y / 5-6 O / ≥7 R / Blue=deceased. Adult ≥12y or ≥150cm. Per-point vital ranges are in the manual (not open).                                                                                         |
| **Sepsis-3 / qSOFA** | 2016 + **SSC-2021**                              | ✅ confirmed current            | sccm.org SSC 2021; Sepsis-3 JAMA                        | high                                  | qSOFA RR≥22 / AMS / SBP≤100; ≥2 = high risk. **SSC-2021 STRONGLY recommends AGAINST qSOFA as a sole screen** (sensitivity ~46%). → qSOFA is a **risk-stratification overlay only**; NEWS2≥5 is the sensitive early trigger.                                                   |
| **PEWS**             | **NHS National PEWS v3 (2023-11)**               | ✅ current; supersedes Brighton | england.nhs.uk/get-involved/cyp/pews                    | high (bands) / low (scoring)          | National PEWS now supersedes ad-hoc Brighton/Monaghan. **No nationally-standardised Uganda PEWS exists** (WHO ETAT used). Exact per-point scoring not open → paeds stays **provisional** (no fabrication).                                                                    |
| **MEOWS**            | Current UK MEOWS; **national MEWS BMJ Med 2024** | ✅ confirmed current            | RCOG GTG; MBRRACE; BMJ Med 2024                         | high (triggers) / low (per-param)     | Single-red OR two-yellow → escalate. Obstetric red-flags confirmed (SBP≥160/DBP≥110, eclampsia, heavy PV bleed, reduced fetal movements). MSI (HR/MAP) ≥0.9 refer / ≥1.4 urgent / ≥1.7 high-risk. Per-parameter colour bands vary by trust → obstetric stays **provisional**. |

**Flagged for CSO:** (a) NHS National PEWS v3 (2023) is newer than the kickoff's "Brighton/Monaghan basis" — recorded, paeds remains provisional pending the exact chart. (b) SSC-2021's anti-qSOFA-as-screen stance is honored: qSOFA stays an overlay, NEWS2≥5 is the screen.

---

## §2 — What v1 already does correctly (reused, no breaking change)

Deterministic pure engine + worse-of + 154 boundary tests · NEWS2 (all bands match the verified RCP values above) · derived metrics (shock index, qSOFA, pulse pressure, glucose, MAP) · discriminators + min-acuity · override authority (R1, doctors/COs down-triage only) · per-vital interpretation · names+auto-age worklist (ADR 0038, audited) · in-app Red/Orange notify · **re-triage history already retained** (actions.ts INSERTs a fresh `triage_record` each time — never overwrites) · missing-vital → provisional.

---

## §3 — The five v2 gaps (this build)

1. **ESI v5 mandatory-vitals rule** (the big miss). For any patient not Step-0/L1: **HR + RR + SpO₂ are required.** If any is missing, the engine **cannot issue a reassuring level (4/5)** — it floors to **L3 + `incompleteVitals` flag** and the UI shows an "Assessment incomplete — obtain HR/RR/SpO₂" banner. Pure, boundary-tested.
2. **Danger-zone vital reassess-up.** A high-risk vital forces **minimum L2** regardless of aggregate (ESI v5 "reassess upward"): adult HR>100, RR>20, SpO₂<92 (verified v5 thresholds) → acuity floored to 2. Composed into the worse-of as a third track.
3. **Rapid mode — 1-tap Red** from the worklist: a "Resus now" action → Step-0 life-threat record at L1 in one confirm, bypassing the full form (you don't fill a form for a patient in arrest). New server action `rapidRedAction`, reusing the same audited insert path.
4. **Inline trend strip.** `fetchRecentVitals` (already in worklist.ts, last 14 days) wired into the dialog as a compact sparkline-style trajectory — the MedSync edge (most ED triage lacks longitudinal vitals).
5. **Derived metrics with plain-language meaning** — each surfaced metric gets a one-line "what it means" ("Shock Index 1.05 — possible occult shock despite near-normal BP").

Plus craft polish (Part 5) and the ADRs.

---

## §4 — Schema

**No migration needed.** The v1 `triage_records` schema already stores `computed_level`, `assigned_level`, `override_direction/reason`, `baseline_*`, `life_threat_fast_tracked`, `provisional`, full `computed_breakdown` jsonb, `triaged_by_user_id`, `triaged_at` — and re-triage history is just multiple rows per intake (already the behavior). The ESI-v5 `incompleteVitals` + danger-zone facts ride inside `computed_breakdown` (jsonb) and the existing `provisional` flag. Rapid-Red uses the existing insert. **Nothing in 0036/0037 is altered.**

---

## §5 — Reuse vs stub

| Area                                                    | Decision                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| NEWS2 / derived / discriminators / worse-of / authority | **reuse** (verified-correct)                                                    |
| ESI-v5 mandatory-vitals + danger-zone                   | **new pure engine logic** (GATE B)                                              |
| Rapid-Red                                               | **new server action**, reuses audited insert                                    |
| Trend strip                                             | **wire existing** `fetchRecentVitals` + new sparkline component                 |
| Paeds PEWS numeric score / MEOWS per-param              | **stub/provisional** — verified not openly available; flagged, never fabricated |
| Migration                                               | **none**                                                                        |

---

## §6 — Decisions folded in (no blocking questions; flagging the load-bearing ones)

- **qSOFA = overlay only** (SSC-2021) — not a screen. NEWS2≥5 is the sensitive trigger. (Already v1 behavior; now documented + ADR.)
- **Danger-zone thresholds = the verified ESI-v5 adult values** (HR>100, RR>20, SpO₂<92). Paediatric danger-zone deferred (handbook-paywalled) → paeds stays provisional.
- **Incomplete-vitals floor = L3** (not L2): a non-reassuring "needs assessment" middle, biased up from Green but not crying wolf at Orange. CSO can retune the constant.

Proceeding A→F per "do everything." ADRs 0039 (ESI-v5 rule) + 0040 (rapid-mode / operative-UX) land at GATE F alongside the signed currency table.
