"use client";

import type { ScanProduct, WitnessOption } from "../../places/_components/store-kit";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { RETURN_REASONS, SHORT_DATED_DECISIONS, STORE } from "@/content/pharmacy-stores-store";
import { pickProblems } from "@/lib/pharmacy/distribution/engine";
import { productByText } from "@/lib/pharmacy/stores/scan-fill";
import * as store from "../../actions";
import {
  ActButton,
  expiryForField,
  Field,
  PrintButton,
  ScanField,
  SELECT,
  StoreDialog,
  StoreWitness,
  str,
  TARGET,
} from "../../places/_components/store-kit";
import * as actions from "../actions";
import { PickCell } from "./pick-cell";

const I = STORE.issues;
const L = STORE.loans;

export interface Place {
  id: string;
  name: string;
}
export interface IssueProduct extends ScanProduct {
  issueUnit: string;
  controlled: boolean;
}
export interface HeldBatch {
  id: string;
  locationId: string;
  locationName: string;
  productId: string;
  productName: string;
  issueUnit: string;
  batchNumber: string;
  expiryText: string;
  balance: number;
  controlled: boolean;
}

type Row = { key: string; productId: string; quantity: string };
const blank = (): Row => ({ key: crypto.randomUUID(), productId: "", quantity: "" });

/** Product-and-quantity lines, each with a scan field (5.11). */
function Lines({
  rows,
  setRows,
  products,
}: {
  rows: Row[];
  setRows: (f: (rs: Row[]) => Row[]) => void;
  products: readonly IssueProduct[];
}) {
  const set = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const unit = products.find((p) => p.id === r.productId)?.issueUnit;
        return (
          <fieldset
            key={r.key}
            className="border-border grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_10rem_auto]"
          >
            <legend className="text-caption px-1">{`${I.line} ${i + 1}`}</legend>
            <ScanField
              products={products}
              onRead={(o) => {
                if (o.kind === "gs1" && o.productId) set(r.key, { productId: o.productId });
                if (o.kind === "text") {
                  const hit = productByText(products, o.text);
                  if (hit) set(r.key, { productId: hit });
                }
              }}
            />
            <Field label={I.product} id={`p-${r.key}`}>
              <select
                id={`p-${r.key}`}
                className={SELECT}
                required
                value={r.productId}
                onChange={(e) => set(r.key, { productId: e.target.value })}
              >
                <option value="" disabled>
                  {I.product}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={unit ? `${I.asked} (${unit})` : I.asked} id={`q-${r.key}`}>
              <Input
                id={`q-${r.key}`}
                type="number"
                min={1}
                required
                inputMode="numeric"
                value={r.quantity}
                onChange={(e) => set(r.key, { quantity: e.target.value })}
                className={TARGET}
              />
            </Field>
            <div className="flex items-end">
              {rows.length > 1 ? (
                <button
                  type="button"
                  className={`${TARGET} text-body-s text-primary underline-offset-4 hover:underline`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  {STORE.delivery.removeLine}
                </button>
              ) : null}
            </div>
          </fieldset>
        );
      })}
      <button
        type="button"
        className={`${TARGET} text-body-s text-primary self-start underline-offset-4 hover:underline`}
        onClick={() => setRows((rs) => [...rs, blank()])}
      >
        {I.addLine}
      </button>
    </div>
  );
}

const asLines = (rows: Row[]) =>
  rows.map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));

export function RaiseRequisitionDialog({
  places,
  products,
}: {
  places: readonly Place[];
  products: readonly IssueProduct[];
}) {
  const ids = { from: useId(), to: useId() };
  const [rows, setRows] = useState<Row[]>([blank()]);
  return (
    <StoreDialog
      label={I.raise}
      title={I.raiseTitle}
      submit={I.submit}
      width="xl"
      disabled={places.length < 2}
      onOpen={() => setRows([blank()])}
      onSave={(clientKey, d) =>
        actions.raiseRequisition({
          clientKey,
          requestingLocationId: str(d, "from"),
          issuingLocationId: str(d, "to"),
          lines: asLines(rows),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={I.from} id={ids.from}>
          <select id={ids.from} name="from" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.from}
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={I.to} id={ids.to}>
          <select id={ids.to} name="to" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.to}
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Lines rows={rows} setRows={setRows} products={products} />
    </StoreDialog>
  );
}

export function DirectIssueDialog({
  places,
  products,
  witnesses,
}: {
  places: readonly Place[];
  products: readonly IssueProduct[];
  witnesses: readonly WitnessOption[];
}) {
  const ids = { from: useId(), to: useId() };
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [witness, setWitness] = useState<{ attestationId: string; at: string } | null>(null);
  const controlled = rows.some((r) => products.find((p) => p.id === r.productId)?.controlled);
  return (
    <StoreDialog
      label={I.direct}
      title={I.directTitle}
      submit={STORE.issue.issue}
      width="xl"
      disabled={places.length < 2}
      onOpen={() => {
        setRows([blank()]);
        setWitness(null);
      }}
      onSave={(clientKey, d) =>
        actions.directIssue({
          clientKey,
          fromLocationId: str(d, "from"),
          toLocationId: str(d, "to"),
          lines: asLines(rows),
          witnessAttestationId: witness?.attestationId ?? null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={I.to} id={ids.from}>
          <select id={ids.from} name="from" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.to}
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={I.issueTo} id={ids.to}>
          <select id={ids.to} name="to" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.issueTo}
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Lines rows={rows} setRows={setRows} products={products} />
      {controlled ? (
        <>
          <p className="text-body-s">{STORE.issue.controlled}</p>
          <StoreWitness
            witnesses={witnesses}
            action="controlled_transfer"
            witnessed={witness}
            onWitnessed={setWitness}
          />
        </>
      ) : null}
    </StoreDialog>
  );
}

/** IS-3 at a pharmacy place: what arrived, batch by batch; a difference needs words. */
export function ConfirmReceiptDialog({
  issue,
}: {
  issue: {
    issueId: string;
    from: string;
    lines: readonly { batchId: string; label: string; issued: number }[];
  };
}) {
  const id = useId();
  return (
    <StoreDialog
      label={I.confirm}
      title={`${I.confirmTitle} · ${issue.from}`}
      submit={I.confirm}
      width="wide"
      onSave={(_k, d) =>
        actions.confirmIssueReceipt({
          issueId: issue.issueId,
          lines: issue.lines.map((l) => ({
            batchId: l.batchId,
            confirmed: Number(str(d, `got-${l.batchId}`)),
          })),
          reason: str(d, "reason") || null,
        })
      }
    >
      {issue.lines.map((l) => (
        <div key={l.batchId} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
          <label htmlFor={`got-${l.batchId}`} className="text-body-s">
            {l.label} · {STORE.amounts(l.issued, "")}
          </label>
          <Input
            id={`got-${l.batchId}`}
            name={`got-${l.batchId}`}
            type="number"
            min={0}
            required
            inputMode="numeric"
            defaultValue={l.issued}
            aria-label={`${l.label}, ${I.arrived}`}
            className={TARGET}
          />
        </div>
      ))}
      <Field label={I.difference} id={id}>
        <Input id={id} name="reason" maxLength={500} className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

/** IS-5: back to the place that issued it; not fit goes to quarantine. */
export function ReturnDialog({
  batches,
  places,
  witnesses,
}: {
  batches: readonly HeldBatch[];
  places: readonly Place[];
  witnesses: readonly WitnessOption[];
}) {
  const ids = { batch: useId(), to: useId(), qty: useId(), reason: useId(), note: useId() };
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [fit, setFit] = useState(true);
  const [witness, setWitness] = useState<{ attestationId: string; at: string } | null>(null);
  const b = batches.find((x) => x.id === batchId);
  return (
    <StoreDialog
      label={I.returns}
      title={I.returnTitle}
      submit={I.returns}
      width="wide"
      disabled={!batches.length}
      onOpen={() => setWitness(null)}
      onSave={(clientKey, d) =>
        store.returnStock({
          clientKey,
          fromLocationId: b?.locationId ?? "",
          toLocationId: str(d, "to"),
          batchId,
          quantity: Number(str(d, "quantity")),
          reasonCode: str(d, "reason"),
          note: str(d, "note") || null,
          fit,
          witnessAttestationId: witness?.attestationId ?? null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L.batch} id={ids.batch}>
          <select
            id={ids.batch}
            className={SELECT}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {batches.map((x) => (
              <option key={x.id} value={x.id}>
                {x.locationName} · {x.productName} · {x.batchNumber} · {x.expiryText} · {x.balance}
              </option>
            ))}
          </select>
        </Field>
        <Field label={I.returnTo} id={ids.to}>
          <select id={ids.to} name="to" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.returnTo}
            </option>
            {places
              .filter((p) => p.id !== b?.locationId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={b ? `${L.quantity} (${b.issueUnit})` : L.quantity} id={ids.qty}>
          <Input
            id={ids.qty}
            name="quantity"
            type="number"
            min={1}
            max={b?.balance}
            required
            className={TARGET}
          />
        </Field>
        <Field label={I.returnReason} id={ids.reason}>
          <select id={ids.reason} name="reason" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {I.returnReason}
            </option>
            {Object.entries(RETURN_REASONS).map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </Field>
        <Field label={I.returnNote} id={ids.note}>
          <Input id={ids.note} name="note" maxLength={500} className={TARGET} />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <label className="text-body-s inline-flex min-h-11 items-center gap-2">
            <input type="radio" checked={fit} onChange={() => setFit(true)} />
            {I.fit}
          </label>
          <label className="text-body-s inline-flex min-h-11 items-center gap-2">
            <input type="radio" checked={!fit} onChange={() => setFit(false)} />
            {I.notFit}
          </label>
        </fieldset>
      </div>
      {b?.controlled ? (
        <StoreWitness
          witnesses={witnesses}
          action="controlled_transfer"
          witnessed={witness}
          onWitnessed={setWitness}
        />
      ) : null}
    </StoreDialog>
  );
}

/* ─── Loans (IS-7) ────────────────────────────────────────────────────── */

export function LendDialog({
  batches,
  facilities,
}: {
  batches: readonly HeldBatch[];
  facilities: readonly Place[];
}) {
  const ids = { batch: useId(), facility: useId(), qty: useId() };
  const lendable = batches.filter((b) => !b.controlled);
  const [batchId, setBatchId] = useState(lendable[0]?.id ?? "");
  const b = lendable.find((x) => x.id === batchId);
  return (
    <StoreDialog
      label={L.lend}
      title={L.lendTitle}
      description={L.controlledNever}
      submit={L.lend}
      disabled={!lendable.length || !facilities.length}
      onSave={(clientKey, d) =>
        store.lendStock({
          clientKey,
          locationId: b?.locationId ?? "",
          batchId,
          quantity: Number(str(d, "quantity")),
          counterpartyId: str(d, "facility"),
        })
      }
    >
      {!facilities.length ? <p className="text-body-s">{L.noFacility}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L.batch} id={ids.batch}>
          <select
            id={ids.batch}
            className={SELECT}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {lendable.map((x) => (
              <option key={x.id} value={x.id}>
                {x.locationName} · {x.productName} · {x.batchNumber} · {x.expiryText} · {x.balance}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L.facility} id={ids.facility}>
          <select id={ids.facility} name="facility" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {L.facility}
            </option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={b ? `${L.quantity} (${b.issueUnit})` : L.quantity} id={ids.qty}>
          <Input
            id={ids.qty}
            name="quantity"
            type="number"
            min={1}
            max={b?.balance}
            required
            className={TARGET}
          />
        </Field>
      </div>
    </StoreDialog>
  );
}

export function BorrowDialog({
  places,
  facilities,
  products,
}: {
  places: readonly Place[];
  facilities: readonly Place[];
  products: readonly IssueProduct[];
}) {
  const ids = {
    into: useId(),
    facility: useId(),
    product: useId(),
    batch: useId(),
    expiry: useId(),
    qty: useId(),
    decision: useId(),
  };
  const plain = products.filter((p) => !p.controlled);
  const [productId, setProductId] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  return (
    <StoreDialog
      label={L.borrow}
      title={L.borrowTitle}
      description={L.controlledNever}
      submit={L.borrow}
      width="wide"
      disabled={!places.length || !facilities.length}
      onOpen={() => {
        setProductId("");
        setBatch("");
        setExpiry("");
      }}
      onSave={(clientKey, d) =>
        store.borrowStock({
          clientKey,
          locationId: str(d, "into"),
          counterpartyId: str(d, "facility"),
          productId,
          batchNumber: batch,
          expiry,
          quantity: Number(str(d, "quantity")),
          shortDatedDecision: str(d, "decision") || null,
        })
      }
    >
      <ScanField
        products={plain}
        onRead={(o) => {
          if (o.kind !== "gs1") return;
          if (o.productId) setProductId(o.productId);
          if (o.scan.batch) setBatch(o.scan.batch);
          if (o.scan.expiry) setExpiry(expiryForField(o.scan));
        }}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={L.into} id={ids.into}>
          <select
            id={ids.into}
            name="into"
            className={SELECT}
            required
            defaultValue={places[0]?.id ?? ""}
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L.facility} id={ids.facility}>
          <select id={ids.facility} name="facility" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {L.facility}
            </option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={I.product} id={ids.product}>
          <select
            id={ids.product}
            className={SELECT}
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="" disabled>
              {I.product}
            </option>
            {plain.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={STORE.delivery.batch} id={ids.batch}>
          <Input
            id={ids.batch}
            required
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className={`${TARGET} font-mono`}
          />
        </Field>
        <Field label={STORE.delivery.expiry} id={ids.expiry}>
          <Input
            id={ids.expiry}
            required
            placeholder="2027-03"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className={TARGET}
          />
        </Field>
        <Field label={L.quantity} id={ids.qty}>
          <Input id={ids.qty} name="quantity" type="number" min={1} required className={TARGET} />
        </Field>
        <Field label={STORE.delivery.shortDated} id={ids.decision}>
          <select id={ids.decision} name="decision" className={SELECT} defaultValue="">
            <option value="">—</option>
            {Object.entries(SHORT_DATED_DECISIONS).map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </StoreDialog>
  );
}

export function CloseLoanDialog({
  loan,
}: {
  loan: { id: string; facility: string; productName: string; outstanding: number };
}) {
  const ids = { qty: useId(), reason: useId() };
  return (
    <StoreDialog
      label={L.close}
      title={`${L.closeTitle} · ${loan.facility}`}
      description={`${loan.productName} · ${loan.outstanding}`}
      submit={L.close}
      onSave={(clientKey, d) => {
        const returned = str(d, "returned");
        return store.closeLoan({
          clientKey,
          loanMovementId: loan.id,
          returned: returned ? Number(returned) : null,
          reason: returned ? null : str(d, "reason") || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L.returnedQty} id={ids.qty}>
          <Input
            id={ids.qty}
            name="returned"
            type="number"
            min={1}
            max={loan.outstanding}
            className={TARGET}
          />
        </Field>
        <Field label={L.closeReason} id={ids.reason}>
          <Input id={ids.reason} name="reason" maxLength={300} className={TARGET} />
        </Field>
      </div>
    </StoreDialog>
  );
}

export function LoanPrint({ loanId }: { loanId: string }) {
  return (
    <PrintButton
      label={L.print}
      section={`loan-${loanId}`}
      log={(clientKey) => store.printLoanRecord({ clientKey, loanMovementId: loanId })}
    />
  );
}

/* ─── The issuing screen (IS-1, IS-2, IS-6) ───────────────────────────── */

export interface IssueLine {
  id: string;
  productName: string;
  issueUnit: string;
  asked: number;
  held: number;
  prefill: number;
  controlled: boolean;
  cold: boolean;
  /** Usable batches here, first to expire first, with the expiry as words. */
  stock: { batchNumber: string; expiry: string; held: number }[];
  decided: boolean;
  /** 4.11: the line's pick; undefined with the catalogue check off. */
  picked?: "scan" | "hand" | null;
}

/** IS-2: the batches a quantity comes from, first to expire first. */
const takeFrom = (stock: IssueLine["stock"], qty: number) => {
  let left = qty;
  return stock.flatMap((b) => {
    const n = Math.min(b.held, Math.max(left, 0));
    left -= n;
    return n ? [{ ...b, take: n }] : [];
  });
};

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function printPickList(
  title: string,
  rows: { name: string; asked: number; issue: number; take: string[] }[],
) {
  const S = STORE.issue;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px system-ui,sans-serif;margin:32px}table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid silver;vertical-align:top}</style>
<h1 style="font-size:20px">${esc(title)}</h1><table><tr><th>${esc(S.columns.product)}</th><th>${esc(S.columns.asked)}</th>
<th>${esc(S.columns.issue)}</th><th>${esc(S.columns.takeFrom)}</th><th>✓</th></tr>
${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.asked}</td><td>${r.issue}</td><td>${r.take.map(esc).join("<br>")}</td><td></td></tr>`).join("")}
</table>`);
  w.document.close();
  w.print();
}

export function IssueForm({
  requisitionId,
  lines,
  witnesses,
  pickTitle,
}: {
  requisitionId: string;
  lines: readonly IssueLine[];
  witnesses: readonly WitnessOption[];
  pickTitle: string;
}) {
  const router = useRouter();
  const S = STORE.issue;
  const open = lines.filter((l) => !l.decided);
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(open.map((l) => [l.id, String(l.prefill)])),
  );
  const [why, setWhy] = useState<Record<string, string>>({});
  const [witness, setWitness] = useState<{ attestationId: string; at: string } | null>(null);
  const needsWitness = open.some((l) => l.controlled && Number(qty[l.id] ?? 0) > 0);
  const picking = open.some((l) => l.picked !== undefined);
  const unpicked = picking
    ? pickProblems(
        open.map((l) => ({ lineId: l.id, name: l.productName, quantity: Number(qty[l.id] ?? 0) })),
        new Set(open.filter((l) => l.picked).map((l) => l.id)),
      )
    : [];
  return (
    <div className="flex flex-col gap-4">
      <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
        <table className="text-body-s w-full">
          <thead className="bg-ink-50 text-left">
            <tr>
              <th scope="col" className="px-3 py-2">
                {S.columns.product}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {S.columns.asked}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {S.columns.held}
              </th>
              <th scope="col" className="px-3 py-2">
                {S.columns.takeFrom}
              </th>
              <th scope="col" className="px-3 py-2">
                {S.columns.issue}
              </th>
              <th scope="col" className="px-3 py-2">
                {S.columns.notIssued}
              </th>
              {picking ? (
                <th scope="col" className="px-3 py-2">
                  {CATALOGUE.picking.column}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {open.map((l) => {
              const n = Number(qty[l.id] ?? 0);
              const zero = n === 0;
              const takes = n > l.held ? [] : takeFrom(l.stock, n);
              return (
                <tr key={l.id} className="align-top">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.productName}</span>
                    {l.controlled ? (
                      <span className="text-caption block">{S.controlled}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.asked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.held}</td>
                  <td className="px-3 py-2">
                    {l.stock.length ? null : <span>{S.noBatch}</span>}
                    {takes.map((t) => (
                      <span key={t.batchNumber} className="block font-mono">
                        {S.take(t.batchNumber, t.expiry, t.take)}
                      </span>
                    ))}
                    {n > l.held ? (
                      <StatusWord tone="caution">{S.only(l.held, l.issueUnit)}</StatusWord>
                    ) : n && n < l.asked ? (
                      <span className="text-caption text-muted-foreground block">
                        {S.short(l.asked - n, l.issueUnit)}
                      </span>
                    ) : null}
                    {l.cold && n ? <span className="text-caption block">{S.cool}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={l.held}
                      inputMode="numeric"
                      value={qty[l.id] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                      aria-label={`${l.productName}, ${S.columns.issue} (${l.issueUnit})`}
                      className={`${TARGET} w-28`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {zero ? (
                      <Input
                        value={why[l.id] ?? ""}
                        maxLength={60}
                        onChange={(e) => setWhy((w) => ({ ...w, [l.id]: e.target.value }))}
                        aria-label={`${l.productName}, ${S.columns.notIssued}`}
                        className={TARGET}
                      />
                    ) : null}
                  </td>
                  {picking ? (
                    <td className="px-3 py-2">
                      <PickCell
                        requisitionId={requisitionId}
                        lineId={l.id}
                        productName={l.productName}
                        picked={l.picked ?? null}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {needsWitness ? (
        <StoreWitness
          witnesses={witnesses}
          action="controlled_transfer"
          witnessed={witness}
          onWitnessed={setWitness}
        />
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className={`${TARGET} self-start`}
        onClick={() =>
          printPickList(
            pickTitle,
            open.map((l) => {
              const n = Number(qty[l.id] ?? 0);
              return {
                name: l.productName,
                asked: l.asked,
                issue: n,
                take: takeFrom(l.stock, Math.min(n, l.held)).map((t) =>
                  S.take(t.batchNumber, t.expiry, t.take),
                ),
              };
            }),
          )
        }
      >
        {S.printPick}
      </Button>
      <ActButton
        label={S.issue}
        disabled={(needsWitness && !witness) || unpicked.length > 0}
        run={async () => {
          const r = await actions.issueRequisition({
            requisitionId,
            lines: open.map((l) => ({
              lineId: l.id,
              quantity: Number(qty[l.id] ?? 0),
              notIssuedReason: why[l.id]?.trim() || null,
            })),
            witnessAttestationId: witness?.attestationId ?? null,
          });
          if (r.ok) router.refresh();
          return r;
        }}
      />
      {unpicked.map((u) => (
        <p key={u.lineId} className="text-caption text-muted-foreground">
          {u.words}
        </p>
      ))}
    </div>
  );
}

export function RefuseDialog({
  requisitionId,
  lineId,
  label,
}: {
  requisitionId: string;
  lineId?: string;
  label: string;
}) {
  const id = useId();
  return (
    <StoreDialog
      label={label}
      title={lineId ? STORE.issue.refuseLineTitle : STORE.issue.refuseTitle}
      submit={label}
      variant="ghost"
      onSave={(_k, d) =>
        actions.refuseRequisitionLine({
          requisitionId,
          lineId: lineId ?? null,
          reason: str(d, "reason"),
        })
      }
    >
      <Field label={STORE.issue.refuseReason} id={id}>
        <Input id={id} name="reason" required minLength={2} maxLength={60} className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

export function VoucherPrint({ requisitionId }: { requisitionId: string }) {
  return (
    <PrintButton
      label={STORE.issue.printVoucher}
      section="voucher"
      log={(clientKey) => actions.printVoucher({ clientKey, requisitionId })}
    />
  );
}
