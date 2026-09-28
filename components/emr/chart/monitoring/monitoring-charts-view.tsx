"use client";

import type { MonitoringChartCard, MonitoringPayload } from "@/lib/emr/charts/payload";
import { useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/emr/charts/scale";
import { cn } from "@/lib/utils";
import { FluidBalanceGraph } from "../graphs/fluid-balance-graph";
import { FluidBalanceTable } from "../graphs/fluid-balance-table";
import { GlucoseGraph } from "../graphs/glucose-graph";
import { MarGrid } from "../graphs/mar-grid";
import { News2Graph } from "../graphs/news2-graph";
import { ReadingsTable } from "../graphs/readings-table";
import { TemperatureGraph } from "../graphs/temperature-graph";
import { UrineOutputGraph } from "../graphs/urine-output-graph";
import { mlWords } from "../graphs/words";

/**
 * The visit's monitoring charts (ADR 0189): one card per chart the plan opened, with its name,
 * what opened it, its frequency or state, and a disclosure for its tables and graphs. A pure view
 * over the payload (renders from a fixture; no fetching). The nurse records entries elsewhere;
 * this view never edits.
 */
export function MonitoringChartsView({
  payload,
  defaultOpen = "first",
}: {
  payload: MonitoringPayload;
  /** A view only: entries are recorded by the nurse's form, never here. */
  editable?: false;
  /** Which cards start expanded. */
  defaultOpen?: "first" | "all" | "none";
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        defaultOpen === "all"
          ? payload.charts.map((c) => c.id)
          : defaultOpen === "first" && payload.charts[0]
            ? [payload.charts[0].id]
            : [],
      ),
  );
  if (payload.charts.length === 0)
    return (
      <p className="text-body-s text-muted-foreground">
        No monitoring charts for this visit. The plan opens them.
      </p>
    );
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <ul className="flex flex-col gap-3">
      {payload.charts.map((c) => (
        <li key={c.id}>
          <ChartCard
            card={c}
            payload={payload}
            expanded={open.has(c.id)}
            onToggle={() => toggle(c.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function ChartCard({
  card,
  payload,
  expanded,
  onToggle,
}: {
  card: MonitoringChartCard;
  payload: MonitoringPayload;
  expanded: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const headingId = `${id}-heading`;
  const bodyId = `${id}-body`;
  const state = card.closedAt ? "Closed" : (card.frequency ?? "Open");
  return (
    <section
      aria-labelledby={headingId}
      data-chart={card.kind}
      className="border-border bg-card shadow-card rounded-lg border"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-heading-s text-foreground">
              {card.name}
            </h3>
            <Tag hue="slate">{state}</Tag>
          </div>
          <p className="text-body-s text-muted-foreground">
            Opened by: <span className="text-foreground">{card.openedByLabel}</span>
          </p>
          <p className="text-caption text-muted-foreground">
            {card.rule} · opened <span className="font-mono">{formatClock(card.openedAt)}</span>
            {card.closedAt ? (
              <>
                {" "}
                · closed <span className="font-mono">{formatClock(card.closedAt)}</span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {expanded ? "Hide chart" : "Show chart"}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "ease-expo-out transition-transform duration-150 motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </Button>
      </div>
      <div id={bodyId} hidden={!expanded} className="border-border border-t px-4 py-4">
        <ChartBody card={card} payload={payload} />
      </div>
    </section>
  );
}

function ChartBody({ card, payload }: { card: MonitoringChartCard; payload: MonitoringPayload }) {
  switch (card.kind) {
    case "fluid_balance": {
      const b = card.body;
      const w = payload.weight;
      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            {b.ivLines
              .filter((l) => l.mlPerHour !== null)
              .map((l) => (
                <p key={l.key} className="text-body-s text-foreground">
                  {l.label}
                  {l.purpose ? <span className="text-muted-foreground"> · {l.purpose}</span> : null}
                  <span className="text-muted-foreground">
                    {" "}
                    · plan <span className="font-mono">{mlWords(l.mlPerHour!)} mL/h</span>
                    {l.dropsPerMinute !== null && l.dropsPerMl ? (
                      <>
                        {" "}
                        · <span className="font-mono">{l.dropsPerMinute} drops/min</span> on a{" "}
                        {l.dropsPerMl}-drop set
                      </>
                    ) : null}
                  </span>
                </p>
              ))}
            <p className="text-caption text-muted-foreground">
              {w ? (
                <>
                  Weight <span className="font-mono">{w.kg} kg</span> ·{" "}
                  <span className="font-mono">{formatClock(w.at)}</span> · {w.source}
                </>
              ) : (
                "No weight in the vitals."
              )}
              {card.measureUrine ? " · Urine measured hourly." : null}
            </p>
          </div>
          <FluidBalanceTable body={b} />
          <FluidBalanceGraph body={b} />
          <UrineOutputGraph body={b} weightKg={w?.kg ?? null} />
        </div>
      );
    }
    case "observations":
      return (
        <div className="flex flex-col gap-3">
          <News2Graph body={card.body} now={payload.now} />
          <ReadingsTable
            title="NEWS2 scores"
            valueHeader="NEWS2"
            rows={card.body.news2.map((p) => ({
              at: p.at,
              value: String(p.total),
              origin: p.origin,
            }))}
          />
        </div>
      );
    case "temperature":
      return (
        <div className="flex flex-col gap-3">
          <TemperatureGraph body={card.body} now={payload.now} />
          <ReadingsTable
            title="Temperatures"
            valueHeader="°C"
            detailHeader="Site"
            rows={card.body.points.map((p) => ({
              at: p.at,
              value: p.value.toFixed(1),
              origin: p.origin,
              detail: p.siteLabel,
            }))}
          />
        </div>
      );
    case "glucose":
      return (
        <div className="flex flex-col gap-3">
          <GlucoseGraph body={card.body} now={payload.now} />
          <ReadingsTable
            title="Glucose readings"
            valueHeader="mmol/L"
            rows={card.body.points.map((p) => ({
              at: p.at,
              value: p.value.toFixed(1),
              origin: p.origin,
            }))}
          />
        </div>
      );
    case "mar":
      return <MarGrid body={card.body} />;
  }
}
