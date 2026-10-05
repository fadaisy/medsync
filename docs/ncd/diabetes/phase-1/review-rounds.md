## 1. Independent clinical review (Phase 1, before anything else)

The prompt requires a fresh independent read of the pack, fixed and re-read until a round finds no critical problem. Each round was a new reviewer who had not seen the pack being built, given the catalog, the vignettes, the previous brief and the reference evaluator, and told to assume the last round's fixes introduced errors. Every finding, the patient that showed it and what was done are in `pack-0.3.0-draft/review/REVIEW-LOG.json`; the fixes are in `tools/build/k_r4.py`, `k_r5.py` (and later rounds), each tagged with its finding id and proved by a test patient.

| Round | Read | Findings | Critical | Major | Of the criticals, caused by the previous round's fixes | Pack after fixes | Test patients |
|---|---|---|---|---|---|---|---|
| R4 | 0.3.0-draft (the hand-over) | 31 | 4 | 16 | 3 | 0.3.1-draft | 100 |
| R5 | 0.3.1-draft | 25 | 5 | 12 | 3 | 0.3.2-draft | 113 |
| R6 | 0.3.2-draft (with a 4,608-patient interrupt grid) | 29 | 5 | 12 | 2 (3 had always been there) | 0.3.3-draft | 121 |

**Why the fixes kept breaking things, and what changed.** In R4, R5 and R6 about a third of the criticals came from the previous round's patches: each fix changed one rule, and the rules disagreed on who 'has diabetes', on whether a meter HI counts as a glucose, and on which rule interrupts. After R6 the structure changed instead: one shared definition of diabetes for every acute rule; one interrupt per event, chosen by a declared order with the rest folded inside it; and the reviewer's 4,608-patient grid with a minimum-urgency table (D-DM-41) made a **failing build check**. At 0.3.3-draft the grid shows 0 patients below the floor, 0 double interrupts and 0 noisy ordinary visits, and a regression now fails the build instead of waiting for a reviewer.

**What the rounds changed, in clinical terms**
- Ketones: every band now has an owner. Normal blood ketones (below 0.6) or a negative strip clear a prompt; trace/1+ or 0.6–1.5 when unwell asks for a recheck and the diabetes team today; 1.6–2.9 is same day, and an interrupt with vomiting; 2+ or 3.0 and above interrupts in anyone with diabetes, whatever box was ticked (insulin, a sulfonylurea, an SGLT2 inhibitor or type 1 count as diabetes). On an SGLT2 inhibitor a urine strip never stands the ketoacidosis interrupt down.
- Hypoglycaemia: one interrupt per event; a blank medicine list is not "not on insulin"; any glucose below 3.9 with drowsiness interrupts whatever the medicines.
- Children: a sick child with diabetes and no glucose is asked for glucose and ketones now; known diabetes alone no longer reads as "suspected diabetes"; the vomiting child's interrupt needs a sign or a high glucose.
- Pregnancy and postpartum blood pressure (new, from UCG 2023 16.3.7): 140/90 asks for urine protein the same day, 160/110 interrupts, up to 6 weeks after birth.
- Hypertensive emergency (new, from UCG 2023 4.1.6.1): above 180/110 with drowsiness, organ-damage signs, chest pain or stroke signs interrupts.
- Noise: intermediate ketones in a well clinic patient, and routine gestational-diabetes visits, no longer raise same-day items.
- Three new decisions for you: D-DM-38 (glucose 18 or more without ketoacidosis: WHO PEN or HEARTS-D), D-DM-39 (blood pressure above 180/110 without organ damage: UCG admits), D-DM-40 (lower limits for older or high-risk people).
