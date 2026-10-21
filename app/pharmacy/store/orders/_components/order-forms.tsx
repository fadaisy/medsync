"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORDERS as O, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { CopyButton, Disclosure } from "../../_components/supply-kit";
import {
  ActButton,
  Field,
  newKey,
  PrintButton,
  Refusal,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../places/_components/store-kit";
import * as actions from "../actions";

/**
 * The order's client pieces (5.9, 5.10): the proposal table with every column's arithmetic behind a button that
 * expands in place, the in-charge's own quantity (required to save) and reason, the budget, an emergency order of
 * chosen medicines; cuts confirmed one by one; line closes; prints and the copied quantities, each logged. Nothing
 * here sends an order anywhere (Law 10).
 */

export interface ProposalRow {
  productId: string;
  medicineId: string;
  name: string;
  unit: string;
  ven: string;
  consumption: number;
  daysOut: number;
  amc: number | null;
  onHand: number;
  max: number | null;
  proposedUnits: number;
  proposedPacks: number | null;
  flags: string[];
  steps: { step: string; value: number }[];
  formula: string[];
  notAdded: string[];
}

const fmt = (n: number | null) =>
  n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2);

export function ProposalForm({
  rows,
  suppliers,
  canSave,
}: {
  rows: readonly ProposalRow[];
  suppliers: readonly { id: string; name: string }[];
  canSave: boolean;
}) {
  const router = useRouter();
  const [draftId, setDraftId] = useState(newKey);
  const [emergency, setEmergency] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const ids = { budget: useId(), supplier: useId() };
  const C = O.columns;
  const save = (data: FormData) =>
    start(async () => {
      const chosen = rows.map((r) => {
        const v = str(data, `q-${r.productId}`);
        return {
          productId: r.productId,
          units: v === "" ? null : Number(v),
          reason: str(data, `r-${r.productId}`) || null,
        };
      });
      const missingReason = chosen.find((c) => {
        const r = rows.find((x) => x.productId === c.productId)!;
        return c.units !== null && c.units !== r.proposedUnits && !c.reason;
      });
      if (missingReason)
        return setError(
          O.reasonRequired(rows.find((r) => r.productId === missingReason.productId)!.name),
        );
      const budget = str(data, "budget");
      const r = await actions.saveOrderProposal({
        clientKey: draftId,
        kind: emergency ? "emergency" : "cycle",
        medicineIds: emergency
          ? rows.filter((x) => data.get(`e-${x.productId}`)).map((x) => x.medicineId)
          : null,
        counterpartyId: str(data, "supplier") || null,
        budget: budget === "" ? null : Number(budget),
        chosen,
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setSaved(true);
      router.refresh();
    });
  const th = (children: ReactNode, right = true) => (
    <th scope="col" className={`px-2 py-2 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
  return (
    <form action={save} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={O.budget} id={ids.budget}>
          <Input id={ids.budget} name="budget" inputMode="decimal" className={TARGET} />
        </Field>
        <Field label={O.supplier} id={ids.supplier}>
          <select id={ids.supplier} name="supplier" className={SELECT} defaultValue="">
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={emergency}
            onChange={(e) => setEmergency(e.target.checked)}
          />
          {O.emergency}
        </label>
      </div>
      <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
        <table className="text-caption w-full">
          <thead className="bg-ink-50">
            <tr>
              {emergency ? th(<span className="sr-only">{O.emergencyLabel}</span>, false) : null}
              {th(C.medicine, false)}
              {th(C.ven, false)}
              {th(C.consumption)}
              {th(C.daysOut)}
              {th(C.amc)}
              {th(C.onHand)}
              {th(C.max)}
              {th(C.proposed)}
              {th(C.yours)}
              {th(C.reason, false)}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.productId} className="align-top">
                {emergency ? (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      name={`e-${r.productId}`}
                      aria-label={r.name}
                      className="size-5"
                    />
                  </td>
                ) : null}
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  {r.name}
                  {r.flags.map((f) => (
                    <p key={f}>
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {O.flags[f as keyof typeof O.flags] ?? f}
                      </StatusWord>
                    </p>
                  ))}
                  {r.notAdded.map((n) => (
                    <p key={n} className="text-muted-foreground">{`${n}: ${O.differentUnits}`}</p>
                  ))}
                  <Disclosure>
                    <ul>
                      {r.steps.map((s) => (
                        <li key={s.step}>{`${s.step}: ${fmt(s.value)}`}</li>
                      ))}
                      {r.formula.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </Disclosure>
                </th>
                <td className="px-2 py-2">{r.ven}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.consumption}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.daysOut}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.amc === null ? O.noAmc : fmt(r.amc)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.onHand}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(r.max)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {`${r.proposedUnits} ${r.unit}`}
                  {r.proposedPacks !== null ? (
                    <p className="text-muted-foreground">{O.packs(r.proposedPacks)}</p>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  <Input
                    name={`q-${r.productId}`}
                    inputMode="numeric"
                    aria-label={`${C.yours}: ${r.name}`}
                    className={`${TARGET} w-24 tabular-nums`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    name={`r-${r.productId}`}
                    aria-label={`${C.reason}: ${r.name}`}
                    className={TARGET}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canSave ? (
        <span className="flex flex-wrap items-center gap-3">
          <Button type="submit" className={TARGET} disabled={pending}>
            {O.saveDraft}
          </Button>
          {saved ? (
            <Button
              type="button"
              variant="secondary"
              className={TARGET}
              onClick={() => setDraftId(newKey())}
            >
              {O.proposal}
            </Button>
          ) : null}
          <span className="text-caption text-muted-foreground">{O.savedNote}</span>
          <Refusal error={error} />
        </span>
      ) : null}
    </form>
  );
}

export function ConfirmCutDialog({
  orderId,
  productId,
  label,
  vital,
}: {
  orderId: string;
  productId: string;
  label: string;
  vital: boolean;
}) {
  const id = useId();
  return (
    <StoreDialog
      label={O.confirmCut}
      title={label}
      submit={O.confirmCut}
      onSave={(clientKey, d) =>
        actions.confirmCut({ clientKey, orderId, productId, reason: str(d, "reason") || null })
      }
    >
      <Field label={vital ? O.vitalReason : SUPPLY_COMMON.reason} id={id}>
        <Input id={id} name="reason" required={vital} className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

export function SaveOrderButton({ orderId }: { orderId: string }) {
  return (
    <ActButton
      label={O.saveOrder}
      run={() => actions.saveOrder({ clientKey: newKey(), orderId })}
    />
  );
}

export function CloseLineDialog({ orderLineId, name }: { orderLineId: string; name: string }) {
  const id = useId();
  return (
    <StoreDialog
      label={O.closeLine}
      title={`${O.closeLine}: ${name}`}
      submit={O.closeLine}
      onSave={(clientKey, d) =>
        actions.closeOrderLine({
          clientKey,
          orderLineId,
          reason: str(d, "reason"),
          note: str(d, "note") || null,
        })
      }
    >
      <Field label={SUPPLY_COMMON.reason} id={id}>
        <select id={id} name="reason" required className={SELECT} defaultValue="">
          <option value="" disabled>
            {SUPPLY_COMMON.choose}
          </option>
          {Object.entries(O.closeReasons).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label={SUPPLY_COMMON.note} id={`${id}-n`}>
        <Input id={`${id}-n`} name="note" className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

export function PaperDialog({
  orderId,
  lines,
}: {
  orderId: string;
  lines: readonly { productId: string; name: string; proposed: number }[];
}) {
  const base = useId();
  return (
    <StoreDialog
      label={O.paper}
      title={O.paperTitle}
      description={O.paperIntro}
      submit={SUPPLY_COMMON.save}
      width="wide"
      onSave={(clientKey, d) =>
        actions.recordPaperOrderComparison({
          clientKey,
          orderId,
          lines: lines.map((l) => ({
            productId: l.productId,
            paperUnits: Number(str(d, `p-${l.productId}`)),
            explanation: str(d, `x-${l.productId}`) || null,
          })),
        })
      }
    >
      {lines.map((l, i) => (
        <div key={l.productId} className="grid gap-3 sm:grid-cols-3">
          <p className="text-body-s self-center">{`${l.name}: ${l.proposed}`}</p>
          <Field label={O.paperFigure} id={`${base}-p${i}`}>
            <Input
              id={`${base}-p${i}`}
              name={`p-${l.productId}`}
              inputMode="numeric"
              required
              className={TARGET}
            />
          </Field>
          <Field label={O.explanation} id={`${base}-x${i}`}>
            <Input id={`${base}-x${i}`} name={`x-${l.productId}`} className={TARGET} />
          </Field>
        </div>
      ))}
    </StoreDialog>
  );
}

export function OrderPrints({ orderId, text }: { orderId: string; text: string }) {
  const log =
    (form: "order_085" | "order_084b" | "purchase_list" | "quantities_text") =>
    (clientKey: string) =>
      actions.printOrder({ clientKey, orderId, form });
  return (
    <span className="flex flex-wrap gap-2">
      <PrintButton label={O.print085} section={`order-${orderId}`} log={log("order_085")} />
      <PrintButton label={O.print084b} section={`order-${orderId}`} log={log("order_084b")} />
      <PrintButton
        label={O.printPurchase}
        section={`order-${orderId}`}
        log={log("purchase_list")}
      />
      <CopyButton label={O.copy} text={text} log={log("quantities_text")} />
    </span>
  );
}
