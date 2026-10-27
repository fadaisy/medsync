"use client";

import type { Act } from "./ward-dialogs";
import type { WardStockPage } from "@/lib/pharmacy/stores/ward-read";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Input } from "@/components/ui/input";
import { CATALOGUE, GAP_REASONS } from "@/content/pharmacy-catalogue";
import { ActionDialog, Field, SELECT } from "./ward-dialogs";

/**
 * 4.13 (ADR 0464): use at the last count against doses charted from ward stock. A gap with no reason reads in
 * amber with its words, and the nurse in charge gives the reason from the signed list; it is never a movement.
 */
export function UseCheck({
  locationId,
  rows,
  gapReason,
}: {
  locationId: string;
  rows: NonNullable<WardStockPage["useCheck"]>;
  gapReason?: Act;
}) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="ward-use-check" className="flex flex-col gap-2">
      <h2 id="ward-use-check" className="text-heading-s text-foreground">
        {CATALOGUE.useCheck.title}
      </h2>
      <ul className="border-border bg-card divide-border divide-y rounded-lg border">
        {rows.map((r) => (
          <li
            key={r.productId}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
          >
            <span className="text-body-s flex flex-col gap-0.5">
              <span>{r.name}</span>
              {r.compared.kind === "gap" ? (
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {r.compared.words}
                </StatusWord>
              ) : (
                <span className="text-muted-foreground">
                  {r.compared.words}
                  {r.reason
                    ? ` · ${GAP_REASONS[r.reason as keyof typeof GAP_REASONS] ?? r.reason}`
                    : ""}
                </span>
              )}
            </span>
            {r.compared.kind === "gap" && gapReason ? (
              <ActionDialog
                label={CATALOGUE.useCheck.giveReason}
                title={`${r.name}: ${r.compared.words}`}
                description={CATALOGUE.wardGapHelp}
                submit={CATALOGUE.useCheck.save}
                width="medium"
                onSave={async (_k, d) =>
                  gapReason({
                    locationId,
                    countId: r.countId,
                    productId: r.productId,
                    gap: r.compared.kind === "gap" ? r.compared.gap : 0,
                    reasonCode: String(d.get("reason") ?? ""),
                    note: String(d.get("note") ?? "").trim() || null,
                  })
                }
              >
                <Field label={CATALOGUE.useCheck.reason} id={`reason-${r.productId}`}>
                  <select
                    id={`reason-${r.productId}`}
                    name="reason"
                    required
                    className={SELECT}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {CATALOGUE.useCheck.reason}
                    </option>
                    {Object.entries(GAP_REASONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={CATALOGUE.useCheck.note} id={`note-${r.productId}`}>
                  <Input id={`note-${r.productId}`} name="note" maxLength={300} />
                </Field>
              </ActionDialog>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
