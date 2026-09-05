import type { EncounterOrderRow } from "@/lib/encounter/orders";
import { FlaskConicalIcon } from "lucide-react";

/**
 * Investigations & results (W4) — read-only visibility of what's ordered and
 * what's back, on the encounter. Honest states: ordered/collected = awaiting,
 * resulted = the value shows (abnormal flagged; clinical-red reserved for a
 * critical/panic flag only), cancelled = struck. Results land via the later
 * results-entry seam; until then this is the "pending investigations" view.
 */

const KIND_LABEL: Record<string, string> = {
  bloods: "Bloods",
  imaging: "Imaging",
  bedside: "Bedside",
  special: "Special",
  other: "Other",
};

function isCritical(flag: string | null): boolean {
  if (!flag) return false;
  return /crit|panic|^hh$|^ll$/i.test(flag);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function InvestigationsPanel({ orders }: { orders: EncounterOrderRow[] }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-xs">
      <h2 className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase">
        <FlaskConicalIcon className="size-3.5" aria-hidden />
        Investigations &amp; results
        {orders.length ? (
          <span className="text-foreground/70 tabular-nums">· {orders.length}</span>
        ) : null}
      </h2>

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px]">
          No investigations ordered yet — they appear here once a plan is recorded, with results as
          they come back.
        </p>
      ) : (
        <ul className="divide-border/60 -mx-2 divide-y">
          {orders.map((o) => {
            const resulted = o.status === "resulted" && o.result;
            const cancelled = o.status === "cancelled";
            const abnormal = !!o.result?.abnormalFlag;
            const critical = isCritical(o.result?.abnormalFlag ?? null);
            return (
              <li key={o.id} className="flex items-start justify-between gap-3 px-2 py-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] font-medium uppercase">
                      {KIND_LABEL[o.kind] ?? o.kind}
                    </span>
                    <span
                      className={`text-[12.5px] ${cancelled ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {o.text}
                    </span>
                    {o.loincCode ? (
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {o.loincCode}
                      </span>
                    ) : null}
                  </span>
                  {o.justification ? (
                    <span className="text-muted-foreground text-caption">{o.justification}</span>
                  ) : null}
                  {resulted && o.result ? (
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      resulted {fmt(o.result.resultedAt)}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {resulted && o.result ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-medium tabular-nums ${
                        critical
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : abnormal
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                      }`}
                    >
                      {o.result.value}
                      {o.result.unit ? <span className="opacity-70">{o.result.unit}</span> : null}
                      {o.result.abnormalFlag ? (
                        <span className="opacity-80">{o.result.abnormalFlag}</span>
                      ) : null}
                    </span>
                  ) : cancelled ? (
                    <span className="text-muted-foreground rounded-md px-2 py-0.5 text-[10.5px] font-medium uppercase">
                      cancelled
                    </span>
                  ) : (
                    <span className="text-muted-foreground border-border rounded-md border border-dashed px-2 py-0.5 text-[10.5px] font-medium uppercase">
                      {o.status === "collected" ? "collected" : "awaiting"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
