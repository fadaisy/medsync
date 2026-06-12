# Clerkship Assessment / Synthesis — GATE A (plan + assembly rule + models, for CSO sign-off)

> **Status:** GATE A deliverable — plan + clinical-assembly rule + differential-decision UX + vitals-first problem-list model + Plan seam + migration proposal. **No build yet.** Per the kickoff, the abnormal-assembly rule and the vitals→problem modelling are **clinical decisions Fadhul (CSO) owns** — GATE A stops here for his sign-off; GATE B/C/D then build it.
> **Decision-support, NEVER autonomous:** the engine assembles + proposes; the clinician decides + commits. **The diagnosis of record is always the clinician's.**

## 0. What converges here

The Assessment tab is where the clerking converges, in **three zones**: (1) an **auto-assembled abnormal summary** (problem representation, vitals-up); (2) the reasoning engine's **suggested differential** → Agree / Disagree / Add-own; (3) a **proposed problem list** (vitals-first) the clinician confirms/edits/merges/removes. It then hands the committed diagnoses + problem list to the Plan-suggestions layer.

## 1. The abnormal-assembly rule (vitals-up) — _CSO to ratify_

Assemble everything already flagged abnormal across the clerkship, in clinical order, **reusing existing flags** (no new findings, no re-entry):

| Order | Source          | "Abnormal" = (reuse existing)                                                                                                                          | Provenance shown     |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1     | **Vitals**      | NEWS2 parameter points ≥1 / single-param-3; **BP hypertension category ≥ Grade 1 / Stage 1** (the new BP standard); SpO₂/glucose danger flags          | "Vitals" + the value |
| 2     | **Examination** | per-exam `present` positives (excluding selects on a normal value) **+ the cluster patterns `matchXPatterns` matched** (incl. must-not-miss/emergency) | the exam + finding   |
| 3     | **ROS**         | `status === "present"` positives + **pertinent negatives that matter** (deliberately-sought denials)                                                   | "ROS" + system       |
| 4     | **Background**  | active PMH / relevant meds / risk factors that bear on the picture                                                                                     | "Background"         |

- **Not-examined is shown honestly — never summarised as a normal finding.** Pertinent positives **+ the meaningful negatives** (a deliberately-sought negative is informative).
- It reads as a concise **problem representation** (the one-paragraph synthesis a clinician states on presentation), **assembled from the same data the reasoning rail already reads** — reusing the **now-narrative exam prose** (`renderXProse`), the **ROS narrative** (`renderRosNarrative`), and the **shared-parameter QC** (a shared finding appears once, from its single source).
- **Assembled, not authored from memory.** Clinician-editable (refine the representation) but it never invents a finding.

## 2. The suggested differential + the doctor's decision

- Surface the **reasoning engine's live differential** here (the same `liveReasoningForCodes` output the rail shows: plural differential + likelihoods + must-not-miss + discriminators/exam-targets) — **as a suggestion, transparent + sourced**, not a verdict. **Extends the engine; no duplicate differential logic.**
- **Per item: Agree / Disagree / Add own.**
  - **Agree** → records it as **the clinician's working diagnosis** (the act is the clinician's; the engine merely suggested). Audited.
  - **Disagree** → kept as **"considered & excluded"** (auditable; **must-not-miss especially — never silently dropped**).
  - **Add own** → the clinician's **own** diagnosis via **ICD-10 search-as-you-type** (reuse the shipped `CodeCombobox`), independent of suggestions.
- Carry **one or several** working diagnoses (primary + differentials, ranked). **The engine never auto-selects; the clinician's set is the record.** Anti-anchoring preserved (must-not-miss + breadth stay visible; rejecting is explicit + recorded).
- **Data:** reuse **`encounter_diagnoses`** as-is — `status` `working` (Agree / Add-own) vs `excluded` (Disagree, with `must_not_miss` retained), `rank`, `icd10_code`, `text`, `authored_by_user_id`. **No new table.**

## 3. The proposed problem list (vitals-first) — _CSO to ratify the modelling_

Generate a **proposed** list, built vitals-first; the doctor **confirms / edits / merges / removes** before it's of record:

1. **Abnormal vitals are first-class problems** (e.g. "Low SpO₂", "Hypertension Grade 1") — their own line, **until a diagnosis subsumes them**;
2. then the **clinician's working diagnoses** (from §2);
3. then **abnormal findings not yet explained**;
4. then **active background conditions**.

- **Vital→diagnosis linkage (the modelling rule):** a vital starts standalone and can be **linked/merged UNDER a diagnosis** as reasoning firms up (e.g. "Low SpO₂" → linked under "community-acquired pneumonia"). **The system proposes the merge; the clinician commits it.** A problem is **active / resolved / linked**; nothing is silently removed.
- The committed list is the **durable cross-encounter spine** (persists; the Plan + future ward-rounds hang off it).
- **Data:** reuse **`problem_list`** (patient-level, `active`, `resolved_at`, `source_encounter_id`, `icd10_code`) **+ a small GATED migration** adding the vitals-first modelling it lacks:
  - `kind` (`vital` | `diagnosis` | `finding` | `background`),
  - `linked_to_id` (self-FK — the diagnosis a vital/finding is merged under),
  - `status` (`active` | `resolved` | `linked`) — superseding the bare `active` boolean for the link state,
  - `provenance` (jsonb — where the proposed item came from).
    → **Proposed GATED migration `0049_problem_list_synthesis` (owner-applied).** Until applied, the Assessment can run with diagnoses (§2) + a session-level proposed list; the durable vitals-first persistence lights up when 0049 is applied (same dark-until-gated pattern).

## 4. The Plan seam (data contract — NOT built here)

The **committed working diagnoses (`encounter_diagnoses` status=working) + the committed problem list (`problem_list`)** are the input to the **Plan-suggestions layer** (the separate kickoff). GATE C defines the read contract; **the Plan is not built here.**

## 5. UX (consistent with examination-UI-v2 + the reasoning rail)

Three zones in the Assessment tab: the **abnormal summary** (assembled, vitals-up, editable), the **suggested differential + Agree/Disagree/Add-own**, the **proposed problem list (vitals-first) + confirm/edit/merge/remove**. Status language consistent with the workspace (normal-quiet / positive-accent / **must-not-miss reserved-red** / not-examined distinct; never colour-alone); the **reasoning rail stays live** (it's the source); tap-first; ICD-10 typeahead; merges clear + reversible + clinician-driven; MedSync easing, reduced-motion-safe; both themes; no left-edge accents; WCAG 2.2 AA; offline-friendly (reuse the autosave/offline work).

## 6. Confirmations

- ✅ **Extends** the reasoning engine (reads its differential — no duplicate logic) + **reuses the encounter spine** (`encounter_diagnoses`, `problem_list`) — no parallel store.
- ✅ Decision-support, never autonomous; **diagnosis of record is the clinician's**; must-not-miss retained as "considered & excluded"; not-examined ≠ normal; no fabrication; append-only/versioned/cadre-stamped/RLS/audited preserved.
- ⚠️ **One GATED migration proposed** (`0049` — problem-list vitals-first modelling columns), owner-applied; everything else reuses existing tables.

## 7. Build order (after sign-off)

- **[GATE B]** abnormal summary (vitals-up assembly + provenance + not-examined honesty) **+** the suggested-differential Agree/Disagree/Add-own wired to the real reasoning engine → `encounter_diagnoses` (working/excluded; must-not-miss retained; ICD-10 typeahead). **Stop.**
- **[GATE C]** the vitals-first proposed problem list + confirm/edit/merge/remove + the vital→diagnosis link/merge (clinician-driven; active/resolved/linked) persisting to `problem_list` (+ migration 0049) + the **clean Plan seam**. **Stop.**
- **[GATE D]** polish / motion / a11y / safety audit (diagnosis-of-record-is-clinician's; must-not-miss retained-as-excluded; not-examined≠normal; no fabrication) / clinical-content-parity / ADR / CHANGELOG. **Stop for CSO sign-off.**

**STOP — GATE A. Fadhul (CSO): please sign off (1) the vitals-up abnormal-assembly rule (§1), (2) the differential-decision model (§2), and (3) the vitals-first problem-list modelling + the proposed migration 0049 (§3). On your go I build B → C → D and deploy.**
