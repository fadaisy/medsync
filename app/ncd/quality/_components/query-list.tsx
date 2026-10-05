"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { fmtDate } from "../../_components/kit";
import { useOutbox } from "../../_components/outbox-provider";
import { FilterChipLink } from "../../my/_components/filter-link";

type Row = {
  id: string;
  personId: string;
  ruleText: string;
  status: string;
  note: string | null;
  created: string;
  name: string;
  registryNumber: string;
};

/** G3: queries from the consistency rules, each with a status and a resolution note. */
export function QueryList({
  rows,
  status,
  canResolve,
}: {
  rows: Row[];
  status: "open" | "closed";
  canResolve: boolean;
}) {
  return (
    <section aria-labelledby="queries-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="queries-h" className="text-heading-s font-medium">
          Query list
        </h2>
        <span className="ml-auto flex gap-2">
          <FilterChipLink
            href="/ncd/quality?queries=open"
            active={status === "open"}
            count={status === "open" ? rows.length : 0}
          >
            Open
          </FilterChipLink>
          <FilterChipLink
            href="/ncd/quality?queries=closed"
            active={status === "closed"}
            count={status === "closed" ? rows.length : 0}
          >
            Resolved
          </FilterChipLink>
        </span>
      </div>
      {rows.length ? (
        <ul className="border-border divide-border divide-y border-y">
          {rows.map((r) => (
            <QueryRow key={r.id} row={r} canResolve={canResolve && r.status === "open"} />
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">
          {status === "open" ? "No open queries." : "No resolved queries yet."}
        </p>
      )}
    </section>
  );
}

function QueryRow({ row, canResolve }: { row: Row; canResolve: boolean }) {
  const { submit } = useOutbox();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const resolve = (status: "resolved" | "dismissed") =>
    start(async () => {
      const r = await submit("query.resolve", {
        queryId: row.id,
        personId: row.personId,
        status,
        note,
      });
      setMsg(r.ok ? null : r.message);
    });
  const noteId = `note-${row.id}`;
  return (
    <li className="flex flex-col gap-2 px-1 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={`/ncd/patients/${row.personId}`}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {row.name}{" "}
          <span className="text-caption text-muted-foreground font-mono">{row.registryNumber}</span>
        </Link>
        <span className="text-body-s">{row.ruleText}</span>
        <span className="text-caption text-muted-foreground">Raised {fmtDate(row.created)}</span>
        <Tag hue="slate" className="ml-auto">
          {row.status === "open" ? "Open" : row.status === "resolved" ? "Resolved" : "Dismissed"}
        </Tag>
      </div>
      {row.note ? <p className="text-body-s text-ink-700">Note: {row.note}</p> : null}
      {canResolve ? (
        open ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={noteId} className="text-label">
              Resolution note
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={300}
              className="border-input focus-visible:shadow-focus rounded-lg border bg-transparent p-2 text-[14px] outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || note.trim().length < 3}
                onClick={() => resolve("resolved")}
              >
                Resolve
              </Button>
              <Button
                variant="secondary"
                disabled={pending || note.trim().length < 3}
                onClick={() => resolve("dismissed")}
              >
                Dismiss
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpen(true)}>
            Resolve with a note
          </Button>
        )
      ) : null}
      {msg ? (
        <p role="alert" className="text-body-s">
          {msg}
        </p>
      ) : null}
    </li>
  );
}
