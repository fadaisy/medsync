"use client";

import type { Flags, Row, Ven } from "@/lib/pharmacy/derive/medicines";
import type { MedicinesPayload } from "@/lib/pharmacy/medicines/read";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { NO_EXPIRY_WORD } from "@/content/pharmacy-supplies";
import {
  addPayerAction,
  lineHistoryAction,
  markReviewedAction,
  proposeRuleAction,
  requestTopUpsAction,
  saveLineAction,
  stopStockingAction,
  undoTopUpAction,
} from "@/app/pharmacy/medicines-actions";
import { LabButton } from "@/components/tide/work/button";
import {
  CLASSES,
  FLAG_KEYS,
  FLAGS,
  MEDICINES,
  PAYER_KINDS,
  qty,
  SALE,
  ugx,
  VEN,
} from "@/content/pharmacy-medicines";
import {
  dateIn,
  fridgeLines,
  placeStatus,
  rulesFor,
  topUpSuggestion,
  venWord,
} from "@/lib/pharmacy/derive/medicines";
import { cn } from "@/lib/utils";
import { lineRuleItems, ruleItems, RuleLine } from "./rules";
import { field, fieldSm, linkBtn, newKey, pillBtn, sectionTitle } from "./shared";
import { CHIP, near } from "./tones";

const R = MEDICINES.row;
const STD_PACKS = [10, 25, 50, 100, 1000];
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[, ]/g, "")));

interface Draft {
  ven: Ven | null;
  cls: string | null;
  flags: Flags;
  packs: number[];
  loose: boolean;
  free: boolean;
  prices: Record<string, string>;
  levels: Record<string, string>;
  brands: { id: string | null; name: string; maker: string | null; price: string }[];
  fromDate: string;
}

const draftOf = (row: Row, data: MedicinesPayload): Draft => {
  const l = row.l;
  return {
    ven: l.ven,
    cls: l.cls,
    flags: { ...l.flags },
    packs: [...l.packs],
    loose: l.loose,
    free: l.free,
    prices: Object.fromEntries(
      data.payers.map((p) => [p.id, l.prices[p.id] ? String(l.prices[p.id]) : ""]),
    ),
    levels: Object.fromEntries(
      data.places.map((p) => [p.id, l.levels[p.id] ? String(l.levels[p.id]) : ""]),
    ),
    brands: l.brands.map((b) => ({
      id: b.id,
      name: b.name,
      maker: b.maker,
      price: b.price ? String(b.price) : "",
    })),
    fromDate: data.today,
  };
};

/** The open row (§4): one page, no tabs. Every edit goes into a draft; nothing is saved until Save changes. */
export function OpenRow({
  row,
  data,
  mode,
  live,
  toast,
  onClose,
}: {
  row: Row;
  data: MedicinesPayload;
  mode: "edit" | "operate";
  live: boolean;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const l = row.l;
  const can = data.can;
  const roLevels = mode === "operate" || !can.levels;
  const ro = roLevels || !can.edit;
  const [d, setD] = useState<Draft>(() => draftOf(row, data));
  const [err, setErr] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [hist, setHist] = useState<{ id: string; line: string }[] | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [pending, start] = useTransition();
  const unit = l.unit;
  const name = l.generic;

  const loadHistory = () => void lineHistoryAction(l.id).then(setHist);
  useEffect(loadHistory, [l.id]);

  // On hand flashes teal for about 3.5 s after it changes (§4.3).
  const prev = useRef(l.stock);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const changed = data.places
      .filter((p) => (prev.current[p.id] ?? 0) !== (l.stock[p.id] ?? 0))
      .map((p) => p.id);
    prev.current = l.stock;
    if (!changed.length) return;
    setFlash(new Set(changed));
    const t = setTimeout(() => setFlash(new Set()), 3500);
    return () => clearTimeout(t);
  }, [l.stock, data.places]);

  const up = (patch: Partial<Draft>) => (setD((x) => ({ ...x, ...patch })), setErr(null));
  const lvl = (id: string) => num(d.levels[id] ?? "") ?? 0;
  const cashId = data.cashPayerId;
  const cash = cashId ? num(d.prices[cashId] ?? "") : null;

  const act = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
    after?: () => void,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? MEDICINES.refused.failed);
      toast(done);
      after?.();
      router.refresh();
    });

  const save = () => {
    if (!d.packs.length && !d.loose) return setErr(R.needPack);
    if (!d.fromDate) return setErr(R.needDate);
    start(async () => {
      const r = await saveLineAction({
        id: l.id,
        fromDate: d.fromDate,
        ven: d.ven,
        cls: d.cls,
        flags: d.flags,
        packs: d.packs,
        loose: d.loose,
        free: d.free,
        prices: Object.fromEntries(Object.entries(d.prices).map(([k, v]) => [k, num(v)])),
        levels: Object.fromEntries(Object.entries(d.levels).map(([k, v]) => [k, num(v)])),
        brands: d.brands.map((b) => ({
          id: b.id,
          name: b.name,
          maker: b.maker,
          price: num(b.price),
        })),
      });
      if (!r.ok) return setErr(r.error);
      toast(r.data?.changed ? R.saved(l.name) : R.nothing);
      loadHistory();
      router.refresh();
    });
  };

  const toggleFlag = (k: keyof Flags) => {
    if (ro) return;
    if (k === "controlled" && d.flags.controlled && l.nationalControlled)
      return setErr(R.lockedError(name));
    up({ flags: { ...d.flags, [k]: !d.flags[k] } });
  };
  const togglePack = (n: number) =>
    !roLevels &&
    up({
      packs: d.packs.includes(n)
        ? d.packs.filter((x) => x !== n)
        : [...d.packs, n].sort((a, b) => a - b),
    });

  const leveled = data.places.filter((p) => lvl(p.id) > 0).length;
  const summary = [
    venWord(d.ven),
    leveled ? `levels at ${leveled} ${leveled === 1 ? "place" : "places"}` : MEDICINES.grid.noLevel,
    d.free
      ? MEDICINES.grid.free
      : cash
        ? `${ugx(cash)} ${R.perUnit(unit)}`
        : `${MEDICINES.grid.notSet} price`,
  ].join(" · ");
  const ident = [l.generic, l.strength, l.form, l.route].filter(Boolean).join(" · ");
  const spec: [string, string][] = [
    [R.spec.medicine, l.generic],
    [R.spec.strength, l.strength ?? "—"],
    [R.spec.form, l.form ?? "—"],
    [R.spec.route, l.route ?? "—"],
    [R.spec.cls, d.cls ?? "—"],
    [R.spec.group, l.group ?? "—"],
    [R.spec.sale, l.sale ? SALE[l.sale] : "—"],
    [R.spec.unit, unit],
  ];
  const groups = rulesFor(d.flags, d.cls, l.generic, data.lines);
  const store = data.places.find((p) => p.isStore);
  const packOpts = [...new Set([...STD_PACKS, ...d.packs])].sort((a, b) => a - b);
  const lastMove =
    live && data.lastMove
      ? R.live(data.lastMove.at, data.lastMove.text)
      : live
        ? R.liveWaiting
        : R.liveOff;
  const fl = d.flags.cold
    ? fridgeLines(
        { stock: l.stock, levels: Object.fromEntries(data.places.map((p) => [p.id, lvl(p.id)])) },
        data.places,
        MEDICINES.cold,
      )
    : [];
  return (
    <section
      aria-label={R.regionAria(l.name)}
      className="bg-ink-50 flex flex-col gap-0 rounded-2xl px-4 pt-3 pb-4 sm:ml-11"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
        <h3 className="text-heading-s text-foreground m-0">{ident}</h3>
        <span className="text-ink-700 text-[13px]">{summary}</span>
      </header>

      {/* 4.1 About */}
      <h4 className={cn(sectionTitle, "mb-2")}>{R.about}</h4>
      <dl className="bg-card m-0 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-x-3 rounded-xl px-3 py-1.5">
        {spec.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 py-1">
            <dt className={sectionTitle}>{k}</dt>
            <dd className="m-0 text-[13px] leading-[17px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-600 mt-1.5 mb-3 text-[11px] leading-[15px]">{R.ownLine}</p>
      {row.qc.length ? (
        <div
          role="note"
          className="bg-status-caution-bg text-foreground mb-3 rounded-xl px-3 py-2 text-[12px] leading-[17px]"
        >
          <b>{R.checks}</b>
          <ul className="mt-0.5 mb-0 list-disc pl-[18px]">
            {row.qc.map((q) => (
              <li key={q.k}>{q.t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="text-ink-700 mb-3 flex flex-wrap items-center justify-between gap-1.5 text-[12px]">
        <span>
          {l.reviewedDays === null ? R.neverReviewed : R.reviewed(l.reviewedDays)}
          {l.reviewedDays !== null && l.reviewedDays > 90 ? R.reviewDue : ""}
        </span>
        {can.review && mode === "edit" ? (
          <LabButton
            size="sm"
            busy={pending}
            onClick={() =>
              act(() => markReviewedAction({ id: l.id }), R.reviewedDone(name), loadHistory)
            }
          >
            {R.markReviewed}
          </LabButton>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-700 text-[12px] font-semibold">{R.cls}</span>
          {ro ? (
            <span className="text-[13px] font-semibold">{d.cls ?? MEDICINES.grid.notSet}</span>
          ) : (
            <select
              value={d.cls ?? ""}
              onChange={(e) => up({ cls: e.target.value || null })}
              className={cn(field, "max-w-sm")}
            >
              <option value="">{MEDICINES.grid.notSet}</option>
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </label>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="text-ink-700 mb-1.5 text-[12px] font-semibold">{R.ven}</legend>
          <span
            role="radiogroup"
            aria-label={R.ven}
            className="bg-card inline-flex w-fit rounded-full p-0.5 shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
          >
            {(Object.keys(VEN) as Ven[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={d.ven === v}
                disabled={ro}
                onClick={() => up({ ven: v })}
                className={cn(
                  "h-7 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150",
                  d.ven === v
                    ? "bg-tide-navy-900 text-tide-on-band"
                    : "text-ink-700 enabled:hover:bg-ink-100",
                )}
              >
                {VEN[v]}
              </button>
            ))}
          </span>
          <span className="text-ink-600 text-[11px]">{R.venHint}</span>
        </fieldset>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-ink-700 text-[12px] font-semibold">{R.handling}</span>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
          {FLAG_KEYS.map((k) => {
            const on = d.flags[k];
            const locked = k === "controlled" && l.nationalControlled && on;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                aria-disabled={ro || undefined}
                onClick={() => toggleFlag(k)}
                className={cn(
                  "flex min-h-[64px] flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors duration-150",
                  on
                    ? "bg-tide-lagoon-tint"
                    : "bg-card shadow-[inset_0_0_0_1px_var(--color-ink-200)]",
                  ro
                    ? "cursor-default"
                    : "enabled:hover:shadow-[inset_0_0_0_1px_var(--color-ink-400)]",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[5px]",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "shadow-[inset_0_0_0_1.5px_var(--color-ink-400)]",
                    )}
                  >
                    {on ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                  </span>
                  {FLAGS[k][1]}
                </span>
                <span className="text-ink-600 text-[11px] leading-[14px]">
                  {locked ? R.locked : FLAGS[k][3]}
                </span>
                {k === "cold" && fl.length ? (
                  <span className="border-ink-200 mt-1 flex flex-col gap-[3px] border-t pt-1.5">
                    {fl.map((f) => (
                      <span
                        key={f.where}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] leading-[15px]"
                      >
                        <span>
                          <b>{f.where}</b> {f.fridge}
                        </span>
                        <span
                          className={cn(
                            f.tone === "bad" && "text-status-critical-fg-aa font-semibold",
                            f.tone === "near" && "text-status-caution-fg-aa font-semibold",
                            f.tone === "ok" && "text-status-stable-fg",
                          )}
                        >
                          {f.temp}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4.2 Rules that apply */}
      <div className="border-border mt-3.5 border-t pt-3">
        <h4 className={cn(sectionTitle, "mb-2")}>
          {R.rulesTitle}{" "}
          <span className="font-medium tracking-normal normal-case">{R.rulesNote}</span>
        </h4>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
          {groups.map(({ group: g, shared }) => (
            <div key={g.id} className="bg-card flex flex-col gap-1 rounded-xl px-3 py-2.5">
              <span className="text-[13px] leading-[17px] font-semibold">
                {g.scope}{" "}
                <span className="text-ink-600 font-normal">
                  {g.id === "rx" ? R.thisOnly : R.shared(shared)}
                </span>
              </span>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {ruleItems(g, data, g.id === "rx" ? l.generic : undefined).map((it) => (
                  <RuleLine
                    key={`${it.group}:${it.key}`}
                    item={it}
                    can={mode === "edit" ? can : null}
                    toast={toast}
                    compact
                  />
                ))}
              </ul>
            </div>
          ))}
          <LineRules lineId={l.id} data={data} can={mode === "edit" ? can : null} toast={toast} />
        </div>
      </div>

      {/* 4.3 Packs and top-up levels */}
      <div className="border-border mt-3.5 border-t pt-3">
        <h4 className={cn(sectionTitle, "mb-2")}>{R.packsTitle}</h4>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-2">
            <span className="text-ink-700 text-[12px] font-semibold">{R.packSizes}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {packOpts.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={d.packs.includes(n)}
                  disabled={roLevels}
                  onClick={() => togglePack(n)}
                  className={pillBtn(d.packs.includes(n))}
                >
                  {n.toLocaleString("en-US")}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={d.loose}
                disabled={roLevels}
                onClick={() => up({ loose: !d.loose })}
                className={pillBtn(d.loose)}
              >
                {R.loose}
              </button>
            </div>
            {!roLevels ? (
              <div className="flex items-center gap-1.5">
                <input
                  inputMode="numeric"
                  aria-label={R.otherSize}
                  placeholder={R.otherSize}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className={cn(field, "w-28")}
                />
                <LabButton
                  size="sm"
                  onClick={() => {
                    const n = num(custom);
                    if (n && Number.isInteger(n) && n > 0 && !d.packs.includes(n))
                      up({ packs: [...d.packs, n].sort((a, b) => a - b) });
                    setCustom("");
                  }}
                >
                  {R.addSize}
                </LabButton>
              </div>
            ) : null}
            <span className="text-ink-600 text-[11px]">{R.countedIn(`${unit}s`)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-ink-700 text-[12px] font-semibold">{R.stockPerPlace}</span>
              <span
                role="status"
                aria-live="polite"
                className="text-ink-700 inline-flex items-center gap-1.5 text-[12px] leading-4"
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", live ? "bg-primary" : "bg-ink-400")}
                />
                {lastMove}
              </span>
            </span>
            <span className="text-ink-600 text-[12px] leading-4">{R.stockHint}</span>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-ink-600 text-left text-[11px] font-semibold tracking-[0.06em] uppercase">
                    <th className="py-1.5 pr-2 font-semibold">{R.place}</th>
                    <th className="py-1.5 pr-2 font-semibold">{R.onHand}</th>
                    <th className="py-1.5 pr-2" />
                    <th className="py-1.5 pr-2" />
                    <th className="py-1.5 pr-2 font-semibold">{R.topUp}</th>
                    <th className="py-1.5 font-semibold">{R.lowBelow}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.places.map((p) => {
                    const have = l.stock[p.id] ?? 0;
                    const level = lvl(p.id);
                    const st = placeStatus(have, level);
                    const need = topUpSuggestion(level, have);
                    const req = p.isStore ? data.orders[l.id] : data.requests[l.id]?.[p.id];
                    const q = qty(need, unit);
                    return (
                      <tr key={p.id} className="align-middle">
                        <td className="py-1.5 pr-2 font-semibold">{p.short}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={cn(
                              "-mx-1.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums transition-colors duration-[400ms]",
                              flash.has(p.id) && "bg-tide-lagoon-tint",
                            )}
                          >
                            {qty(have, unit)}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2">
                          {st ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                CHIP[st],
                              )}
                            >
                              {st}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2">
                          {req ? (
                            <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
                              <span className="font-semibold">
                                {p.isStore
                                  ? R.ordered(qty(req.qty, unit))
                                  : R.requested(qty(req.qty, unit))}
                              </span>
                              {can.request ? (
                                <button
                                  type="button"
                                  className={linkBtn}
                                  aria-label={R.undoAria(p.short, p.isStore)}
                                  onClick={() =>
                                    act(
                                      () =>
                                        undoTopUpAction({
                                          id: req.id,
                                          kind: p.isStore ? "order" : "request",
                                        }),
                                      R.cancelled,
                                    )
                                  }
                                >
                                  {R.undo}
                                </button>
                              ) : null}
                            </span>
                          ) : (st === "Low" || st === "Out") && need > 0 && can.request && store ? (
                            <LabButton
                              size="sm"
                              busy={pending}
                              aria-label={
                                p.isStore
                                  ? R.orderAria(q, l.name)
                                  : R.requestAria(q, l.name, p.short)
                              }
                              onClick={() =>
                                act(
                                  () =>
                                    requestTopUpsAction({
                                      items: [
                                        {
                                          clientKey: newKey(),
                                          lineId: l.id,
                                          placeId: p.id,
                                          qty: need,
                                        },
                                      ],
                                    }),
                                  p.isStore ? R.orderedDone(q) : R.requestedDone(q, p.short),
                                )
                              }
                            >
                              {p.isStore
                                ? R.order(need.toLocaleString("en-US"))
                                : R.request(need.toLocaleString("en-US"))}
                            </LabButton>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2">
                          {roLevels ? (
                            <span className="tabular-nums">
                              {level ? qty(level, unit) : R.notKept}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <input
                                inputMode="numeric"
                                aria-label={R.levelAria(p.short, unit)}
                                value={d.levels[p.id] ?? ""}
                                onChange={(e) =>
                                  up({
                                    levels: {
                                      ...d.levels,
                                      [p.id]: e.target.value.replace(/[^\d]/g, ""),
                                    },
                                  })
                                }
                                className={cn(fieldSm, "w-24 text-right tabular-nums")}
                              />
                              <span className="text-ink-600 text-[12px]">{unit}s</span>
                            </span>
                          )}
                        </td>
                        <td className="text-ink-700 py-1.5 tabular-nums">
                          {level ? qty(Math.ceil(level / 2), unit) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!store && can.request ? (
              <span className="text-ink-600 text-[12px]">{R.noStore}</span>
            ) : null}
            <span className="text-ink-700 mt-1 text-[12px] font-semibold">{R.batches}</span>
            {l.batches.length === 0 ? (
              <span className="text-ink-600 text-[12px]">{R.noBatches}</span>
            ) : (
              <div className="flex flex-col gap-1">
                {[...l.batches]
                  .sort((a, b) => a.days - b.days)
                  .map((b, i) => (
                    <div
                      key={b.no}
                      className="bg-card flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-[12px] leading-4 font-semibold">
                        {R.batch(i === 0, b.no, qty(b.qty, unit))}
                      </span>
                      <span className={cn("text-[12px] leading-4", near(b.days, 90, 30))}>
                        {l.noExpiry
                          ? NO_EXPIRY_WORD
                          : b.days < 0
                          ? R.expired(dateIn(data.today, b.days))
                          : R.expires(dateIn(data.today, b.days), b.days)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4.4 Prices */}
      <div className="border-border mt-3.5 border-t pt-3">
        <h4 className={cn(sectionTitle, "mb-2")}>{R.prices}</h4>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-ink-700 text-[12px] font-semibold">{R.pricePer(unit)}</span>
              <span className="text-ink-600 text-[12px] leading-4">
                {data.rulePct === null ? R.noRule : R.ruleHint(data.rulePct)}
              </span>
            </span>
            <span className="flex items-center gap-2.5">
              <span className="text-[14px] font-semibold">{R.freeAll}</span>
              <button
                type="button"
                role="switch"
                aria-checked={d.free}
                aria-label={R.freeAll}
                disabled={ro}
                onClick={() => up({ free: !d.free })}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150",
                  d.free ? "bg-primary" : "bg-ink-300",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "bg-card absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    d.free && "translate-x-5",
                  )}
                />
              </button>
            </span>
          </div>
          {!d.free ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-ink-600 text-left text-[11px] tracking-[0.06em] uppercase">
                    <th className="py-1.5 pr-3 font-semibold">{R.payer}</th>
                    <th className="py-1.5 pr-3 font-semibold">{R.price}</th>
                    <th className="py-1.5 font-semibold">{R.worksOut}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.payers.map((p) => {
                    const v = num(d.prices[p.id] ?? "") ?? (p.kind !== "cash" ? cash : null);
                    return (
                      <tr key={p.id}>
                        <td className="py-1.5 pr-3 font-semibold">{p.name}</td>
                        <td className="py-1.5 pr-3">
                          {ro ? (
                            <span className="tabular-nums">
                              {num(d.prices[p.id] ?? "")
                                ? `${ugx(num(d.prices[p.id]!)!)} ${R.perUnit(unit)}`
                                : p.kind === "cash"
                                  ? MEDICINES.grid.notSet
                                  : R.samePh}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-ink-600 text-[12px]">UGX</span>
                              <input
                                inputMode="numeric"
                                aria-label={R.priceAria(p.name, unit, l.name)}
                                placeholder={p.kind === "cash" ? R.cashPh : R.samePh}
                                value={d.prices[p.id] ?? ""}
                                onChange={(e) =>
                                  up({
                                    prices: {
                                      ...d.prices,
                                      [p.id]: e.target.value.replace(/[^\d]/g, ""),
                                    },
                                  })
                                }
                                className={cn(fieldSm, "w-28 text-right tabular-nums")}
                              />
                              <span className="text-ink-600 text-[12px]">{R.perUnit(unit)}</span>
                            </span>
                          )}
                        </td>
                        <td className="text-ink-700 py-1.5 tabular-nums">
                          {v && d.packs.length
                            ? d.packs.map((n) => R.pack(ugx(v * n), n)).join(" · ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {!ro ? <AddPayer data={data} toast={toast} /> : null}
        </div>
      </div>

      {/* 4.5 Brands */}
      <div className="border-border mt-3.5 border-t pt-3">
        <h4 className={cn(sectionTitle, "mb-1")}>
          {R.brands} · {d.brands.length}
        </h4>
        <p className="text-ink-600 mt-0 mb-2 text-[12px]">{R.brandHint}</p>
        {d.brands.length === 0 ? (
          <p className="text-ink-600 m-0 mb-2 text-[12px]">{R.noBrands}</p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {d.brands.map((b, i) => (
            <li
              key={`${b.id ?? "new"}:${b.name}`}
              className="bg-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
            >
              <span className="text-[13px] font-semibold">{b.name}</span>
              <span className="text-ink-600 text-[12px]">{b.maker ?? R.makerMissing}</span>
              {ro ? (
                <span className="text-[12px] tabular-nums">
                  {num(b.price)
                    ? `${ugx(num(b.price)!)} ${R.perUnit(unit)}`
                    : R.brandPricePh(cash ? ugx(cash) : null)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-ink-600 text-[12px]">UGX</span>
                  <input
                    inputMode="numeric"
                    aria-label={R.brandAria(b.name, unit)}
                    placeholder={R.brandPricePh(cash ? ugx(cash) : null)}
                    value={b.price}
                    onChange={(e) =>
                      up({
                        brands: d.brands.map((x, j) =>
                          j === i ? { ...x, price: e.target.value.replace(/[^\d]/g, "") } : x,
                        ),
                      })
                    }
                    className={cn(fieldSm, "w-28 text-right tabular-nums")}
                  />
                  <span className="text-ink-600 text-[12px]">{R.perUnit(unit)}</span>
                </span>
              )}
              {!ro ? (
                <button
                  type="button"
                  className={linkBtn}
                  aria-label={R.removeAria(b.name)}
                  onClick={() => up({ brands: d.brands.filter((_, j) => j !== i) })}
                >
                  {R.remove}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {!ro ? (
          <AddBrand
            starters={(data.starters[l.id] ?? []).filter(
              (s) => !d.brands.some((b) => b.name.toLowerCase() === s.name.toLowerCase()),
            )}
            taken={d.brands.map((b) => b.name.toLowerCase())}
            onAdd={(name, maker) =>
              up({ brands: [...d.brands, { id: null, name, maker, price: "" }] })
            }
            onError={setErr}
          />
        ) : null}
      </div>

      {/* 4.6 History */}
      <div className="border-border mt-3.5 border-t pt-3">
        <h4 className={cn(sectionTitle, "mb-2")}>{R.history}</h4>
        {hist === null ? null : hist.length === 0 ? (
          <p className="text-ink-600 m-0 text-[12px]">{R.noHistory}</p>
        ) : (
          <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto p-0">
            {hist.map((h) => (
              <li key={h.id} className="text-ink-700 text-[12px] leading-4">
                {h.line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {err ? (
        <p role="alert" className="text-status-critical-fg-aa mt-3 mb-0 text-[13px] font-semibold">
          {err}
        </p>
      ) : null}

      <footer className="border-border mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        {mode === "operate" ? (
          <>
            <span className="text-ink-600 text-[12px]">{R.readOnly}</span>
            <LabButton variant="secondary" onClick={onClose}>
              {MEDICINES.rulesDlg.close}
            </LabButton>
          </>
        ) : (
          <>
            <span className="flex flex-wrap items-center gap-2">
              {can.edit ? (
                confirmStop ? (
                  <>
                    <span className="text-[13px] font-semibold">{R.stopConfirm(l.name)}</span>
                    <LabButton
                      size="sm"
                      busy={pending}
                      onClick={() =>
                        act(() => stopStockingAction({ id: l.id }), R.stopped(l.name), onClose)
                      }
                    >
                      {R.stop}
                    </LabButton>
                    <LabButton size="sm" variant="text" onClick={() => setConfirmStop(false)}>
                      {R.cancel}
                    </LabButton>
                  </>
                ) : (
                  <LabButton size="sm" variant="quiet" onClick={() => setConfirmStop(true)}>
                    {R.stop}
                  </LabButton>
                )
              ) : null}
            </span>
            {!roLevels ? (
              <span className="flex flex-wrap items-center gap-2">
                <label className="text-ink-700 inline-flex items-center gap-2 text-[13px]">
                  {R.runsFrom}
                  <input
                    type="date"
                    min={data.today}
                    value={d.fromDate}
                    onChange={(e) => up({ fromDate: e.target.value })}
                    className={cn(field, "w-40")}
                  />
                </label>
                <LabButton variant="text" onClick={onClose}>
                  {R.cancel}
                </LabButton>
                <LabButton variant="primary" busy={pending} onClick={save}>
                  {R.save}
                </LabButton>
              </span>
            ) : (
              <LabButton variant="secondary" onClick={onClose}>
                {MEDICINES.rulesDlg.close}
              </LabButton>
            )}
          </>
        )}
      </footer>
    </section>
  );
}

function LineRules({
  lineId,
  data,
  can,
  toast,
}: {
  lineId: string;
  data: MedicinesPayload;
  can: MedicinesPayload["can"] | null;
  toast: (m: string) => void;
}) {
  const router = useRouter();
  const items = lineRuleItems(data, lineId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => {
    if (!text.trim()) return setErr(MEDICINES.rulesDlg.typeFirst);
    if (!why.trim()) return setErr(MEDICINES.rulesDlg.sayWhy);
    start(async () => {
      const r = await proposeRuleAction({
        clientKey: newKey(),
        group: "line",
        key: null,
        productId: lineId,
        newText: text.trim(),
        reason: why.trim(),
      });
      if (!r.ok) return setErr(r.error);
      toast(MEDICINES.rulesDlg.sent);
      setOpen(false);
      setText("");
      setWhy("");
      router.refresh();
    });
  };
  return (
    <div className="bg-card flex flex-col gap-1 rounded-xl px-3 py-2.5">
      <span className="text-[13px] leading-[17px] font-semibold">
        {R.mineGroup} <span className="text-ink-600 font-normal">{R.mineNote(items.length)}</span>
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((it) => (
          <RuleLine key={it.key} item={it} can={can} toast={toast} compact />
        ))}
      </ul>
      {can?.propose ? (
        open ? (
          <span className="bg-ink-50 flex flex-col gap-2 rounded-xl p-2.5">
            <input
              aria-label={MEDICINES.rulesDlg.newWording}
              placeholder={MEDICINES.rulesDlg.newWording}
              value={text}
              onChange={(e) => (setText(e.target.value), setErr(null))}
              className={cn(field, "w-full rounded-lg")}
            />
            <input
              aria-label={MEDICINES.rulesDlg.why}
              placeholder={MEDICINES.rulesDlg.why}
              value={why}
              onChange={(e) => (setWhy(e.target.value), setErr(null))}
              className={cn(field, "w-full rounded-lg")}
            />
            <span className="flex gap-2">
              <LabButton size="sm" variant="primary" busy={pending} onClick={send}>
                {MEDICINES.rulesDlg.send}
              </LabButton>
              <LabButton size="sm" variant="text" onClick={() => setOpen(false)}>
                {R.cancel}
              </LabButton>
            </span>
            {err ? (
              <span role="alert" className="text-status-critical-fg-aa text-[12px] font-semibold">
                {err}
              </span>
            ) : null}
          </span>
        ) : (
          <button type="button" className={cn(linkBtn, "w-fit")} onClick={() => setOpen(true)}>
            {R.addRule}
          </button>
        )
      ) : null}
    </div>
  );
}

function AddPayer({ data, toast }: { data: MedicinesPayload; toast: (m: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<keyof typeof PAYER_KINDS>("insurance");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = () => {
    const n = name.trim();
    if (!n) return setErr(R.payerTypeName);
    if (data.payers.some((p) => p.name.toLowerCase() === n.toLowerCase()))
      return setErr(R.payerDup(n));
    start(async () => {
      const r = await addPayerAction({ name: n, kind });
      if (!r.ok) return setErr(r.error);
      toast(R.payerAdded(n));
      setOpen(false);
      setName("");
      router.refresh();
    });
  };
  if (!open)
    return (
      <button type="button" className={cn(linkBtn, "w-fit")} onClick={() => setOpen(true)}>
        {R.addPayer}
      </button>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <select
          aria-label={R.payerKindAria}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={field}
        >
          {Object.entries(PAYER_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          aria-label={R.payerNameAria}
          placeholder={R.payerName}
          value={name}
          onChange={(e) => (setName(e.target.value), setErr(null))}
          className={cn(field, "w-56")}
        />
        <LabButton size="sm" variant="primary" busy={pending} onClick={add}>
          {R.add}
        </LabButton>
        <LabButton size="sm" variant="text" onClick={() => (setOpen(false), setErr(null))}>
          {R.cancel}
        </LabButton>
      </span>
      <span className="text-ink-600 text-[11px]">{R.payerHint}</span>
      {err ? (
        <span role="alert" className="text-status-critical-fg-aa text-[12px] font-semibold">
          {err}
        </span>
      ) : null}
    </div>
  );
}

function AddBrand({
  starters,
  taken,
  onAdd,
  onError,
}: {
  starters: { name: string; maker: string | null }[];
  taken: string[];
  onAdd: (name: string, maker: string | null) => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const add = () => {
    const isOther = pick === "__other";
    const n = isOther ? name.trim() : pick === "__generic" ? R.anyMaker : pick;
    if (!pick) return onError(R.chooseBrand);
    if (isOther && !n) return onError(R.typeBrand);
    if (taken.includes(n.toLowerCase())) return onError(R.brandDup(n));
    const s = starters.find((x) => x.name === pick);
    onAdd(n, isOther ? maker.trim() || null : (s?.maker ?? null));
    setOpen(false);
    setPick("");
    setName("");
    setMaker("");
  };
  if (!open)
    return (
      <button type="button" className={cn(linkBtn, "mt-1.5 w-fit")} onClick={() => setOpen(true)}>
        {R.addBrand}
      </button>
    );
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <select
          aria-label={R.brand}
          value={pick}
          onChange={(e) => (setPick(e.target.value), onError(null))}
          className={cn(field, "max-w-xs")}
        >
          <option value="">{R.choose}</option>
          {starters.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
              {s.maker ? ` · ${s.maker}` : ""}
            </option>
          ))}
          <option value="__generic">{R.anyMaker}</option>
          <option value="__other">{R.notListed}</option>
        </select>
        {pick === "__other" ? (
          <>
            <input
              aria-label={R.brandName}
              placeholder={R.brandName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(field, "w-44")}
            />
            <input
              aria-label={R.maker}
              placeholder={R.maker}
              value={maker}
              onChange={(e) => setMaker(e.target.value)}
              className={cn(field, "w-44")}
            />
          </>
        ) : null}
        <LabButton size="sm" variant="primary" onClick={add}>
          {R.addBrandBtn}
        </LabButton>
        <LabButton size="sm" variant="text" onClick={() => (setOpen(false), onError(null))}>
          {R.cancel}
        </LabButton>
      </span>
      <span className="text-ink-600 text-[11px]">{R.brandStarter}</span>
    </div>
  );
}
