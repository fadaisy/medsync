"use client";

import type { PricesPage } from "@/lib/pharmacy/prices/store";
import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import {
  addPayerAction,
  setChargeModeAction,
  setPayFirstAction,
  setPriceAction,
  setPriceRuleAction,
} from "../../catalogue-actions";
import { useSave } from "./catalogue-products";

const P = CATALOGUE.prices;

function Field({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...rest} />
    </div>
  );
}

function Footer(props: {
  w: ReturnType<typeof useSave>;
  ready: boolean;
  save: () => void;
  close: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {props.w.status}
      <Button variant="secondary" onClick={props.close}>
        {P.needs.cancel}
      </Button>
      <Button disabled={!props.ready || props.w.pending} onClick={props.save}>
        {props.label}
      </Button>
    </div>
  );
}

/** The rule proposes; it prices nothing (S26; D-CAT-10: none is shipped). */
export function RuleDialog({ payers, today }: { payers: PricesPage["payers"]; today: string }) {
  const w = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ multiplier: "", step: "", from: today });
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const m = Number(f.multiplier);
  const step = Number(f.step);
  const ready = m > 0 && m <= 100 && Number.isInteger(step) && step >= 1 && f.from >= today;
  const save = () =>
    w.run(
      () =>
        setPriceRuleAction({
          multiplier: m,
          roundingStep: step,
          fromDate: f.from,
          payerAdjustments: Object.fromEntries(
            Object.entries(adjust)
              .filter(([, v]) => Number(v) > 0)
              .map(([k, v]) => [k, Number(v)]),
          ),
        }),
      P.rule.done,
      () => setOpen(false),
    );
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {P.rule.set}
      </Button>
      <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-4 p-5">
          <DialogTitle className="text-heading-s">{P.rule.title}</DialogTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              id="pr-m"
              label={P.rule.multiplier}
              inputMode="decimal"
              value={f.multiplier}
              onChange={(e) => setF({ ...f, multiplier: e.target.value })}
            />
            <Field
              id="pr-s"
              label={P.rule.step}
              inputMode="numeric"
              value={f.step}
              onChange={(e) => setF({ ...f, step: e.target.value })}
            />
            <Field
              id="pr-f"
              label={P.rule.from}
              type="date"
              min={today}
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
            />
            {payers.map((p) => (
              <Field
                key={p.id}
                id={`pr-a-${p.id}`}
                label={P.rule.adjust(p.name)}
                inputMode="decimal"
                value={adjust[p.id] ?? ""}
                onChange={(e) => setAdjust({ ...adjust, [p.id]: e.target.value })}
              />
            ))}
          </div>
          <Footer
            w={w}
            ready={ready}
            save={save}
            close={() => setOpen(false)}
            label={P.rule.save}
          />
        </div>
      </EditorDialog>
    </>
  );
}

export function PayerDialog() {
  const w = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    code: "",
    name: "",
    kind: "scheme" as "scheme" | "staff" | "other",
  });
  const ready = /^[a-z0-9_]{2,40}$/.test(f.code) && f.name.trim().length >= 2;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {P.payers.add}
      </Button>
      <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-4 p-5">
          <DialogTitle className="text-heading-s">{P.payers.add}</DialogTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              id="py-c"
              label={P.payers.code}
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
            />
            <Field
              id="py-n"
              label={P.payers.name}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="py-k">{P.payers.kind}</Label>
              <select
                id="py-k"
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}
                className="border-input bg-background text-body-s h-9 rounded-md border px-2"
              >
                {(["scheme", "staff", "other"] as const).map((k) => (
                  <option key={k} value={k}>
                    {P.payers.kinds[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Footer
            w={w}
            ready={ready}
            close={() => setOpen(false)}
            label={P.payers.save}
            save={() =>
              w.run(
                () => addPayerAction(f),
                P.payers.done,
                () => setOpen(false),
              )
            }
          />
        </div>
      </EditorDialog>
    </>
  );
}

/** A point's charge mode and pay-before-collecting, each a new row from today (D-CAT-11). */
export function PointControls(props: {
  pointId: string;
  mode: "charged" | "free";
  payFirst: boolean;
  today: string;
}) {
  const { pointId, mode, payFirst, today } = props;
  const w = useSave();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        disabled={w.pending}
        onClick={() =>
          w.run(
            () =>
              setChargeModeAction({
                pointId,
                mode: mode === "free" ? "charged" : "free",
                fromDate: today,
              }),
            P.points.done,
          )
        }
      >
        {mode === "free" ? P.points.makeCharged : P.points.makeFree}
      </Button>
      <Button
        variant="ghost"
        disabled={w.pending}
        onClick={() =>
          w.run(
            () => setPayFirstAction({ pointId, required: !payFirst, fromDate: today }),
            P.points.done,
          )
        }
      >
        {P.points.payFirst}: {payFirst ? P.points.turnOff : P.points.turnOn}
      </Button>
      {w.status}
    </span>
  );
}

/** One product without a cash price: the proposal with its arithmetic; accept, type or mark free (S26, S28). */
export function NeedsPrice(props: {
  row: PricesPage["needs"][number];
  cashPayerId: string | null;
  manage: boolean;
  today: string;
}) {
  const { row, cashPayerId, manage, today } = props;
  const w = useSave();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const base = cashPayerId ? { productId: row.id, payerId: cashPayerId, fromDate: today } : null;
  const n = Number(price);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="text-body-s text-foreground">
        {[row.name, row.strength, row.issueUnit].filter(Boolean).join(" · ")} ·{" "}
        <span className="text-muted-foreground">{P.figures.notSet}</span>
      </span>
      {row.proposal ? (
        <ol className="text-caption text-muted-foreground flex flex-wrap gap-x-3">
          {row.proposal.steps.map((s) => (
            <li key={s.label} className="tabular-nums">
              {s.label}: {Math.round(s.value * 100) / 100}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-caption text-muted-foreground">{P.needs.noProposal}</p>
      )}
      {manage && base && (
        <span className="flex flex-wrap items-center gap-2">
          {row.proposal && (
            <Button
              variant="secondary"
              disabled={w.pending}
              onClick={() => w.run(() => setPriceAction({ ...base, kind: "accept" }), P.needs.done)}
            >
              {P.needs.accept(row.proposal.price.toLocaleString("en-UG"))}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOpen(true)}>
            {P.needs.type}
          </Button>
          <Button
            variant="ghost"
            disabled={w.pending}
            onClick={() => w.run(() => setPriceAction({ ...base, kind: "free" }), P.needs.done)}
          >
            {P.needs.free}
          </Button>
          {w.status}
        </span>
      )}
      {manage && base && (
        <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
          <div className="flex flex-col gap-4 p-5">
            <DialogTitle className="text-heading-s">{row.name}</DialogTitle>
            <Field
              id={`pp-${row.id}`}
              label={P.needs.price}
              inputMode="numeric"
              className="tabular-nums"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Footer
              w={w}
              ready={Number.isInteger(n) && n >= 1}
              close={() => setOpen(false)}
              label={P.needs.save}
              save={() =>
                w.run(
                  () => setPriceAction({ ...base, kind: "typed", priceUgx: n }),
                  P.needs.done,
                  () => setOpen(false),
                )
              }
            />
          </div>
        </EditorDialog>
      )}
    </li>
  );
}
