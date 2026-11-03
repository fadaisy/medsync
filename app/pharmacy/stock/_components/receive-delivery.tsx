"use client";

import type { DeliveryFrom } from "@/content/pharmacy-stock";
import type { KeyboardEvent } from "react";
import { useState, useTransition } from "react";
import { XIcon } from "lucide-react";

import { addLocalLineAction } from "@/app/pharmacy/medicines-actions";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FORMS, LOCAL_REASONS, UNITS } from "@/content/pharmacy-medicines";
import { DELIVERY_FROM, STOCK } from "@/content/pharmacy-stock";
import { expiryForField, productByText, readScan } from "@/lib/pharmacy/stores/scan-fill";
import { PharmacyDialog } from "../../_components/pharmacy-dialog";
import { receiveDelivery } from "../actions";

/**
 * Receive a delivery (the Receive prototype on the Set-up canvas): the delivery note line by line in one
 * transaction (`receiveDelivery`). A scan fills a line's batch and expiry; a line can reject some packs, send
 * some straight on to another point, or add a medicine not stocked yet as a local line. A draft stays on this
 * device. Controlled medicines are not offered: they are received with a witness on the Controlled drugs page.
 */

export interface ReceiveMed {
  id: string;
  name: string;
  unit: string;
  pack: number | null;
  cold: boolean;
  gtin: string | null;
  /** Cash price, UGX per issue unit. */
  price: number | null;
}

type Why = keyof typeof STOCK.delivery.why;
interface Row {
  key: string;
  medId: string;
  batch: string;
  /** As typed: a month (2028-06, 06/2028) or a day (2028-06-30, 30/06/2028). */
  expiry: string;
  packs: string;
  per: string;
  cost: string;
  rejOpen: boolean;
  rej: string;
  rejWhy: Why;
  temp: string;
  splitOpen: boolean;
  split: string;
  splitTo: string;
  splitKey: string;
  newOpen: boolean;
  nGeneric: string;
  nStrength: string;
  nForm: string;
  nUnit: string;
  nReason: keyof typeof LOCAL_REASONS;
}
interface Draft {
  from: DeliveryFrom;
  ref: string;
  rows: Row[];
  at: string;
}
interface GrnRow {
  name: string;
  batch: string;
  expiry: string;
  got: string;
  off: string;
  cost: string;
}
interface Grn {
  from: string;
  ref: string;
  at: string;
  rows: GrnRow[];
  total: string | null;
}

const D = STOCK.delivery;
const key = () => crypto.randomUUID();
const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";
const SMALL =
  "border-input bg-card text-body-s focus-visible:shadow-focus h-9 rounded-md border px-2 outline-none";
const LINK =
  "text-primary text-body-s inline-flex min-h-8 items-center font-medium underline underline-offset-4";
const GRID =
  "lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_10rem_4.5rem_4.75rem_7rem_minmax(0,1fr)_2.75rem] lg:gap-2.5";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const blank = (med?: ReceiveMed): Row => ({
  key: key(),
  medId: med?.id ?? "",
  batch: "",
  expiry: "",
  packs: "",
  per: med?.pack ? String(med.pack) : "",
  cost: "",
  rejOpen: false,
  rej: "",
  rejWhy: "damaged",
  temp: "",
  splitOpen: false,
  split: "",
  splitTo: "",
  splitKey: key(),
  newOpen: false,
  nGeneric: "",
  nStrength: "",
  nForm: "",
  nUnit: "tablet",
  nReason: "not_on_national_list",
});

/** A typed expiry as the server takes it (YYYY-MM or YYYY-MM-DD); a month runs to its end. */
function parseExpiry(raw: string): { iso: string; end: Date; monthOnly: boolean } | null {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t);
  const dmy = /^(?:(\d{1,2})[/.-])?(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!iso && !dmy) return null;
  const year = Number(iso ? iso[1] : dmy![3]);
  const month = Number(iso ? iso[2] : dmy![2]);
  const day = Number((iso ? iso[3] : dmy![1]) ?? 0);
  if (month < 1 || month > 12) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (!day)
    return {
      iso: `${year}-${p2(month)}`,
      end: new Date(Date.UTC(year, month, 0)),
      monthOnly: true,
    };
  const end = new Date(Date.UTC(year, month - 1, day));
  if (end.getUTCMonth() !== month - 1) return null;
  return { iso: `${year}-${p2(month)}-${p2(day)}`, end, monthOnly: false };
}
const when = (d: Date, monthOnly: boolean) =>
  (monthOnly ? "end of " : `${String(d.getUTCDate()).padStart(2, "0")} `) +
  `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const num = (n: number) => n.toLocaleString("en-US");
const units = (n: number, unit: string) => `${num(n)} ${unit}${n === 1 ? "" : "s"}`;
const packsWord = (n: number) => `${num(n)} ${n === 1 ? "pack" : "packs"}`;
const ugx = (n: number) => `UGX ${num(Math.round(n))}`;
const digits = (s: string) => s.replace(/[^0-9]/g, "");
const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(id);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(id, JSON.stringify(d));
    else localStorage.removeItem(id);
  } catch {
    // A private window keeps no draft; the delivery itself is unaffected.
  }
}

function printGrn(g: Grn, point: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const C = D.grnCols;
  const cells = (r: GrnRow) =>
    [r.name, r.batch, r.expiry, r.got, r.off, r.cost].map((c) => `<td>${esc(c)}</td>`).join("");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(D.grn)}</title>
<style>body{font:14px system-ui,sans-serif;margin:32px;color:black}table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid silver}th{font-size:12px;color:dimgray}</style>
<h1 style="font-size:20px">${esc(D.grn)}</h1><p>${esc(D.grnLine(g.from, g.ref, point, g.at))}</p>
<table><tr>${[C.medicine, C.batch, C.expiry, C.got, C.off, C.cost].map((c) => `<th>${esc(c)}</th>`).join("")}</tr>
${g.rows.map((r) => `<tr>${cells(r)}</tr>`).join("")}</table>
<p>${esc(g.total ? D.total(g.total) : D.noCost)}</p><p>${esc(D.receivedBy)}: ____________________</p>`);
  w.document.close();
  w.print();
}

export function ReceiveDeliveryDialog({
  meds,
  point,
  points,
  from: offered,
  rulePct,
  today,
  canAddLocal,
}: {
  meds: ReceiveMed[];
  point: { id: string; name: string };
  /** Other dispensing points, for sending some straight on. */
  points: { id: string; name: string }[];
  from: readonly DeliveryFrom[];
  rulePct: number | null;
  /** YYYY-MM-DD at the hospital. */
  today: string;
  canAddLocal: boolean;
}) {
  const draftId = `medsync:receive-draft:${point.id}`;
  const [from, setFrom] = useState<DeliveryFrom>(offered[0] ?? "supplier");
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [local, setLocal] = useState<ReceiveMed[]>([]);
  const [scan, setScan] = useState("");
  const [scanMsg, setScanMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [newErr, setNewErr] = useState<string | null>(null);
  const [grn, setGrn] = useState<Grn | null>(null);
  const [adding, startAdding] = useTransition();

  const all = [...meds, ...local];
  const byId = new Map(all.map((m) => [m.id, m]));
  const now = new Date(`${today}T00:00:00Z`);

  const edit = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDraftMsg(null);
  };

  const open = () => {
    const d = readDraft(draftId);
    setGrn(null);
    setScan("");
    setScanMsg(null);
    setNewErr(null);
    if (d) {
      setFrom(offered.includes(d.from) ? d.from : (offered[0] ?? "supplier"));
      setRef(d.ref);
      setRows(d.rows.length ? d.rows : [blank()]);
      setDraftMsg(D.draftBack(d.at));
    } else startAgain();
  };
  const startAgain = () => {
    setFrom(offered[0] ?? "supplier");
    setRef("");
    setRows([blank()]);
    setDraftMsg(null);
    writeDraft(draftId, null);
  };
  const saveDraft = () => {
    const at = clock(new Date());
    writeDraft(draftId, { from, ref, rows, at });
    setDraftMsg(D.draftSaved(at));
  };

  /** 5.11 SC-1 to SC-3: a scan fills the first line of its medicine with no batch, or counts one more pack. */
  const read = (raw: string) => {
    setScan("");
    if (!raw.trim()) return;
    const o = readScan(
      raw,
      all.map((m) => ({ id: m.id, name: m.name, gtin: m.gtin, active: true })),
    );
    if (o.kind === "refused") return setScanMsg({ text: o.note, warn: true });
    const medId = o.kind === "gs1" ? o.productId : productByText(all, o.text);
    const batch = o.kind === "gs1" ? (o.scan.batch ?? "") : "";
    const expiry = o.kind === "gs1" ? expiryForField(o.scan) : "";
    const med = medId ? byId.get(medId) : undefined;
    const rs = [...rows];
    let msg: string;
    const same = med && batch ? rs.findIndex((r) => r.medId === med.id && r.batch === batch) : -1;
    const empty = rs.findIndex((r) => (med ? r.medId === med.id : !r.medId) && !r.batch.trim());
    if (same >= 0) {
      const packs = String((Number(rs[same]!.packs) || 0) + 1);
      rs[same] = { ...rs[same]!, packs };
      msg = D.onePack(same + 1, packs);
    } else if (empty >= 0) {
      const r = rs[empty]!;
      rs[empty] = {
        ...r,
        medId: med?.id ?? r.medId,
        per: r.per || (med?.pack ? String(med.pack) : ""),
        batch: batch || r.batch,
        expiry: expiry || r.expiry,
        packs: r.packs || "1",
      };
      msg = med ? D.filled(empty + 1, med.name) : D.unlinked(empty + 1);
    } else {
      rs.push({ ...blank(med), batch, expiry, packs: "1" });
      msg = med ? D.newLine(rs.length) : D.unlinked(rs.length);
    }
    setRows(rs);
    setDraftMsg(null);
    setScanMsg({ text: `${msg} ${o.note}`.trim(), warn: !med });
  };
  const onScanKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    read(e.currentTarget.value);
  };

  const addLocal = (i: number) => {
    const r = rows[i]!;
    if (!r.nGeneric.trim() || !r.nStrength.trim()) return setNewErr(D.newMed.required);
    const id = key();
    startAdding(async () => {
      setNewErr(null);
      const res = await addLocalLineAction({
        clientKey: id,
        generic: r.nGeneric.trim(),
        strength: r.nStrength.trim(),
        form: r.nForm || null,
        route: null,
        unit: r.nUnit,
        cls: null,
        packs: Number(r.per) > 0 ? [Number(r.per)] : [],
        reason: r.nReason,
      });
      if (!res.ok) return setNewErr(res.error);
      const name = [r.nGeneric.trim(), r.nStrength.trim(), r.nForm.toLowerCase()]
        .filter(Boolean)
        .join(" ");
      setLocal((l) => [
        ...l,
        {
          id,
          name,
          unit: r.nUnit,
          pack: Number(r.per) || null,
          cold: false,
          gtin: null,
          price: null,
        },
      ]);
      edit(i, { medId: id, newOpen: false });
    });
  };

  // What each line comes to, what it says, and what still stops the delivery.
  const problems: string[] = [];
  const made: string[] = [];
  const view = rows.map((r, i) => {
    const n = i + 1;
    const m = byId.get(r.medId);
    const packs = Number(r.packs) || 0;
    const per = Number(r.per) || 0;
    const rej = r.rejOpen ? Math.min(Number(r.rej) || 0, packs) : 0;
    const kept = Math.max(packs - rej, 0);
    const qty = kept * per;
    const cost = Number(r.cost) || 0;
    const unitCost = cost && per ? cost / per : 0;
    const exp = parseExpiry(r.expiry);
    const end = exp?.end ?? null;
    const monthOnly = exp?.monthOnly ?? false;
    const split = r.splitOpen ? Number(r.split) || 0 : 0;
    const notes: { text: string; warn?: boolean }[] = [];
    if (!m) problems.push(D.problem.med(n));
    else if (!r.batch.trim()) problems.push(D.problem.batch(n));
    else if (!end) problems.push(D.problem.expiry(n));
    else if (!packs || !per) problems.push(D.problem.count(n, m.unit));
    if (m && local.some((l) => l.id === m.id)) notes.push({ text: D.note.local });
    if (end) {
      const days = Math.round((end.getTime() - now.getTime()) / 86_400_000);
      if (days < 0) {
        notes.push({ text: D.note.expired(when(end, monthOnly)), warn: true });
        problems.push(D.problem.expired(n));
      } else if (days < 183)
        notes.push({
          text: D.note.short(Math.max(1, Math.round(days / 30.4)), when(end, monthOnly)),
          warn: true,
        });
    }
    if (m?.cold && kept) {
      const t = r.temp.trim() === "" ? null : Number(r.temp);
      if (t === null) problems.push(D.problem.temp(n));
      else if (Number.isNaN(t) || t < 2 || t > 8) {
        notes.push({ text: D.note.coldBad(r.temp), warn: true });
        problems.push(D.problem.cold(n));
      } else notes.push({ text: D.note.coldOk(r.temp) });
    }
    if (m && per && m.pack && per !== m.pack) notes.push({ text: D.note.pack(per, m.pack) });
    if (rej) notes.push({ text: D.note.rejected(packsWord(rej), D.why[r.rejWhy]) });
    if (m && r.splitOpen) {
      if (!r.splitTo) problems.push(D.problem.sendTo(n));
      else if (split > kept) problems.push(D.problem.sendMany(n, packsWord(kept)));
      else if (split)
        notes.push({
          text: D.note.sendOn(
            packsWord(split),
            units(split * per, m.unit),
            points.find((p) => p.id === r.splitTo)?.name ?? "",
            packsWord(kept - split),
          ),
        });
    }
    if (m && unitCost) {
      if (m.price === null)
        notes.push({
          text: D.note.noPrice(
            rulePct === null ? null : ugx(Math.ceil(unitCost * (1 + rulePct / 100))),
            m.unit,
          ),
        });
      else if (unitCost > m.price)
        notes.push({ text: D.note.overPrice(ugx(unitCost), ugx(m.price), m.unit), warn: true });
    }
    if (m && qty) made.push(units(qty, m.unit));
    return {
      r,
      m,
      n,
      packs,
      per,
      rej,
      kept,
      qty,
      cost,
      unitCost,
      end,
      monthOnly,
      iso: exp?.iso ?? "",
      split,
      notes,
    };
  });
  const total = view.reduce((t, v) => t + (v.m && v.unitCost ? v.kept * v.cost : 0), 0);
  const live = view.filter((v) => v.kept > 0);
  if (rows.length && !live.length && !problems.length) problems.push(D.problem.nothing);
  const summary = D.summary(live.length, made.join(", "), total ? ugx(total) : null);

  const submit = async (clientKey: string) => {
    if (problems.length)
      return { ok: false as const, code: "invalid" as const, error: problems[0]! };
    const res = await receiveDelivery({
      clientKey,
      from,
      deliveryRef: ref,
      lines: live.map((v) => ({
        clientKey: v.r.key,
        productId: v.m!.id,
        batchNumber: v.r.batch.trim(),
        expiry: v.iso,
        quantity: v.qty,
        unitCost: v.unitCost ? Math.round(v.unitCost * 100) / 100 : null,
        note:
          [
            v.rej ? D.noteText.rejected(v.rej, D.why[v.r.rejWhy]) : null,
            v.m!.cold && v.r.temp ? D.noteText.temp(v.r.temp) : null,
          ]
            .filter(Boolean)
            .join("; ") || undefined,
        sendOn:
          v.split && v.r.splitTo
            ? { clientKey: v.r.splitKey, toPointId: v.r.splitTo, quantity: v.split * v.per }
            : null,
      })),
    });
    if (!res.ok) return res;
    writeDraft(draftId, null);
    setGrn({
      from: DELIVERY_FROM[from],
      ref: ref.trim() || D.noRef,
      at: `${when(now, false)}, ${clock(new Date())}`,
      total: total ? ugx(total) : null,
      rows: view
        .filter((v) => v.m)
        .map((v) => ({
          name: v.m!.name,
          batch: v.r.batch || "—",
          expiry: v.end ? when(v.end, v.monthOnly) : "—",
          got: v.qty ? units(v.qty, v.m!.unit) : "—",
          off: v.rej ? `${packsWord(v.rej)}, ${D.why[v.r.rejWhy]}` : "—",
          cost: v.unitCost && v.kept ? ugx(v.kept * v.cost) : "—",
        })),
    });
    return "stay" as const;
  };

  return (
    <PharmacyDialog
      label={D.open}
      title={grn ? D.done(point.name) : D.title(point.name)}
      description={grn ? D.doneLede : D.lede}
      submit={D.submit(live.length)}
      cancelLabel={STOCK.actions.cancel}
      doneLabel={D.close}
      variant="primary"
      width="xl"
      done={!!grn}
      onOpen={open}
      onSave={(clientKey) => submit(clientKey)}
    >
      {grn ? (
        <section
          aria-label={D.grn}
          className="border-border flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-heading-s text-foreground">{D.grn}</h3>
              <p className="text-body-s text-muted-foreground">
                {D.grnLine(grn.from, grn.ref, point.name, grn.at)}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => printGrn(grn, point.name)}
            >
              {D.print}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-body-s w-full">
              <thead>
                <tr className="text-caption text-muted-foreground text-left">
                  {Object.values(D.grnCols).map((c) => (
                    <th key={c} className="py-1.5 pr-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grn.rows.map((g, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="py-2 pr-3">{g.name}</td>
                    <td className="py-2 pr-3 font-mono">{g.batch}</td>
                    <td className="py-2 pr-3">{g.expiry}</td>
                    <td className="py-2 pr-3 tabular-nums">{g.got}</td>
                    <td className="py-2 pr-3">{g.off}</td>
                    <td className="py-2 pr-3 tabular-nums">{g.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-body-s text-foreground">{grn.total ? D.total(grn.total) : D.noCost}</p>
        </section>
      ) : (
        <>
          <div className="bg-muted grid gap-3 rounded-lg p-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-ink-700 font-medium">{D.from}</span>
              <select
                className={SELECT}
                value={from}
                onChange={(e) => setFrom(e.target.value as DeliveryFrom)}
              >
                {offered.map((f) => (
                  <option key={f} value={f}>
                    {DELIVERY_FROM[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-ink-700 font-medium">{D.ref}</span>
              <Input
                value={ref}
                maxLength={120}
                placeholder={D.refHint}
                onChange={(e) => setRef(e.target.value)}
                className="min-h-11"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-caption text-ink-700 font-medium">{D.into}</span>
              <span className="text-body-s text-foreground flex min-h-11 items-center">
                {point.name}
              </span>
            </div>
          </div>

          {draftMsg ? (
            <p className="text-body-s text-muted-foreground flex flex-wrap items-center gap-x-3">
              {draftMsg}
              <button type="button" className={LINK} onClick={startAgain}>
                {D.startAgain}
              </button>
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <Input
                aria-label={D.scan}
                value={scan}
                placeholder={D.scanHint}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={onScanKey}
                className="min-h-11 flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => read(scan)}
              >
                {D.read}
              </Button>
            </div>
            <p role="status" className="text-body-s text-muted-foreground">
              {scanMsg ? (
                scanMsg.warn ? (
                  <StatusWord tone="caution">{scanMsg.text}</StatusWord>
                ) : (
                  scanMsg.text
                )
              ) : (
                D.scanHelp
              )}
            </p>
          </div>

          <div className="flex flex-col">
            <div
              aria-hidden="true"
              className={`${GRID} text-caption text-muted-foreground hidden pb-1.5 font-medium lg:grid`}
            >
              <span>{D.cols.medicine}</span>
              <span>{D.cols.batch}</span>
              <span>{D.cols.expiry}</span>
              <span>{D.cols.packs}</span>
              <span>{D.cols.per}</span>
              <span>{D.cols.cost}</span>
              <span className="text-right">{D.cols.qty}</span>
              <span />
            </div>
            {view.map(({ r, m, n, kept, qty, unitCost, cost, notes }, i) => (
              <div key={r.key} className="border-border flex flex-col gap-2 border-t py-3">
                <div className={`${GRID} grid grid-cols-2 gap-2`}>
                  <label className="col-span-2 flex flex-col gap-1 lg:col-span-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.medicine} · {n}
                    </span>
                    <select
                      className={SELECT}
                      value={r.newOpen ? "__new" : r.medId}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id === "__new") return edit(i, { medId: "", newOpen: true });
                        const med = byId.get(id);
                        edit(i, {
                          medId: id,
                          newOpen: false,
                          per: med?.pack ? String(med.pack) : r.per,
                        });
                      }}
                    >
                      <option value="">{D.choose}</option>
                      {all.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                      {canAddLocal ? <option value="__new">{D.addNew}</option> : null}
                    </select>
                    {m ? (
                      <span className="text-caption text-muted-foreground">
                        {D.countedPer(m.unit)}
                      </span>
                    ) : null}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.batch}
                    </span>
                    <Input
                      value={r.batch}
                      maxLength={60}
                      onChange={(e) => edit(i, { batch: e.target.value })}
                      className="min-h-11 font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.expiry}
                    </span>
                    <Input
                      value={r.expiry}
                      maxLength={10}
                      placeholder={D.expiryHint}
                      onChange={(e) => edit(i, { expiry: e.target.value })}
                      className="min-h-11 tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.packs}
                    </span>
                    <Input
                      inputMode="numeric"
                      value={r.packs}
                      onChange={(e) => edit(i, { packs: digits(e.target.value) })}
                      className="min-h-11 text-right tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.per}
                    </span>
                    <Input
                      inputMode="numeric"
                      value={r.per}
                      onChange={(e) => edit(i, { per: digits(e.target.value) })}
                      className="min-h-11 text-right tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-700 font-medium lg:sr-only">
                      {D.cols.cost}
                    </span>
                    <Input
                      inputMode="numeric"
                      value={r.cost}
                      onChange={(e) => edit(i, { cost: digits(e.target.value) })}
                      className="min-h-11 text-right tabular-nums"
                    />
                    {unitCost && m ? (
                      <span className="text-caption text-muted-foreground text-right">
                        {D.perUnit(ugx(unitCost), m.unit)}
                      </span>
                    ) : null}
                  </label>
                  <div className="flex flex-col gap-0.5 text-right lg:pt-2.5">
                    <span className="text-body-s text-foreground font-medium tabular-nums">
                      {m && qty ? units(qty, m.unit) : "—"}
                    </span>
                    {unitCost && kept ? (
                      <span className="text-caption text-muted-foreground tabular-nums">
                        {ugx(kept * cost)}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={D.remove(n)}
                    className="size-11 justify-self-end p-0"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>

                {r.newOpen ? (
                  <div className="bg-muted flex flex-col gap-2 rounded-lg p-3">
                    <div className="grid gap-2 sm:grid-cols-5">
                      <label className="text-caption text-ink-700 flex flex-col gap-1 font-medium">
                        {D.newMed.generic}
                        <Input
                          value={r.nGeneric}
                          maxLength={160}
                          onChange={(e) => edit(i, { nGeneric: e.target.value })}
                          className="min-h-11"
                        />
                      </label>
                      <label className="text-caption text-ink-700 flex flex-col gap-1 font-medium">
                        {D.newMed.strength}
                        <Input
                          value={r.nStrength}
                          maxLength={60}
                          onChange={(e) => edit(i, { nStrength: e.target.value })}
                          className="min-h-11"
                        />
                      </label>
                      <label className="text-caption text-ink-700 flex flex-col gap-1 font-medium">
                        {D.newMed.form}
                        <select
                          className={SELECT}
                          value={r.nForm}
                          onChange={(e) => edit(i, { nForm: e.target.value })}
                        >
                          <option value="" />
                          {FORMS.map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-caption text-ink-700 flex flex-col gap-1 font-medium">
                        {D.newMed.unit}
                        <select
                          className={SELECT}
                          value={r.nUnit}
                          onChange={(e) => edit(i, { nUnit: e.target.value })}
                        >
                          {UNITS.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-caption text-ink-700 flex flex-col gap-1 font-medium">
                        {D.newMed.reason}
                        <select
                          className={SELECT}
                          value={r.nReason}
                          onChange={(e) => edit(i, { nReason: e.target.value as Row["nReason"] })}
                        >
                          {Object.entries(LOCAL_REASONS).map(([k, w]) => (
                            <option key={k} value={k}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        className="min-h-11"
                        disabled={adding}
                        onClick={() => addLocal(i)}
                      >
                        {D.newMed.add}
                      </Button>
                      <button
                        type="button"
                        className={LINK}
                        onClick={() => edit(i, { newOpen: false })}
                      >
                        {D.newMed.cancel}
                      </button>
                      {newErr ? <StatusWord tone="caution">{newErr}</StatusWord> : null}
                    </div>
                  </div>
                ) : null}

                {m ? (
                  <div className="text-body-s text-ink-700 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      className={LINK}
                      onClick={() => edit(i, { rejOpen: !r.rejOpen, rej: "" })}
                    >
                      {r.rejOpen ? D.keepAll : D.reject}
                    </button>
                    {points.length ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() =>
                          edit(i, { splitOpen: !r.splitOpen, split: "", splitTo: points[0]!.id })
                        }
                      >
                        {r.splitOpen ? D.keepHere : D.sendOn}
                      </button>
                    ) : null}
                    {r.rejOpen ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <input
                          aria-label={`${D.cols.packs} · ${D.rejected}`}
                          inputMode="numeric"
                          value={r.rej}
                          onChange={(e) => edit(i, { rej: digits(e.target.value) })}
                          className={`${SMALL} w-16 text-right`}
                        />
                        {D.rejected}
                        <select
                          aria-label={D.reject}
                          className={SMALL}
                          value={r.rejWhy}
                          onChange={(e) => edit(i, { rejWhy: e.target.value as Why })}
                        >
                          {Object.entries(D.why).map(([k, w]) => (
                            <option key={k} value={k}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </span>
                    ) : null}
                    {r.splitOpen ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {D.send}
                        <input
                          aria-label={`${D.cols.packs} · ${D.sendOn}`}
                          inputMode="numeric"
                          value={r.split}
                          onChange={(e) => edit(i, { split: digits(e.target.value) })}
                          className={`${SMALL} w-16 text-right`}
                        />
                        {D.straightTo}
                        <select
                          aria-label={D.sendOn}
                          className={SMALL}
                          value={r.splitTo}
                          onChange={(e) => edit(i, { splitTo: e.target.value })}
                        >
                          {points.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    ) : null}
                    {m.cold ? (
                      <label className="inline-flex items-center gap-2 font-medium">
                        {D.temp}
                        <input
                          inputMode="decimal"
                          value={r.temp}
                          placeholder="°C"
                          onChange={(e) =>
                            edit(i, { temp: e.target.value.replace(/[^0-9.-]/g, "") })
                          }
                          className={`${SMALL} w-20 text-right`}
                        />
                        <span className="text-muted-foreground font-normal">{D.tempHint}</span>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {notes.map((t, j) => (
                  <p key={j} className="text-body-s text-muted-foreground">
                    {t.warn ? <StatusWord tone="caution">{t.text}</StatusWord> : t.text}
                  </p>
                ))}
              </div>
            ))}
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setRows((rs) => [...rs, blank()])}
              >
                {D.addLine}
              </Button>
              <span className="text-caption text-muted-foreground">{D.sameBatch}</span>
            </div>
          </div>

          <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-body-s text-foreground font-medium">{summary}</span>
              <span className="text-caption text-muted-foreground">
                {problems.length ? D.toFinish(problems.length) : D.ready} {D.controlled}
              </span>
            </div>
            <Button type="button" variant="secondary" className="min-h-11" onClick={saveDraft}>
              {D.draft}
            </Button>
          </div>
        </>
      )}
    </PharmacyDialog>
  );
}
