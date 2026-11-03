"use client";

import type { PutAwayRow } from "@/lib/pharmacy/stores/shelves";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORE } from "@/content/pharmacy-stores-store";
import { putAway } from "../actions";

const P = STORE.putAway;

/** One batch to put away: the shelf, pre-filled with where its medicine already is. */
function Row({ row, expiry, canPut }: { row: PutAwayRow; expiry: string; canPut: boolean }) {
  const router = useRouter();
  const [shelf, setShelf] = useState(row.suggest ?? "");
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await putAway({ clientKey: key, batchId: row.batchId, shelf });
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });
  return (
    <li className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_9rem_auto]">
      <span className="flex flex-col">
        <span className="text-body-s text-foreground font-medium">{row.productName}</span>
        <span className="text-caption text-muted-foreground">
          <span className="font-mono">{row.batchNumber}</span> · exp {expiry} · {row.place}
          {row.cold ? ` · ${P.cold}` : ""}
        </span>
      </span>
      <span className="text-body-s tabular-nums">{STORE.amounts(row.quantity, row.issueUnit)}</span>
      {canPut ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="sr-only">
              {P.shelf} · {row.productName} {row.batchNumber}
            </span>
            <Input
              value={shelf}
              maxLength={20}
              placeholder={P.shelf}
              onChange={(e) => setShelf(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shelf.trim()) {
                  e.preventDefault();
                  save();
                }
              }}
              className="min-h-11 font-mono"
            />
          </label>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending || !shelf.trim()}
            onClick={save}
          >
            {P.put}
          </Button>
        </>
      ) : null}
      {row.suggest ? (
        <span className="text-caption text-muted-foreground sm:col-span-4">
          {P.suggest(row.suggest)}
        </span>
      ) : null}
      {error ? (
        <span className="sm:col-span-4">
          <StatusWord tone="caution">{error}</StatusWord>
        </span>
      ) : null}
    </li>
  );
}

export function PutAwayList({
  rows,
  canPut,
}: {
  rows: (PutAwayRow & { expiryText: string })[];
  canPut: boolean;
}) {
  return (
    <section aria-labelledby="put-away" className="flex flex-col gap-2">
      <h2 id="put-away" className="text-heading-s text-foreground">
        {P.title}
      </h2>
      <p className="text-body-s text-muted-foreground">{rows.length ? P.lede : P.none}</p>
      {rows.length ? (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border px-4">
          {rows.map((r) => (
            <Row key={r.batchId} row={r} expiry={r.expiryText} canPut={canPut} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
