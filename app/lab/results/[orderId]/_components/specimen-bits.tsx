import type { BenchContext } from "@/lib/lab/read";
import type { ReactNode } from "react";
import { BiohazardIcon } from "lucide-react";

import { paymentWords } from "@/components/emr/orders/model";
import { LAB } from "@/content/lab";
import { LAB2 } from "@/content/lab-phase-2";

/** Amber, bordered, an icon and the words (never red: a warning to take care, not an emergency). */
export function HighRiskBlock({
  source,
  procedure,
}: {
  source: "rule" | "manual";
  procedure: string | null;
}) {
  const link = procedure && /^https?:\/\//i.test(procedure) ? procedure : null;
  return (
    <div
      role="status"
      className="bg-status-caution-bg border-status-caution-fg dark:text-status-caution-fg text-body-s flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
    >
      <BiohazardIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {source === "manual" ? LAB2.highRisk.manual : LAB2.highRisk.block}
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="w-fit font-medium underline underline-offset-4"
          >
            Open the procedure
          </a>
        ) : procedure ? (
          <p>Procedure: {procedure}</p>
        ) : null}
      </div>
    </div>
  );
}

/** "This specimen" (§5.6): payment, identity at collection and the pinned analyser; only what exists. */
export function SpecimenCard({ bench, time }: { bench: BenchContext; time: (d: Date) => string }) {
  const B = LAB.bench;
  const payment = bench.paymentState ? paymentWords(bench.paymentState) : null;
  const rows: [string, ReactNode][] = [];
  if (payment) rows.push([B.payment, payment]);
  if (bench.identity)
    rows.push([
      B.identity,
      <>
        {B.outcome[bench.identity.outcome] ?? bench.identity.outcome},{" "}
        {B.method[bench.identity.method] ?? bench.identity.method}, {time(bench.identity.at)}
        {bench.identity.wristband ? (
          <span className="text-muted-foreground block">{LAB2.label.wristband}</span>
        ) : null}
      </>,
    ]);
  if (bench.analyser) rows.push([B.analyser, bench.analyser.model]);
  if (bench.analyser?.bench) rows.push([B.bench, bench.analyser.bench]);
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="this-specimen"
      className="border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="this-specimen" className="text-heading-s text-foreground font-medium">
        {B.specimen}
      </h2>
      <dl className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
