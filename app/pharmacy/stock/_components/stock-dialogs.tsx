"use client";

import type { StockResult } from "@/lib/pharmacy/stock/store";
import type { FormEvent, ReactNode } from "react";
import { useId, useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ADJUSTMENT_REASONS,
  COUNT_DIFFERENCE_REASONS,
  DELIVERY_FROM,
  STOCK,
} from "@/content/pharmacy-stock";
import * as actions from "../actions";

/**
 * The stock dialogs (5.8, wireframe §8.2): each a centred EditorDialog (ADR 0161) opened by its own
 * button, which takes focus back on close. Every quantity field is named by the medicine and the
 * issue unit (Section 10). The count dialog carries no expected figure: the record is shown only in
 * the server's answer after the count is saved (SL-6). A new client key is drawn each time a dialog
 * opens, so a retried save finds its own row.
 */

export interface DialogBatch {
  id: string;
  productId: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryText: string;
  issueUnit: string;
}
export interface DialogProduct {
  id: string;
  medicineName: string;
  name: string;
  issueUnit: string;
}

const TARGET = "min-h-11";
const FIELD = "flex flex-col";
const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";

const newKey = () => crypto.randomUUID();

/** One dialog: its button, its form, the server's refusal in words, Cancel and the one action. */
function StockDialog({
  label,
  title,
  description,
  submit,
  variant = "secondary",
  width = "medium",
  onOpen,
  onSave,
  done,
  children,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "ghost";
  width?: "medium" | "wide";
  onOpen?: () => void;
  /** Returns the result; true keeps the dialog open (a count's second step). */
  onSave: (key: string, data: FormData) => Promise<StockResult<unknown> | "stay">;
  done?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorId = useId();
  const change = (next: boolean) => {
    if (next) {
      setKey(newKey());
      setError(null);
      onOpen?.();
    }
    setOpen(next);
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await onSave(key, data);
      if (r === "stay") return;
      if (r.ok) setOpen(false);
      else setError(r.error);
    });
  };
  return (
    <EditorDialog
      width={width}
      open={open}
      onOpenChange={change}
      trigger={
        <DialogTrigger render={<Button variant={variant} className={TARGET} />}>
          {label}
        </DialogTrigger>
      }
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col" aria-describedby={errorId}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {children}
          <p id={errorId} role="status" className="empty:hidden">
            {error ? (
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {error}
              </StatusWord>
            ) : null}
          </p>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            onClick={() => setOpen(false)}
          >
            {done ? STOCK.count.done : STOCK.actions.cancel}
          </Button>
          {done ? null : (
            <Button type="submit" className={TARGET} disabled={pending}>
              {submit}
            </Button>
          )}
        </SheetFooter>
      </form>
    </EditorDialog>
  );
}

function Field({ label, children, id }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className={FIELD}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** Expiry as a day, or as the month the pack gives (stored as the month; SL-5). */
function ExpiryField({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const id = useId();
  const [month, setMonth] = useState(defaultValue ? defaultValue.length === 7 : false);
  return (
    <div className={FIELD}>
      <Label htmlFor={id}>{STOCK.receive.expiry}</Label>
      <Input
        id={id}
        name={name}
        type={month ? "month" : "date"}
        required
        defaultValue={defaultValue}
        className={TARGET}
      />
      <label className="text-body-s mt-2 inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={month} onChange={(e) => setMonth(e.target.checked)} />
        {STOCK.receive.monthOnly}
      </label>
    </div>
  );
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => Number(str(f, k));

/* ─── Receive stock ───────────────────────────────────────────────────── */

type ReceiveFields = {
  clientKey: string;
  productId: string;
  batchNumber: string;
  expiry: string;
  quantity: number;
  from: string;
  deliveryRef: string;
};

/**
 * 5.8 Receive stock. The Controlled drugs page passes its own `save` (the witnessed receipt, CD-5) and
 * the witness block as `before`, rendered first.
 */
export function ReceiveDialog({
  products,
  title = STOCK.receive.title,
  save = actions.receiveStock,
  before,
  from = Object.keys(DELIVERY_FROM) as (keyof typeof DELIVERY_FROM)[],
}: {
  products: DialogProduct[];
  title?: string;
  save?: (input: ReceiveFields) => Promise<StockResult<unknown>>;
  before?: ReactNode;
  /** Phase 2 Law 3 (S17a): the sources still offered here (`deliveryFromOffered`); every one by default. */
  from?: readonly (keyof typeof DELIVERY_FROM)[];
}) {
  const ids = { product: useId(), batch: useId(), qty: useId(), ref: useId() };
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  return (
    <StockDialog
      label={STOCK.actions.receive}
      title={title}
      submit={STOCK.receive.submit}
      variant="primary"
      onSave={async (clientKey, d) => {
        return save({
          clientKey,
          productId,
          batchNumber: str(d, "batchNumber"),
          expiry: str(d, "expiry"),
          quantity: int(d, "quantity"),
          from: str(d, "from"),
          deliveryRef: str(d, "deliveryRef"),
        });
      }}
    >
      {before}
      <div className="grid gap-4 sm:grid-cols-2">
        {products.length === 0 ? (
          <p className="text-body-s text-muted-foreground sm:col-span-2">
            {STOCK.receive.noProduct}
          </p>
        ) : (
          <Field label={STOCK.receive.product} id={ids.product}>
            <select
              id={ids.product}
              className={SELECT}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.medicineName} · {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={STOCK.receive.batch} id={ids.batch}>
          <Input id={ids.batch} name="batchNumber" required maxLength={60} className={TARGET} />
        </Field>
        <ExpiryField name="expiry" />
        <Field
          label={
            product
              ? STOCK.receive.quantity(product.medicineName, product.issueUnit)
              : STOCK.transfer.quantity
          }
          id={ids.qty}
        >
          <Input id={ids.qty} name="quantity" type="number" min={1} required className={TARGET} />
        </Field>
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-ink-700 text-caption mb-1.5 font-medium">
            {STOCK.receive.from}
          </legend>
          {from
            .map((code) => [code, DELIVERY_FROM[code]] as const)
            .map(([code, word], i) => (
              <label key={code} className="text-body-s inline-flex min-h-11 items-center gap-2">
                <input type="radio" name="from" value={code} defaultChecked={i === 0} required />
                {word}
              </label>
            ))}
        </fieldset>
        <Field label={STOCK.receive.ref} id={ids.ref}>
          <Input id={ids.ref} name="deliveryRef" maxLength={120} className={TARGET} />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Count (blind) ───────────────────────────────────────────────────── */

type CountLine = { batchId: string; batchNumber: string; counted: number; recorded: number };

export function CountDialog({
  label,
  what,
  medicineId,
  batches,
}: {
  label: string;
  what: string;
  medicineId: string | null;
  batches: DialogBatch[];
}) {
  const [result, setResult] = useState<{ countId: string; lines: CountLine[] } | null>(null);
  const [recorded, setRecorded] = useState(false);
  const differs = result?.lines.filter((l) => l.counted !== l.recorded) ?? [];
  const byId = new Map(batches.map((b) => [b.id, b]));
  return (
    <StockDialog
      label={label}
      title={STOCK.count.title(what)}
      description={STOCK.count.lede}
      submit={result ? STOCK.count.record : STOCK.count.submit}
      width="wide"
      done={!!result && (differs.length === 0 || recorded)}
      onOpen={() => {
        setResult(null);
        setRecorded(false);
      }}
      onSave={async (clientKey, d) => {
        if (!result) {
          const r = await actions.recordCount({
            step: "count",
            clientKey,
            medicineId,
            lines: batches.map((b) => ({ batchId: b.id, counted: int(d, `count-${b.id}`) })),
          });
          if (!r.ok) return r;
          setResult({ countId: r.id, lines: (r.data as { lines: CountLine[] }).lines });
          return "stay";
        }
        const r = await actions.recordCount({
          step: "reasons",
          countId: result.countId,
          corrections: differs.map((l) => ({
            batchId: l.batchId,
            reasonCode: str(d, `reason-${l.batchId}`),
            note: str(d, `note-${l.batchId}`),
          })),
        });
        if (!r.ok) return r;
        setRecorded(true);
        return "stay";
      }}
    >
      <div className="flex flex-col gap-3">
        {batches.length === 0 && !result ? (
          <p className="text-body-s text-muted-foreground">{STOCK.count.nothing}</p>
        ) : null}
        {!result
          ? batches.map((b) => (
              <div key={b.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                <label htmlFor={`count-${b.id}`} className="text-body-s">
                  <span className="text-foreground font-medium">{b.medicineName}</span>{" "}
                  <span className="font-mono">
                    {STOCK.count.onShelf(b.batchNumber, b.expiryText)}
                  </span>
                </label>
                <Input
                  id={`count-${b.id}`}
                  name={`count-${b.id}`}
                  type="number"
                  min={0}
                  required
                  inputMode="numeric"
                  aria-label={`${b.medicineName}, ${b.batchNumber}, quantity in ${b.issueUnit}`}
                  className={TARGET}
                />
              </div>
            ))
          : result.lines.map((l) => {
              const b = byId.get(l.batchId);
              const same = l.counted === l.recorded;
              return (
                <div key={l.batchId} className="flex flex-col gap-2">
                  <p className="text-body-s">
                    <span className="font-mono">{l.batchNumber}</span>
                    {b ? ` · ${b.medicineName}` : ""}:{" "}
                    {same ? (
                      STOCK.matched(l.counted)
                    ) : (
                      <StatusWord tone="caution">{STOCK.differs(l.counted, l.recorded)}</StatusWord>
                    )}
                  </p>
                  {!same && !recorded ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label={STOCK.count.reason} id={`reason-${l.batchId}`}>
                        <select
                          id={`reason-${l.batchId}`}
                          name={`reason-${l.batchId}`}
                          required
                          className={SELECT}
                          defaultValue=""
                        >
                          <option value="" disabled>
                            {STOCK.count.reason}
                          </option>
                          {Object.entries(COUNT_DIFFERENCE_REASONS).map(([code, word]) => (
                            <option key={code} value={code}>
                              {word}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={STOCK.count.note} id={`note-${l.batchId}`}>
                        <Input
                          id={`note-${l.batchId}`}
                          name={`note-${l.batchId}`}
                          maxLength={500}
                          className={TARGET}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              );
            })}
      </div>
    </StockDialog>
  );
}

/** A count saved earlier whose difference still waits for its reason. */
export function DifferenceDialog({
  countId,
  batchId,
  batchNumber,
  counted,
  recorded,
}: {
  countId: string;
  batchId: string;
  batchNumber: string;
  counted: number;
  recorded: number;
}) {
  const id = useId();
  return (
    <StockDialog
      label={STOCK.count.record}
      title={STOCK.count.title(batchNumber)}
      description={STOCK.differs(counted, recorded)}
      submit={STOCK.count.record}
      onSave={async (_key, d) => {
        return actions.recordCount({
          step: "reasons",
          countId,
          corrections: [{ batchId, reasonCode: str(d, "reason"), note: str(d, "note") }],
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={STOCK.count.reason} id={id}>
          <select id={id} name="reason" required className={SELECT} defaultValue="">
            <option value="" disabled>
              {STOCK.count.reason}
            </option>
            {Object.entries(COUNT_DIFFERENCE_REASONS).map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </Field>
        <Field label={STOCK.count.note} id={`${id}-note`}>
          <Input id={`${id}-note`} name="note" maxLength={500} className={TARGET} />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Adjust ──────────────────────────────────────────────────────────── */

export function AdjustDialog({ what, batches }: { what: string; batches: DialogBatch[] }) {
  const ids = { batch: useId(), qty: useId(), note: useId() };
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const batch = batches.find((b) => b.id === batchId);
  return (
    <StockDialog
      label={STOCK.actions.adjust}
      title={STOCK.adjust.title(what)}
      description={STOCK.adjust.quantity}
      submit={STOCK.adjust.submit}
      onSave={async (clientKey, d) => {
        return actions.adjustStock({
          clientKey,
          batchId,
          quantity: int(d, "quantity"),
          reasonCode: str(d, "reasonCode") || undefined,
          note: str(d, "note"),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={STOCK.adjust.batch} id={ids.batch}>
          <select
            id={ids.batch}
            className={SELECT}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchNumber} · {b.expiryText}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            batch
              ? STOCK.receive.quantity(batch.medicineName, batch.issueUnit)
              : STOCK.transfer.quantity
          }
          id={ids.qty}
        >
          <Input id={ids.qty} name="quantity" type="number" required className={TARGET} />
        </Field>
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-ink-700 text-caption mb-1.5 font-medium">
            {STOCK.adjust.reason}
          </legend>
          {Object.entries(ADJUSTMENT_REASONS).map(([code, word]) => (
            <label key={code} className="text-body-s inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="reasonCode" value={code} required />
              {word}
            </label>
          ))}
        </fieldset>
        <Field label={STOCK.adjust.note} id={ids.note}>
          <Input id={ids.note} name="note" maxLength={500} className={TARGET} />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Send to another point ───────────────────────────────────────────── */

export function TransferDialog({
  batches,
  points,
  request,
  label = STOCK.actions.transfer,
}: {
  batches: DialogBatch[];
  points: { id: string; name: string }[];
  /** Sending for a request: its point and medicine are fixed. */
  request?: { id: string; fromPointId: string; quantity: number | null };
  label?: string;
}) {
  const ids = { batch: useId(), qty: useId(), to: useId() };
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const batch = batches.find((b) => b.id === batchId);
  return (
    <StockDialog
      label={label}
      title={STOCK.transfer.title}
      description={STOCK.transfer.together}
      submit={STOCK.transfer.submit}
      onSave={async (clientKey, d) => {
        return actions.transferStock({
          clientKey,
          batchId,
          quantity: int(d, "quantity"),
          toPointId: request?.fromPointId ?? str(d, "to"),
          requestId: request?.id,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={STOCK.transfer.batch} id={ids.batch}>
          <select
            id={ids.batch}
            className={SELECT}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.medicineName} · {b.batchNumber} · {b.expiryText}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            batch
              ? STOCK.receive.quantity(batch.medicineName, batch.issueUnit)
              : STOCK.transfer.quantity
          }
          id={ids.qty}
        >
          <Input
            id={ids.qty}
            name="quantity"
            type="number"
            min={1}
            required
            defaultValue={request?.quantity ?? undefined}
            className={TARGET}
          />
        </Field>
        {request ? null : (
          <Field label={STOCK.transfer.to} id={ids.to}>
            <select id={ids.to} name="to" required className={SELECT}>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </StockDialog>
  );
}

export function CloseRequestDialog({ requestId }: { requestId: string }) {
  const id = useId();
  return (
    <StockDialog
      label={STOCK.requests.close}
      title={STOCK.requests.closeTitle}
      submit={STOCK.requests.close}
      variant="ghost"
      onSave={async (_key, d) => actions.closeStockRequest({ requestId, reason: str(d, "reason") })}
    >
      <div>
        <Field label={STOCK.requests.closeReason} id={id}>
          <Input id={id} name="reason" required minLength={2} maxLength={200} className={TARGET} />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Correct batch details (manage) ──────────────────────────────────── */

export function CorrectDialog({
  batch,
}: {
  batch: { id: string; batchNumber: string; expiry: string; expiryMonthOnly: boolean };
}) {
  const ids = { batch: useId(), reason: useId() };
  return (
    <StockDialog
      label={STOCK.actions.correct}
      title={STOCK.correct.title(batch.batchNumber)}
      description={STOCK.correct.keeps}
      submit={STOCK.correct.submit}
      variant="ghost"
      onSave={async (clientKey, d) => {
        return actions.correctBatchDetails({
          clientKey,
          batchId: batch.id,
          batchNumber: str(d, "batchNumber"),
          expiry: str(d, "expiry"),
          reason: str(d, "reason"),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={STOCK.correct.batch} id={ids.batch}>
          <Input
            id={ids.batch}
            name="batchNumber"
            required
            maxLength={60}
            defaultValue={batch.batchNumber}
            className={TARGET}
          />
        </Field>
        <ExpiryField
          name="expiry"
          defaultValue={batch.expiryMonthOnly ? batch.expiry.slice(0, 7) : batch.expiry}
        />
        <Field label={STOCK.correct.reason} id={ids.reason}>
          <Input
            id={ids.reason}
            name="reason"
            required
            minLength={3}
            maxLength={300}
            className={TARGET}
          />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Products ────────────────────────────────────────────────────────── */

function ProductFields({ prefix = "" }: { prefix?: string }) {
  const ids = {
    name: useId(),
    manufacturer: useId(),
    strength: useId(),
    pack: useId(),
    unit: useId(),
    reg: useId(),
  };
  return (
    <>
      <Field label={STOCK.product.name} id={ids.name}>
        <Input
          id={ids.name}
          name={`${prefix}name`}
          required
          minLength={2}
          maxLength={160}
          className={TARGET}
        />
      </Field>
      <Field label={STOCK.product.strength} id={ids.strength}>
        <Input id={ids.strength} name={`${prefix}strength`} maxLength={80} className={TARGET} />
      </Field>
      <Field label={STOCK.product.packSize} id={ids.pack}>
        <Input id={ids.pack} name={`${prefix}packSize`} maxLength={80} className={TARGET} />
      </Field>
      <Field label={STOCK.product.issueUnit} id={ids.unit}>
        <Input
          id={ids.unit}
          name={`${prefix}issueUnit`}
          required
          maxLength={40}
          className={TARGET}
        />
      </Field>
      <Field label={STOCK.product.manufacturer} id={ids.manufacturer}>
        <Input
          id={ids.manufacturer}
          name={`${prefix}manufacturer`}
          maxLength={160}
          className={TARGET}
        />
      </Field>
      <Field label={STOCK.product.registration} id={ids.reg}>
        <Input
          id={ids.reg}
          name={`${prefix}registrationNumber`}
          maxLength={80}
          className={TARGET}
        />
      </Field>
    </>
  );
}

const productOf = (d: FormData, prefix = "") => ({
  name: str(d, `${prefix}name`),
  strength: str(d, `${prefix}strength`),
  packSize: str(d, `${prefix}packSize`),
  issueUnit: str(d, `${prefix}issueUnit`),
  manufacturer: str(d, `${prefix}manufacturer`),
  registrationNumber: str(d, `${prefix}registrationNumber`),
});

export function AddProductDialog({
  medicines,
  medicineId,
}: {
  /** The medicine list (CT-1). A controlled medicine's product is added here; it moves with a witness. */
  medicines?: { id: string; name: string }[];
  medicineId?: string;
}) {
  const id = useId();
  return (
    <StockDialog
      label={STOCK.actions.addProduct}
      title={STOCK.product.title}
      description={STOCK.product.unitLocks}
      submit={STOCK.product.submit}
      width="wide"
      onSave={async (clientKey, d) => {
        return actions.addProduct({
          clientKey,
          medicineId: medicineId ?? str(d, "medicineId"),
          ...productOf(d),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {medicineId ? null : (
          <Field label={STOCK.product.medicine} id={id}>
            <select id={id} name="medicineId" required className={SELECT} defaultValue="">
              <option value="" disabled>
                {STOCK.product.medicine}
              </option>
              {medicines?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ProductFields />
      </div>
    </StockDialog>
  );
}

/** 5.3.1: a batch found on the shelf; with no product here, the product is added with it. */
export function FoundDialog({
  what,
  medicineId,
  products,
}: {
  what: string;
  medicineId: string;
  products: DialogProduct[];
}) {
  const ids = { product: useId(), batch: useId(), qty: useId(), reason: useId() };
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  return (
    <StockDialog
      label={STOCK.actions.found}
      title={STOCK.found.title(what)}
      description={products.length ? undefined : STOCK.found.newProduct}
      submit={STOCK.found.submit}
      width="wide"
      onSave={async (clientKey, d) => {
        const common = {
          clientKey,
          batchNumber: str(d, "batchNumber"),
          expiry: str(d, "expiry"),
          quantity: int(d, "quantity"),
          reason: str(d, "reason"),
        };
        return actions.addBatchFoundOnShelf(
          products.length
            ? { ...common, productId }
            : { ...common, newProduct: { medicineId, ...productOf(d, "p-") } },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {products.length ? (
          <Field label={STOCK.receive.product} id={ids.product}>
            <select
              id={ids.product}
              className={SELECT}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <ProductFields prefix="p-" />
        )}
        <Field label={STOCK.receive.batch} id={ids.batch}>
          <Input id={ids.batch} name="batchNumber" required maxLength={60} className={TARGET} />
        </Field>
        <ExpiryField name="expiry" />
        <Field
          label={STOCK.receive.quantity(what, product?.issueUnit ?? STOCK.found.unknownUnit)}
          id={ids.qty}
        >
          <Input id={ids.qty} name="quantity" type="number" min={1} required className={TARGET} />
        </Field>
        <Field label={STOCK.found.reason} id={ids.reason}>
          <Input
            id={ids.reason}
            name="reason"
            required
            minLength={3}
            maxLength={500}
            className={TARGET}
          />
        </Field>
      </div>
    </StockDialog>
  );
}

/* ─── Reorder level (manage) ──────────────────────────────────────────── */

export function LevelDialog({
  what,
  medicineId,
  unit,
  current,
}: {
  what: string;
  medicineId: string;
  unit: string;
  current: number | null;
}) {
  const id = useId();
  return (
    <StockDialog
      label={STOCK.actions.setLevel}
      title={STOCK.level.title(what)}
      description={`${STOCK.level.clear} ${STOCK.noLevelNeverLow}`}
      submit={STOCK.level.submit}
      onSave={async (clientKey, d) => {
        const raw = str(d, "level");
        return actions.setReorderLevel({
          clientKey,
          medicineId,
          level: raw === "" ? null : Number(raw),
        });
      }}
    >
      <div>
        <Field label={`${what}, ${STOCK.level.field(unit)}`} id={id}>
          <Input
            id={id}
            name="level"
            type="number"
            min={0}
            defaultValue={current ?? undefined}
            className={TARGET}
          />
        </Field>
      </div>
    </StockDialog>
  );
}
