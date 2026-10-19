# Lab parity inventory — quality / stock / equipment / hmis / register / reports

Repo: /Users/airm1/Desktop/medsync-labws2. All paths relative to it. Read-only survey, 2026-10-19.

## Shared pieces (used by many pages)

- **Gate `requireQualityScope(live = labQcLiveFor)`**: `app/lab/quality/_lib/scope.ts:16`. Calls `requireLabTechScope()` (`lib/lab-tech/scope`), then `notFound()` unless `scope.workspaceLive && emrV1LiveFor(h) && live(h)`. Returns `{scope, lead: has("lab.manage"), staff: lead || has("lab.result.release")}`. `ncLiveFor = labQcLiveFor || labEqaLiveFor` (:10).
- **Flags** (`lib/lab/feature.ts`): `labStockLiveFor`, `labEquipmentLiveFor`, `labQcLiveFor` (needs stock + units-ranges), `labEqaLiveFor`, `labPoctQualityLiveFor` (needs bedside + stock), `labHmisLiveFor`, `labReportsLiveFor`. All are phase3: LAB3 copy must be signed, and `labWorkspaceLiveFor` must be on.
- **`RecordList`** `app/lab/_components/record-list.tsx`: its **empty state has a dashed border** (:30, `border-dashed p-8`). Every RecordList below inherits this. `PatientNameMrn` (:85) renders the MRN in mono (an identifier, so fine).
- **`QcChip`** `app/lab/quality/_components/qc-chip.tsx`: tones are passed (check), amber, dark, and **dashed** (:24, `border-dashed`, used for "Not run today"/"Due today"/"To do"/"Not met"/HMIS draft status). `outcomeChip` (:31) is for EQA.
- **`Pop`** `app/lab/_components/pop.tsx:24`: an EditorDialog with a trigger button, a Cancel button and the action. `useAct`/`Said`/`Field` come from `app/lab/setup/criticals/_components/setup-forms.tsx:28/42/56`. `SignButton` (`app/lab/setup/drafts/_components/sign-button.tsx:16`) handles fresh-factor re-auth and an exception note for the author.
- **`PrintButton`** `app/lab/downtime/print/print-button` is used by stock/order and hmis/print.
- **Days/words**: `app/lab/_lib/days` (`dateWords`, `timeWords`, `dayWords`). **Month helpers**: `app/lab/hmis/_lib/month.ts` (`validMonth`, `monthOptions(now,n)`, `monthWords`, `dueWords`, `dueMonth`).
- **API route handlers**: none of these pages use `app/api/*`. The CSVs are client-side. HMIS uses a server action that returns a csv string, which the page turns into a Blob download. Reports uses a `data:` URI. `app/api/lab/report-scan/[reportId]` is unrelated.

---

## /lab/quality — Quality today

`app/lab/quality/page.tsx`

- Search params: none.
- Gate: `requireQualityScope()` (labQc). Within the page, `labEquipmentLiveFor` decides the "down" tile and list, and `labHmisLiveFor` decides the HMIS reminder.
- Loads (one tx): `loadQcPlans`, `heldReports`, `loadKits(h,userId)`, `loadNcs` (`lib/lab/qc-read`); `loadStock` (`lib/lab/stock-read`); `loadEquipment` (`lib/lab/equipment-read`); `labHmisReports` signed/exported months via a direct drizzle query. Then `hmisReminder` (`lib/lab/hmis105`), `identitiesFor(...,"lab_quality_today")` (`lib/emr/read/results`), `analyteName` (`lib/lab/qc-store`).
- Header has the link "Record a QC run" to `/lab/quality/qc` (:187).
- **Tiles** (`Tile` :37, a Link):
  - QC still to run, linking to `/lab/quality/qc`.
  - Results held by QC, linking to `#held`.
  - Lots expiring within the alert window, linking to `/lab/stock`. Its value is **"Alert window not set"** when `expiryWindowDays===null` (:198; copy `_lib/copy.ts:12`).
  - Equipment down, linking to `/lab/equipment`, shown only if equipment is on.
  - **Tile numbers are `font-mono tabular-nums`** (:44). These are counts, not identifiers.
- Table "Quality control, today" (RecordList, dashed empty) has columns What/Where/Last run/Status. Rows:
  - Plans: analyte links to `/lab/quality/qc/run?device={deviceId}&concept={conceptId}` (:116). Status is `qcWord`, rendered as a chip.
  - Kit lots that are due or quarantined: link to `/lab/quality/qc?tab=kits`.
- "Results held for quality control" (`#held`, RecordList): Patient (name plus MRN in mono, :240), Test linking to `/lab/results/{orderId}` (:251), Held chip, Released.
- "Needs you" aside:
  - HMIS reminder linking to `/lab/hmis?month={due}` (:150).
  - Each equipment that is down links to `/lab/equipment`.
  - "N items below minimum" links to `/lab/stock`.
  - "N open nonconformities" links to `/lab/quality/nonconformities`, with an overdue-actions caution.
- Actions: none.

## /lab/quality/qc — Quality control

`app/lab/quality/qc/page.tsx`

- Search params: `tab` (`kits` gives Kits and stains; anything else gives Analysers).
- Gate: `requireQualityScope()` (labQc). `lead` = lab.manage; `staff` = lead or lab.result.release.
- Loads: `loadQcPlans`, `loadKits` (`lib/lab/qc-read`); draft `labSignedConfigs` for author/lead-signed meta; `conceptDef` (`lib/facts/project/shared`) for the kit answer list.
- Tabs (links): "Analysers {n}" goes to `/lab/quality/qc`, "Kits {n}" goes to `/lab/quality/qc?tab=kits`. **The counts are shown inside the tab labels.**
- **Analysers tab**
  - RecordList What/Where/Last run/Status. Analyte links to `/lab/quality/qc/run?device=&concept=` (:99).
  - Lead only, "Open a QC plan": a plain GET form posting to `/lab/quality/qc/run` with a `device` select and a `concept` text input.
    - **The input has a visible concept id: `pattern="obs\.[a-z0-9_]+"` and `placeholder="obs.potassium"`, in `font-mono`** (qc/page.tsx:151-153).
  - Lead only, drafts list: each draft shows "Signed by the lead; waiting for the CSO" or **SignDraft** → `signQcConfigAction`.
  - Policy card: text "{minRuns} accepted runs over {minDays} days · sources" or `policyNone`.
    - Lead: **PolicyDialog** ("Edit") → `saveQcPolicyAction`. Fields: min runs, min days, sources textarea.
    - Lead: SignDraft for the policy draft.
- **Kits tab**: RecordList with columns Kit·lot (use by), Why due, Controls, Last, Status.
  - Lead: **KitRuleDialog** per kit (label "Edit" or the rule label) → `saveKitQcRuleAction`. Fields: trigger checkboxes, a weekly weekday select, a controls fieldset (Name, Expected select, Answer code **mono** qc-forms.tsx:943 or a criteria textarea), Add a control / Remove the last control, required-before-use, HMIS IQC, Source.
  - Lead: SignDraft for the kit draft.
  - Staff, when the lot is not quarantined: **KitCheckDialog** ("Record QC") → `recordKitQcAction`. Fields: trigger select, per-control radios or criteria checkboxes.
- Disabled buttons with no reason:
  - qc-forms.tsx:730, KitCheckDialog Save (`!complete`).
  - qc-forms.tsx:971, "Remove the last control" (`controls.length<=1`).

## /lab/quality/qc/run — one analyte on one analyser

`app/lab/quality/qc/run/page.tsx`

- Search params:
  - `device`: uuid, required, otherwise 404.
  - `concept`: must match `obs.[a-z0-9_]+`, otherwise 404.
  - `level`: the plan level number.
  - `days`: one of `Q.run.days` (20/50/90).
- Gate: `requireQualityScope()` (labQc).
- Loads: `loadQcSeries(tx,h,{deviceId,conceptId,days})` (`lib/lab/qc-read`). Lead only: control lots via a drizzle query (`labStockLots` ⨝ `labStockItems` with kind=control) and draft meta from `labSignedConfigs`.
- Back link to `/lab/quality/qc`. Header shows the analyte · unit and a device Pill.
- Level tabs and period tabs (links): `/lab/quality/qc/run?device=&concept=&level=&days=` (:56).
- Chart card:
  - **Target line in `font-mono tabular-nums`** (:170): mean ± SD, which are not ids.
  - `LjChart` (`_components/lj-chart.tsx`): an SVG with focusable points (tabIndex :128).
  - **Live readout in mono** (:154).
  - A `<details>` table of points. **Value and SD are mono** (:178-179). Lot is mono (:182, an id, fine).
  - **Axis labels are `tabular-nums`** (:105).
- **RunForm** (staff, when there is a plan) → `recordQcRunAction` (qc-forms.tsx:460).
  - Per-level table: control lot select, result input (**mono**, :596), target (**mono**, :599), SD (**mono**, :602), rules.
  - On a rejected run: amber copy, a first-step select, and "Other".
  - Submit says "Accept" or "Reject {analyte}". **It is disabled with no reason when `!decision` or when rejected and no first step is chosen** (qc-forms.tsx:669).
- No plan: `Q.run.noPlan` (plus `noPlanLead` for the lead).
- Plan aside, a dl:
  - Levels, Frequency, Reject on, Warn on, Hold if not run, On failure.
  - Target per level: **`font-mono tabular-nums` "label: mean ± sd · lot"** (:231).
  - Source text (lab or maker), with the progress line.
  - Lead: **SetTarget** ("Set this lab's target for {level}") → `setLabTargetAction`.
  - "Signed by" line, and the provisional-target note.
- Lead: **PlanDialog** ("Edit"/"Write") → `saveQcPlanAction`.
  - Fields: Unit, Frequency, n; per level label, control item, lot, Target mean (**mono** :366), SD (**mono** :374).
  - Add a level / Remove the last level. **Both are disabled with no reason** (qc-forms.tsx:383 `>=3`, :396 `<=1`).
  - Reject/warn rule checkboxes (rule ids in mono :260), 10-x, hold, Source.
- Lead: draft waiting ("Draft v{n} waiting") with SignDraft → `signQcConfigAction`, or "Signed by the lead; waiting for the CSO".

## /lab/quality/eqa — External quality assessment

`app/lab/quality/eqa/page.tsx`

- Search params: none.
- Gate: `requireQualityScope(labEqaLiveFor)`. `manage` = lead or `lab.eqa.manage`; `staff` as above.
- Loads: `loadEqa(tx,h,now)` (`lib/lab/eqa-read`).
- Top row, a coverage control:
  - With no tests: `E.noTests`.
  - With missing coverage: **CoverageDialog**, a read-only list whose label is "No EQA for n of m tests".
  - Otherwise: an "all covered" chip.
- Manage: **SchemeDialog** "New scheme" → `saveSchemeAction`. Fields: name, provider, rounds/yr, covers checkboxes, active.
- Staff, when there are schemes: **RoundDialog** "New round" → `recordRoundAction`.
  - Fields: scheme select, label, receivedOn **date** (eqa-forms.tsx:229), dueOn **date** (:237).
  - Sample rows (sampleId, analyte, kit) with "Add sample". **The analyte input shows a visible concept id: placeholder `obs.potassium`, mono** (eqa-forms.tsx:255,259).
- Schemes table (RecordList) has columns Scheme/Covers/Rounds/Next/Last.
  - Per row, manage: SchemeDialog "Edit".
  - Rounds column shows `E.notSet` when unset.
  - Next: due or overdue chip. Last: outcome chip plus "n of m acceptable".
- Rounds card (RecordList), columns Round/State/Open:
  - **RoundPanel** (ghost "Open", wide; read-only). Its table has sample id (mono, an id), analyte, **ours/target in `tabular-nums`** (:543-544), and the score.
  - Tested by, tester warning, NC link to `/lab/quality/nonconformities/{ncId}` (eqa-forms.tsx ~573, an `<a>`), report path as text.
  - **ResultsDialog** (staff, when not submitted) → `recordEqaResultsAction`. Fields: per-sample result, tested-by checkboxes, submittedOn **date** (:361). Shows a tester warning chip.
  - **ScoresDialog** (manage, when submitted with no outcome) → `recordEqaScoresAction`. Fields per sample: target, score, scoreKind, value, limit, bias. Then scoredOn **date** (:487) and report path.
- Alternatives card:
  - Period-none chip: "Period not set: alternative assessments..." (copy :338).
  - RecordList Test/Method/Done/Conclusion.
  - Manage: **AltDialog** → `recordAltAssessmentAction`. Fields: test, method, partner, doneOn **date** (:681), results, conclusion.
    - **The Partner input is disabled with no reason when method=retained_samples** (eqa-forms.tsx:674).
- Settings card: tester window (or default) and alt period (`E.notSet`).
  - Manage: **EqaSettingsDialog** (label reuses `E.editScheme`) → `saveEqaSettingsAction`.

## /lab/quality/bedside — Bedside quality

`app/lab/quality/bedside/page.tsx`

- Search params: none.
- Gate: `requireQualityScope(labPoctQualityLiveFor)`. `assess` = lead or `poct.assess`; `stock` = lead or `lab.stock.manage`.
- Loads: `loadBedsideQuality(tx,h,now)` (`lib/lab/bedside-quality-store`), plus the authors of the draft `labSignedConfigs`.
- Per bedside test card (devices listed, "blocked" marked):
  - Device control rule text, or a "No rule" chip.
    - Lead: **DeviceRuleDialog** → `saveDeviceQcRuleAction`. Fields: triggers, levels textarea, required, source.
    - Lead plus a draft: **SignBedside** → `signBedsideConfigAction`.
  - Validity text, or a "No validity" chip.
    - Lead: **ValidityDialog** → `saveCompetencyValidityAction`. Fields: valid days, grace days, source.
    - Lead plus a draft: SignBedside.
    - Lead plus validity: **SwitchOn** button → `grandfatherOperatorsAction`.
- Strip lots (RecordList, dashed empty) with columns Lot/Test/Use by/Ranges.
  - When not entered: an amber chip.
  - Stock role plus levels: **RangesDialog** "Enter ranges" → `setStripLotRangesAction` (low/high per level).
  - Otherwise: the "rule first" caption.
- Competency (RecordList) with columns Who/Test/Assessed/Valid to/Do.
  - Valid to: valid/grace check, lapsed amber, other statuses.
  - Assess role: **AssessDialog** → `recordCompetencyAction` (assessedOn **date** bedside-forms.tsx:432).

## /lab/quality/nonconformities — register

`app/lab/quality/nonconformities/page.tsx`

- Search params: none.
- Gate: `requireQualityScope(ncLiveFor)`.
- Loads: `loadNcs` (`lib/lab/qc-read`), plus the non-retired `devices` from a drizzle query.
- Header, staff: **OpenNcDialog** "Open a nonconformity" → `openNonconformityAction`. Fields: source select, title, machine select, what-happened textarea, risk textarea.
- RecordList (dashed empty) with columns:
  - Number: **`font-mono` link** to `/lab/quality/nonconformities/{id}` (:55; the NC number is an identifier).
  - Title, Source, Opened.
  - Status: closed, halted (dark chip), or open (amber), plus an overdue chip.

## /lab/quality/nonconformities/[id]

`app/lab/quality/nonconformities/[id]/page.tsx`

- Params: `id` (uuid, otherwise 404).
- Gate: `requireQualityScope(ncLiveFor)`.
- Loads: `loadNc(tx,h,id)` (`lib/lab/qc-read`), `identitiesFor(...,"lab_lookback")`, `analyteName`.
- Back link to `/lab/quality/nonconformities`. The h1 has the NC number in mono (:63, an id).
- "What happened" dl: source plus run time and rules, what happened, risk, owner ("No laboratory lead named").
- Actions RecordList: What/Who/By/State.
  - State: open shows a **dashed "To do" chip** (:113).
  - Open, staff, action open: **ActionState** has a "Done" button → `updateNcActionAction(done)`, and a "Cancel" Pop with a reason → `updateNcActionAction(cancelled)`.
  - Open and staff: **AddActionDialog** → `addNcActionAction`. Fields: what, who, by **date** (nc-forms.tsx:159).
- Look-back card (when there are rows or a run):
  - Window line. "Released: **N**", the count **in mono/tabular** (:137, not an id). Bias estimate and sort note.
  - RecordList Patient (MRN mono :164) / Value (**`font-mono tabular-nums` value+unit** :175, not an id) / Released / Sort / Decision.
    - Decision, when open and staff: **DecideItem** select plus "Record" → `decideLookbackItemAction`. "Record" is disabled until a choice is made (nc-forms.tsx:259, no reason).
    - Link "Amend first" to `/lab/results/{orderId}` (:202).
  - Progress line "n of m decided".
- Resume card (when halted): conditions list with Met (passed chip) or **Not met (dashed chip)** (:231). Resumed time.
  - Lead: **ResumeButton** "Authorise" → `authoriseResumptionAction`. **It is disabled when the conditions are unmet** (:242; nc-forms.tsx:279). The only reason is the conditions list above it.
- Close card: lead gets **CloseForm** → `closeNonconformityAction`. Fields: cause radios, effectiveness text, effectiveness-met checkbox, "Sign and close". Non-lead gets `closeNote`. When closed: summary text.

---

## /lab/stock — Stock and lots

`app/lab/stock/page.tsx`

- Search params: `f` is the filter: `all` | `below` | `expiring` | `quarantined` | `tracer`.
- Gate: `requireLabTechScope()`, then `notFound` unless `workspaceLive && emrV1LiveFor && labStockLiveFor`. `lead` = lab.manage; `keeper` = lead or lab.stock.manage.
- Loads: `loadStock(tx,h,now)` (`lib/lab/stock-read`), `loadLabSections(h)` (`lib/lab/read`), `devices` via drizzle.
- Header, keeper:
  - Link "Receive a delivery" to `/lab/stock/receive`.
  - **CountDialog** "Record a stock count" → `recordCountAction`. Per lot: a counted number plus a reason.
- Count-due caution and "Last counted".
- Filter tabs (links `/lab/stock?f=`). **Each carries a count in `font-mono tabular-nums`** (:161). The expiring label becomes "Expiring (window not set)" when the window is null (copy :15).
- RecordList (dashed empty) with columns:
  - Item (unit/pack).
  - On hand: **mono** (:187).
  - Months of stock: a bar plus the **number in mono** (:69), or "Not enough history"/"No use".
  - Nearest expiry: a **date in mono/tabular** (:195).
  - Status words.
  - Open: **ItemPanel**.
- **ItemPanel** (stock-forms.tsx:469, a ghost "Open", wide):
  - Print link `/lab/stock/order?item={id}` in a new tab (:499).
  - Attributes: monthly use, levels ("Not set"/"not set" months, copy :43-44), to-max, days out, tracer, expected/wastage.
  - Lots table: lot (mono, an id), **on hand mono** (:549), **use-by date mono** (:550), state words.
  - Keeper: **LotActions** (a lot select plus an action select: issue/inUse/quarantine/release[lead]/writeOff/adjust/return; quantity, bench, device, kind, concept, reason) with a "Save" button:
    - issue → `issueStockAction`
    - inUse → `setLotInUseAction`
    - quarantine → `quarantineLotAction`
    - release → `releaseLotFromQuarantineAction`
    - writeOff/adjust/return → `recordMovementAction`
    - **The concept field has the label "Component (optional, e.g. obs.creatinine)"** (stock-forms.tsx:727; copy `_lib/copy.ts:92`) and is mono (:731).
  - **PlanBlock**: the plan in force or "No plan".
    - Lead: method, triggers, samples, abs/%, combine, spread, qcAlso, certificate, source; Save → `saveAcceptancePlanAction`.
    - Lead plus a draft: exception note plus Sign → `signAcceptancePlanAction`.
  - Lead, outside the panel: **ItemDialog** "Edit" → `saveStockItemAction`.
- Footer, lead:
  - **ItemDialog** "Add an item" → `saveStockItemAction`. Fields: name, kind, unit, pack, tests/unit, tracer (mono), test codes (mono), **"Components (concepts, comma-separated)" raw concept ids, mono** (stock-forms.tsx:148-152; copy :121), min, max.
  - **SettingsDialog** "Operational settings" → `setStockSettingsAction` (number fields).
  - **SwitchOnDialog** "Lots on hand at switch-on" → `grandfatherLotsAction`. Fields: statement, rows of item/lot (mono)/use-by **date** (stock-forms.tsx:424)/quantity, "Add".

## /lab/stock/order — Print order request

`app/lab/stock/order/page.tsx`

- Search params: `item` (a single item id; otherwise every item below minimum or out).
- Gate: the same as /lab/stock (labStock), with no role check.
- Loads: `loadStock`.
- PrintButton (print). A table Item/Unit/On hand/Months/To reach max, with numbers in `tabular-nums` (:60-66, not mono). Shows "Not set" when there is no maximum (:67) and "Not enough history". Blank "Requested by" line.

## /lab/stock/receive — Receive a delivery

`app/lab/stock/receive/page.tsx`

- Search params: none.
- Gate: labStock as above, plus `notFound` unless `lab.stock.manage` or `lab.manage`.
- Loads: `loadStock`. When lots are waiting: `labQcRuns` ⨝ `devices` (accepted/warning, last 30 days, limit 50) and `labControlChecks` (pass) via drizzle.
- **DeliveryForm** (receive-forms.tsx:31) → `receiveDeliveryAction`.
  - Fields: from/supplier name/note.
  - receivedAt **datetime-local** (receive-forms.tsx:106, mono).
  - Lines: item, lot (mono), qty (mono), use-by **date** (:165, mono), cold-chain checkbox, damaged (mono), arrival note.
  - Remove line, "Add a line", Save.
- Waiting lots: an **AcceptCard** per lot (:243).
  - Comparison table (level/current/candidate **mono** :332-344) with within/outside.
  - QC evidence checkboxes. **The evidence label shows the raw concept id `${device} · ${r.concept} · time`** (receive/page.tsx:103).
  - Certificate, Reason.
  - **Reject** → `rejectLotAction`, **disabled until the reason has 3 or more characters, with no reason shown** (:416).
  - **Accept** → `acceptLotAction`, **disabled until `met`, with no reason shown** (:423).
  - Empty state: `C.waitingNone`, plain text.

---

## /lab/equipment — Equipment

`app/lab/equipment/page.tsx`

- Search params: none.
- Gate: `requireLabTechScope` plus `workspaceLive && emrV1LiveFor && labEquipmentLiveFor`.
- Roles:
  - `can.lead` = lab.manage.
  - `can.staff` = lead or lab.result.release.
  - `can.stock` = labStockLiveFor and (lead or lab.stock.manage).
- Loads: `loadEquipment(tx,h,now)` (`lib/lab/equipment-read`), `loadLabSections`.
- Header, lead: **EquipmentDialog** "Register equipment" → `saveEquipmentAction`.
  - Fields: kind, model, serial (mono), section, location, installedOn **date** (equipment-forms.tsx:145, mono), provider, contact.
  - **"Components it measures (concepts, comma-separated)": a raw concept id field, mono** (:168-172; copy `_lib/copy.ts:51`). Tests codes (mono).
- RecordList (dashed empty) with columns Equipment/Status/Maintenance/Calibration/Temperature/Open.
  - Status: down since, in use, other.
  - Tasks: overdue count, all done, last done.
  - Temperature: in or out of range with value, range, missing-reading cautions.
- **EquipmentPanel** (ghost "Open", wide):
  - Details dl.
  - If down:
    - Cause/reported/ticket. What doctors see per test, specimens to refer.
    - Back-when checklist (repair recorded, QC passed per component).
    - Staff: repair note plus repairAt **datetime-local** (:491) → `recordEquipmentLogAction(kind=repair)`.
    - **"Down for N min" in `font-mono tabular-nums`** (:523, not an id).
    - Lead: **Mark back in service** → `markBackInServiceAction`, **disabled until `ready`** (:529). The reason is implied by the checklist only.
  - If not down:
    - Fields: since **datetime-local** (:548, mono), cause, reported to, ticket (mono).
    - **Mark down** → `markDownAction`.
  - Tasks list: **task key shown raw in mono** (:614).
    - Overdue/required words.
    - Staff: "Record" → `recordEquipmentLogAction(kind=task.kind, taskKey)`.
  - Temperature (staff): a form with reading (mono), unit, readAt **datetime-local** (:687) → `recordTemperatureAction`.
    - Out of range: suggested lots, each lot shown in mono.
    - `can.stock`: "Quarantine" → `quarantineLotAction` (stock-actions).
- Lead, beside the panel:
  - EquipmentDialog "Edit".
  - **ScheduleDialog** "Schedule and range" → `saveScheduleAction`.
    - Task rows: task key (mono), kind, every-n, required-before-use.
    - "Add" button.
    - Range: min/max/unit/times.

---

## /lab/hmis — HMIS 105

`app/lab/hmis/page.tsx`

- Search params:
  - `month` is YYYY-MM, validated against the last 36 months; it defaults to the previous month.
  - `tab` is a key of `H.tabs` (default "10.2").
  - `rev` is the revision number (default latest).
- Gate: `requireQualityScope(labHmisLiveFor)`. `lead` = `lab.hmis.check` or `lab.manage`.
- Loads: `loadHmisMonth(tx,h,month,form)`, `manualKeys` (`lib/lab/hmis-store`), `hmisForm()` (`lib/lab/hmis-form`), `testCatalogue` names.
- Header: a GET form to `/lab/hmis` with a Month select (12 months) plus a hidden tab and "Show".
- Status chip: passed when signed/exported, otherwise a **dashed chip** (:114). Revision word, unverified-form caution, mapping-unsigned caution. Link "Mapping" to `/lab/hmis/mapping`.
- "Changed since signing" panel (amber):
  - **The change lines are `font-mono tabular-nums` with labels and old/new** (:144). Old and new are counts, so this mixes text and numbers in mono.
  - Lead, when latest is signed or exported: **ActButton "Prepare revision"** → `prepareRevisionAction`.
- Section tabs (links via `q({tab})`, which keeps month and rev).
- Table: `HmisTable` (`components/lab/hmis-table.tsx`).
  - **Numbers are `font-mono tabular-nums`** (:11 `num`). Row codes are mono (:134,:194, ids).
  - A nonzero, non-manual cell links to `/lab/hmis/records?month=&rev=&key=` (page :198).
  - "purpose not recorded" note on 10.3.
- Send card:
  - Due date line.
  - Lead: **ActButton Generate/Recount** → `generateHmis105Action`.
  - Lead plus a draft: **ActButton "Check"** → `checkHmis105Action`.
  - Link **Print form** to `/lab/hmis/print?month=&rev=` (:239).
  - Lead: **CsvButton** → `exportHmis105Action({month,revision,from:"lab"})`. It downloads the client blob `hmis105-lab-{month}-r{rev}.csv` and records the export.
  - csvNote.
- "How counted" card (static rules list).
- "Hand entered" card: lead plus a draft gets **ManualCellsDialog** "Enter hand counts" → `saveManualCellsAction` (number inputs **mono** hmis-forms.tsx:148).
- "Unmapped" card: caution list. A non-test value is printed raw (`u.replace(":",": ")`).
- "Revisions" list: links `?rev=` plus the **raw state word** (`r.state`, :302).

## /lab/hmis/mapping — HMIS mapping editor

`app/lab/hmis/mapping/page.tsx` plus `mapping/_components/mapping-editor.tsx`

- Search params: none.
- Gate: `requireQualityScope(labHmisLiveFor)`. `lead` as on /lab/hmis.
- Loads:
  - `mappingVersions`, `inHouseMenu`, `mappingBlocks`, `blockWords` (`lib/lab/hmis-store`), `hmisForm`.
  - `labStockItems`, `labEqaRounds.samples`, `hiv_algorithm` configs, `testCatalogue`.
  - `conceptDef`, `analyteName`.
  - V16 json (concepts/answers/testsV2).
- Header subline "Form {version} · file {hash.slice(0,12)}". Link back to `/lab/hmis`.
- Status words: in force since, "No mapping is signed yet", "waiting for the HMIS focal person".
- Editor sections:
  - 10.2 table: row code mono (:415). Sources text: **this falls back to the raw `s.conceptId` when the component name is missing** (~:421).
  - Per-row **RowDialog** "Edit": test select, component select, positive-count component, "Only when" answers.
  - 10.1: visits by encounter type and others.
  - 10.7, 10.3 (purpose checkboxes and others), 6 (tracer map).
  - Organisation unit code input (mono :603).
  - Tests in no row: "not reported" checkboxes, plus a "Not mapped" caution.
  - "What stops the signature" list of blocks.
- **Non-lead: every input is `disabled={ro}` with no explanation** (`ro=!lead` :364; inputs :473-623).
- Lead:
  - **Save draft** → `saveHmisMappingAction`.
  - **SignButton "Sign as laboratory lead"** → `signHmisMappingAction`. It is disabled while there are blocks; the reason is the blocks list above it.

## /lab/hmis/print — printable HMIS 105

`app/lab/hmis/print/page.tsx`

- Search params: `month`, `rev` (default 1). 404 when no report.
- Gate: `requireQualityScope(labHmisLiveFor)`.
- Loads: a drizzle query on `labHmisReports` ⨝ `users` (signer), `testCatalogue`, `hmisForm`, `cellKey`/`rowKey` (`lib/lab/hmis105`).
- PrintButton, with A4 landscape print CSS. Per section, a table Code (mono)/Row/columns with **values in `font-mono tabular-nums`** (:116). In 10.5, the label falls back to the raw `test.` key. Signature line.

## /lab/hmis/records — records behind one HMIS number

`app/lab/hmis/records/page.tsx`

- Search params: `month`, `rev`, `key` (`row|column`; 404 when not in the sources).
- Gate: `requireQualityScope(labHmisLiveFor)`. Restricted rows are visible only with `lab.result.release`.
- Loads: `labHmisReports.sources` (drizzle), `recordsFor` (`lib/lab/hmis-store`), `identitiesFor(...,"lab_hmis_records")`.
- **The subline shows the raw cell key** `key.replace("|"," · ")` (:~84). It can be a code or a `test.` id.
- Back link to `/lab/hmis?month=`.
- RecordList Patient (MRN mono :91)/Test (link to `/lab/results/{orderId}`)/When. Notes for hidden restricted rows and "other" rows.

---

## /lab/register — Daily register

`app/lab/register/page.tsx` plus `_components/register-forms.tsx`

- Search params:
  - `section` (a section id; default first).
  - `day` (YYYY-MM-DD, at most today; default today).
  - `register`: `general` | `hiv` | `tb` | `mental_health` | `sexual_reproductive_health`, limited by `classAccessFor`.
- Gate: `requireQualityScope(labHmisLiveFor)`.
- Loads:
  - `loadLabSections`.
  - `loadRegisterDay`, `registerConfigFor`, `classAccessFor`, `columnChoices`, `withIdentities` (`lib/lab/register-store`).
  - `dailyRegister` (`lib/lab/register`), `identitiesFor(...,"lab_register")`.
- A GET form to `/lab/register` with Section select, **Day `type="date"`** (register/page.tsx:110), Register select and "Show". The no-access note appears when there is no class access.
- **PrintRegister** "Print" → `printRegisterAction`, then `window.print()` (records the print event first).
- Lead: **RegisterColumns** "Edit columns" (wide Pop):
  - Include checkboxes, heading inputs, Up/Down.
  - "Save draft" → `saveRegisterConfigAction`.
  - With a draft: **SignButton** → `signRegisterConfigAction`.
- Defaults note and draft-waiting caution.
- A print article (black on white table): title, hospital · day, footer.

---

## /lab/reports — Lab reports and quality indicators

`app/lab/reports/page.tsx` plus `_lib/params.ts`

- Search params (`reportParams`, params.ts:16):
  - `month` (YYYY-MM within 36 months; default current).
  - `from`/`to` (YYYY-MM-DD, a range of 366 days or less; overrides month).
  - `ward` (uuid), `section` (uuid), `priority` (in ORDER_PRIORITIES).
  - `query()` rebuilds the string.
- Gate: `requireQualityScope(labReportsLiveFor)`.
- Loads:
  - `asClinicalReader(...)`, then `reportRows(tx, period)`.
  - `statedTargets`, `departmentNames`, `reportFromRows`, `reportCsv` (`lib/lab/report-store`, via an import block at :13-19).
- Header right: **CSV download** as an `<a href="data:text/csv...">`, `download="lab-reports-{month|from-to}.csv"` (:89). No route handler.
- Filter GET form to `/lab/reports`: Month select, **From `type="date"`** (:111), **To `type="date"`** (:115), Ward, Section, Priority, Show. The `notByWard` caption appears with ward/priority.
- `LabReportView` (`components/lab/lab-report-view.tsx`):
  - **8 tiles**: workload, late_pct, reject_pct, crit_ack_in_time, qc_reject_pct, misid_caught, corrected_pct, downtime_h. Each value is in **`font-mono tabular-nums`** (:16 `fig`, :95) and links to `/lab/reports/records?{query}&tile={id}`.
  - Turnaround per section: values in mono, drilling to `tile=tat&section={id|none}` (:125-129).
  - Rejections by reason table: counts in mono, drilling to `tile=reject_pct&reason={code}` (:202-206). Ward counts are in mono (:210).
  - "None." / no data.

## /lab/reports/records — records behind one number

`app/lab/reports/records/page.tsx`

- Search params: all of the report params, plus:
  - `tile` (a DrillId, 404 otherwise).
  - `section=none`.
  - `reason`.
- Gate: `requireQualityScope(labReportsLiveFor)`. Restricted rows need `lab.result.release`.
- Loads: `reportRows` via `asClinicalReader`, `statedTargets`, `drillRows`, `filtered`, `DRILL` (`lib/lab/report-store`), `releasedTurnaround`/`formatDuration` (`lib/lab/turnaround`), `testCatalogue`, `identitiesFor(...,"lab_report_records")`.
- Back link to `/lab/reports?{query}`.
- RecordList (dashed empty) with columns:
  - Patient (MRN mono :112).
  - Test: falls back to the raw `testCode`; links to `/lab/results/{orderId}`.
  - When.
  - Detail. The identity kind prints `reason.replaceAll("_"," ")`; qc_run prints `label · reason` raw.
  - Counted: Yes/No.

---

## Cross-cutting flags (quick list)

**Native date/time inputs**

- `type="date"`:
  - quality/\_components/nc-forms.tsx:159
  - bedside-forms.tsx:432
  - eqa-forms.tsx:229, :237, :361, :487, :681
  - stock/\_components/receive-forms.tsx:165
  - stock-forms.tsx:424
  - equipment-forms.tsx:145
  - reports/page.tsx:111, :115
  - register/page.tsx:110
- `type="datetime-local"`:
  - receive-forms.tsx:106
  - equipment-forms.tsx:491, :548, :687
- No `time` or `month` inputs. The month picker is a `<select>`.

**Visible concept ids**

- qc/page.tsx:151-152: pattern and placeholder `obs.potassium`.
- eqa-forms.tsx:255: placeholder `obs.potassium`.
- stock/\_lib/copy.ts:92: label "e.g. obs.creatinine", used at stock-forms.tsx:727.
- stock-forms.tsx:148 / copy:121: "Components (concepts, comma-separated)".
- equipment-forms.tsx:168 / copy:51: "Components it measures (concepts…)".
- stock/receive/page.tsx:103: evidence label prints `r.concept`.
- mapping-editor.tsx ~:421: falls back to `s.conceptId`.
- hmis/records/page.tsx subline: raw key.
- hmis/print/page.tsx 10.5: falls back to the `test.` key.

**Disabled buttons that show no reason**

- qc-forms.tsx:383, :396 (add/remove level).
- qc-forms.tsx:669 (run submit).
- qc-forms.tsx:730 (kit save).
- qc-forms.tsx:971 (remove control).
- eqa-forms.tsx:674 (partner input).
- nc-forms.tsx:259 (DecideItem Record).
- receive-forms.tsx:416 (Reject), :423 (Accept).
- mapping-editor.tsx:473-623: all inputs are read-only for non-lead, with no note.
- Reasons are only implied for:
  - nc-forms.tsx:279 / [id]/page.tsx:242 (Resume; conditions list).
  - equipment-forms.tsx:529 (Back in service; checklist).
  - mapping-editor.tsx:674 (Sign; blocks list).

**Non-identifier numbers in mono/tabular**

- quality/page.tsx:44 (tiles).
- [id]/page.tsx:137, :175.
- qc/run/page.tsx:170, :231.
- lj-chart.tsx:105, :154, :178, :179.
- qc-forms.tsx:366, :374, :596, :599, :602.
- eqa-forms.tsx:543-544 (tabular).
- stock/page.tsx:69, :161, :187, :195.
- stock/order/page.tsx:60-66 (tabular).
- stock-forms.tsx:306/549 (on hand), :550 (use-by date), :316.
- receive-forms.tsx:106, :159, :165, :197, :332, :341, :344.
- equipment-forms.tsx:145, :523, :548, :674, :687.
- hmis/page.tsx:144.
- hmis-forms.tsx:148.
- hmis/print/page.tsx:116.
- components/lab/hmis-table.tsx:11.
- components/lab/lab-report-view.tsx:16/95/125/202/210.
- (Identifiers in mono, which are fine: MRNs, lot numbers, NC numbers, row codes, sample ids, the task key at equipment-forms.tsx:614, rule ids at qc-forms.tsx:260.)

**Dashed-border empty states and chips**

- app/lab/\_components/record-list.tsx:30: the empty state of every RecordList on these pages.
- qc-chip.tsx:24, the dashed tone, used at:
  - quality/page.tsx:140
  - qc/page.tsx:283
  - \_lib/status.ts:25
  - [id]/page.tsx:113, :231
  - hmis/page.tsx:114

**"Not set" style strings**

- quality/\_lib/copy.ts:12 "Alert window not set" (tile, quality/page.tsx:198).
- quality/\_lib/copy.ts:258 "Not set" (EQA rounds and alt period).
- quality/\_lib/copy.ts:338 "Period not set: …".
- stock/\_lib/copy.ts:15 "Expiring (window not set)".
- stock/\_lib/copy.ts:43-44 "Not set" / "not set".
- stock/order/page.tsx:67 "Not set".

## Deep links to other lab routes (with ids)

- `/lab/quality/qc/run?device={uuid}&concept={obs.*}[&level=&days=]`: from quality/page.tsx:116, qc/page.tsx:99, qc/run/page.tsx:56.
- `/lab/quality/qc?tab=kits`: from quality/page.tsx:130.
- `/lab/quality/nonconformities/{id}`: from nonconformities/page.tsx:54 and eqa-forms.tsx RoundPanel (`<a>`).
- `/lab/results/{orderId}`: from quality/page.tsx:251, [id]/page.tsx:202, hmis/records, reports/records.
- `/lab/hmis?month={YYYY-MM}`: from quality/page.tsx:150 and hmis/records.
- `/lab/hmis/records?month=&rev=&key=`: from hmis/page.tsx:198 (HmisTable).
- `/lab/hmis/print?month=&rev=`: from hmis/page.tsx:239.
- `/lab/hmis/mapping`: from hmis/page.tsx:123.
- `/lab/stock/order?item={id}` (new tab): from stock-forms.tsx:499.
- `/lab/stock/receive`: from stock/page.tsx:132.
- `/lab/stock?f=`: from stock/page.tsx:153.
- `/lab/stock`, `/lab/equipment`: from quality/page.tsx.
- `/lab/reports/records?{query}&tile=[&section=|&reason=]`: from lab-report-view.

---

## ACTIONS

All are server actions. There are no API routes.

**qc-actions** (`lib/lab/qc-actions`)

- `signQcConfigAction`: quality/\_components/qc-forms.tsx (SignDraft). Used on /lab/quality/qc (plan drafts, policy draft, kit draft) and /lab/quality/qc/run (plan draft).
- `saveQcPolicyAction`: qc-forms.tsx PolicyDialog. /lab/quality/qc, policy card "Edit".
- `saveQcPlanAction`: qc-forms.tsx PlanDialog. /lab/quality/qc/run, aside "Edit/Write".
- `setLabTargetAction`: qc-forms.tsx SetTarget. /lab/quality/qc/run, plan aside "Set this lab's target".
- `recordQcRunAction`: qc-forms.tsx RunForm. /lab/quality/qc/run, Accept/Reject.
- `recordKitQcAction`: qc-forms.tsx KitCheckDialog. /lab/quality/qc?tab=kits, "Record QC".
- `saveKitQcRuleAction`: qc-forms.tsx KitRuleDialog. /lab/quality/qc?tab=kits, "Edit/Rule".
- `openNonconformityAction`: quality/\_components/nc-forms.tsx OpenNcDialog. /lab/quality/nonconformities header.
- `addNcActionAction`: nc-forms.tsx AddActionDialog. /lab/quality/nonconformities/[id].
- `updateNcActionAction`: nc-forms.tsx ActionState. /nonconformities/[id], "Done" and "Cancel".
- `decideLookbackItemAction`: nc-forms.tsx DecideItem. /nonconformities/[id], look-back "Record".
- `authoriseResumptionAction`: nc-forms.tsx ResumeButton. /nonconformities/[id], "Authorise".
- `closeNonconformityAction`: nc-forms.tsx CloseForm. /nonconformities/[id], "Sign and close".

**eqa-actions** (`lib/lab/eqa-actions`)

- `saveSchemeAction`: quality/\_components/eqa-forms.tsx SchemeDialog. /lab/quality/eqa, New scheme or Edit.
- `recordRoundAction`: eqa-forms.tsx RoundDialog. /lab/quality/eqa, New round.
- `recordEqaResultsAction`: eqa-forms.tsx ResultsDialog. /lab/quality/eqa, round row.
- `recordEqaScoresAction`: eqa-forms.tsx ScoresDialog. /lab/quality/eqa, round row.
- `recordAltAssessmentAction`: eqa-forms.tsx AltDialog. /lab/quality/eqa, alternatives.
- `saveEqaSettingsAction`: eqa-forms.tsx EqaSettingsDialog. /lab/quality/eqa, settings.

**bedside-quality-actions** (`lib/lab/bedside-quality-actions`)

- `saveDeviceQcRuleAction`: quality/\_components/bedside-forms.tsx DeviceRuleDialog. /lab/quality/bedside.
- `saveCompetencyValidityAction`: bedside-forms.tsx ValidityDialog. /lab/quality/bedside.
- `signBedsideConfigAction`: bedside-forms.tsx SignBedside. /lab/quality/bedside.
- `grandfatherOperatorsAction`: bedside-forms.tsx SwitchOn. /lab/quality/bedside.
- `setStripLotRangesAction`: bedside-forms.tsx RangesDialog. /lab/quality/bedside, strip lots.
- `recordCompetencyAction`: bedside-forms.tsx AssessDialog. /lab/quality/bedside, competency.

**stock-actions** (`lib/lab/stock-actions`)

- `saveStockItemAction`: stock/\_components/stock-forms.tsx ItemDialog. /lab/stock, Add an item and per-row Edit.
- `setStockSettingsAction`: stock-forms.tsx SettingsDialog. /lab/stock, Operational settings.
- `recordCountAction`: stock-forms.tsx CountDialog. /lab/stock header, Record a stock count.
- `grandfatherLotsAction`: stock-forms.tsx SwitchOnDialog. /lab/stock, Lots on hand at switch-on.
- `issueStockAction`: stock-forms.tsx LotActions. /lab/stock ItemPanel, action "issue".
- `setLotInUseAction`: stock-forms.tsx LotActions. /lab/stock ItemPanel, "inUse".
- `quarantineLotAction`, two callers:
  - stock-forms.tsx LotActions (/lab/stock ItemPanel, "quarantine").
  - equipment/\_components/equipment-forms.tsx EquipmentPanel (/lab/equipment, out-of-range "Quarantine").
- `releaseLotFromQuarantineAction`: stock-forms.tsx LotActions. /lab/stock ItemPanel, "release" (lead).
- `recordMovementAction`: stock-forms.tsx LotActions. /lab/stock ItemPanel, writeOff/adjust/return.
- `saveAcceptancePlanAction`: stock-forms.tsx PlanBlock. /lab/stock ItemPanel, Save plan (lead).
- `signAcceptancePlanAction`: stock-forms.tsx PlanBlock. /lab/stock ItemPanel, Sign (lead).
- `receiveDeliveryAction`: stock/\_components/receive-forms.tsx DeliveryForm. /lab/stock/receive, Save.
- `rejectLotAction`: receive-forms.tsx AcceptCard. /lab/stock/receive, Reject.
- `acceptLotAction`: receive-forms.tsx AcceptCard. /lab/stock/receive, Accept.

**equipment-actions** (`lib/lab/equipment-actions`)

- `saveEquipmentAction`: equipment-forms.tsx EquipmentDialog. /lab/equipment, Register equipment and Edit.
- `saveScheduleAction`: equipment-forms.tsx ScheduleDialog. /lab/equipment, Schedule and range.
- `recordEquipmentLogAction`: equipment-forms.tsx EquipmentPanel. /lab/equipment, repair record and task "Record".
- `markDownAction`: equipment-forms.tsx EquipmentPanel. /lab/equipment, Mark down.
- `markBackInServiceAction`: equipment-forms.tsx EquipmentPanel. /lab/equipment, Mark back in service.
- `recordTemperatureAction`: equipment-forms.tsx EquipmentPanel. /lab/equipment, temperature reading.

**hmis-actions** (`lib/lab/hmis-actions`)

- `generateHmis105Action`: hmis/\_components/hmis-forms.tsx ActButton. /lab/hmis, Generate/Recount.
- `checkHmis105Action`: hmis-forms.tsx ActButton. /lab/hmis, Check.
- `prepareRevisionAction`: hmis-forms.tsx ActButton. /lab/hmis, Prepare revision.
- `exportHmis105Action`: hmis-forms.tsx CsvButton. /lab/hmis, CSV (client Blob download).
- `saveManualCellsAction`: hmis-forms.tsx ManualCellsDialog. /lab/hmis, Enter hand counts.
- `saveHmisMappingAction`: hmis/mapping/\_components/mapping-editor.tsx. /lab/hmis/mapping, Save draft.
- `signHmisMappingAction`: mapping-editor.tsx SignButton. /lab/hmis/mapping, Sign as laboratory lead.
- `printRegisterAction`: register/\_components/register-forms.tsx PrintRegister. /lab/register, Print.
- `saveRegisterConfigAction`: register-forms.tsx RegisterColumns. /lab/register, Edit columns, then Save draft.
- `signRegisterConfigAction`: register-forms.tsx RegisterColumns SignButton. /lab/register.
