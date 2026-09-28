"use client";

import type { VitalsView } from "./model";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { formatters } from "@/components/emr/format";
import type { Badge } from "@/lib/clerking/flags";
import type { SectionId, SectionStatus } from "@/lib/clerking/status";
import type { ReactNode, RefObject } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { parts, withoutNameOnly } from "@/components/emr/format";
import { PRESS } from "@/components/emr/orders/choice-chips";
import { Button } from "@/components/ui/button";
import { SECTIONS } from "@/lib/clerking/status";
import { cn } from "@/lib/utils";
import { FlagCount } from "./flags-panel";

/**
 * Clerking desk v2 below 640 px (PROMPT-CLERKING-MOBILE §3–4): the patient header with four context
 * tiles (scrolls away), the sticky step bar (one step label, the Note button, the progress line,
 * and name and MRN once the header has gone; Law 9), and the fixed bottom bar. Everything here is
 * `sm:hidden`; the desktop and tablet desk never render it visibly.
 */

type Formatters = ReturnType<typeof formatters>;

const PHONE = "(max-width: 639.98px)";

/** True below 640 px. The server and the first paint say false; CSS does the layout either way. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(PHONE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/** Whether the element has scrolled up out of view (under the app bar). */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPast(!!e && !e.isIntersecting), {
      rootMargin: "-50px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/* ─── Patient header (§4.2) ─────────────────────────────────────── */

function Tile({
  label,
  value,
  source,
  tone = "neutral",
  icon,
  onOpen,
}: {
  label: string;
  value: string;
  source: ReactNode;
  tone?: "neutral" | "done" | "caution";
  icon?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${label}, ${value}. Open context`}
      onClick={onOpen}
      className={cn(
        "focus-visible:shadow-focus flex min-w-0 flex-col rounded-xl border px-3 py-2 text-left outline-none",
        PRESS,
        tone === "caution"
          ? "bg-status-caution-bg border-amber-300 dark:border-amber-700"
          : "bg-muted/50 border-border",
      )}
    >
      <span
        className={cn(
          "text-caption font-semibold tracking-[0.06em] uppercase",
          tone === "caution"
            ? "dark:text-status-caution-fg text-amber-900"
            : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-body-m flex min-w-0 items-center gap-1.5 leading-snug font-semibold",
          tone === "done"
            ? "text-teal-700 dark:text-teal-300"
            : tone === "caution"
              ? "dark:text-status-caution-fg text-amber-900"
              : "text-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </span>
      <span
        className={cn(
          "text-body-s truncate",
          tone === "caution"
            ? "dark:text-status-caution-fg text-amber-900"
            : "text-muted-foreground",
        )}
      >
        {source}
      </span>
    </button>
  );
}

export function PhoneHeader({
  p,
  fmt,
  vitals,
  alarm,
  status,
  saved,
  headerRef,
  onContext,
}: {
  p: DeskPayload;
  fmt: Formatters;
  vitals: VitalsView | null;
  alarm: boolean;
  /** "Draft", or the signed note's status word. */
  status: ReactNode;
  /** The autosave line ("Saved 15:06"). */
  saved: ReactNode;
  headerRef: RefObject<HTMLElement | null>;
  onContext: () => void;
}) {
  const bar = p.safetyBar;
  const k = p.clerking!;
  const uncoded = k.allergies.items.some((a) => !a.coded);
  const [allergyValue, allergySource] =
    bar.allergy.state === "listed"
      ? [bar.allergy.items.map((a) => withoutNameOnly(a.text)).join(", "), "From the record"]
      : (bar.allergy.text.split(/\s+—\s+/, 2) as [string, string?]);
  const nkda = k.allergies.status === "no_known_drug_allergies";
  const problem = bar.problems[0]?.display;
  const more = bar.problems.length - 1 + bar.moreProblems;
  return (
    <section
      ref={headerRef}
      aria-labelledby="phone-patient-name"
      data-slot="phone-patient-header"
      className="bg-background border-border border-b px-4 pt-3 pb-3.5 sm:hidden"
    >
      <div className="flex items-center gap-2.5">
        <h1
          id="phone-patient-name"
          className="font-display text-heading-m text-foreground min-w-0 flex-1 leading-tight"
        >
          {bar.name}
        </h1>
        {status}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-body-s text-muted-foreground tabular-nums">
          {parts(bar.ageSex).join(" · ")}
          {" · "}
          <span className="text-foreground font-mono">{bar.mrn}</span>
        </span>
        {saved}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile
          label="Allergies"
          value={allergyValue || "Not recorded"}
          source={
            uncoded ? "Uncoded, not checked by prescribing" : (allergySource ?? "From the record")
          }
          tone={nkda ? "done" : uncoded || bar.allergy.tone === "caution" ? "caution" : "neutral"}
          icon={nkda ? <ShieldCheckIcon aria-hidden className="size-3.5 shrink-0" /> : undefined}
          onOpen={onContext}
        />
        <Tile
          label="Vital signs"
          value={vitals?.chip ?? "Not recorded"}
          source={
            k.vitalsAt
              ? `${k.vitalsFromTriage ? "Triage" : "Recorded"}, ${fmt.time(k.vitalsAt)}`
              : "Nothing recorded yet"
          }
          tone={alarm ? "caution" : "neutral"}
          icon={alarm ? <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" /> : undefined}
          onOpen={onContext}
        />
        <Tile
          label="Active problems"
          value={problem ?? "None recorded"}
          source={more > 0 ? `${more} more` : "From the record"}
          onOpen={onContext}
        />
        <Tile
          label="Critical results"
          value={bar.criticalText ?? "None"}
          source={bar.criticalText ? "Not yet acknowledged" : "From the record"}
          tone={bar.criticalText ? "caution" : "neutral"}
          onOpen={onContext}
        />
      </div>
    </section>
  );
}

/* ─── Step bar (§4.3) ───────────────────────────────────────────── */

type Statuses = Record<SectionId, SectionStatus> | null;

export function PhoneStepBar({
  at,
  statuses,
  badges,
  identity,
  onSteps,
  onNote,
}: {
  at: number;
  statuses: Statuses;
  badges: readonly Badge[];
  /** Name and MRN, once the patient header has scrolled away (Law 9). */
  identity: { name: string; mrn: string } | null;
  onSteps: () => void;
  onNote: () => void;
}) {
  const cur = SECTIONS[at]!;
  const status = statuses?.[cur.id];
  const urgent = badges.filter((b) => b.level === "urgent").length;
  return (
    <nav
      aria-label="Clerking steps"
      data-slot="phone-step-bar"
      className="bg-background/95 border-border sticky top-[50px] z-20 flex flex-col gap-1 border-b px-4 pt-1 pb-1.5 backdrop-blur sm:hidden"
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Step ${at + 1} of ${SECTIONS.length}, ${cur.title}${status ? `, ${status.text}` : ""}. Open all steps`}
          onClick={onSteps}
          className="focus-visible:shadow-focus flex min-w-0 flex-1 flex-col items-start rounded-sm text-left outline-none"
        >
          {/* Two identifiers stay on screen once the header has gone (Law 9): the MRN never
              truncates; a long name does. */}
          {identity ? (
            <span className="text-caption text-muted-foreground flex max-w-full min-w-0 items-baseline gap-1 leading-tight">
              <span className="min-w-0 truncate">{identity.name}</span>
              <span className="text-foreground shrink-0 font-mono">{identity.mrn}</span>
            </span>
          ) : null}
          <span className="text-body-s text-ink-700 font-mono leading-tight">
            {`Step ${at + 1} of ${SECTIONS.length}`}
          </span>
          <span className="text-heading-s text-foreground flex max-w-full items-center gap-1 leading-tight">
            <span className="min-w-0">{cur.title.length > 26 ? cur.short : cur.title}</span>
            <ChevronDownIcon aria-hidden className="text-muted-foreground size-4.5 shrink-0" />
          </span>
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Note and flags, ${badges.length} ${badges.length === 1 ? "flag" : "flags"}, ${urgent} urgent`}
          onClick={onNote}
          className={cn(
            "border-border bg-card text-body-m text-foreground focus-visible:shadow-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[11px] border pr-2 pl-3 font-medium outline-none",
            PRESS,
          )}
        >
          <FileTextIcon aria-hidden className="size-4" />
          Note
          <FlagCount badges={badges} />
        </button>
      </div>
      <div aria-hidden className="grid grid-cols-10 gap-[3px]">
        {SECTIONS.map((s, i) => {
          const tone = statuses?.[s.id]?.tone;
          return (
            <span
              key={s.id}
              className={cn(
                "h-[3px] rounded-full",
                i === at
                  ? "bg-iris-solid"
                  : tone === "done"
                    ? "bg-teal-500"
                    : tone === "required"
                      ? "bg-amber-500"
                      : "bg-border",
              )}
            />
          );
        })}
      </div>
    </nav>
  );
}

/* ─── Bottom bar (§4.12) ────────────────────────────────────────── */

/** Hidden while a text field has focus, so the keyboard never pushes it over the field (rule 7). */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const text = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLInputElement &&
        !["checkbox", "radio", "button", "submit"].includes(t.type));
    const on = (e: FocusEvent) => {
      if (!text(e.target)) return;
      setTyping(true);
      // Keep the field above the keyboard once the viewport has shrunk.
      const el = e.target as HTMLElement;
      window.setTimeout(() => el.scrollIntoView?.({ block: "center" }), 250);
    };
    const off = (e: FocusEvent) => text(e.target) && setTyping(false);
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
    };
  }, []);
  return typing;
}

export function PhoneBottomBar({
  prev,
  next,
  onGo,
  onReview,
}: {
  prev: (typeof SECTIONS)[number] | undefined;
  next: (typeof SECTIONS)[number] | undefined;
  onGo: (id: string) => void;
  /** The last step: "Review and sign" opens the Note sheet (D-CM-06). */
  onReview: () => void;
}) {
  const typing = useTyping();
  return (
    <nav
      aria-label="Step controls"
      data-slot="phone-bottom-bar"
      hidden={typing}
      className="bg-background border-border fixed inset-x-0 bottom-0 z-20 flex items-center gap-2.5 border-t px-3.5 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:hidden"
    >
      <button
        type="button"
        aria-label={prev ? `Previous: ${prev.short}` : "Previous"}
        disabled={!prev}
        onClick={() => prev && onGo(prev.id)}
        className={cn(
          "border-border bg-card text-foreground focus-visible:shadow-focus inline-flex size-12 shrink-0 items-center justify-center rounded-[14px] border outline-none disabled:opacity-40",
          PRESS,
        )}
      >
        <ChevronLeftIcon aria-hidden className="size-5" />
      </button>
      <Button
        onClick={() => (next ? onGo(next.id) : onReview())}
        className={cn("text-body-m h-12 flex-1 rounded-[14px] font-semibold", PRESS)}
      >
        {next ? (
          <>
            {`Next: ${next.short}`}
            <ChevronRightIcon aria-hidden className="size-4.5" />
          </>
        ) : (
          <>
            <CheckIcon aria-hidden className="size-4.5" />
            Review and sign
          </>
        )}
      </Button>
    </nav>
  );
}
