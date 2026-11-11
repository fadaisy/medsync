"use client";

import type { ColdChainData, FridgeRow } from "@/lib/pharmacy/cold/read";
import { useState } from "react";

import {
  ActionDialog,
  Chip,
  Chips,
  Field,
  inputCls,
  Stepper,
  useClientKey,
} from "@/app/pharmacy/patients/_components/kit";
import {
  coldAckAction,
  coldAddAction,
  coldReadingAction,
  coldTakeOutAction,
} from "@/app/pharmacy/patients/actions";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";
import { coldStatus, HOURS_OF } from "@/lib/pharmacy/cold/derive";

const C = PRW.cold;
const t1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const kampala = (ms: number, withDay = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
    ...(withDay ? { day: "numeric", month: "short" } : {}),
  }).format(ms);

/** The temperature line over 24 h, 7 or 30 days, with the 2–8 °C band, the alarm lines and a hover readout. */
export function TempChart({ series, now }: { series: { at: number; v: number }[]; now: number }) {
  const [range, setRange] = useState<keyof typeof HOURS_OF>("24h");
  const [hover, setHover] = useState<{ at: number; v: number } | null>(null);
  const from = now - HOURS_OF[range];
  const pts = series.filter((p) => p.at >= from);
  const W = 720,
    H = 220,
    P = 28;
  const lo = Math.min(-2, ...pts.map((p) => p.v)) - 1;
  const hi = Math.max(12, ...pts.map((p) => p.v)) + 1;
  const x = (at: number) => P + ((at - from) / (now - from)) * (W - P - 8);
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - 28);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const shown = hover ?? pts.at(-1) ?? null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips label={C.rangeLabel}>
          {(Object.keys(HOURS_OF) as (keyof typeof HOURS_OF)[]).map((k) => (
            <Chip key={k} on={k === range} onClick={() => setRange(k)}>
              {C.ranges[k]}
            </Chip>
          ))}
        </Chips>
        {shown ? (
          <span className="text-body-s tabular-nums" aria-live="polite">
            {fill(C.readout, { time: kampala(shown.at, range !== "24h"), t: t1(shown.v) })} ·{" "}
            {C.status[coldStatus(shown.v)]}
          </span>
        ) : null}
      </div>
      {pts.length < 2 ? (
        <p className="text-body-s text-muted-foreground">{C.noReadings}</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={fill(C.chartAlt, { range: C.ranges[range]! })}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const at =
              from + ((((e.clientX - r.left) / r.width) * W - P) / (W - P - 8)) * (now - from);
            setHover(pts.reduce((a, b) => (Math.abs(b.at - at) < Math.abs(a.at - at) ? b : a)));
          }}
        >
          <rect
            x={P}
            width={W - P - 8}
            y={y(RULES.cold.high)}
            height={y(RULES.cold.low) - y(RULES.cold.high)}
            className="fill-ink-100"
          />
          {[RULES.cold.high, RULES.cold.freeze].map((v) => (
            <g key={v}>
              <line
                x1={P}
                x2={W - 8}
                y1={y(v)}
                y2={y(v)}
                className="stroke-ink-500"
                strokeDasharray="4 4"
              />
              <text x={2} y={y(v) + 4} className="fill-ink-600 text-[10px]">
                {t1(v)}
              </text>
            </g>
          ))}
          <path d={d} fill="none" className="stroke-tide-navy-900" strokeWidth={1.75} />
          {hover ? (
            <circle cx={x(hover.at)} cy={y(hover.v)} r={4} className="fill-tide-navy-900" />
          ) : null}
        </svg>
      )}
    </div>
  );
}

/** Record the am or pm thermometer reading; the afternoon one carries the freeze indicator. */
export function RecordReading({ fridge }: { fridge: FridgeRow }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<"am" | "pm">(() =>
    new Date().getUTCHours() + 3 >= 12 ? "pm" : "am",
  );
  const [temp, setTemp] = useState("");
  const [fi, setFi] = useState<"ok" | "x" | null>(null);
  const [initials, setInitials] = useState("");
  const v = Number(temp.replace(",", "."));
  const valid = temp.trim() !== "" && Number.isFinite(v);
  return (
    <>
      <LabButton variant="secondary" onClick={() => setOpen(true)}>
        {C.record}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(C.recordTitle, { slot: slot === "am" ? C.am : C.pm })}
        sub={`${fridge.name} · ${fridge.place}`}
        submit={C.recordSave}
        blocked={
          !valid
            ? C.thermometer
            : slot === "pm" && !fi
              ? C.fiNeeded
              : !initials.trim()
                ? C.initials
                : null
        }
        run={() =>
          coldReadingAction({
            fridgeId: fridge.id,
            slot,
            tempC: v,
            fi: slot === "pm" ? fi : null,
            initials,
          })
        }
      >
        <Chips label={C.recordTitle}>
          <Chip on={slot === "am"} onClick={() => setSlot("am")}>
            {C.am}
          </Chip>
          <Chip on={slot === "pm"} onClick={() => setSlot("pm")}>
            {C.pm}
          </Chip>
        </Chips>
        <Field label={C.thermometer}>
          <input
            inputMode="decimal"
            className={`${inputCls} max-w-32 tabular-nums`}
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
          />
        </Field>
        {valid && coldStatus(v) !== "ok" ? <Pill tone="caution">{C.outOfRange}</Pill> : null}
        {slot === "pm" ? (
          <Field label={C.fi}>
            <Chips label={C.fi}>
              <Chip on={fi === "ok"} onClick={() => setFi("ok")}>
                {C.fiOk}
              </Chip>
              <Chip on={fi === "x"} onClick={() => setFi("x")}>
                {C.fiX}
              </Chip>
            </Chips>
          </Field>
        ) : null}
        <Field label={C.initials}>
          <input
            className={`${inputCls} max-w-24 uppercase`}
            maxLength={6}
            value={initials}
            onChange={(e) => setInitials(e.target.value)}
          />
        </Field>
      </ActionDialog>
    </>
  );
}

type Full = Extract<ColdChainData, { excursions: unknown }>;
type Exc = Full["excursions"][number];

/** Excursions in the last 30 days; one without an action recorded asks for one. */
export function Excursions({
  fridgeId,
  list,
  freezeSensitive,
}: {
  fridgeId: string;
  list: Exc[];
  freezeSensitive: boolean;
}) {
  const [act, setAct] = useState<Exc | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  if (!list.length) return <p className="text-body-s text-muted-foreground">{C.excursionsNone}</p>;
  const dur = (m: number) =>
    m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return (
    <ul className="divide-border flex flex-col divide-y">
      {list.map((e) => (
        <li key={e.start} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span className="font-medium">
            {fill(e.kind === "high" ? C.tooWarm : e.frozen ? C.froze : C.tooCold, {
              t: `${t1(e.peak)} °C`,
            })}
          </span>
          <span className="text-body-s text-muted-foreground tabular-nums">
            {fill(C.outFor, { from: kampala(e.start, true), to: kampala(e.end), dur: dur(e.mins) })}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {e.ack ? (
              <Pill tone="passed">{`${C.actedOn}: ${e.ack.actions.join(", ")}`}</Pill>
            ) : (
              <>
                <Pill tone="caution">{C.needsAction}</Pill>
                <LabButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPicked([]);
                    setAct(e);
                  }}
                >
                  {C.recordActions}
                </LabButton>
              </>
            )}
          </span>
        </li>
      ))}
      <ActionDialog
        open={!!act}
        onOpenChange={(o) => !o && setAct(null)}
        title={C.recordActions}
        sub={
          act
            ? fill(C.outFor, {
                from: kampala(act.start, true),
                to: kampala(act.end),
                dur: dur(act.mins),
              })
            : undefined
        }
        submit={C.recordActions}
        blocked={picked.length ? null : C.recordActions}
        run={() =>
          coldAckAction({ fridgeId, start: new Date(act!.start).toISOString(), actions: picked })
        }
      >
        {act && (act.frozen || act.kind === "low") && freezeSensitive ? (
          <Pill tone="caution">{C.shakePrompt}</Pill>
        ) : null}
        <Chips label={C.recordActions}>
          {C.actions.map((a) => (
            <Chip
              key={a}
              on={picked.includes(a)}
              onClick={() =>
                setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))
              }
            >
              {a}
            </Chip>
          ))}
        </Chips>
      </ActionDialog>
    </ul>
  );
}

type Product = Full["products"][number];
const ISSUES_FROM = new Set(["store", "dispensing_point"]);

/** What is kept in this fridge, with Add a medicine and Take out. */
export function Contents({
  fridge,
  products,
  places,
}: {
  fridge: FridgeRow;
  products: Product[];
  /** Other fridges' places, as destinations for "Move elsewhere". */
  places: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [out, setOut] = useState<Product | null>(null);
  const listed = products.filter((p) => p.listed || p.here > 0);
  return (
    <div className="flex flex-col gap-3">
      {listed.length ? (
        <ul className="divide-border flex flex-col divide-y">
          {listed.map((p) => (
            <li key={p.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium">{p.name}</span>
              <span className="text-body-s text-muted-foreground tabular-nums">
                {C.here}: {p.here}
                {p.batches.length
                  ? ` · ${p.batches.map((b) => `${b.no} (${b.n})`).join(", ")}`
                  : ""}
              </span>
              <LabButton
                className="ml-auto"
                variant="secondary"
                size="sm"
                onClick={() => setOut(p)}
              >
                {C.takeOut}
              </LabButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">
          {C.contentsNone} {C.contentsNext}
        </p>
      )}
      <div>
        <LabButton variant="secondary" onClick={() => setAdding(true)}>
          {C.add}
        </LabButton>
      </div>
      <AddDialog open={adding} onOpenChange={setAdding} fridge={fridge} products={products} />
      {out ? (
        <TakeOutDialog
          key={out.id}
          onClose={() => setOut(null)}
          fridge={fridge}
          product={out}
          places={[
            ...places,
            ...out.elsewhere
              .filter((e) => !places.some((p) => p.id === e.placeId))
              .map((e) => ({ id: e.placeId, name: e.place })),
          ].filter((p) => p.id !== fridge.locationId)}
        />
      ) : null}
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  fridge,
  products,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fridge: FridgeRow;
  products: Product[];
}) {
  const key = useClientKey(open);
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [qty, setQty] = useState<number | null>(null);
  const p = products.find((x) => x.id === productId);
  const sources = (p?.elsewhere ?? []).filter((e) => ISSUES_FROM.has(e.kind));
  const max = sources.find((s) => s.placeId === from)?.n;
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={fill(C.addTitle, { fridge: fridge.name })}
      submit={from && qty ? fill(C.moveInSave, { n: qty }) : C.addSave}
      blocked={!p ? C.choose : from && !qty ? PRW.inpatients.quantity : null}
      run={() =>
        coldAddAction({
          clientKey: key,
          fridgeId: fridge.id,
          productId,
          moveFrom: from && qty ? from : null,
          quantity: from && qty ? qty : null,
        })
      }
    >
      <Field label={C.choose}>
        <select
          className={inputCls}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setFrom(null);
            setQty(null);
          }}
        >
          <option value="" />
          {products.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      {p && sources.length ? (
        <Field label={C.moveIn}>
          <Chips label={C.moveIn}>
            {sources.map((s) => (
              <Chip
                key={s.placeId}
                on={from === s.placeId}
                onClick={() => setFrom(from === s.placeId ? null : s.placeId)}
              >
                {s.place} · {s.n}
              </Chip>
            ))}
          </Chips>
        </Field>
      ) : null}
      {from ? (
        <Stepper label={PRW.inpatients.quantity} value={qty} onChange={setQty} max={max} />
      ) : null}
    </ActionDialog>
  );
}

function TakeOutDialog({
  onClose,
  fridge,
  product,
  places,
}: {
  onClose: () => void;
  fridge: FridgeRow;
  product: Product;
  places: { id: string; name: string }[];
}) {
  const key = useClientKey(true);
  const canMove = ISSUES_FROM.has(fridge.placeKind);
  const [how, setHow] = useState<"move" | "discard" | "unlist">(
    product.here ? (canMove ? "move" : "discard") : "unlist",
  );
  const [to, setTo] = useState<string | null>(null);
  const [cause, setCause] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [qty, setQty] = useState<number | null>(null);
  const max = batchId ? product.batches.find((b) => b.id === batchId)?.n : product.here;
  const hows = (["move", "discard", "unlist"] as const).filter(
    (h) => h === "unlist" || product.here > 0,
  );
  const blocked =
    how === "unlist"
      ? null
      : !qty
        ? PRW.inpatients.quantity
        : how === "move"
          ? canMove
            ? to
              ? null
              : C.moveTo
            : C.noMoveFromHere
          : cause
            ? null
            : C.why;
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={fill(C.takeOutTitle, { med: product.name, fridge: fridge.name })}
      submit={C.takeOutSave[how]}
      blocked={blocked}
      foot={how === "discard" ? C.discardHint : how === "unlist" ? C.unlistHint : undefined}
      run={() =>
        coldTakeOutAction({
          clientKey: key,
          fridgeId: fridge.id,
          productId: product.id,
          how,
          quantity: how === "unlist" ? null : qty,
          batchId: how === "discard" ? batchId : null,
          to: how === "move" ? to : null,
          cause: how === "discard" ? cause : null,
        })
      }
    >
      <Chips label={C.takeOut}>
        {hows.map((h) => (
          <Chip key={h} on={how === h} onClick={() => setHow(h)}>
            {C.how[h]}
          </Chip>
        ))}
      </Chips>
      {how === "move" && !canMove ? <p className="text-body-s">{C.noMoveFromHere}</p> : null}
      {how === "move" && canMove ? (
        <Field label={C.moveTo}>
          <Chips label={C.moveTo}>
            {places.map((p) => (
              <Chip key={p.id} on={to === p.id} onClick={() => setTo(p.id)}>
                {p.name}
              </Chip>
            ))}
          </Chips>
        </Field>
      ) : null}
      {how === "discard" ? (
        <>
          <Field label={C.why}>
            <Chips label={C.why}>
              {Object.entries(C.causes).map(([k, label]) => (
                <Chip key={k} on={cause === k} onClick={() => setCause(k)}>
                  {label}
                </Chip>
              ))}
            </Chips>
          </Field>
          <Field label={C.batch}>
            <Chips label={C.batch}>
              <Chip on={!batchId} onClick={() => setBatchId(null)}>
                {C.fefo}
              </Chip>
              {product.batches.map((b) => (
                <Chip key={b.id} on={batchId === b.id} onClick={() => setBatchId(b.id)}>
                  {b.no} · {b.n}
                </Chip>
              ))}
            </Chips>
          </Field>
        </>
      ) : null}
      {how !== "unlist" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Stepper label={PRW.inpatients.quantity} value={qty} onChange={setQty} max={max} />
          {max ? (
            <LabButton variant="text" size="sm" onClick={() => setQty(max)}>
              {fill(C.all, { n: max })}
            </LabButton>
          ) : null}
        </div>
      ) : null}
    </ActionDialog>
  );
}

export function PrintButton({ children }: { children: string }) {
  return (
    <LabButton variant="secondary" size="sm" onClick={() => window.print()}>
      {children}
    </LabButton>
  );
}
