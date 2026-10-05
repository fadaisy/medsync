"use client";

import type { DryRun } from "@/lib/ncdreg/exchange/legacy";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  approveReleaseAction,
  legacyApplyAction,
  legacyDryRunAction,
  requestReleaseAction,
} from "../actions";

export function ReleasePanel({
  requests,
  me,
  canRequest,
  canApprove,
}: {
  requests: {
    id: string;
    status: string;
    requestedBy: string;
    reference: string | null;
    at: string;
  }[];
  me: string | null;
  canRequest: boolean;
  canApprove: boolean;
}) {
  const [note, setNote] = useState("");
  const [ref, setRef] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {canRequest ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">Purpose and protocol</span>
            <input
              className="border-input h-9 w-96 rounded-lg border bg-transparent px-2 text-[14px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            disabled={!note || pending}
            onClick={() =>
              start(async () => {
                const r = await requestReleaseAction(note);
                setMsg(r.ok ? "Requested. A different person approves it." : r.message);
              })
            }
          >
            Request a research extract
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="border-border text-body-s flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <span>
              {new Date(r.at).toLocaleDateString("en-GB")} · {r.status}
              {r.reference ? ` · approval ${r.reference}` : ""}
            </span>
            {r.status === "requested" && canApprove && r.requestedBy !== me ? (
              <span className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`ref-${r.id}`}>
                  Approval reference
                </label>
                <input
                  id={`ref-${r.id}`}
                  placeholder="Approval reference"
                  className="border-input h-8 rounded-md border bg-transparent px-2 text-[13px]"
                  value={ref[r.id] ?? ""}
                  onChange={(e) => setRef({ ...ref, [r.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const x = await approveReleaseAction(r.id, ref[r.id] ?? "");
                      setMsg(x.ok ? "Approved." : x.message);
                    })
                  }
                >
                  Approve
                </Button>
              </span>
            ) : r.status === "approved" || r.status === "released" ? (
              <a
                className={buttonVariants({ variant: "secondary", size: "sm" })}
                href={`/ncd/exchange/download?kind=research&request=${r.id}`}
              >
                Download extract
              </a>
            ) : r.status === "requested" ? (
              <span className="text-caption text-ink-600">Awaiting a second person</span>
            ) : null}
          </li>
        ))}
      </ul>
      {msg ? (
        <p role="status" className="text-body-s text-ink-800">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

export function LegacyImport() {
  const [csv, setCsv] = useState("");
  const [dry, setDry] = useState<DryRun | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          className={buttonVariants({ variant: "secondary" })}
          href="/ncd/exchange/download?kind=template"
        >
          Download the template
        </a>
        <label className="text-label inline-flex items-center gap-2">
          <span>CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCsv(await f.text());
                setDry(null);
                setAccepted(false);
              }
            }}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!csv || pending}
          onClick={() =>
            start(async () => {
              const r = await legacyDryRunAction(csv);
              setAccepted(false);
              if (r.ok) setDry(r.data);
              else setMsg(r.message);
            })
          }
        >
          Dry run
        </Button>
        <Button
          disabled={
            !dry ||
            dry.errors.length > 0 ||
            dry.duplicates.length > 0 ||
            (dry.confirmations.length > 0 && !accepted) ||
            pending
          }
          onClick={() =>
            start(async () => {
              const r = await legacyApplyAction(csv, accepted);
              setMsg(
                r.ok
                  ? `Imported ${r.data.persons} patients and ${r.data.visits} back-entered visits.`
                  : r.message,
              );
            })
          }
        >
          Import
        </Button>
      </div>
      {dry ? (
        <div className="text-body-s flex flex-col gap-1">
          <p>
            {dry.rows} rows · {dry.persons} patients · {dry.errors.length} errors ·{" "}
            {dry.duplicates.length} probable duplicates
          </p>
          <ul className="flex flex-col gap-0.5">
            {dry.errors.map((e) => (
              <li key={`e${e.line}`}>
                Line {e.line}: {e.message}
              </li>
            ))}
            {dry.duplicates.map((d, i) => (
              <li key={`d${d.line}-${i}`}>
                Line {d.line}: {d.tier} match on {d.matched.join(", ")}
              </li>
            ))}
            {dry.confirmations.map((c) => (
              <li key={`c${c.line}`}>
                Line {c.line}: outside the usual range: {c.fields.join(", ")}
              </li>
            ))}
          </ul>
          {dry.confirmations.length ? (
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I checked these {dry.confirmations.length} lines against the source and the values are
              right
            </label>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p role="status" className="text-body-s text-ink-800">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
