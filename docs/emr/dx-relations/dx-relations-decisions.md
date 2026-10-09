# Decisions for the CSO: diagnosis relations (D-REL)

Generated from `dx-relations-decisions.v1.json`; edit that file, not this one. The first option is the recommendation.
Reply with one line per decision, for example `D-REL-01: A`.

## D-REL-01. One primary diagnosis per visit, or several

**Question.** Malaria and pneumonia together: should both be 'primary', or does one stay primary with the other co-existing?

- **A. One primary (the leading diagnosis). Co-existing diagnoses get their own place, rank secondary, no parent, and equal visual weight.** (recommended)
  - What is lost: Nothing clinical: both are managed and both are counted. The clinician must pick which is leading; the desk lets them swap in one action.
- **B. Several primaries.**
  - What is lost: The single main condition that ICD-11 morbidity coding, inpatient HMIS returns and DRG-style costing need. Every report would need a tie-break rule written later.

**Why the recommendation.** ICD-11 morbidity rules and inpatient reporting select one main condition. Keeping one primary and a named co-existing place meets R4 without breaking those.

**If left unanswered.** Today's rule (one primary) stays, and co-existing diagnoses keep sitting in 'Also this visit' with no distinction from linked ones.

**Affects.** Part A §2, DXV-03

**Reply.** `D-REL-01: A (or B, or your own wording)`

## D-REL-02. Where relations live: the record, or only the note

**Question.** Should a relation be a row in the record (condition_relations), or stay in this visit's note data as today (meta.with)?

- **A. Record-level table, append-only, with RLS; the note reads from it.** (recommended)
  - What is lost: A migration and a backfill of meta.with. More to build now.
- **B. Note-level only, as today.**
  - What is lost: Links to the problem list (diabetes on the list → DKA today), relations seen at the next visit, HMIS and death-certificate chains, and any audit of who linked what.

**Why the recommendation.** R5 needs a link from this visit's diagnosis to a problem-list condition, which only a record-level link can hold. The record is append-only and audited; relations that drive counting and certificates must be too.

**If left unanswered.** Relations stay inside one note: a complication of a known chronic condition cannot point at it, and nothing carries to the next visit.

**Affects.** Part A §5, DXV-04, DXV-12, DXV-13

**Reply.** `D-REL-02: A (or B, or your own wording)`

## D-REL-03. Merge 'complication' and 'secondary to' into one causal relation

**Question.** Should complication_of and secondary_to be one stored relation (due_to) with a label, or two relation types?

- **A. One relation, due_to, with label complication, secondary or precipitated_by. The catalogue picks the label; the clinician can change it.** (recommended)
  - What is lost: A clinician who wants a fourth wording must ask for a new label.
- **B. Separate relation types.**
  - What is lost: Clarity at the drop: the clinician must choose between near-synonyms, and the same pair could be stored two ways, which splits counts and chains.

**Why the recommendation.** Both say 'A is caused by B' and map to the same ICD-11 axis and FHIR extension. One relation with a display label keeps the chain for death certificates and reports unambiguous.

**If left unanswered.** The design keeps two types and the drop chooser must offer both, with no rule for which is right.

**Affects.** Part A §1, dx-causes.v1.json

**Reply.** `D-REL-03: A (or B, or your own wording)`

## D-REL-04. Whether, and how, risk factors are shown

**Question.** Should risk factors for the leading diagnosis be shown, and are they stored?

- **A. Shown as one derived line under the diagnosis ('Risk factors on record: …'), from the problem list, this visit and the social history. Stored only if the clinician ticks 'include in note'.** (recommended)
  - What is lost: Nothing is stored by default, so a report of 'risk factors recorded' counts only ticked lines.
- **B. Stored as relations the clinician drags in.**
  - What is lost: Time, and noise: clinicians would drag diabetes onto every ACS by hand.
- **C. Not shown.**
  - What is lost: R2. The note loses the cardiovascular risk context that guides secondary prevention.

**Why the recommendation.** Risk factors are context, not this visit's cause. Showing them derived costs nothing and adds no clinical claim; storing them only on request keeps the record honest.

**If left unanswered.** Risk factors stay invisible on the board.

**Affects.** Part A §1, dx-risk-factors.v1.json, DXV-01

**Reply.** `D-REL-04: A (or B / C, or your own wording)`

## D-REL-05. Refinement: replace, or keep both

**Question.** When ACS becomes NSTEMI, is it a new version of the same condition, or a second condition beside the first?

- **A. A new version of the same condition (same logical id). History keeps the broad term; the board and note show the current one with 'refined from'. A change of identity (ACS → pericarditis) is refute plus a new diagnosis.** (recommended)
  - What is lost: The board never shows both at once; the history view does.
- **B. Keep both as separate conditions.**
  - What is lost: Clean counting: NSTEMI and ACS would both be counted for one illness, and the note would carry two diagnoses for one event.

**Why the recommendation.** One illness must be one condition in the record and one count in reports. Refuting rather than refining when the identity changes keeps 'ACS was considered and ruled out' visible, which matters for audit.

**If left unanswered.** The engineering side has to choose; mixed behaviour would double-count.

**Affects.** Part A §3, DXV-01, DXV-11

**Reply.** `D-REL-05: A (or B, or your own wording)`

## D-REL-06. How a drop chooses the relation

**Question.** When B is dropped on A, how is the relation chosen?

- **A. If the pair is in a signed catalogue, apply that relation at once and show it inline with 'Change' and 'Undo'. Otherwise open a small centred chooser with no preselection.** (recommended)
  - What is lost: One extra tap when the catalogue has no entry.
- **B. Always open the chooser.**
  - What is lost: Speed for the common, catalogued pairs.
- **C. Always decide from the catalogue; unknown pairs become co-existing.**
  - What is lost: Any causal link the catalogue does not list. The clinician is overruled.

**Why the recommendation.** Catalogued pairs are signed and common, so a one-step drop with a visible, reversible label is safe. An uncatalogued pair is a clinical claim the system cannot vouch for, so the clinician chooses it explicitly.

**If left unanswered.** Drops do nothing until a rule exists.

**Affects.** Part A §4

**Reply.** `D-REL-06: A (or B / C, or your own wording)`

## D-REL-07. HMIS and certificate counting of linked diagnoses

**Question.** How are secondary diagnoses counted?

- **A. OPD: every this-visit diagnosis that is working or final is counted on its own line (leading, co-existing, complications, secondary). Background, risk factors, differentials and refuted diagnoses are not. Inpatient: the leading diagnosis is the main condition. Death: the due_to chain proposes the certificate's Part I sequence for the doctor to confirm.** (recommended)
  - What is lost: A complication is counted both as itself and through its parent's line; HMIS lines are condition-based, so this matches how paper registers are filled.
- **B. Count only the leading diagnosis.**
  - What is lost: Every co-existing and secondary illness disappears from the district figures: malaria-with-pneumonia counts once.
- **C. Defer counting to the HMIS team.**
  - What is lost: Nothing now; the relation data still supports either rule later.

**Why the recommendation.** Counting each diagnosis that was actually managed matches the registers clinicians fill today. Proposing (never auto-writing) the Part I chain from due_to links improves certificate quality, which mortality audit depends on.

**If left unanswered.** Reports keep counting from the conditions table alone, ignoring relations.

**Affects.** Part A §1, Part A §2

**Reply.** `D-REL-07: A (or B / C, or your own wording)`

## D-REL-08. Relations on differentials

**Question.** Can a differential carry a relation (for example 'possible AKI secondary to malaria')?

- **A. No. Relations join working or final diagnoses only. A differential can name a suspected cause in its reasoning; when it is promoted, the desk offers the catalogued link.** (recommended)
  - What is lost: The clinician cannot draw a causal arrow to a diagnosis they have not yet accepted.
- **B. Yes, shown as 'possible'.**
  - What is lost: Clarity: unconfirmed arrows would flow into the note, the problem list and counts.

**Why the recommendation.** A causal link asserts more than either diagnosis alone. Asserting it about a diagnosis still in doubt invites premature closure.

**If left unanswered.** The board allows drops onto differentials with no rule for what they mean.

**Affects.** Part A §2, DXV-16

**Reply.** `D-REL-08: A (or B, or your own wording)`

## D-REL-09. What a viewer without access sees of a restricted relation

**Question.** When one end of a relation is in a restricted class, what does a viewer without that class see?

- **A. The relation takes the stricter class of its two ends. A viewer without it sees the unrestricted diagnosis alone, with no relation and no placeholder.** (recommended)
  - What is lost: That viewer does not know a cause is recorded. A clinician who needs it has (or requests) access.
- **B. Show 'secondary to a condition you cannot view'.**
  - What is lost: Privacy: the placeholder itself discloses that a restricted condition exists.
- **C. Hide the unrestricted diagnosis too.**
  - What is lost: Care: a ward team could lose sight of anaemia because its cause is HIV.

**Why the recommendation.** A placeholder leaks the existence of the restricted condition; hiding the child loses clinically needed information.

**If left unanswered.** Restricted causes could appear in note text for every viewer.

**Affects.** Part A §1, DXV-05

**Reply.** `D-REL-09: A (or B / C, or your own wording)`

## D-REL-10. Conditions that reveal HIV by inference

**Question.** Cryptococcal meningitis, PCP, Kaposi sarcoma, cerebral toxoplasmosis and oesophageal candidiasis imply HIV. Should they be restricted?

- **A. Keep them unrestricted (they must be visible to the treating team); restrict only their link to HIV, as D-REL-09 does. Review with the ADR 0206 owner.** (recommended)
  - What is lost: A viewer without HIV access can still infer it from the diagnosis name.
- **B. Restrict them under the HIV class.**
  - What is lost: Care: the ward team and pharmacy without HIV access would not see a life-threatening meningitis.
- **C. Decide case by case.**
  - What is lost: Consistency.

**Why the recommendation.** Hiding a must-not-miss infection from the treating team is a direct patient-safety risk; the inference risk is real but smaller.

**If left unanswered.** Behaviour stays as it is today (unrestricted), but undocumented.

**Affects.** Part A §1, DXV-05

**Reply.** `D-REL-10: A (or B / C, or your own wording)`

## D-REL-11. Causes that are not diagnoses

**Question.** DKA after missed insulin; heart failure after stopping medicines. How is a non-diagnosis cause recorded?

- **A. A short coded list of precipitant events (cause.insulin_omission, cause.new_medicine, cause.treatment_interruption, cause.alcohol, cause.pregnancy, cause.immobility), stored as a qualifier on the effect.** (recommended)
  - What is lost: Anything outside the list goes in the reasoning text.
- **B. Free text only.**
  - What is lost: Searchable, countable causes (for example DKA from insulin stock-outs).
- **C. Make each one a diagnosis.**
  - What is lost: Catalogue clarity: 'missed insulin' is not a disease and would pollute the problem list.

**Why the recommendation.** A small coded list makes stock-out and adherence causes countable without pretending they are diseases.

**If left unanswered.** Non-diagnosis causes live only in free text.

**Affects.** dx-causes.v1.json, DXV-04

**Reply.** `D-REL-11: A (or B / C, or your own wording)`

## D-REL-12. More than one cause for one diagnosis

**Question.** Severe anaemia from malaria and hookworm together: one cause or several?

- **A. Several causes allowed, ordered by the clinician; the note lists them ('secondary to malaria and hookworm infection'). At death, the doctor picks one chain for Part I.** (recommended)
  - What is lost: Some complexity in the note writer and the certificate proposal.
- **B. One cause only.**
  - What is lost: Truth: mixed causes of anaemia are common in Uganda.

**Why the recommendation.** Multiple causes are common; forcing one misstates the record.

**If left unanswered.** The first cause added wins and later ones are refused.

**Affects.** Part A §1, DXV-02

**Reply.** `D-REL-12: A (or B, or your own wording)`

## D-REL-13. Heart-failure classes: ESC 2026 or the 2021 scheme

**Question.** The 2026 ESC guideline (28 August 2026) removed HFmrEF: HFrEF is now LVEF <50%. The 2021 ESC guideline and the Universal Definition keep three classes (≤40, 41–49, ≥50). Which does MedSync show?

- **A. Store the LVEF number always; show ESC 2026 classes (HFrEF <50%, HFpEF ≥50%). Keep dx.hfmref unsigned.** (recommended)
  - What is lost: Alignment with older documents and with the AHA/ACC 2022 guideline.
- **B. Show the 2021 three classes.**
  - What is lost: Alignment with the newest European guidance.
- **C. Show the number only, no class.**
  - What is lost: The refinement prompt and class-specific medicine reviews.

**Why the recommendation.** Storing the number keeps either scheme derivable. The newest guideline is the default; check what UCG 2023 says before signing.

**If left unanswered.** dx.hfref and dx.hfpef stay unsigned and heart failure is not refined.

**Affects.** dx-subtypes.v1.json, DXV-07

**Reply.** `D-REL-13: A (or B / C, or your own wording)`

## D-REL-14. Severity is a stage, not a subtype

**Question.** Anaemia severity, CKD category, AKI stage, CURB-65, hypertension grade: subtypes, or stages on the same condition?

- **A. Stages (conditions.stage), recomputed when results change; never new versions of the diagnosis.** (recommended)
  - What is lost: Severity does not appear as its own diagnosis name in lists (the note writes it in brackets).
- **B. Subtypes.**
  - What is lost: Stability: every new haemoglobin would create a new diagnosis version, and counts would split by severity.

**Why the recommendation.** Severity changes with each result; identity does not. Keeping them apart avoids churn in the record and in counts.

**If left unanswered.** Each team models severity its own way.

**Affects.** dx-subtypes.v1.json (stages), DXV-02

**Reply.** `D-REL-14: A (or B, or your own wording)`

## D-REL-15. Symptom-level placeholders once explained

**Question.** When 'Fever, cause not yet known' is explained by malaria, what happens to the placeholder?

- **A. The desk offers to refine the placeholder into the diagnosis (a new version), so the note carries one entry. If the clinician declines, the placeholder stays.** (recommended)
  - What is lost: The note no longer says 'fever' as a separate line.
- **B. Keep both; link the placeholder to the diagnosis.**
  - What is lost: Note clarity, and a symptom is counted as if it were a diagnosis.

**Why the recommendation.** Placeholders exist to be replaced. One entry per problem keeps the note and counts honest.

**If left unanswered.** Placeholders accumulate beside the diagnoses that explain them.

**Affects.** dx-subtypes.v1.json, DXV-06

**Reply.** `D-REL-15: A (or B, or your own wording)`

## D-REL-16. Words for very high BP without organ damage

**Question.** Display 'hypertensive urgency', or 'severe hypertension without acute organ damage'?

- **A. 'Severe hypertension without acute organ damage', with 'urgency' as a search synonym. Settle together with D-HTN-01 in the hypertension pack.** (recommended)
  - What is lost: Familiar wording; UCG 2023 is recalled to use 'urgency' (to be confirmed on the page).
- **B. 'Hypertensive urgency'.**
  - What is lost: Alignment with ESC 2019, AHA 2024 and AHA/ACC 2025, which drop the term because it prompts unnecessary emergency lowering.

**Why the recommendation.** The word 'urgency' invites the harm the sources warn against: rapid lowering in a patient without organ damage.

**If left unanswered.** dx.severe_hypertension_no_aod stays unsigned; the crisis is not refined.

**Affects.** dx-proposed-terms.v1.json, DXV-06

**Reply.** `D-REL-16: A (or B, or your own wording)`

## D-REL-17. Backfilling today's note-level links

**Question.** How are existing meta.with and flagged entries carried into condition_relations?

- **A. One-off backfill for unsigned drafts only. Signed notes keep their text; a relation row is created for them only if the encounter is reopened and the clinician confirms.** (recommended)
  - What is lost: Older signed visits do not show relations in the record view.
- **B. Backfill every note, signed or not, as system-created relations.**
  - What is lost: The rule that a signed record is not changed after signature: rows would appear under a clinician's name they never confirmed.

**Why the recommendation.** A signed note must not acquire clinical assertions afterwards, even ones it already implied.

**If left unanswered.** meta.with stays the only store and the new table starts empty.

**Affects.** Part A §5

**Reply.** `D-REL-17: A (or B, or your own wording)`
