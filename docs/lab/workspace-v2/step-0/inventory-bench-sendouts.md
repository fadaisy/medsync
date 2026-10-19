# Lab workspace parity inventory (bench + outward routes)

Repo: `/Users/airm1/Desktop/medsync-labws2`. All paths relative to `app/lab/` unless prefixed. Read-only; nothing edited.

Conventions used below

- Gate = what the page calls before rendering. `requireLabTechScope()` (lib/lab-tech/scope.ts) = auth + AAL2 + active lab affiliation + `lab.view` when LAB_WORKSPACE on. `scope.workspaceLive` = `labWorkspaceLiveFor` (lib/lab/feature.ts:18, env LAB_WORKSPACE). `emrV1LiveFor` = lib/emr/feature.ts.
- Gates that fail call `notFound()` (404), never a reason page.
- "No-reason disabled" = button disabled by a condition other than `pending` with no visible text explaining it.
- Shared form helpers live outside scope but are used everywhere: `useAct` / `Said` / `Field` from `setup/criticals/_components/setup-forms.tsx:28/42/56` (Said = polite live region, amber StatusWord on error); `SignButton` from `setup/drafts/_components/sign-button.tsx` (fresh-factor MFA).
- `Pop` (`_components/pop.tsx:24`) = centred EditorDialog with Cancel + action in footer; `selectClass`/`inputClass`/`newKey` (`lab3:<uuid>` client keys) from same file.

---

## layout.tsx (all /lab routes)

- Gate: `requireLabTechScope()` :51. `!scope.workspaceLive` → `LegacyLabLayout` :52/178 (old 52px top bar: MedSync link, "Laboratory · {hospital}" in font-mono 10px uppercase :193, name, Switch account, Sign out).
- Workspace on → `LabShell` (`_components/lab-shell.tsx`) → `WorkspaceShell` (components/medsync/workspace-shell.tsx): sidebar groups ungrouped / Quality / Reports / Exchange / Set-up (lab-shell.tsx:36-60), phone nav row (`LabPhoneNav`), crumb (`LabCrumb`), `who` = cadre · section, user + "MFA · AAL2" footer.
- **Emergency button: none.** Not in layout.tsx, lab-shell.tsx or workspace-shell.tsx (grep "emergency" in these = 0 hits). Only "emergency" in scope is priority word styling (worklist-screen.tsx:486).
- **Live channel indicator: none in layout.** Live indicators are page-level:
  - `LabLive` (components/lab/lab-live.tsx) in worklist header, worklist-screen.tsx:304, only when `payload.bench` (LAB_BENCH). Private channel `lab:<hospitalId>` broadcast "change"; up → caption "Live · new specimens appear by themselves"; down → amber StatusWord "Live updates paused. Refreshing every 15 seconds." + 15 s poll while visible; announces "N new specimen(s)" sr-only, ≤1/10 s.
  - `CriticalLive` (components/medsync/critical-live.tsx) on criticals list + detail: channel `user:<id>`, sr-only assertive region only, no visible indicator.
- **Nav counts** (layout.tsx:54-101), computed server-side on every /lab request:
  - `emr` = `emrV1LiveFor`. If emr: `Promise.all` of `labWorklistFor(h).inputs.length` (worklist), `releasedTodayFor(h).length` (released), `rejectedFor(h).length` (rejected), `countOpenCriticals(h)` if `criticalsLive` else 0 (lib/lab/page-data.ts, lib/lab/criticals/read.ts). Else worklist = `loadLegacyWorklist(h).length` (lib/lab-tech/worklist), rest 0.
  - `downtime` = `countFormsWaiting(h)` (lib/lab/downtime-read) when `labDowntimeLiveFor`; `matches` = `countMatchesWaiting(h)` (lib/lab/match-read) when `labReferralLiveFor`. Every other id count = null (no badge).
  - countLabel words :102-135: "{n} waiting", "{n} released today", "{n} rejected in 7 days", "{n} open critical alert(s)", "{n} waiting for a match", "{n} printed form(s) to enter".
  - Items filtered by `navFor(permissions, flags)` (lib/lab/nav.ts): worklist/released/rejected `lab.view`; criticals `f.criticals && lab.view`; downtime `f.downtime && lab.result.release`; to_refer `f.oneMenu`; referrals `f.referral`; connections/analysers `f.exchange`; matches/partners `f.referral`. Flags passed :136-156 (includes `isDemoHospital` DB call :156).
  - Nav entries with `exact` also light up on `${href}/results` (lab-nav.tsx:96) → Worklist highlighted on /lab/results/\*.

---

## /lab — page.tsx

- Params: searchParams `section` (section tab key: all/mine/none/<sectionId>), `stage` (LAB_STAGES key), `dept` (department id), `sort` (`test|from|stage|waiting`, `-` prefix = desc). Read :93-96, also re-read client-side from URL (worklist-screen.tsx:98) and pushed with history.pushState (:140-149).
- Gate: `requireLabTechScope()` :35. Branches:
  - `emrV1LiveFor && workspaceLive` → `SectionWorklist` (:50).
  - `emrV1LiveFor && !workspaceLive` → `EmrLabWorklist` (\_components/emr-worklist.tsx).
  - else → `LegacyWorklist` (:166), with note `LAB.worklist.legacy` when workspaceLive.
- Loaders: `labWorklistFor` (lib/lab/page-data → lib/lab/read loadLabWorklist) :58; `repeatTasks` (lib/lab/qc-store) when `ncLiveFor` (quality/\_lib/scope) :60; `identitiesFor(...,"lab_worklist")` (lib/emr/read/results; audited reveal) :64; `labBenchLiveFor` :81 adds `bench.questions`; `requestNow` server time :90.
- RepeatTasks block :110-160 ("Repeat when QC passes ({n})" count :123): per row name, MRN (font-mono, identifier :133), `analyteName(t.conceptId)` + value + number :139 (**visible concept id fallback**: analyteName returns raw conceptId e.g. `obs.*` when not in catalogue, lib/lab/qc-store.ts:56), "Released {date} {time}", link `/lab/results/{orderId}` :147, `RepeatDone` button.
- LegacyWorklist :166-270: counts total/ordered/collected in **font-mono** :186 (not identifiers); **dashed empty state** :202; table Patient/Test/Status/Waiting/Result; kind chip font-mono :229; loincCode font-mono :230 (code); Waiting age **font-mono** :248 (not identifier); `ResultRowActions` per row when `labResultsLive()` :251.
- EmrLabWorklist (emr-worklist.tsx): `loadEmrLabWorklist` (\_lib/emr.ts:93), `identitiesFor("lab_worklist")`; count text "{n} specimen(s) in the laboratory" :53; `LabWorklistView` + `SpecimenActions` (components/emr/results) → `receiveSpecimen`/`rejectSpecimen` (lib/emr/actions/orders), link `/lab/results/{orderId}` (specimen-actions.tsx:64).

### WorklistScreen (\_components/worklist-screen.tsx, client)

- Header (PageHeader) right slot: `LabLive` (bench only) :304; "Updated {HH:MM}" font-mono :306 (time, not id); **Refresh** button → `router.refresh()` :308-316 (disabled while refreshing). sr-only announce "refreshed" :320.
- Bench row (LAB_BENCH only) :323-328: `ScanReceive` + `FindSpecimen` (bench-bar.tsx).
- "No section assigned" note :330.
- Tabs: Section `TabList` :335 (options all/mine/none/sections with counts `t.count`); Stage `TabList` :347 (All + LAB_STAGES with `w.stageCounts`); Dept `<select>` :360 (only when depts exist; "All departments").
- Table (md+) `DataTable` :378, sortable columns test/from/stage/waiting; columns Patient (name + MRN font-mono :448) / Test (link `/lab/results/{orderId}` prefetch=false :226, RestrictedMark, HighRiskTag amber Biohazard, clinical question line under test when bench) / From / Priority (bold for immediate/emergency :486) / Stage (StatusWord neutral) / Waiting (`TurnaroundCell`) / action.
- Phone list (<md) :396-434 same content.
- Empty: `W.emptyAll` or `W.emptyMine(section, elsewhere)` + **Show all** button → setFilter section=all :283. Not dashed (DataTable empty).
- Footer count `W.footer(shown, total, section)` :438.
- RowAction :493-605 (one action per row; first actionable row primary):
  - receive + specimen: high-risk row first shows **Open procedure** :522 → reveals amber box with procedure link/text, checkbox "Procedure followed" :551, then **Receive** → `receiveSpecimen({surface:"lab", procedureFollowed?})` (lib/emr/actions/orders) :571. **No-reason disabled** :568 (`highRisk && !followed`; the checkbox is adjacent but nothing says why).
  - else link styled as button `/lab/results/{orderId}` "Continue"/"Enter results" :595.
- TurnaroundCell (\_components/turnaround-cell.tsx): late → amber LateChip (clock icon + words) + target in **font-mono** :32 (duration, not id); `ReleasedTurnaroundCell` same at :71.

### Bench bar (\_components/bench-bar.tsx, client)

- `ScanReceive` :32: form, label `B.scanLabel`, Input font-mono :121 (scanned label = identifier), submit on Enter → `receiveByLabelAction` (lib/lab/bench-actions) :59. Outcomes: received → polite + **Undo** button (5-min window, `UNDO_WINDOW_MS`) → `undoReceiveAction` :83/:133; procedure_first → amber alert with checkbox + **Receive** (**no-reason disabled** :171 `!followed`) + Cancel; not_collected → reason Input (min 3) + **Receive anyway** (**no-reason disabled** :220 reason<3) + Cancel.
- `FindSpecimen` :244: Input placeholder `F.label` + **Find** → `findSpecimenAction` :262; results list links `/lab/results/{orderId}` with labelNo font-mono :297 (identifier), "Voided" word.

### RepeatDone (\_components/repeat-done.tsx)

- **Repeat done** → `repeatDoneAction` (lib/lab/qc-actions) :25.

### ResultRowActions (\_components/result-row-actions.tsx, legacy list only)

- entered: amber chip "entered: {v} · not released"; **Release** → `releaseLabResultAction` :56; **Reject** toggles reason input; **Edit** toggles entry form.
- not entered: red chip "rejected — recollect" (red used for workflow state, :101) + **Enter result**/**Re-enter**.
- Reject row: Input placeholder "Reason (e.g. haemolysed — recollect)" :122, **Confirm reject** (red bg) → `rejectLabResultAction` :59; **no-reason disabled** :127 (reason<3).
- Entry form inputs: Value\* / Unit / Reference range / Specimen type / Specimen ID (placeholders :143-170), **Enter (unreleased)**/**Save** → `enterLabResultAction` :45; **no-reason disabled** :174 (value empty).
- All three actions in `actions.ts` (enter :88, release :182, reject :239) first try EMR path `emrEnter/emrRelease/emrReject` (\_lib/emr.ts:31/52/57) then legacy; refuse with ONE_PATH copy when `legacyWritesOpen` false.

---

## /lab/older — older/page.tsx

- Params: none. Gate: `requireLabTechScope` :30; 404 if `!workspaceLive || legacyWritesOpen(h)` (lib/lab/cutover-store) :31.
- Loader: inline Drizzle select encounterResults ⋈ encounterOrders ⋈ encounters, lifecycle="legacy", limit 200 :32-51; `identitiesFor("lab_older_results")` :52.
- UI: PageHeader "Older results"; **dashed empty** :73; table Patient (PatientNameMrn) / Test / Result (**font-mono** value+unit :99, not id) + "as typed" / State / When (**font-mono** date :105, not id). No actions, no links.
- Linked from /lab/released :46 only.

## /lab/released — released/page.tsx

- Params: none. Gate: `requireLabTechScope` :25; 404 if `!workspaceLive` :26. Data only when `emrV1LiveFor` else legacy note :43.
- Loaders: `releasedTodayFor` (lib/lab/page-data) :29; `identitiesFor("lab_released")`; `legacyWritesOpen` :45 → shows "Older results" link `/lab/older`.
- `RecordList` (shared, \_components/record-list.tsx): Patient / Test (link `/lab/results/{orderId}` + "Entered after downtime · paper form DT-00000") / Released (**font-mono** HH:MM :89, not id; + cadre) / Turnaround (`ReleasedTurnaroundCell`) / State (final/amended). Empty = **dashed** (record-list.tsx:30). Footer count `R.footer(n)` :109.

## /lab/rejected — rejected/page.tsx

- Params: none. Gate: same as released :29-30.
- Loader: `rejectedFor` (lib/lab/page-data) :33; `identitiesFor("lab_rejected")`.
- RecordList: Patient / Test (link `/lab/results/{orderId}`) / Rejected (**font-mono** date-time :84; + cadre) / Reason (REJECTION_REASON_TEXT) / Now (recollected HH:MM or awaiting). Dashed empty (record-list.tsx:30). Footer count :101.

---

## /lab/results/[orderId] — results/[orderId]/page.tsx

- Params: route `orderId`. No searchParams.
- Gate: `requireLabTechScope` :68; 404 if `!emrV1LiveFor` :69 or `!loadResultEntry(...)` :74. Feature gates inside: `unitsRangesLive` :77, `labQcLiveFor` :101, `labDeltaChecksLiveFor` :132, `criticalsLive` :142, `labHighRiskLiveFor` :165, `labBenchLiveFor` :169, `criticalFlaggingActive` :188 / `flaggingActiveFor` :186. Permissions: `lab.manage` :82, `lab.result.release` :150, `lab.qc.override` :273, `lab.receive` :321.
- Loaders: `loadResultEntry(scope, orderId, {mode:"direct", surface:"lab_result_entry"})` (lib/emr/read/results) :70; `fixedForOrder` (lib/lab/units-read) :78; `holdFor` (lib/lab/qc-read) :103; `flagsForOrder` (lib/lab/delta-read) :133; `previewRecipients` :151, `alertsForOrder` :160, `loadLabCriticals` :161 (lib/lab/criticals/read); `highRiskForOrder`, `loadBenchContext`, `loadRejectableSpecimen` (lib/lab/read) :166/170/174; `analyteName` (qc-store).
- Sections top→bottom:
  - "Back to the worklist" → `/lab` :178.
  - `FlaggingNotice` (\_components/flagging-notice.tsx): neutral line when on; amber CautionNotice when off.
  - Per critical alert :191-212: "Critical alert" + `AlertCell` (state StatusWord + "Correction") + link **Open the alert** `/lab/criticals/{alertId}` :202; amber Caution "not sent" when undelivered.
  - `HighRiskBlock` :356 amber, "Open the procedure" external link.
  - `DeltaPanel` (\_components/delta-panel.tsx): amber summary "{n} delta checks · {m} waiting for your decision" :50 (count); per flag: rule sentence; Previous / Now / Change in **font-mono** :76/80/84 (values, not ids); "Rule {ruleKey} v{ruleVersion}" :99 (internal key visible); **visible concept id**: `component[f.conceptId] ?? f.conceptId` :58 (raw `obs.*` when no display). Decided → StatusWord; else **Record your decision** dialog (Pop, wide) :120: select "Your decision" (7 outcomes), "Confirmed with" (only for confirmed_same_patient), "What you checked" → `recordDeltaOutcomeAction` (lib/lab/delta-actions) :135.
  - QC hold amber alert :218-253 (per blocked analyte, "elsewhere", "Releasing now sends the others…"); "QC not run" amber lines :254-267.
  - `QcHoldActions` (\_components/qc-hold.tsx): completion card **Release {analytes} now** → `releaseResults({surface:"lab", reportId})` (lib/emr/actions/results) :41/:56; override card (lab.qc.override) → `QcOverride` dialog (dynamic import, \_components/qc-override.tsx): reason Input, **Release past hold** → same `releaseResults({qcOverride:{reason}})`; **no-reason disabled** qc-override.tsx:41 (reason<3).
  - `BesideResults` grid: aside (bench) = `ClinicalQuestion` (\_components/clinical-question.tsx: question, ordered by, **Show the working diagnosis** → `revealWorkingDiagnosisAction` (lib/lab/bench-actions) :70, audited) + `SpecimenCard` (:403 payment, identity at collection, analyser, bench).
  - Main: `LabResultEntry` (\_components/lab-result-entry.tsx) when criticals live + not released + lab.result.release; else `ResultEntry` (components/emr/results/result-entry.tsx → `enterResults` / `amendResults`, lib/emr/actions/results).
    - ResultEntryView (components/emr/results/result-entry-view.tsx) controls: per-component value input (placeholder "e.g. <20" :415), Low/High range inputs (placeholders "Low"/"High" :447/457), unit confirm buttons :467/478, flag select :512, Conclusion, Uncatalogued rows ("Test name as typed"/Value/Unit, remove), amend reason "Why is it amended? (required)". Footer: **Save preliminary** (:307; **no-reason disabled** when entryIssues… — issues listed in "Before saving" list, so has reason), **Release final / Check and release / Release and alert** (:319; disabled when `releaseBlocked` → reason text :325), **Amend result** :298, **Save amendment** :302, **Save transcribed result** :334, **Uncatalogued test? Enter as typed** :343. Font-mono on MRN :115 and "Req {requisitionNo}" :120 (ids) and value inputs :417/449/459/621/656/666 (numbers).
    - LabResultEntry adds per-row **Mark critical / Marked** (:181) opening `MarkPanel` (\_components/mark-panel.tsx, inline region not dialog); footer note "{n} critical value(s) need a check before release" :170 (count). Release → `releaseWithCriticalMarkAction` (lib/lab/criticals/actions) :106.
    - MarkPanel: per marked value big value **font-mono** text-display-s :111 (value, not id), "{display}, low/high · Laboratory range…"; **Unmark** :126 (or "At or beyond the signed limit" locked); radio group Repeated (repeat value Input font-mono :157) / Checked, not repeated / Could not check (reason select + "other" text); checkbox sample checks :208; "Who is alerted" list + amber cautions; note textarea with counter "{n}/280" :266; second-check select + "working alone" Input :274-296; problems list "Before release" (reasons shown); **Release and alert** :314 (disabled with problems listed → has reason), **Edit results** :317, **Cancel** :320.
  - `RejectSpecimen` (\_components/reject-specimen.tsx) when unreleased + lab.receive: **Reject specimen** toggle :41 → ChoiceChips reasons → **Reject and ask for a recollection** → `rejectSpecimen({surface:"lab"})` (lib/emr/actions/orders) :70; **no-reason disabled** :66 (`!reason`).
  - `CriticalComm` (components/emr/results/critical-comm.tsx) when communicate target + criticals off → `recordCriticalCommunication`.

---

## /lab/criticals — criticals/page.tsx

- Params: none. Gate: `requireLabTechScope` :29; 404 unless `workspaceLive && emrV1LiveFor && criticalsLive` (lib/lab/criticals/readiness) :30-35.
- Loaders: `loadLabCriticals(h, now, LAB_TIME_ZONE)` (runs lazy escalation) :37; `identitiesFor("lab_criticals")` :38; `heartbeatStale` (lib/lab/criticals/escalation) :94.
- UI: `CriticalLive` :87 (sr-only); PageHeader; amber Caution escalations delayed / no response times; "SMS off" line :98.
- RecordList open alerts: Patient (link `/lab/criticals/{alertId}` wrapping PatientNameMrn :55) / Result (`MarkedValues`: values **font-mono** alert-bits.tsx:21, not id) / Marked (**font-mono** HH:MM :74 + cadre) / Alert (`AlertCell` StatusWord). Empty dashed (record-list.tsx:30).
- "Acknowledged today" section, same columns :108.
- No actions on list.

## /lab/criticals/[alertId] — criticals/[alertId]/page.tsx

- Params: route `alertId`. Gate same as list :33-39; 404 if `!loadAlertDetail` :44.
- Loaders: `loadLabCriticals` :42, `loadAlertDetail` :43, `identitiesFor("lab_critical_detail")`, `callTargets` (open only) :48 (lib/lab/criticals/read); `timelineLine` (lib/lab/criticals/words).
- UI: CriticalLive; "Back to Criticals" → `/lab/criticals` :63; title = patient name, subline MRN · age/sex · place; MarkedValues; "{test} · marked {HH:MM} by {cadre}"; AlertCell; Cautions (not sent / empty level / no response times); "Note to the doctor"; Timeline `<ol>` times **font-mono** :111 (times, not ids).
- Actions (open + `lab.result.release`): `CallLog` (\_components/call-log.tsx): select "Who did you speak to" (targets + "Not on MedSync" → Name/Role inputs), checkbox "They read it back", **Log call** → `logCriticalCallAction` :42 (**no-reason disabled** :117 `!ready`: nobody chosen / other name<2), **Could not reach anyone** → `couldNotReachAction` :55, "last level" note. Acknowledged → StatusWord "Acknowledged".

---

## /lab/downtime — downtime/page.tsx

- Params: none. Gate: `requireLabTechScope` :27; 404 unless `workspaceLive && emrV1LiveFor && labDowntimeLiveFor` :28-33; 404 unless `lab.result.release` :34.
- Loaders: `loadDowntime(tx, h, startOfLocalDay)` (lib/lab/downtime-store) :38; `labTests` (lib/lab/measures-setup) :40; `clinicianOptions` (lib/emr/read/results) :41.
- Subline count "{n} printed form(s) still to enter." :56.
- **EnterForm** (\_components/enter-form.tsx):
  - Form number select "DT-00000" :185; MRN Input **font-mono** :208 (identifier) + **Find** → `findPatientAction` :71 (**no-reason disabled** :214 MRN<3).
  - Patient line name / MRN font-mono :226 / age-sex; select "The request this form answers" (open orders + "A paper request, not in MedSync") → `testComponentsAction` :62; new-request: Test select, Requested by select.
  - **datetime-local** "Collected, from the form" enter-form.tsx:291; **datetime-local** "Result time, from the form" :301; "Released on paper by".
  - Per component: value Input **font-mono** :338 (number) or coded select; critical select (Not marked / repeated / checked, not repeated / no check written); repeat value Input **font-mono** :383 (number).
  - If any critical: fieldset "The call written on the form": Phoned to select, **datetime-local** "Time of the call" :411, checkbox "They read it back".
  - "If the form's times fall outside a recorded downtime, say why".
  - **Save** / **Save and next form** → `enterDowntimeFormAction` :124 (**no-reason disabled** :444/:452 `!formNumber || !collected || !resulted`). Result message "Saved as: resulted HH:MM, entered HH:MM."
- "Entered today" list :64-77 (form label · resulted · entered · released on paper by).
- **RecordDowntime** (downtime-forms.tsx:58): **datetime-local** Started :69, **datetime-local** Ended :78, Reason select (network/power/system/other), Note → **Record the downtime** → `recordPeriodAction` :115 (**no-reason disabled** :111 `!startsAt || !endsAt`). Last 5 periods list page.tsx:86.
- **PrintForms** (downtime-forms.tsx:18): "How many forms" Input **font-mono** :30 (a count, not id) → **Print blank forms** → `reserveFormsAction` :39 then full navigation to `/lab/downtime/print?from=&to=` :42.
- **RecordDrill** (downtime-forms.tsx:134): **date** "Held on" :145, Who took part, What was done, Problems → **Record the drill** → `recordDrillAction` :184 (**no-reason disabled** :180 `!heldOn`). "Last drill: {heldOn}" (raw ISO date string) page.tsx:110.

## /lab/downtime/print — downtime/print/page.tsx

- Params: searchParams `from` (first reserved form number), `to` (last); 404 unless integers, to≥from, span ≤200 :36.
- Gate: `requireLabTechScope` :26; 404 unless `workspaceLive && emrV1LiveFor && labDowntimeLiveFor` :27-32. **No `lab.result.release` check here** (downtime page has one).
- Loader: inline select `downtimeFormNumbers` state="unused" in range :37; `labHighRiskLiveFor` :50.
- UI: "{n} form(s) to print…" count :57; **Print** → `window.print()` (print-button.tsx:7); one A4 article per number: form label **font-mono** :72 (identifier), optional high-risk tick box, blank Patient/Request/Specimen/Results(8 rows)/Critical/Release sections.

---

## /lab/refer — refer/page.tsx

- Params: none. Gate: `requireLabTechScope` :34; 404 unless `workspaceLive && emrV1LiveFor && labOneMenuLiveFor` :35-40. `labReferralLiveFor` :41 picks the variant. Permission `lab.refer || lab.manage` → `canRefer` :219.
- Loaders: `loadLabWorklist` (lib/lab/read) :42; testCatalogue codes; `menuToday` (lib/lab/one-menu-read) :54; referral only: encounterOrders, `highRiskFor` (lib/lab/collection-store), `loadSendSpecimens`, `loadPartners`, `loadOpenManifests` (lib/lab/referral-read) :68-79; `identitiesFor("lab_to_refer")` :82.
- Referral off: RecordList Patient / Test (link `/lab/results/{orderId}`, "Restricted") / Why / Referred to. Dashed empty (record-list.tsx:30).
- Referral on: rows at bench only (AWAY states filtered :173-185); **dashed empty** "Nothing to refer today." :211; else `SendPanel`.

### SendPanel (refer/\_components/send-panel.tsx)

- Segment tabs (role=tablist) All / Not done here / Analyser down / High risk with counts in **font-mono** :121 (counts, not ids).
- Table: select checkbox (only specimen && !highRisk && canRefer) :156; Specimen lab number **font-mono** :166 (id); Patient + MRN font-mono :173 (id); Test + Restricted + High risk (amber); Why (amber clock when analyser down); Waiting "{h} h {mm}" **font-mono** :197 (duration, not id); Already sent to + **Make an aliquot** → `createAliquotAction` :437.
- High-risk notes per row (amber) :211 + **Record outbreak referral** dialog (Pop) :449: Destination select, IPC lead told, District surveillance focal told, Note → **Record** → `recordOutbreakReferralAction` :468 (**disabled** :488 `!partnerId`; reason partially shown "Add the outbreak destination under Partners first." :494 only when list empty).
- `Send` aside (canRefer) :240: heading "Send {n} specimen(s)" :312 (count); Destination select (partners, "(not signed yet)"), How it travels select, per-required-id scan Inputs **font-mono** :361 (placeholder "Scan {words}", "Scanned"/"Needed"), packing checkboxes, consent ref (abroad) → **Add to manifest** → `addToManifestAction` :292 (disabled :411; reason text shown :414 only when selection non-empty; with 0 selected the line "Select specimens in the list to send them." :315).
- `Manifests` :540: number **font-mono** :553 (id), partner · transport, StatusWord state; **Seal** dialog (Packages number input) → `sealManifestAction` :605; **Print** link → `/lab/refer/manifests/{id}/print` :564; **Hand over** dialog (Courier or rider) → `recordHandoverAction` :648; **Record receipt** dialog (How we know select, Received by, Number received, Condition checkboxes intact/leaking/broken/missing) → `recordManifestReceiptAction` :707.

## /lab/refer/manifests/[id]/print — refer/manifests/[id]/print/page.tsx

- Params: route `id` (manifest id). Gate: `requireLabTechScope` :27; 404 unless `workspaceLive && emrV1LiveFor && labReferralLiveFor` :28-33; 404 if `!loadManifest` :36.
- Loaders: `loadManifest` (lib/lab/referral-read) :35; `manifestRows` (lib/lab/manifest) :37; `code128Svg` (lib/lab/code128) barcode :64.
- UI: open → "Seal the manifest on To refer before printing it." (no print button); else **Print** → `printManifestAction` (lib/lab/referral-actions) then `window.print()` (print-manifest.tsx:20); "· Copy" on reprint. Sheet: number **font-mono** :67 (id), To/Travels by/Specimens count/Packages, rows #/Our lab no. (**font-mono** :110 id)/Their form no. (**font-mono** :111 id)/Specimen/Tubes/Test/Collected; signature grid; footer.

---

## /lab/referrals — referrals/page.tsx

- Params: searchParams `month` (YYYY-MM, default current Kampala month), `partner` (partner id filter), `view` (all|sent|back|waiting|overdue|rejected), `r` (selected referral id → detail aside).
- Gate: `requireLabTechScope` :46; 404 unless `workspaceLive && emrV1LiveFor && labReferralLiveFor` :47-52.
- Loaders: `loadReferrals(tx, h, {from,to,partnerId})`, `loadPartners`, `loadReferralEvents` (when `r` valid) (lib/lab/referral-read) :60-70; `nowWords` (lib/lab/referral-words); `identitiesFor("lab_referrals")`.
- Filter form GET `/lab/referrals` :129: Destination select, **`<input type="month">`** :148 (native month picker), **Show** submit.
- Tiles (links `?month=&partner=&view=`) :161-177 with counts in **font-mono** text-heading-m :108 (counts, not ids): Sent this month / Results back / Waiting for a result ("{n} overdue") / Sent to result back, average ("{x} days", per partner) / Rejected by the reference lab. Empty month shows "No data".
- Table :185: Referral number **font-mono** :212 (id) as link `?month=&view=&partner=&r={id}`; Patient + MRN font-mono :223; Test (+Restricted); To; Sent date **font-mono** :237 (date, not id); Now (`NowChip`: StatusWord or **dashed-border chip** now-chip.tsx:18); Expected date **font-mono** :243 (date, not id). **Dashed empty** :181.
- Detail aside (sel) :259: 5-step tracker Sent / With rider / At hub / At the lab / Result (late = amber border) ; events list date **font-mono** :306, event kind and reason code shown as raw enum with `_`→space :308-309; source line (partner message id slice).
- Actions (non-terminal): **Record an update** (UpdateDialog: What happened select, **datetime-local** "When (Kampala time)" referral-forms.tsx:99, Who said so select, rejection reason select, Note) → `recordReferralEventAction` :57; **Note a call** → `recordReferralEventAction(kind:"call")` :166; **Note the doctor's cancel** → `requestCancelAction` :215; **Mark lost** (sent only) → `markLostAction` :257. Link **Enter the result** → `/lab/referrals/{id}/result` :338 (sent, not completed/lost/rejected, routine).

## /lab/referrals/[id]/result — referrals/[id]/result/page.tsx

- Params: route `id` (referral id). Gate: `requireLabTechScope` :35; 404 unless `workspaceLive && emrV1LiveFor && labReferralLiveFor` :36-41; 404 if `referralForEntry` (lib/lab/referral-results-store) null :89.
- Loaders: testCatalogue, clinicalConcepts names, labComponentMeasures units, ucumUnits, lab colleagues (staffAffiliations ⋈ cadres LAB_TECH/LAB_TECHNOLOGIST), `scansFor` (lib/lab/referral-read) :43-88; `identitiesFor("lab_referral_result")` :91.
- Header: Tag "Referred" (sky hue), number · partner, patient name, MRN **font-mono** :109, their form no. **font-mono** :110. **Visible concept id**: component name falls back to raw conceptId `name.get(c) ?? c` page.tsx:118 (renders at result-form.tsx:250).
- `ResultForm` (result-form.tsx):
  - Identity section: Their form number (font-mono :153), Name as printed, Date of birth as printed (free text, placeholder "DD/MM/YYYY" :169; not a date input) → **Check against the referral** → `checkPaperIdentityAction` :86 (**no-reason disabled** :179 any field empty). Match → StatusWord check.
  - Report details: Reported by (readonly), Their report number (font-mono :198), Reported on (free text), Authorised by; table per component: value Input **font-mono** :255 (number), Unit select (ucum), Their range Input **font-mono** :278 (range, not id), Flag words, converted value.
  - Scan: `<input type="file">` PDF/JPG/PNG → `createScanUploadAction` :94, PUT to signed URL, `attachScanAction` :105.
  - Checker select ("Nobody else is on duty"), ward call text, checkbox "checker confirms the scan" (only with checker).
  - **Release to the doctor** → `releasePaperResultAction` :116 then `router.push("/lab/referrals")`; **no-reason disabled** :362 (`!matched || !uploaded`; the scan label hints "required before release", the identity requirement is not stated next to the button).

---

## /lab/exchange — exchange/page.tsx (Connections)

- Params: searchParams `view` ("today" → all today's messages; else open/not delivered).
- Gate: `requireLabTechScope` :60; 404 unless `workspaceLive && emrV1LiveFor && labExchangeLiveFor` :61-66. Permissions: `lab.exchange.manage` (manage) :70; `lab.refer.result || lab.result.enter` (file) :71.
- Loaders: `loadExchangeTiles`, `loadConnections`, `loadMessages` (lib/lab/exchange-read); `countMatchesWaiting` (lib/lab/match-read); `loadPartners` (lib/lab/referral-read); `backToFile` (lib/exchange/store) :74-80.
- Tiles `<dl>` :89 values **font-mono** :103 (counts/times, not ids): Delivered today ("{in} in · {out} out"), Retrying ("{n} · oldest HH:MM"), Needs a person, Waiting for a match.
- Connections card: **Pair a machine** (manage) PairDialog (connection-forms.tsx:22: What it is select partner/bridge, Partner select, Name → **Make the code** → `createPairingCodeAction` :30, FreshFactor MFA re-prompt; code shown **font-mono** tracking-widest :71 (id)). Each connection: name · partner, state words (amber when quiet/retrying); **Check and enable** (pairing + fingerprint) EnableDialog → `enableSenderAction` :125 (fingerprint Input font-mono :151, FreshFactor); **Revoke** → `revokeSenderAction` :190. Static rows for non-connected partners, CPHL/NHLDS, NLDR, A-LIS.
- "Results back, to file" :179: link `/lab/referrals?r={referralId}` :192 (deep link with id), **File on the order** → `fileElectronicResultAction` :319 (fileOk).
- Messages: nav links "Not delivered" `/lab/exchange` / "All today" `/lab/exchange?view=today` :218; table Message id slice **font-mono** :258 (id) / Way / Partner / About / State (amber for dead/unreadable/retrying + explanation) / Last try time **font-mono** :277 (time, not id) / Actions (manage): **Fix the cause, then retry** and **Set aside** (DeadDialog, Why → `retryOrSetAsideAction` :230), **Open the message** (RawDialog, reason → `openRawAction` :278, raw shown in `<pre>` font-mono :290).

## /lab/exchange/partners — exchange/partners/page.tsx

- Params: searchParams `p` (selected partner id; default first).
- Gate: `requireLabTechScope` :56; 404 unless `workspaceLive && emrV1LiveFor && labReferralLiveFor` :57-62. `lab.manage` = lead (edit/sign) :64.
- Loaders: `loadConnections` (lib/lab/exchange-read) :65; `loadPartners`, `loadReferralSettings` (lib/lab/referral-read); testCatalogue lab menu; labSignedConfigs drafts (authoredBy) :66-91.
- Lead bar :105: **Add a partner** (PartnerDialog: Name, Kind select, transport textarea, results-return textarea, contact, phone, Active checkbox → `savePartnerAction` partner-forms.tsx:64); **Referral settings** (SettingsDialog: minutes number, stop days number, **`type="month"`** HMIS 10.4 from partner-forms.tsx:491 → `savePartnerConfigAction` :447); state words; **Sign the settings** (SignDraft → `SignButton` → `signPartnerConfigAction`, fresh-factor; self-author must give exception note).
- Partners table: name link `?p={id}` :165 + kind; How results come back; Agreement (amber PDPO expired/review passed); Data leaves Uganda; Connection (StatusWord). **Dashed empty** :129.
- Selected partner: "Tests and turnaround · {name}" + state; **Edit partner** (PartnerDialog prefilled) :227; **Edit tests** (TestsDialog :183: rows Our test select / Their code / Specimen category / Stated turnaround number / Unit / Identifiers; **Add a test**; Source; **`type="date"`** Its date :326 → `savePartnerConfigAction` :211 "Save draft"); tests table Our test (falls back to raw testCode :280) / Their code **font-mono** :282 (id) / turnaround / needs; **Sign the tests**; Packing per category: items list, **Packing: {cat}** (PackingDialog: items textarea :382, Source, **`type="date"`** Its date :397 → `savePartnerConfigAction` :360), **Sign the packing**.
- "What we send them" (fields, raw keys with `_`→space :352) and "Legal record" read-only.

## /lab/exchange/matches — exchange/matches/page.tsx

- Params: searchParams `i` (selected waiting item id; default first).
- Gate: `requireLabTechScope` :61; 404 unless `workspaceLive && emrV1LiveFor && labReferralLiveFor` :62-67 (note: referral flag, not exchange). Resolve permission `lab.match.resolve || lab.manage` :87.
- Loaders: `loadMatches`, `matchMonth` (lib/lab/match-read); colleagues query :70-85.
- UI: matching-rule note; table Arrived (date **font-mono** :131, link `?i={id}`) / From / In the message / Why it is here (amber StatusWord; raw reason fallback). **Dashed empty** :102. Month tiles counts **font-mono** :156 (counts): Filed by themselves / Waited here / Filed after confirming / Sent back.
- Aside: "Against {referralNumber}"; comparison rows Same (check) / Differs (amber) / Cannot compare; raw check key fallback `CHECK[c.check] ?? c.check` :175.
- Actions (`ResolveDialog`, match-forms.tsx → `resolveMatchAction` :45): **Ask the reference lab** (primary), **File after confirming** (method select, spoke-to, second person select), **Not ours, send back**, **Set aside**; each with "Why". (`keep_unordered` defined but not rendered.)

## /lab/exchange/analysers — exchange/analysers/page.tsx

- Params: none. Gate: `requireLabTechScope` :27; 404 unless `workspaceLive && emrV1LiveFor && labExchangeLiveFor` :28-33.
- Loaders: inline select `devices` kind=analyser active :35; `loadConnections` :46.
- UI: Bridges card (none → link `/lab/exchange`); each bridge Pairing / amber not heard / Connected · last heard. Analysers table: model link `/lab/equipment` + serial **font-mono** :122 (id) / "Waiting for {model}'s interface document" / "Typed by hand"; empty → link `/lab/equipment`. No actions.

---

## Cross-cutting hit lists

### Native date/time inputs

- downtime/\_components/downtime-forms.tsx:69 datetime-local (Started)
- downtime/\_components/downtime-forms.tsx:78 datetime-local (Ended)
- downtime/\_components/downtime-forms.tsx:145 date (Held on)
- downtime/\_components/enter-form.tsx:291 datetime-local (Collected)
- downtime/\_components/enter-form.tsx:301 datetime-local (Result time)
- downtime/\_components/enter-form.tsx:411 datetime-local (Time of the call)
- referrals/\_components/referral-forms.tsx:99 datetime-local (When, Kampala time)
- referrals/page.tsx:148 month (filter)
- exchange/partners/\_components/partner-forms.tsx:326 date (tests source date)
- exchange/partners/\_components/partner-forms.tsx:397 date (packing source date)
- exchange/partners/\_components/partner-forms.tsx:491 month (HMIS 10.4 from)
- (none of type="time")

### Visible concept ids / internal keys (no literal "obs." string in app/lab; ids leak via fallbacks)

- page.tsx:128,139 `analyteName(t.conceptId)` → raw conceptId when unknown (lib/lab/qc-store.ts:56)
- results/[orderId]/page.tsx:278 `analyteName(c)` in QC completion button label
- results/[orderId]/\_components/delta-panel.tsx:58 `component[f.conceptId] ?? f.conceptId`
- results/[orderId]/\_components/delta-panel.tsx:71,99 rule key + version shown
- referrals/[id]/result/page.tsx:118 `name.get(c) ?? c` (rendered result-form.tsx:250)
- referrals/page.tsx:308-309 event kind / reason code enum with underscores replaced
- exchange/matches/page.tsx:139,175 raw reason / check key fallbacks
- exchange/partners/page.tsx:280 raw testCode fallback; :352 field keys
- LegacyWorklist page.tsx:229-230 kind + LOINC code shown

### Disabled buttons with no visible reason

- \_components/worklist-screen.tsx:568 Receive (high-risk until "Procedure followed" ticked)
- \_components/bench-bar.tsx:171 Receive (procedure tick)
- \_components/bench-bar.tsx:220 Receive anyway (reason < 3)
- \_components/result-row-actions.tsx:127 Confirm reject (reason < 3)
- \_components/result-row-actions.tsx:174 Enter (unreleased) (value empty)
- \_components/reject-specimen.tsx:66 Reject and ask for a recollection (no reason chip)
- results/[orderId]/\_components/qc-override.tsx:41 Release past hold (reason < 3)
- criticals/\_components/call-log.tsx:117 Log call (`!ready`)
- downtime/\_components/enter-form.tsx:214 Find (MRN < 3)
- downtime/\_components/enter-form.tsx:444, :452 Save / Save and next form (form no., collected, resulted)
- downtime/\_components/downtime-forms.tsx:111 Record the downtime (start/end empty)
- downtime/\_components/downtime-forms.tsx:180 Record the drill (date empty)
- referrals/[id]/result/result-form.tsx:179 Check against the referral (fields empty)
- referrals/[id]/result/result-form.tsx:362 Release to the doctor (`!matched || !uploaded`)
- refer/\_components/send-panel.tsx:488 Record outbreak referral (no partner; reason shown only if list empty :494)
- (with reasons, for contrast: send-panel.tsx:411 Add to manifest → :414; mark-panel.tsx:314 → problems list :301; result-entry-view.tsx:322 → releaseBlocked text :325)

### font-mono on numbers that are not identifiers

- page.tsx:186 legacy summary counts; :248 legacy waiting age
- older/page.tsx:99 result value; :105 date-time
- released/page.tsx:89 release time
- rejected/page.tsx:84 reject date-time
- criticals/page.tsx:74 marked time; criticals/[alertId]/page.tsx:111 timeline times; criticals/\_components/alert-bits.tsx:21 critical values
- results/[orderId]/\_components/delta-panel.tsx:76,80,84 previous/now/change
- results/[orderId]/\_components/mark-panel.tsx:111 value (display size); :157 repeat value input
- components/emr/results/result-entry-view.tsx:417,449,459,621,639,656,666 value/range inputs
- downtime/\_components/downtime-forms.tsx:30 "How many forms" count
- downtime/\_components/enter-form.tsx:338 value input; :383 repeat value input
- refer/\_components/send-panel.tsx:121 segment counts; :197 waiting duration
- referrals/page.tsx:108 tile counts; :237 sent date; :243 expected date; :306 event dates
- referrals/[id]/result/result-form.tsx:255 value input; :278 range input
- exchange/page.tsx:103 tile counts/times; :277 last-try time
- exchange/matches/page.tsx:131 arrived date; :156 month counts
- \_components/turnaround-cell.tsx:32,71 target duration
- \_components/worklist-screen.tsx:306 "Updated" time
- (identifiers in mono, fine: MRNs, lab numbers, form DT-numbers, manifest/referral numbers, their codes, serials, message ids, pairing code)

### Dashed-border empty states

- \_components/record-list.tsx:30 (released, rejected, criticals, refer-off)
- page.tsx:202 (legacy worklist)
- older/page.tsx:73
- refer/page.tsx:211
- referrals/page.tsx:181
- exchange/matches/page.tsx:102
- exchange/partners/page.tsx:129
- (dashed chip, not empty state: referrals/\_components/now-chip.tsx:18)

### Deep links between lab routes

- `/lab/results/{orderId}`: worklist-screen.tsx:226,406,597; bench-bar.tsx:293; page.tsx:147; released/page.tsx:70; rejected/page.tsx:71; refer/page.tsx:116; components/emr/results/specimen-actions.tsx:64
- `/lab/criticals/{alertId}`: criticals/page.tsx:56; results/[orderId]/page.tsx:202
- `/lab/criticals`: criticals/[alertId]/page.tsx:64
- `/lab`: results/[orderId]/page.tsx:179
- `/lab/older`: released/page.tsx:47
- `/lab/downtime/print?from=&to=`: downtime-forms.tsx:43 (window.location.assign)
- `/lab/refer/manifests/{id}/print`: send-panel.tsx:564
- `/lab/referrals/{id}/result`: referrals/page.tsx:338
- `/lab/referrals?month=&view=&partner=&r={id}`: referrals/page.tsx:101,214; `/lab/referrals?r={referralId}`: exchange/page.tsx:192; `/lab/referrals` after release: result-form.tsx:138
- `/lab/exchange`, `/lab/exchange?view=today`: exchange/page.tsx:220; analysers/page.tsx:57
- `/lab/exchange/partners?p={id}`: partners/page.tsx:165; `/lab/exchange/matches?i={id}`: matches/page.tsx:132
- `/lab/equipment`: analysers/page.tsx:89,116

### Prints / downloads / signs

- Print: downtime/print/print-button.tsx:7 (`window.print`); refer/manifests/[id]/print/print-manifest.tsx:20 (`printManifestAction` then print); refer Print link send-panel.tsx:564.
- CSV / file downloads: none in these routes.
- Upload: referrals/[id]/result/result-form.tsx:314 file input (scan).
- Sign: exchange/partners SignDraft ×3 (settings / tests / packing) → `signPartnerConfigAction` with fresh factor. MFA re-prompt (FreshFactor) also on PairDialog and EnableDialog.

---

## ACTIONS (every server action reachable from these pages)

| Action                        | File                      | Page / control                                                                                        |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| enterLabResultAction          | app/lab/actions.ts:88     | /lab legacy list · ResultRowActions "Enter (unreleased)"/"Save"                                       |
| releaseLabResultAction        | app/lab/actions.ts:182    | /lab legacy list · "Release"                                                                          |
| rejectLabResultAction         | app/lab/actions.ts:239    | /lab legacy list · "Confirm reject"                                                                   |
| receiveSpecimen               | lib/emr/actions/orders    | /lab worklist RowAction "Receive"; EmrLabWorklist SpecimenActions                                     |
| rejectSpecimen                | lib/emr/actions/orders    | /lab/results/[orderId] RejectSpecimen; EmrLabWorklist SpecimenActions                                 |
| receiveByLabelAction          | lib/lab/bench-actions     | /lab ScanReceive (Enter, Receive, Receive anyway)                                                     |
| undoReceiveAction             | lib/lab/bench-actions     | /lab ScanReceive "Undo"                                                                               |
| findSpecimenAction            | lib/lab/bench-actions     | /lab FindSpecimen "Find"                                                                              |
| repeatDoneAction              | lib/lab/qc-actions        | /lab RepeatTasks "Repeat done"                                                                        |
| revealWorkingDiagnosisAction  | lib/lab/bench-actions     | /lab/results/[orderId] ClinicalQuestion "Show the working diagnosis"                                  |
| recordDeltaOutcomeAction      | lib/lab/delta-actions     | /lab/results/[orderId] DeltaPanel "Record your decision" → Record                                     |
| releaseResults                | lib/emr/actions/results   | /lab/results/[orderId] QcHoldActions "Release {held} now" and QcOverride "Release past hold"          |
| releaseWithCriticalMarkAction | lib/lab/criticals/actions | /lab/results/[orderId] MarkPanel "Release and alert"                                                  |
| enterResults                  | lib/emr/actions/results   | /lab/results/[orderId] ResultEntry "Save preliminary"/"Release final"/"Save transcribed result"       |
| amendResults                  | lib/emr/actions/results   | /lab/results/[orderId] "Save amendment"                                                               |
| recordCriticalCommunication   | lib/emr/actions/results   | /lab/results/[orderId] CriticalComm (criticals off)                                                   |
| logCriticalCallAction         | lib/lab/criticals/actions | /lab/criticals/[alertId] "Log call"                                                                   |
| couldNotReachAction           | lib/lab/criticals/actions | /lab/criticals/[alertId] "Could not reach anyone"                                                     |
| findPatientAction             | lib/lab/downtime-actions  | /lab/downtime EnterForm "Find"                                                                        |
| testComponentsAction          | lib/lab/downtime-actions  | /lab/downtime EnterForm request/test select change                                                    |
| enterDowntimeFormAction       | lib/lab/downtime-actions  | /lab/downtime "Save" / "Save and next form"                                                           |
| recordPeriodAction            | lib/lab/downtime-actions  | /lab/downtime "Record the downtime"                                                                   |
| reserveFormsAction            | lib/lab/downtime-actions  | /lab/downtime "Print blank forms"                                                                     |
| recordDrillAction             | lib/lab/downtime-actions  | /lab/downtime "Record the drill"                                                                      |
| addToManifestAction           | lib/lab/referral-actions  | /lab/refer Send "Add to manifest"                                                                     |
| createAliquotAction           | lib/lab/referral-actions  | /lab/refer "Make an aliquot"                                                                          |
| recordOutbreakReferralAction  | lib/lab/referral-actions  | /lab/refer "Record outbreak referral" → Record                                                        |
| sealManifestAction            | lib/lab/referral-actions  | /lab/refer Manifests "Seal"                                                                           |
| recordHandoverAction          | lib/lab/referral-actions  | /lab/refer Manifests "Hand over" → Record handover                                                    |
| recordManifestReceiptAction   | lib/lab/referral-actions  | /lab/refer Manifests "Record receipt" → Record                                                        |
| printManifestAction           | lib/lab/referral-actions  | /lab/refer/manifests/[id]/print "Print"                                                               |
| recordReferralEventAction     | lib/lab/referral-actions  | /lab/referrals "Record an update" and "Note a call"                                                   |
| requestCancelAction           | lib/lab/referral-actions  | /lab/referrals "Note the doctor's cancel"                                                             |
| markLostAction                | lib/lab/referral-actions  | /lab/referrals "Mark lost"                                                                            |
| checkPaperIdentityAction      | lib/lab/referral-actions  | /lab/referrals/[id]/result "Check against the referral"                                               |
| createScanUploadAction        | lib/lab/referral-actions  | /lab/referrals/[id]/result scan file input                                                            |
| attachScanAction              | lib/lab/referral-actions  | /lab/referrals/[id]/result scan file input (after upload)                                             |
| releasePaperResultAction      | lib/lab/referral-actions  | /lab/referrals/[id]/result "Release to the doctor"                                                    |
| createPairingCodeAction       | lib/lab/exchange-actions  | /lab/exchange "Pair a machine" → Make the code                                                        |
| enableSenderAction            | lib/lab/exchange-actions  | /lab/exchange "Check and enable" → Enable                                                             |
| revokeSenderAction            | lib/lab/exchange-actions  | /lab/exchange "Revoke"                                                                                |
| retryOrSetAsideAction         | lib/lab/exchange-actions  | /lab/exchange messages "Fix the cause, then retry" / "Set aside"                                      |
| openRawAction                 | lib/lab/exchange-actions  | /lab/exchange messages "Open the message" → Open                                                      |
| fileElectronicResultAction    | lib/lab/exchange-actions  | /lab/exchange "File on the order"                                                                     |
| savePartnerAction             | lib/lab/referral-actions  | /lab/exchange/partners "Add a partner" / "Edit partner" → Save                                        |
| savePartnerConfigAction       | lib/lab/referral-actions  | /lab/exchange/partners "Edit tests", "Packing: {cat}", "Referral settings" → Save draft               |
| signPartnerConfigAction       | lib/lab/referral-actions  | /lab/exchange/partners "Sign the settings" / "Sign the tests" / "Sign the packing"                    |
| resolveMatchAction            | lib/lab/match-actions     | /lab/exchange/matches Ask the reference lab / File after confirming / Not ours, send back / Set aside |

Non-server-action controls: Refresh (router.refresh), section/stage/dept/sort (URL only), segment tabs (client state), Print (window.print), referrals filter form (GET), tile/row links (searchParams).
