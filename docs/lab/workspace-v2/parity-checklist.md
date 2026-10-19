# Lab Workspace v2 parity checklist (Step 1 list, proven at Step 11)

Prompt Law 2: every action, filter, view, print, download, sign and count the old interface offered must be reachable in the new one. This checklist has two parts.

1. **Actions (generated).** Every server action that any file under `app/lab` imported on `origin/main` at Step 0 (134 in all). For each: the old files that used it, and the files of the new interface that call it.
   - Old route pages and the old shell are left out of the "new" column, because Step 11 deletes them.
   - `tests/lab/workspace-v2/parity.test.ts` re-checks this list on every run.
2. **Views, filters, prints, downloads, signs and counts.** These are the rows of the Step 0 inventories (`step-0/inventory-*.md`), checked place by place in the builders' reports. They are proven on screen by the harness plan `~/Desktop/labws2-harness/plans/v2.js`.

The **Signed** column is for the CSO (☐ = not yet signed).

## Actions

| Action | Old (Step 0) | New interface | Signed |
|---|---|---|---|
| `acceptLotAction` | `app/lab/stock/_components/receive-forms.tsx` | `app/lab/stock/_components/receive-forms.tsx` | ☐ |
| `activateProfileAction` | `app/lab/setup/profiles/_components/profile-forms.tsx` | `app/lab/setup/profiles/_components/profile-forms.tsx` | ☐ |
| `addLotAction` | `app/lab/setup/settings/_components/bedside-register.tsx` | `app/lab/setup/settings/_components/bedside-register.tsx` | ☐ |
| `addNcActionAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |
| `addToManifestAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `approveSmsTemplateAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `attachScanAction` | `app/lab/referrals/[id]/result/result-form.tsx` | `app/lab/send-outs/_components/result-form.tsx` | ☐ |
| `authoriseResumptionAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |
| `checkHmis105Action` | `app/lab/hmis/_components/hmis-forms.tsx` | `app/lab/hmis/_components/hmis-forms.tsx` | ☐ |
| `checkPaperIdentityAction` | `app/lab/referrals/[id]/result/result-form.tsx` | `app/lab/send-outs/_components/result-form.tsx` | ☐ |
| `closeNonconformityAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |
| `couldNotReachAction` | `app/lab/criticals/_components/call-log.tsx` | `app/lab/criticals/_components/call-log.tsx` | ☐ |
| `createAliquotAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `createPairingCodeAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `createProfileAction` | `app/lab/setup/profiles/_components/profile-forms.tsx` | `app/lab/setup/profiles/_components/profile-forms.tsx` | ☐ |
| `createScanUploadAction` | `app/lab/referrals/[id]/result/result-form.tsx` | `app/lab/send-outs/_components/result-form.tsx` | ☐ |
| `decideLookbackItemAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |
| `draftAddendumAction` | `app/lab/setup/drafts/_components/addendum-dialog.tsx` | `app/lab/setup/drafts/_components/addendum-dialog.tsx` | ☐ |
| `editSmsTemplateAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `enableSenderAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `enterDowntimeFormAction` | `app/lab/downtime/_components/enter-form.tsx` | `app/lab/bench/downtime/_components/enter-paper.tsx`, `app/lab/downtime/_components/enter-form.tsx` | ☐ |
| `enterLabResultAction` | `app/lab/_components/result-row-actions.tsx` | legacy list only (LAB_WORKSPACE off), kept | ☐ |
| `exportHmis105Action` | `app/lab/hmis/_components/hmis-forms.tsx` | `app/lab/hmis/_components/hmis-forms.tsx` | ☐ |
| `fileElectronicResultAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `findPatientAction` | `app/lab/downtime/_components/enter-form.tsx` | `app/lab/bench/downtime/_components/enter-paper.tsx`, `app/lab/downtime/_components/enter-form.tsx` | ☐ |
| `findSpecimenAction` | `app/lab/_components/bench-bar.tsx` | `app/lab/_components/bench-bar.tsx` | ☐ |
| `generateHmis105Action` | `app/lab/hmis/_components/hmis-forms.tsx` | `app/lab/hmis/_components/hmis-forms.tsx` | ☐ |
| `grandfatherLotsAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `grandfatherOperatorsAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `importResearchAction` | `app/lab/setup/drafts/_components/addendum-dialog.tsx` | `app/lab/setup/drafts/_components/addendum-dialog.tsx` | ☐ |
| `issueStockAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `loadDemoDayAction` | `app/lab/setup/demo/load-button.tsx` | `app/lab/setup/demo/actions.ts`, `app/lab/setup/demo/load-button.tsx` | ☐ |
| `logCriticalCallAction` | `app/lab/criticals/_components/call-log.tsx` | `app/lab/criticals/_components/call-log.tsx` | ☐ |
| `markBackInServiceAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `markDownAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `markLostAction` | `app/lab/referrals/_components/referral-forms.tsx` | `app/lab/send-outs/_components/referral-forms.tsx` | ☐ |
| `openNonconformityAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |
| `openRawAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `prepareRevisionAction` | `app/lab/hmis/_components/hmis-forms.tsx` | `app/lab/hmis/_components/hmis-forms.tsx` | ☐ |
| `printManifestAction` | `app/lab/refer/manifests/[id]/print/print-manifest.tsx` | `app/lab/send-outs/_components/print-manifest.tsx` | ☐ |
| `printRegisterAction` | `app/lab/register/_components/register-forms.tsx` | `app/lab/register/_components/register-forms.tsx` | ☐ |
| `quarantineLotAction` | `app/lab/equipment/_components/equipment-forms.tsx`, `app/lab/stock/_components/stock-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx`, `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `receiveByLabelAction` | `app/lab/_components/bench-bar.tsx` | `app/lab/_components/bench-bar.tsx` | ☐ |
| `receiveDeliveryAction` | `app/lab/stock/_components/receive-forms.tsx` | `app/lab/stock/_components/receive-forms.tsx` | ☐ |
| `receiveSpecimen` | `app/lab/_components/worklist-screen.tsx` | `app/lab/bench/_components/receive-row.tsx` | ☐ |
| `recordAltAssessmentAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `recordCompetencyAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `recordCountAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `recordDeltaOutcomeAction` | `app/lab/results/[orderId]/_components/delta-panel.tsx` | `app/lab/results/[orderId]/_components/delta-panel.tsx` | ☐ |
| `recordDraftCheckAction` | `app/lab/setup/drafts/_components/drafts-table.tsx` | `app/lab/setup/drafts/_components/drafts-table.tsx` | ☐ |
| `recordDrillAction` | `app/lab/downtime/_components/downtime-forms.tsx` | `app/lab/bench/downtime/_components/downtime-tasks.tsx`, `app/lab/downtime/_components/downtime-forms.tsx` | ☐ |
| `recordEqaResultsAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `recordEqaScoresAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `recordEquipmentLogAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `recordHandoverAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `recordKitQcAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `recordManifestReceiptAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `recordMovementAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `recordOutbreakReferralAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `recordPeriodAction` | `app/lab/downtime/_components/downtime-forms.tsx` | `app/lab/bench/downtime/_components/downtime-tasks.tsx`, `app/lab/downtime/_components/downtime-forms.tsx` | ☐ |
| `recordQcRunAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `recordReferralEventAction` | `app/lab/referrals/_components/referral-forms.tsx` | `app/lab/send-outs/_components/referral-forms.tsx` | ☐ |
| `recordRoundAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `recordTemperatureAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `registerDeviceAction` | `app/lab/setup/settings/_components/bedside-register.tsx` | `app/lab/setup/settings/_components/bedside-register.tsx` | ☐ |
| `rejectBandAction` | `app/lab/setup/drafts/_components/drafts-table.tsx` | `app/lab/setup/drafts/_components/drafts-table.tsx` | ☐ |
| `rejectLabResultAction` | `app/lab/_components/result-row-actions.tsx` | legacy list only (LAB_WORKSPACE off), kept | ☐ |
| `rejectLotAction` | `app/lab/stock/_components/receive-forms.tsx` | `app/lab/stock/_components/receive-forms.tsx` | ☐ |
| `rejectSpecimen` | `app/lab/_components/reject-specimen.tsx` | `app/lab/_components/reject-specimen.tsx`, `app/lab/_lib/emr.ts` | ☐ |
| `releaseLabResultAction` | `app/lab/_components/result-row-actions.tsx` | legacy list only (LAB_WORKSPACE off), kept | ☐ |
| `releaseLotFromQuarantineAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `releasePaperResultAction` | `app/lab/referrals/[id]/result/result-form.tsx` | `app/lab/send-outs/_components/result-form.tsx` | ☐ |
| `releaseResults` | `app/lab/results/[orderId]/_components/qc-hold.tsx` | `app/lab/_lib/emr.ts`, `app/lab/results/[orderId]/_components/qc-hold.tsx` | ☐ |
| `releaseWithCriticalMarkAction` | `app/lab/results/[orderId]/_components/lab-result-entry.tsx` | `app/lab/results/[orderId]/_components/lab-result-entry.tsx` | ☐ |
| `repeatDoneAction` | `app/lab/_components/repeat-done.tsx` | `app/lab/_components/repeat-done.tsx` | ☐ |
| `requestCancelAction` | `app/lab/referrals/_components/referral-forms.tsx` | `app/lab/send-outs/_components/referral-forms.tsx` | ☐ |
| `reserveFormsAction` | `app/lab/downtime/_components/downtime-forms.tsx` | `app/lab/bench/downtime/_components/downtime-tasks.tsx`, `app/lab/downtime/_components/downtime-forms.tsx` | ☐ |
| `resolveCheckAction` | `app/lab/setup/profiles/_components/profile-forms.tsx` | `app/lab/setup/profiles/_components/profile-forms.tsx` | ☐ |
| `resolveMatchAction` | `app/lab/exchange/matches/_components/match-forms.tsx` | `app/lab/send-outs/_components/match-forms.tsx` | ☐ |
| `retryOrSetAsideAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `revealWorkingDiagnosisAction` | `app/lab/results/[orderId]/_components/clinical-question.tsx` | `app/lab/results/[orderId]/_components/clinical-question.tsx` | ☐ |
| `revokeSenderAction` | `app/lab/exchange/_components/connection-forms.tsx` | `app/lab/send-outs/_components/connection-forms.tsx` | ☐ |
| `saveAcceptancePlanAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `saveCompetencyValidityAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `saveConfigDraftAction` | `app/lab/setup/ranges/_components/flag-basis.tsx`, `app/lab/setup/ranges/_components/scheme-editor.tsx`, `app/lab/setup/settings/_components/settings-forms.tsx` | `app/lab/setup/ranges/_components/flag-basis.tsx`, `app/lab/setup/ranges/_components/scheme-editor.tsx`, `app/lab/setup/settings/_components/settings-forms.tsx` | ☐ |
| `saveDeltaRuleAction` | `app/lab/setup/delta/_components/delta-forms.tsx` | `app/lab/setup/delta/_components/delta-forms.tsx` | ☐ |
| `saveDeviceQcRuleAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `saveEqaSettingsAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `saveEquipmentAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `saveHmisMappingAction` | `app/lab/hmis/mapping/_components/mapping-editor.tsx` | `app/lab/setup/hmis-mapping/_components/mapping-editor.tsx` | ☐ |
| `saveKitQcRuleAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `saveLabSettingsAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `saveLimitsDraftAction` | `app/lab/setup/limits/_components/limits-editor.tsx` | `app/lab/setup/limits/_components/limits-editor.tsx` | ☐ |
| `saveManualCellsAction` | `app/lab/hmis/_components/hmis-forms.tsx` | `app/lab/hmis/_components/hmis-forms.tsx` | ☐ |
| `saveMeasureAction` | `app/lab/setup/catalogue/_components/measure-form.tsx` | `app/lab/setup/catalogue/_components/measure-form.tsx` | ☐ |
| `savePartnerAction` | `app/lab/exchange/partners/_components/partner-forms.tsx` | `app/lab/send-outs/_components/partner-forms.tsx` | ☐ |
| `savePartnerConfigAction` | `app/lab/exchange/partners/_components/partner-forms.tsx` | `app/lab/send-outs/_components/partner-forms.tsx` | ☐ |
| `savePatientReleaseDraftAction` | `app/lab/setup/patient-release/_components/release-forms.tsx` | `app/lab/setup/patient-release/_components/release-forms.tsx` | ☐ |
| `saveQcPlanAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/plan-form.tsx`, `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `saveQcPolicyAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `saveRangeDraftAction` | `app/lab/setup/ranges/_components/range-editor.tsx` | `app/lab/setup/ranges/_components/range-editor.tsx` | ☐ |
| `saveRegisterConfigAction` | `app/lab/register/_components/register-forms.tsx` | `app/lab/register/_components/register-forms.tsx` | ☐ |
| `saveResponseDraftAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `saveScheduleAction` | `app/lab/equipment/_components/equipment-forms.tsx` | `app/lab/equipment/_components/equipment-forms.tsx` | ☐ |
| `saveSchemeAction` | `app/lab/quality/_components/eqa-forms.tsx` | `app/lab/quality/_components/eqa-forms.tsx` | ☐ |
| `saveStockItemAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `sealManifestAction` | `app/lab/refer/_components/send-panel.tsx` | `app/lab/send-outs/_components/send-panel.tsx` | ☐ |
| `seedSmsTemplatesAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `setContactsAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `setDeviceStateAction` | `app/lab/setup/settings/_components/bedside-register.tsx` | `app/lab/setup/settings/_components/bedside-register.tsx` | ☐ |
| `setLabSettingsAction` | `app/lab/setup/settings/_components/settings-forms.tsx` | `app/lab/setup/settings/_components/settings-forms.tsx` | ☐ |
| `setLabTargetAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `setLotInUseAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `setOperatorAction` | `app/lab/setup/settings/_components/bedside-register.tsx` | `app/lab/setup/settings/_components/bedside-register.tsx` | ☐ |
| `setReportEgfrAction` | `app/lab/setup/settings/_components/settings-forms.tsx` | `app/lab/setup/settings/_components/settings-forms.tsx` | ☐ |
| `setStockSettingsAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `setStripLotRangesAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `setTestServiceAction` | `app/lab/setup/menu/_components/service-picker.tsx` | `app/lab/setup/menu/_components/service-picker.tsx` | ☐ |
| `setVerifiedAction` | `app/lab/setup/profiles/_components/profile-forms.tsx` | `app/lab/setup/profiles/_components/profile-forms.tsx` | ☐ |
| `setVisibilityAction` | `app/lab/setup/profiles/_components/profile-forms.tsx` | `app/lab/setup/profiles/_components/profile-forms.tsx` | ☐ |
| `signAcceptancePlanAction` | `app/lab/stock/_components/stock-forms.tsx` | `app/lab/stock/_components/stock-forms.tsx` | ☐ |
| `signBedsideConfigAction` | `app/lab/quality/_components/bedside-forms.tsx` | `app/lab/quality/_components/bedside-forms.tsx` | ☐ |
| `signConfigAsLeadAction` | `app/lab/setup/delta/_components/delta-forms.tsx`, `app/lab/setup/drafts/_components/addendum-dialog.tsx`, `app/lab/setup/ranges/_components/scheme-sign.tsx`, `app/lab/setup/settings/_components/settings-forms.tsx` | `app/lab/setup/delta/_components/delta-forms.tsx`, `app/lab/setup/drafts/_components/addendum-dialog.tsx`, `app/lab/setup/ranges/_components/scheme-sign.tsx`, `app/lab/setup/settings/_components/settings-forms.tsx` | ☐ |
| `signHmisMappingAction` | `app/lab/hmis/mapping/_components/mapping-editor.tsx` | `app/lab/setup/hmis-mapping/_components/mapping-editor.tsx` | ☐ |
| `signLimitsAsLeadAction` | `app/lab/setup/limits/_components/limits-editor.tsx` | `app/lab/setup/limits/_components/limits-editor.tsx` | ☐ |
| `signPartnerConfigAction` | `app/lab/exchange/partners/_components/partner-forms.tsx` | `app/lab/send-outs/_components/partner-forms.tsx` | ☐ |
| `signQcConfigAction` | `app/lab/quality/_components/qc-forms.tsx` | `app/lab/quality/_components/qc-forms.tsx` | ☐ |
| `signRangeAsLeadAction` | `app/lab/setup/drafts/_components/drafts-table.tsx`, `app/lab/setup/ranges/_components/range-editor.tsx` | `app/lab/setup/drafts/_components/drafts-table.tsx`, `app/lab/setup/ranges/_components/range-editor.tsx` | ☐ |
| `signRegisterConfigAction` | `app/lab/register/_components/register-forms.tsx` | `app/lab/register/_components/register-forms.tsx` | ☐ |
| `signResponseAsLeadAction` | `app/lab/setup/criticals/_components/setup-forms.tsx` | `app/lab/setup/criticals/_components/setup-forms.tsx` | ☐ |
| `testComponentsAction` | `app/lab/downtime/_components/enter-form.tsx` | `app/lab/bench/downtime/_components/enter-paper.tsx`, `app/lab/downtime/_components/enter-form.tsx` | ☐ |
| `trialDeltaRuleAction` | `app/lab/setup/delta/_components/delta-forms.tsx` | `app/lab/setup/delta/_components/delta-forms.tsx` | ☐ |
| `undoReceiveAction` | `app/lab/_components/bench-bar.tsx` | `app/lab/_components/bench-bar.tsx` | ☐ |
| `updateNcActionAction` | `app/lab/quality/_components/nc-forms.tsx` | `app/lab/quality/_components/nc-forms.tsx` | ☐ |

## Views, filters, prints, downloads, signs, counts

| Old | New home | Proven by |
|---|---|---|
| Worklist: section tabs, stage tabs, ward filter, sort, scan to receive, Undo, Find, live line, repeat tasks | Bench: section chips, stage pills, queue (worklist engine order), the scan field on To receive with Undo, Scan or search (Ctrl K), Live in the top bar, repeat tasks above the work pane | harness `bench*`, `tests/lab/workspace-v2/search.test.ts` |
| Ward filter and sort columns | Not carried: the queue keeps the engine's order. Wards show on each row; search finds a patient. **Decision for the CSO** | — |
| Result screen (enter, preliminary, release, amend, critical mark, CriticalComm, QC hold and override, delta decision, working diagnosis, reject) | Bench work pane plus Before release, using the same components | harness `bench-order`, existing UI tests |
| Released today, Rejected, Older results | Bench: Released today and Rejected stages; Older results | harness `bench-released`, `bench-rejected` |
| Criticals list and alert detail (Log call, Could not reach) | Needs you (Results) and `/lab/needs-you/criticals/[id]` | harness `needs-you`, `tests/lab/workspace-v2/needs-you.test.ts` |
| Downtime: four forms and print | Bench, Downtime entry: four tabs and print | `tests/lab/workspace-v2/downtime.test.ts`, harness `downtime*` |
| To refer, Referrals (filters, tiles, detail), manifests and print, paper result, Connections, Partners, Matches | Send-outs: Board, Manifests, Waiting for a match, Partners, Connections; the result page; the print page | `send-outs-board.test.ts`, harness `send-*` |
| Quality today, QC, QC run, EQA, bedside, nonconformities and detail, stock, order, receive, equipment | Quality: eight tabs, the QC run page, the new QC plan form, the nonconformity page, stock order and receive | `quality.test.ts`, harness `quality*`, `qc-*` |
| Lab reports and records, Daily register and print, HMIS 105 (count, check, CSV, print, records) | Reports: Indicators, Daily register, HMIS 105, Downloads; records; HMIS print and records | `period.test.ts`, harness `reports*` |
| HMIS mapping, Analysers | Set-up: HMIS mapping and Analysers. Read-only for lab staff, as before | harness `setup-*` |
| The 14 set-up items | The Set-up hub's six groups, plus the same pages | `setup-hub.test.ts`, harness `setup*` |
| Nav counts (worklist, released, rejected, criticals, matches, downtime forms) | Rail counts (Bench, Send-outs, Set-up), stage pill counts, the Needs you count, the downtime tab count | harness |
