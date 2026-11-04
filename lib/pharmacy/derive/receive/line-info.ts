import type {
  LineWorld,
  ReceiveDelivery,
  ReceiveLine,
  ReceiveMed,
  ReceiveOrderLine,
  ReceiveRecall,
  RejWhy,
} from "./types";

import { RC } from "@/content/pharmacy-receive";
import { num, plural } from "./format";

/** 2028-06, 2028-06-30, 06/2028 or 30/06/2028, as ISO; null when it is none of them. */
export function normExp(raw: string): string | null {
  const v = String(raw || "").trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v)))
    return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? v : null;
  if ((m = /^(\d{2})\/(\d{4})$/.exec(v)))
    return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1]}` : null;
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v))) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return utc(y!, m! - 1, d!);
};

/** Days from `today` to the end of the expiry; a month-only expiry runs to its last day. */
export function daysLeft(exp: string, today: string): number | null {
  const e = normExp(exp);
  if (!e) return null;
  const [y, m, d] = e.split("-").map(Number);
  const end = d ? utc(y!, m! - 1, d) : utc(y!, m!, 0);
  return Math.round((end - dayOf(today)) / 86_400_000);
}

export interface PriceDiff {
  pct: number;
  ref: number;
  fromOrder: boolean;
}
export interface Word {
  word: string;
  caution: boolean;
}
export interface LineInfo {
  rc: ReceiveRecall | null;
  priceDiff: PriceDiff | null;
  vvmBad: boolean;
  frozen: boolean;
  m: ReceiveMed;
  packs: number;
  per: number;
  counted: boolean;
  rej: number;
  why: "" | RejWhy;
  fate: "driver" | "quarantine";
  acc: number;
  accUnits: number;
  rejUnits: number;
  days: number | null;
  expired: boolean;
  short: boolean;
  temp: number | null;
  tempBad: boolean;
  owed: number;
  ol: ReceiveOrderLine | null;
  words: Word[];
  problems: string[];
  unitsText: string;
  value: number | null;
}

const has = (s: string) => String(s).trim() !== "";

/** One line, worked out (the prototype's `info`). The same checks, in the same order, on the device and the server. */
export function lineInfo(l: ReceiveLine, d: ReceiveDelivery, w: LineWorld): LineInfo {
  const m = w.meds.find((x) => x.id === l.medId);
  if (!m) throw new Error(`lineInfo: no medicine ${l.medId}`);
  const P = RC.problem;
  const packs = Number(l.packs) || 0;
  const per = Number(l.per) || 0;
  const counted = packs > 0;
  const dec = l.decision;
  let rej = l.rejOn ? Number(l.rejPacks) || 0 : 0;
  let why: "" | RejWhy = l.rejOn ? l.rejWhy : "";
  let fate = l.rejFate;
  if (dec === "reject") {
    rej = packs;
    why = "short_dated";
    fate = "driver";
  }
  const acc = Math.max(0, packs - rej);
  const days = l.exp ? daysLeft(l.exp, w.today) : null;
  const badExp = !!l.exp && days === null;
  const expired = days !== null && days < 0;
  const short = days !== null && days >= 0 && days < w.rules.look;
  const temp = String(l.temp).trim() === "" ? null : Number(l.temp);
  const tempBad =
    m.cold &&
    temp !== null &&
    (Number.isNaN(temp) || temp < w.rules.tempLow || temp > w.rules.tempHigh);
  const batch = String(l.batch).trim().toUpperCase();
  const rc =
    w.recalls.find(
      (r) => r.medId === l.medId && has(batch) && (!r.batch || r.batch.toUpperCase() === batch),
    ) ?? null;
  const order = d.orderId ? w.orders.find((o) => o.id === d.orderId) : undefined;
  const ol = (l.orderLineId && order?.lines.find((x) => x.id === l.orderLineId)) || null;
  let owed = ol ? ol.packs - ol.received : 0;
  if (l.owedFrozen !== null) owed = l.owedFrozen;
  const olAcc = l.orderLineId
    ? d.lines
        .filter((x) => x.orderLineId === l.orderLineId)
        .reduce((a, x) => {
          const p = Number(x.packs) || 0;
          const r = x.decision === "reject" ? p : x.rejOn ? Number(x.rejPacks) || 0 : 0;
          return a + Math.max(0, p - r);
        }, 0)
    : acc;
  const priceRef = ol?.price ? ol.price : d.kind === "supplier" && m.cost ? m.cost : null;
  let priceDiff: PriceDiff | null = null;
  if (priceRef && l.cost !== "" && Number(l.cost) > 0) {
    const pct = Math.round(((Number(l.cost) - priceRef) / priceRef) * 100);
    if (Math.abs(pct) > w.rules.priceTol)
      priceDiff = { pct, ref: priceRef, fromOrder: !!ol?.price };
  }
  const vvmBad = m.vaccine && (l.vvm === "3" || l.vvm === "4");
  const frozen = m.vaccine && l.freeze === "tripped";
  const words: Word[] = [];
  const problems: string[] = [];
  const no = l.no;
  if (counted) {
    if (l.notePacks !== "" && Number(l.notePacks) !== packs) {
      const diff = packs - Number(l.notePacks);
      words.push({
        word: `${plural(Math.abs(diff), "pack")}${diff < 0 ? RC.word.fewer : RC.word.more}`,
        caution: true,
      });
    } else if (l.notePacks === "" && ol && olAcc < owed) {
      if (d.state === "counting")
        words.push({ word: `${plural(owed - olAcc, "pack")}${RC.word.left}`, caution: false });
      else words.push({ word: `${plural(owed - olAcc, "pack")}${RC.word.short}`, caution: true });
    }
    if (d.orderId && !l.orderLineId) words.push({ word: RC.word.notOnOrder, caution: true });
    if (expired) words.push({ word: RC.word.expired, caution: true });
    else if (short) words.push({ word: RC.word.under(w.rules.look), caution: true });
    if (why === "damaged") words.push({ word: RC.why.damaged, caution: true });
    if (why === "wrong_product") words.push({ word: RC.why.wrong_product, caution: true });
    if (tempBad) words.push({ word: RC.why.cold_chain, caution: true });
    if (rc) words.push({ word: RC.why.recall, caution: true });
    if (priceDiff)
      words.push({ word: RC.word.price(priceDiff.pct, priceDiff.fromOrder), caution: true });
    if (vvmBad) words.push({ word: RC.word.vvm(l.vvm), caution: true });
    if (frozen) words.push({ word: RC.word.frozen, caution: true });
    if (!words.length) words.push({ word: RC.word.matches, caution: false });
    if (per <= 0) problems.push(P.per(no, m.unit));
    if (acc > 0 || (rej > 0 && fate === "quarantine")) {
      if (!has(l.batch)) problems.push(P.batch(no));
      if (!l.exp) problems.push(P.exp(no));
      else if (badExp) problems.push(P.badExp(no));
    }
    if (expired && acc > 0) problems.push(P.expired(no));
    if (m.cold && acc > 0 && temp === null) problems.push(P.temp(no));
    if (tempBad && acc > 0) problems.push(P.coldBroken(no));
    if (short && !expired && !dec && acc > 0) problems.push(P.decide(no));
    if (
      short &&
      !expired &&
      (dec === "accept" || dec === "accept_tell") &&
      acc > 0 &&
      !l.approvedBy
    )
      problems.push(P.approval(no));
    if (rc && acc > 0) problems.push(P.recall(no, l.batch, rc.notice));
    if (m.vaccine && acc > 0) {
      if (!l.vvm) problems.push(P.vvm(no));
      else if (vvmBad) problems.push(P.vvmBad(no));
      if (!l.freeze) problems.push(P.freeze(no));
      else if (frozen) problems.push(P.frozen(no));
    }
    if (m.regLapsed && acc > 0) {
      if (!l.regReason) problems.push(P.reg(no));
      else if (l.regReason === "other" && !has(l.regNote)) problems.push(P.regNote(no));
    }
    if (l.rejOn && rej > packs) problems.push(P.rejMore(no));
    if (l.rejOn && rej > 0 && !why) problems.push(P.rejWhy(no));
  } else if (!l.orderLineId) {
    problems.push(P.packs(no));
  }
  return {
    rc,
    priceDiff,
    vvmBad,
    frozen,
    m,
    packs,
    per,
    counted,
    rej,
    why,
    fate,
    acc,
    accUnits: acc * per,
    rejUnits: rej * per,
    days,
    expired,
    short,
    temp,
    tempBad,
    owed,
    ol,
    words,
    problems,
    unitsText:
      per > 1 ? `${num(acc)} × ${num(per)} = ${plural(acc * per, m.unit)}` : plural(acc, m.unit),
    value: l.cost === "" ? null : acc * Number(l.cost),
  };
}
