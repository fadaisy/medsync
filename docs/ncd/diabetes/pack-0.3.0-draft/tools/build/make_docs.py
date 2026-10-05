#!/usr/bin/env python3
"""Write the three documents that travel with the pack. Every count comes from the build.

    python3 build.py && python3 make_docs.py
"""
import json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import lib, k_decisions
OUT = os.path.join(lib.ROOT, "out", "medsync-ncd-diabetes")
J = lambda rel: json.load(open(os.path.join(OUT, rel), encoding="utf-8"))
rep = J("BUILD-REPORT.json"); S = rep["summary"]; PACK = rep["pack"]
refs = J("dossier/ref-dm.v1.json"); log = J("review/REVIEW-LOG.json"); man = J("designb/pack-manifest.draft.json")
vig = J("vignettes/golden-vignettes.json"); cfc = J("wiring/cfc-addendum.proposal.json"); feats = J("catalog/01-features.json")
research = J("dossier/research-table.json"); recon = J("wiring/reconcile-ids.json"); ec = J("clerking-v2/00-engine-changes.json")
C = S["catalog"]; RC = S["recheck"]; V = PACK["version"]; B = S["beforeReview"]
LANE_ORDER = ["suspect", "confirm", "classify", "stratify", "act", "acute_route"]
rechecked = sum(v for k, v in RC.items() if k != "not_rechecked")
crit = [f for f in log["findings"] if f["severity"] == "critical"]
R = lambda k: [f for f in log["findings"] if f["review"] == k]
crit12 = [f for f in crit if f["review"] in ("R1", "R2")]; crit3 = [f for f in crit if f["review"] == "R3"]
n_dark = sum(1 for r in man["rules"] if r["x"].get("enabled") is False) if False else None
by_status = collections.Counter(f["status"] for f in log["findings"])
bodies = collections.Counter(); bodies_v = collections.Counter()
for c in research["claims"]:
    b = lib._bodies(c["standard"])[1]; bodies[b] += 1
    if c["verified"] and not c["from_memory"]: bodies_v[b] += 1
BODY_NAME = {"WHO": "WHO (HEARTS-D 2020, PEN, hyperglycaemia in pregnancy 2013 and 2025, TB and diabetes, CVD risk charts)", "ADA": "ADA Standards of Care 2026 (2025 where the 2026 page would not open)", "KDIGO": "KDIGO 2022 (diabetes in CKD) and 2024 (CKD)",
             "UG-MOH": "Uganda Ministry of Health (UCG 2023, HIV guidelines 2022, EMHSLU 2023, Eye Care 2016)", "IWGDF": "IWGDF 2023 (foot)", "ICO": "ICO 2017 (eye)", "IDF": "IDF", "ADA-EASD-CONSENSUS": "ADA/EASD and joint consensus reports (hyperglycaemic crises 2024, type 1 2021)",
             "NICE": "NICE (NG18, NG19)", "ISPAD": "ISPAD 2022", "JBDS": "JBDS", "ESC": "ESC 2023", "ENDO-SOC": "Endocrine Society", "OTHER": "Peer-reviewed studies and other bodies (Ugandan and African cohorts, laboratory standards)"}
feat_cfc = sum(1 for f in cfc["featureToConcept"] if f["concept"]); feat_none = len(cfc["featureToConcept"]) - feat_cfc
TIER_A = {1, 4, 10, 14, 20, 22, 28, 32, 33, 36, 37}
def dnum(d): return int(d["id"][-2:])

def decision_blocks(ds):
    out = []
    for d in ds:
        out.append(f"**{d['id']} · {d['title']}**  ")
        out.append(f"{d['question']}")
        out.append(f"- **Recommended:** {d['recommended']}")
        for a in d["alternatives"]: out.append(f"- Or: {a}")
        out.append(f"- Why it is open: {d['why']}")
        out.append(f"- Changes: {d['affects']}" + (f"  \n- **Needs from you:** {d['needsFromCso']}" if d["needsFromCso"] else ""))
        out.append("")
    return "\n".join(out)

def vignette_rows():
    rows = []
    for v in vig["vignettes"]:
        fired = [k for k in v["computed"]["fired"] if not k.startswith("DM-ACT-EDU")]
        dx = v["computed"]["diagnosis"].get("who_hearts_d_2020")
        bits = []
        if dx in ("met", "insufficient", "not_met") and not v["established"]: bits.append(f"diagnosis {dx.replace('_', ' ')}")
        if fired: bits.append(", ".join(fired[:5]) + (f" and {len(fired) - 5} more" if len(fired) > 5 else ""))
        dark = list(v["computed"].get("metButDark", {}))
        if dark: bits.append("dark: " + ", ".join(dark[:3]))
        wh = v["computed"].get("withheldForPregnancyAnswer", [])
        if wh: bits.append(f"{len(wh)} items wait for the pregnancy answer")
        cav = v["computed"]["caveatsInForce"]
        if not fired and not v["computed"].get("metButDark") and cav: bits.append("caveat in force: " + ", ".join(cav[:2]))
        if not v["computed"]["fired"] and not v["computed"].get("metButDark"): bits.append("no rule fires")
        elif not fired and not bits: bits.append("education only")
        rows.append(f"| {v['id']} | {v['title']} | {'district' if v['site'] == 'district' else 'referral'} | {'; '.join(bits)} |")
    return "\n".join(rows)

fam = man["families"]; lanes = man["lanes"]
open_part = [f for f in log["findings"] if f["status"] != "fixed"]

HANDBACK = f"""# MedSync diabetes knowledge pack: hand-back

**{PACK['id']} · version {V} · {PACK['generated']} · for the Clinical Safety Officer**
Draft content for dossier MS-NCD-DM-DOSSIER-001 (Gate 2). Extends `DIABETES_CATALOG` v0.1.0. Written against briefing commit `{PACK['briefingCommit']}`.

## Where this stands

The pack is complete as a draft and passes its own checks: {S['refs']} cited reference values, {S['criteria']} criteria, and {S['vignettes']} worked patients that run against the rules every time the pack is built. **Nothing in it is signed and nothing in it is live.** {len(k_decisions.D)} decisions are yours (section 3).

Four things to know before you read further:

1. **Uganda's own diabetes text has not been read.** No copy of the UCG 2023 diabetes sections could be opened past the front matter, and the 2026 Integrated Diabetes Management Guidelines would not open at all. The working default is WHO HEARTS-D 2020, which was read in full. Two empty criteria sets hold the place for the Uganda text. Section 10 lists the pages I need from you.
2. **A second reader re-checked {rechecked} of the reference values against their sources and found no wrong number.** {RC['confirmed']} were confirmed as written. {RC['confirmed_with_note']} needed a qualifier, an operator or a corrected attribution, and all of those corrections are applied. {RC['not_found'] + RC['could_not_open']} could not be found or opened in full; each is marked as needing your input, and none of them supplies a number to a live rule.
3. **Independent review found the pack unsafe to sign, twice, and both times it was right.** The first two reviews found {len(crit12)} critical gaps ({sum(1 for f in crit12 if f['review'] == 'R1')} in the rules, {sum(1 for f in crit12 if f['review'] == 'R2')} in the clerking wiring), almost all of them patients the rules stayed silent on: metformin with an eGFR below 30, a drowsy hyperglycaemic adult with no ketone result, a foot ulcer on its own, a fasting glucose of 3.2 shown as "at target". I fixed them. A second reviewer then re-read the fixes and found {len(crit3)} more critical problems, several of which the fixes themselves had caused: referral switched off under 16, no referral at the visit where diabetes is first found, an HbA1c the pack calls invalid still shown as "at target", interrupts firing on ordinary abdominal pain. Those are fixed too, each with a test patient.
4. **The second round of fixes has not been re-read by anyone but me.** I stopped the review loop there, as you asked me to finish. The pack is fit to go to you as a draft for your decisions. It is not fit to switch on. The build prompt makes a fresh independent clinical read the first step of Phase 1, before you sign anything.

## 1. Scope

**What the pack teaches the encounter system**

| You asked for | What the pack provides |
|---|---|
| Predict a diagnosis | Who to test ({len(J('catalog/10-suspect.json')['rules'])} rules: symptoms, risk, incidental results, pregnancy, HIV, TB, steroids, antipsychotics, pancreatitis, children). What confirms ({C['diagnosis'] + C['diagnosis_pending']} criteria sets, one live and seven held for a schema change or for the Uganda text). When a result cannot be trusted ({C['validityCaveats']} validity caveats). Every conclusion is one of four states: met, not met, insufficient, or not available at this site. |
| Risk-stratify | Type (rules that stop a lean young adult being assumed type 2; nothing writes a type). Control against the agreed target, with a LOW band. Hypoglycaemia risk. Eyes (new: ICDR grades and ICO macular oedema). Kidney, nerves and feet (amendments to what is built). Cardiovascular risk on the WHO chart for Eastern Sub-Saharan Africa, with the warning that it has not been validated there. |
| Suggest management | What is due and what was never done. Referral with its urgency ({sum(1 for f in J('catalog/50-act.json')['management'] if f['x']['kind'] == 'refer')} referral steps). What to teach. An individual target to agree. {C['therapyFlags']} medicine-safety flags. Class-level treatment review steps on WHO's ladder, switched off in the data (`enabled: false`) until you decide D-DM-20. Acute danger is routed to triage, never managed here. |

**Adults only.** Under 16 the pack recognises and refers; it shows no adult target, band, risk model, flag or treatment step (D-DM-32).

**Out of scope:** every dose and titration; the treatment of ketoacidosis, the hyperosmolar state and hypoglycaemia (owned by the acute pathway); paediatric management; glycaemic targets in pregnancy; insulin regimens; inpatient glucose control; the hypertension pack.

## 2. Research

{research['count']} claims were gathered from guidelines and studies on 3 October 2026, each recorded with its document, section and link, and with a verbatim quote wherever the source was read. {research['verified']} were read at the source; the rest are marked, and anything built on one of them carries `needsCsoInput`. The full table is `dossier/research-table.csv`.

| Body | Claims | Read at source |
|---|---|---|
""" + "\n".join(f"| {BODY_NAME.get(b, b)} | {n} | {bodies_v[b]} |" for b, n in bodies.most_common()) + f"""

**Where the sources disagree** (each is a decision in section 3)

- **Borderline glucose.** WHO starts impaired fasting glucose at 6.1 mmol/L, ADA at 5.6; ADA has an HbA1c band of 5.7 to 6.4% and WHO has none.
- **Meters.** WHO allows a meter for diagnosis where there is no laboratory; the laboratory guideline ADA follows does not (D-DM-04).
- **WHO HEARTS-D against itself.** BMI "≥25" in one figure and ">25" in another; ketones ">2+" and "≥2+"; glucose "≥18" and ">18"; fasting target "≤7.0" in the text and "<7.0" in the indicator table; metformin started at diagnosis in one protocol and after lifestyle advice in the other (D-DM-13, D-DM-34).
- **Eyes.** WHO every 2 years; ADA yearly; ICO by grade, and only where diabetes is controlled; Uganda's 2016 Eye Care Guidelines refer everyone to a retina clinic (D-DM-14).
- **Kidney.** An ACR of exactly 30 mg/mmol is moderately increased in KDIGO's table and severely increased in KDIGO's own figures (D-DM-17).
- **Blood pressure.** HEARTS-D treats at 130/80 in diabetes; WHO's hypertension guideline treats at 140/90 and makes 130 to 139 conditional (D-DM-23).
- **Ketoacidosis.** The 2024 consensus uses glucose 11.1 or known diabetes; HEARTS-D prints 13.9. The pack follows the consensus and records the other.
- **Uganda.** EMHSLU 2023 deleted glibenclamide; UCG 2023 reportedly still names it (D-DM-22). UCG 2023's HIV chapter lists "known diabetics" as a contraindication to dolutegravir (D-DM-33).

**What could not be read**

- UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5 and 20.2.3 (the reading tool stops in the front matter of every copy). Only the table of contents, the introduction and three passages of the HIV chapter were read.
- The 2026 Integrated Diabetes Management Guidelines for Uganda: not even the title.
- Uganda HIV Guidelines 2022 beyond about page 11; EMHSLU 2023 beyond about page 32.
- Three figures that are images: the C-peptide flowchart (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), HEARTS-D Fig. 1 (which step "review in 1 month" follows), and KDIGO 2024 Fig. 13 (cell positions were inferred from a text run and should be checked once by eye).
- KDIGO 2012 Table 7 (urine strip to albuminuria category) and the WHO HEARTS risk-based management module.

## 3. Decisions for the CSO

The first option is the recommendation. The machine-readable register is `decisions/d-dm.v1.json`; nothing is decided until you fill it in.

### Decisions that gate clinical use

{decision_blocks([d for d in k_decisions.D if dnum(d) in TIER_A])}
### Boundaries, wording and local settings

{decision_blocks([d for d in k_decisions.D if dnum(d) not in TIER_A])}
## 4. Catalog content

| File | Lane | Contents |
|---|---|---|
| `catalog/01-features.json` | | {sum(S['features'].values())} features: {S['features']['reuse']} seen in the briefing, {S['features']['reconcile']} probably present under this or another code, {S['features']['new']} new |
| `catalog/10-suspect.json` | suspect | {len(J('catalog/10-suspect.json')['rules'])} rules on who to test |
| `catalog/20-confirm.json` | confirm | {C['diagnosis']} live criteria set, {C['diagnosis_pending']} pending; {C['validityCaveats']} validity caveats; {len(J('catalog/20-confirm.json')['rules'])} pregnancy rules |
| `catalog/30-classify.json` | classify | {C['classifications']} classifications; {len(J('catalog/30-classify.json')['rules'])} rules. Both C-peptide criteria are held out |
| `catalog/40-stratify.json` | stratify | {C['complications']} complications with staging, {len(J('catalog/40-stratify.json')['complicationAmendments'])} amendments to live ones, {C['riskModels']} risk models, {C['targets']} target proposals, control and blood-pressure bands |
| `catalog/50-act.json` | act | {C['management']} management steps, {C['therapyFlags']} therapy flags, {C['orderables']} orderables |
| `catalog/60-acute-route.json` | acute route | {len(J('catalog/60-acute-route.json')['rules'])} rules that hand the patient to triage |
| `dossier/ref-dm.v1.json` and `.csv` | | {S['refs']} reference entries, {S['refsWithValue']} with a number, {S['refsUsedByARule']} read by a rule. **Every number in every rule is typed once, here** |
| `designb/pack-manifest.draft.json` | | {S['designBRules']} rules in {S['designBFamilies']} families, in the shape MS-NCD-ENG-001 specifies |
| `clerking-v2/*` | | {len(ec['engineChanges'])} engine changes; history, examination and impression amendments; {S['clerking']['planCare']} suggested-care items |
| `wiring/*` | | Test menu, formulary classes (no doses), concept proposals, and every catalogue id to resolve |
| `vignettes/golden-vignettes.json` | | {S['vignettes']} synthetic patients with expected and computed results |
| `decisions/d-dm.v1.json` | | {len(k_decisions.D)} decisions |
| `review/REVIEW-LOG.json` and `.csv` | | {len(log['findings'])} review findings, each with what was done |

**Rules of the pack that the build enforces.** No dose anywhere (a pattern check over every string). Every numeric predicate draws its value from a reference entry. Every reference number is found in the claim it cites. Every label states the numbers its predicates test. Every item that reads a restricted fact carries a neutral display, action and alternative, and none of them names a restricted fact. Every field a current glucose can be typed into is read by the low-glucose rule and the very-high-glucose rule. Every item that is switched off names the decision that switches it on. Every decision cited exists. Every clerking reference is used. All {S['vignettes']} patients compute what is expected.

**What changed from 0.2.0.** {C['rules']} rules (was {B['rules']}), {C['management']} steps (was {B['management']}), {C['therapyFlags']} flags (was {B['therapyFlags']}), {C['validityCaveats']} caveats (was {B['validityCaveats']}), {S['vignettes']} patients (was {B['vignettes']}). The tick-box "on insulin or a sulfonylurea" is gone: the engine reads the medicine list. Seven "never done" answers exist, so the never-tested and never-screened are no longer invisible. A blocking caveat acts by its direction: an undilated look that seems normal is not stored as normal, while proliferative disease seen on the same look still counts. A value under a blocking caveat is never shown as "at target". An interrupt needs a sign, not just a symptom, and each test prompt clears when its result is recorded.

**What is switched off in the data.** {sum(1 for f in J('catalog/50-act.json')['management'] if f['x'].get('enabled') is False)} treatment-review steps (D-DM-20), ADA's testing of everyone from 35 (D-DM-05) and the pregnancy OGTT prompt (D-DM-12). The evaluator reports them as "met but dark", so you can see what each would have said. The three steps that ask for less treatment (after a significant low; the frail older person on a sulfonylurea or on insulin) stay on with the safety flags.

## 5. Concept mapping (Clinical Fact Contract)

- {feat_cfc} features map to a concept that exists; {feat_none} have none yet (`wiring/cfc-addendum.proposal.json`, `featureToConcept`).
- {len(cfc['conceptsToPropose'])} concepts are proposed. {sum(1 for c in cfc['conceptsToPropose'] if c['status'].startswith('verify'))} of them probably exist already and are marked "verify": the proposal must be diffed against the generated concept catalogue before an addendum is written.
- {len(cfc['qualifiersNeeded'])} qualifiers are needed, above all glucose context and specimen: a rule may not read a glucose whose timing is unknown.
- {len(cfc['diagnosisTermToConcept'])} diagnosis terms map to condition concepts, {sum(1 for c in cfc['diagnosisTermToConcept'] if c['status'] == 'new')} of them new.
- `wiring/reconcile-ids.json` lists all {len(recon['ids'])} catalogue ids the clerking wiring names; {sum(1 for i in recon['ids'] if i['status'] != 'proposed')} must be found in the live catalogues in Phase 0. None is to be guessed.

The concept addendum and its seed migration are **gated: you apply them**. The next free migration number at the briefing was 0092.

## 6. Golden vignettes

Every patient is synthetic. The last column lists what the reference evaluator computed, by rule id (education steps omitted). The file holds the full expectation, including what must stay silent.

| Id | Patient | Site | The engine computes |
|---|---|---|---|
{vignette_rows()}

Removing a safety rule makes the build fail (checked by removing the clinical-picture rule, the low-glucose rule and the metformin flag), so the patients are not decorative. One patient is deliberately ordinary (DMV-80: well, controlled, everything checked this year): two teaching prompts fire and nothing else.

## 7. Mapping to Design B (MS-NCD-ENG-001)

| Lane | Rules |
|---|---|
""" + "\n".join(f"| {k.replace('_', ' ')} | {lanes[k]} |" for k in LANE_ORDER) + f"""

{len([r for r in man['rules'] if r['predicate'] and not r['predicate'].startswith('catalog.')])} of the {S['designBRules']} rules need code of their own, because the catalog grammar cannot hold a time window, a count across visits or the absence of a fact: the repeat on a different day, the look-back for an unfollowed result, "never tested", the recall date, the grade of a negative. They are specified in the manifest with their parameters, which are all reference entries.

| Invariant | How the pack keeps it |
|---|---|
| I1 Missing is never normal | Four-state evaluation; the empty record fires nothing and stages nothing (DMV-33); "never done" is an answer, not an inference |
| I2 A status falls only on evidence | The rule-out grade (D-DM-06); a blocking caveat makes a normal result insufficient (DMV-21, DMV-55) |
| I3 The engine proposes | Every output is a proposal; type, remission and target are clinician-owned; nothing writes a diagnosis |
| I4 One owner per danger | {len(J('catalog/60-acute-route.json')['rules'])} routing rules, each ending in a signal to triage or a bedside test, none with treatment text |
| I5 No dose, no titration | Build check over every string; D-DM-31 settles the words "stop" and "hold" |
| I6 Every output names its rule | Each rule carries its id, family, criteria set, reference entries and claim |
| I7 Engines exchange facts | Rules read features and clinician-confirmed states only |
| I8 Restricted facts stay restricted | Restricted classes ride with every item that reads one; neutral displays are mandatory |
| I10 Unsigned packs never run | Everything is `draft`; `csoSigned` is false throughout and the build fails if it is ever true |
| I11 No emergency red on NCD surfaces | Acute rules emit a signal to triage; the NCD surface shows where it went |
| I9, I12 | Not touched by content; for the engine build |

## 8. Schema and engine changes proposed

**NCD catalog schema**

| Id | Change | Why |
|---|---|---|
| S-DM-01 | Widen `StandardBody` (Uganda MoH, ICO, ISPAD, JBDS, NICE and others) | Today every such source is filed as "local" |
| S-DM-02 | `CriteriaSet.verdict` and `appliesTo` | Intermediate hyperglycaemia, gestational diabetes, diabetes in pregnancy and remission are not "diabetes: yes or no" |
| S-DM-03 | The WHO cardiovascular risk as a chart lookup | Import WHO's chart values; never type them |
| S-DM-04 | A screening interval keyed by two stage codes | KDIGO's monitoring grid |
| S-DM-05 | Computed formulas `months_since` and "none on record" | Due and never-done rules |
| S-DM-06 | A target-rule construct | Individual targets |
| S-DM-07 | Nested predicate groups | Today written as `any` plus `atLeast` with n = 1 |
| S-DM-08 | `notWhen`, `cautions` and `needsBeforeActing` on a rule or step | A rule's stop condition; a caution shown beside a proposal; "kidney function not known" |
| S-DM-09 | `ages` on targets, bands, risk models and flags | The under-16 rule reached only rules and steps |
| S-DM-10 | A blocking caveat acts by its direction, and reaches bands, targets and treatment-review steps | An invalid examination must not be stored as normal; an invalid HbA1c must not read "at target" |
| S-DM-11 | An inclusive upper edge on a band | Needed if you choose "at or below 7.0" in D-DM-13 |
| S-DM-12 | `neutralDisplay`, `neutralAction` and `neutralAlternative` on any item that reads a restricted fact | A tag cannot redact a string |
| S-DM-13 | A predicate op `recorded` (true when a value exists, never false), for `notWhen` only | A test prompt must clear when its result is on record |
| S-DM-14 | `enabled` with `enabledBy`, and `requiresCapability`, on a rule or step | "Off by default" must be a field the evaluator honours, not a sentence in a note |
| S-DM-15 | `notMetRequires` on a complication; `neverNotMet` on a classification | "No retinopathy" needs an examination able to show it; a negative antibody never refutes type 1 |
| S-DM-16 | Pregnancy "unknown" as a state that withholds, and names, what waits on it | An empty box is not "not pregnant" |

Until each is accepted, the content lives under the key `x`, outside the schema, and changes nothing.

**Clerking desk**

| Id | Change |
|---|---|
""" + "\n".join(f"| {e['id']} | {e['title']} |" for e in ec["engineChanges"]) + f"""

## 9. How this was checked, and what is still open

**The re-read.** Eight readers, each given a slice of the reference catalogue and told to refute it against the source.

| Verdict | Entries |
|---|---|
| Confirmed as written | {RC['confirmed']} |
| Confirmed, with a qualifier or attribution now corrected | {RC['confirmed_with_note']} |
| Wrong value | 0 |
| Wrong attribution (corrected) | {RC.get('wrong_attribution', 0)} |
| Not found in the pages that could be read | {RC['not_found']} |
| Source would not open | {RC['could_not_open']} |
| Added after the re-read | {RC['not_rechecked']} |

Limits of that check: sources were read through a text tool, several through mirrors, and long PDFs only to about page 50. A quote in this pack is evidence that a reader saw those words; it is not a substitute for your own spot-check before you sign.

**The reviews.** Three reviews by readers who had not seen the pack being built.

| Review | Read | Findings | Critical | Fixed | Fixed in part | Your decision | Phase 0 |
|---|---|---|---|---|---|---|---|
""" + "\n".join(f"| {name} | {read} | {len(R(k))} | {sum(1 for f in R(k) if f['severity'] == 'critical')} | {sum(1 for f in R(k) if f['status'] == 'fixed')} | {sum(1 for f in R(k) if f['status'] == 'fixed_in_part')} | {sum(1 for f in R(k) if f['status'] == 'cso_decision')} | {sum(1 for f in R(k) if f['status'] == 'phase_0')} |"
              for k, name, read in (("R1", "Clinical, first", "0.2.0"), ("R2", "Clerking wiring", "0.2.0"), ("R3", "Clinical, second", "the fixes to 0.2.0"))) + f"""

The second clinical reviewer ran about 230 patients through the reference evaluator and judged that only 2 of the first round's 11 clinical criticals were cleanly fixed; the rest were fixed too narrowly or had created a new problem. Every one of that reviewer's {len(R('R3'))} findings is answered in `review/REVIEW-LOG.json`. Read that as the measure of how much a single pass of fixes can be trusted, including the last one.

**The clerking wiring is in a weaker state than the rule catalog.** It was written from the briefing's samples without sight of the live catalogues, most of its findings are "fixed in part", it was not re-read in the second round, and it should be treated as a specification to reconcile, not as data to load.

**Still open**

""" + "\n".join(f"- **{f['id']}** ({f['severity']}): {f['done']}" for f in open_part) + f"""

**Not yet reviewed by anyone but me:** the answers to the second clinical review. Since version 0.2.0 the pack has gained {C['rules'] - B['rules']} rules, {C['management'] - B['management']} steps, {C['therapyFlags'] - B['therapyFlags']} flags and {S['vignettes'] - B['vignettes']} test patients; the last third of that has had no independent read. Phase 1 of the build prompt asks for one before you sign.

## 10. What I need from you

1. **UCG 2023** sections 1.1.6 (hypoglycaemia), 4.1.6 (hypertension), 8.1.3 and 8.1.4 (diabetes, ketoacidosis and the hyperosmolar state), 16.2.5 (diabetes in pregnancy) and 20.2.3 (diabetic retinopathy). Photographs of the pages are enough. Please name the printing: page numbers differ between copies (8.1.3 is page 469 in one and 471 in another).
2. **Integrated Diabetes Management Guidelines for Uganda (2026)**, if you have the file, and whether it is in force.
3. **EMHSLU 2023**, the endocrine and laboratory sections (levels of care for each medicine and test).
4. **Uganda HIV Guidelines 2022**, the dolutegravir and glucose algorithm (about pages 186 to 189) and the NCD section (about pages 237 to 251).
5. A look, by you or a colleague, at four figures: the C-peptide flowchart (Holt 2021 Fig. 1, reprinted as ADA 2026 Fig. 2.1), HEARTS-D Fig. 1 on page 16, KDIGO 2024 Fig. 13, and KDIGO 2012 Table 7.
6. Your answers in `decisions/d-dm.v1.json`.
"""

DEC_TABLE = "\n".join(f"| {d['id']} | {d['title']} | {d['recommended']} |" for d in k_decisions.D)
PROMPT = f"""# PROMPT: Teach the encounter system diabetes (NCD knowledge pack {V}, gated)

> **For Claude Code.** Work in the release folder (`~/Desktop/medsync-release`) on a new branch `feat/ncd-diabetes-pack`, cut from `main` (confirm at STOP 0 which branches carry `lib/ncd` and clerking v2).
>
> First copy the hand-over pack into `docs/ncd/diabetes/pack-{V}/`:
> - this prompt and `HANDBACK-NCD-DIABETES.md` (scope, research, decisions, what was checked, what is open);
> - `catalog/`, `dossier/`, `designb/`, `clerking-v2/`, `wiring/`, `vignettes/`, `decisions/`, `review/`;
> - `tools/` (the builder that produced the pack, with its research claims; `python3 tools/build/build.py --check` re-validates it).
>
> **Mode:** gated. Seven phases (0 to 6), each ending in a **STOP**.
> - Documents use Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - Code uses Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** Every criterion, threshold, rule, flag, wording and clinical mapping in this pack needs his signature before it is clinically live. Until then it runs in shadow mode only (invariant I10).
>
> **Migrations are GATED.** You write them; the owner applies them. Never edit a shipped migration. The next free number at the briefing was 0092; confirm it.

---

## 0. What we are building, in one paragraph

`lib/ncd` (Design A) is built and dark, with `DIABETES_CATALOG` v0.1.0. This pack is version {V} of the diabetes content: {S['refs']} cited reference values, {C['rules']} rules, {C['management']} management steps, {C['therapyFlags']} therapy flags, {C['validityCaveats']} validity caveats and {S['vignettes']} worked patients, organised in the six lanes of MS-NCD-ENG-001 (suspect, confirm, classify, stratify, act, acute route). It teaches the encounter to predict a diagnosis without overcalling one, to say how a person with diabetes is doing organ by organ, and to propose what is due, who to refer and what is unsafe. It carries no dose. Your job is to reconcile it with the repo, get it signed, load it as data, prove it with the vignettes, and wire it to the clerking desk, in that order and no faster.

---

## 1. Ground truth and reading order

1. **The repo wins on shape and mechanics.** The pack was written from a briefing of commit `{PACK['briefingCommit']}`, which showed samples, not the whole catalog. Wherever the repo differs (a feature code, an option value, a schema field, an evaluator rule), the repo is right: report the difference at STOP 0 and adapt the pack's shape. Never adapt the repo to the pack without a decision.
2. **The pack wins on clinical content**, and the dossier (`dossier/ref-dm.v1.json`) wins inside the pack: a number lives there once, and every predicate draws from it.
3. **The hand-back is the map.** Read `HANDBACK-NCD-DIABETES.md` in full before Phase 0. Section 9 says what is weak: the clerking wiring is a specification to reconcile, not data to load.
4. **Specs,** in this order: `lib/ncd/catalog/schema.ts`; MS-NCD-ENG-001 (lanes, state model, invariants I1 to I12, vignettes V01 to V26); `SPEC-CLINICAL-FACT-CONTRACT-v1.md`; `PROMPT-CLERKING-DESK-V2.md` and `PROMPT-CLERKING-EXAM-V2.md`; MS-RX-CAT-001.
5. **The reference evaluator** is `tools/build/build.py` (`ev_pred`, `ev_crit`, `run_vignette`). It defines what the pack means by met, not met, insufficient and unavailable, by `notWhen`, by a blocking caveat and by "pregnancy status needed". It is a specification in Python, not code to ship.

---

## 2. Laws (non-negotiable)

The standing laws apply unchanged: clinical content is data, not code; answers store catalogue ids; nothing is guessed silently; "not asked" is never a negative; restricted classes stay restricted; any new clinical mapping is CSO-signed; migrations are gated; never edit a shipped migration.

The pack adds these:

**N1. One number, one place.** A threshold is typed once, in a `REF-DM-*` entry. A predicate, a band edge, a label and a clerking reference all draw from it. Keep the build check that fails on a numeric predicate with no reference, and the check that a clerking reference equals the dossier entry it mirrors.

**N2. Nothing clinical is typed from memory.** Every citation is built from a research claim with a quote. If you need a number the dossier lacks, stop and ask; do not supply it. This applies with full force to the Uganda Clinical Guidelines: the two Uganda criteria sets are empty because nobody has read the text, and they stay empty until the CSO supplies it.

**N3. Four states.** Met, not met, insufficient, unavailable. A missing value never satisfies a predicate and never counts against one. A test this site cannot do is "unavailable", which is different from "not done".

**N4. "Never" is an answer.** The seven `never_*` features are true only when someone said so, or when Design B finds none in a record known to be complete. An unanswered question fires no "never done" rule.

**N5. No dose, no titration.** Keep the pattern check over every string. D-DM-31 decides which direction words a flag may quote.

**N6. Acute danger is routed.** The acute-route rules emit a signal to triage or ask for a bedside test. They carry no treatment text, and the NCD surface never uses the emergency red token (I11).

**N7. Under 16: recognition and referral only.** No adult target, band, risk model, flag, treatment step or suggested-care item. Phase 0 reports where the platform's adolescent band ends (D-DM-32).

**N8. A blocking caveat acts by its direction.** "Masks": a normal result is not trusted, an abnormal one stands. "Manufactures": an abnormal result is not trusted. "Unpredictable": neither. In a diagnostic criteria set any blocking caveat also stops a positive. A value under a blocking caveat is never banded, is never the measure of a proposed target, and is not read by a treatment-review step. The examination does not reset its screening interval. A caveat never suppresses an acute rule or a referral.

**N9. Restricted reasons never ride in a string.** Any item that reads an `hiv`, `tb`, `mental_health` or `sexual_reproductive_health` feature has a `neutralDisplay`. Surfaces without the class show that and nothing else.

**N10. Labels say what the predicates test.** Keep the check that a label states every reference number its predicates use. When you change a predicate, change its label in the same commit.

**N11. Held-out content stays out, and "off" is a field.** Both C-peptide criteria (`x.heldOut` on the type 1 classification); every item with `enabled: false`, until the decision named in `enabledBy` is signed; the pregnancy profiles until engine change EC-5 exists; every item marked `needs-cso` or `hold`. The evaluator reports a dark item as "met but dark" and shows it to nobody.

**N13. An interrupt needs a sign.** `immediate` is for deep breathing, acetone on the breath, dehydration, drowsiness, a glucose below 3.0 or of 33.3 or more, a meter reading HI or LO, a potassium of 6.5 or more, or chest pain or stroke symptoms. Vomiting or abdominal pain alone never interrupts. One interrupt per event. A test prompt clears when its result is recorded. Keep the ordinary-patient fixture (DMV-80) and its cap on what may fire.

**N14. An empty box is not an answer.** Pregnancy is unknown unless the person is male, the platform says it is not possible, or the answer is recorded; what waits on it is named. A blank medicine list is not "not on insulin" and not "on insulin". A blank type is not "type 2".

**N12. Reconcile, never duplicate.** The pack could not see the whole live catalog. Before adding any rule, flag or feature, look for the live equivalent. If one exists, keep the live id, compare the two, and report the difference.

---

## 3. What is in the pack

| Path | What it is | How to treat it |
|---|---|---|
| `catalog/00` to `60` | Content in the `NcdCatalog` shape; anything outside the schema is under `x` | Load as data after Phase 2 |
| `catalog/ref-usage.json` | Which reference entries each criterion reads | Regenerate; compare |
| `dossier/ref-dm.v1.*` | The reference catalogue with source, quote, re-read verdict and conflicts | The registry for N1 |
| `dossier/research-table.*` | All {research['count']} claims | Provenance; do not edit |
| `designb/pack-manifest.draft.json` | {S['designBRules']} rules as Design B `RuleDef`s | For Phase 4 |
| `vignettes/golden-vignettes.json` | {S['vignettes']} patients: `values`, `expect`, and `computed` by the reference evaluator | Port as fixtures; parity is the acceptance test |
| `clerking-v2/00-engine-changes.json` | EC-1 to EC-8 | Specification; each needs a decision |
| `clerking-v2/04`, `07`, `09`, `10` | Amendments to the three clerking catalogues and the suggested-care list | Specification to reconcile; apply by merge, with a diff |
| `wiring/*` | Test menu, formulary, concept proposals, `reconcile-ids.json` | Phase 0 input |
| `decisions/d-dm.v1.json` | {len(k_decisions.D)} decisions, recommendation first | The CSO fills it at GATE A |
| `review/REVIEW-LOG.*` | {len(log['findings'])} findings and what was done | {by_status['fixed_in_part'] + by_status['phase_0']} are yours to finish |

---

## 4. Phases and gates

### Phase 0: Discovery and reconciliation (no product changes)

Answer each question from the repo and write `docs/ncd/diabetes/phase-0-report.md`.

- **Q1 Branches and flags.** Where `lib/ncd` and clerking v2 live; which flags gate them; whether any Design B code exists.
- **Q2 Feature map.** For each of the {sum(S['features'].values())} features, the live code or "absent". Deliver `feature-map.csv` (pack code, live code, status, option map). Settle in particular: the options of `dm_status` (the pack adds `not_known`); the option codes of `glucose_lowering_therapy`; whether `!=` on a multi-select means "not selected"; whether a numeric age is available to predicates; how pregnancy is recorded and whether the platform can say "could be pregnant".
- **Q3 Age bands.** Where "adolescent" ends. The pack's rules assume adult from 16.
- **Q4 Schema.** Each of S-DM-01 to S-DM-12 (hand-back section 8): already possible, needs a field, or needs code.
- **Q5 Evaluator semantics.** Compare the live evaluator with the reference evaluator on AND, OR and `atLeast` over the four states, on capability gating, and on first-match staging. List every difference.
- **Q6 Overlap.** For every pack item tagged `x.review`, and every therapy flag, validity caveat and acute rule: does v0.1.0 already hold an equivalent? The first reviewer could not tell whether the live catalog already covers metformin below an eGFR of 30, a low glucose, or the hyperosmolar state. Table: pack id, live id, same or different, which is safer.
- **Q7 Validator.** Which live validator rules the pack trips (for example "a diagnostic band must match a diagnostic criterion", which the ketone table and the LOW band will meet).
- **Q8 Clerking ids.** Resolve all {len(recon['ids'])} ids in `wiring/reconcile-ids.json` against the live catalogues: found, found under another id, or absent. Never guess.
- **Q9 Engine changes.** For EC-1 to EC-8, what exists today. For the six "amend" profiles, a per-profile diff against the live profile.
- **Q10 Concepts.** Diff `conceptsToPropose` against the generated concept catalogue; map the glucose qualifiers to the fact model's own (`fastingState`, `challenge`, `specimen`).
- **Q11 Test menu and formulary.** The live entry shapes; what each pack entry lacks.
- **Q12 Migrations.** The next free number; whether anything here needs a table (it should not).

**Baseline:** run the live catalog's own tests and record the counts. Run `python3 tools/build/build.py --check` and record its summary (expect {S['vignettes']} vignettes, 0 errors).

**STOP 0.** Report Q1 to Q12, the feature map counts, the overlap table and every disagreement between the pack and the repo.

### Phase 1: GATE A (documents only)

Write `docs/ncd/diabetes/gate-a.md`:
- the decision register, D-DM-01 to D-DM-{len(k_decisions.D):02d}, each with the recommendation, the alternatives, and what Phase 0 found that bears on it;
- the {S['refsNeedCso']} reference entries marked `needsCsoInput`, and the items whose own citation is marked;
- the Phase 0 differences that need a ruling;
- the schema and engine changes to accept or decline, each with what falls dark if declined;
- **a fresh independent clinical read of version {V}, before anything else in this phase.** `review/` holds three reviews. The second clinical one (R3) re-read the first round of fixes and found 7 new critical problems; its own findings were then fixed and those fixes have had no reader. Give a reviewer the catalog, the vignettes, `review/REVIEW-BRIEF-3.md` and the reference evaluator; ask for patients the rules stay silent on, patients on whom too much fires, and results asserted as correct that are clinically wrong. Fix, add a fixture per fix, and repeat until a read finds no critical problem. Report every round to the CSO;
- the plan for Phases 2 to 6 and a signature block.

When the CSO supplies Uganda's text (UCG 2023 sections 8.1.3 and the others listed in the hand-back, or the 2026 guideline), add it the way the rest was added: a claim with its quote, a reference entry, then criteria in `ug_ucg_2023`. Show the WHO set and the Uganda set side by side and list every difference for his decision.

**STOP 1.** Nothing proceeds without signatures on the decisions that gate clinical use.

### Phase 2: Schema and evaluator (code, behind the flag, no clinical content)

Only what GATE A accepted. Likely: `verdict` and `appliesTo` on a criteria set; `notWhen`, `cautions`, `needsBeforeActing`; the `recorded` op; `ages`; direction-aware blocking that reaches bands, targets and treatment-review steps; the pregnancy-unknown state with named withheld items; `enabled` and `requiresCapability`; `notMetRequires` and `neverNotMet`; the three neutral strings; a widened `StandardBody`.

Tests:
- the four-state truth tables for AND, OR and `atLeast`, identical to the reference evaluator;
- an empty record fires nothing and stages nothing;
- adding a "not assessed" never turns "insufficient" into "met" or "not met";
- a blocking caveat acts by direction (DMV-21, DMV-55, DMV-74) and withholds bands and targets (DMV-65);
- an item with `enabled: false` is reported as dark and never shown;
- under 16, nothing but recognition and referral.

**STOP 2.** Test counts; the semantics table; flag-off behaviour unchanged.

### Phase 3: Load the content (data, shadow mode)

- Merge the pack into the catalog as `draft`, keeping live ids wherever Q2 and Q6 found one.
- Build the `REF-DM` registry with the N1 checks in CI.
- Port all {S['vignettes']} vignettes as fixtures. **Acceptance: the live evaluator's output equals `computed` for every patient**, field by field (diagnosis per set, fired rules with urgency, bands, stages, risk, targets, cautions, gaps, restricted classes). Where Phase 0 changed a code, map it; where the result differs for a real reason, stop and report it. Do not edit an expectation to make it pass.
- Mutation tests: removing any acute-route rule, any red flag or any blocking caveat fails at least one fixture.
- The content runs in shadow only: computed, logged, shown to nobody.

**STOP 3.** The parity table ({S['vignettes']} of {S['vignettes']}); reference usage; the list of pack items dropped as duplicates of live ones; the dose check and restricted-leak check, green.

### Phase 4: The rules the grammar cannot hold (Design B)

Only if GATE A says the Design B engine is in scope now; otherwise leave the manifest as the seam and skip to Phase 5.

Implement the {len([r for r in man['rules'] if r['predicate'] and not r['predicate'].startswith('catalog.')])} rules that need code (repeat on a different day, the look-back for an unfollowed result, "never tested" from a complete record, the recall and rescreen dates, the grade of a negative, the control state against an accepted target, the next-best test). Each takes its numbers from reference entries. Design B must also own what the reviews left to the engine: showing a prompt once per episode, holding routine items beside an interrupt, and "done at this visit". Map the spec's vignettes V01 to V26 to the pack's (`mapsToSpecVignettes`).

**STOP 4.** One fixture per rule, both ways; the state-model transitions exercised; I1 to I12 each with a test or a stated reason.

### Phase 5: The clerking desk

In this order, each behind `CLERKING_V2`:
1. The engine changes GATE A accepted (EC-1 result atom, EC-2 history detail, EC-3 glucose context, EC-5 pregnancy, EC-6 units and HI/LO, EC-7, EC-8). Anything declined removes the rules that need it; the catalogue check must then report them, not skip them.
2. The amendments, **by merge**, from the per-profile diff the CSO signed. Evidence "against" a must-not-miss diagnosis needs his explicit signature per atom; the pack lists none against hypoglycaemia, the hyperosmolar state or type 1, on purpose.
3. Flags, suggestions and the two classifiers (`ketone_band`, `dr_review`), with one positive and one negative fixture per rule.
4. The suggested-care list, unsigned and therefore empty in the product until he signs it.

**STOP 5.** The catalogue check with counts; rule coverage both ways; restricted items absent from patient-facing output; the flag-off desk unchanged.

### Phase 6: Concepts, menu, formulary, shadow report

- The concept addendum and its **gated** seed migration (you write it; the owner applies it).
- Test-menu entries in the live shape. Formulary classes and names in the live shape, with renal and high-alert flags and **no dose**.
- A shadow run over the development data: how often each rule fires, which never fire, which fire on more than a fifth of encounters (noise the CSO should see before sign-off).
- ADRs: content as data with a reference registry; four states and the two-way block; restricted classes with neutral displays; held-out content.

**STOP 6 (final).** The table in section 5, filled in.

---

## 5. Numbers to report at the final STOP

| Measure | Target | Result |
|---|---|---|
| Vignette parity with `computed` | {S['vignettes']} of {S['vignettes']} | |
| Numeric predicates with no reference entry | 0 | |
| Reference numbers not found in their claim | 0 | |
| Strings that look like a dose | 0 | |
| Items reading a restricted fact with no neutral display | 0 | |
| Rules or flags live on an unsigned reference | 0 | |
| Catalogue ids guessed | 0 | |
| Pack items dropped as duplicates of live ones | report | |
| Rules that fire on an empty record | 0 | |
| Outputs shown under 16 other than recognition and referral | 0 | |
| Acute-route rules whose removal no fixture notices | 0 | |
| Decisions signed / open | {len(k_decisions.D)} / 0 | |
| Review findings fixed / open | {len(log['findings'])} / 0, or each open one with a reason | |
| Shadow run: rules firing on more than 20% of encounters | report | |

---

## 6. Decisions (the CSO owns; recommendations given)

Full text, alternatives and reasons are in the hand-back, section 3.

| # | Decision | Recommendation |
|---|---|---|
{DEC_TABLE}

---

## 7. Out of scope (leave clean seams)

- Any dose, regimen or titration; the formulary's dose skeleton.
- The treatment of ketoacidosis, the hyperosmolar state and hypoglycaemia (the acute pathway).
- Paediatric diabetes management; glycaemic targets in pregnancy.
- The hypertension and CKD packs (this pack records where they will take over: blood pressure thresholds, the kidney monitoring grid).
- Patient-facing education content, SMS and reminders.
- Importing the WHO risk chart values (S-DM-03): a separate, checked import from WHO's published tables.

## 8. Definition of Done

- [ ] Phase 0 report accepted; every pack-versus-repo difference ruled on.
- [ ] The decisions that gate clinical use are signed; the Uganda criteria set is filled from the text the CSO supplied, or explicitly deferred by him.
- [ ] {S['vignettes']} of {S['vignettes']} vignettes at parity; mutation tests green; N1, N5, N9 and N10 checks in CI.
- [ ] Nothing held out has leaked in; nothing unsigned runs outside shadow mode.
- [ ] Clerking amendments applied by merge from a signed diff; no "against" atom on a must-not-miss diagnosis without a signature.
- [ ] The concept migration written, numbered and handed over, not applied.
- [ ] With the flags off, the product is unchanged.
- [ ] `review/REVIEW-LOG` has no open critical finding.

## 9. Parallel reminders (flag if touched)

- **Hypertension pack:** it will own the blood pressure rules this pack carries for now (130/80, the 200/110 and 180/110 referrals).
- **Monitoring engine:** it will own recall and the accepted target as a monitoring threshold.
- **HIV and TB programmes:** dolutegravir and glucose (D-DM-33) and the TB target are restricted classes; the NCD engine never proposes an ART or TB treatment change.
- **Pharmacy:** the Pharmacy Board of Uganda, never PSU. EMHSLU levels of care are unread for the endocrine section.
"""

README = f"""# MedSync diabetes knowledge pack {V}

{PACK['id']} · generated {PACK['generated']} · **draft: nothing here is signed or live**

Start with `HANDBACK-NCD-DIABETES.md`. It says what the pack is, what was checked, what is weak, and which {len(k_decisions.D)} decisions are the CSO's. `PROMPT-NCD-DIABETES.md` is the gated build prompt for Claude Code.

| Folder | Contents |
|---|---|
| `catalog/` | The rule content, by lane, in the `NcdCatalog` shape |
| `dossier/` | {S['refs']} reference entries (every number lives here once) and the {research['count']}-claim research table, as JSON and CSV |
| `vignettes/` | {S['vignettes']} synthetic patients with expected and computed results |
| `decisions/` | The CSO decision register |
| `review/` | {len(log['findings'])} findings from two independent reviews, with what was done about each |
| `designb/` | The pack manifest for MS-NCD-ENG-001 |
| `clerking-v2/`, `wiring/` | The clerking-desk specification, test menu, formulary classes and concept proposals |
| `tools/` | The builder, validator and reference evaluator, with the research claims they read |

To re-validate: `python3 tools/build/build.py --check` (Python 3, no dependencies). It fails on any dose-like string, any number without a reference, any label that does not match its predicate, any restricted leak, and any patient whose result differs from what is expected.
"""

for name, text in (("HANDBACK-NCD-DIABETES.md", HANDBACK), ("PROMPT-NCD-DIABETES.md", PROMPT), ("README.md", README)):
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(text)
    print(name, len(text.split()), "words")

import shutil, glob
TOOLS = os.path.join(OUT, "tools")
shutil.rmtree(TOOLS, ignore_errors=True)
os.makedirs(os.path.join(TOOLS, "build")); os.makedirs(os.path.join(TOOLS, "verify")); os.makedirs(os.path.join(TOOLS, "review"))
for f in glob.glob(os.path.join(HERE, "*.py")): shutil.copy(f, os.path.join(TOOLS, "build"))
os.makedirs(os.path.join(TOOLS, "research"))
for f in glob.glob(os.path.join(lib.ROOT, "research", "A*.json")): shutil.copy(f, os.path.join(TOOLS, "research"))
for f in glob.glob(os.path.join(lib.ROOT, "verify", "V*-results.json")) + [os.path.join(lib.ROOT, "verify", "VERIFY-BRIEF.md"), os.path.join(lib.ROOT, "verify", "V8-ucg.json")]:
    if os.path.exists(f): shutil.copy(f, os.path.join(TOOLS, "verify"))
for f in ("R1-clinical.json", "R2-clerking.json", "R3-recheck.json", "REVIEW-BRIEF.md", "REVIEW-BRIEF-3.md"):
    shutil.copy(os.path.join(lib.ROOT, "review", f), os.path.join(TOOLS, "review"))
shutil.copy(os.path.join(lib.ROOT, "review", "REVIEW-BRIEF-3.md"), os.path.join(OUT, "review", "REVIEW-BRIEF-3.md"))
open(os.path.join(TOOLS, "README.md"), "w").write("# Builder\n\n`python3 build/build.py --check` validates the pack and runs every vignette. `python3 build/build.py && python3 build/make_docs.py` rebuilds it into `tools/out/`.\n\n"
    "- `build/k_refs.py`, `k_fixes.py`: the reference catalogue and the corrections from the source re-read\n- `build/k_features.py`, `k_dx.py`, `k_strat.py`, `k_act.py`: the first draft of the content, by lane\n"
    "- `build/k_review.py`: every change made in answer to the three reviews, tagged with the finding id\n- `build/k_clerk.py`, `k_wire.py`: the clerking-desk and wiring proposals\n"
    "- `build/k_vignettes.py`, `k_decisions.py`: the test patients and the decision list\n- `build/build.py`: the validator and the reference evaluator (`run_vignette`)\n"
    "- `research/`: the claims every citation is built from\n- `verify/`, `review/`: the raw results of the re-read and the reviews, and the briefs the reviewers were given\n")
print("tools copied")
