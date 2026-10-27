"use client";

import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { confirmBatchAction, reviewCatalogueAction, settleConflictAction } from "../queue-actions";
import { ACT, ROW, useWrite } from "./catalogue-console";

const Q = CATALOGUE.queue;

export interface QueueData {
  barcodes: {
    proposalId: string;
    code: string;
    hospital: string | null;
    medicine: string;
    brand: string | null;
    pack: string;
    state: string | null;
    mine: boolean;
  }[];
  conflicts: {
    codeType: string;
    code: string;
    links: {
      packId: string;
      pack: string;
      brand: string | null;
      medicine: string;
      hospital: string | null;
    }[];
  }[];
  sources: { kind: string; source: string; open: number; forYou: number }[];
}

const section = "bg-card border-border flex flex-col rounded-lg border";
const head = "text-heading-s text-foreground border-border border-b px-4 py-3";
const empty = "text-body-s text-muted-foreground px-4 py-3";

/** The catalogue team's queue (4.8): barcodes to check, conflicts to settle, open proposals by source. */
export function CatalogueQueue({ data }: { data: QueueData }) {
  return (
    <section aria-label={Q.title} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-heading-m text-foreground">{Q.title}</h2>
        <p className="text-body-s text-muted-foreground max-w-prose">{Q.lead}</p>
      </header>
      <div className={section}>
        <h3 className={head}>{Q.barcodes}</h3>
        {data.barcodes.length ? (
          <ul className="divide-border divide-y">
            {data.barcodes.map((b) => (
              <BarcodeRow key={b.proposalId} b={b} />
            ))}
          </ul>
        ) : (
          <p className={empty}>{Q.noBarcodes}</p>
        )}
      </div>
      <div className={section}>
        <h3 className={head}>{Q.conflicts}</h3>
        {data.conflicts.length ? (
          <>
            <p className={empty}>{Q.conflictLead}</p>
            <ul className="divide-border divide-y">
              {data.conflicts.map((c) => (
                <ConflictRow key={`${c.codeType}${c.code}`} c={c} />
              ))}
            </ul>
          </>
        ) : (
          <p className={empty}>{Q.noConflicts}</p>
        )}
      </div>
      <div className={section}>
        <h3 className={head}>{Q.proposals}</h3>
        {data.sources.length ? (
          <ul className="divide-border divide-y">
            {data.sources.map((s) => (
              <SourceRow key={`${s.kind}${s.source}`} s={s} />
            ))}
          </ul>
        ) : (
          <p className={empty}>{Q.noProposals}</p>
        )}
      </div>
    </section>
  );
}

function BarcodeRow({ b }: { b: QueueData["barcodes"][number] }) {
  const w = useWrite();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <li className={ROW}>
      <span className="text-body-s text-foreground font-mono tabular-nums">{b.code}</span>
      <span className="text-body-s text-muted-foreground">
        {[
          b.medicine,
          b.brand,
          b.pack,
          b.hospital && Q.linkedAt(b.hospital),
          b.state === "conflict" && Q.conflicts,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className={ACT}>
        {b.mine ? (
          <span className="text-caption text-muted-foreground">{Q.yours}</span>
        ) : (
          (w.fresh ?? (
            <>
              <Button
                variant="secondary"
                disabled={w.pending || b.state === "conflict"}
                onClick={() =>
                  w.run(
                    () => reviewCatalogueAction({ ids: [b.proposalId], decision: "confirm" }),
                    Q.done,
                  )
                }
              >
                {Q.confirm}
              </Button>
              <EditorDialog
                width="medium"
                open={open}
                onOpenChange={setOpen}
                trigger={
                  <DialogTrigger render={<Button variant="ghost" />}>{Q.reject}</DialogTrigger>
                }
              >
                <div className="flex flex-col gap-3 p-5">
                  <DialogTitle className="text-heading-s">{Q.rejectTitle}</DialogTitle>
                  <Label htmlFor={`why-${b.proposalId}`}>{Q.reason}</Label>
                  <Input
                    id={`why-${b.proposalId}`}
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setOpen(false)}>
                      {CATALOGUE.cancel}
                    </Button>
                    <Button
                      disabled={!why.trim() || w.pending}
                      onClick={() => {
                        setOpen(false);
                        w.run(
                          () =>
                            reviewCatalogueAction({
                              ids: [b.proposalId],
                              decision: "reject",
                              note: why,
                            }),
                          Q.rejected,
                        );
                      }}
                    >
                      {Q.reject}
                    </Button>
                  </div>
                </div>
              </EditorDialog>
            </>
          ))
        )}
        {w.status}
      </span>
    </li>
  );
}

function ConflictRow({ c }: { c: QueueData["conflicts"][number] }) {
  const w = useWrite();
  const [keep, setKeep] = useState("");
  const [how, setHow] = useState("");
  const packs = [...new Map(c.links.map((l) => [l.packId, l])).values()];
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <span className="text-body-s text-foreground font-mono tabular-nums">{c.code}</span>
      <div role="radiogroup" aria-label={Q.keep} className="flex flex-col gap-1.5">
        {packs.map((p) => (
          <label key={p.packId} className="text-body-s flex items-start gap-2">
            <input
              type="radio"
              name={`keep-${c.code}`}
              value={p.packId}
              checked={keep === p.packId}
              onChange={() => setKeep(p.packId)}
              className="mt-1"
            />
            <span>
              {[p.medicine, p.brand, p.pack].filter(Boolean).join(" · ")}
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {c.links
                  .filter((l) => l.packId === p.packId)
                  .map((l) => l.hospital ?? Q.shared)
                  .join(", ")}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
          <Label htmlFor={`how-${c.code}`}>{Q.how}</Label>
          <Input id={`how-${c.code}`} value={how} onChange={(e) => setHow(e.target.value)} />
        </div>
        {w.fresh ?? (
          <Button
            disabled={!keep || how.trim().length < 3 || w.pending}
            onClick={() =>
              w.run(
                () =>
                  settleConflictAction({
                    codeType: c.codeType,
                    code: c.code,
                    keepPackId: keep,
                    note: how,
                  }),
                Q.done,
              )
            }
          >
            {Q.settle}
          </Button>
        )}
      </div>
      {w.status}
    </li>
  );
}

function SourceRow({ s }: { s: QueueData["sources"][number] }) {
  const w = useWrite();
  return (
    <li className={ROW}>
      <span className="text-body-s text-foreground font-medium">
        {Q.source[s.source] ?? s.source} · {s.kind.replace(/_/g, " ")}
      </span>
      <span className="text-body-s text-muted-foreground tabular-nums">
        {Q.open(s.open)} · {Q.forYou(s.forYou)}
      </span>
      <span className={ACT}>
        {w.fresh ?? (
          <Button
            variant="secondary"
            disabled={!s.forYou || w.pending}
            onClick={() =>
              w.run(() => confirmBatchAction({ kind: s.kind, source: s.source }), Q.batchDone)
            }
          >
            {Q.batch}
          </Button>
        )}
        {w.status}
      </span>
    </li>
  );
}
