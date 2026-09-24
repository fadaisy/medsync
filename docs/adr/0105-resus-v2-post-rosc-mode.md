# ADR 0105 — Resus Desk v2: post-ROSC mode

**Status:** Accepted — 2026-09-24 (CSO-signed `docs/clinical/resus-post-rosc-clinical-catalog.md`, GATE A)
**Context:** v1 had no ROSC at all: an arrest could be declared but never resolved, and the post-resuscitation phase
— when oxygen, blood pressure, coronary and temperature targets matter most — had no support.

## Decision

1. **ROSC is recorded with its signs** (pulse, BP / arterial waveform, ETCO₂ rise, signs of life) and switches the
   desk to post-ROSC mode; a 20-minute sustain timer marks Utstein "sustained ROSC"; **⚠ Re-arrest stays on screen**.
2. **The resus-phase bundle** (RCUK/ERC-ESICM 2025): each PR-\* item is _done_, _not indicated_ or **not available
   here** (a distinct state that feeds capability data). House targets: SpO₂ 94–98 % with the oximetry skin-tone
   caveat always shown (D2); MAP ≥ 65 and SBP > 100 (D3); PaCO₂ 4.7–6.0 kPa; prevent fever ≤ 37.5 °C and do not
   actively rewarm at 32–36 °C; STEMI → angiography ≤ 120 min or fibrinolysis where PCI is not available; seizures
   → levetiracetam / valproate. Infusion rates and post-ROSC glucose numbers are not encoded. Children get no adult
   target.
3. **"Obeys commands?"** drives the level-of-care suggestion (comatose → L3).
4. **No prognostic statement anywhere** in the desk (neuroprognostication is multimodal, ≥ 72 h, in ICU).
5. **Continue survey (post-ROSC)** returns to A–E with each step pinning its post-ROSC target.

## Consequences

**Positive:** the most error-prone hour after ROSC gets a checklist with signed targets and an honest record of what
the unit could not provide. **Negative:** AHA 2025 post-arrest numbers could not be re-read and are not displayed;
the "not available here" data only becomes useful once hospitals declare their units.

## Related

`docs/clinical/resus-post-rosc-clinical-catalog.md`, `lib/resus/closeout/post-rosc.ts`, ADR 0104, ADR 0108.
