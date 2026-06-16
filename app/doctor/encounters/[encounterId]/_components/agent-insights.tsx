/**
 * Clerkship-agent in-form surfaces (display-only). Decision-support: every claim
 * carries a cited source tag; nothing is auto-recorded. Uses the medsync
 * semantic tokens (full-contrast text-foreground for content, muted only for
 * provenance) so it reads in light + dark. No left-edge accent bars — state is
 * border + bg + ring + glyph. See docs/design/clerkship-agent-gate-a.md.
 */
import type { ClerkArea, Insight } from "@/lib/clerkship/agent";
import { AlertTriangleIcon, CircleAlertIcon, SparklesIcon } from "lucide-react";

const PACK_LABEL: Record<string, string> = {
  "enriched-reasoning-maps": "maps",
  "vitals-escalation": "vitals",
  "sign-dependencies": "dependencies",
  "sign-incompatibilities": "incompatibilities",
};

function SrcTag({ insight }: { insight: Insight }) {
  return (
    <span
      className="border-border/60 bg-muted/50 text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.04em]"
      title={insight.sourceRef.citation}
    >
      {PACK_LABEL[insight.sourceRef.pack] ?? insight.sourceRef.pack}
    </span>
  );
}

/** Must-not-miss / emergency strip — reserved clinical-red. Renders nothing when clear. */
export function AgentSafetyStrip({ insights }: { insights: Insight[] }) {
  const red = insights.filter((i) => i.severity === "red");
  if (!red.length) return null;
  return (
    <div className="scale-in mb-3 flex flex-col gap-1.5" role="alert">
      {red.map((i) => (
        <div
          key={i.id}
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 ring-1 ring-red-500/30 ring-inset dark:bg-red-950/40"
        >
          <AlertTriangleIcon
            className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-red-900 dark:text-red-100">
              {i.suggests?.dx ?? i.message}
            </p>
            {i.suggests?.dx ? (
              <p className="text-[11.5px] leading-snug text-red-800/90 dark:text-red-200/90">
                {i.message}
              </p>
            ) : null}
            {i.evidence.length ? (
              <p className="mt-0.5 text-[10.5px] text-red-700/80 dark:text-red-300/80">
                {i.evidence.map((e) => e.label).join(" · ")}
              </p>
            ) : null}
          </div>
          <SrcTag insight={i} />
        </div>
      ))}
    </div>
  );
}

/** Inline forward-prediction nudges (ask-about / look-for) under the complaint. */
export function AgentNudges({ insights }: { insights: Insight[] }) {
  const nudges = insights.filter((i) => i.kind === "association" || i.kind === "expected-sign");
  if (!nudges.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {nudges.map((i) => (
        <div
          key={i.id}
          className="fade-in-slow flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20"
        >
          <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[10px] font-semibold tracking-[0.08em] text-teal-700 uppercase dark:text-teal-400">
            <SparklesIcon className="size-3" aria-hidden />
            {i.kind === "association" ? "Ask about" : "Look for"}
          </span>
          <span className="flex flex-1 flex-wrap gap-1.5">
            {(i.expects ?? []).map((e, k) => (
              <span
                key={k}
                className="rounded-md border border-dashed border-teal-400/50 px-1.5 py-0.5 text-[11.5px] text-teal-800 dark:border-teal-700/50 dark:text-teal-200"
                title={e.why}
              >
                {e.label}
              </span>
            ))}
          </span>
          <SrcTag insight={i} />
        </div>
      ))}
    </div>
  );
}

/** must-check (amber prompts) + incompatible (muted, overridable) for one exam system. */
export function AgentExamNotes({ insights, area }: { insights: Insight[]; area: ClerkArea }) {
  const notes = insights.filter(
    (i) => (i.kind === "must-check" || i.kind === "incompatible") && i.target.area === area,
  );
  if (!notes.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {notes.map((i) =>
        i.kind === "must-check" ? (
          <div
            key={i.id}
            className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-300/60 ring-inset dark:bg-amber-950/30"
          >
            <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[10px] font-semibold tracking-[0.08em] text-amber-700 uppercase dark:text-amber-400">
              <CircleAlertIcon className="size-3" aria-hidden />
              Also characterise
            </span>
            <span className="flex flex-1 flex-wrap gap-1.5">
              {(i.expects ?? []).map((e, k) => (
                <span
                  key={k}
                  className="rounded-md border border-dashed border-amber-400/60 px-1.5 py-0.5 text-[11.5px] text-amber-800 dark:border-amber-700/50 dark:text-amber-200"
                  title={e.why}
                >
                  {e.label}
                </span>
              ))}
            </span>
            <SrcTag insight={i} />
          </div>
        ) : (
          <p key={i.id} className="text-muted-foreground px-1 text-[11px]">
            <span className="text-foreground/80">Unlikely here:</span> {i.message} ·{" "}
            <span className="italic">still tappable</span>
          </p>
        ),
      )}
    </div>
  );
}
