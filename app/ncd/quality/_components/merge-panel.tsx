"use client";

import { useState, useTransition } from "react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { fmtDate } from "../../_components/kit";
import { useOutbox } from "../../_components/outbox-provider";
import { findRecordAction } from "../actions";

type Found = { id: string; name: string; registryNumber: string; age: number; sex: string };
type Row = { id: string; personId: string; status: string; reason: string | null; requestedBy: string; requestedAt: string; survivor: string; loser: string };

const input = "border-input focus-visible:shadow-focus h-10 rounded-lg border bg-transparent px-3 text-[14px] outline-none";

/** A7: pick two records, request a merge; a different person approves or refuses it. */
export function MergePanel({ rows, userId, canRequest, canApprove }: { rows: Row[]; userId: string | null; canRequest: boolean; canApprove: boolean }) {
  const { submit } = useOutbox();
  const [nums, setNums] = useState(["", ""]);
  const [found, setFound] = useState<(Found | null)[]>([null, null]);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const find = (i: 0 | 1) =>
    start(async () => {
      const r = await findRecordAction(nums[i]);
      if (!r.ok) return setMsg(r.message);
      setMsg(r.value ? null : `No record ${nums[i]}.`);
      setFound((f) => (i === 0 ? [r.value, f[1]!] : [f[0]!, r.value]));
    });
  const request = () =>
    start(async () => {
      const [a, b] = found;
      if (!a || !b) return;
      const r = await submit("merge.request", { mergeId: crypto.randomUUID(), personId: a.id, loserPersonId: b.id, reason });
      setMsg(r.ok ? "Merge requested. A different person must approve it." : r.message);
      if (r.ok) {
        setFound([null, null]);
        setNums(["", ""]);
        setReason("");
      }
    });
  const decide = (row: Row, approve: boolean) =>
    start(async () => {
      const r = await submit("merge.decide", { mergeId: row.id, personId: row.personId, approve });
      setMsg(r.ok ? (approve ? "Merged. The second record now points to the first." : "Merge refused.") : r.message);
    });

  const pendingRows = rows.filter((r) => r.status === "requested");
  const done = rows.filter((r) => r.status !== "requested");
  const same = found[0] && found[1] && found[0].id === found[1].id;

  return (
    <section aria-labelledby="merge-h" className="flex flex-col gap-3">
      <h2 id="merge-h" className="text-heading-s font-medium">
        Duplicate records
      </h2>
      {canRequest ? (
        <div className="border-border grid gap-4 rounded-xl border p-4 md:grid-cols-2">
          {([0, 1] as const).map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <label htmlFor={`merge-${i}`} className="text-label">
                {i === 0 ? "Record to keep (registry number)" : "Duplicate record to merge into it"}
              </label>
              <div className="flex gap-2">
                <input id={`merge-${i}`} value={nums[i]} onChange={(e) => setNums((n) => (i === 0 ? [e.target.value, n[1]!] : [n[0]!, e.target.value]))} className={`${input} min-w-0 flex-1 font-mono`} />
                <Button variant="secondary" disabled={pending || nums[i]!.trim().length < 3} onClick={() => find(i)}>
                  Find
                </Button>
              </div>
              {found[i] ? (
                <p className="text-body-s">
                  {found[i]!.name} · {found[i]!.sex} · {found[i]!.age} years · <span className="font-mono">{found[i]!.registryNumber}</span>
                </p>
              ) : null}
            </div>
          ))}
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-label">Why these are the same person</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button disabled={pending || !found[0] || !found[1] || !!same || reason.trim().length < 3} onClick={request}>
              Request merge
            </Button>
            <span className="text-caption text-muted-foreground">{same ? "Pick two different records." : "The person who requests a merge cannot approve it."}</span>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p role="status" className="text-body-s">
          {msg}
        </p>
      ) : null}
      <h3 className="text-label">Awaiting a decision</h3>
      {pendingRows.length ? (
        <ul className="border-border divide-border divide-y border-y">
          {pendingRows.map((r) => {
            const mine = r.requestedBy === userId;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-3">
                <span className="text-body-s">
                  Keep <span className="font-medium">{r.survivor}</span>, merge <span className="font-medium">{r.loser}</span> into it
                </span>
                <span className="text-caption text-muted-foreground">
                  Requested {fmtDate(r.requestedAt)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </span>
                {canApprove && !mine ? (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" disabled={pending} onClick={() => decide(r, true)}>
                      Approve merge
                    </Button>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(r, false)}>
                      Refuse
                    </Button>
                  </span>
                ) : (
                  <span className="text-caption text-muted-foreground ml-auto">{mine ? "You requested this. A different person decides." : "Awaiting a registry lead"}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">No merge requests awaiting a decision.</p>
      )}
      {done.length ? (
        <details>
          <summary className="text-label cursor-pointer">Decided requests ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((r) => (
              <li key={r.id} className="text-body-s flex flex-wrap items-center gap-2">
                <Tag hue="slate">{r.status === "approved" ? "Merged" : "Refused"}</Tag>
                {r.survivor} ← {r.loser}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
