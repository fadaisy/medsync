"use client";

import type { DeviceDelivery } from "@/lib/pharmacy/receive/offline";
import type { ReceiveDelivery, ReceiveLine, ReceiveWorld } from "@/lib/pharmacy/derive/receive";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { finishDeliveryAction, syncCountingAction } from "@/app/pharmacy/stock/store/receive-actions";
import { useStockLive } from "@/components/pharmacy/medicines/use-stock-live";
import { RC } from "@/content/pharmacy-receive";
import { allDevice, dropDevice, putDevice, syncQueue } from "@/lib/pharmacy/receive/offline";
import { useStoreAct } from "../store/shared";

/**
 * The tab's one client state (RECEIVE §H): the server's world with this device's deliveries laid over it, the
 * connection, the queue and which dialog is open. Views move with a shallow URL change, so they still open offline.
 */
export const headOf = (d: ReceiveDelivery) => ({
  id: d.id,
  kind: d.kind,
  supplierId: d.supplierId,
  fromText: d.from,
  fromPlaceId: d.fromPlace,
  orderId: d.orderId,
  note: d.note,
  placeId: d.place,
  arrived: d.arrived,
  deliverer: d.deliverer,
  vehicle: d.vehicle,
  blind: d.blind,
});

export type ReceiveDialog =
  | null
  | { kind: "start"; orderId?: string; seedMedId?: string; edit?: ReceiveDelivery }
  | { kind: "order"; orderId: string; edit?: boolean }
  | { kind: "chase"; orderId: string }
  | { kind: "claim"; claimId: string; step?: "send" | "credit" }
  | { kind: "labels"; deliveryId: string }
  | { kind: "confirm"; dispatchId: string };

interface Ctx {
  world: ReceiveWorld;
  online: boolean;
  /** Queued on this device, for the banner. */
  queued: number;
  busy: boolean;
  toast: ReactNode;
  say: (m: string) => void;
  run: ReturnType<typeof useStoreAct>["run"];
  dialog: ReceiveDialog;
  open: (d: ReceiveDialog) => void;
  /** Opens a delivery (`null` the board), keeping the rest of the URL. */
  go: (deliveryId: string | null) => void;
  deliveryId: string | null;
  /** Keeps a delivery on this device: every change while counting, and everything while offline. */
  keep: (d: ReceiveDelivery, opts?: { queued?: boolean; removed?: string[] }) => Promise<void>;
  forget: (id: string) => Promise<void>;
  /** The server's copy (when online) caught up: drop the device's. */
  refresh: () => void;
}

const Context = createContext<Ctx | null>(null);
export const useReceive = () => {
  const c = useContext(Context);
  if (!c) throw new Error("useReceive outside ReceiveProvider");
  return c;
};

const lineForSync = (l: ReceiveLine) => l;

export function ReceiveProvider({
  world,
  deliveryId: initial,
  live = true,
  children,
}: {
  world: ReceiveWorld;
  deliveryId: string | null;
  /** Off on the fixture. */
  live?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { busy, toast, say, run } = useStoreAct();
  const online = useSyncExternalStore(
    (on) => {
      window.addEventListener("online", on);
      window.addEventListener("offline", on);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", on);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  const [device, setDevice] = useState<DeviceDelivery[]>([]);
  const [dialog, open] = useState<ReceiveDialog>(null);
  const [deliveryId, setDeliveryId] = useState(initial);
  useStockLive(world.hospitalId, live && online);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setDeliveryId(initial);
  }

  // Every door elsewhere links here with ?start=1 (and &order= or &med=), and opens the one start dialog.
  const params = useSearchParams();
  const startDoor = params.get("start");
  const orderDoor = params.get("order");
  const medDoor = params.get("med");
  const door = startDoor ? params.toString() : null;
  const [seenDoor, setSeenDoor] = useState<string | null>(null);
  if (seenDoor !== door) {
    setSeenDoor(door);
    if (door) open({ kind: "start", orderId: orderDoor ?? undefined, seedMedId: medDoor ?? undefined });
  }
  useEffect(() => {
    if (!door) return;
    const u = new URL(location.href);
    for (const k of ["start", "order", "med"]) u.searchParams.delete(k);
    history.replaceState(null, "", u);
  }, [door]);

  const reload = useCallback(async () => setDevice(await allDevice().catch(() => [])), []);
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const items = await allDevice().catch(() => []);
      // A delivery still being counted goes up first, so a reload here finds it.
      for (const d of items.filter((x) => !x.queued)) {
        const r = await syncCountingAction({ head: headOf(d.delivery), lines: d.delivery.lines.map(lineForSync) }).catch(() => null);
        if (!r) break;
        if (r.ok && !r.data?.duplicateOf) await dropDevice(d.delivery.id);
        else if (r.ok) await putDevice({ ...d, delivery: { ...d.delivery, conflict: RC.says.duplicate } });
        else await putDevice({ ...d, delivery: { ...d.delivery, conflict: r.error } });
      }
      const out = await syncQueue(
        items,
        {
          push: async (d) => {
            const r = await syncCountingAction({ head: headOf(d.delivery), lines: d.delivery.lines.map(lineForSync) });
            return r.ok ? { ok: true, duplicate: !!r.data?.duplicateOf } : { ok: false, error: r.error };
          },
          finish: async (d) => {
            const r = await finishDeliveryAction({ deliveryId: d.delivery.id, witnesses: [], secondAttestationId: null });
            if (r.ok) return { ok: true };
            // Witnesses and second checkers confirm in person, so they cannot be carried over the gap.
            return { ok: false, error: /witness|checked the count/.test(r.error) ? `${r.error} ${RC.device.needsPeople}` : r.error };
          },
        },
        RC.says.duplicate,
        { put: putDevice, drop: dropDevice },
      );
      await reload();
      if (items.some((x) => x.queued)) {
        const note = (id: string) => items.find((x) => x.delivery.id === id)?.delivery.note ?? "";
        say(
          [
            ...(out.added.length ? [RC.device.back(out.added.length)] : []),
            ...out.conflicts.map((c) => RC.device.conflict(note(c.id), c.reason)),
          ].join(" "),
        );
      }
      router.refresh();
    } finally {
      syncing.current = false;
    }
  }, [reload, router, say]);

  useEffect(() => {
    const on = () => void sync();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the device's IndexedDB once.
    void reload().then(() => (navigator.onLine ? sync() : undefined));
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [reload, sync]);

  const keep = useCallback(
    async (d: ReceiveDelivery, opts?: { queued?: boolean; removed?: string[] }) => {
      await putDevice({
        delivery: opts?.queued ? { ...d, state: "queued" } : d,
        queued: !!opts?.queued,
        removed: opts?.removed ?? [],
        savedAt: Date.now(),
      }).catch(() => undefined);
      await reload();
    },
    [reload],
  );
  const forget = useCallback(
    async (id: string) => {
      await dropDevice(id).catch(() => undefined);
      await reload();
    },
    [reload],
  );
  // Offline there is no server to re-read; Next would fall back to a browser navigation and lose the page.
  const refresh = useCallback(() => {
    if (navigator.onLine) router.refresh();
  }, [router]);

  const go = useCallback((id: string | null) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("delivery", id);
    else u.searchParams.delete("delivery");
    window.history.pushState(null, "", u);
    setDeliveryId(id);
  }, []);

  const merged = useMemo<ReceiveWorld>(() => {
    // The device's copy wins while offline, queued or refused; otherwise only until the server has the delivery.
    const server = new Set(world.deliveries.map((d) => d.id));
    const ours = device.filter(
      (x) => x.delivery.place === world.placeId && (!online || x.queued || !!x.delivery.conflict || !server.has(x.delivery.id)),
    );
    const here = new Set(ours.map((x) => x.delivery.id));
    return { ...world, deliveries: [...ours.map((x) => x.delivery), ...world.deliveries.filter((d) => !here.has(d.id))] };
  }, [world, device, online]);

  const value: Ctx = {
    world: merged,
    online,
    queued: device.filter((x) => x.queued).length,
    busy,
    toast,
    say,
    run,
    dialog,
    open,
    go,
    deliveryId,
    keep,
    forget,
    refresh,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
