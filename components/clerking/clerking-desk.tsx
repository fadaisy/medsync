"use client";

import type { HistoryBodyProps } from "./history-sections";
import type { Derived, VitalsView } from "./model";
import type { PastHistoryHandlers } from "./past-history-body";
import type { DeskViewHandlers, DeskViewProps } from "@/components/emr/desk/desk-view";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { SectionCtx } from "@/components/emr/desk/sections";
import type { HistoryHeader } from "@/lib/clerking/answers";
import type { Catalogue } from "@/lib/clerking/catalogue";
import type { BlockKey } from "@/lib/clerking/compose";
import type { DeskSection } from "@/lib/clerking/flags";
import type { SectionId, SectionStatus } from "@/lib/clerking/status";
import type { NoteContent } from "@/lib/emr/note-rules";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { RestrictedMark } from "@/components/emr/chips";
import { deskValidation, requiredCount } from "@/components/emr/desk/model";
import { SectionBody } from "@/components/emr/desk/sections";
import { NoteRowsView } from "@/components/emr/desk/sign";
import { EmrDialog } from "@/components/emr/emr-dialog";
import { formatters, parts, withoutNameOnly } from "@/components/emr/format";
import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { SECTION_BLOCK } from "@/lib/clerking/compose";
import { SECTIONS } from "@/lib/clerking/status";
import { cn } from "@/lib/utils";
import { FamilyBody, SocialBody } from "./family-social";
import { FlagsPanel } from "./flags-panel";
import { ComplaintBody, HistoryBody } from "./history-sections";
import {
  BLURB,
  deriveDesk,
  historyOf,
  sectionIndex,
  signedRef,
  V1_SECTION,
  vitalsView,
  withHistory,
} from "./model";
import { NotePane } from "./note-pane";
import { PastHistoryBody } from "./past-history-body";
import {
  PhoneBottomBar,
  PhoneHeader,
  PhoneStepBar,
  usePhone,
  useScrolledPast,
} from "./phone-shell";
import { ClerkingRail } from "./rail";
import { SystemsBody } from "./systems-body";

/**
 * Clerking desk v2 (PROMPT-CLERKING-DESK-V2 §4–5): the shell. The page never scrolls at 1440×900:
 * the safety bar and the section bar sit on top; the rail (272 px), the centre card and the right
 * column (392 px: Flags, the note, Sign/Complete at its foot) scroll inside themselves. Below xl the
 * rail and the right column open as centred dialogs ("Context", "Note and flags"; ADR 0161) and the
 * section bar scrolls sideways; on a phone the bar folds to "Step 3 of 10 · Systems" and nothing is
 * fixed over the narrative (C8). Plum marks place only (current step, current note block); teal is
 * done and every button; amber is caution; red only as the Flags panel and the rail allow.
 */

export interface ClerkingDeskProps {
  p: DeskPayload;
  /** null while the catalogue loads (the shell, rail and note header render first). */
  cat: Catalogue | null;
  catalogueFailed?: boolean;
  content: NoteContent;
  current: string;
  save: DeskViewProps["save"];
  clockWarning?: boolean;
  announce?: DeskViewProps["announce"];
  on: DeskViewHandlers & PastHistoryHandlers;
  loaders: DeskViewProps["loaders"];
  busy?: string | null;
  signing?: boolean;
  slots?: { orders?: ReactNode; tools?: ReactNode };
}

const GROUPS = [
  { id: "history", label: "History" },
  { id: "plan", label: "Examination and plan" },
] as const;

/* ─── Safety bar (§5.1): two identifiers, no flag badges ────────── */

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body-s text-foreground inline-flex flex-wrap items-center gap-2">
        {children}
      </dd>
    </div>
  );
}

function SafetyBar({
  p,
  vitals,
  alarm,
  status,
  tools,
}: {
  p: DeskPayload;
  vitals: VitalsView | null;
  alarm: boolean;
  status: ReactNode;
  tools?: ReactNode;
}) {
  const bar = p.safetyBar;
  const uncoded = p.clerking?.allergies.items.some((a) => !a.coded) ?? false;
  return (
    <section
      aria-labelledby="safety-bar-name"
      aria-describedby="safety-bar-summary"
      data-slot="safety-bar"
      className="bg-background border-border shrink-0 border-b px-4 py-3 max-sm:hidden md:px-5"
    >
      <p id="safety-bar-summary" className="sr-only">
        {bar.accessibleSummary}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1
          id="safety-bar-name"
          className="font-display text-heading-m text-foreground font-medium"
        >
          {bar.name}
        </h1>
        <span className="text-body-s text-muted-foreground flex flex-wrap gap-x-3 tabular-nums">
          {parts(bar.ageSex).map((x) => (
            <span key={x}>{x}</span>
          ))}
          <span className="text-foreground font-mono tracking-[0.02em]">{bar.mrn}</span>
        </span>
        {bar.deceased ? <StatusWord tone="neutral">{bar.deceased.text}</StatusWord> : null}
        {bar.restricted ? <RestrictedMark className="text-body-s" /> : null}
        <span className="flex-1" />
        {status}
        {tools}
      </div>
      <dl className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-2">
        <Pair label="Allergies">
          {bar.allergy.state === "listed" ? (
            <span className="font-medium">
              {bar.allergy.items.map((a) => withoutNameOnly(a.text)).join(", ")}
            </span>
          ) : bar.allergy.tone === "neutral" ? (
            <span>{bar.allergy.text}</span>
          ) : (
            <StatusWord tone={bar.allergy.tone}>{bar.allergy.text}</StatusWord>
          )}
          {uncoded ? (
            <StatusWord tone="caution">Uncoded, not checked by prescribing</StatusWord>
          ) : null}
        </Pair>
        <Pair label="Active problems">
          {bar.problems.length ? (
            bar.problems.map((x) => (
              <span key={x.id} className="inline-flex items-center gap-1">
                {x.display}
                {x.restricted ? <RestrictedMark /> : null}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">None recorded</span>
          )}
          {bar.moreProblems ? (
            <span className="text-muted-foreground">{`${bar.moreProblems} more`}</span>
          ) : null}
        </Pair>
        <Pair label="Critical results">
          {bar.criticalText ? (
            <StatusWord tone="caution">{bar.criticalText}</StatusWord>
          ) : (
            <span>None</span>
          )}
        </Pair>
        <Pair label="Vital signs">
          {vitals ? (
            <StatusWord tone={alarm ? "caution" : "neutral"}>{vitals.chip}</StatusWord>
          ) : (
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </Pair>
      </dl>
    </section>
  );
}

/* ─── Section bar (§5.1, §10) ────────────────────────────────────── */

type Statuses = Record<SectionId, SectionStatus> | null;

function StepButton({
  s,
  status,
  current,
  onSection,
  wide,
}: {
  s: (typeof SECTIONS)[number];
  status: SectionStatus | undefined;
  current: boolean;
  onSection?: (id: string) => void;
  /** In the phone dialog: a full-width row. */
  wide?: boolean;
}) {
  const done = status?.tone === "done";
  const required = status?.tone === "required";
  const n = sectionIndex(s.id) + 1;
  return (
    <button
      type="button"
      data-step={s.id}
      aria-current={current ? "step" : undefined}
      aria-label={`${s.short}${status ? `, ${status.text}` : ""}, step ${n} of ${SECTIONS.length}`}
      onClick={() => onSection?.(s.id)}
      className={cn(
        "focus-visible:shadow-focus flex min-h-11 items-center gap-1.5 rounded-md py-1 pr-1.5 pl-1 text-left outline-none",
        wide ? "w-full" : "shrink-0",
        current
          ? "bg-plum-50 text-plum-800 ring-plum-200 ring-1"
          : "text-foreground hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "text-caption inline-flex size-[22px] shrink-0 items-center justify-center rounded-full font-mono font-semibold",
          current
            ? "bg-plum-800 text-plum-50"
            : done
              ? "bg-teal-600 text-white"
              : required
                ? "dark:text-status-caution-fg text-amber-800 ring-2 ring-amber-500 ring-inset"
                : "border-border text-muted-foreground border",
        )}
      >
        {done && !current ? <CheckIcon className="size-3" strokeWidth={2.5} /> : s.num}
      </span>
      <span aria-hidden className="flex flex-col">
        <span className="text-body-s font-medium whitespace-nowrap">{s.short}</span>
        {status ? (
          <span
            className={cn(
              // Never truncated (§5.1): a long status wraps to a second line instead.
              "text-caption leading-tight",
              !wide && "max-w-[8.5rem]",
              // On the current step the status takes the step's own (place) colour: the tokens
              // invert in dark, so no dark: override is needed.
              current
                ? "text-plum-800"
                : required
                  ? "dark:text-status-caution-fg text-amber-800"
                  : done
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-muted-foreground",
            )}
          >
            {status.text}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SectionBar({
  statuses,
  current,
  done,
  onSection,
}: {
  statuses: Statuses;
  current: string;
  done: number | null;
  onSection?: (id: string) => void;
}) {
  // Tablet: the bar scrolls sideways; keep the current step in view (instant, no motion).
  useEffect(() => {
    document
      .querySelector(`nav[data-slot="clerking-steps"] [data-step="${current}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    // The note: bring the block this section writes into view (§5.10), instantly.
    document
      .querySelector('[data-block][data-current="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current]);
  return (
    <nav
      aria-label="Clerking sections"
      data-slot="clerking-steps"
      className="border-border bg-background hidden shrink-0 items-stretch gap-3 overflow-x-auto border-b px-3 py-2 md:flex"
    >
      {GROUPS.map((g, gi) => {
        const steps = SECTIONS.filter((s) => s.group === g.id);
        return (
          <Fragment key={g.id}>
            {gi ? <span aria-hidden className="bg-border w-px shrink-0 self-stretch" /> : null}
            <div className="flex shrink-0 flex-col gap-1">
              <span
                id={`clerking-steps-${g.id}`}
                className="text-caption text-muted-foreground pl-2 tracking-[0.06em] uppercase"
              >
                {g.label}
              </span>
              <ol aria-labelledby={`clerking-steps-${g.id}`} className="flex items-center">
                {steps.map((s, i) => (
                  <li key={s.id} className="flex shrink-0 items-center">
                    <StepButton
                      s={s}
                      status={statuses?.[s.id]}
                      current={s.id === current}
                      onSection={onSection}
                    />
                    {i < steps.length - 1 ? (
                      <span
                        aria-hidden
                        className={cn(
                          "mx-0.5 h-0.5 w-2 shrink-0 rounded-full",
                          statuses?.[s.id].tone === "done" ? "bg-teal-600" : "bg-border",
                        )}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </Fragment>
        );
      })}
      <span aria-hidden className="bg-border w-px shrink-0 self-stretch" />
      <span className="text-caption text-muted-foreground shrink-0 self-center font-mono whitespace-nowrap tabular-nums">
        {done === null ? "Loading" : `${done} of ${SECTIONS.length} done`}
      </span>
    </nav>
  );
}

/* ─── Sign and complete (§5.10 foot) ─────────────────────────────── */

function SignBar({
  required,
  ready,
  canSign,
  signing,
  complete,
  onSign,
  onComplete,
}: {
  required: { met: number; of: number };
  ready: boolean;
  canSign: boolean;
  signing?: boolean;
  complete: boolean;
  onSign?: () => void;
  onComplete?: () => void;
}) {
  const words = `Required ${required.met} of ${required.of}`;
  return (
    <div
      data-slot="desk-actions"
      className="border-border bg-background flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-5 py-3"
    >
      {canSign ? (
        <span className="basis-full" aria-live="polite">
          {ready ? (
            <span className="text-caption inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
              <CheckIcon aria-hidden className="size-3" />
              {words}
            </span>
          ) : (
            <StatusWord tone="caution">{words}</StatusWord>
          )}
        </span>
      ) : null}
      {canSign ? (
        <Button
          className={cn("min-h-11 flex-1", PRESS)}
          onClick={onSign}
          disabled={!ready || signing}
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          Sign note
          <kbd className="text-caption hidden font-mono md:inline">Ctrl ↵</kbd>
        </Button>
      ) : null}
      {complete ? (
        <Button variant="secondary" className={cn("min-h-11", PRESS)} onClick={onComplete}>
          Complete visit
        </Button>
      ) : null}
    </div>
  );
}

/* ─── The desk ───────────────────────────────────────────────────── */

export function ClerkingDesk(props: ClerkingDeskProps) {
  const { p, cat, content, on, slots = {} } = props;
  const [dialog, setDialog] = useState<null | "context" | "note" | "steps">(null);
  // Below 640 px: pop-ups are bottom sheets, and the step bar carries the identifiers once the
  // patient header has scrolled away (D-CM-02, D-CM-05).
  const phone = usePhone();
  const headerRef = useRef<HTMLElement | null>(null);
  const headerGone = useScrolledPast(headerRef);
  // A linked answer in Systems opens its complaint card in Complaint (D-CV-08).
  const [openComplaint, setOpenComplaint] = useState<string | null>(null);
  const fmt = formatters(p.timeZone);
  const k = p.clerking!;
  const signedNote = p.draft === null ? p.signed : null;
  const view = signedNote ? signedNote.content : content;
  const editable = !signedNote && p.draft !== null && (p.encounter.open || p.draft.noteId !== null);
  const act = p.flags.actionsAllowed && editable;

  const derived: Derived | null = cat ? deriveDesk(cat, p, view) : null;
  const validation = derived?.validation ?? deskValidation(p, view);
  const vitals = k.vitalsAt ? vitalsView(k.vitals, p.context.vitals) : null;
  const alarm = derived
    ? derived.flags.some((f) => f.section === "exam")
    : !!vitals?.news2.hasSingleParameterThree;

  const at = Math.max(0, sectionIndex(props.current));
  const cur = SECTIONS[at]!;
  const prev = SECTIONS[at - 1];
  const next = SECTIONS[at + 1];
  const go = (id: string) => {
    setDialog(null);
    if (id !== "complaint") setOpenComplaint(null);
    on.onSection?.(id);
  };

  const history = historyOf(view);
  const onHistory: HistoryBodyProps["onHistory"] = (fn) =>
    on.onContent?.(withHistory(content, fn(historyOf(content)), k.catalogueVersion));
  const onHeader = (h: HistoryHeader) =>
    on.onContent?.({
      ...withHistory(content, historyOf(content), k.catalogueVersion),
      header: { ...content.header, ...h },
    });
  const onEdited = (key: BlockKey, text: string | null) => {
    const edited = { ...(content.edited ?? {}) };
    if (text === null) delete edited[key];
    else edited[key] = text;
    on.onContent?.({ ...content, edited });
  };

  const ctx: SectionCtx = {
    p,
    content: view,
    editable,
    act,
    fmt,
    on,
    loadFindings: props.loaders.findings,
    loadTerms: props.loaders.terms,
    searchTerms: props.loaders.searchTerms,
    busy: props.busy ?? null,
    slots: { orders: slots.orders },
  };

  const body = (() => {
    const sid = V1_SECTION[cur.id];
    if (sid) {
      const s = p.template.sections.find((x) => x.id === sid);
      return s ? <SectionBody s={s} ctx={ctx} /> : null;
    }
    if (!cat || !derived)
      return (
        <p role="status" className="text-body-s text-muted-foreground">
          {props.catalogueFailed
            ? "The clerking catalogue did not load. Reload the page to try again."
            : "Loading the clerking catalogue…"}
        </p>
      );
    const hp: HistoryBodyProps = {
      cat,
      header: derived.header,
      history,
      onHeader,
      onHistory,
      editable,
      cautionFrom: signedRef(cat, k.signoff, "REF-FLAG-PAIN-SEVERE"),
      sex: k.sex,
      patient: { name: p.patient.name, mrn: p.patient.mrn },
      badges: derived.badges,
      openKey: openComplaint,
      onOpenComplaint: (key) => {
        setOpenComplaint(key);
        go("complaint");
      },
    };
    if (cur.id === "complaint") return <ComplaintBody {...hp} />;
    if (cur.id === "history") return <HistoryBody {...hp} />;
    if (cur.id === "systems") return <SystemsBody {...hp} />;
    if (cur.id === "fh") return <FamilyBody {...hp} />;
    if (cur.id === "social") return <SocialBody {...hp} />;
    return (
      <PastHistoryBody
        {...hp}
        record={k}
        problems={p.safetyBar.problems.map((x) => x.display)}
        act={act}
        busy={props.busy ?? null}
        on={on}
        loadTerms={props.loaders.terms}
        searchTerms={props.loaders.searchTerms}
      />
    );
  })();

  const rail = (
    <ClerkingRail
      p={p}
      fmt={fmt}
      vitals={vitals}
      alarm={alarm}
      onRecord={act ? () => go("exam") : undefined}
    />
  );
  const required = requiredCount(p, validation);
  const ready = validation.missing.length === 0;
  const noteAndFlags = (inDialog: boolean) => (
    <>
      {inDialog && phone && editable ? (
        <p aria-live="polite" className="px-5 pt-1 sm:hidden">
          {ready ? (
            <span className="text-body-s inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
              <CheckIcon aria-hidden className="size-3.5" />
              {`Required ${required.met} of ${required.of}`}
            </span>
          ) : (
            <StatusWord tone="caution">{`Required ${required.met} of ${required.of}`}</StatusWord>
          )}
        </p>
      ) : null}
      <FlagsPanel badges={derived?.badges ?? []} onGo={(s: DeskSection) => go(s)} />
      <div className="border-border border-t" />
      {derived ? (
        <NotePane
          blocks={derived.blocks}
          current={SECTION_BLOCK[cur.id] ?? "history"}
          edited={view.edited ?? {}}
          editable={editable}
          onEdited={onEdited}
        />
      ) : (
        <p className="text-body-s text-muted-foreground px-5 py-4">Loading the note…</p>
      )}
      {p.notes.length && !inDialog ? (
        <section aria-labelledby="clerking-notes-heading" className="px-5 py-4">
          <h2 id="clerking-notes-heading" className="text-body-m text-foreground font-medium">
            Signed notes this visit
          </h2>
          <NoteRowsView notes={p.notes} fmt={fmt} on={on} busy={props.busy} />
        </section>
      ) : null}
    </>
  );
  const signBar = (
    <SignBar
      required={required}
      ready={ready}
      canSign={editable}
      signing={props.signing}
      complete={p.encounter.open}
      onSign={on.onSign}
      onComplete={on.onComplete}
    />
  );
  const who = (
    <>
      <span>{p.patient.name}</span> <span className="font-mono tabular-nums">{p.patient.mrn}</span>
    </>
  );

  const status = (
    <span className="inline-flex items-center gap-2">
      {signedNote ? (
        <StatusWord tone={signedNote.note.tone === "caution" ? "caution" : "neutral"}>
          {`${signedNote.note.statusText} ${fmt.time(signedNote.note.at)}`}
        </StatusWord>
      ) : (
        <>
          <StatusWord tone="neutral">Draft</StatusWord>
          <span role="status" aria-live="polite" className="inline-flex">
            {props.save.tone === "caution" ? (
              <StatusWord tone="caution">{props.save.text}</StatusWord>
            ) : (
              <span className="text-caption text-muted-foreground font-mono tabular-nums">
                {props.save.text}
              </span>
            )}
          </span>
        </>
      )}
      {props.clockWarning ? (
        <StatusWord tone="caution">
          This device’s clock is more than 30 seconds off; times use the server’s clock.
        </StatusWord>
      ) : null}
    </span>
  );

  const phoneStatus = signedNote ? (
    <StatusWord tone={signedNote.note.tone === "caution" ? "caution" : "neutral"}>
      {`${signedNote.note.statusText} ${fmt.time(signedNote.note.at)}`}
    </StatusWord>
  ) : (
    <StatusWord tone="neutral">Draft</StatusWord>
  );
  const phoneSaved = signedNote ? null : (
    <span role="status" aria-live="polite" className="inline-flex shrink-0">
      {props.save.tone === "caution" ? (
        <StatusWord tone="caution">{props.save.text}</StatusWord>
      ) : (
        <span
          className={cn(
            "text-body-s inline-flex items-center gap-1 tabular-nums",
            props.save.text.startsWith("Saved")
              ? "text-teal-700 dark:text-teal-300"
              : "text-muted-foreground",
          )}
        >
          {props.save.text.startsWith("Saved") ? (
            <CheckIcon aria-hidden className="size-3.5" />
          ) : null}
          {props.save.text}
        </span>
      )}
    </span>
  );

  return (
    // Phone: fields at 16 px so iOS never zooms into them (§5).
    <div
      className="flex min-h-0 flex-1 flex-col max-sm:[&_input]:text-base max-sm:[&_textarea]:text-base"
      data-slot="clerking-desk"
    >
      <SafetyBar p={p} vitals={vitals} alarm={alarm} status={status} tools={slots.tools} />
      <PhoneHeader
        p={p}
        fmt={fmt}
        vitals={vitals}
        alarm={alarm}
        status={phoneStatus}
        saved={phoneSaved}
        headerRef={headerRef}
        onContext={() => setDialog("context")}
      />
      <PhoneStepBar
        at={at}
        statuses={derived?.statuses ?? null}
        badges={derived?.badges ?? []}
        identity={headerGone ? { name: p.safetyBar.name, mrn: p.safetyBar.mrn } : null}
        onSteps={() => setDialog("steps")}
        onNote={() => setDialog("note")}
      />
      <SectionBar
        statuses={derived?.statuses ?? null}
        current={cur.id}
        done={derived?.done ?? null}
        onSection={go}
      />
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2 max-sm:hidden xl:hidden">
        <button
          type="button"
          onClick={() => setDialog("steps")}
          className="text-body-s border-border focus-visible:shadow-focus inline-flex min-h-11 items-center gap-2 rounded-md border px-3 outline-none md:hidden"
        >
          <span className="text-muted-foreground font-mono tabular-nums">{`Step ${at + 1} of ${SECTIONS.length}`}</span>
          <span className="text-foreground font-medium">{cur.short}</span>
          <ChevronDownIcon aria-hidden className="size-4" />
        </button>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => setDialog("context")}>
          Context
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDialog("note")}>
          {`Note and flags${derived?.badges.length ? ` (${derived.badges.length})` : ""}`}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <aside
          aria-label="What the record already holds"
          className="border-border bg-muted/30 relative hidden w-[272px] shrink-0 overflow-y-auto border-r xl:block"
        >
          {rail}
        </aside>

        <main className="bg-muted/40 flex min-w-0 flex-1 flex-col xl:min-h-0">
          <div className="relative flex flex-1 flex-col gap-3 p-4 max-sm:px-3.5 max-sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 xl:min-h-0 xl:overflow-y-auto">
            {props.announce ? (
              <p role="status">
                {props.announce.ok ? (
                  <span className="text-body-s text-foreground">{props.announce.text}</span>
                ) : (
                  <StatusWord tone="caution">{props.announce.text}</StatusWord>
                )}
              </p>
            ) : null}
            {!p.flags.actionsAllowed && p.safetyBar.deceased ? (
              <p className="text-body-s text-muted-foreground">
                {`${p.safetyBar.deceased.text}. Clinical actions are removed; the note can still be completed and signed.`}
              </p>
            ) : null}
            {!p.encounter.open ? (
              <p className="text-body-s text-muted-foreground">This visit is closed.</p>
            ) : null}
            <section
              id={`desk-${cur.id}`}
              aria-labelledby={`desk-${cur.id}-heading`}
              // Phone: no card around the step; its groups are the panels (§3 rule 5).
              className="bg-card shadow-card rounded-lg max-sm:rounded-none max-sm:bg-transparent max-sm:shadow-none"
            >
              <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4 max-sm:border-0 max-sm:px-0.5 max-sm:pt-0 max-sm:pb-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-2.5">
                    <span
                      aria-hidden
                      className="text-caption text-plum-700 font-mono max-sm:hidden"
                    >
                      {`[${cur.num}]`}
                    </span>
                    <h2
                      id={`desk-${cur.id}-heading`}
                      tabIndex={-1}
                      className="text-heading-s text-foreground max-sm:text-heading-m font-medium outline-none"
                    >
                      {cur.title}
                    </h2>
                  </div>
                  <p className="text-body-s text-muted-foreground max-sm:text-body-m">
                    {BLURB[cur.id]}
                  </p>
                </div>
                {/* One step label on the phone: the step bar's (§3 rule 3). */}
                <span className="text-caption text-muted-foreground shrink-0 pt-1 font-mono whitespace-nowrap tabular-nums max-sm:hidden">
                  {`Step ${at + 1} of ${SECTIONS.length}`}
                </span>
              </header>
              <div className="px-5 py-5 max-sm:p-0">{body}</div>
            </section>
          </div>
          <footer className="border-border bg-background flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 max-sm:hidden md:px-6">
            {prev ? (
              <Button
                variant="secondary"
                aria-label={`Previous: ${prev.short}`}
                onClick={() => go(prev.id)}
              >
                <ChevronLeftIcon aria-hidden />
                {prev.short}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button onClick={() => go(next.id)}>
                {`Next: ${next.short}`}
                <ChevronRightIcon aria-hidden />
              </Button>
            ) : null}
          </footer>
        </main>

        <aside
          aria-label="Flags and note"
          className="border-border relative hidden w-[392px] shrink-0 flex-col border-l xl:flex xl:min-h-0"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{noteAndFlags(false)}</div>
          {signBar}
        </aside>
        <div className="max-sm:hidden xl:hidden">{signBar}</div>
      </div>
      <PhoneBottomBar prev={prev} next={next} onGo={go} onReview={() => setDialog("note")} />

      <EmrDialog
        open={dialog === "steps"}
        onOpenChange={(o) => setDialog(o ? "steps" : null)}
        title={phone ? "Steps" : "Clerking sections"}
        description={
          <>
            {phone && derived ? (
              <span className="block">{`${derived.done} of ${SECTIONS.length} done`}</span>
            ) : null}
            {who}
          </>
        }
        sheet
      >
        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <section key={g.id} aria-labelledby={`clerking-steps-sheet-${g.id}`}>
              <h3
                id={`clerking-steps-sheet-${g.id}`}
                className="text-caption text-muted-foreground mb-1 tracking-[0.06em] uppercase"
              >
                {g.label}
              </h3>
              <ol className="flex flex-col gap-1">
                {SECTIONS.filter((s) => s.group === g.id).map((s) => (
                  <li key={s.id}>
                    <StepButton
                      s={s}
                      wide
                      status={derived?.statuses[s.id]}
                      current={s.id === cur.id}
                      onSection={go}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </EmrDialog>
      <EmrDialog
        open={dialog === "context"}
        onOpenChange={(o) => setDialog(o ? "context" : null)}
        title="Context"
        description={who}
        sheet
      >
        {rail}
      </EmrDialog>
      <EmrDialog
        open={dialog === "note"}
        onOpenChange={(o) => setDialog(o ? "note" : null)}
        title="Note and flags"
        description={who}
        width="wide"
        sheet="tall"
        footer={
          phone ? (
            <>
              {p.encounter.open ? (
                <Button variant="secondary" className={PRESS} onClick={on.onComplete}>
                  Complete visit
                </Button>
              ) : null}
              {editable ? (
                <Button className={PRESS} onClick={on.onSign} disabled={!ready || props.signing}>
                  Sign note
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {noteAndFlags(true)}
      </EmrDialog>
    </div>
  );
}
