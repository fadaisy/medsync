# Resus Desk v2 — UI build spec (Phases 4–6)

The contract every UI lane builds against. Behaviour detail lives in `docs/resus-v2/PROMPT-RESUS-DESK-V2.md` §5
(survey §5.1–5.8, arrest console §5.9, post-ROSC §5.10, termination/death §5.11, close-out/boarding §5.12, board
§5.13, idle §5.14) and `docs/resus-v2-gate-a-proposal.md` (§2 wireframes, §3 tiering, §4 context, §5 vitals floor,
§12 decisions). Where this file and the prompt disagree, this file wins (it records GATE A decisions).

## 1. Ground rules

- **Design system first.** `DESIGN-medsync.md` is authoritative. Use token utilities only: type `text-heading-l/m/s`,
  `text-body-l/m/s`, `text-caption`, `text-overline`; colours `mint-*`/`teal-*` (actions, done, focus), `amber-*`
  (open / recommended / due / overdue / stale / offline), `rose-*`/`red` (Law 5 list only — below), `blue-*` (the
  existing in-progress token), neutrals for pending. **No arbitrary font sizes** (`text-[10.5px]` is banned in v2 files).
  Headings weight 500. No left-edge accent bars. Borders 1px. Radius per the design system (8 px buttons, 12 px cards).
- **Red (rose-600 / #DC2626) is allowed ONLY for:** the arrest state + ⚠ Arrest / Re-arrest control; a step with
  an active threat; a failed action; a critical vital cell; the RESUS tag; the board's arrest dot; the Emergency
  affordance (red OUTLINE, never filled). Everything due / overdue / stale / offline is **amber**. The stale-vitals
  "Re-check" nudge is **amber** (E7).
- **Never colour alone:** every state has a word and (for actions) a Lucide icon. **No emoji** anywhere (the v1
  timeline's 💉💧📣 become Lucide icons).
- **Motion:** only CSS transitions on transform/opacity with `cubic-bezier(0.16, 1, 0.3, 1)`, durations 100 / 150 /
  250 ms, stagger 40 ms. No decorative animation. `.tap` utility on pressables (scale 0.96 on active, motion-safe).
  Keyboard-driven console actions never animate. Respect `prefers-reduced-motion` (no pulsing ring; stepwise
  progress; no animated entries). Hover effects inside `@media (hover: hover)` (Tailwind `hover:` is fine only for
  colour changes).
- **Accessibility:** WCAG 2.2 AA light and dark. Touch targets ≥ 44×44 px; arrest-console primary controls ≥ 56 px.
  Live regions: polite for Do now; assertive only for "arrest declared" and "rhythm check due" (rate-limited).
  Focus moves to the console heading on mode switch and back on exit. Every icon-only button has an aria-label.
- **Copy:** active voice, sentence case, name each action the same everywhere ("Record C findings" → toast
  "Recorded"), errors say what happened and what to do. No invented clinical text: clinical wording comes from the
  signed catalogs / reference entries (`refValue(entry)` for any number).
- **Children (< 16):** never render an adult number (the engines already suppress; the UI must not add any).
- **Tooling:** never put more than ~200 lines in one Write/Edit call (build big files in parts); keep components
  ≤ ~300 lines (split). TypeScript strict, no `any`. Client components start with `"use client"`.

## 2. Files and ownership (disjoint)

All new desk components live in `app/nurse/resus/[episodeId]/_components/v2/` (the doctor route reuses them).

| Lane                  | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 shell              | `desk.tsx` (root: `export function ResusDeskV2({ initial }: { initial: DeskInitialData })`), `header.tsx`, `step-rail.tsx`, `team-popover.tsx`, `toast.tsx`, `mode-clock.tsx`, `desk-context.tsx` is ALREADY WRITTEN (the contract — U1 provides it from desk.tsx; everyone reads `useDeskCtx()`)                                                                                                                                             |
| U2 survey             | `survey-mode.tsx`, `step-panel.tsx`, `step-extras.tsx`, `actions-board.tsx`, `action-row.tsx`, `do-now.tsx`, `context-bar.tsx`, `ample-drawer.tsx`, `protocols-chip.tsx`, `arrest-confirm.tsx`                                                                                                                                                                                                                                                |
| U3 vitals + record    | `vitals-cells.tsx` (VitalCell / VitalTrendGraph / TrendArrow MOVED out of `../resus-desk.tsx`, which then imports them — the only legacy edit allowed), `vitals-strip.tsx`, `vitals-capture.tsx`, `record-timeline.tsx`, `record-entry.tsx`                                                                                                                                                                                                   |
| U4 arrest             | `arrest-console.tsx` (+ `arrest-console-*.tsx` parts), `reversible-causes.tsx`, `rosc-confirm.tsx`, `console-audio.ts`, `use-console-keys.ts`                                                                                                                                                                                                                                                                                                 |
| U5 after-arrest       | `post-rosc-panel.tsx`, `termination-review.tsx`, `death-confirmation.tsx`, `after-death.tsx`, `debrief.tsx`, `treatment-limitation.tsx`, `cpr-not-attempted.tsx`, `arrest-details.tsx`                                                                                                                                                                                                                                                        |
| U6 close-out + routes | `close-out-sheet.tsx` (+ parts), `boarding-banner.tsx`, `app/nurse/resus/_components/board-v2.tsx`, `lib/resus/board-v2.ts` (server loader + lazy 12 h idle notice), the four route pages (`app/{nurse,doctor}/resus/page.tsx`, `app/{nurse,doctor}/resus/[episodeId]/page.tsx` — switch on `resusDeskV2()`), triage S0 wiring (`app/nurse/triage/_components/rapid-red-button.tsx`, `app/nurse/resus/actions.ts` `openResusForTriageRecord`) |

Already written (read, don't rewrite): `types.ts` (DeskInitialData, DeskEpisode, DeskMe, DeskSettings, PendingEntry,
WriteOutcome, FastPathDialog), `use-desk.ts` (`useDesk(initial)` → DeskStore: `episode, events, activeEvents,
pending, online, realtime, nowMs, clockWarning, readOnly, submit(spec), retry, discard, refresh`; `useNow(nowMs, ms)`;
`toOutcome(result)`), `lib/resus/desk-v2-loader.ts` (`loadDeskV2({episodeId, basePath})`), `lib/resus/feature.ts`
(`resusDeskV2()`), the legacy `../prescribe-dialog.tsx` (reuse for any drug dialog: `recCode` `als_adrenaline` /
`als_amiodarone` / `als_lidocaine` for arrest drugs, `anaphylaxis_im_adrenaline` for the protocol chip).

## 3. The write pattern (every button that records)

```ts
store.submit({
  label: "Shock 200 J",
  optimistic: ({ clientEventId, recordedAt }) => [
    {
      kind: "shock",
      step: "arrest",
      arrestSeq,
      payload: { arrestSeq, energyJ: 200, energySource: "profile", label: "Shock 200 J" },
    },
  ],
  run: async ({ clientEventId, recordedAt }) =>
    toOutcome(
      await recordShockV2({
        episodeId,
        clientEventId,
        recordedAt,
        arrestSeq,
        energyJ: 200,
        energySource: "profile",
      }),
    ),
  onDialog: (d) => openPrescribeDialog(d), // fast-path drugs only
});
```

The optimistic payload must match what the server writes (use `lib/resus/v2-payloads.ts` for findings / action
states: `buildAssessmentPayload`, `buildActionStatePayload`, `buildAllergyNote`). A toast "Logged A+06:12 · Undo ·
Edit" follows one-tap arrest entries (10 s). Undo = `correctEventV2({ supersedesEventId, reason: "undone" })` for a
confirmed row, or `store.discard(clientEventId)` for one not yet sent.

## 4. Server actions (import from `app/nurse/resus/_v2/…`)

- `actions-survey.ts`: `getServerTime`, `fetchResusDeltaV2`, `setPatientContextV2({flags})`,
  `recordStepFindingsV2({step, findings, local})`, `setStepActionStateV2({step, actionId, actionCode, state, reason?})`,
  `logVitalsV2({snapshot})`, `annotateVitalV2({vitalEventId, fields, reason})`, `recordNoteV2({text})`,
  `correctEventV2({supersedesEventId, reason})`, `recordReturnToAV2({reason?})`, `setRoleV2({role, userId?})`,
  `respondV2()`.
- `actions-arrest.ts`: `declareArrestV2({signs, source})`, `updateArrestDetailsV2(...)`, `recordRhythmCheckV2({arrestSeq,
rhythm, pulse?})`, `recordShockV2({arrestSeq, energyJ, energySource, stacked?})`, `recordArrestProcedureV2({arrestSeq,
arrestProcedure, ettTrace?, toUserId?, toName?})`, `setReversibleCauseV2({arrestSeq, cause, state})`,
  `recordRoscV2({arrestSeq, signs})`, `recordArrestDrugV2({arrestSeq, drug, route})` → `FastPathResult`
  (`openDialog` → prescribe dialog pre-filled), `stopResuscitationV2(...)`, `recordCprNotAttemptedV2(...)`,
  `confirmDeathV2(...)`, `recordTreatmentLimitationV2(...)`, `setPostRoscItemV2({itemId, state})`,
  `setObeysCommandsV2({value})`, `setBayProfileV2({bayProfileId})`.
- `actions-closeout.ts`: `closeResusV2({outcomeCode, disposition, sbar, receiving, escort, cprOngoing?})`,
  `startBoardingV2({disposition})`, `reactivateResusV2({reason})`, `cancelResusV2({reason})`,
  `adminCloseResusV2({reason})`, `recordAfterDeathTaskV2({taskId, state, note?})`, `saveDebriefV2({...,submit})`.
  Every write takes `{ episodeId, clientEventId, recordedAt? }`.

## 5. Engines (pure; import in the client)

`lib/resus/survey/*` (`computeSurvey`, `computeStepStates`, `visibleFindings`, `computeDoNow`, `latestContext`,
`arrestActive`, `deriveMeasureFindings`), `lib/resus/reference/presentation.ts` (`STEP_PRESENTATION`, `findingLabel`,
`STEP_LOCAL_CONTROLS`), `lib/resus/als/engine.ts` (`computeArrestState(events, nowMs, ctx)`), `lib/resus/als/termination.ts`
(`terminationReview`, `stopAuthority`), `lib/resus/death/confirmation.ts` (`deathObservation`), `lib/resus/closeout/*`
(`levelInputFromRecord`, `suggestLevel`, `mismatchRequired`, `buildSbar`, `bundleState`, `postRoscPins`,
`obeysCommands`, `idleClass`, `allowedActions`), reference entries in `lib/resus/reference/{als-catalog,
post-rosc-catalog,levels-of-care,death-confirmation}.ts`. Engines needing a ticking `now` are computed inside the
component that ticks (`useNow`), never at desk level every second.

## 6. Modes (desk.tsx picks by `episode.state` + `episode.phase`)

- `state !== "active"` → Closed: read-only survey + record + an outcome summary card; the after-death checklist and
  debrief stay editable ≤ 24 h after close (U5).
- `phase === "arrest"` → Arrest console (U4) with a "Survey (paused)" tab to the survey (U2).
- `phase === "post_rosc"` → Post-ROSC panel (U5) above the survey (U2) with post-ROSC pins.
- `phase === "boarding"` → Boarding banner (U6) above the survey (U2).
- else → Survey (U2).
- A running arrest that has been stopped (resuscitation_stopped, no death confirmed yet) → Death confirmation (U5).

## 7. Budgets and hooks for measurement

- Findings area on load per step: ≤ 12 finding chips, ≤ 22 interactive elements (GATE A §3 table). Mark the findings
  area `data-measure="findings"` and each finding chip `data-chip`; action rows `data-action-row` (≤ 3 controls each).
- Add `data-testid` to the arrest console root (`arrest-console`), post-ROSC panel, close-out sheet, board sections.
- The local screenshot harness renders `ResusDeskV2` from a fixture `DeskInitialData` (no DB): components must
  render without any server call on mount other than the store's own (which fail gracefully offline).

## 8. Exported component names (lanes import each other by these — build against them even before the file lands)

| File                                            | Export                | Props                                                                                                                             |
| ----------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `desk.tsx` (U1)                                 | `ResusDeskV2`         | `{ initial: DeskInitialData }` — provides `DeskCtx`, renders the mode, hosts dialogs/sheets/toasts                                |
| `header.tsx` (U1)                               | `DeskHeader`          | none (ctx)                                                                                                                        |
| `step-rail.tsx` (U1)                            | `StepRail`            | none (ctx)                                                                                                                        |
| `team-popover.tsx` (U1)                         | `TeamChip`            | none (ctx)                                                                                                                        |
| `toast.tsx` (U1)                                | `Toaster`             | `{ toasts, onDismiss }` (desk owns state; `ui.toast()` pushes)                                                                    |
| `mode-clock.tsx` (U1)                           | `ModeClock`           | `{ sinceIso: string; label: string }` (ticks itself via `useNow`)                                                                 |
| `survey-mode.tsx` (U2)                          | `SurveyMode`          | `{ postRosc?: boolean }`                                                                                                          |
| `arrest-confirm.tsx` (U2)                       | `ArrestConfirmDialog` | `{ open: boolean; source: "desk" \| "step"; onClose: () => void }`                                                                |
| `ample-drawer.tsx` (U2)                         | `AmpleDrawer`         | `{ open: boolean; onClose: () => void }`                                                                                          |
| `protocols-chip.tsx` (U2)                       | `ProtocolsChip`       | none                                                                                                                              |
| `vitals-strip.tsx` (U3)                         | `VitalsStrip`         | none                                                                                                                              |
| `record-timeline.tsx` (U3)                      | `RecordTimeline`      | `{ variant?: "rail" \| "sheet" }`                                                                                                 |
| `arrest-console.tsx` (U4)                       | `ArrestConsole`       | none                                                                                                                              |
| `post-rosc-panel.tsx` (U5)                      | `PostRoscPanel`       | none                                                                                                                              |
| `termination-review.tsx` (U5)                   | `TerminationReview`   | `{ open: boolean; onClose: () => void }`                                                                                          |
| `death-confirmation.tsx` (U5)                   | `DeathConfirmation`   | none (shown after a stop, until death is confirmed or signs of life)                                                              |
| `after-death.tsx` (U5)                          | `AfterDeathChecklist` | none                                                                                                                              |
| `debrief.tsx` (U5)                              | `DebriefPanel`        | none                                                                                                                              |
| `after-death.tsx` (U5)                          | `ClosedSummary`       | none (outcome card for a closed / cancelled episode)                                                                              |
| `close-out-sheet.tsx` (U6)                      | `CloseOutSheet`       | `{ open: boolean; arrestEnding: boolean; onClose: () => void }`                                                                   |
| `boarding-banner.tsx` (U6)                      | `BoardingBanner`      | none                                                                                                                              |
| `app/nurse/resus/_components/board-v2.tsx` (U6) | `ResusBoardV2`        | `{ board: ResusBoardV2Data; basePath: string; me: { canAdminClose: boolean } }` (`ResusBoardV2Data` from `lib/resus/board-v2.ts`) |
