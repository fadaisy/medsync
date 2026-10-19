# Lab set-up: raw parity inventory (repo /Users/airm1/Desktop/medsync-labws2)

Paths relative to repo. `S/` = `app/lab/setup/`. All pages are `force-dynamic` server components.

## Common to every set-up page

- Gate: `requireLabTechScope()` (lib/lab-tech/scope.ts), then `notFound()` unless `scope.workspaceLive && emrV1LiveFor(h) && <flag>`, then `notFound()` unless `scope.access.permissions.has("lab.manage")`.
- Shared form kit, `S/criticals/_components/setup-forms.tsx`: `useAct()` :28 (transition, runs action, sets message, `router.refresh()`), `Said` :42 (polite live region, caution StatusWord on error), `Field` :56 (label wrapper). Used by every set-up page.
- Fresh second factor: `FreshFactor` / `needsFreshFactor` (components/medsync/fresh-factor) on every lead signature and on profile activation; the action returns REAUTH unless `secondFactorFresh()`.
- Dialogs: `EditorDialog` (components/medsync/editor-dialog) directly, or `Pop` (app/lab/\_components/pop.tsx:24, wraps EditorDialog with a trigger button + Cancel + `action` slot).
- No print and no download anywhere under app/lab/setup (grep: none).

## D-LAB1-12 (the author never signs their own): how it is enforced

- Server, labSignedConfigs (`signConfig`, lib/lab/catalogue-v2.ts:301; `anotherSigner` :253): lead slot refuses author unless an exceptionNote (>=10 chars) is given AND `anotherSigner()` finds no other open LABORATORY department head (else refused even with a note). Second slot refuses the lead signer the same way (another superadmin / focal / lab lead). Used by: delta/panel/pattern rules, patient-release kinds, scheme, flag_basis, elevation, hiv_algorithm, addendum.
- Server, reference ranges (`signRangeVersion`, lib/lab/measures-setup.ts:277, check :322), critical limits (`signLimitsVersion`, lib/lab/limits.ts:181), response times (`signResponseVersion`, lib/lab/criticals/setup.ts:184, :206): author refused only when no exceptionNote; NO anotherSigner check (a note alone lets the author sign).
- Server, SMS templates (`approveSmsTemplate`, lib/lab/criticals/setup.ts:327): two different approvers (`firstApprover !== actor`, :346). The author of the wording is not checked; the author may give approval 1.
- Client: an "author note" input appears only when `authoredByMe` is true: setup-forms.tsx:223 (SignAsLead), sign-button.tsx:47, limits-editor.tsx:243, range-editor.tsx:307, scheme-sign.tsx:41, settings-forms.tsx:54. BUG/gap: `SignRule ... authoredByMe={false}` hard-coded at S/delta/page.tsx:196 and S/patient-release/page.tsx:108, so the author never sees the note field there (server still refuses).
- CSO countersign is never in the lab workspace: /admin/lab-signoffs (app/admin/lab-signoffs/page.tsx).

## Is there a read of "signed-config drafts awaiting THIS user's second signature" across set-up areas?

None exists. Nearest: `loadConfigsWaitingForCso()` lib/lab/signoffs-read.ts:56: CSO side only, every hospital, `lab_signed_configs` only (draft + leadSignedBy not null, excludes hmis_mapping), not per user, not ranges/limits/response-times/SMS. Each page finds its own open draft (`isNull(leadSignedBy)` in save paths: measures-setup.ts:228, limits.ts:136, criticals/setup.ts:157, catalogue-v2.ts:217). `KIND_WORDS` (signoffs-read.ts:19) is the only kind→words map.

---

## 1. Test catalogue — `/lab/setup/catalogue`

- Files: S/catalogue/page.tsx, \_components/measure-form.tsx, \_lib/methods.ts (METHOD_WORDS).
- searchParams: `edit` = `${testId}:${conceptId}` (page:27,37); concept id travels in the URL (page:147).
- Flag: `labUnitsRangesLiveFor` (page:33). Method register shown when `labCatalogueV2LiveFor` (page:87).
- Reads: `loadMeasuresSetup` lib/lab/measures-setup.ts:368; `testsWithoutUnit` lib/lab/criticals/readiness.ts:55.
- Header count: "N test(s) in use cannot be resulted yet" / "Every test in use has its units" (page:53-60).
- Table cols: Test, Component, Result type, Unit, Decimals, LOINC, State, Actions (page:95). State: "Ready · v{n}" / "Ready" / "Needs a unit" (page:139-143). Action: Edit link (page:146).
- Form (inline section, not a dialog) MeasureForm: Result type select, Unit select, Decimal places, LOINC, Method select + "Traceable to IDMS" checkbox (only concept `obs.creatinine`, measure-form:56,155), Entry check low/high. Button Save → `saveMeasureAction` (lib/lab/measures-actions.ts:70). Version text (measure-form:196).
- No signature (save makes next version immediately).
- Mono non-identifier numbers: page:136 (decimals); measure-form:121, :181, :190 (inputs).

## 2. Response and contacts (Critical results set-up) — `/lab/setup/criticals`

- Files: S/criticals/page.tsx, \_components/setup-forms.tsx. Page title "Critical results set-up"; nav label "Response and contacts".
- searchParams: none. Flag: `labCriticalsLiveFor` (page:37).
- Reads: `loadCriticalsSetup` lib/lab/criticals/setup.ts:367.
- States: signed banner "Signed · Response times version N, in force since…" or Caution "No response times are signed…" (page:79-95); "Waiting for the CSO" (draft with leadSignedBy, page:119); "Draft version N…" (page:127).
- Sections/forms:
  - The lab: SettingsForm (phone, second-check checkbox, Send SMS checkbox) → "Save settings" `saveLabSettingsAction` (lib/lab/criticals/setup-actions.ts:69).
  - Response times: ResponseDraftForm (ack min, level 1 min, level 2 min, source) → "Save draft" `saveResponseDraftAction` (:110). SignAsLead → "Sign as laboratory lead" `signResponseAsLeadAction` (:118), author note when `draft.authoredBy === scope.userId` (page:134).
  - Who receives escalations: per clinical department (labs excluded by regex /laborator/ page:58) Caution "Nobody will receive escalations for X" + ContactsEditor (Up, Down, Remove, Add select+button) → `setContactsAction` (:90); hospital level-2 list.
  - SMS wording: none → "Start from the draft messages" `seedSmsTemplatesAction` (:169); else TemplateEditor x2 (First message, Escalation message): textarea, "Save wording" `editSmsTemplateAction` (:137), "Approve (first of two)" / "Approve (second of two)" / "Waiting for a second approver" `approveSmsTemplateAction` (:156). State words "Approved" / "No approved message: SMS will not send".
- Disabled without visible reason: setup-forms:186 (Save draft while ack empty), :342 (Add while nothing picked). Self-evident: :292/:302 Up/Down at ends.
- Mono non-identifier: setup-forms:151, :160, :169 (minutes inputs), :286 (list ordinal "1.").

## 3. Delta checks — `/lab/setup/delta`

- Files: S/delta/page.tsx, \_components/delta-forms.tsx.
- searchParams: none. Flag: `labDeltaChecksLiveFor` (page:49).
- Reads: `deltaRulesWithReview` lib/lab/delta-read.ts:87 (loadConfigs + 30-day flag counts); inline drizzle: labComponentMeasures × clinicalConcepts (numeric) page:56; testCatalogue page:70.
- Note banner (role=note) page:93. Dashed empty state page:103 "No rules yet…".
- Table cols: Rule, Component, Compared as, Limit, Previous result within, Flagged last 30 days, Status, Actions (page:118). Count shown: `${flags} (${rate}%)` or LAB5.noData (page:179). Status words: Draft / "Flags often · review" / Signed (page:184). Gap: a lead-signed draft (awaiting CSO) still shows "Draft" + Sign button (only `status==="draft"` is checked, page:184,195).
- Dialogs (Pop): "Add a delta rule" DeltaRuleDialog (wide; key, component, basis clinical/rcv/local percentile, compared as, limit both or rise/fall, window hours, RCV calculator CVA/CVI/Z/log-normal computed live, percentile/data period, approver/rationale, ages, across methods, meaning, source) → "Save draft" `saveDeltaRuleAction` (lib/lab/delta-actions.ts:93). "Add a panel rule" PanelRuleDialog → same action. "Add a pattern rule" PatternRuleDialog (wide; rows + "Add a condition") → same action.
- Row buttons: "Try it on past results" `trialDeltaRuleAction` (delta-actions.ts:114), delta_rule only; "Sign" SignRule → `signConfigAsLeadAction` (lib/lab/catalogue-v2-actions.ts:133), authoredByMe hard-coded false (page:196).
- Concept id visible: page:158 fallback `String(p.concept)` when no name.
- Mono non-identifier: page:166 (limit numbers). Identifier mono: page:150 (rule key).

## 4. Demo lab day — `/lab/setup/demo`

- Files: S/demo/page.tsx, actions.ts, load-button.tsx.
- searchParams: none. Gate: no feature flag; `isDemoHospital` lib/lab/demo.ts:242 (page:33).
- Reads: `demoLoads` lib/lab/demo.ts:229; constant DEMO_PATIENTS.
- Button "Load a demo lab day" / "Loading…" → `loadDemoDayAction` (S/demo/actions.ts:18, server action file inside the route; checks lab.manage + demo hospital; creates banned auth users).
- Loads list: time · "Stopped: error" or "N patients, N tests, N released" (page:61-67). Empty "None yet." (page:58, not dashed).
- Mono non-identifier: page:63 (timestamp).

## 5. Research drafts — `/lab/setup/drafts`

- Files: S/drafts/page.tsx, \_components/addendum-dialog.tsx, drafts-table.tsx, sign-button.tsx (shared SignButton, also used by delta & patient-release), \_lib/copy.ts (DRAFTS).
- searchParams: none. Flag: `labCatalogueV2LiveFor` (page:29).
- Reads: `loadResearchDrafts(tx, h, userId)` lib/lab/drafts-read.ts:83 (addendum config + authoredByMe, references, schemes, imported, notImported).
- Three cards with counts: "{n} new results to add" (copy:5), "{n} range and cut-off drafts" (copy:28), "Not imported" list. Import line "Research imported on {date}" + "{refs} reference drafts · {schemes} cut-off drafts".
- Buttons: "Import the research" `importResearchAction` (catalogue-v2-actions.ts:68), shown until imported. "Review the addendum" opens wide EditorDialog: Results table (Id, Result, Value type, Unit, Answers) with count, New tests table (Id, Test, Results) with count; footer AddendumState (Not drafted / Draft / Waiting for the CSO / Signed); "Draft for sign-off" `draftAddendumAction` (:117); "Sign as laboratory lead" SignButton → `signConfigAsLeadAction` (authoredByMe from read, real); Close.
- DraftsTable cols: Result, Kind (Pill Reference/Cut-offs), Sources, Confidence, State (copy:44). States: Check needed / Two sources disagree / Ready to review / Set the boundaries / Waiting for the CSO. Empty row "No drafts. Import the research…" (drafts-table:64, not dashed). Cut-off rows link "Open in Ranges and cut-offs".
- Reference row opens DraftDialog (wide EditorDialog): BandCards (sex · age · low–high unit, provenance dl, state word). Per band: "Record the check" (Matches/Corrected radios, low/high, page checked) `recordDraftCheckAction` (:87); "Reject this alternative" + reason `rejectBandAction` (:96). Footer: blocked reason text (drafts-table:183) + "Send for sign-off" SignButton → `signRangeAsLeadAction` (measures-actions.ts:141), hidden when state "cso".
- Concept ids visible: addendum-dialog:75 (concept id column), :116 (test id), :118 (component ids), :84 (answer codes).
- Disabled without visible reason: drafts-table:371 (Reject until reason >=3 chars).
- Mono non-identifier: drafts-table:243 (band low–high), :316 (inputs).

## 6. Critical limits — `/lab/setup/limits`

- Files: S/limits/page.tsx, \_components/limits-editor.tsx (uses ranges/\_lib/ages.ts).
- searchParams: none. Flags: `labCriticalsLiveFor && labUnitsRangesLiveFor` (page:30).
- Reads: `loadLimitsSetup` lib/lab/limits.ts:336; `loadMeasuresSetup`.
- States: "Signed · Version N, in force since…" or Caution "No critical limits are signed…" (page:85-97); stale Caution "N signed limits no longer match their unit…" with count (page:98). Editor: "Waiting for the CSO" when draft lead-signed (limits-editor:274).
- Editor table (inline): Test and unit, Applies from age, to age, Critical at or below, at or above, Reference id, Source, Actions(Remove). Buttons "Add a limit" (client), "Save draft" `saveLimitsDraftAction` (measures-actions.ts:191), "Sign as laboratory lead" `signLimitsAsLeadAction` (:206) + author note (page:120 real authoredBy).
- Concept id visible: page:102 fallback `l.conceptId` in stale list.
- Disabled without visible reason: limits-editor:210 (Remove when one row).
- Mono non-identifier: limits-editor:154 (ages), :175, :184 (limits). Identifier: :192 (reference id).

## 7. Test menu — `/lab/setup/menu`

- Files: S/menu/page.tsx, \_components/service-picker.tsx.
- searchParams: `show` = undefined | "unlinked" | "restricted" (page:37,47,89).
- Flag: `labOneMenuLiveFor` (page:43).
- Reads: inline drizzle testCatalogue (lab, active, global or hospital), diagnosticOfferings × loincCodes, labTestServices (page:48-84); `menuToday` lib/lab/one-menu-read.ts:51.
- Filter links (pill nav, aria-current): All, Not linked, Restricted (page:130).
- Header count: "N test(s) cannot be ordered yet" / "Every test can be ordered" (page:116).
- Table cols: Test, Today (state words), Service (ServicePicker select, onChange → `setTestServiceAction` lib/lab/one-menu-actions.ts:28), Restricted (Pill sensitive, CLASS_WORDS), Measurement link → /lab/setup/catalogue.
- Caution if no offerings (page:189).
- No signature. No date inputs.

## 8. Patient release (What patients see) — `/lab/setup/patient-release`

- Files: S/patient-release/page.tsx, \_components/release-forms.tsx. Page title "What patients see"; nav "Patient release".
- searchParams: none. Flag: `patientResultsLiveFor` (page:45).
- Reads: `loadConfigs` lib/lab/catalogue-v2.ts:39 filtered to KIND keys, not superseded.
- Note banner page:59. Dashed empty state page:71 "Nothing drafted yet…".
- Dialog buttons (DraftPop → Pop wide, each "Save draft" `savePatientReleaseDraftAction` lib/lab/patient-release-actions.ts:111): "Release table" (per group select + SMS checkbox, hold days, aged days, source doc/date as TEXT input :91), "Plain words" (concept, language, 6 textareas, readability, translators if not en, banned phrases), "Minors rule", "Results-ready message" (language, sender id, message), "Never in the app: add tests" (test codes textarea, reason).
- Table cols: Setting, Key, Version, Status, Actions (page:86). Status: Draft/Signed only (lead-signed-awaiting-CSO shows Draft; same gap as delta). Action "Sign" SignRule → `signConfigAsLeadAction`, authoredByMe hard-coded false (page:108); not for results_consent_notice. okText reused from delta ("The CSO countersigns it in the admin console").
- Concept ids in labels: release-forms:341 "Component concept (obs.…)", :270 "Test codes, one per line (test.…)"; key column shows `concept:lang` (page:101).
- Mono non-identifier: page:102 ("v{n}").

## 9. Analyser profiles — `/lab/setup/profiles`

- Files: S/profiles/page.tsx, \_components/profile-forms.tsx, \_lib/copy.ts (PROFILES, blockerWords).
- searchParams: `open` = profile id (page:36,46).
- Flag: `labCatalogueV2LiveFor` (page:42).
- Reads: `loadProfiles` lib/lab/profile-store.ts:170; ANALYSER_MODELS lib/lab/profiles; concept display via conceptDef + data/emr/clinical-fact-concepts.v1.6.json (page:25-26).
- Header button "Add a profile" → medium EditorDialog (model select, bench) → "Add the profile" `createProfileAction` (catalogue-v2-actions.ts:168), then router.push ?open=id.
- Cards: model, Pill kind, bench · "N parameters" · "N lab only" (counts), state "In use since {date}" / Draft / Retired, Open link.
- Detail (inline section): read-only line when not draft; "Still to confirm" CheckBlocks → "Record" `resolveCheckAction` (:188); mapping table (On the analyser, Result in MedSync, Who sees it select → `setVisibilityAction` :176, Verified checkbox → `setVerifiedAction` :200); research-use row; "Before this profile is used" blockers; "Use this profile" → `activateProfileAction` (:208) with fresh factor, disabled with aria-describedby blockers. Side card text.
- No second signature (single person + fresh factor).
- Concept ids visible: page:26 `display()` falls back to the raw concept id (rows :125, blockers :130).
- Disabled without visible reason: profile-forms:98 (Add until model chosen), :355 (Record until >=3 chars).
- Mono: identifiers only (:195, :254, :328, :337 analyser codes).

## 10. Ranges (and cut-offs) — `/lab/setup/ranges`

- Files: S/ranges/page.tsx, \_components/range-editor.tsx, scheme-section.tsx, scheme-table.tsx, scheme-editor.tsx, scheme-sign.tsx, flag-basis.tsx, \_lib/ages.ts, \_lib/schemes-copy.ts.
- searchParams: `edit` = `${testId}:${conceptId}` (page:33,43,160).
- Flag: `labUnitsRangesLiveFor` (page:39); v2 section + title "Ranges and cut-offs" when `labCatalogueV2LiveFor` (page:44,101).
- Reads: `loadMeasuresSetup`; `loadCutoffs` lib/lab/cutoffs-read.ts:39 (v2).
- Table cols: Test, Component, Unit, State, Actions (page:137). State: Needs a unit / Waiting for the CSO / "Signed {date}[ · draft open]" / Draft / No range (page:62-76). Edit link; when no unit, link to catalogue (page:120).
- RangeEditor (inline): bands table (Sex, Age from/to + unit, Low, High, Source, Remove), "Add a band", live preview "What the technologist sees" (3 invented example patients), "Save draft" `saveRangeDraftAction` (measures-actions.ts:124), "Sign as laboratory lead" `signRangeAsLeadAction` (:141) + author note (page:118 real authoredBy); "Waiting for the CSO".
- Decision cut-offs (SchemeSection, per concept card): heading, "Edit draft" → SchemeEditor wide EditorDialog (label, source, categories label+abnormal, rows: context select, methods checkboxes, bounds from/to + inclusive) footer: SchemeSign (blockedReason text shown), Close, "Save draft" `saveConfigDraftAction` kind scheme (catalogue-v2-actions.ts:109). FlagBasis radio fieldset (Reference interval / Decision cut-offs) saves immediately → `saveConfigDraftAction` kind flag_basis; "Waiting for the CSO" / "Draft" + SchemeSign → `signConfigAsLeadAction`. "In force: version N, signed {date}" + SchemeTable; each draft in `<details>` "Draft"/"Waiting for the CSO" Version N. Elevation words + SchemeTable elevation table; amber "Not covered by this scheme" gaps.
- Counts: scheme-editor:158 elevation rows; scheme-section none-drafted text.
- Concept/category ids: scheme-editor:233 "{code} (not in the list)", scheme-table:51 fallback `b.category`, scheme-editor:134 category code mono; conceptId in URL.
- Disabled without visible reason: range-editor:230 (Remove when one band). Visible reasons: scheme-sign:76, scheme-editor:286 (describedby problems).
- Mono non-identifier: range-editor:182 (ages), :203, :212; scheme-editor:323.

## 11. Lab settings — `/lab/setup/settings`

- Files: S/settings/page.tsx, \_components/settings-forms.tsx, bedside-register.tsx, \_lib/copy.ts (SETTINGS).
- searchParams: none. Flag: `labSettingsLiveFor` (any of catalogueV2/payment/highRisk/bedside) (page:59). Sections per flag: payment `labPaymentLiveFor` (:88), procedure `labHighRiskLiveFor` (:101), bedside `labBedsideLiveFor` (:63,108). Elevation, eGFR, HIV always.
- Reads: `loadLabSettingsPage` lib/lab/settings-read.ts:47; `loadBedsideRegister` :102.
- Payment: radios off/inform/hold → "Save" `setLabSettingsAction` (one-menu-actions.ts:151). No signature.
- High-risk procedure: text → "Save" `setLabSettingsAction`. No signature.
- Bedside devices and kits: table (Device or kit, Test, Where, Current lot, State, Actions); states In use / Not verified yet / Retired; DeviceActions: "Verify" medium dialog (note) → `setDeviceStateAction` in_use (lib/lab/bedside-actions.ts:115); "Add a lot" medium dialog (lot, use-by NATIVE DATE) → `addLotAction` (:132); "Retire" → `setDeviceStateAction` retired. "Add a device" medium dialog (kind, test, model, serial, where) → `registerDeviceAction` (:97). Operators list Granted/Not granted → Grant/Revoke `setOperatorAction` (:149).
- Elevation: signed line / "No elevation signed…", "Waiting for the CSO" {m}, "Draft saved, not yet signed"; ElevationForm (metres, source) → "Save draft" `saveConfigDraftAction` kind elevation; SignAsLead → `signConfigAsLeadAction` (author note real, page:213).
- eGFR: switch button → `setReportEgfrAction` (catalogue-v2-actions.ts:219), immediate, no signature.
- HIV algorithm: summary (assays, "N rules", retest days, circular) for signed / awaiting / draft; "Edit the algorithm" EditorDialog (3 kits, retest days, circular, rules table with Remove, "Add a rule") → "Save draft" `saveConfigDraftAction` kind hiv_algorithm; SignAsLead (page:254).
- Native date input: bedside-register.tsx:262 (`type="date"`, use-by).
- Disabled without visible reason: settings-forms:180 (payment Save when unchanged), :219 (procedure Save when unchanged), :384 (Remove rule when one).
- Mono non-identifier: settings-forms:104 (metres), :330 (retest days), bedside-register:265 (date). Identifier: bedside-register:124 (serial), :257 (lot).

---

## Native date/datetime/time inputs (all of app/lab/setup)

- S/settings/\_components/bedside-register.tsx:262 `type="date"`. No others. Text-typed date: S/patient-release/\_components/release-forms.tsx:91 ("Source date").

## Concept ids visible in labels/placeholders

- release-forms.tsx:341 "Component concept (obs.…)"; release-forms.tsx:270 "(test.…)".
- Fallbacks to raw ids: delta/page.tsx:158; limits/page.tsx:102; profiles/page.tsx:26; scheme-table.tsx:51; scheme-editor.tsx:233.
- Id columns: addendum-dialog.tsx:75, :116, :118; patient-release/page.tsx:101 (key `concept:lang`).
- In URLs only: catalogue/page.tsx:147, ranges/page.tsx:124, :160.
- Code-only: measure-form.tsx:56 (`obs.creatinine` comparison, not shown).

## Dashed empty states

- S/delta/page.tsx:103; S/patient-release/page.tsx:71.

---

## Nav (lib/lab/nav.ts)

Permission helper `view = p.has("lab.view")` :86. `navFor` :374 sorts via lib/workspace-access/nav.ts by `order`; with `catalogueV2` relabels setup_ranges → "Ranges and cut-offs" (V2_LABELS :372).

| id                    | label                                      | href                         | order | exact | group    | visible when (perm && flag)                                      |
| --------------------- | ------------------------------------------ | ---------------------------- | ----- | ----- | -------- | ---------------------------------------------------------------- |
| worklist              | Worklist                                   | /lab                         | 1     | true  | –        | lab.view                                                         |
| criticals             | Criticals                                  | /lab/criticals               | 1.5   | false | –        | f.criticals && lab.view                                          |
| released              | Released today                             | /lab/released                | 2     | false | –        | lab.view                                                         |
| to_refer              | To refer                                   | /lab/refer                   | 2.5   | false | –        | f.oneMenu && lab.view                                            |
| referrals             | Referrals                                  | /lab/referrals               | 2.6   | false | –        | f.referral && lab.view                                           |
| rejected              | Rejected                                   | /lab/rejected                | 3     | false | –        | lab.view                                                         |
| downtime              | Downtime entry                             | /lab/downtime                | 4     | false | –        | f.downtime && lab.result.release                                 |
| quality               | Quality today                              | /lab/quality                 | 5.1   | true  | quality  | f.qc && lab.view                                                 |
| qc                    | Quality control                            | /lab/quality/qc              | 5.2   | false | quality  | f.qc && lab.view                                                 |
| stock                 | Stock and lots                             | /lab/stock                   | 5.3   | false | quality  | f.stock && lab.view                                              |
| equipment             | Equipment                                  | /lab/equipment               | 5.4   | false | quality  | f.equipment && lab.view                                          |
| eqa                   | External quality                           | /lab/quality/eqa             | 5.5   | false | quality  | f.eqa && lab.view                                                |
| bedside_quality       | Bedside quality                            | /lab/quality/bedside         | 5.55  | false | quality  | f.poctQuality && lab.view                                        |
| nonconformities       | Nonconformities                            | /lab/quality/nonconformities | 5.6   | false | quality  | (f.qc or f.eqa) && lab.view                                      |
| register              | Daily register                             | /lab/register                | 6.1   | false | reports  | f.hmis && lab.view                                               |
| hmis                  | HMIS 105                                   | /lab/hmis                    | 6.2   | false | reports  | f.hmis && lab.view                                               |
| reports               | Lab reports                                | /lab/reports                 | 6.3   | false | reports  | f.reports && lab.view                                            |
| connections           | Connections                                | /lab/exchange                | 7.1   | true  | exchange | f.exchange && lab.view                                           |
| matches               | Waiting for a match                        | /lab/exchange/matches        | 7.2   | false | exchange | f.referral && lab.view                                           |
| analysers             | Analysers                                  | /lab/exchange/analysers      | 7.3   | false | exchange | f.exchange && lab.view                                           |
| partners              | Partners                                   | /lab/exchange/partners       | 7.4   | false | exchange | f.referral && lab.view                                           |
| setup_menu            | Test menu                                  | /lab/setup/menu              | 7.5   | false | setup    | f.oneMenu && lab.manage                                          |
| setup_catalogue       | Test catalogue                             | /lab/setup/catalogue         | 8     | false | setup    | f.unitsRanges && lab.manage                                      |
| setup_profiles        | Analyser profiles                          | /lab/setup/profiles          | 8.5   | false | setup    | f.catalogueV2 && lab.manage                                      |
| setup_ranges          | Reference ranges (v2: Ranges and cut-offs) | /lab/setup/ranges            | 9     | false | setup    | f.unitsRanges && lab.manage                                      |
| setup_limits          | Critical limits                            | /lab/setup/limits            | 9.5   | false | setup    | f.unitsRanges && (f.criticalsSetup ?? f.criticals) && lab.manage |
| setup_delta           | Delta checks                               | /lab/setup/delta             | 9.6   | false | setup    | f.deltaChecks && lab.manage                                      |
| setup_patient_release | Patient release                            | /lab/setup/patient-release   | 9.7   | false | setup    | f.patientResults && lab.manage                                   |
| setup_demo            | Demo lab day                               | /lab/setup/demo              | 9.8   | false | setup    | f.demo && lab.manage                                             |
| setup_criticals       | Response and contacts                      | /lab/setup/criticals         | 10    | false | setup    | (f.criticalsSetup ?? f.criticals) && lab.manage                  |
| setup_drafts          | Research drafts                            | /lab/setup/drafts            | 10.5  | false | setup    | f.catalogueV2 && lab.manage                                      |
| setup_settings        | Lab settings                               | /lab/setup/settings          | 11    | false | setup    | (f.settings ?? f.catalogueV2) && lab.manage                      |

Flag sources (app/lab/layout.tsx:136-156, each `emr && …`): criticals = `criticalsLive(h)` (lib/lab/criticals/readiness.ts:44: LAB_CRITICALS + in production every department has a level-1 contact); criticalsSetup = labCriticalsLiveFor; unitsRanges = labUnitsRangesLiveFor; downtime = labDowntimeLiveFor; catalogueV2; oneMenu; settings = labSettingsLiveFor; stock; equipment; qc; eqa; poctQuality; hmis; reports; referral = labReferralLiveFor; exchange; deltaChecks; patientResults; demo = isDemoHospital(db,h). All in lib/lab/feature.ts.

Group rendering: app/lab/\_components/lab-shell.tsx:36-59: ungrouped, then "Quality", "Reports", "Exchange", then `LAB.nav.setup` label for setup.

### Nav count maps (app/lab/layout.tsx)

- `counts` :68-101: worklist = labWorklistFor(h).inputs.length; released = releasedTodayFor(h).length; rejected = rejectedFor(h).length (lib/lab/page-data); criticals = countOpenCriticals(h) (lib/lab/criticals/read) if criticals; matches = countMatchesWaiting(h) (lib/lab/match-read) if referral; downtime = countFormsWaiting(h) (lib/lab/downtime-read) if downtime. Every setup\_\*, quality, reports, exchange (except matches) = null. Legacy (no EMR): worklist = loadLegacyWorklist length, others 0.
- `words` :102-135: "{n} waiting", "{n} released today", "{n} rejected in 7 days", "{n} open critical alert(s)", "{n} waiting for a match", "{n} printed form(s) to enter"; all others "". No set-up badge exists (no signatures-waiting count).

### Icon map (app/lab/\_components/lab-nav.tsx:50-83, lucide-react)

worklist List · criticals Siren · released CheckCheck · rejected Ban · setup_catalogue TestTubes · setup_ranges Ruler · setup_limits Gauge · setup_delta Diff · setup_patient_release UserRoundCheck · setup_demo Database · downtime FileClock · setup_criticals Settings · setup_profiles Cpu · setup_drafts FileSearch · setup_settings SlidersHorizontal · to_refer Send · setup_menu ListChecks · stock Package · equipment Wrench · quality ShieldCheck · qc Activity · nonconformities ClipboardList · eqa Award · bedside_quality Fingerprint · register BookOpen · hmis FileSpreadsheet · reports ChartColumn · referrals Truck · partners Building2 · connections ArrowLeftRight · matches GitMerge · analysers Cpu (duplicate of setup_profiles). `exact` items also match `${href}/results` (lab-nav.tsx:96).

---

## ACTIONS (name — file — page / button)

- saveMeasureAction — lib/lab/measures-actions.ts:70 — catalogue / Save
- saveLabSettingsAction — lib/lab/criticals/setup-actions.ts:69 — criticals / Save settings
- saveResponseDraftAction — lib/lab/criticals/setup-actions.ts:110 — criticals / Save draft
- signResponseAsLeadAction — lib/lab/criticals/setup-actions.ts:118 — criticals / Sign as laboratory lead
- setContactsAction — lib/lab/criticals/setup-actions.ts:90 — criticals / Up, Down, Remove, Add
- editSmsTemplateAction — lib/lab/criticals/setup-actions.ts:137 — criticals / Save wording
- approveSmsTemplateAction — lib/lab/criticals/setup-actions.ts:156 — criticals / Approve (first of two), Approve (second of two)
- seedSmsTemplatesAction — lib/lab/criticals/setup-actions.ts:169 — criticals / Start from the draft messages
- saveDeltaRuleAction — lib/lab/delta-actions.ts:93 — delta / Save draft (delta, panel, pattern dialogs)
- trialDeltaRuleAction — lib/lab/delta-actions.ts:114 — delta / Try it on past results
- signConfigAsLeadAction — lib/lab/catalogue-v2-actions.ts:133 — delta / Sign; patient-release / Sign; drafts / addendum Sign as laboratory lead; ranges / SchemeSign (scheme + flag basis); settings / Sign as laboratory lead (elevation, HIV)
- loadDemoDayAction — app/lab/setup/demo/actions.ts:18 — demo / Load a demo lab day
- importResearchAction — lib/lab/catalogue-v2-actions.ts:68 — drafts / Import the research
- draftAddendumAction — lib/lab/catalogue-v2-actions.ts:117 — drafts / addendum dialog Draft for sign-off
- recordDraftCheckAction — lib/lab/catalogue-v2-actions.ts:87 — drafts / band Record the check
- rejectBandAction — lib/lab/catalogue-v2-actions.ts:96 — drafts / band Reject this alternative
- signRangeAsLeadAction — lib/lab/measures-actions.ts:141 — drafts / Send for sign-off; ranges / Sign as laboratory lead
- saveLimitsDraftAction — lib/lab/measures-actions.ts:191 — limits / Save draft
- signLimitsAsLeadAction — lib/lab/measures-actions.ts:206 — limits / Sign as laboratory lead
- setTestServiceAction — lib/lab/one-menu-actions.ts:28 — menu / service select (onChange)
- savePatientReleaseDraftAction — lib/lab/patient-release-actions.ts:111 — patient-release / Save draft (5 dialogs)
- createProfileAction — lib/lab/catalogue-v2-actions.ts:168 — profiles / Add the profile
- setVisibilityAction — lib/lab/catalogue-v2-actions.ts:176 — profiles / Who sees it select
- resolveCheckAction — lib/lab/catalogue-v2-actions.ts:188 — profiles / Record
- setVerifiedAction — lib/lab/catalogue-v2-actions.ts:200 — profiles / Verified checkbox
- activateProfileAction — lib/lab/catalogue-v2-actions.ts:208 — profiles / Use this profile
- saveRangeDraftAction — lib/lab/measures-actions.ts:124 — ranges / Save draft
- saveConfigDraftAction — lib/lab/catalogue-v2-actions.ts:109 — ranges / scheme Save draft, flag-basis radio; settings / elevation Save draft, HIV Save draft
- setLabSettingsAction — lib/lab/one-menu-actions.ts:151 — settings / payment Save, procedure Save
- setReportEgfrAction — lib/lab/catalogue-v2-actions.ts:219 — settings / eGFR switch
- registerDeviceAction — lib/lab/bedside-actions.ts:97 — settings / Add a device → Save
- setDeviceStateAction — lib/lab/bedside-actions.ts:115 — settings / Verify, Retire
- addLotAction — lib/lab/bedside-actions.ts:132 — settings / Add a lot → Save
- setOperatorAction — lib/lab/bedside-actions.ts:149 — settings / Grant, Revoke
- (CSO only, outside lab workspace: signConfigAsCsoAction :147, signRangeAsCsoAction :155, signLimitsAsCsoAction :220, signResponseAsCsoAction setup-actions.ts:183 — /admin/lab-signoffs)
