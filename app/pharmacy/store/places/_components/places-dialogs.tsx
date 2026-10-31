"use client";

import type { WitnessOption } from "./store-kit";
import { useId, useRef, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Input } from "@/components/ui/input";
import { COUNT_DIFFERENCE_REASONS } from "@/content/pharmacy-stock";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { LOCATION_KIND_WORDS, STORE } from "@/content/pharmacy-stores-store";
import SUPPLIERS from "@/data/pharmacy/suppliers.v1.json";
import { productByText } from "@/lib/pharmacy/stores/scan-fill";
import * as actions from "../../actions";
import {
  expiryForField,
  Field,
  ScanField,
  SELECT,
  StoreDialog,
  StoreWitness,
  str,
  TARGET,
} from "./store-kit";

const P = STORE.places;
const C = STORE.count;

/* ─── Places ──────────────────────────────────────────────────────────── */

export function AddPlaceDialog({
  units,
  wards,
  carts,
}: {
  units: readonly { id: string; name: string }[];
  wards: readonly { id: string; name: string }[];
  carts: readonly { id: string; name: string }[];
}) {
  const ids = {
    kind: useId(),
    name: useId(),
    unit: useId(),
    ward: useId(),
    cart: useId(),
    model: useId(),
  };
  const [kind, setKind] = useState<"store" | "ward" | "cart" | "quarantine">("store");
  return (
    <StoreDialog
      label={P.add}
      title={P.addTitle}
      submit={P.save}
      variant="primary"
      description={P.pointNote}
      onSave={(clientKey, d) =>
        actions.createLocation({
          clientKey,
          kind,
          name: str(d, "name"),
          departmentId: str(d, "departmentId") || null,
          wardId: str(d, "wardId") || null,
          crashCartId: str(d, "crashCartId") || null,
          wardSupplyModel: str(d, "wardSupplyModel") || null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={P.kind} id={ids.kind}>
          <select
            id={ids.kind}
            className={SELECT}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {(["store", "quarantine", "ward", "cart"] as const).map((k) => (
              <option key={k} value={k}>
                {LOCATION_KIND_WORDS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={P.name} id={ids.name}>
          <Input id={ids.name} name="name" required maxLength={120} className={TARGET} />
        </Field>
        {kind === "store" || kind === "quarantine" ? (
          <Field label={P.unit} id={ids.unit}>
            <select
              id={ids.unit}
              name="departmentId"
              className={SELECT}
              defaultValue=""
              required={kind === "store"}
            >
              <option value="">{kind === "store" ? P.unit : "—"}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {kind === "ward" ? (
          <>
            <Field label={P.ward} id={ids.ward}>
              <select id={ids.ward} name="wardId" className={SELECT} required defaultValue="">
                <option value="" disabled>
                  {P.ward}
                </option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={P.supplyModel} id={ids.model}>
              <select id={ids.model} name="wardSupplyModel" className={SELECT} defaultValue="">
                <option value="">{P.supplyModelUnset}</option>
                <option value="stocked">{P.supplyModels.stocked}</option>
                <option value="issue_only">{P.supplyModels.issue_only}</option>
              </select>
            </Field>
          </>
        ) : null}
        {kind === "cart" ? (
          <Field label={P.cart} id={ids.cart}>
            <select id={ids.cart} name="crashCartId" className={SELECT} required defaultValue="">
              <option value="" disabled>
                {P.cart}
              </option>
              {carts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </StoreDialog>
  );
}

export function InChargeDialog({
  locationId,
  name,
  staff,
  current,
}: {
  locationId: string;
  name: string;
  staff: readonly { id: string; name: string }[];
  current: string | null;
}) {
  const id = useId();
  return (
    <StoreDialog
      label={P.setInCharge}
      title={`${P.setInCharge} · ${name}`}
      submit={P.save}
      onSave={(_k, d) =>
        actions.setLocationInCharge({ locationId, userId: str(d, "userId") || null })
      }
    >
      <Field label={P.inCharge} id={id}>
        <select id={id} name="userId" className={SELECT} defaultValue={current ?? ""}>
          <option value="">{P.noInCharge}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
    </StoreDialog>
  );
}

export function SupplyModelDialog({ locationId, name }: { locationId: string; name: string }) {
  const id = useId();
  return (
    <StoreDialog
      label={P.setModel}
      title={`${P.setModel} · ${name}`}
      submit={P.save}
      onSave={(_k, d) =>
        actions.setWardSupplyModel({
          locationId,
          model: str(d, "model") as "stocked" | "issue_only",
        })
      }
    >
      <Field label={P.supplyModel} id={id}>
        <select id={id} name="model" className={SELECT} required defaultValue="">
          <option value="" disabled>
            {P.supplyModelUnset}
          </option>
          <option value="stocked">{P.supplyModels.stocked}</option>
          <option value="issue_only">{P.supplyModels.issue_only}</option>
        </select>
      </Field>
    </StoreDialog>
  );
}

/* ─── Suppliers and facilities ────────────────────────────────────────── */

const REGIONS = ["uganda", "africa", "international"] as const;

/**
 * Add or edit a supplier or facility. Adding offers MedSync's sourced supplier list (`data/pharmacy/suppliers.v1.json`,
 * owner item 1) as one-click choices that fill the form; one already at this hospital (`added`, by name) shows as
 * added. Typing stays for anyone else. Saved by the same `saveCounterparty`.
 */
export function CounterpartyDialog({
  existing,
  added = [],
}: {
  existing?: {
    id: string;
    kind: "supplier" | "facility";
    name: string;
    code: string | null;
    takesReturns: boolean;
  };
  added?: readonly string[];
}) {
  const ids = { kind: useId(), name: useId(), code: useId() };
  const kindRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const have = new Set(added.map((n) => n.trim().toLowerCase()));
  const L = STOCK_UP_POLISH.suppliers;
  return (
    <StoreDialog
      label={existing ? P.editCounterparty : P.addCounterparty}
      title={existing ? `${P.editCounterparty} · ${existing.name}` : P.addCounterparty}
      submit={P.save}
      variant={existing ? "ghost" : "secondary"}
      onSave={(clientKey, d) =>
        actions.saveCounterparty({
          clientKey,
          id: existing?.id ?? null,
          kind: str(d, "kind"),
          name: str(d, "name"),
          code: str(d, "code") || null,
          takesReturns: d.get("takesReturns") === "on",
          retired: d.get("retired") === "on",
        })
      }
    >
      {existing ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-foreground">{L.fromList}</p>
          {REGIONS.map((region) => (
            <div key={region} className="flex flex-col gap-2">
              <p className="text-caption text-muted-foreground">{L.regions[region]}</p>
              <span className="flex flex-wrap gap-2">
                {SUPPLIERS.suppliers
                  .filter((s) => s.region === region)
                  .map((s) =>
                    have.has(s.name.toLowerCase()) ? (
                      <span
                        key={s.name}
                        className="border-border text-body-s text-muted-foreground inline-flex min-h-11 items-center gap-2 rounded-md border px-3"
                      >
                        {L.pick(s.name, s.shortName)}
                        <StatusWord>{L.added}</StatusWord>
                      </span>
                    ) : (
                      <button
                        key={s.name}
                        type="button"
                        className="border-border text-body-s text-foreground hover:bg-ink-50 min-h-11 rounded-md border px-3"
                        onClick={() => {
                          if (kindRef.current) kindRef.current.value = "supplier";
                          if (nameRef.current) nameRef.current.value = s.name;
                          if (codeRef.current) codeRef.current.value = s.shortName;
                          nameRef.current?.focus();
                        }}
                      >
                        {L.pick(s.name, s.shortName)}
                      </button>
                    ),
                  )}
              </span>
            </div>
          ))}
          <p className="text-caption text-muted-foreground">{L.orType}</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={P.counterpartyKind} id={ids.kind}>
          <select
            ref={kindRef}
            id={ids.kind}
            name="kind"
            className={SELECT}
            defaultValue={existing?.kind ?? "supplier"}
          >
            <option value="supplier">{P.counterpartyKinds.supplier}</option>
            <option value="facility">{P.counterpartyKinds.facility}</option>
          </select>
        </Field>
        <Field label={P.name} id={ids.name}>
          <Input
            ref={nameRef}
            id={ids.name}
            name="name"
            required
            maxLength={160}
            defaultValue={existing?.name}
            className={TARGET}
          />
        </Field>
        <Field label={P.code} id={ids.code}>
          <Input
            ref={codeRef}
            id={ids.code}
            name="code"
            maxLength={40}
            defaultValue={existing?.code ?? ""}
            className={TARGET}
          />
        </Field>
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" name="takesReturns" defaultChecked={existing?.takesReturns} />
          {P.takesReturns}
        </label>
        {existing ? (
          <label className="text-body-s inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" name="retired" />
            {P.retire}
          </label>
        ) : null}
      </div>
    </StoreDialog>
  );
}

/* ─── Counts (Law 5: no expected figure before the count is saved) ────── */

export interface CountBatch {
  id: string;
  productName: string;
  issueUnit: string;
  batchNumber: string;
  expiryText: string;
  controlled: boolean;
}

type CountLine = { batchId: string; batchNumber: string; counted: number; recorded: number };

export function StoreCountDialog({
  locationId,
  name,
  batches,
  witnesses,
}: {
  locationId: string;
  name: string;
  batches: readonly CountBatch[];
  witnesses: readonly WitnessOption[];
}) {
  const [result, setResult] = useState<{ countId: string; lines: CountLine[] } | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [witness, setWitness] = useState<{ attestationId: string; at: string } | null>(null);
  const differs = result?.lines.filter((l) => l.counted !== l.recorded) ?? [];
  const byId = new Map(batches.map((b) => [b.id, b]));
  const needsWitness = batches.some((b) => b.controlled);
  return (
    <StoreDialog
      label={P.count}
      title={C.title(name)}
      description={C.lede}
      submit={result ? C.record : C.submit}
      width="wide"
      done={!!result && (differs.length === 0 || recorded)}
      onOpen={() => {
        setResult(null);
        setRecorded(false);
        setWitness(null);
      }}
      onSave={async (clientKey, d) => {
        if (!result) {
          const r = await actions.recordStoreCount({
            step: "count",
            clientKey,
            locationId,
            lines: batches.map((b) => ({
              batchId: b.id,
              counted: Number(str(d, `count-${b.id}`)),
            })),
            witnessAttestationId: witness?.attestationId ?? null,
          });
          if (!r.ok) return r;
          setResult({ countId: r.id, lines: r.lines });
          return "stay";
        }
        const r = await actions.recordStoreCount({
          step: "reasons",
          countId: result.countId,
          corrections: differs.map((l) => ({
            batchId: l.batchId,
            reasonCode: str(d, `reason-${l.batchId}`),
            note: str(d, `note-${l.batchId}`) || null,
          })),
        });
        if (!r.ok) return r;
        setRecorded(true);
        return "stay";
      }}
    >
      {needsWitness && !result ? (
        <StoreWitness
          witnesses={witnesses}
          action="controlled_count"
          witnessed={witness}
          onWitnessed={setWitness}
        />
      ) : null}
      <div className="flex flex-col gap-3">
        {batches.length === 0 && !result ? (
          <p className="text-body-s text-muted-foreground">{C.nothing}</p>
        ) : null}
        {!result
          ? batches.map((b) => (
              <div key={b.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                <label htmlFor={`count-${b.id}`} className="text-body-s">
                  <span className="text-foreground font-medium">{b.productName}</span>{" "}
                  <span className="font-mono">
                    {b.batchNumber} · {b.expiryText}
                  </span>
                </label>
                <Input
                  id={`count-${b.id}`}
                  name={`count-${b.id}`}
                  type="number"
                  min={0}
                  required
                  inputMode="numeric"
                  aria-label={`${b.productName}, ${b.batchNumber}, quantity in ${b.issueUnit}`}
                  className={TARGET}
                />
              </div>
            ))
          : result.lines.map((l) => {
              const same = l.counted === l.recorded;
              return (
                <div key={l.batchId} className="flex flex-col gap-2">
                  <p className="text-body-s">
                    <span className="font-mono">{l.batchNumber}</span>
                    {byId.get(l.batchId) ? ` · ${byId.get(l.batchId)!.productName}` : ""}:{" "}
                    {same ? (
                      C.matched(l.counted)
                    ) : (
                      <StatusWord tone="caution">{C.differs(l.counted, l.recorded)}</StatusWord>
                    )}
                  </p>
                  {!same && !recorded ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label={C.reason} id={`reason-${l.batchId}`}>
                        <select
                          id={`reason-${l.batchId}`}
                          name={`reason-${l.batchId}`}
                          required
                          className={SELECT}
                          defaultValue=""
                        >
                          <option value="" disabled>
                            {C.reason}
                          </option>
                          {Object.entries(COUNT_DIFFERENCE_REASONS).map(([code, word]) => (
                            <option key={code} value={code}>
                              {word}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={C.note} id={`note-${l.batchId}`}>
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
    </StoreDialog>
  );
}

type OpeningRow = { key: string; productId: string; batchNumber: string; expiry: string };

/** 5.12: the store's opening count, before it goes live: product, batch, expiry and the figure, line by line. */
export function OpeningCountDialog({
  locationId,
  name,
  products,
  witnesses,
}: {
  locationId: string;
  name: string;
  products: readonly {
    id: string;
    name: string;
    issueUnit: string;
    gtin: string | null;
    active: boolean;
    controlled: boolean;
  }[];
  witnesses: readonly WitnessOption[];
}) {
  const blank = (): OpeningRow => ({
    key: crypto.randomUUID(),
    productId: "",
    batchNumber: "",
    expiry: "",
  });
  const [rows, setRows] = useState<OpeningRow[]>([blank()]);
  const [witness, setWitness] = useState<{ attestationId: string; at: string } | null>(null);
  const set = (key: string, patch: Partial<OpeningRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const anyControlled = rows.some((r) => products.find((p) => p.id === r.productId)?.controlled);
  return (
    <StoreDialog
      label={P.opening}
      title={C.openingTitle(name)}
      description={C.openingLede}
      submit={C.submit}
      width="xl"
      onOpen={() => {
        setRows([blank()]);
        setWitness(null);
      }}
      onSave={(clientKey, d) =>
        actions.recordStoreCount({
          step: "opening",
          clientKey,
          locationId,
          lines: rows.map((r) => ({
            productId: r.productId,
            batchNumber: r.batchNumber,
            expiry: r.expiry,
            counted: Number(str(d, `counted-${r.key}`)),
          })),
          witnessAttestationId: witness?.attestationId ?? null,
        })
      }
    >
      {anyControlled ? (
        <StoreWitness
          witnesses={witnesses}
          action="controlled_count"
          witnessed={witness}
          onWitnessed={setWitness}
        />
      ) : null}
      {rows.map((r, i) => (
        <fieldset
          key={r.key}
          className="border-border grid gap-3 rounded-md border p-3 sm:grid-cols-5"
        >
          <legend className="text-caption px-1">{`${STORE.issues.line} ${i + 1}`}</legend>
          <div className="sm:col-span-5">
            <ScanField
              products={products}
              onRead={(o) => {
                if (o.kind === "gs1")
                  set(r.key, {
                    productId: o.productId ?? r.productId,
                    batchNumber: o.scan.batch ?? r.batchNumber,
                    expiry: o.scan.expiry ? expiryForField(o.scan) : r.expiry,
                  });
                else if (o.kind === "text") {
                  const hit = productByText(products, o.text);
                  if (hit) set(r.key, { productId: hit });
                }
              }}
            />
          </div>
          <Field label={C.product} id={`p-${r.key}`}>
            <select
              id={`p-${r.key}`}
              className={SELECT}
              required
              value={r.productId}
              onChange={(e) => set(r.key, { productId: e.target.value })}
            >
              <option value="" disabled>
                {C.product}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={C.batch} id={`b-${r.key}`}>
            <Input
              id={`b-${r.key}`}
              required
              maxLength={60}
              value={r.batchNumber}
              onChange={(e) => set(r.key, { batchNumber: e.target.value })}
              className={TARGET}
            />
          </Field>
          <Field label={C.expiry} id={`e-${r.key}`}>
            <Input
              id={`e-${r.key}`}
              required
              inputMode="numeric"
              placeholder="2027-03"
              value={r.expiry}
              onChange={(e) => set(r.key, { expiry: e.target.value })}
              className={TARGET}
            />
          </Field>
          <Field label={C.counted} id={`c-${r.key}`}>
            <Input
              id={`c-${r.key}`}
              name={`counted-${r.key}`}
              type="number"
              min={0}
              required
              inputMode="numeric"
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
      ))}
      <button
        type="button"
        className={`${TARGET} text-body-s text-primary self-start underline-offset-4 hover:underline`}
        onClick={() => setRows((rs) => [...rs, blank()])}
      >
        {C.addLine}
      </button>
    </StoreDialog>
  );
}
