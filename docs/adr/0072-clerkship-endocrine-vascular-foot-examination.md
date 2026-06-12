# ADR-0072 — Clerkship Endocrine · Peripheral Vascular · Diabetic-Foot Examination (NCD pack, verified foot-risk constants)

**Status:** Accepted (gates run together with CSO authorisation 2026-06-12). Built on `feat/clerkship-endocrine-vascular-foot-exam`. The sixth system-exam layer (resp 0067 · CVS 0068 · abdo 0069 · neuro 0070 · MSK 0071 · EVF 0072) — a seventh card ("Endo / Vasc / Foot") in the per-system Examination switcher.
**Context:** Source `clerkship-endocrine-vascular-foot-examination-catalog.md` — **supplied in full**. Hutchison Ch 18 + standard vascular + diabetic-foot method. The catalog's hard rule: **foot-risk categories + ABPI thresholds must be web-verified, not from memory.** **No migration** — code reference data (`lib/clerkship/exam/endo-vascular-foot.ts`); captured in `examination.endoVascularFoot`.

## Decision

1. **One card, three sub-tabs** — Thyroid status / Peripheral vascular / Diabetic foot (the NCD-critical centrepiece).
2. **VERIFIED cited constants** (web-checked at build; CSO to re-confirm):
   - **Diabetic-foot risk = IWGDF 2023** (Bus et al., Diab Metab Res Rev 2024): 0 very-low (no LOPS/PAD → annual) · 1 low (LOPS _or_ PAD → 6–12 mo) · 2 moderate (LOPS+PAD / LOPS+deformity / PAD+deformity → 3–6 mo) · 3 high ((LOPS or PAD) + prior ulcer/amputation/ESRD → 1–3 mo). Plus an **active** state (ulcer/infection/Charcot/critical ischaemia/gangrene → urgent, not routine screening).
   - **ABPI = NICE CG147 + Wounds UK**: >1.4 calcified/falsely-high (diabetes/CKD → use toe-brachial index) · 0.9–1.4 normal · <0.9 PAD · <0.5 critical limb ischaemia.
   - LOPS = ≥1 of the 6 monofilament sites not-felt OR vibration absent (per foot).
3. **Risk category is SUGGESTED, never auto-assigned** — `suggestFootRisk()` derives + explains it; the clinician **confirms** (or overrides) it via an explicit tap; only the confirmed category is treated as the value, and it feeds the **monitoring re-exam interval** (engine stubbed → honest "not attached yet" state).
4. **Cluster engine (`matchEvfPatterns`, pure, TDD 21 tests)** — thyroid (hyper/hypo + storm/myxoedema/compressive/**malignant**), **acute limb ischaemia (≥2 of the 6 P's — emergency)**, critical ischaemia (rest pain / ABPI<0.5), arterial-vs-venous ulcer, **diabetic-foot sepsis (emergency)**, **acute Charcot** (warm swollen foot — flagged because it's mistaken for infection), **osteomyelitis** (probe-to-bone), neuropathic vs ischaemic foot. Transparent, multiple-on-ambiguity, never auto-diagnoses.
5. **Reuse** — foot neuropathy mirrors the neuro sensory concept (monofilament/vibration); pulses extend the CVS peripheral-pulse idea; vitals (glucose/HR) referenced. Reasoning thread fed via `evfReasoningTokens`.

## Consequences

- The Examination switcher now has seven cards (… · MSK · **Endo / Vasc / Foot**).
- **Monitoring integration is the open follow-up**: the confirmed foot-risk category + interval are computed + surfaced but the monitoring engine that schedules the re-exam isn't built — the UI is honest about it. When that engine lands, this is its first producer.
- Later layers (flagged): other endocrine (Cushing's/acromegaly/pituitary — partly general-exam spot-diagnosis); the skin/eyes/ENT/breast pack; paediatric endocrine/growth.
