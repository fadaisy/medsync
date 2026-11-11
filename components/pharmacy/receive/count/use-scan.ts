"use client";

import type { useCount } from "../use-count";
import type { ReceiveDelivery, ReceiveLine } from "@/lib/pharmacy/derive/receive";
import type { PackCode } from "@/lib/pharmacy/gs1";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { linkGtinAction, scanPackAction } from "@/app/pharmacy/stock/store/receive-actions";
import { RC } from "@/content/pharmacy-receive";
import { RCT } from "@/content/pharmacy-receive-count";
import { RC as RECORDS } from "@/content/pharmacy-rework-records";
import { blankLine, daysLeft } from "@/lib/pharmacy/derive/receive";
import { parseCode } from "@/lib/pharmacy/gs1";
import { useReceive } from "../provider";

type Count = ReturnType<typeof useCount>;
const REFUSED = RECORDS.refused;

export type ScanNote =
  | { kind: "ok" | "warn"; text: string }
  | { kind: "unknown"; text: string; code: PackCode; pick: string };

/** A stored GTIN is 14 digits, a scanned one may not be: compare without the leading zeros. */
const strip = (g: string) => g.replace(/^0+/, "");

/**
 * Scanning (RECEIVE §D1): `scanRaw` and `countPack` of the prototype. One scan at a time, so a scanner that fires fast
 * still counts every pack; the serial is claimed on the server first when online, and checked in memory when not.
 */
export function useScan({
  c,
  inputRef,
  onPicker,
  onOpenLine,
}: {
  c: Count;
  inputRef: RefObject<HTMLInputElement | null>;
  onPicker: (q: string) => void;
  onOpenLine: (lineId: string) => void;
}) {
  const { world, online, say, refresh } = useReceive();
  const [value, setValue] = useState("");
  const [note, setNote] = useState<ScanNote | null>(null);
  /** The delivery as this hook has left it: React has not always rendered the last scan when the next one lands. */
  const mirror = useRef<ReceiveDelivery>(c.d);
  useEffect(() => {
    mirror.current = c.d;
  }, [c.d]);
  const seen = useRef(new Set<string>());
  const linked = useRef(new Map<string, string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  const live = () => online && navigator.onLine;
  const patchLines = (fn: (l: ReceiveLine[]) => ReceiveLine[]) => {
    mirror.current = { ...mirror.current, lines: fn(mirror.current.lines) };
  };

  async function countPack(medId: string, code: PackCode, extra = "") {
    const m = world.meds.find((x) => x.id === medId);
    if (!m) return;
    if (code.serial) {
      const cur = mirror.current;
      const key = `${code.gtin}|${code.serial}`;
      let refused: string | null = null;
      if (live()) {
        const r = await scanPackAction({
          deliveryId: cur.id,
          gtin: code.gtin,
          serial: code.serial,
        }).catch(() => null);
        if (r && !r.ok) refused = r.error;
        else if (!r && seen.current.has(key)) refused = RC.says.serial(code.serial, cur.note);
      } else if (seen.current.has(key)) refused = RC.says.serial(code.serial, cur.note);
      if (refused) {
        setValue("");
        setNote({ kind: "warn", text: refused });
        inputRef.current?.focus();
        return;
      }
      seen.current.add(key);
    }

    // After the server's answer: the lines may have moved while it was away.
    const cur = mirror.current;
    const recall = world.recalls.find(
      (r) =>
        r.medId === medId &&
        !!code.batch &&
        (!r.batch || r.batch.toUpperCase() === code.batch.toUpperCase()),
    );
    const rank = Math.max(0, ...cur.lines.map((l) => l.rank)) + 1;
    let text: string;
    let open: string | null = null;
    const same = code.batch
      ? cur.lines.find((l) => l.medId === medId && l.batch === code.batch && Number(l.packs) > 0)
      : undefined;
    if (same) {
      const packs = String(Number(same.packs) + 1);
      c.setLine(same.id, { packs, rank });
      patchLines((ls) => ls.map((l) => (l.id === same.id ? { ...l, packs, rank } : l)));
      text = RCT.scan.more(same.no, packs);
      if (recall) open = same.id;
    } else {
      const pending = cur.lines.find((l) => l.medId === medId && !(Number(l.packs) > 0));
      const order = cur.orderId ? world.orders.find((o) => o.id === cur.orderId) : undefined;
      const ol = order?.lines.find((x) => x.medId === medId);
      const patch = { source: "scan" as const, batch: code.batch, exp: code.exp, packs: "1", rank };
      let line: ReceiveLine;
      if (pending) {
        line = { ...pending, ...patch };
        c.setLine(pending.id, patch);
        patchLines((ls) => ls.map((l) => (l.id === pending.id ? line : l)));
      } else {
        line = blankLine(c.newLineId(), cur, m, "scan", { ...patch, orderLineId: ol?.id ?? null });
        c.addLines([line]);
        patchLines((ls) => [...ls, line]);
      }
      text = RCT.scan.added(line.no);
      const days = code.exp ? daysLeft(code.exp, world.today) : null;
      if (
        m.cold ||
        m.regLapsed ||
        m.vaccine ||
        recall ||
        !code.exp ||
        !code.batch ||
        (days !== null && days < world.rules.look)
      )
        open = line.id;
    }
    if (recall) text += RCT.scan.recall(code.batch, recall.notice, recall.why);
    setValue("");
    setNote({ kind: "ok", text: text + extra });
    if (open) onOpenLine(open);
    else inputRef.current?.focus();
  }

  async function handle(raw: string) {
    const v = raw.trim();
    if (!v) return;
    const code = parseCode(raw);
    if (!code) {
      setValue("");
      onPicker(v);
      return;
    }
    const g = strip(code.gtin);
    const known = world.meds.find((m) => !!m.gtin && strip(m.gtin) === g);
    const medId = known?.id ?? linked.current.get(g);
    if (!medId) {
      setValue("");
      setNote({ kind: "unknown", text: RCT.scan.unknown, code, pick: "" });
      return;
    }
    await countPack(medId, code);
  }

  /** "Link it and add the line": online the GTIN is saved for this hospital first; offline it is counted and said so. */
  async function link() {
    if (note?.kind !== "unknown") return;
    if (!note.pick) {
      setNote({ ...note, text: RCT.scan.needPick });
      return;
    }
    const { code, pick } = note;
    if (live()) {
      const r = await linkGtinAction({ productId: pick, gtin: code.gtin.padStart(14, "0") }).catch(
        () => null,
      );
      if (!r?.ok) {
        say(r ? r.error : REFUSED.failed);
        return;
      }
      refresh();
    }
    linked.current.set(strip(code.gtin), pick);
    await countPack(pick, code, live() ? "" : RCT.scan.unknownOffline);
  }

  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch(() => undefined);
  };

  return {
    value,
    setValue,
    note,
    setPick: (pick: string) => setNote((n) => (n?.kind === "unknown" ? { ...n, pick } : n)),
    read: (raw = value) => enqueue(() => handle(raw)),
    link: () => enqueue(link),
  };
}
