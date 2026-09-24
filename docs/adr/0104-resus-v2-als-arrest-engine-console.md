# ADR 0104 — Resus Desk v2: the ALS arrest engine and console (supersedes the ADR 0047 stub)

**Status:** Accepted — 2026-09-24 (CSO-signed catalog `docs/clinical/resus-als-clinical-catalog.md`, GATE A 2026-09-23)
**Context:** ADR 0047 shipped only the arrest-detection seam and a "ALS module — to follow" banner; after ⚠ Arrest the
survey stayed the working surface, the control hid, and a re-arrest could not be recorded (P2). Arrest care is the
most dose- and timing-critical logic in emergency medicine, so it needs its own verified catalog and engine.

## Decision

1. **A pure arrest engine** (`lib/resus/als/**`): `computeArrestState(events, now, ctx)` derives, from the immutable
   record alone, the arrest number, the 2-minute cycle (prepare 1:45, due 2:00, amber overdue after 2:15), rhythm
   history, shock count (stacked shocks count as one), adrenaline window (3–5 min; withheld < 30 °C; 6–10 min at
   30–35 °C), antiarrhythmic eligibility (after 3 and 5 shocks; amiodarone default, lidocaine by hospital setting),
   refractory VF, airway/access/ETCO₂ state, special-circumstance modifiers, reversible-cause tiles (survey evidence
   may pre-mark "suspected", never "excluded") and ROSC / sustained ROSC (20 min). Every rule carries its catalog ID
   and at least one test; scripted fake-clock scenarios S1–S5 run the whole loop.
2. **No remembered numbers** (Law 3): numbers come only from signed reference entries (`lib/resus/reference/
als-catalog.ts`); anything marked NOT ENCODED never becomes a number; children (< 16) get clocks and logging only.
   Energy defaults come from the bay's registered defibrillator profile; with none, only "highest available setting".
3. **The console** is a mode of the desk: cycle ring, a severity-ordered "Next" list, rhythm buttons, one-tap log
   buttons (≥ 56 px), cause tiles, modifier banner, ROSC confirm, "Stop resuscitation…", a paused survey tab, audio
   tone (default on, mutable) and optional metronome (110 /min, off), keyboard shortcuts (never animated).
4. **Fast-path drug logging (D4):** a protocol drug tap runs the existing prescribing safety check synchronously; when
   clear it records the drug with the signed default through the same accountability payload as the prescribe
   dialog; any block, a child, local anaesthetic toxicity, a withheld drug or a dose beyond the protocol opens the
   dialog pre-filled (override needs a reason). Controlled drugs never use the fast path.
5. **Arrest numbering** follows Utstein: a re-arrest within 20 min of ROSC continues the same arrest; after sustained
   ROSC it opens a new one; episode drug totals stay visible across arrests. One arrest call per new arrest, naming
   the place, never the patient.

## Consequences

**Positive:** the team gets a guideline-timed cognitive aid for the whole arrest with every tap on the medico-legal
record; the arrest is reconstructable for debrief and Utstein reporting. **Negative:** peri-arrest arrhythmias,
ECPR, neuroprognostication and procedural tooling stay out of scope (seams only); ERC/AHA primary texts could not be
re-read by automation — RCUK values were verified verbatim and the rest are flagged for a browser re-read (D25).

## Related

`docs/clinical/resus-als-clinical-catalog.md`, `tests/resus/v2/als/**`, ADR 0047 (superseded seam), ADR 0051/0052
(prescribing), ADR 0110 (Utstein).
