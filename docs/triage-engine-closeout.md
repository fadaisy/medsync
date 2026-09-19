# Smart Triage Engine — GATE F closeout & CSO sign-off

**Date:** 2026-05-31 · **Branch:** `feat/triage-engine`
**Clinical source:** [`docs/clinical/triage-medical-research.md`](clinical/triage-medical-research.md)

This is the closeout record for the triage build and the sign-off surface for the Clinical Safety Officer (Fadhul). The entire triage logic — thresholds, discriminator list, routing, override + baseline rules — is a **clinical-safety artifact** and must be CSO-signed before unsupervised use.

---

## Definition of Done (kickoff §8) — verification

| DoD item                                                                                                                                    | Status                    | Evidence                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Scoring is a pure deterministic function; thresholds = validated constants; every boundary unit-tested; reproducible                        | ✅                        | `lib/triage/`, `lib/triage/constants.ts`; 95 boundary tests (GATE B); determinism proven (3× identical runs) |
| Engine runs Steps 0–7: life-threat → routing → score → discriminators → worse-of → trend/baseline → output → override                       | ✅                        | `lib/triage/engine.ts`; `tests/triage/engine.test.ts`                                                        |
| Transparent: every output shows contributing parameters, derived metrics, red-flags — no black box                                          | ✅                        | `TriageResult.reasoning`; triage panel renders it live                                                       |
| Clinician-overridable up/down with logged reason; biases UP; reception can never triage; authority cadre-scoped                             | ✅                        | `lib/triage/authority.ts` (R1), `tests/triage/authority.test.ts`; DB CHECK + RLS                             |
| Correct population routing; never adult thresholds on a child/pregnant woman; unknown pregnancy flagged                                     | ✅                        | `lib/triage/scoring/routing.ts`; `tests/triage/routing.test.ts`                                              |
| Derived metrics surfaced (shock index, qSOFA, pulse pressure, glucose/DKA, MAP); trend-aware; missing vital = provisional, never fabricated | ✅                        | `lib/triage/scoring/derived.ts`; `fetchRecentVitals`/`fetchPriorTriageLevel`                                 |
| Consumes `awaiting_triage`; emergency never blocked; outcome routes priority/presence + Red/Orange alerts                                   | ✅                        | `lib/triage/worklist.ts`, `lib/triage/notify.ts`, queue `priority_order`                                     |
| Computed-vs-assigned captured for local over/under-triage validation; admin/superadmin aggregate (no PHI); all triage + overrides audited   | ✅                        | `triage_records.computed_level`/`assigned_level`; `fetchTriageMetricsToday`; `sa_audit_log`                  |
| Entire clinical logic documented as clinical-safety artifact, sources cited; configurable thresholds w/ safe defaults                       | ✅ docs / ⏳ **sign-off** | ADR 0035/0036/0037; `triage_config`; **this document**                                                       |
| Attio-grade transparent UI; responsive; WCAG 2.2 AA; reduced-motion; existing tests green; reviewable diff                                  | ✅                        | `app/nurse/triage/`; 215 passing / 0 failing (71 RLS-DB tests skipped by env gate); typecheck + lint clean   |

## Regression

- **Full suite: 215 passed, 0 failed, 71 skipped** (skipped = RLS DB-write tests gated behind `MEDSYNC_ALLOW_RLS_DB_WRITES`, unchanged by this work).
- **154 triage tests** (NEWS2 53, derived 29, paediatric 13, life-threat 13, routing 14, discriminators 14, engine 14, authority 16 — counts approximate per file).
- Full TypeScript typecheck clean (app + edge functions). ESLint clean.
- No shipped migration altered; 0036 + 0037 additive only.

## What is deliberately NOT done (honest scope — needs CSO input)

1. **PEWS per-point sub-rubric** — not in the research doc; not fabricated. Paeds patients are flagged provisional + "assess against the PEWS chart manually." **CSO action:** supply the Brighton/Mulago paediatric chart to enable a paediatric numeric score.
2. **MEOWS per-parameter colour cutoffs** — same; obstetric patients run on discriminators + derived metrics + provisional flag. **CSO action:** supply the MEOWS chart.
3. **SMS/push alerting** — no dispatcher exists; in-app alert ships now, SMS/push behind a stubbed `NotificationSink`. **Infra action:** wire a gateway later (one-file change).
4. **Monitoring-alert → urgent-appointment carry** — no alerts table exists; clean seam left.
5. **Encounter hand-off** — triage sets `status='triaged'` + disposition; the next clinical build owns the encounter.
6. **Local validation of over/under-triage rates** — the data capture (computed-vs-assigned) is in place from day one; the validation study itself is a CSO-led activity (research §10).

---

## Clinical Safety Officer sign-off

By signing, the CSO accepts the triage thresholds, discriminator list (§A.2), population routing, override authority (R1), and baseline-adjustment floor as fit for supervised pilot use, and acknowledges the scope limits above.

- [ ] **§A.1** five-tier levels + target times
- [ ] **§A.2** discriminator list (the clinical heart)
- [ ] **§A.3** population routing (incl. unknown-pregnancy + 12–15 → paeds)
- [ ] **§A.4 / R1** override authority (down-triage = doctors/COs only)
- [ ] **§A.5** baseline-adjustment floor (absolute)
- [ ] Scope limits 1–6 acknowledged

**Signed:** \***\*\*\*\*\***\_\_\_\_\***\*\*\*\*\*** **Date:** \***\*\_\_\_\_\*\***

_Decision support, not autonomous decision. The clinician owns every final triage. Bias to over-triage; never silently under-triage._
