"use client";

import type { ItemRow, Settings } from "@/lib/lab/stock-read";
import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB3 } from "@/content/lab-phase-3";
import {
  grandfatherLotsAction,
  issueStockAction,
  quarantineLotAction,
  recordCountAction,
  recordMovementAction,
  releaseLotFromQuarantineAction,
  saveAcceptancePlanAction,
  saveStockItemAction,
  setLotInUseAction,
  setStockSettingsAction,
  signAcceptancePlanAction,
} from "@/lib/lab/stock-actions";
import { cn } from "@/lib/utils";
import { STOCK as C } from "../_lib/copy";
import { inputClass, newKey, num, Pop, selectClass } from "../../_components/pop";
import { dayWords } from "../../_lib/days";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* ─── Items (lead) ─────────────────────────────────────────────────── */

export function ItemDialog({ initial }: { initial?: ItemRow }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "",
    unitOfIssue: initial?.unitOfIssue ?? "",
    packSize: initial?.packSize?.toString() ?? "",
    testsPerUnit: initial?.testsPerUnit?.toString() ?? "",
    testCodes: initial?.testCodes.join(", ") ?? "",
    conceptIds: initial?.conceptIds.join(", ") ?? "",
    tracer: initial?.hmisTracerCode ?? "",
    min: initial?.minMonths?.toString() ?? "",
    max: initial?.maxMonths?.toString() ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const save = () =>
    act(async () => {
      const r = await saveStockItemAction({
        ...(initial ? { id: initial.id } : {}),
        name: f.name,
        kind: f.kind,
        unitOfIssue: f.unitOfIssue,
        packSize: num(f.packSize),
        testsPerUnit: num(f.testsPerUnit),
        testCodes: list(f.testCodes),
        conceptIds: list(f.conceptIds),
        hmisTracerCode: f.tracer.trim() || null,
        storageDeviceId: initial?.storageDeviceId ?? null,
        minMonths: num(f.min),
        maxMonths: num(f.max),
      });
      if (r.ok) setOpen(false);
      return r;
    }, C.item.saved);
  const I = C.item;
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={initial ? C.editItem : C.addItem}
        sr={initial?.name}
        variant={initial ? "ghost" : "secondary"}
        title={initial ? initial.name : C.addItem}
        lede={I.operational}
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {I.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={I.name}>
            <Input value={f.name} onChange={set("name")} maxLength={160} className={inputClass} />
          </Field>
          <Field label={I.kind}>
            <select value={f.kind} onChange={set("kind")} className={selectClass}>
              <option value="">{C.choose}</option>
              {Object.entries(I.kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={I.unit}>
            <Input
              value={f.unitOfIssue}
              onChange={set("unitOfIssue")}
              maxLength={40}
              className={inputClass}
            />
          </Field>
          <Field label={I.pack}>
            <Input
              type="number"
              min={1}
              value={f.packSize}
              onChange={set("packSize")}
              className={inputClass}
            />
          </Field>
          <Field label={I.testsPerUnit}>
            <Input
              type="number"
              min={0}
              step="any"
              value={f.testsPerUnit}
              onChange={set("testsPerUnit")}
              className={inputClass}
            />
          </Field>
          <Field label={I.tracer}>
            <Input
              value={f.tracer}
              onChange={set("tracer")}
              maxLength={40}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
          <Field label={I.testCodes}>
            <Input
              value={f.testCodes}
              onChange={set("testCodes")}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
          <Field label={I.concepts}>
            <Input
              value={f.conceptIds}
              onChange={set("conceptIds")}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
          <Field label={I.min}>
            <Input
              type="number"
              min={0}
              step="any"
              value={f.min}
              onChange={set("min")}
              className={inputClass}
            />
          </Field>
          <Field label={I.max}>
            <Input
              type="number"
              min={0}
              step="any"
              value={f.max}
              onChange={set("max")}
              className={inputClass}
            />
          </Field>
        </div>
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── Operational settings (lead) ──────────────────────────────────── */

export function SettingsDialog({ settings }: { settings: Settings }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    window: settings.expiryWindowDays?.toString() ?? "",
    lookBack: String(settings.lookBackMonths),
    countEvery: String(settings.countEveryDays),
    tolerance: settings.tolerancePct?.toString() ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const S = C.settingsForm;
  const save = () =>
    act(async () => {
      const r = await setStockSettingsAction({
        expiryWindowDays: num(f.window),
        lookBackMonths: num(f.lookBack),
        countEveryDays: num(f.countEvery),
        tolerancePct: num(f.tolerance),
      });
      if (r.ok) setOpen(false);
      return r;
    }, S.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={C.settings}
        title={C.settings}
        lede={S.lede}
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {S.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["window", S.window],
              ["lookBack", S.lookBack],
              ["countEvery", S.countEvery],
              ["tolerance", S.tolerance],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input type="number" min={0} value={f[k]} onChange={set(k)} className={inputClass} />
            </Field>
          ))}
        </div>
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── The count (ST-10) ────────────────────────────────────────────── */

export function CountDialog({ items }: { items: readonly ItemRow[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState<Record<string, { n: string; why: string }>>({});
  const lots = items.flatMap((i) => i.lots.map((l) => ({ ...l, item: i.name })));
  const save = () =>
    act(async () => {
      const lines = lots
        .filter((l) => counted[l.id]?.n.trim())
        .map((l) => ({
          lotId: l.id,
          counted: Number(counted[l.id]!.n),
          reason: counted[l.id]!.why.trim() || null,
        }));
      if (!lines.length) return { ok: false, error: "Type at least one count." };
      const r = await recordCountAction({ lines, clientKey: newKey() });
      if (r.ok) {
        setOpen(false);
        setCounted({});
      }
      return r;
    }, C.countForm.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={C.count}
        title={C.count}
        lede={C.countForm.lede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {C.countForm.save}
          </Button>
        }
      >
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-muted-foreground">
              {[
                C.columns[0],
                C.actions.lot,
                C.countForm.expected,
                C.countForm.counted,
                C.actions.reason,
              ].map((h) => (
                <th key={h} scope="col" className="py-2 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const c = counted[l.id] ?? { n: "", why: "" };
              const differs = c.n.trim() !== "" && Number(c.n) !== l.onHand;
              return (
                <tr key={l.id} className="border-border/60 border-t">
                  <td className="py-2 pr-3">{l.item}</td>
                  <td className="py-2 pr-3 font-mono">{l.lot}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{l.onHand}</td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      aria-label={`${C.countForm.counted} ${l.lot}`}
                      value={c.n}
                      onChange={(e) =>
                        setCounted((x) => ({ ...x, [l.id]: { ...c, n: e.target.value } }))
                      }
                      className={cn(inputClass, "w-24 font-mono tabular-nums")}
                    />
                  </td>
                  <td className="py-2">
                    {differs ? (
                      <Input
                        aria-label={`${C.actions.reason} ${l.lot}`}
                        value={c.why}
                        maxLength={300}
                        onChange={(e) =>
                          setCounted((x) => ({ ...x, [l.id]: { ...c, why: e.target.value } }))
                        }
                        className={inputClass}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── Switch-on (LA-6, lead) ───────────────────────────────────────── */

export function SwitchOnDialog({ items }: { items: readonly ItemRow[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const blank = { itemId: "", lot: "", useBy: "", quantity: "" };
  const [rows, setRows] = useState([blank]);
  const S = C.switchOnForm;
  const save = () =>
    act(async () => {
      const r = await grandfatherLotsAction({
        statement,
        lots: rows
          .filter((x) => x.itemId && x.lot.trim())
          .map((x) => ({
            itemId: x.itemId,
            lot: x.lot.trim(),
            useBy: x.useBy || null,
            quantity: Number(x.quantity || 0),
          })),
        clientKey: newKey(),
      });
      if (r.ok) {
        setOpen(false);
        setRows([blank]);
      }
      return r;
    }, S.saved);
  const patch = (i: number, k: keyof typeof blank, v: string) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={C.switchOn}
        title={C.switchOn}
        lede={S.lede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {S.save}
          </Button>
        }
      >
        <Field label={S.statement}>
          <Input
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </Field>
        {rows.map((x, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-4">
            <Field label={C.columns[0]!}>
              <select
                value={x.itemId}
                onChange={(e) => patch(i, "itemId", e.target.value)}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.actions.lot}>
              <Input
                value={x.lot}
                onChange={(e) => patch(i, "lot", e.target.value)}
                maxLength={60}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label={C.panel.lotColumns[2]!}>
              <Input
                type="date"
                value={x.useBy}
                onChange={(e) => patch(i, "useBy", e.target.value)}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label={C.actions.quantity}>
              <Input
                type="number"
                min={0}
                value={x.quantity}
                onChange={(e) => patch(i, "quantity", e.target.value)}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="w-fit"
          onClick={() => setRows((rs) => [...rs, blank])}
        >
          {S.add}
        </Button>
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── The item panel (§5.5) ────────────────────────────────────────── */

type Places = { sections: { id: string; name: string }[]; devices: { id: string; name: string }[] };

function Attr({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body-s">{children}</dd>
    </div>
  );
}

export function ItemPanel({
  item: i,
  lookBackMonths,
  lead,
  keeper,
  me,
  places,
}: {
  item: ItemRow;
  lookBackMonths: number;
  lead: boolean;
  keeper: boolean;
  me: string;
  places: Places;
}) {
  const [open, setOpen] = useState(false);
  const P = C.panel;
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Pop
        label={C.open}
        sr={i.name}
        variant="ghost"
        width="wide"
        title={i.name}
        open={open}
        setOpen={setOpen}
        action={
          <Link
            href={`/lab/stock/order?item=${i.id}`}
            target="_blank"
            className={buttonVariants({ variant: "secondary" })}
          >
            {P.print}
          </Link>
        }
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          <Attr label={P.use}>
            {i.averageUse === null
              ? LAB3.notEnoughHistory
              : P.monthlyUse(round(i.averageUse), i.unitOfIssue, lookBackMonths)}
          </Attr>
          <Attr label={P.levels}>{P.levelsWords(i.minMonths, i.maxMonths)}</Attr>
          <Attr label={P.toMax}>
            {i.toMaximum === null ? LAB3.noData : `${Math.ceil(i.toMaximum)} ${i.unitOfIssue}`}
          </Attr>
          <Attr label={P.daysOut}>{i.daysOut}</Attr>
          <Attr label={P.tracer}>{i.hmisTracerCode ?? "—"}</Attr>
          <Attr label={P.expected}>
            {i.expected ? (
              <span className="flex flex-col gap-1">
                {P.expectedWords(round(i.expected.expected), i.expected.issued)}
                {i.expected.listed ? <StatusWord tone="caution">{P.wastage}</StatusWord> : null}
              </span>
            ) : (
              LAB3.noData
            )}
          </Attr>
        </dl>

        <section aria-labelledby={`lots-${i.id}`} className="flex flex-col gap-2">
          <h3 id={`lots-${i.id}`} className="text-heading-s">
            {P.lots}
          </h3>
          <table className="text-body-s w-full border-collapse text-left">
            <thead>
              <tr className="text-caption text-muted-foreground">
                {P.lotColumns.map((h) => (
                  <th key={h} scope="col" className="py-2 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {i.lots.map((l) => (
                <tr key={l.id} className="border-border/60 border-t align-top">
                  <td className="py-2 pr-3 font-mono">{l.lot}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{l.onHand}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    {l.useBy ? dayWords(l.useBy) : C.noExpiry}
                  </td>
                  <td className="py-2">
                    <span className="flex flex-wrap items-center gap-1">
                      {l.useFirst ? (
                        <StatusWord icon glyph={CheckIcon}>
                          {P.useFirst}
                        </StatusWord>
                      ) : null}
                      <StatusWord
                        tone={l.refusal && l.refusal !== "not_accepted" ? "caution" : "neutral"}
                      >
                        {l.refusal === "expired" ? "Expired" : (C.states[l.state] ?? l.state)}
                      </StatusWord>
                      {l.basis ? (
                        <span className="text-caption text-muted-foreground">
                          {C.basis[l.basis]}
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-caption text-muted-foreground">{LAB3.useFirst}</p>
        </section>

        {keeper && i.lots.length ? <LotActions item={i} lead={lead} places={places} /> : null}
        <PlanBlock item={i} lead={lead} me={me} />
      </Pop>
      {lead ? <ItemDialog initial={i} /> : null}
    </div>
  );
}

/* ─── Lot actions: issue, set in use, quarantine, release, write off, adjust, return ── */

type Act = "issue" | "inUse" | "quarantine" | "release" | "writeOff" | "adjust" | "return";

function LotActions({ item, lead, places }: { item: ItemRow; lead: boolean; places: Places }) {
  const { pending, message, act } = useAct();
  const A = C.actions;
  const [lotId, setLotId] = useState(item.lots.find((l) => l.useFirst)?.id ?? item.lots[0]!.id);
  const [what, setWhat] = useState<Act>("issue");
  const [f, setF] = useState({
    quantity: "",
    to: "",
    device: "",
    kind: "reagent",
    concept: "",
    reason: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const lot = item.lots.find((l) => l.id === lotId)!;
  const acts: Act[] = [
    "issue",
    "inUse",
    "quarantine",
    ...(lead ? (["release"] as const) : []),
    "writeOff",
    "adjust",
    "return",
  ];
  const needsReason = what !== "issue" && what !== "inUse";
  const save = () =>
    act(async () => {
      const q = Number(f.quantity);
      switch (what) {
        case "issue":
          return issueStockAction({
            itemId: item.id,
            lotId,
            quantity: q,
            toKind: "bench",
            toRef: f.to || null,
            fefoReason: lot.useFirst ? null : f.reason.trim() || null,
            clientKey: newKey(),
          });
        case "inUse":
          return setLotInUseAction({
            lotId,
            deviceId: f.device || null,
            sectionId: f.device ? null : f.to || null,
            conceptId: f.concept.trim() || null,
            kind: f.kind,
          });
        case "quarantine":
          return quarantineLotAction({ lotId, reason: f.reason });
        case "release":
          return releaseLotFromQuarantineAction({ lotId, reason: f.reason });
        default:
          return recordMovementAction({
            kind: what === "writeOff" ? "write_off" : what === "adjust" ? "adjustment" : "return",
            lotId,
            quantity: q,
            reason: f.reason,
            clientKey: newKey(),
          });
      }
    }, A.saved);
  return (
    <section
      aria-labelledby={`act-${item.id}`}
      className="border-border flex flex-col gap-3 border-t pt-3"
    >
      <h3 id={`act-${item.id}`} className="text-heading-s">
        {A.title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={A.lot}>
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} className={selectClass}>
            {item.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lot}
              </option>
            ))}
          </select>
        </Field>
        <Field label={A.action}>
          <select
            value={what}
            onChange={(e) => setWhat(e.target.value as Act)}
            className={selectClass}
          >
            {acts.map((a) => (
              <option key={a} value={a}>
                {A[a]}
              </option>
            ))}
          </select>
        </Field>
        {what !== "inUse" && what !== "quarantine" && what !== "release" ? (
          <Field label={what === "adjust" ? A.signedQuantity : A.quantity}>
            <Input
              type="number"
              value={f.quantity}
              onChange={set("quantity")}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
        ) : null}
        {what === "issue" || what === "inUse" ? (
          <Field label={A.bench}>
            <select value={f.to} onChange={set("to")} className={selectClass}>
              <option value="">{C.choose}</option>
              {places.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {what === "inUse" ? (
          <>
            <Field label={A.device}>
              <select value={f.device} onChange={set("device")} className={selectClass}>
                <option value="">{C.choose}</option>
                {places.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={A.kind}>
              <select value={f.kind} onChange={set("kind")} className={selectClass}>
                {Object.entries(A.kinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={A.concept}>
              <Input
                value={f.concept}
                onChange={set("concept")}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
          </>
        ) : null}
        {needsReason || (what === "issue" && !lot.useFirst) ? (
          <Field label={what === "issue" ? A.fefoReason : A.reason}>
            <Input
              value={f.reason}
              onChange={set("reason")}
              maxLength={300}
              className={inputClass}
            />
          </Field>
        ) : null}
      </div>
      {lot.refusal && (what === "issue" || what === "inUse") ? (
        <StatusWord tone="caution" className="w-fit">
          {fill(
            {
              not_accepted: LAB3.lotNotAccepted,
              quarantined: LAB3.lotQuarantined,
              expired: LAB3.lotExpired,
              rejected: LAB3.lotRejected,
              finished: LAB3.lotFinished,
            }[lot.refusal],
            { lot: lot.lot },
          )}
        </StatusWord>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={save} disabled={pending}>
          {A.save}
        </Button>
        <Said message={message} />
      </div>
    </section>
  );
}

/* ─── The acceptance plan (LA-1, LA-2; lead) ───────────────────────── */

function PlanBlock({ item, lead, me }: { item: ItemRow; lead: boolean; me: string }) {
  const { pending, message, act } = useAct();
  const L = C.plan;
  const start = item.planDraft?.payload ?? item.plan?.payload;
  const [f, setF] = useState({
    method: start?.method ?? "",
    triggers: new Set<string>(start?.triggers ?? []),
    samples: start?.comparison?.samples.toString() ?? "",
    spread: start?.comparison?.spread ?? "",
    absolute: start?.comparison?.criterion.absolute?.toString() ?? "",
    percent: start?.comparison?.criterion.percent?.toString() ?? "",
    combine: start?.comparison?.criterion.combine ?? "larger",
    qcAlso: start?.comparison?.qcAlso ?? false,
    certificateAllowed: start?.certificateAllowed ?? false,
    source: start?.source ?? "",
  });
  const [note, setNote] = useState("");
  const save = () =>
    act(
      () =>
        saveAcceptancePlanAction({
          itemId: item.id,
          payload: {
            method: f.method,
            triggers: [...f.triggers],
            ...(f.method === "lot_comparison"
              ? {
                  comparison: {
                    samples: num(f.samples),
                    spread: f.spread,
                    criterion: {
                      ...(num(f.absolute) !== null ? { absolute: num(f.absolute) } : {}),
                      ...(num(f.percent) !== null ? { percent: num(f.percent) } : {}),
                      combine: f.combine,
                    },
                    qcAlso: f.qcAlso,
                  },
                }
              : {}),
            certificateAllowed: f.certificateAllowed,
            source: f.source,
          },
        }),
      L.saved,
    );
  const draft = item.planDraft;
  const p = item.plan?.payload;
  return (
    <section
      aria-labelledby={`plan-${item.id}`}
      className="border-border flex flex-col gap-3 border-t pt-3"
    >
      <h3 id={`plan-${item.id}`} className="text-heading-s">
        {L.title}
      </h3>
      <p className="text-body-s">
        {p ? (
          <>
            {C.plan.methods[p.method]}
            <span className="text-muted-foreground">
              {" "}
              · {C.panel.planInForce(item.plan!.version)}
            </span>
          </>
        ) : (
          <StatusWord tone="caution">{C.panel.noPlan}</StatusWord>
        )}
      </p>
      {lead ? (
        <>
          <p className="text-caption text-muted-foreground">{L.lede}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={L.method}>
              <select
                value={f.method}
                onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {Object.entries(L.methods).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="flex flex-col gap-1 sm:col-span-2">
              <legend className="text-body-s text-muted-foreground">{L.triggers}</legend>
              <div className="flex flex-wrap gap-3">
                {Object.entries(L.triggerWords).map(([k, v]) => (
                  <label
                    key={k}
                    className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0"
                  >
                    <input
                      type="checkbox"
                      checked={f.triggers.has(k)}
                      onChange={(e) =>
                        setF((x) => {
                          const t = new Set(x.triggers);
                          if (e.target.checked) t.add(k);
                          else t.delete(k);
                          return { ...x, triggers: t };
                        })
                      }
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
            {f.method === "lot_comparison" ? (
              <>
                {(
                  [
                    ["samples", L.samples],
                    ["absolute", L.absolute],
                    ["percent", L.percent],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={f[k]}
                      onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Field>
                ))}
                <Field label={L.combine}>
                  <select
                    value={f.combine}
                    onChange={(e) =>
                      setF((x) => ({ ...x, combine: e.target.value as "larger" | "both" }))
                    }
                    className={selectClass}
                  >
                    <option value="larger">{L.larger}</option>
                    <option value="both">{L.both}</option>
                  </select>
                </Field>
                <Field label={L.spread}>
                  <Input
                    value={f.spread}
                    onChange={(e) => setF((x) => ({ ...x, spread: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={f.qcAlso}
                    onChange={(e) => setF((x) => ({ ...x, qcAlso: e.target.checked }))}
                  />
                  {L.qcAlso}
                </label>
              </>
            ) : null}
            <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
              <input
                type="checkbox"
                checked={f.certificateAllowed}
                onChange={(e) => setF((x) => ({ ...x, certificateAllowed: e.target.checked }))}
              />
              {L.certificateAllowed}
            </label>
            <Field label={L.source}>
              <Input
                value={f.source}
                onChange={(e) => setF((x) => ({ ...x, source: e.target.value }))}
                maxLength={500}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" variant="secondary" onClick={save} disabled={pending}>
              {L.save}
            </Button>
            {draft ? (
              <>
                {draft.authoredBy === me ? (
                  <Field label={L.exception}>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      className={inputClass}
                    />
                  </Field>
                ) : null}
                <Button
                  type="button"
                  onClick={() =>
                    act(
                      () =>
                        signAcceptancePlanAction({
                          configId: draft.id,
                          exceptionNote: note.trim() || null,
                        }),
                      L.signed,
                    )
                  }
                  disabled={pending}
                >
                  {L.sign}
                </Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      <Said message={message} />
    </section>
  );
}
