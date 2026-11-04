import type { LineInfo } from "./line-info";
import type { ClaimLine, LineSource, LineWorld, ReceiveDelivery, ReceiveLine, ReceiveMed, ReceiveOrder, ReceiveRules } from "./types";

import { RC } from "@/content/pharmacy-receive";
import { addDaysIso, daysBetween, hm, money, plural } from "./format";
import { lineInfo } from "./line-info";

/** A line waiting to be counted (`blankLine`): the medicine's usual pack and price, nothing typed. */
export function blankLine(
  id: string,
  d: Pick<ReceiveDelivery, "lines">,
  m: Pick<ReceiveMed, "id" | "per" | "cost">,
  source: LineSource,
  x: Partial<ReceiveLine> = {},
): ReceiveLine {
  return {
    id,
    no: d.lines.reduce((a, l) => Math.max(a, l.no), 0) + 1,
    medId: m.id,
    source,
    orderLineId: null,
    batch: "",
    exp: "",
    packs: "",
    per: String(m.per),
    notePacks: "",
    cost: m.cost ? String(m.cost) : "",
    temp: "",
    decision: "",
    approvedBy: "",
    approvalAsked: false,
    regReason: "",
    regNote: "",
    rejOn: false,
    rejPacks: "",
    rejWhy: "",
    rejFate: "driver",
    vvm: "",
    freeze: "",
    rank: 0,
    owedFrozen: null,
    witnessName: "",
    ...x,
  };
}

/** Every blocking problem, and whether a line is counted at all. Finishing needs none, and one. */
export function deliveryProblems(d: ReceiveDelivery, w: LineWorld) {
  const infos = d.lines.map((l) => ({ l, i: lineInfo(l, d, w) }));
  const problems = infos.flatMap((x) => x.i.problems.map((text) => ({ lineId: x.l.id, text })));
  const counted = infos.filter((x) => x.i.counted);
  const value = infos.reduce((a, x) => a + (x.i.value ?? 0), 0);
  return { infos, problems, counted, value, blocked: problems.length > 0 || counted.length === 0 };
}

/** Three-way check (§D2): order prices, the note, the invoice. */
export function matchRows(d: ReceiveDelivery, w: LineWorld, rules: ReceiveRules) {
  const { counted, value } = deliveryProblems(d, w);
  const M = RC.match;
  const out: { cls: "ok" | "warn" | ""; text: string }[] = [];
  const prices = counted.filter((x) => x.i.priceDiff).length;
  if (d.orderId) out.push(prices ? { cls: "warn", text: M.priced(prices) } : { cls: "ok", text: M.pricesOk });
  const notes = counted.filter((x) => x.l.notePacks !== "" && Number(x.l.notePacks) !== x.i.packs).length;
  out.push(notes ? { cls: "warn", text: M.differ(notes) } : { cls: "ok", text: M.countsOk });
  if (d.invoiceTotal) {
    const total = Number(d.invoiceTotal);
    const gap = total - value;
    out.push(
      Math.abs(gap) <= Math.max(rules.invUgx, (value * rules.invPct) / 100)
        ? { cls: "ok", text: M.invoiceOk(money(total)) }
        : { cls: "warn", text: M.invoiceGap(money(Math.abs(gap)), gap > 0) },
    );
  } else out.push({ cls: "", text: M.noInvoice });
  return out;
}

/** §C3: sent + lead days. */
export function orderDue(o: Pick<ReceiveOrder, "sentOn" | "leadDays" | "state">, today: string) {
  const dueIso = addDaysIso(o.sentOn, o.leadDays);
  const left = daysBetween(today, dueIso);
  const open = o.state !== "closed";
  const D = RC.due;
  return {
    dueIso,
    left,
    late: open && left <= 0,
    text: !open ? "" : left < 0 ? D.late(-left) : left === 0 ? D.today : D.inDays(left),
    tone: (left < 0 ? "bad" : left === 0 ? "warn" : "info") as "bad" | "warn" | "info",
  };
}

/** §E2: short on the note, rejected (not short-dated), charged above the order price. */
export function claimLines(infos: readonly { l: { medId: string; notePacks: string; cost: string }; i: LineInfo }[]) {
  const out: ClaimLine[] = [];
  for (const { l, i } of infos) {
    const cost = Number(l.cost) || 0;
    if (l.notePacks !== "" && i.packs < Number(l.notePacks)) {
      const packs = Number(l.notePacks) - i.packs;
      out.push({ medId: l.medId, kind: RC.claim.short, packs, value: packs * cost });
    }
    if (i.rej > 0 && i.why && i.why !== "short_dated")
      out.push({ medId: l.medId, kind: RC.why[i.why], packs: i.rej, value: i.rej * cost });
    if (i.priceDiff && i.priceDiff.pct > 0 && i.acc > 0)
      out.push({
        medId: l.medId,
        kind: RC.claim.above,
        packs: i.acc,
        value: Math.round(i.acc * (cost - i.priceDiff.ref)),
      });
  }
  return out;
}

/** The cold-chain timer: amber past two-thirds of the limit, red past it. */
export function coldTimer(mins: number, limit: number) {
  const over = mins > limit;
  return {
    text: over ? RC.cold.over(hm(mins), limit) : RC.cold.within(hm(mins), limit),
    tone: (over ? "bad" : mins > (limit * 2) / 3 ? "warn" : "") as "bad" | "warn" | "",
  };
}

/** The order's state after its lines change. */
export const orderState = (lines: readonly { packs: number; received: number }[]): ReceiveOrder["state"] =>
  lines.every((l) => l.received >= l.packs) ? "closed" : lines.some((l) => l.received > 0) ? "part" : "sent";

/** What is still owed, for chasing and the order card. */
export const owedLines = (o: ReceiveOrder) => o.lines.filter((l) => l.packs - l.received > 0);

/** The chase message (§C3), editable before it is copied. */
export function chaseText(o: ReceiveOrder, w: { meds: LineWorld["meds"]; placeName: string }, today: string) {
  const owed = owedLines(o).map((l) => ({
    name: w.meds.find((m) => m.id === l.medId)?.name ?? "",
    packs: plural(l.packs - l.received, "pack"),
  }));
  void today;
  return RC.chase(o.supplier, o.ref, o.sentOn, addDaysIso(o.sentOn, o.leadDays), owed, w.placeName);
}
