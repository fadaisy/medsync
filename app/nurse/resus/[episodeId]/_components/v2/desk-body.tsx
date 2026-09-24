"use client";

import type { DeskMode } from "./mode-clock";
import type { ReactNode } from "react";
import { ClipboardListIcon, HeartPulseIcon, ScrollTextIcon } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AfterDeathChecklist, ClosedSummary } from "./after-death";
import { ArrestConsole } from "./arrest-console";
import { ArrestTabs } from "./arrest-tabs";
import { BoardingBanner } from "./boarding-banner";
import { DeathConfirmation } from "./death-confirmation";
import { DebriefPanel } from "./debrief";
import { useDeskCtx } from "./desk-context";
import { PostRoscPanel } from "./post-rosc-panel";
import { RecordTimeline } from "./record-timeline";
import { StepRail } from "./step-rail";
import { SurveyMode } from "./survey-mode";
import { VitalsStrip } from "./vitals-strip";

/*
 * Resus Desk v2 — the mode surfaces (UI-BUILD-SPEC §6), the phone bottom bar
 * and the Record sheet (banners: desk-banners.tsx). Split from desk.tsx (the
 * root owns state; this file only lays out what the mode shows).
 */

const container = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6";

/** Main column + the Record rail (≥ 1280 px; below that the Record is a sheet). */
function Columns({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        container,
        "grid flex-1 grid-cols-1 gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      <aside aria-label="Resus record" className="hidden xl:block">
        <div className="sticky top-28 max-h-[calc(100svh-8rem)] overflow-y-auto">
          <RecordTimeline variant="rail" />
        </div>
      </aside>
    </div>
  );
}

/** The step rail + vitals strip every survey-based mode shares. */
function SurveyChrome() {
  return (
    <>
      <StepRail />
      <VitalsStrip />
    </>
  );
}

export function DeskBody({ mode }: { mode: DeskMode }) {
  const { ui, store } = useDeskCtx();
  switch (mode) {
    case "closed": {
      const died =
        store.episode.outcomeCode === "died_after_cpr" ||
        store.episode.outcomeCode === "died_cpr_not_attempted" ||
        store.activeEvents.some((e) => e.kind === "death_confirmed");
      return (
        <Columns>
          <ClosedSummary />
          {died ? <AfterDeathChecklist /> : null}
          <DebriefPanel />
          <SurveyChrome />
          <SurveyMode />
        </Columns>
      );
    }
    case "confirm_death":
      return (
        <Columns>
          <DeathConfirmation />
        </Columns>
      );
    case "death_confirmed":
      return (
        <Columns>
          <DeathConfirmation />
          <AfterDeathChecklist />
        </Columns>
      );
    case "arrest":
      return (
        <>
          <ArrestTabs />
          {ui.surveyTab ? (
            <Columns>
              <SurveyChrome />
              <SurveyMode />
            </Columns>
          ) : null}
          {/* Kept mounted behind the survey tab: the rhythm-check tone and metronome keep going. */}
          <div hidden={ui.surveyTab} className={cn(container, "flex-1 py-4")}>
            <ArrestConsole />
          </div>
        </>
      );
    case "post_rosc":
      return (
        <Columns>
          <PostRoscPanel />
          <SurveyChrome />
          <SurveyMode postRosc />
        </Columns>
      );
    case "boarding":
      return (
        <Columns>
          <BoardingBanner />
          <SurveyChrome />
          <SurveyMode />
        </Columns>
      );
    default:
      return (
        <Columns>
          <SurveyChrome />
          <SurveyMode />
        </Columns>
      );
  }
}

/** Scroll the first match into view (smooth unless reduced motion — CSS decides). */
function reveal(...selectors: string[]) {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (!el) continue;
    el.scrollIntoView({ block: "center" });
    if (el.matches("button")) el.focus({ preventScroll: true });
    return;
  }
}

const barBtn =
  "tap border-border text-body-s hover:bg-muted inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border px-3 font-medium";

/** The bottom bar shows everywhere below 1280 px except over the arrest console. */
export const bottomBarShown = (mode: DeskMode, surveyTab: boolean): boolean =>
  !(mode === "arrest" && !surveyTab);

/**
 * Below 1280 px: a bottom bar. Below 1024 px it holds Record findings and
 * Record vitals (prompt §5.1 — the panel's own Record bar is not sticky
 * there); the Resus record opens as a sheet until the rail fits. Hidden on the
 * arrest console, which carries its own log. The desk root reserves its height
 * (desk.tsx), so it never covers the end of the page.
 */
export function DeskBottomBar({
  mode,
  onOpenRecord,
}: {
  mode: DeskMode;
  onOpenRecord: () => void;
}) {
  const { ui, store } = useDeskCtx();
  if (!bottomBarShown(mode, ui.surveyTab)) return null;
  const surveyShown = !store.readOnly && mode !== "confirm_death" && mode !== "death_confirmed";
  return (
    <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] supports-backdrop-filter:backdrop-blur-sm xl:hidden">
      <div className={cn(container, "flex items-center gap-2")}>
        {surveyShown ? (
          <>
            <button
              type="button"
              onClick={() => reveal("#record-findings", '[data-measure="findings"]')}
              className={cn(barBtn, "lg:hidden")}
            >
              <ClipboardListIcon aria-hidden className="size-4" />
              Record findings
            </button>
            <button
              type="button"
              onClick={() => ui.openVitals()}
              className={cn(barBtn, "lg:hidden")}
            >
              <HeartPulseIcon aria-hidden className="size-4" />
              Record vitals
            </button>
          </>
        ) : null}
        <button type="button" onClick={onOpenRecord} className={cn(barBtn, "ml-auto")}>
          <ScrollTextIcon aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">Resus record</span>
        </button>
      </div>
    </div>
  );
}

/** The Resus record below 1280 px (a centred panel). */
export function RecordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="center" widthClassName="max-w-[880px]">
        <SheetHeader>
          <SheetTitle>Resus record</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <RecordTimeline variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
