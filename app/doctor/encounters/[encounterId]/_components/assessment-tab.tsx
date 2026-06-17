/**
 * Assessment tab — the convergence. The agent proposes diagnoses from everything
 * captured across the clerkship; the CLINICIAN decides + commits. Decision-support,
 * never autonomous: suggestions carry cited sources, the one-liner is never
 * auto-set, and "considered & excluded" diagnoses stay on the record (must-not-miss
 * never silently dropped). Three sections: clinical picture · suggested diagnoses
 * (must-not-miss floated) · working diagnoses. See clerkship-agent-gate-a.md.
 */
import type { Insight, ProvenanceFrom } from "@/lib/clerkship/agent";
import type { ClerkDifferential } from "@/lib/encounter/clerkship";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";

import { Label } from "@/components/ui/label";

const PROV_ORDER: ProvenanceFrom[] = ["vitals", "hpc", "ros", "exam", "background"];

const norm = (s: string) => s.trim().toLowerCase();

function PackTag({ insight }: { insight: Insight }) {
  return (
    <span
      className="border-border/60 bg-muted/50 text-muted-foreground ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.04em]"
      title={insight.sourceRef.citation}
    >
      {insight.sourceRef.pack === "enriched-reasoning-maps" ? "maps" : insight.sourceRef.pack}
    </span>
  );
}

export function AssessmentTab({
  insights,
  differential,
  onDifferentialChange,
  summary,
  onSummaryChange,
  demographics,
}: {
  insights: Insight[];
  differential: ClerkDifferential[];
  onDifferentialChange: (d: ClerkDifferential[]) => void;
  summary: string;
  onSummaryChange: (s: string) => void;
  demographics?: { ageYears: number | null; sex: string | null };
}) {
  const diagnoses = insights.filter((i) => i.kind === "diagnosis");
  const committed = new Set(differential.map((d) => norm(d.text)));

  // Section 1 — assembled clinical picture (distinct evidence the agent matched).
  const seen = new Set<string>();
  const picture: { label: string; from: ProvenanceFrom }[] = [];
  for (const i of insights) {
    if (i.kind !== "diagnosis" && i.kind !== "vital-flag" && i.kind !== "combination") continue;
    for (const e of i.evidence) {
      const k = norm(e.label);
      if (seen.has(k)) continue;
      seen.add(k);
      picture.push({ label: e.label, from: e.from });
    }
  }
  picture.sort((a, b) => PROV_ORDER.indexOf(a.from) - PROV_ORDER.indexOf(b.from));

  function addWorking(i: Insight) {
    if (!i.suggests) return;
    if (committed.has(norm(i.suggests.dx))) return;
    onDifferentialChange([
      ...differential.filter((d) => norm(d.text) !== norm(i.suggests!.dx)),
      {
        text: i.suggests.dx,
        icd10: i.suggests.icd10,
        mustNotMiss: i.suggests.mustNotMiss,
        status: "working",
      },
    ]);
  }
  function exclude(i: Insight) {
    if (!i.suggests) return;
    onDifferentialChange([
      ...differential.filter((d) => norm(d.text) !== norm(i.suggests!.dx)),
      { text: i.suggests.dx, mustNotMiss: i.suggests.mustNotMiss, status: "excluded" },
    ]);
  }
  function remove(text: string) {
    onDifferentialChange(differential.filter((d) => norm(d.text) !== norm(text)));
  }

  const working = differential.filter((d) => d.status !== "excluded");
  const excluded = differential.filter((d) => d.status === "excluded");
  const suggestions = diagnoses.filter((i) => i.suggests && !committed.has(norm(i.suggests.dx)));

  // Ranked mode: insights carry a tier. Group for display; must-not-miss is pinned
  // separately unless it is already Leading. Flat mode (no tier) → single list.
  const ranked = suggestions.some((i) => i.tier);
  const leadIds = new Set(suggestions.filter((i) => i.tier === "leading").map((i) => i.id));
  const tierItems = (t: string) => suggestions.filter((i) => i.tier === t);
  const pinned = suggestions.filter((i) => i.suggests?.mustNotMiss && !leadIds.has(i.id));

  return (
    <div className="flex flex-col gap-5">
      {/* Section 1 — clinical picture */}
      <section className="border-border bg-card rounded-xl border p-4">
        <SectionHead n={1} label="Clinical picture — assembled, vitals-up" />
        {demographics && (demographics.ageYears != null || demographics.sex) ? (
          <p className="text-muted-foreground mt-1 text-[10.5px]">
            Priors shaped by: {demographics.sex ?? "sex —"}
            {demographics.ageYears != null ? ` · ${demographics.ageYears}y` : ""}
          </p>
        ) : null}
        {picture.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picture.map((p, k) => (
              <span
                key={k}
                className="bg-muted/50 text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px]"
              >
                {p.label}
                <span className="text-muted-foreground text-[9px] tracking-[0.06em] uppercase">
                  {p.from}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-2 text-[12px]">
            No abnormal findings assembled yet — capture history, vitals and exam and the picture
            builds here.
          </p>
        )}
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-[11.5px]">Summary / one-liner</Label>
            {!summary && picture.length ? (
              <button
                type="button"
                onClick={() => onSummaryChange(picture.map((p) => p.label).join(", "))}
                className="tap text-muted-foreground hover:text-foreground text-[10.5px] underline-offset-2 hover:underline"
              >
                insert assembled
              </button>
            ) : null}
          </div>
          <textarea
            value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            rows={2}
            placeholder="e.g. 54M, known diabetic, severe hypertension with headache + visual change…"
            className="border-border bg-background text-foreground focus-visible:ring-ring/50 w-full resize-y rounded-lg border px-3 py-2 text-[12.5px] outline-none focus-visible:ring-2"
          />
          <p className="text-muted-foreground text-[10.5px]">Never auto-set — your words.</p>
        </div>
      </section>

      {/* Section 2 — suggested diagnoses */}
      <section className="border-border bg-card rounded-xl border p-4">
        <SectionHead n={2} label="Suggested diagnoses — must-not-miss floated" />
        {suggestions.length ? (
          ranked ? (
            <div className="mt-2 flex flex-col gap-3">
              <DxTierGroup
                label="Leading"
                tone="teal"
                items={tierItems("leading")}
                onAdd={addWorking}
                onExclude={exclude}
              />
              <DxTierGroup
                label="Worth considering"
                tone="sky"
                items={tierItems("consider")}
                onAdd={addWorking}
                onExclude={exclude}
              />
              <DxTierGroup
                label="Less likely"
                tone="muted"
                items={tierItems("less_likely")}
                onAdd={addWorking}
                onExclude={exclude}
              />
              {pinned.length ? (
                <DxTierGroup
                  label="Must-not-miss — keep excluding"
                  tone="red"
                  items={pinned}
                  onAdd={addWorking}
                  onExclude={exclude}
                />
              ) : null}
              {tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss).length ? (
                <details className="group">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-[11px] select-none">
                    Ruled down (
                    {tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss).length}) ›
                  </summary>
                  <div className="mt-2">
                    <DxTierGroup
                      label=""
                      tone="muted"
                      items={tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss)}
                      onAdd={addWorking}
                      onExclude={exclude}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {suggestions.map((i) => (
                <DxCard key={i.id} i={i} onAdd={addWorking} onExclude={exclude} />
              ))}
            </div>
          )
        ) : (
          <p className="text-muted-foreground mt-2 text-[12px]">
            {diagnoses.length
              ? "All current suggestions are committed below."
              : "Suggestions appear here as the clerkship is captured (decision-support, never autonomous)."}
          </p>
        )}
      </section>

      {/* Section 3 — working diagnoses */}
      <section className="border-border bg-card rounded-xl border p-4">
        <SectionHead n={3} label="Working diagnoses — committed → record" />
        {working.length ? (
          <ul className="divide-border/60 mt-2 divide-y">
            {working.map((d) => (
              <li key={norm(d.text)} className="flex items-center gap-2 py-2">
                {d.mustNotMiss ? (
                  <span
                    className="size-2 shrink-0 rounded-full bg-red-600 dark:bg-red-400"
                    aria-hidden
                  />
                ) : (
                  <CheckIcon
                    className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400"
                    aria-hidden
                  />
                )}
                <span className="text-foreground text-[13px]">{d.text}</span>
                {d.icd10 ? (
                  <span className="text-muted-foreground font-mono text-[11px]">{d.icd10}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(d.text)}
                  className="tap text-muted-foreground hover:text-foreground ml-auto"
                  aria-label={`Remove ${d.text}`}
                >
                  <XIcon className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-[12px]">
            None committed yet — select a suggestion above, or it stays a suggestion only.
          </p>
        )}
        {excluded.length ? (
          <div className="border-border/60 mt-3 border-t pt-2">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
              Considered &amp; excluded
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {excluded.map((d) => (
                <span
                  key={norm(d.text)}
                  className="text-muted-foreground bg-muted/40 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] line-through"
                >
                  {d.text}
                  <button
                    type="button"
                    onClick={() => remove(d.text)}
                    className="tap hover:text-foreground no-underline"
                    aria-label={`Restore ${d.text}`}
                  >
                    <XIcon className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SectionHead({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-teal-600 text-[9px] font-semibold text-white">
        {n}
      </span>
      <span className="text-[10px] font-semibold tracking-[0.07em] text-teal-700 uppercase dark:text-teal-400">
        {label}
      </span>
    </div>
  );
}

function ChipRow({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "teal" | "amber";
  items: string[];
}) {
  const cls =
    tone === "teal"
      ? "border border-teal-300/70 bg-teal-50 text-teal-800 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-200"
      : "border border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200";
  return (
    <div className="mt-1.5">
      <p className="text-muted-foreground text-[9.5px] font-semibold tracking-[0.05em] uppercase">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((t, k) => (
          <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] ${cls}`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

const TIER_TONE: Record<string, string> = {
  teal: "text-teal-700 dark:text-teal-400",
  sky: "text-sky-700 dark:text-sky-400",
  red: "text-red-700 dark:text-red-400",
  muted: "text-muted-foreground",
};

function DxTierGroup({
  label,
  tone,
  items,
  onAdd,
  onExclude,
}: {
  label: string;
  tone: "teal" | "sky" | "red" | "muted";
  items: Insight[];
  onAdd: (i: Insight) => void;
  onExclude: (i: Insight) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <p className={`text-[9.5px] font-semibold tracking-[0.06em] uppercase ${TIER_TONE[tone]}`}>
          {label} <span className="text-muted-foreground">({items.length})</span>
        </p>
      ) : null}
      {items.map((i) => (
        <DxCard key={i.id} i={i} onAdd={onAdd} onExclude={onExclude} />
      ))}
    </div>
  );
}

/** Non-numeric strength cue (0–4 filled) from the score, clamped. Optional. */
function Strength({ score }: { score?: number }) {
  const n = Math.max(0, Math.min(4, Math.round(score ?? 0)));
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-0.5"
      aria-hidden
      title="relative strength of fit"
    >
      {Array.from({ length: 4 }, (_, k) => (
        <span key={k} className={`h-1.5 w-3 rounded-sm ${k < n ? "bg-teal-500" : "bg-muted"}`} />
      ))}
    </span>
  );
}

function DxCard({
  i,
  onAdd,
  onExclude,
}: {
  i: Insight;
  onAdd: (i: Insight) => void;
  onExclude: (i: Insight) => void;
}) {
  return (
    <article
      className={`rounded-lg border p-3 ${i.suggests?.mustNotMiss ? "border-red-300/70 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "border-border bg-muted/20"}`}
    >
      <div className="flex items-center gap-2">
        {i.suggests?.mustNotMiss ? (
          <span
            className="size-2 shrink-0 rounded-full bg-red-600 dark:bg-red-400"
            aria-hidden
            title="Must not miss"
          />
        ) : null}
        <span className="text-foreground text-[14px] font-medium">{i.suggests?.dx}</span>
        {i.suggests?.icd10 ? (
          <span className="text-muted-foreground font-mono text-[11.5px]">{i.suggests.icd10}</span>
        ) : null}
        <Strength score={i.score} />
        <PackTag insight={i} />
      </div>
      {i.evidence.length ? (
        <ChipRow label="Why" tone="teal" items={i.evidence.map((e) => e.label)} />
      ) : (
        <p className="text-muted-foreground mt-1.5 text-[11px] italic">
          Must-not-miss — surfaced for safety even without supporting features yet.
        </p>
      )}
      {i.discriminators?.length ? (
        <ChipRow
          label="To discriminate — check next"
          tone="amber"
          items={i.discriminators.map((d) => d.label)}
        />
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => onAdd(i)}
          className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-teal-700"
        >
          <PlusIcon className="size-3.5" aria-hidden />
          Working dx
        </button>
        <button
          type="button"
          onClick={() => onExclude(i)}
          className="tap border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px]"
        >
          Considered &amp; excluded
        </button>
      </div>
    </article>
  );
}
