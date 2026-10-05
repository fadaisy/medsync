"use client";

import type { OfflinePatient, OfflineSnapshot } from "@/lib/ncdreg/offline/cache";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { readSnapshot } from "@/lib/ncdreg/offline/cache";
import { openStore } from "@/lib/ncdreg/offline/store";
import { OutboxProvider, SyncState } from "../../ncd/_components/outbox-provider";
import { NursePart } from "../../ncd/visit/[visitId]/_components/nurse-part";

/**
 * Offline (§9, B5): today's clinic, the nurse part and the overdue list as last fetched, from the
 * encrypted device cache. Measurements are queued on the device and sent when the connection returns.
 */
export function OfflineApp() {
  return (
    <OutboxProvider>
      <Inner />
    </OutboxProvider>
  );
}

function Inner() {
  const [snap, setSnap] = useState<OfflineSnapshot | null | undefined>(undefined);
  const [open, setOpen] = useState<(OfflinePatient & { visitId: string }) | null>(null);
  useEffect(() => {
    openStore()
      .then(readSnapshot)
      .then(setSnap)
      .catch(() => setSnap(null));
  }, []);
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[640px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-display-s">{open ? open.name : "Today's clinic, offline"}</h1>
        <SyncState />
      </header>
      {snap === undefined ? <p className="text-body-s text-muted-foreground">Opening the device copy…</p> : null}
      {snap === null ? <p className="text-body-s">Nothing is stored on this device yet. Open the registry once while online.</p> : null}
      {snap && !open ? (
        <>
          <p className="text-caption text-ink-600">As fetched {new Date(snap.fetchedAt).toLocaleString("en-GB")}. Changes are kept on this device and sent when the connection returns.</p>
          <ul className="border-border divide-border flex flex-col divide-y border-y">
            {snap.clinic.map((p) => (
              <li key={p.personId}>
                <button type="button" className="hover:bg-ink-50 flex min-h-14 w-full flex-col items-start px-2 py-2 text-left" onClick={() => setOpen({ ...p, visitId: p.visitId ?? crypto.randomUUID() })}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground font-mono text-[12px]">
                    {p.registryNumber} · {p.sex === "female" ? "F" : "M"} · {p.age} y · {p.conditions.map((c) => c.label).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {snap.overdue.length ? (
            <section aria-labelledby="od-h" className="flex flex-col gap-2">
              <h2 id="od-h" className="text-heading-s">
                Overdue, as last fetched
              </h2>
              <ul className="text-body-s flex flex-col gap-1">
                {snap.overdue.map((o) => (
                  <li key={o.personId} className="flex justify-between gap-2">
                    <span>{o.name}</span>
                    <span className="font-mono text-[12px]">
                      {o.daysOverdue} days · {o.phoneMasked ?? "no phone"}
                      {o.demo ? " · demo number, do not call" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      {open ? (
        <>
          <button type="button" onClick={() => setOpen(null)} className="text-label inline-flex items-center gap-1 self-start">
            <ChevronLeftIcon className="size-4" aria-hidden /> Back to the list
          </button>
          {open.trajectory.length ? (
            <p className="text-caption text-ink-600">
              Last: {open.trajectory.at(-1)!.date} · BP {open.trajectory.at(-1)!.bp ?? "–"} · glucose {open.trajectory.at(-1)!.glucose ?? "–"} · {open.trajectory.at(-1)!.weight ?? "–"} kg
            </p>
          ) : null}
          <NursePart big visitId={open.visitId} personId={open.personId} initial={{ weightKg: null, bp: [], glucose: null }} heightCm={open.heightCm} glucose={open.glucose} closed={false} />
        </>
      ) : null}
    </div>
  );
}
