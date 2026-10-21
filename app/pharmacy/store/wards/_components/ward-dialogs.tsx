"use client";

import type { CountItem } from "../_lib/view";
import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { FormEvent, ReactNode } from "react";
import { useId, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

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
import { COUNT_DIFFERENCE_REASONS } from "@/content/pharmacy-stock";
import {
  CARTS,
  RECEIPT_DIFFERENCE_REASONS,
  RETURN_REASONS,
  STORES_B,
  SUPPLY_MODEL,
  WARDS,
} from "@/content/pharmacy-stores-wards";

/**
 * The ward stock dialogs and the blind count (5.3, 5.4, 5.5). Each pop-up is a centred EditorDialog
 * (ADR 0161). The server actions come in as props, so the pharmacy page and the nurse page share these
 * with their own actions and rights. Targets are 44 px (Section 10). A fresh client key is drawn each
 * time a dialog opens. Passwords and codes are emptied after every try and never kept.
 */

export type Act = (raw: unknown) => Promise<ActionResult<unknown>>;
export interface Person {
  userId: string;
  label: string;
}

export const TARGET = "min-h-11";
export const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";
const newKey = () => crypto.randomUUID();
const num = (d: FormData, k: string) => {
  const v = String(d.get(k) ?? "").trim();
  return v === "" ? null : Number(v);
};
const str = (d: FormData, k: string) => {
  const v = String(d.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export function Refusal({ error }: { error: string | null }) {
  return (
    <p role="status" className="empty:hidden">
      {error ? (
        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
          {error}
        </StatusWord>
      ) : null}
    </p>
  );
}

export function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** One dialog: its button, its form, the refusal in words, Cancel and the one action. */
export function ActionDialog({
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
  onSave: (key: string, data: FormData) => Promise<ActionResult<unknown> | "stay">;
  done?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
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
      if (r === "stay") return setError(null);
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
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {children}
          <Refusal error={error} />
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            onClick={() => setOpen(false)}
          >
            {done ? WARDS.count.back : "Cancel"}
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

/**
 * A second factor (D-PH2-23): the person types their own password and authenticator code. `self`: the
 * signed-in person; otherwise they choose their name from those who hold the right here.
 */
export function FactorBlock({
  locationId,
  role,
  self,
  people,
  attest,
  onDone,
  done,
  title,
}: {
  locationId: string;
  role: "pack_first" | "pack_second" | "cart_confirm" | "receipt";
  self: string | null;
  people: Person[];
  attest: Act;
  onDone: (attestationId: string, who: string) => void;
  done: string | null;
  title: string;
}) {
  const ids = { who: useId(), password: useId(), code: useId() };
  const [who, setWho] = useState(self ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done)
    return (
      <p role="status" className="text-body-s inline-flex items-center gap-1.5">
        <CheckIcon aria-hidden className="size-4" />
        {WARDS.sign.confirmed(done)}
      </p>
    );
  const confirm = () =>
    start(async () => {
      const r = await attest({
        clientKey: newKey(),
        locationId,
        role,
        personUserId: who,
        password,
        code,
      });
      setPassword("");
      setCode("");
      if (!r.ok) return setError(r.error);
      setError(null);
      onDone(r.id, self ? WARDS.factor.done : (people.find((p) => p.userId === who)?.label ?? ""));
    });
  return (
    <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
      <legend className="text-label px-1">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {self ? null : (
          <Field label={WARDS.sign.person} id={ids.who}>
            <select
              id={ids.who}
              className={SELECT}
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value="" disabled>
                {WARDS.add.choose}
              </option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={WARDS.sign.password} id={ids.password}>
          <Input
            id={ids.password}
            type="password"
            autoComplete="off"
            value={password}
            maxLength={200}
            onChange={(e) => setPassword(e.target.value)}
            className={TARGET}
          />
        </Field>
        <Field label={WARDS.sign.code} id={ids.code}>
          <Input
            id={ids.code}
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-11 font-mono tabular-nums"
          />
        </Field>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          className={TARGET}
          disabled={pending || !who}
          onClick={confirm}
        >
          {WARDS.sign.confirm}
        </Button>
      </div>
      <Refusal error={error} />
    </fieldset>
  );
}

/* ─── Places ──────────────────────────────────────────────────────────── */

export function AddPlaceDialog({
  kind,
  hubs,
  action,
}: {
  kind: "ward" | "cart";
  hubs: { id: string; name: string }[];
  action: Act;
}) {
  const id = useId();
  return (
    <ActionDialog
      label={kind === "ward" ? WARDS.add.ward : WARDS.add.cart}
      title={kind === "ward" ? WARDS.add.ward : WARDS.add.cart}
      submit={WARDS.add.save}
      onSave={(clientKey, d) => {
        const hub = str(d, "hub");
        const name = hubs.find((h) => h.id === hub)?.name ?? "";
        return action(
          kind === "ward"
            ? {
                kind,
                clientKey,
                name,
                wardId: hub,
                wardSupplyModel: str(d, "model"),
                anyNurseConfirms: d.get("anyNurse") === "on",
              }
            : { kind, clientKey, name, crashCartId: hub },
        );
      }}
    >
      {hubs.length === 0 ? (
        <p className="text-body-s">{kind === "ward" ? WARDS.add.none : WARDS.add.noCarts}</p>
      ) : (
        <Field label={kind === "ward" ? WARDS.add.wardField : WARDS.add.cartField} id={id}>
          <select id={id} name="hub" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              {WARDS.add.choose}
            </option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === "ward" ? <SupplyFields model={null} anyNurse={false} /> : null}
    </ActionDialog>
  );
}

/** D-PH2-05: no model is pre-chosen; D-PH2-04: any nurse confirms only when the site allows. */
function SupplyFields({ model, anyNurse }: { model: string | null; anyNurse: boolean }) {
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-label mb-1">{WARDS.add.model}</legend>
        {Object.entries(SUPPLY_MODEL).map(([k, w]) => (
          <label key={k} className="text-body-s inline-flex min-h-11 items-center gap-2">
            <input type="radio" name="model" value={k} required defaultChecked={model === k} />
            {w}
          </label>
        ))}
      </fieldset>
      <label className="text-body-s inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" name="anyNurse" defaultChecked={anyNurse} />
        {WARDS.add.anyNurse}
      </label>
    </>
  );
}

export function SupplyDialog({
  locationId,
  model,
  anyNurse,
  action,
}: {
  locationId: string;
  model: string | null;
  anyNurse: boolean;
  action: Act;
}) {
  return (
    <ActionDialog
      label={WARDS.settings.open}
      title={WARDS.settings.title}
      submit={WARDS.settings.save}
      onSave={(_k, d) =>
        action({
          locationId,
          supplyModel: str(d, "model"),
          anyNurseConfirms: d.get("anyNurse") === "on",
        })
      }
    >
      <SupplyFields model={model} anyNurse={anyNurse} />
    </ActionDialog>
  );
}

/* ─── Packs: ward levels and cart lists (Appendix D) ──────────────────── */

export function PackDialog({
  kind,
  locationId,
  products,
  values,
  interval,
  names,
  action,
}: {
  kind: "ward_levels" | "cart_list";
  locationId: string;
  products: { id: string; name: string; issueUnit: string }[];
  values: Record<string, number>;
  interval?: number | null;
  names?: string[];
  action: Act;
}) {
  const W = kind === "ward_levels" ? WARDS.levels : null;
  const intervalId = useId();
  const namesId = useId();
  return (
    <ActionDialog
      label={W ? W.open : CARTS.list.open}
      title={W ? W.title : CARTS.list.title}
      description={W ? W.lede : CARTS.list.lede}
      submit={WARDS.levels.save}
      width="wide"
      onSave={(_k, d) => {
        const lines = products.flatMap((p) => {
          const n = num(d, `q-${p.id}`);
          return n === null ? [] : [{ productId: p.id, n }];
        });
        return kind === "ward_levels"
          ? action({
              locationId,
              levels: lines.map((l) => ({ productId: l.productId, level: l.n })),
            })
          : action({
              locationId,
              items: lines.map((l) => ({ productId: l.productId, quantity: l.n })),
              checkIntervalDays: num(d, "interval"),
              names: String(d.get("names") ?? "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((p) => (
          <Field
            key={p.id}
            label={W ? W.level(p.name, p.issueUnit) : CARTS.list.quantity(p.name, p.issueUnit)}
            id={`q-${p.id}`}
          >
            <Input
              id={`q-${p.id}`}
              name={`q-${p.id}`}
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={values[p.id] ?? ""}
              className={TARGET}
            />
          </Field>
        ))}
      </div>
      {kind === "cart_list" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={CARTS.list.interval} id={intervalId}>
            <Input
              id={intervalId}
              name="interval"
              type="number"
              min={1}
              required
              inputMode="numeric"
              defaultValue={interval ?? ""}
              className={TARGET}
            />
          </Field>
          <Field label={CARTS.list.names} id={namesId}>
            <textarea
              id={namesId}
              name="names"
              rows={3}
              defaultValue={(names ?? []).join("\n")}
              className="border-input bg-card text-body-s rounded-md border p-2.5"
            />
          </Field>
        </div>
      ) : null}
    </ActionDialog>
  );
}

/** Appendix D, D-PH2-22: the first signer and the second, each with their own factor, or the exception. */
export function SignDialog({
  packId,
  locationId,
  me,
  people,
  secondTitle,
  attest,
  sign,
}: {
  packId: string;
  locationId: string;
  me: string;
  people: Person[];
  secondTitle: string;
  attest: Act;
  sign: Act;
}) {
  const [first, setFirst] = useState<{ id: string; who: string } | null>(null);
  const [second, setSecond] = useState<{ id: string; who: string } | null>(null);
  const [exception, setException] = useState(false);
  return (
    <ActionDialog
      label={WARDS.sign.open}
      title={WARDS.sign.title}
      description={WARDS.sign.lede}
      submit={WARDS.sign.save}
      width="wide"
      onOpen={() => {
        setFirst(null);
        setSecond(null);
        setException(false);
      }}
      onSave={async () => {
        if (!first) return { ok: false, code: "invalid", error: WARDS.factor.lede };
        return sign({
          packId,
          firstAttestationId: first.id,
          secondAttestationId: exception ? null : (second?.id ?? null),
          exception,
        });
      }}
    >
      <FactorBlock
        locationId={locationId}
        role="pack_first"
        self={me}
        people={[]}
        attest={attest}
        title={WARDS.sign.first}
        done={first?.who ?? null}
        onDone={(id, who) => setFirst({ id, who })}
      />
      <label className="text-body-s inline-flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={exception}
          onChange={(e) => setException(e.target.checked)}
        />
        {WARDS.sign.useException}
      </label>
      {exception ? null : (
        <FactorBlock
          locationId={locationId}
          role="pack_second"
          self={null}
          people={people}
          attest={attest}
          title={secondTitle}
          done={second?.who ?? null}
          onDone={(id, who) => setSecond({ id, who })}
        />
      )}
    </ActionDialog>
  );
}

/* ─── The blind ward count (5.4, WS-3, S20b) ──────────────────────────── */

interface CountAnswer {
  id: string;
  products: { productId: string; name: string; used: number }[];
  surplus: { batchId: string; product: string; batchNumber: string; extra: number }[];
}

/**
 * The count screen: names, units and batches only (S20b). What MedSync held comes back only in the
 * server's answer, after the figures are committed. One figure per product is offered only when the
 * ward's allocation rule is signed, and never for a controlled product (D-PH2-07).
 */
export function WardCount({
  locationId,
  ward,
  items,
  allocationSigned,
  action,
}: {
  locationId: string;
  ward: string;
  items: CountItem[];
  allocationSigned: boolean;
  action: Act;
}) {
  const [key] = useState(newKey);
  const [perProduct, setPerProduct] = useState(false);
  const [answer, setAnswer] = useState<CountAnswer | null>(null);
  const [reasoned, setReasoned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const C = WARDS.count;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    start(async () => {
      if (!answer) {
        const lines = items.flatMap(
          (p): { productId: string; batchId: string | null; counted: number | null }[] =>
            perProduct && !p.controlled
              ? [{ productId: p.productId, batchId: null, counted: num(d, `p-${p.productId}`) }]
              : p.batches.map((b) => ({
                  productId: p.productId,
                  batchId: b.id,
                  counted: num(d, `b-${b.id}`),
                })),
        );
        const r = await action({ step: "count", clientKey: key, locationId, lines });
        if (!r.ok) return setError(r.error);
        setError(null);
        return setAnswer(r.data as CountAnswer);
      }
      const r = await action({
        step: "reasons",
        countId: answer.id,
        locationId,
        reasons: answer.surplus.map((s) => ({
          batchId: s.batchId,
          reasonCode: str(d, `r-${s.batchId}`),
          note: str(d, `n-${s.batchId}`),
        })),
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setReasoned(true);
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-heading-s text-foreground">{C.title(ward)}</h2>
      {!answer ? (
        <>
          <p className="text-body-s text-muted-foreground">{C.lede}</p>
          {items.length === 0 ? <p className="text-body-s">{C.nothing}</p> : null}
          {allocationSigned ? (
            <label className="text-body-s inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={perProduct}
                onChange={(e) => setPerProduct(e.target.checked)}
              />
              {C.perProduct}
            </label>
          ) : (
            <p className="text-caption text-muted-foreground">{C.perProductRefused}</p>
          )}
          <ul className="flex flex-col gap-4">
            {items.map((p) => (
              <li
                key={p.productId}
                className="border-border flex flex-col gap-2 rounded-md border p-3"
              >
                <p className="text-label text-foreground">{p.name}</p>
                {p.controlled ? (
                  <p className="text-caption text-muted-foreground">{C.controlledPerBatch}</p>
                ) : null}
                {perProduct && !p.controlled ? (
                  <Field label={C.product(p.issueUnit)} id={`p-${p.productId}`}>
                    <Input
                      id={`p-${p.productId}`}
                      name={`p-${p.productId}`}
                      type="number"
                      min={0}
                      required
                      inputMode="numeric"
                      className={`${TARGET} sm:w-40`}
                    />
                  </Field>
                ) : (
                  p.batches.map((b) => (
                    <div key={b.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                      <label htmlFor={`b-${b.id}`} className="text-body-s font-mono">
                        {C.batch(b.batchNumber, b.expiryText)}
                      </label>
                      <Input
                        id={`b-${b.id}`}
                        name={`b-${b.id}`}
                        type="number"
                        min={0}
                        required
                        inputMode="numeric"
                        aria-label={`${p.name}, ${b.batchNumber}, quantity in ${p.issueUnit}`}
                        className={TARGET}
                      />
                    </div>
                  ))
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-body-s inline-flex items-center gap-1.5">
            <CheckIcon aria-hidden className="size-4" />
            {C.saved}
          </p>
          <ul className="text-body-s flex flex-col gap-1">
            {answer.products.map((p) => (
              <li key={p.productId}>{p.used > 0 ? C.used(p.name, p.used) : C.same(p.name)}</li>
            ))}
          </ul>
          {answer.surplus.map((s) =>
            reasoned ? null : (
              <div key={s.batchId} className="flex flex-col gap-2">
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {`${s.product}, batch ${s.batchNumber}: ${STORES_B.moreThanIssued}`}
                </StatusWord>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={C.reason} id={`r-${s.batchId}`}>
                    <select
                      id={`r-${s.batchId}`}
                      name={`r-${s.batchId}`}
                      required
                      defaultValue=""
                      className={SELECT}
                    >
                      <option value="" disabled>
                        {C.reason}
                      </option>
                      {Object.entries(COUNT_DIFFERENCE_REASONS).map(([k, w]) => (
                        <option key={k} value={k}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={C.note} id={`n-${s.batchId}`}>
                    <Input
                      id={`n-${s.batchId}`}
                      name={`n-${s.batchId}`}
                      maxLength={500}
                      className={TARGET}
                    />
                  </Field>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <Refusal error={error} />
      {!answer || (answer.surplus.length > 0 && !reasoned) ? (
        <div>
          <Button type="submit" className={TARGET} disabled={pending || items.length === 0}>
            {answer ? C.reasons : C.save}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/* ─── Requisition, receipt, return ────────────────────────────────────── */

export function RequisitionDialog({
  locationId,
  lines,
  issuers,
  action,
}: {
  locationId: string;
  lines: { productId: string; name: string; issueUnit: string; suggested: number | null }[];
  issuers: { id: string; name: string }[];
  action: Act;
}) {
  const fromId = useId();
  const R = WARDS.requisition;
  return (
    <ActionDialog
      label={R.open}
      title={R.title}
      description={R.lede}
      submit={R.save}
      width="wide"
      onSave={async (clientKey, d) => {
        const asked = lines.flatMap((l) => {
          const n = num(d, `a-${l.productId}`);
          return n && n > 0 ? [{ productId: l.productId, quantity: n }] : [];
        });
        if (!asked.length) return { ok: false, code: "invalid", error: R.empty };
        return action({ clientKey, locationId, issuingLocationId: str(d, "from"), lines: asked });
      }}
    >
      <Field label={R.from} id={fromId}>
        <select id={fromId} name="from" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            {WARDS.add.choose}
          </option>
          {issuers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((l) => (
          <Field key={l.productId} label={R.line(l.name, l.issueUnit)} id={`a-${l.productId}`}>
            <Input
              id={`a-${l.productId}`}
              name={`a-${l.productId}`}
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={l.suggested && l.suggested > 0 ? l.suggested : ""}
              className={TARGET}
            />
          </Field>
        ))}
      </div>
    </ActionDialog>
  );
}

export function ReceiptDialog({
  locationId,
  issue,
  me,
  attest,
  confirm,
}: {
  locationId: string;
  issue: {
    id: string;
    lines: {
      batchId: string;
      productName: string;
      issueUnit: string;
      batchNumber: string;
      quantity: number;
      controlled: boolean;
    }[];
  };
  me: string;
  attest: Act;
  confirm: Act;
}) {
  const [factor, setFactor] = useState<string | null>(null);
  const reasonId = useId();
  const R = WARDS.receipts;
  return (
    <ActionDialog
      label={R.confirm}
      title={R.titleOne}
      description={R.lede}
      submit={R.save}
      width="wide"
      onOpen={() => setFactor(null)}
      onSave={async (_k, d) => {
        if (!factor) return { ok: false, code: "invalid", error: WARDS.factor.lede };
        return confirm({
          issueId: issue.id,
          locationId,
          attestationId: factor,
          lines: issue.lines.map((l) => ({
            batchId: l.batchId,
            arrived: num(d, `x-${l.batchId}`),
          })),
          reasonCode: str(d, "reason"),
        });
      }}
    >
      {issue.lines.some((l) => l.controlled) ? <p className="text-body-s">{R.controlled}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {issue.lines.map((l) => (
          <Field
            key={l.batchId}
            label={R.arrived(l.productName, l.batchNumber, l.issueUnit)}
            id={`x-${l.batchId}`}
          >
            <Input
              id={`x-${l.batchId}`}
              name={`x-${l.batchId}`}
              type="number"
              min={0}
              required
              inputMode="numeric"
              defaultValue={l.quantity}
              className={TARGET}
            />
          </Field>
        ))}
      </div>
      <Field label={R.reason} id={reasonId}>
        <select id={reasonId} name="reason" defaultValue="" className={SELECT}>
          <option value="">—</option>
          {Object.entries(RECEIPT_DIFFERENCE_REASONS).map(([k, w]) => (
            <option key={k} value={k}>
              {w}
            </option>
          ))}
        </select>
      </Field>
      <FactorBlock
        locationId={locationId}
        role="receipt"
        self={me}
        people={[]}
        attest={attest}
        title={WARDS.factor.title}
        done={factor ? WARDS.factor.done : null}
        onDone={(id) => setFactor(id)}
      />
    </ActionDialog>
  );
}

export function ReturnDialog({
  locationId,
  batches,
  issuers,
  action,
}: {
  locationId: string;
  batches: { id: string; label: string }[];
  issuers: { id: string; name: string }[];
  action: Act;
}) {
  const ids = { to: useId(), batch: useId(), qty: useId(), reason: useId(), note: useId() };
  const R = WARDS.returns;
  return (
    <ActionDialog
      label={R.open}
      title={R.title}
      submit={R.save}
      onSave={(clientKey, d) =>
        action({
          clientKey,
          locationId,
          toLocationId: str(d, "to"),
          batchId: str(d, "batch"),
          quantity: num(d, "quantity"),
          reasonCode: str(d, "reason"),
          note: str(d, "note"),
          fit: d.get("fit") === "yes",
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={R.to} id={ids.to}>
          <select id={ids.to} name="to" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              {WARDS.add.choose}
            </option>
            {issuers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={R.batch} id={ids.batch}>
          <select id={ids.batch} name="batch" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              {WARDS.add.choose}
            </option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={R.quantity} id={ids.qty}>
          <Input
            id={ids.qty}
            name="quantity"
            type="number"
            min={1}
            required
            inputMode="numeric"
            className={TARGET}
          />
        </Field>
        <Field label={R.reason} id={ids.reason}>
          <select id={ids.reason} name="reason" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              {WARDS.add.choose}
            </option>
            {Object.entries(RETURN_REASONS).map(([k, w]) => (
              <option key={k} value={k}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label={WARDS.count.note} id={ids.note}>
          <Input id={ids.note} name="note" maxLength={500} className={TARGET} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input type="radio" name="fit" value="yes" required />
          {R.fit}
        </label>
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input type="radio" name="fit" value="no" />
          {R.unfit}
        </label>
      </fieldset>
    </ActionDialog>
  );
}
