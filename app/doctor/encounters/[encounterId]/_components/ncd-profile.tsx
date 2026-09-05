"use client";

import type { Citation } from "@/lib/ncd/catalog/schema";
import type { ComplicationResult } from "@/lib/ncd/engine/assess";
import type { EvalState } from "@/lib/ncd/engine/evaluate";
import type { NcdProfile } from "@/lib/ncd/profile";
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  FlaskConicalIcon,
  MinusIcon,
  ShieldQuestionIcon,
} from "lucide-react";

/**
 * The assembled profile.
 *
 * ── What this surface refuses to do ──────────────────────────────────────────
 * It never renders a complication as absent because nobody looked. `EvalState`
 * arrives with four values and all four are shown distinctly — present, absent,
 * NOT ASSESSED, and CANNOT ASSESS HERE. Collapsing the last two into "missing"
 * would produce a task list a clinician cannot clear; collapsing either into
 * "absent" is how a screening tool hurts somebody.
 *
 * Completeness is therefore given the same visual weight as the findings: a
 * confident-looking profile built on three answered questions is exactly the
 * failure this design exists to prevent.
 *
 * ── Colour ───────────────────────────────────────────────────────────────────
 * Red appears ONLY for the acute interlock, which is a genuine emergency — the
 * one case the design system reserves it for. Amber carries test-validity
 * caveats. Teal carries established findings. Every colour is paired with a word;
 * none of it is load-bearing on its own.
 */

const OVERLINE = "font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground/80";
const CARD = "border-border bg-card rounded-xl border shadow-xs";

/* ── shared vocabulary for the four states ───────────────────────────────── */

const STATE_WORD: Record<EvalState, string> = {
  met: "Present",
  not_met: "Absent",
  insufficient: "Not assessed",
  unavailable: "Cannot assess here",
};

function StateBadge({ state, met = "Present" }: { state: EvalState; met?: string }) {
  const map: Record<EvalState, { cls: string; icon: React.ReactNode }> = {
    met: {
      cls: "bg-teal-50 text-teal-800 ring-teal-500/30 dark:bg-teal-950/40 dark:text-teal-200",
      icon: <CheckIcon className="size-3" aria-hidden />,
    },
    not_met: {
      cls: "bg-muted text-muted-foreground ring-border",
      icon: <MinusIcon className="size-3" aria-hidden />,
    },
    insufficient: {
      cls: "bg-muted/60 text-muted-foreground ring-border",
      icon: <CircleDashedIcon className="size-3" aria-hidden />,
    },
    unavailable: {
      cls: "bg-muted/40 text-muted-foreground/80 ring-border/70",
      icon: <CircleSlashIcon className="size-3" aria-hidden />,
    },
  };
  const v = map[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${v.cls}`}
    >
      {v.icon}
      {state === "met" ? met : STATE_WORD[state]}
    </span>
  );
}

function Source({ citation }: { citation?: Citation }) {
  if (!citation) return null;
  return (
    <span
      title={`${citation.title}${citation.url ? ` — ${citation.url}` : ""}`}
      className="border-border/60 bg-muted/50 text-muted-foreground ml-auto shrink-0 rounded border px-1 py-0.5 font-mono text-[8.5px] tracking-[0.03em]"
    >
      {citation.standard}
      {citation.needsCsoInput ? " ?" : ""}
    </span>
  );
}

/* ── the surface ─────────────────────────────────────────────────────────── */

export function NcdProfileView({ profile }: { profile: NcdProfile }) {
  const { acute, diagnosis, classification, complications, caveats, gaps, completeness } = profile;
  const chronic = complications.filter((c) => c.timing === "chronic");
  const outstanding = gaps.filter((g) => g.kind === "not_assessed");
  const unobtainable = gaps.filter((g) => g.kind === "unavailable");

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Emergencies interrupt. Never a row in a list. */}
      {acute.map((flag) => (
        <section
          key={flag.code}
          role="alert"
          className="scale-in overflow-hidden rounded-xl border border-red-500/40 bg-red-50 shadow-sm dark:bg-red-950/30"
        >
          <div className="flex items-start gap-2 px-3.5 py-3">
            <AlertTriangleIcon
              className="size-4 shrink-0 translate-y-0.5 text-red-600 dark:text-red-400"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="font-display text-[15px] font-medium tracking-[-0.01em] text-red-900 dark:text-red-100">
                  {flag.display}
                </h3>
                {flag.stage ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10.5px] font-medium text-red-800 dark:bg-red-900/50 dark:text-red-200">
                    {flag.stage.display}
                  </span>
                ) : null}
                <Source citation={flag.citation} />
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-red-900/90 dark:text-red-100/85">
                {flag.action}
              </p>
              <p className="mt-1 font-mono text-[10.5px] text-red-700/80 dark:text-red-300/75">
                {flag.via.label}
              </p>
            </div>
          </div>
        </section>
      ))}

      {/* 2. Header — completeness given the same weight as the findings. */}
      <section className={`${CARD} px-3.5 py-3`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={OVERLINE}>Profile</span>
          {profile.standardApplied ? (
            <span className="text-muted-foreground text-[11px]">
              applied{" "}
              <span className="text-foreground font-medium">{profile.standardApplied.body}</span>{" "}
              {profile.standardApplied.version}
            </span>
          ) : null}
          <span className="text-muted-foreground ml-auto text-[11px]">{profile.site.display}</span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="font-display text-foreground text-[26px] leading-none font-medium tabular-nums">
            {completeness.percent}%
          </span>
          <span className="text-muted-foreground text-[11.5px]">of what this site can assess</span>
        </div>
        <div className="bg-border/40 mt-2 h-1 w-full overflow-hidden rounded-full" aria-hidden>
          <div
            className="ease-expo-out h-1 rounded-full bg-teal-500 transition-[width] duration-250"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
        <p className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-2.5 text-[11px] tabular-nums">
          <span>
            <span className="text-foreground font-medium">{completeness.recorded}</span> recorded
          </span>
          <span>· {completeness.outstanding} outstanding</span>
          <span>· {completeness.unavailable} unavailable here</span>
        </p>

        {profile.gatedDark ? (
          <p className="text-muted-foreground border-border/60 mt-2.5 flex items-center gap-1.5 border-t pt-2 text-[10.5px]">
            <ShieldQuestionIcon className="size-3 shrink-0" aria-hidden />
            Criteria are not yet CSO-ratified — decision support is gated, not clinical advice.
          </p>
        ) : null}
      </section>

      {/* 3. Diagnosis */}
      <section className={`${CARD} overflow-hidden`}>
        <header className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2">
          <span className={OVERLINE}>Diagnosis</span>
          <Source citation={diagnosis.citation} />
        </header>
        <div className="px-3.5 py-3">
          <DiagnosisHeadline profile={profile} />

          {diagnosis.pendingConfirmation.length ? (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-900 ring-1 ring-amber-300/40 ring-inset dark:bg-amber-950/25 dark:text-amber-100">
              One abnormal result so far. The guideline asks for a second before this is a
              diagnosis.
            </p>
          ) : null}

          {diagnosis.suppressed.length ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {diagnosis.suppressed.map((c) => (
                <p
                  key={c.id}
                  className="rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] leading-snug text-amber-900 ring-1 ring-amber-300/40 ring-inset dark:bg-amber-950/25 dark:text-amber-100"
                >
                  {c.label}
                  {c.alternative ? (
                    <span className="mt-0.5 block text-amber-800/85 dark:text-amber-200/80">
                      {c.alternative}
                    </span>
                  ) : null}
                </p>
              ))}
            </div>
          ) : null}

          {diagnosis.criteria.length ? (
            <ul className="divide-border/50 mt-2.5 flex flex-col divide-y">
              {diagnosis.criteria.map((c) => (
                <li key={c.id} className="flex items-start gap-2 py-1.5">
                  <span className="mt-0.5">
                    <StateBadge state={c.state} met="Met" />
                  </span>
                  <span className="text-foreground/85 min-w-0 flex-1 text-[11.5px] leading-snug">
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* 4. Classification */}
      <section className={`${CARD} px-3.5 py-3`}>
        <div className="flex items-center gap-2">
          <span className={OVERLINE}>Type</span>
          <Source citation={classification.citation} />
        </div>
        <p className="text-foreground mt-1.5 text-[15px] font-medium">{classification.display}</p>
        <p className="text-muted-foreground mt-0.5 text-[11.5px] leading-snug">
          {classification.reason}
        </p>
        {classification.discriminators.length ? (
          <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px]">
            <FlaskConicalIcon className="size-3" aria-hidden />
            Would settle it:
            {classification.discriminators.map((d) => (
              <span key={d.feature} className="inline-flex items-center gap-1">
                <span className="font-mono">{d.feature}</span>
                <StateBadge state={d.state} />
              </span>
            ))}
          </p>
        ) : null}
      </section>

      {/* 5. Test-validity caveats */}
      {caveats.length ? (
        <section className="bg-card overflow-hidden rounded-xl border border-amber-300/60 dark:border-amber-800/60">
          <header className="flex items-center gap-2 border-b border-amber-300/40 bg-amber-50/60 px-3.5 py-2 dark:border-amber-800/40 dark:bg-amber-950/25">
            <AlertTriangleIcon
              className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <span className="text-foreground text-[11px] font-medium tracking-[0.04em]">
              Results that cannot be taken at face value
            </span>
          </header>
          <ul className="divide-border/50 divide-y">
            {caveats.map((c) => (
              <li key={c.id} className="px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <DirectionTag direction={c.direction} />
                  <span className="text-muted-foreground font-mono text-[10px]">{c.feature}</span>
                  <Source citation={c.citation} />
                </div>
                <p className="text-foreground/85 mt-1 text-[11.5px] leading-snug">{c.label}</p>
                {c.alternative ? (
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{c.alternative}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 6. Complications */}
      <section className={`${CARD} overflow-hidden`}>
        <header className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2">
          <span className={OVERLINE}>Complications</span>
        </header>
        <ul className="divide-border/50 divide-y">
          {chronic.map((c) => (
            <ComplicationRow key={c.code} c={c} />
          ))}
        </ul>
      </section>

      {/* 7. Gaps — the two kinds never mixed. */}
      {outstanding.length || unobtainable.length ? (
        <section className={`${CARD} overflow-hidden`}>
          {outstanding.length ? (
            <>
              <header className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2">
                <span className={OVERLINE}>To complete the profile</span>
                <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
                  {outstanding.length}
                </span>
              </header>
              <ul className="divide-border/50 divide-y">
                {outstanding.map((g) => (
                  <li key={g.feature} className="flex items-center gap-2 px-3.5 py-1.5">
                    <CircleDashedIcon
                      className="text-muted-foreground size-3 shrink-0"
                      aria-hidden
                    />
                    <span className="text-foreground/85 min-w-0 flex-1 truncate text-[12px]">
                      {g.display}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10.5px]">{g.blocks}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {unobtainable.length ? (
            <>
              <header className="border-border/60 bg-muted/20 flex items-center gap-2 border-y px-3.5 py-2">
                <span className={OVERLINE}>Not available at this site</span>
                <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
                  {unobtainable.length}
                </span>
              </header>
              <ul className="divide-border/50 divide-y">
                {unobtainable.map((g) => (
                  <li key={g.feature} className="flex items-center gap-2 px-3.5 py-1.5">
                    <CircleSlashIcon
                      className="text-muted-foreground/70 size-3 shrink-0"
                      aria-hidden
                    />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
                      {g.display}
                    </span>
                    {g.capability ? (
                      <span className="text-muted-foreground/70 shrink-0 font-mono text-[9.5px]">
                        {g.capability}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground px-3.5 py-1.5 text-[10.5px]">
                These are referrals, not outstanding tasks — they are excluded from the completeness
                figure.
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function DiagnosisHeadline({ profile }: { profile: NcdProfile }) {
  const { diagnosis } = profile;
  const word =
    diagnosis.state === "established"
      ? "Established"
      : diagnosis.state === "criteria_met"
        ? "Criteria met"
        : diagnosis.state === "not_met"
          ? "Criteria not met"
          : diagnosis.state === "unavailable"
            ? "Cannot be established here"
            : "Not yet established";
  const strong = diagnosis.state === "established" || diagnosis.state === "criteria_met";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span
        className={`font-display text-[19px] leading-tight font-medium tracking-[-0.015em] ${
          strong ? "text-teal-800 dark:text-teal-200" : "text-foreground"
        }`}
      >
        {word}
      </span>
      {diagnosis.state === "insufficient" && diagnosis.missing.length ? (
        <span className="text-muted-foreground text-[11.5px]">
          {diagnosis.missing.length} item{diagnosis.missing.length === 1 ? "" : "s"} would settle it
        </span>
      ) : null}
    </div>
  );
}

function DirectionTag({ direction }: { direction: "masks" | "manufactures" | "unpredictable" }) {
  const label =
    direction === "masks"
      ? "May hide disease"
      : direction === "manufactures"
        ? "May invent disease"
        : "Direction unknown";
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
      {label}
    </span>
  );
}

function ComplicationRow({ c }: { c: ComplicationResult }) {
  const staged = c.stages.find((s) => s.stage);
  return (
    <li className="px-3.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StateBadge state={c.state} />
        <span className="text-foreground min-w-0 flex-1 text-[12.5px]">{c.display}</span>
        {staged?.stage ? (
          <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[10.5px] font-medium text-teal-800 ring-1 ring-teal-500/25 ring-inset dark:bg-teal-950/40 dark:text-teal-200">
            {staged.stage.code}
          </span>
        ) : null}
        <Source citation={c.citation} />
      </div>

      {staged?.stage ? (
        <p className="text-muted-foreground mt-0.5 pl-1 text-[11px]">{staged.stage.display}</p>
      ) : null}

      {c.screeningIntervalMonths ? (
        <p className="text-muted-foreground mt-0.5 pl-1 text-[10.5px]">
          Guideline screening interval: {c.screeningIntervalMonths} month
          {c.screeningIntervalMonths === 1 ? "" : "s"}
        </p>
      ) : null}

      {c.unscreened.length ? (
        <p className="text-muted-foreground mt-0.5 pl-1 text-[10.5px]">
          {c.unscreened.filter((u) => u.state === "insufficient").length} unscreened
          {c.unscreened.some((u) => u.state === "unavailable")
            ? ` · ${c.unscreened.filter((u) => u.state === "unavailable").length} unavailable here`
            : ""}
        </p>
      ) : null}
    </li>
  );
}
