"use client";

import type { ReceiveDelivery, ReceiveLine } from "@/lib/pharmacy/derive/receive";
import { useCallback, useEffect, useRef, useState } from "react";

import { finishDeliveryAction, saveInvoiceAction, saveLinesAction } from "@/app/pharmacy/stock/store/receive-actions";
import { blankLine } from "@/lib/pharmacy/derive/receive";
import { newKey } from "../store/shared";
import { useReceive } from "./provider";

const SAVE_MS = 500;

/**
 * One delivery being counted: "Everything here saves as you go." Changes land on this device at once, and on the server
 * half a second later when online. `finish` flushes first; offline it queues. Nothing here moves stock.
 */
export function useCount(initial: ReceiveDelivery) {
  const { online, keep, forget, world, say, go, refresh } = useReceive();
  const [d, setD] = useState(initial);
  const removed = useRef<string[]>([]);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(d);
  useEffect(() => {
    latest.current = d;
  }, [d]);

  useEffect(() => {
    // Someone else moved it on (the in-charge approved, another device finished): take what the server says.
    if (!dirty.current) setD(initial);
  }, [initial]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return true;
    const cur = latest.current;
    if (!navigator.onLine) {
      await keep(cur, { removed: removed.current });
      return false;
    }
    dirty.current = false;
    const r = await saveLinesAction({ deliveryId: cur.id, lines: cur.lines, removed: removed.current }).catch(() => null);
    if (!r?.ok) {
      dirty.current = true;
      await keep(cur, { removed: removed.current });
      if (r) say(r.error);
      return false;
    }
    removed.current = [];
    await forget(cur.id);
    return true;
  }, [keep, forget, say]);

  const change = useCallback(
    (next: (x: ReceiveDelivery) => ReceiveDelivery) => {
      setD((x) => {
        const n = next(x);
        latest.current = n;
        return n;
      });
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [flush],
  );

  const setLine = useCallback(
    (id: string, patch: Partial<ReceiveLine>) =>
      change((x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    [change],
  );
  const addLines = useCallback((lines: ReceiveLine[]) => change((x) => ({ ...x, lines: [...x.lines, ...lines] })), [change]);
  /** Port of `removeLine`: the last line on an order line goes back to waiting; anything else goes. */
  const removeLine = useCallback(
    (id: string) =>
      change((x) => {
        const l = x.lines.find((y) => y.id === id);
        if (!l) return x;
        const others = x.lines.some((y) => y.id !== id && y.orderLineId && y.orderLineId === l.orderLineId);
        const m = world.meds.find((y) => y.id === l.medId);
        if (l.orderLineId && !others && m) {
          const fresh = blankLine(l.id, x, m, "order", { no: l.no, orderLineId: l.orderLineId });
          return { ...x, lines: x.lines.map((y) => (y.id === id ? fresh : y)) };
        }
        removed.current = [...removed.current, id];
        return { ...x, lines: x.lines.filter((y) => y.id !== id) };
      }),
    [change, world.meds],
  );
  const setInvoice = useCallback(
    (invoice: string, invoiceTotal: string) => {
      setD((x) => ({ ...x, invoice, invoiceTotal }));
      if (navigator.onLine)
        void saveInvoiceAction({ deliveryId: d.id, invoice, total: invoiceTotal === "" ? null : Number(invoiceTotal) || 0 });
      else dirty.current = true;
    },
    [d.id],
  );

  /** `finish`. Returns the action's result, or `queued` when offline. */
  const finish = useCallback(
    async (witnesses: { lineId: string; attestationId: string }[], secondAttestationId: string | null) => {
      if (!online || !navigator.onLine) {
        await keep(latest.current, { queued: true, removed: removed.current });
        go(null);
        return { queued: true as const };
      }
      await flush();
      const r = await finishDeliveryAction({ deliveryId: d.id, witnesses, secondAttestationId });
      if (r.ok) {
        await forget(d.id);
        refresh();
      }
      return r;
    },
    [online, keep, go, flush, forget, refresh, d.id],
  );

  return { d, setD, setLine, addLines, removeLine, setInvoice, flush, finish, newLineId: newKey };
}
