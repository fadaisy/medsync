"use client";

import type { Act, Person } from "../../wards/_components/ward-dialogs";
import type { CountItem } from "../../wards/_lib/view";
import type { FormEvent } from "react";
import { useId, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNT_DIFFERENCE_REASONS } from "@/content/pharmacy-stock";
import { CARTS, GAP_EXPLANATIONS, STORES_B, WARDS } from "@/content/pharmacy-stores-wards";
import { FactorBlock, Field, Refusal, SELECT, TARGET } from "../../wards/_components/ward-dialogs";

/**
 * The cart check (5.5, EC-1 to EC-4), a page that works at 834 px and 390 px with 44 px targets. Step one
 * is blind: batches and their expiry only (S20b holds for carts too). The committed count brings back the
 * figures, the cart list and the uses recorded on the resus desk, which are context and never subtracted
 * (EC-2). The person explains each difference (EC-3), short-dated batches leave by default (EC-4), and the
 * unit's nurse in charge confirms with their own password and code.
 */

interface Revealed {
  id: string;
  lines: {
    batchId: string;
    productId: string;
    product: string;
    batchNumber: string;
    counted: number;
    before: number;
  }[];
  list: Record<string, number> | null;
  uses: { at: string; episodeRef: string; medicineAsRecorded: string }[];
  swaps: { batchId: string; daysLeft: number }[];
  lookaheadMissing: boolean;
}
interface Done {
  restocked: { product: string; quantity: number }[];
  short: { productId: string; quantity: number }[];
  controlled: string[];
}

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});
const str = (d: FormData, k: string) => {
  const v = String(d.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export function CartCheck({
  locationId,
  cart,
  unit,
  items,
  names,
  issuers,
  otherCarts,
  confirmers,
  attest,
  check,
}: {
  locationId: string;
  cart: string;
  unit: string;
  items: CountItem[];
  names: Record<string, string>;
  issuers: { id: string; name: string }[];
  otherCarts: { id: string; name: string }[];
  confirmers: Person[];
  attest: Act;
  check: Act;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string; who: string } | null>(null);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = { from: useId(), seal: useId() };
  const C = CARTS.check;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    start(async () => {
      if (!revealed) {
        const r = await check({
          step: "count",
          clientKey: key,
          locationId,
          lines: items.flatMap((p) =>
            p.batches.map((b) => ({ batchId: b.id, counted: Number(d.get(`c-${b.id}`)) })),
          ),
        });
        if (!r.ok) return setError(r.error);
        setError(null);
        return setRevealed(r.data as Revealed);
      }
      if (!confirmed) return setError(CARTS.check.confirmer);
      const r = await check({
        step: "complete",
        countId: revealed.id,
        locationId,
        fromLocationId: str(d, "from"),
        sealNumber: str(d, "seal"),
        confirmAttestationId: confirmed.id,
        explanations: revealed.lines
          .filter((l) => l.before !== l.counted)
          .map((l) => ({
            batchId: l.batchId,
            explanation: l.before > l.counted ? str(d, `e-${l.batchId}`) : null,
            reasonCode: l.before < l.counted ? str(d, `r-${l.batchId}`) : null,
            note: str(d, `n-${l.batchId}`),
            toCartLocationId: str(d, `t-${l.batchId}`),
          })),
        swaps: revealed.swaps.map((s) => ({
          batchId: s.batchId,
          route: str(d, `s-${s.batchId}`) ?? "return_to_issuer",
        })),
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setDone(r.data as Done);
    });
  };

  if (done)
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-body-s inline-flex items-center gap-1.5">
          <CheckIcon aria-hidden className="size-4" />
          {C.done}
        </p>
        <ul className="text-body-s flex flex-col gap-1">
          {done.restocked.map((x, i) => (
            <li key={i}>{C.restock(names[x.product] ?? x.product, x.quantity)}</li>
          ))}
          {done.short.map((x) => (
            <li key={x.productId}>
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {C.restockShort(names[x.productId] ?? x.productId, x.quantity)}
              </StatusWord>
            </li>
          ))}
          {done.controlled.map((p) => (
            <li key={p}>
              {names[p] ?? p}: {C.controlledRestock}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-heading-s text-foreground">{C.title(cart)}</h2>
      {!revealed ? (
        <>
          <p className="text-body-s text-muted-foreground">{C.lede}</p>
          <ul className="flex flex-col gap-3">
            {items.map((p) => (
              <li
                key={p.productId}
                className="border-border flex flex-col gap-2 rounded-md border p-3"
              >
                <p className="text-label text-foreground">{p.name}</p>
                {p.batches.map((b) => (
                  <div key={b.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                    <label htmlFor={`c-${b.id}`} className="text-body-s font-mono">
                      {WARDS.count.batch(b.batchNumber, b.expiryText)}
                    </label>
                    <Input
                      id={`c-${b.id}`}
                      name={`c-${b.id}`}
                      type="number"
                      min={0}
                      required
                      inputMode="numeric"
                      aria-label={`${p.name}, ${b.batchNumber}, quantity in ${p.issueUnit}`}
                      className={TARGET}
                    />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <section aria-labelledby="cart-uses" className="flex flex-col gap-1">
            <h3 id="cart-uses" className="text-label">
              {C.uses}
            </h3>
            <p className="text-body-s">{STORES_B.cartUsesContext(revealed.uses.length)}</p>
            <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5">
              {revealed.uses.map((u, i) => (
                <li key={i}>
                  {C.recordedUse(TIME.format(new Date(u.at)), u.episodeRef, u.medicineAsRecorded)}
                </li>
              ))}
            </ul>
          </section>
          <ul className="flex flex-col gap-3">
            {revealed.lines.map((l) => (
              <li key={l.batchId} className="flex flex-col gap-2">
                {l.before === l.counted ? (
                  <p className="text-body-s">{C.matches(l.product, l.batchNumber, l.counted)}</p>
                ) : (
                  <>
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {C.gap(l.product, l.batchNumber, l.before, l.counted)}
                    </StatusWord>
                    <p className="text-caption text-muted-foreground">
                      {STORES_B.explainDifference(unit)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {l.before > l.counted ? (
                        <Field label={C.explain} id={`e-${l.batchId}`}>
                          <select
                            id={`e-${l.batchId}`}
                            name={`e-${l.batchId}`}
                            required
                            defaultValue=""
                            className={SELECT}
                            onChange={(e) =>
                              setExplain((x) => ({ ...x, [l.batchId]: e.target.value }))
                            }
                          >
                            <option value="" disabled>
                              {C.explain}
                            </option>
                            {Object.entries(GAP_EXPLANATIONS).map(([k, w]) => (
                              <option key={k} value={k}>
                                {w}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label={C.reason} id={`r-${l.batchId}`}>
                          <select
                            id={`r-${l.batchId}`}
                            name={`r-${l.batchId}`}
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
                      )}
                      {explain[l.batchId] === "moved_to_another_cart" ? (
                        <Field label={C.toCart} id={`t-${l.batchId}`}>
                          <select
                            id={`t-${l.batchId}`}
                            name={`t-${l.batchId}`}
                            required
                            defaultValue=""
                            className={SELECT}
                          >
                            <option value="" disabled>
                              {C.toCart}
                            </option>
                            {otherCarts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      <Field label={WARDS.count.note} id={`n-${l.batchId}`}>
                        <Input
                          id={`n-${l.batchId}`}
                          name={`n-${l.batchId}`}
                          maxLength={500}
                          className={TARGET}
                        />
                      </Field>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {revealed.list ? (
            <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5">
              {Object.entries(revealed.list).map(([productId, n]) => (
                <li key={productId}>{C.listHolds(names[productId] ?? productId, n)}</li>
              ))}
            </ul>
          ) : null}
          {revealed.swaps.map((s) => {
            const line = revealed.lines.find((l) => l.batchId === s.batchId);
            return (
              <div key={s.batchId} className="grid gap-2 sm:grid-cols-2">
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {C.swap(line?.batchNumber ?? "", s.daysLeft)}
                </StatusWord>
                <Field label={C.swapRoute} id={`s-${s.batchId}`}>
                  <select
                    id={`s-${s.batchId}`}
                    name={`s-${s.batchId}`}
                    defaultValue="return_to_issuer"
                    className={SELECT}
                  >
                    {Object.entries(C.routes).map(([k, w]) => (
                      <option key={k} value={k}>
                        {w}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={C.from} id={ids.from}>
              <select id={ids.from} name="from" required defaultValue="" className={SELECT}>
                <option value="" disabled>
                  {C.from}
                </option>
                {issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.seal} id={ids.seal}>
              <Input id={ids.seal} name="seal" maxLength={40} className={TARGET} />
            </Field>
          </div>
          <FactorBlock
            locationId={locationId}
            role="cart_confirm"
            self={null}
            people={confirmers}
            attest={attest}
            title={C.confirmer}
            done={confirmed?.who ?? null}
            onDone={(id, who) => setConfirmed({ id, who })}
          />
        </>
      )}
      <Refusal error={error} />
      <div>
        <Button type="submit" className={TARGET} disabled={pending}>
          {revealed ? C.complete : C.save}
        </Button>
      </div>
    </form>
  );
}
