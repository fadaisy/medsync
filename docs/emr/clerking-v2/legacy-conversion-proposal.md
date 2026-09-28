# Legacy conversion: v1 symptom codes → catalogue MS-EMR-CLERK-CAT-001

**Status: signed 2026-09-28 and built** (§7). The table is `data/clerking/legacy-conversion.v1.json`,
hash-pinned in `data/clerking/legacy-conversion-signoff.v1.json`. §1–§6 are the proposal as it was signed.

**Sources read (branch `feat/clerking-v2`):**

- `supabase/migrations/0042_symptom_catalog.sql` and `0045_review_of_systems.sql` (seeds and v1 ROS properties)
- later migrations that touch `symptom_catalog`: 0044, 0066, 0071, 0072, 0076
- `data/clerking/clerking-history-catalogue.v1.json` (96 symptoms; properties resolved through `parseCatalogue`)
- `data/clerking/token-map.v1.json`, `docs/emr/clerking-v2/catalogue-token-map.csv`
- `lib/clerking/convert.ts`, `docs/emr/clerking-v2/gate-a-proposal.md` (H10, H11, §4)
- `lib/emr/read/terms.ts` (v1 finding index and ROS screen), `components/emr/desk/model.ts` (v1 `ros_grid` shape)
- `db/schema/emr.ts` (`pregnancy_episodes`), `lib/emr/write/facts.ts` (`recordPregnancy`)

**Counts.**

- **89 old codes, confirmed.** 0042 seeds 16 and 0045 seeds 81; 8 codes are in both, which gives 89 unique codes.
- **81 of the 89 are in the v1 review of systems** (`ros_screen = true`). The other 8 come only from 0042 and can only
  ever be complaints: `dyspnoea`, `oedema`, `weight_loss`, `dizziness`, `vomiting`, `diarrhoea`, `fatigue`, `syncope`.
- **No later migration removes a seeded code.** 0044 adds attribution and scope columns, 0066 is a different table
  (`patient_symptom_catalog_*`), and 0071/0072 only reference the table. **0076 adds 17 more codes** (the new-token
  symptoms, `ros_screen = false`); those are new vocabulary, not old.

**Old labels** are the effective database display: 0045's `ON CONFLICT` updates only the ROS flags, so the 8 shared codes keep their 0042 display (for example `haemoptysis` "Coughing up blood", `jaundice` "Yellow eyes / skin").

**Answer states.** "Not asked" is the absence of a key in both formats, so every row carries it across as not asked.
It is not repeated in the table.

**What a v1 draft actually holds.** In `NoteContent` v1, complaints are `s01` `complaint_token` items, holding a token,
a label and `durationDays`. The review of systems is one `s03` `ros_grid` item whose entries are
`{token, label, presence: "present" | "absent"}`. **The v1 EMR desk grid records presence only.** The 0045 property
values (LMP text, pregnancy status, cycle regularity, flow) are not in the draft, so nothing can be read from them.

---

## 1. Summary by outcome

These are the proposed outcomes, including my proposals for the 2 missing codes and one proposed preset.

| Outcome             | Count  | Codes                                                                                                                                                           |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| convert             | 62     | Group A (59), plus `appetite_change` and `gait_disturbance`: both sit under #4 but neither sets a property. Plus `risk` (#8), converted with review required.   |
| convert_with_preset | 6      | `pleuritic_chest_pain`, `intermenstrual_bleeding`, `postcoital_bleeding`, `postmenopausal_bleeding`, `dysmenorrhoea`, and `itch_generalised` (**my proposal**). |
| needs_choice        | 17     | the 13 codes in #6, `urgency` (#10), `functional_limitation` (#11), and **2 missing codes (my proposal)**: `syncope_presyncope` and `memory_cognitive_change`.  |
| split_by_sex        | 1      | `urethral_vaginal_discharge`                                                                                                                                    |
| route               | 2      | `pregnancy_status`, `lmp`                                                                                                                                       |
| text                | 1      | `pallor_anaemia_symptoms`                                                                                                                                       |
| **Total**           | **89** |                                                                                                                                                                 |

**Codes that fall to text:**

- **Intentional:** `pallor_anaemia_symptoms` (#11).
- **Intentional text fallbacks inside needs_choice:**
  - `urgency`: nothing in the catalogue is urgency itself.
  - `hair_nail_change`: the nail part.
  - `skin_hair_sweating_change`: the skin part.
  - `eye_symptoms`: eye pain with no redness and no change in vision.
- **Conditional:** `lmp`. There is no date to propose (see D4).
- **Not intentional:** none of the 89. **The current converter sends 35 of them to text** (listed in §5, D1).

---

## 2. The table

**Key:**

- **Outcome** follows the enum in decision 2.
- **Preset** is `property=option`, using the real ids from the catalogue. `[...]` marks a multi-choice property.
- **Restricted class** comes from the target symptom's `sensitivity` in the catalogue. All four classes are stored as
  `restricted` (H5).
- **"yes"** means complaint present or ROS `present`. **"no"** means ROS `absent`.
- **"cx only"** means the code is not in the v1 ROS, so it can only arrive as a complaint and a "no" cannot occur.
- **Provenance:** every converted item carries "From previous format", appears on the review list the first time the
  draft opens, and is audited (#12). This applies to every row and is not repeated.

| #   | Old code                      | Old label                     | Outcome                                   | Target(s)                                                                                                                       | Preset                                        | Restricted class                                           | "yes"                                                       | "no"                                                                            | Notes                                                             |
| --- | ----------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | fever                         | Fever                         | convert                                   | sym.fever                                                                                                                       | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 2   | night_sweats                  | Night sweats                  | convert                                   | sym.night_sweats                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 3   | weight_change                 | Weight change                 | needs_choice                              | sym.weight_loss, sym.weight_gain                                                                                                | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       | `sym.weight_gain` has `in_review_of_systems: false`               |
| 4   | appetite_change               | Appetite change               | convert                                   | sym.loss_of_appetite                                                                                                            | none; `level` left unanswered                 | standard                                                   | yes                                                         | no                                                                              | #4; `level` ∈ reduced/none/increased                              |
| 5   | fatigue_malaise               | Fatigue/malaise               | convert                                   | sym.fatigue                                                                                                                     | –                                             | standard                                                   | yes                                                         | no                                                                              | merges with #15                                                   |
| 6   | sleep_disturbance             | Sleep disturbance             | convert                                   | sym.poor_sleep                                                                                                                  | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 7   | lumps_swellings               | Lumps/swellings               | needs_choice                              | sym.lumps_lymph, sym.neck_swelling, sym.breast_lump, sym.skin_lesion                                                            | –                                             | standard                                                   | needs_choice                                                | no → all four                                                                   | see D8 (skin_lesion)                                              |
| 8   | itch_generalised              | Itch generalised              | convert_with_preset (**proposal**)        | sym.itch                                                                                                                        | `where=generalised`                           | standard                                                   | yes + preset                                                | **not asked** (proposal)                                                        | a no does not deny localised itch; merges with #76                |
| 9   | dyspnoea                      | Breathlessness                | convert                                   | sym.breathlessness                                                                                                              | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 10  | oedema                        | Leg swelling                  | convert                                   | sym.leg_swelling                                                                                                                | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 11  | weight_loss                   | Weight loss                   | convert                                   | sym.weight_loss                                                                                                                 | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 12  | dizziness                     | Dizziness                     | convert                                   | sym.dizziness                                                                                                                   | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 13  | vomiting                      | Vomiting                      | convert                                   | sym.nausea_vomiting                                                                                                             | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 14  | diarrhoea                     | Diarrhoea                     | convert                                   | sym.diarrhoea                                                                                                                   | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 15  | fatigue                       | Fatigue                       | convert                                   | sym.fatigue                                                                                                                     | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only; the old synonyms include "weakness"                    |
| 16  | syncope                       | Blackout / fainting           | convert                                   | sym.fainting                                                                                                                    | –                                             | standard                                                   | yes                                                         | n/a (cx only)                                                                   | 0042 only                                                         |
| 17  | chest_pain                    | Chest pain                    | convert                                   | sym.chest_pain                                                                                                                  | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 18  | exertional_dyspnoea           | Exertional dyspnoea           | convert                                   | sym.breathless_exertion                                                                                                         | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 19  | orthopnoea                    | Orthopnoea                    | convert                                   | sym.orthopnoea                                                                                                                  | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 20  | paroxysmal_nocturnal_dyspnoea | Paroxysmal nocturnal dyspnoea | convert                                   | sym.pnd                                                                                                                         | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 21  | palpitations                  | Palpitations                  | convert                                   | sym.palpitations                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 22  | ankle_leg_swelling            | Ankle/leg swelling            | convert                                   | sym.leg_swelling                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 23  | intermittent_claudication     | Intermittent claudication     | convert                                   | sym.claudication                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 24  | syncope_presyncope            | Syncope/presyncope            | needs_choice (**proposal, missing code**) | sym.fainting, sym.dizziness                                                                                                     | –                                             | standard                                                   | needs_choice                                                | no → sym.fainting only                                                          | §3                                                                |
| 25  | cough                         | Cough                         | convert                                   | sym.cough                                                                                                                       | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 26  | sputum                        | Sputum                        | convert                                   | sym.sputum                                                                                                                      | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 27  | haemoptysis                   | Coughing up blood             | convert                                   | sym.coughing_blood                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 28  | dyspnoea_respiratory          | Dyspnoea (respiratory)        | convert                                   | sym.breathlessness                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              | target has `in_review_of_systems: false` (D9)                     |
| 29  | wheeze                        | Wheeze                        | convert                                   | sym.wheeze                                                                                                                      | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 30  | pleuritic_chest_pain          | Pleuritic chest pain          | convert_with_preset                       | sym.chest_pain                                                                                                                  | `aggravation=[breathing_in]`                  | standard                                                   | yes + preset                                                | **not asked** (proposal)                                                        | the code covers only pleuritic pain (D6)                          |
| 31  | dysphagia                     | Dysphagia                     | convert                                   | sym.difficulty_swallowing                                                                                                       | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 32  | nausea_vomiting               | Nausea/vomiting               | convert                                   | sym.nausea_vomiting                                                                                                             | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 33  | haematemesis                  | Haematemesis                  | convert                                   | sym.vomiting_blood                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 34  | heartburn_indigestion         | Heartburn/indigestion         | convert                                   | sym.heartburn                                                                                                                   | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 35  | abdominal_pain                | Abdominal pain                | convert                                   | sym.abdominal_pain                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 36  | abdominal_distension          | Abdominal distension/bloating | convert                                   | sym.abdominal_swelling                                                                                                          | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 37  | change_bowel_habit            | Change in bowel habit         | convert                                   | sym.bowel_change                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 38  | rectal_bleeding               | Rectal bleeding/melaena       | needs_choice                              | sym.rectal_bleeding, sym.black_stools                                                                                           | –                                             | standard                                                   | needs_choice + caution flag "Rectal bleeding: needs detail" | no → both                                                                       | the flag is conversion-only, not a catalogue rule (D10)           |
| 39  | jaundice                      | Yellow eyes / skin            | convert                                   | sym.jaundice                                                                                                                    | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 40  | dysuria                       | Dysuria                       | convert                                   | sym.dysuria                                                                                                                     | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 41  | urinary_frequency             | Urinary frequency             | convert                                   | sym.frequency                                                                                                                   | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 42  | nocturia                      | Nocturia                      | convert                                   | sym.nocturia                                                                                                                    | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 43  | urgency                       | Urgency                       | needs_choice, text fallback               | nearest: LUTS symptoms (sym.frequency, sym.nocturia, sym.voiding_symptoms, sym.incontinence) via `storage=[urgency]`; else text | –                                             | standard                                                   | needs_choice / text                                         | **left out of the note** (proposal)                                             | no target covers urgency; `sym.urgency` is proposed for v1.1 (§6) |
| 44  | voiding_symptoms              | Voiding symptoms              | convert                                   | sym.voiding_symptoms                                                                                                            | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 45  | haematuria                    | Haematuria                    | convert                                   | sym.haematuria                                                                                                                  | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 46  | incontinence                  | Incontinence                  | convert                                   | sym.incontinence                                                                                                                | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 47  | urethral_vaginal_discharge    | Urethral/vaginal discharge    | split_by_sex                              | male → sym.urethral_discharge; female → sym.vaginal_discharge; unknown or intersex → ask                                        | –                                             | sexual_reproductive_health                                 | yes on the sex-applicable target                            | no → the sex-applicable target (both if sex unknown)                            |                                                                   |
| 48  | lmp                           | Last menstrual period         | route                                     | `pregnancy_episodes.lnmp` (+ `lnmp_certainty`) via `recordPregnancy`, proposed for the clinician to confirm                     | –                                             | pregnancy (restricted for a possible minor, SR-PREG-MINOR) | prompt "LMP recorded in previous format: enter date"        | nothing written                                                                 | **no date exists in v1** (D4)                                     |
| 49  | menstrual_cycle               | Menstrual cycle               | convert                                   | sym.periods_change                                                                                                              | –                                             | standard                                                   | yes (see D3)                                                | see D3                                                                          | **ambiguous presence** (D3)                                       |
| 50  | menstrual_flow                | Menstrual flow                | convert                                   | sym.periods_change                                                                                                              | –                                             | standard                                                   | yes (see D3)                                                | see D3                                                                          | **ambiguous presence** (D3)                                       |
| 51  | dysmenorrhoea                 | Dysmenorrhoea                 | convert_with_preset                       | sym.periods_change                                                                                                              | `change=[painful]`                            | standard                                                   | yes + preset                                                | **not asked** (proposal)                                                        | D6                                                                |
| 52  | intermenstrual_bleeding       | Intermenstrual bleeding       | convert_with_preset                       | sym.vaginal_bleeding                                                                                                            | `type=between_periods`                        | sexual_reproductive_health                                 | yes + preset                                                | **not asked** (proposal)                                                        | `type` is single-choice (D7)                                      |
| 53  | postcoital_bleeding           | Postcoital bleeding           | convert_with_preset                       | sym.vaginal_bleeding                                                                                                            | `type=after_sex`                              | sexual_reproductive_health                                 | yes + preset                                                | **not asked** (proposal)                                                        | D7                                                                |
| 54  | postmenopausal_bleeding       | Postmenopausal bleeding       | convert_with_preset                       | sym.vaginal_bleeding                                                                                                            | `type=after_menopause`                        | sexual_reproductive_health                                 | yes + preset                                                | **not asked** (proposal)                                                        | fires FLAG-PMB (caution) on conversion; D7                        |
| 55  | pregnancy_status              | Pregnancy status              | route                                     | `pregnancy_episodes.pregnancy_state` via `recordPregnancy`, proposed for the clinician to confirm                               | –                                             | pregnancy (restricted for a possible minor)                | propose `pregnant`                                          | propose `not_pregnant`                                                          | presence semantics assumed (D4)                                   |
| 56  | headache                      | Headache                      | convert                                   | sym.headache                                                                                                                    | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 57  | seizures_fits                 | Seizures/fits                 | convert                                   | sym.fits                                                                                                                        | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 58  | dizziness_vertigo             | Dizziness/vertigo             | convert                                   | sym.dizziness                                                                                                                   | –                                             | standard                                                   | yes                                                         | no                                                                              | `type` (spinning/light_headed/unsteady) left unanswered           |
| 59  | weakness                      | Weakness                      | needs_choice                              | sym.fatigue, sym.muscle_weakness, sym.focal_weakness                                                                            | –                                             | standard                                                   | needs_choice; never defaults to focal                       | no → all three                                                                  | D8 (fatigue)                                                      |
| 60  | numbness_paraesthesia         | Numbness/paraesthesia         | convert                                   | sym.numbness                                                                                                                    | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 61  | tremor                        | Tremor                        | convert                                   | sym.tremor                                                                                                                      | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 62  | visual_disturbance            | Visual disturbance            | convert                                   | sym.blurred_vision                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              | the target's label is "Change in vision"                          |
| 63  | speech_swallowing_disturbance | Speech/swallowing disturbance | needs_choice                              | sym.speech_change, sym.difficulty_swallowing                                                                                    | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 64  | memory_cognitive_change       | Memory/cognitive change       | needs_choice (**proposal, missing code**) | sym.memory_loss, sym.confusion                                                                                                  | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       | §3                                                                |
| 65  | gait_disturbance              | Gait disturbance              | convert                                   | sym.falls                                                                                                                       | none                                          | standard                                                   | yes                                                         | **not asked** (proposal)                                                        | the code does not cover falls from other causes (D6)              |
| 66  | joint_pain                    | Joint pain                    | convert                                   | sym.joint_pain                                                                                                                  | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 67  | joint_swelling                | Joint swelling                | convert                                   | sym.joint_swelling                                                                                                              | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 68  | back_pain                     | Back pain                     | convert                                   | sym.back_pain                                                                                                                   | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 69  | muscle_pain_weakness          | Muscle pain/weakness          | needs_choice                              | sym.muscle_pain, sym.muscle_weakness                                                                                            | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 70  | functional_limitation         | Functional limitation         | needs_choice                              | `history.social.activity` ∈ `limited`, `needs_help`, `bedbound`                                                                 | –                                             | standard                                                   | needs_choice                                                | **proposal:** offer `fully_active` for the clinician to confirm; never auto-set | not a symptom (D11)                                               |
| 71  | heat_cold_intolerance         | Heat/cold intolerance         | needs_choice                              | sym.heat_intolerance, sym.cold_intolerance                                                                                      | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 72  | polyuria_polydipsia           | Polyuria/polydipsia           | convert                                   | sym.polyuria                                                                                                                    | none; `thirst` left unanswered, with a prompt | standard                                                   | yes                                                         | no → sym.polyuria **and** sym.polydipsia (proposal)                             | #5 sets no rule for "no"                                          |
| 73  | neck_swelling_thyroid         | Neck swelling (thyroid)       | convert                                   | sym.neck_swelling                                                                                                               | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 74  | skin_hair_sweating_change     | Skin/hair/sweating change     | needs_choice                              | sym.excess_sweating, sym.hair_loss; text for skin                                                                               | –                                             | standard                                                   | needs_choice / text                                         | no → both symptoms                                                              |                                                                   |
| 75  | rash                          | Rash                          | convert                                   | sym.rash                                                                                                                        | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 76  | pruritus                      | Pruritus (itch)               | convert                                   | sym.itch                                                                                                                        | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 77  | new_changing_lesion_mole      | New/changing lesion or mole   | convert                                   | sym.skin_lesion                                                                                                                 | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 78  | hair_nail_change              | Hair/nail change              | needs_choice                              | sym.hair_loss; text for nail                                                                                                    | –                                             | standard                                                   | needs_choice / text                                         | no → sym.hair_loss                                                              | the catalogue has no nail symptom                                 |
| 79  | easy_bruising_bleeding        | Easy bruising/bleeding        | convert                                   | sym.bleeding_tendency                                                                                                           | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 80  | recurrent_infections          | Recurrent infections          | convert                                   | sym.recurrent_infections                                                                                                        | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 81  | lymphadenopathy_lumps         | Lymphadenopathy/lumps         | convert                                   | sym.lumps_lymph                                                                                                                 | –                                             | standard                                                   | yes                                                         | no                                                                              |                                                                   |
| 82  | pallor_anaemia_symptoms       | Pallor/anaemia symptoms       | text                                      | Systems review text "from previous format"                                                                                      | –                                             | standard                                                   | text                                                        | left out of the note                                                            | CFC `sign.pallor` is an examination sign, so it is not used       |
| 83  | low_mood                      | Low mood                      | convert                                   | sym.low_mood                                                                                                                    | –                                             | mental_health                                              | yes                                                         | no                                                                              | v1 was unrestricted; conversion tightens it                       |
| 84  | anxiety                       | Anxiety                       | convert                                   | sym.anxiety                                                                                                                     | –                                             | mental_health                                              | yes                                                         | no                                                                              | as #83                                                            |
| 85  | risk                          | Risk                          | convert, needs_review                     | sym.self_harm_thoughts                                                                                                          | –                                             | mental_health                                              | yes + review + flag                                         | no                                                                              | never text or dropped; D5                                         |
| 86  | hearing_loss_tinnitus         | Hearing loss/tinnitus         | needs_choice                              | sym.hearing_loss, sym.tinnitus                                                                                                  | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 87  | nasal_symptoms                | Nasal symptoms                | needs_choice                              | sym.nasal, sym.nosebleed                                                                                                        | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 88  | sore_throat_hoarseness        | Sore throat/hoarseness        | needs_choice                              | sym.sore_throat, sym.hoarse_voice                                                                                               | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |
| 89  | eye_symptoms                  | Eye symptoms                  | needs_choice                              | sym.red_eye, sym.blurred_vision; text for eye pain alone                                                                        | –                                             | standard                                                   | needs_choice                                                | no → both                                                                       |                                                                   |

**A needs_choice item counts as not asked until the clinician picks** (#6). Picking one target does not imply "no" for
the others.

---

## 3. The 2 missing codes

**The brief's arithmetic cannot be reproduced exactly.** Decisions #4 to #11 name 30 codes outside Group A:

- 7 preset codes and `polyuria_polydipsia`
- 13 needs_choice codes in #6
- `urethral_vaginal_discharge`, `risk`, `pregnancy_status`, `lmp`, `menstrual_cycle`, `menstrual_flow`
- `urgency`, `pallor_anaemia_symptoms`, `functional_limitation`

That leaves 59 codes for "the rest of Group A", making 89 and not 87. The working groups of 62 + 10 + 7 + 8 do not
partition these names.

**Which 2 are missing.** Two of those 59 are combined codes with no single target of the same breadth. Under decision
#3, a yes on a combined code is never narrowed silently, so neither can sit in Group A. No decision places them.

| Code                                                | Why it can't convert directly                                                                                                                                                                                                                             | My proposal (needs signature)                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syncope_presyncope` (Syncope/presyncope)           | `sym.fainting` is "Fainting or blackout". Presyncope is a near-faint with no loss of consciousness, so converting a yes would assert a blackout that may not have happened. The token map does not use this code; the current converter sends it to text. | needs_choice {sym.fainting, sym.dizziness}. **"no" → sym.fainting no only**: denying presyncope does not deny vertigo, so sym.dizziness stays not asked. |
| `memory_cognitive_change` (Memory/cognitive change) | `sym.memory_loss` ("Memory problems") is narrower. `sym.confusion` is the other half and shares the same property family. The current converter silently narrows it to `sym.memory_loss`.                                                                 | needs_choice {sym.memory_loss, sym.confusion}. "no" → both no.                                                                                           |

**Near-misses, placed in Group A but worth a glance:**

- `itch_generalised`: I propose the preset `where=generalised`, and a "no" becomes not asked.
- `dyspnoea_respiratory`: its target is not in the v2 review of systems (D9).
- `lymphadenopathy_lumps`: "lumps" is broader than nodes, but #7 already catches general lumps.

---

## 4. Discrepancies with the brief (repo facts)

**D1. The current converter narrows silently, which decision #3 forbids.** `convert.ts` converts 54 codes and sends
35 to text, confirming the brief. Among the 54, it narrows seven broad codes to one symptom:

- `weakness` → `sym.focal_weakness`
- `weight_change` → `sym.weight_gain`
- `lumps_swellings` → `sym.breast_lump`
- `eye_symptoms` → `sym.red_eye`
- `speech_swallowing_disturbance` → `sym.speech_change`
- `hair_nail_change` → `sym.hair_loss`
- `skin_hair_sweating_change` → `sym.excess_sweating`

This path is live behind `CLERKING_V2`.

Seven of the 35 text codes fail for a different reason: the token map uses CFC ids whose concept is a
`symptom_catalog` code. The v1 index hides those concepts (`terms.ts`), so the v1 draft holds the code and not the CFC
id:

| v1 code                   | CFC id in the token map | Symptom             |
| ------------------------- | ----------------------- | ------------------- |
| fatigue                   | sx.fatigue              | sym.fatigue         |
| oedema                    | sign.oedema             | sym.leg_swelling    |
| intermittent_claudication | sx.claudication         | sym.claudication    |
| abdominal_pain            | sx.abdominal_pain       | sym.abdominal_pain  |
| vomiting                  | sx.vomiting             | sym.nausea_vomiting |
| jaundice                  | sign.jaundice           | sym.jaundice        |
| nocturia                  | sx.nocturia             | sym.nocturia        |

**D2. The converter never reads the v1 review of systems.** `convert.ts` reads only `s01` complaints; the `s03`
`ros_grid` is ignored. Handling ROS answers is new scope, not a fix.

**D3. `menstrual_cycle` and `menstrual_flow` have no clear meaning for "present".** The v1 grid holds presence only,
and "present" on "Menstrual cycle" can mean the patient has a (normal) cycle. Converting it to `sym.periods_change` =
yes ("Change in periods") may assert an abnormality nobody recorded. "Absent" can mean amenorrhoea, which is the
opposite of `periods_change` = no.

- **Recommendation:** yes → needs_choice on `sym.periods_change` with no preset. The clinician picks from
  `change` ∈ {heavy, painful, irregular, missed}.
- **"no":** left out of the note.
- This contradicts #9 as written; it needs your call.

**D4. The v1 draft has nothing to route for `lmp` and `pregnancy_status`.**

- The v1 grid stores presence only.
- `ros_lmp_lmp` (0045) is a text property and never reached the EMR note.
- `pregnancy_status` present or absent is read as pregnant or not pregnant. That is an assumption: 0045's own value set
  is yes/no/unsure, and it is not stored.
- **The route target is concrete:** `pregnancy_episodes` (`pregnancy_state` ∈ pregnant/postpartum/not_pregnant/unknown;
  `lnmp` date; `lnmp_certainty` ∈ sure/unsure), written through `recordPregnancy` (`lib/emr/write/facts.ts`).
- For `lmp`, the only honest output is a prompt to enter the date.

**D5. `needs_review` is not in the outcome enum.** Decision #2's enum has no `needs_review`, so `risk` is recorded as
`convert` plus `review: true`. Two further points:

- **Narrowing:** "Risk" covers harm to others and from others; `sym.self_harm_thoughts` covers self only. A yes is a
  narrowing, made visible by the review.
- **No flag fires:** FLAG-SELF-HARM needs `timing`, `plan` or `acted`, which a converted yes lacks. The flag "raised" in
  #8 must be a new conversion flag with signed wording, not the catalogue rule.

**D6. Rule #3 ("no → no for every symptom the code covers") is safe only when the code covers the whole target.**
For these codes the old code is narrower than the target, so a "no" must not become "no" on the broader symptom:

| Old code                | Target               |
| ----------------------- | -------------------- |
| pleuritic_chest_pain    | sym.chest_pain       |
| dysmenorrhoea           | sym.periods_change   |
| intermenstrual_bleeding | sym.vaginal_bleeding |
| postcoital_bleeding     | sym.vaginal_bleeding |
| postmenopausal_bleeding | sym.vaginal_bleeding |
| gait_disturbance        | sym.falls            |
| itch_generalised        | sym.itch             |

- **Proposal:** "no" → not asked, with the negative shown once on the review list.

**D7. `sym.vaginal_bleeding.type` is single-choice (`one`).** If two bleeding codes are both present (for example
intermenstrual and postcoital), only one preset fits.

- **Proposal:** the conversion becomes needs_choice for `type`.

**Merge rule (needed generally).** Several old codes feed one target:

| Old codes                        | Target              |
| -------------------------------- | ------------------- |
| fatigue, fatigue_malaise         | sym.fatigue         |
| oedema, ankle_leg_swelling       | sym.leg_swelling    |
| dyspnoea, dyspnoea_respiratory   | sym.breathlessness  |
| vomiting, nausea_vomiting        | sym.nausea_vomiting |
| dizziness, dizziness_vertigo     | sym.dizziness       |
| pruritus, itch_generalised       | sym.itch            |
| chest_pain, pleuritic_chest_pain | sym.chest_pain      |
| menstrual\_\*, dysmenorrhoea     | sym.periods_change  |

- **Proposal:**
  - any yes → yes;
  - all no → no;
  - yes against no on the same target → yes, with the contradiction on the review list;
  - presets on multi-choice properties are combined (union).

**D8. Some "no → all candidates" answers over-assert a negative.**

- "No weakness" (v1 system _neurological_) becomes "no" on `sym.fatigue`.
- "No lumps/swellings" becomes "no" on `sym.skin_lesion` (a flat changing mole is not a lump).

These follow rule #3 literally. Confirm, or drop `sym.fatigue` and `sym.skin_lesion` from the "no" set.

**D9. `sym.breathlessness` is complaint-only** (`in_review_of_systems: false`, H12). A v1 ROS answer on
`dyspnoea_respiratory` would land on a symptom the v2 Systems step never shows. `sym.weight_gain` (candidate in #3) is
also outside the ROS.

- **Alternative:** convert ROS answers on `dyspnoea_respiratory` to `sym.breathless_exertion`, but that is a narrowing.
- **Recommendation:** keep `sym.breathlessness` and render it on the review list.

**D10. The caution flag "Rectal bleeding: needs detail" (#6) is not a catalogue rule.** It is a new, conversion-only
flag that needs its wording signed.

- **Related:** the postmenopausal preset (`type=after_menopause`) _will_ fire the existing catalogue rule FLAG-PMB
  (caution) on conversion. That is expected and correct.

**D11. `functional_limitation` → Social history `activity`.** The field is `social_history.activity`, stored at
payload `history.social.activity`, with options `fully_active` / `limited` / `needs_help` / `bedbound`.

- #11 gives no rule for "no". My proposal is in row 70.

**D12. `sym.urgency` does not exist, as the brief expected.** Urgency does exist as an option, `storage=urgency`,
on the four symptoms in the LUTS family (`sym.frequency`, `sym.nocturia`, `sym.voiding_symptoms`, `sym.incontinence`),
alongside `urge_leak` and `stress_leak`.

**D13. Every other id the owner named exists.** The catalogue has all of:

- `sym.tinnitus`, `sym.heat_intolerance`, `sym.cold_intolerance`, `sym.nasal`, `sym.nosebleed`
- `sym.hoarse_voice`, `sym.muscle_pain`, `sym.muscle_weakness`, `sym.black_stools`
- `sym.speech_change`, `sym.difficulty_swallowing`, `sym.focal_weakness`
- `sym.self_harm_thoughts`, `sym.periods_change`, `sym.falls`, `sym.loss_of_appetite`, `sym.polyuria`

All preset options exist too: `aggravation.breathing_in`, `change.painful`, `type.between_periods`, `type.after_sex`
and `type.after_menopause`.

**D14. Sex applicability was never enforced in v1.** The v1 ROS is not filtered by sex: `loadRosScreen` has no sex
filter, and the gyn codes sit in `system='genitourinary'`, because `symptom_catalog` has no `gynaecological` system.
A male patient's v1 draft can therefore hold answers such as `postmenopausal_bleeding` absent.

- **Proposal:** an answer whose target has `applies_to_sex` not matching the patient is dropped and shown on the review
  list.

**D15. The file must cover more than the 89 codes.** Decision #1 ("reads only legacy-conversion.v1.json") will
regress tokens that convert today unless the file also covers:

- **27 CFC finding concepts** with no `symptomCode`, which were valid v1 complaint tokens. `sx.polyuria`,
  `sx.polydipsia`, `sx.blurred_vision` and `sign.lymphadenopathy` convert today through the token map.
- **The 17 codes added by 0076**, where a v1 draft is written after 0076 is applied (identity → `sym.<code>`).
- **Any shared codes promoted in production** by the 0044 governance (`origin='approved'`). These cannot be seen from
  the repo, so query production before signing.

**D16. The provenance of #12 has no field in payload v2 yet.** Neither `complaints[]` nor `ros` has one (gate-a §4).
This is implementation work only.

**D17. The token map counts differ from H10.** The CSV holds 56 matched / 23 broader / 17 propose; H10 says
54 / 25 / 17.

---

## 5. Token map check (#14)

These are rows where **the catalogue symptom is the broader side**, the reverse of the intended direction. At signing
(`commit.ts`), a yes on the broad symptom would be written as the narrow token, asserting a detail nobody recorded.

**Rows marked `broader` in the CSV:**

| Catalogue symptom                                | Token                   | Why it is reversed                                                                                                                            |
| ------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| sym.vaginal_bleeding (Abnormal vaginal bleeding) | intermenstrual_bleeding | `type` covers between periods, after sex, after menopause, heavy and in pregnancy. A postmenopausal bleed would be written as intermenstrual. |
| sym.falls (Falls or unsteadiness)                | gait_disturbance        | Overlap, not nesting: a fall from a blackout is not a gait disturbance.                                                                       |

**Rows marked `matched` that are also reversed** (outside the brief's filter, and they carry the same risk):

| Catalogue symptom                        | Token                                                      | Why it is reversed                                                                            |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| sym.periods_change (Change in periods)   | dysmenorrhoea                                              | `change` ∈ heavy/painful/irregular/missed; heavy periods would be written as painful periods. |
| sym.nausea_vomiting (Nausea or vomiting) | sx.vomiting                                                | Nausea alone would be written as vomiting.                                                    |
| sym.blurred_vision (Change in vision)    | sx.blurred_vision                                          | `type` ∈ blurred/double/loss/field/flashes; loss of vision would be written as blurred.       |
| sym.claudication (Leg pain on walking)   | sx.claudication ("Calf pain on walking, relieved by rest") | `site` includes thigh and buttock; `rest_pain` is an option.                                  |

**Rows marked `broader` that are really equivalent** (mislabelled, harmless):

| Catalogue symptom       | Token                         |
| ----------------------- | ----------------------------- |
| sym.breathless_exertion | exertional_dyspnoea           |
| sym.pnd                 | paroxysmal_nocturnal_dyspnoea |
| sym.heartburn           | heartburn_indigestion         |
| sym.frequency           | urinary_frequency             |
| sym.fits                | seizures_fits                 |
| sym.numbness            | numbness_paraesthesia         |
| sym.bleeding_tendency   | easy_bruising_bleeding        |
| sym.skin_lesion         | new_changing_lesion_mole      |
| sym.poor_sleep          | sleep_disturbance             |

**The rest of the `broader` rows are in the intended direction** (the old code is broader): weight_gain, loss_of_appetite,
abdominal_swelling, breast_lump, focal_weakness, memory_loss, speech_change, nasal, hair_loss,
heat_intolerance/cold_intolerance, and excess_sweating.

---

## 6. Proposed catalogue v1.1 additions (proposals only)

| Id                                        | Label                                                                                    | Why                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `sym.urgency`                             | Urgency to pass urine (wording for the CSO)                                              | #10; makes row 43 `convert`, with no text fallback. Family `luts`, system `gu`, standard. |
| `sym.presyncope` (optional)               | Nearly fainting (wording for the CSO)                                                    | Would let row 24 convert without borrowing `sym.dizziness`.                               |
| `sym.nail_change` (optional)              | Nail change                                                                              | Removes the text fallback in row 78.                                                      |
| Conversion flags (not catalogue symptoms) | "Rectal bleeding: needs detail" (caution); "Risk: needs review" (urgent or caution: CSO) | D5 and D10. These need signed wording and levels.                                         |

**Signature:** ☐ Table §2 as proposed ☐ The 2 missing codes (§3) ☐ D3, D6, D7, D8, D9, D11, D14 and the merge rule
☐ Token map corrections (§5) ☐ v1.1 proposals (§6)

---

## 7. Signed (2026-09-28)

**Signed by:** Fadhul (owner and CSO), in session, one decision per question. Every recommendation was taken.

| Item                         | Signed                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table §2                     | As proposed, with the answers below applied.                                                                                                                                                                                                                                                                                                |
| §3 `syncope_presyncope`      | needs_choice {sym.fainting, sym.dizziness}; "no" → sym.fainting no only.                                                                                                                                                                                                                                                                    |
| §3 `memory_cognitive_change` | needs_choice {sym.memory_loss, sym.confusion}; "no" → both no.                                                                                                                                                                                                                                                                              |
| D3 menstrual cycle / flow    | yes → needs_choice on sym.periods_change `change`, no preset; "no" → left out.                                                                                                                                                                                                                                                              |
| D4 pregnancy status, LMP     | Proposed for the clinician to confirm and written through `recordPregnancy` only then; LMP is a prompt for the date.                                                                                                                                                                                                                        |
| D5 `risk`                    | sym.self_harm_thoughts, review required, conversion flag **CONV-RISK, urgent, "Risk from previous format: assess now"**.                                                                                                                                                                                                                    |
| D6                           | A narrow "no" leaves the broader symptom not asked, and is shown on the review list.                                                                                                                                                                                                                                                        |
| D7                           | Two single-choice presets on one symptom → the clinician picks `type`.                                                                                                                                                                                                                                                                      |
| D8                           | Drop sym.fatigue and sym.skin_lesion from the "no" sets of `weakness` and `lumps_swellings`.                                                                                                                                                                                                                                                |
| D9                           | Keep sym.breathlessness; the answer is written in the note and charted though the Systems step does not list it.                                                                                                                                                                                                                            |
| D10                          | Conversion flag **CONV-PR-BLEED, caution, "Rectal bleeding: needs detail"**, while the choice is open.                                                                                                                                                                                                                                      |
| D11                          | "no" on `functional_limitation` offers `fully_active` for the clinician to confirm; never set without it.                                                                                                                                                                                                                                   |
| D14                          | An answer whose symptom does not apply to the patient's sex is dropped and shown on the review list.                                                                                                                                                                                                                                        |
| Merge rule                   | As proposed (any yes → yes; all no → no; yes against no → yes, contradiction listed; multi-choice presets combine).                                                                                                                                                                                                                         |
| Row 8 `itch_generalised`     | As proposed.                                                                                                                                                                                                                                                                                                                                |
| Row 43 `urgency`             | needs_choice over the LUTS symptoms with `storage=[urgency]`, or text; "no" left out.                                                                                                                                                                                                                                                       |
| Row 72 `polyuria_polydipsia` | "no" → sym.polyuria and sym.polydipsia both no.                                                                                                                                                                                                                                                                                             |
| D15                          | The table also covers the 17 codes of 0076 (identity) and every CFC finding concept without a code (155: 39 convert through the token map, 116 are carried as text).                                                                                                                                                                        |
| §5 token map                 | The three remaining reversed rows (sym.nausea_vomiting → sx.vomiting, sym.blurred_vision → sx.blurred_vision, sym.claudication → sx.claudication) get concepts of the right breadth in a CFC addendum: `docs/emr/cfc/cfc-v1.4-proposal.md`, awaiting signature. (CFC v1.2 M1 had already fixed vaginal bleeding, falls and periods change.) |
| §6 catalogue v1.1            | Later, as its own gate. Conversion is built against catalogue 1.0 with the fallbacks above.                                                                                                                                                                                                                                                 |

**Wording for a glance.** The two flags' `reason` lines (shown under the badge) were written at build time and are
hash-pinned with the table: CONV-RISK "Risk was recorded as present in the previous format, with no timing, plan or
action recorded"; CONV-PR-BLEED "Rectal bleeding or melaena was recorded in the previous format without saying which".

**Still open for the owner.** Codes promoted in production through the 0044 governance (`origin='approved'`) are not
visible from the repo. Until they have rows they carry across as text, never as findings. Query production and add
rows (a new table version and sign-off) if any exist.

### Built

| Piece              | Where                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table and sign-off | `data/clerking/legacy-conversion.v1.json`, `data/clerking/legacy-conversion-signoff.v1.json`; `npm run clerking:catalogue-check` checks the hash and every id |
| Converter          | `lib/clerking/convert.ts` reads only the table; `lib/clerking/legacy.ts` holds its schema; the v1 review of systems is now read (D2)                          |
| Provenance (D16)   | `history.converted` in payload v2: one line per v1 answer, the open choices, and text carried from the previous format                                        |
| Review list        | `components/clerking/conversion-dialog.tsx`: opens the first time; a strip stays while choices are open                                                       |
| Flags              | CONV-RISK and CONV-PR-BLEED on the Flags panel (`conversionFlags`)                                                                                            |
| Note and signing   | Systems-review text for carried words and open choices; answers on symptoms outside the Systems list are written and charted (D9)                             |
| Tests              | `tests/clerking/legacy-conversion.test.ts`, `tests/clerking/conversion-dialog.test.ts`                                                                        |
