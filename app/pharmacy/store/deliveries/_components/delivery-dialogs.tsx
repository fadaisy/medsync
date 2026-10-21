"use client";

import type { WitnessOption } from "../../places/_components/store-kit";
import type { DeliveryLineView } from "@/lib/pharmacy/stores/store-read";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  REJECT_REASONS,
  SHORT_DATED_DECISIONS,
  STORE,
  STORES_B,
} from "@/content/pharmacy-stores-store";
import { productByText } from "@/lib/pharmacy/stores/scan-fill";
import * as places from "../../actions";
import {
  ActButton,
  expiryForField,
  Field,
  num,
  PrintButton,
  Refusal,
  ScanField,
  SELECT,
  StoreDialog,
  StoreWitness,
  str,
  TARGET,
} from "../../places/_components/store-kit";
import * as actions from "../actions";

const D = STORE.delivery;

/* ─── Start a delivery (5.2) ──────────────────────────────────────────── */

export function StartDeliveryDialog({
  suppliers,
  places: receiving,
  orders,
}: {
  suppliers: readonly { id: string; name: string }[];
  places: readonly { id: string; name: string }[];
  orders: readonly { id: string; label: string }[];
}) {
  const router = useRouter();
  const S = STORE.deliveries;
  const ids = {
    supplier: useId(),
    note: useId(),
    order: useId(),
    arrived: useId(),
    at: useId(),
    witness: useId(),
    deliverer: useId(),
    vehicle: useId(),
  };
  return (
    <StoreDialog
      label={S.start}
      title={S.startTitle}
      submit={S.start}
      variant="primary"
      width="wide"
      disabled={!suppliers.length || !receiving.length}
      onSave={async (clientKey, d) => {
        const r = await actions.startDelivery({
          clientKey,
          supplierId: str(d, "supplierId"),
          noteNumber: str(d, "noteNumber"),
          orderId: str(d, "orderId") || null,
          arrivedAt: str(d, "arrivedAt"),
          locationId: str(d, "locationId"),
          witnessName: str(d, "witnessName") || null,
          delivererName: str(d, "delivererName") || null,
          vehicleRegistration: str(d, "vehicleRegistration") || null,
        });
        if (r.ok) router.push(`/pharmacy/store/deliveries/${r.id}`);
        return r;
      }}
    >
      {!suppliers.length ? <p className="text-body-s">{S.noSuppliers}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={S.supplier} id={ids.supplier}>
          <select id={ids.supplier} name="supplierId" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {S.supplier}
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={S.note} id={ids.note}>
          <Input id={ids.note} name="noteNumber" required maxLength={80} className={TARGET} />
        </Field>
        <Field label={S.order} id={ids.order}>
          <select id={ids.order} name="orderId" className={SELECT} defaultValue="">
            <option value="">{S.noOrder}</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={S.arrived} id={ids.arrived}>
          <Input
            id={ids.arrived}
            name="arrivedAt"
            required
            placeholder="2026-10-21 09:30"
            className={TARGET}
          />
        </Field>
        <Field label={S.receivingAt} id={ids.at}>
          <select
            id={ids.at}
            name="locationId"
            className={SELECT}
            required
            defaultValue={receiving[0]?.id ?? ""}
          >
            {receiving.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={S.witness} id={ids.witness}>
          <Input id={ids.witness} name="witnessName" maxLength={120} className={TARGET} />
        </Field>
        <Field label={S.deliverer} id={ids.deliverer}>
          <Input id={ids.deliverer} name="delivererName" maxLength={120} className={TARGET} />
        </Field>
        <Field label={S.vehicle} id={ids.vehicle}>
          <Input id={ids.vehicle} name="vehicleRegistration" maxLength={20} className={TARGET} />
        </Field>
      </div>
    </StoreDialog>
  );
}

/* ─── A line (RG-2, RG-3; 5.11 scanning) ───────────────────────────────── */

export interface LineProduct {
  id: string;
  name: string;
  issueUnit: string;
  gtin: string | null;
  active: boolean;
}

export function LineDialog({
  deliveryId,
  lineNo,
  line,
  products,
  orderLines,
}: {
  deliveryId: string;
  lineNo: number;
  line?: DeliveryLineView;
  products: readonly LineProduct[];
  orderLines: readonly { id: string; productName: string }[];
}) {
  const ids = {
    product: useId(),
    noteProduct: useId(),
    order: useId(),
    note: useId(),
    accepted: useId(),
    kept: useId(),
    back: useId(),
    reason: useId(),
    batch: useId(),
    expiry: useId(),
    cost: useId(),
  };
  const [productId, setProductId] = useState(line?.productId ?? "");
  const [batch, setBatch] = useState(line?.batchNumber ?? "");
  const [expiry, setExpiry] = useState(line ? expiryForField(line) : "");
  const [gtin, setGtin] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId);
  const unit = product?.issueUnit ?? "";
  return (
    <StoreDialog
      label={line ? D.editLine : D.addLine}
      title={line ? `${D.editLine} · ${STORE.issues.line} ${lineNo}` : D.addLine}
      description={STORES_B.onlyCounted}
      submit={D.saveLine}
      variant={line ? "ghost" : "secondary"}
      width="wide"
      onOpen={() => {
        setProductId(line?.productId ?? "");
        setBatch(line?.batchNumber ?? "");
        setExpiry(line ? expiryForField(line) : "");
        setGtin(null);
        setLinked(null);
      }}
      onSave={(_k, d) =>
        actions.saveDeliveryLine({
          deliveryId,
          lineNo,
          productId,
          noteProductId: str(d, "noteProductId") || null,
          orderLineId: str(d, "orderLineId") || null,
          noteQuantity: num(d, "noteQuantity"),
          accepted: num(d, "accepted") ?? 0,
          rejectedKept: num(d, "rejectedKept") ?? 0,
          rejectedReturned: num(d, "rejectedReturned") ?? 0,
          rejectReason: str(d, "rejectReason") || null,
          batchNumber: batch.trim() || null,
          expiry: expiry.trim() || null,
          unitCost: str(d, "unitCost") || null,
          shortDatedDecision: line?.shortDatedDecision ?? null,
        })
      }
    >
      <ScanField
        products={products}
        onRead={(o) => {
          if (o.kind === "gs1") {
            if (o.productId) setProductId(o.productId);
            if (o.scan.batch) setBatch(o.scan.batch);
            if (o.scan.expiry) setExpiry(expiryForField(o.scan));
            setGtin(o.productId ? null : o.scan.gtin);
          } else {
            const hit = productByText(products, o.text);
            if (hit) setProductId(hit);
          }
        }}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={D.product} id={ids.product}>
          <select
            id={ids.product}
            className={SELECT}
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="" disabled>
              {D.product}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={D.noteProduct} id={ids.noteProduct}>
          <select
            id={ids.noteProduct}
            name="noteProductId"
            className={SELECT}
            defaultValue={line?.noteProductId ?? ""}
          >
            <option value="">{D.sameProduct}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {orderLines.length ? (
          <Field label={D.orderLine} id={ids.order}>
            <select
              id={ids.order}
              name="orderLineId"
              className={SELECT}
              defaultValue={line?.orderLineId ?? ""}
            >
              <option value="">{STORE.deliveries.noOrder}</option>
              {orderLines.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.productName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={`${D.noteQty}${unit ? ` (${unit})` : ""}`} id={ids.note}>
          <Input
            id={ids.note}
            name="noteQuantity"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={line?.noteQuantity ?? ""}
            className={TARGET}
          />
        </Field>
        <Field label={`${D.accepted}${unit ? ` (${unit})` : ""}`} id={ids.accepted}>
          <Input
            id={ids.accepted}
            name="accepted"
            type="number"
            min={0}
            required
            inputMode="numeric"
            defaultValue={line?.accepted ?? ""}
            className={TARGET}
          />
        </Field>
        <Field label={D.rejectedKept} id={ids.kept}>
          <Input
            id={ids.kept}
            name="rejectedKept"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={line?.rejectedKept || ""}
            className={TARGET}
          />
        </Field>
        <Field label={D.rejectedReturned} id={ids.back}>
          <Input
            id={ids.back}
            name="rejectedReturned"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={line?.rejectedReturned || ""}
            className={TARGET}
          />
        </Field>
        <Field label={D.rejectReason} id={ids.reason}>
          <select
            id={ids.reason}
            name="rejectReason"
            className={SELECT}
            defaultValue={line?.rejectReason ?? ""}
          >
            <option value="">—</option>
            {Object.entries(REJECT_REASONS).map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </Field>
        <Field label={D.batch} id={ids.batch}>
          <Input
            id={ids.batch}
            value={batch}
            maxLength={60}
            onChange={(e) => setBatch(e.target.value)}
            className={`${TARGET} font-mono`}
          />
        </Field>
        <Field label={D.expiry} id={ids.expiry}>
          <Input
            id={ids.expiry}
            value={expiry}
            inputMode="numeric"
            placeholder="2027-03"
            onChange={(e) => setExpiry(e.target.value)}
            className={TARGET}
          />
        </Field>
        <Field label={D.cost} id={ids.cost}>
          <Input
            id={ids.cost}
            name="unitCost"
            inputMode="decimal"
            defaultValue={line?.unitCost ?? ""}
            className={TARGET}
          />
        </Field>
      </div>
      {gtin && productId ? (
        linked ? (
          <p role="status" className="text-body-s">
            {STORE.scan.linked}
          </p>
        ) : (
          <ActButton
            label={STORE.scan.linkGtin}
            variant="secondary"
            run={async () => {
              const r = await places.setGtin({ productId, gtin });
              if (r.ok) setLinked(gtin);
              return r;
            }}
          />
        )
      ) : null}
    </StoreDialog>
  );
}

/** RG-4: the short-dated decision, recorded on its own. */
export function ShortDatedChoice({
  deliveryId,
  lineNo,
  current,
}: {
  deliveryId: string;
  lineNo: number;
  current: "accept" | "accept_tell" | "reject" | null;
}) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption">
        {D.shortDated}
      </label>
      <select
        id={id}
        className={SELECT}
        value={current ?? ""}
        onChange={async (e) => {
          const r = await actions.recordShortDatedDecision({
            deliveryId,
            lineNo,
            decision: e.target.value as "accept" | "accept_tell" | "reject",
          });
          if (!r.ok) return setError(r.error);
          setError(null);
          router.refresh();
        }}
      >
        <option value="" disabled>
          {D.decision}
        </option>
        {Object.entries(SHORT_DATED_DECISIONS).map(([code, word]) => (
          <option key={code} value={code}>
            {word}
          </option>
        ))}
      </select>
      <Refusal error={error} />
    </span>
  );
}

export function RemoveLine({ deliveryId, line }: { deliveryId: string; line: DeliveryLineView }) {
  return (
    <ActButton
      label={D.removeLine}
      variant="secondary"
      run={() =>
        actions.saveDeliveryLine({
          deliveryId,
          lineNo: line.lineNo,
          remove: true,
          productId: line.productId,
          accepted: 0,
          rejectedKept: 0,
          rejectedReturned: 0,
        })
      }
    />
  );
}

/* ─── Finish (5.2: "Add {n} lines to stock") ───────────────────────────── */

export function FinishDelivery({
  deliveryId,
  stockLines,
  controlledLines,
  witnesses,
}: {
  deliveryId: string;
  /** Lines that put something into stock (accepted or rejected-and-kept). */
  stockLines: number;
  controlledLines: readonly { lineNo: number; label: string }[];
  witnesses: readonly WitnessOption[];
}) {
  const router = useRouter();
  const [witnessed, setWitnessed] = useState<Record<number, { attestationId: string; at: string }>>(
    {},
  );
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {controlledLines.map((c) => (
        <div key={c.lineNo} className="border-border flex flex-col gap-2 rounded-md border p-3">
          <p className="text-body-s font-medium">
            {c.label} · {D.controlled}
          </p>
          <StoreWitness
            witnesses={witnesses}
            action="controlled_receipt"
            witnessed={witnessed[c.lineNo] ?? null}
            onWitnessed={(w) => setWitnessed((m) => ({ ...m, [c.lineNo]: w }))}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className={TARGET}
          onClick={() => {
            setSaved(true);
            router.push("/pharmacy/store/deliveries");
          }}
        >
          {D.saveLater}
        </Button>
        <ActButton
          label={D.addToStock(stockLines)}
          disabled={stockLines === 0 || controlledLines.some((c) => !witnessed[c.lineNo])}
          run={() =>
            actions.receiveDelivery({
              deliveryId,
              witnesses: Object.entries(witnessed).map(([lineNo, w]) => ({
                lineNo: Number(lineNo),
                attestationId: w.attestationId,
              })),
            })
          }
        />
      </div>
      {saved ? (
        <p role="status" className="text-body-s">
          {D.savedLater}
        </p>
      ) : null}
    </div>
  );
}

export function AbandonDialog({ deliveryId }: { deliveryId: string }) {
  const id = useId();
  return (
    <StoreDialog
      label={D.abandon}
      title={D.abandonTitle}
      submit={D.abandon}
      variant="ghost"
      onSave={(_k, d) => actions.abandonDelivery({ deliveryId, reason: str(d, "reason") })}
    >
      <Field label={D.abandonReason} id={id}>
        <Input id={id} name="reason" required minLength={3} maxLength={300} className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

export function DeliveryPrints({ deliveryId }: { deliveryId: string }) {
  return (
    <span className="flex flex-wrap gap-2">
      <PrintButton
        label={D.printReport}
        section="report"
        log={(clientKey) => actions.printDiscrepancyReport({ clientKey, deliveryId })}
      />
      <PrintButton
        label={D.printGrn}
        section="grn"
        log={(clientKey) => actions.printGrn({ clientKey, deliveryId })}
      />
    </span>
  );
}

export function ControlledNote() {
  return <StatusWord>{STORES_B.paperStillApplies}</StatusWord>;
}
