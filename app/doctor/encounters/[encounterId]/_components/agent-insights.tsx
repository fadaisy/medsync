/**
 * Clerkship-agent right rail (display-only). A lean, sticky panel that
 * consolidates every agent surface — emergencies, vitals-in-context, forward
 * prediction, exam must-checks, and a pointer to the Assessment suggestions.
 * Each item is headline + evidence; the full differential/action sits behind a
 * native <details> tap so nothing shouts. Decision-support: every claim carries
 * a cited source tag; nothing is auto-recorded. medsync semantic tokens
 * (full-contrast text-foreground; muted only for provenance); no left-edge
 * accents — state is bg + ring + glyph. See docs/design/clerkship-agent-gate-a.md.
 */
import type { Insight } from "@/lib/clerkship/agent";
import { ActivityIcon, AlertTriangleIcon, SparklesIcon, StethoscopeIcon } from "lucide-react";

const PACK_LABEL: Record<string, string> = {
  "enriched-reasoning-maps": "maps",
  "vitals-escalation": "vitals",
  "sign-dependencies": "deps",
  "sign-incompatibilities": "incompat",
};

function SrcTag({ insight }: { insight: Insight }) {
  return (
    <span
      className="border-border/60 bg-muted/50 text-muted-foreground ml-auto shrink-0 rounded border px-1 py-0.5 font-mono text-[8.5px] tracking-[0.03em]"
      title={insight.sourceRef.citation}
    >
      {PACK_LABEL[insight.sourceRef.pack] ?? insight.sourceRef.pack}
    </span>
  );
}

function RailSection({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "red" | "amber" | "teal" | "muted";
  children: React.ReactNode;
}) {
  const labelTone =
    tone === "red"
      ? "text-red-700 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "teal"
          ? "text-teal-700 dark:text-teal-400"
          : "text-muted-foreground";
  return (
    <div className="border-border/50 border-b px-3 py-2 last:border-b-0">
      <p className={`mb-1 text-[9px] font-semibold tracking-[0.07em] uppercase ${labelTone}`}>
        {label}
      </p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/** A flag with an expandable differential/action (vital-flag or combination). */
function FlagItem({ insight, red }: { insight: Insight; red: boolean }) {
  const headTone = red ? "text-red-900 dark:text-red-100" : "text-amber-900 dark:text-amber-100";
  const evidence = insight.evidence
    .filter((e) => e.from !== "vitals")
    .map((e) => e.label)
    .join(" · ");
  return (
    <div
      className={`rounded-md px-2 py-1.5 ring-1 ring-inset ${
        red
          ? "bg-red-50 ring-red-500/25 dark:bg-red-950/30"
          : "bg-amber-50 ring-amber-300/50 dark:bg-amber-950/25"
      }`}
    >
      <div className="flex items-baseline gap-1.5">
        {red ? (
          <AlertTriangleIcon
            className="size-3 shrink-0 translate-y-0.5 text-red-600 dark:text-red-400"
            aria-hidden
          />
        ) : (
          <ActivityIcon
            className="size-3 shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
        )}
        <span className={`text-[12px] leading-tight font-semibold ${headTone}`}>
          {insight.message}
        </span>
        <SrcTag insight={insight} />
      </div>
      {evidence ? (
        <p
          className={`mt-0.5 pl-5 text-[10.5px] ${
            red
              ? "text-red-700/85 dark:text-red-300/85"
              : "text-amber-700/85 dark:text-amber-300/85"
          }`}
        >
          {evidence}
        </p>
      ) : null}
      {insight.detail ? (
        <details className="group mt-0.5 pl-5">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-[10px] select-none">
            differential + action ›
          </summary>
          <p className="text-muted-foreground mt-1 text-[10.5px] leading-snug">{insight.detail}</p>
        </details>
      ) : null}
    </div>
  );
}

/**
 * The consolidated agent rail. Renders nothing when there's nothing to say
 * (agent off / empty clerkship). Place it as a sticky right-hand column.
 */
export function AgentRail({ insights }: { insights: Insight[] }) {
  const emergencies = insights.filter(
    (i) => i.severity === "red" && (i.kind === "vital-flag" || i.kind === "combination"),
  );
  const vitals = insights.filter((i) => i.kind === "vital-flag" && i.severity !== "red");
  const asks = insights.filter((i) => i.kind === "association");
  const looks = insights.filter((i) => i.kind === "expected-sign");
  const toCheck = insights.filter((i) => i.kind === "must-check" || i.kind === "incompatible");
  const dx = insights.filter((i) => i.kind === "diagnosis");
  const leading = dx.find((i) => i.tier === "leading");
  const mnmCount = dx.filter((i) => i.suggests?.mustNotMiss).length;
  const dxCount = dx.length;

  if (
    !emergencies.length &&
    !vitals.length &&
    !asks.length &&
    !looks.length &&
    !toCheck.length &&
    !dxCount
  ) {
    return null;
  }

  const flatExpects = (items: Insight[]) =>
    Array.from(new Set(items.flatMap((i) => (i.expects ?? []).map((e) => e.label)))).join(", ");

  return (
    <div className="border-border bg-card scale-in overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border/60 text-foreground flex items-center gap-1.5 border-b px-3 py-2">
        <StethoscopeIcon className="size-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
        <span className="text-[11px] font-semibold tracking-[0.04em]">Clerkship agent</span>
        <span
          aria-hidden
          className="pulse-dot ml-auto size-1.5 rounded-full bg-teal-500"
          title="Live decision-support"
        />
      </div>

      {emergencies.length ? (
        <RailSection label="Emergency" tone="red">
          {emergencies.map((i) => (
            <FlagItem key={i.id} insight={i} red />
          ))}
        </RailSection>
      ) : null}

      {vitals.length ? (
        <RailSection label="Vitals" tone="amber">
          {vitals.map((i) => (
            <FlagItem key={i.id} insight={i} red={false} />
          ))}
        </RailSection>
      ) : null}

      {asks.length || looks.length ? (
        <RailSection label="Predicted" tone="teal">
          {asks.length ? (
            <p className="flex flex-wrap gap-x-1 text-[11.5px]">
              <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                <SparklesIcon className="size-3" aria-hidden />
                Ask
              </span>
              <span className="text-foreground/80">{flatExpects(asks)}</span>
            </p>
          ) : null}
          {looks.length ? (
            <p className="flex flex-wrap gap-x-1 text-[11.5px]">
              <span className="font-semibold text-teal-700 dark:text-teal-400">Look</span>
              <span className="text-foreground/80">{flatExpects(looks)}</span>
            </p>
          ) : null}
        </RailSection>
      ) : null}

      {toCheck.length ? (
        <RailSection label="To check · exam" tone="amber">
          {toCheck.map((i) =>
            i.kind === "must-check" ? (
              <p key={i.id} className="text-[11.5px]">
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {i.target.field ?? "Characterise"}
                </span>{" "}
                <span className="text-foreground/80">
                  {(i.expects ?? []).map((e) => e.label).join(", ")}
                </span>
              </p>
            ) : (
              <p key={i.id} className="text-muted-foreground text-[11px]">
                Unlikely: {i.message}
              </p>
            ),
          )}
        </RailSection>
      ) : null}

      {dxCount ? (
        <RailSection label="Assessment" tone="muted">
          {leading ? (
            <p className="text-[11.5px]">
              <span className="font-semibold text-teal-700 dark:text-teal-400">Leading: </span>
              <span className="text-foreground/80">{leading.suggests?.dx}</span>
            </p>
          ) : null}
          <p className="text-muted-foreground text-[11px]">
            {dxCount} in differential{mnmCount ? ` · ${mnmCount} must-not-miss` : ""} —{" "}
            <span className="text-teal-700 dark:text-teal-400">see the Assessment tab</span>
          </p>
        </RailSection>
      ) : null}
    </div>
  );
}
