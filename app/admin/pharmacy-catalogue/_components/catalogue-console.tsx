"use client";

import type { ActionResult } from "@/lib/emr/write/context";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { confirmLinksAction, recordRowCheckAction, removeLinkAction } from "../actions";

/** The CSO's national-list console (ADR 0282). Every write asks for a fresh second factor when stale. */

interface Candidate {
  id: string;
  genericName: string;
  form: string | null;
  strength: string | null;
  levelOfCare: string | null;
  venClass: string | null;
  specialist: boolean;
  sourcePage: number | null;
  flagged: boolean;
  linkable: boolean;
}
interface Proposal {
  medicineId: string;
  generic: string;
  linkedRowId: string | null;
  candidates: Candidate[];
}
interface Flagged {
  id: string;
  genericName: string;
  form: string | null;
  strength: string | null;
  kind: "medicine" | "supply";
  sourcePage: number | null;
  checkNote: string;
  check: { note: string; at: string } | null;
}

const VEN: Record<string, string> = { V: "Vital", E: "Essential", N: "Necessary" };
const TARGET = "min-h-11";
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
const describe = (c: Candidate) =>
  [
    c.form,
    c.strength,
    c.levelOfCare && `level ${c.levelOfCare}`,
    c.venClass && VEN[c.venClass],
    c.specialist && "specialist",
    c.sourcePage && `p. ${c.sourcePage}`,
  ]
    .filter(Boolean)
    .join(" · ");

/** One write with the fresh-factor retry and a spoken result. */
function useWrite() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [retry, setRetry] = useState<{ fn: () => Promise<ActionResult>; done: string } | null>(
    null,
  );
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, done: string) =>
    start(async () => {
      const r = await fn();
      if (needsFreshFactor(r)) return setRetry({ fn, done });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({ ok: true, text: done });
      router.refresh();
    });
  const fresh = retry ? (
    <FreshFactor
      onCancel={() => setRetry(null)}
      onConfirmed={() => {
        setRetry(null);
        run(retry.fn, retry.done);
      }}
    />
  ) : null;
  const status = (
    <p role="status" aria-live="polite" className="text-body-s min-h-5">
      {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
    </p>
  );
  return { run, pending, fresh, status };
}

export function CatalogueConsole({
  edition,
  counts,
  proposals,
  flagged,
}: {
  edition: { id: string; name: string; source: string; importedAt: string };
  counts: {
    rows: number;
    medicines: number;
    supplies: number;
    specialist: number;
    flagged: number;
    linked: number;
  };
  proposals: Proposal[];
  flagged: Flagged[];
}) {
  const open = proposals.filter((p) => !p.linkedRowId);
  const linked = proposals.filter((p) => p.linkedRowId);
  const single = open.filter((p) => p.candidates.length === 1 && p.candidates[0]!.linkable);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="nl-edition" className="flex flex-col gap-2">
        <h2 id="nl-edition" className="text-heading-s text-foreground">
          {edition.name}
        </h2>
        <p className="text-body-s text-muted-foreground">
          {edition.source} · loaded {when(edition.importedAt)}
        </p>
        <p className="text-body-s text-foreground">
          {counts.rows} rows: {counts.medicines} medicines and {counts.supplies} health supplies;{" "}
          {counts.specialist} under a specialist band; {counts.flagged} flagged to check against the
          printed list. {counts.linked} of the prescribing list&apos;s medicines are linked.
        </p>
      </section>

      <section aria-labelledby="nl-propose" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="nl-propose" className="text-heading-s text-foreground">
            Links to confirm · {open.length}
          </h2>
          {single.length ? <ConfirmSingles editionId={edition.id} single={single} /> : null}
        </div>
        {open.length ? (
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {open.map((p) => (
              <ProposalRow key={p.medicineId} editionId={edition.id} p={p} />
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">Every proposal is linked.</p>
        )}
      </section>

      <section aria-labelledby="nl-flagged" className="flex flex-col gap-3">
        <h2 id="nl-flagged" className="text-heading-s text-foreground">
          Rows to check against the printed list · {flagged.filter((f) => !f.check).length}
        </h2>
        <p className="text-body-s text-muted-foreground max-w-prose">
          These rows were not read with confidence. They stay as printed; a flagged medicine row
          cannot be linked until you record that you checked it.
        </p>
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {flagged.map((f) => (
            <FlaggedRow key={f.id} f={f} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="nl-linked" className="flex flex-col gap-3">
        <h2 id="nl-linked" className="text-heading-s text-foreground">
          Linked · {linked.length}
        </h2>
        {linked.length ? (
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {linked.map((p) => (
              <LinkedRow key={p.medicineId} editionId={edition.id} p={p} />
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">Nothing is linked yet.</p>
        )}
      </section>
    </div>
  );
}

function ProposalRow({ editionId, p }: { editionId: string; p: Proposal }) {
  const first = p.candidates.find((c) => c.linkable);
  const [chosen, setChosen] = useState(p.candidates.length === 1 ? (first?.id ?? "") : "");
  const w = useWrite();
  const name = `pick-${p.medicineId}`;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-m text-foreground mb-1 font-medium">{p.generic}</legend>
        {p.candidates.map((c) => (
          <label key={c.id} className="text-body-s flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={name}
              value={c.id}
              checked={chosen === c.id}
              disabled={!c.linkable}
              onChange={() => setChosen(c.id)}
              className="size-4"
            />
            <span className={c.linkable ? "text-foreground" : "text-muted-foreground"}>
              {c.genericName} · {describe(c) || "no form or strength printed"}
            </span>
            {c.flagged && !c.linkable ? (
              <StatusWord tone="caution">Check against the printed list first</StatusWord>
            ) : null}
          </label>
        ))}
      </fieldset>
      {w.fresh ?? (
        <div>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            disabled={!chosen || w.pending}
            onClick={() =>
              w.run(
                () =>
                  confirmLinksAction({
                    editionId,
                    picks: [{ medicineId: p.medicineId, rowId: chosen }],
                  }),
                `Linked: ${p.generic}.`,
              )
            }
          >
            Link this row
          </Button>
        </div>
      )}
      {w.status}
    </li>
  );
}

function ConfirmSingles({ editionId, single }: { editionId: string; single: Proposal[] }) {
  const [open, setOpen] = useState(false);
  const w = useWrite();
  return (
    <EditorDialog
      width="medium"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <DialogTrigger render={<Button variant="secondary" className={TARGET} />}>
          Review the {single.length} single matches
        </DialogTrigger>
      }
    >
      <SheetHeader>
        <SheetTitle>Link {single.length} medicines with one matching row</SheetTitle>
        <SheetDescription>
          Each has exactly one row in the national list with the same name. Read the list, then link
          them all.
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-2">
        <ul className="divide-border divide-y">
          {single.map((p) => (
            <li key={p.medicineId} className="text-body-s flex flex-col py-2">
              <span className="text-foreground font-medium">{p.generic}</span>
              <span className="text-muted-foreground">{describe(p.candidates[0]!)}</span>
            </li>
          ))}
        </ul>
        {w.status}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="secondary" className={TARGET} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {w.fresh ?? (
          <Button
            type="button"
            className={TARGET}
            disabled={w.pending}
            onClick={() =>
              w.run(
                () =>
                  confirmLinksAction({
                    editionId,
                    picks: single.map((p) => ({
                      medicineId: p.medicineId,
                      rowId: p.candidates[0]!.id,
                    })),
                  }),
                `Linked ${single.length} medicines.`,
              )
            }
          >
            Link all {single.length}
          </Button>
        )}
      </SheetFooter>
    </EditorDialog>
  );
}

function LinkedRow({ editionId, p }: { editionId: string; p: Proposal }) {
  const row = p.candidates.find((c) => c.id === p.linkedRowId);
  const w = useWrite();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span className="text-body-s">
        <span className="text-foreground font-medium">{p.generic}</span>
        <span className="text-muted-foreground">
          {" "}
          → {row ? describe(row) : "a row no longer listed"}
        </span>
      </span>
      {w.fresh ?? (
        <Button
          type="button"
          variant="ghost"
          className={TARGET}
          disabled={w.pending}
          onClick={() =>
            w.run(
              () => removeLinkAction({ editionId, medicineId: p.medicineId }),
              `Unlinked: ${p.generic}.`,
            )
          }
        >
          Unlink
        </Button>
      )}
      {w.status}
    </li>
  );
}

function FlaggedRow({ f }: { f: Flagged }) {
  const [note, setNote] = useState("");
  const w = useWrite();
  const id = `check-${f.id}`;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-body-m text-foreground font-medium">
          {f.genericName}
          {f.form || f.strength ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {[f.form, f.strength].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="text-caption text-muted-foreground">
          {f.kind === "supply" ? "Health supply" : "Medicine"}
          {f.sourcePage ? ` · page ${f.sourcePage}` : ""}
        </span>
      </div>
      <p className="text-body-s text-muted-foreground">{f.checkNote}</p>
      {f.check ? (
        <p className="text-body-s text-foreground">
          Checked {when(f.check.at)}: {f.check.note}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={id} className="text-body-s text-muted-foreground">
            What you checked against the printed list
          </label>
          <textarea
            id={id}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={600}
            rows={2}
            className="border-input bg-background text-body-s focus-visible:ring-ring/50 rounded-md border px-3 py-2 outline-none focus-visible:ring-[3px]"
          />
          {w.fresh ?? (
            <div>
              <Button
                type="button"
                variant="secondary"
                className={TARGET}
                disabled={note.trim().length < 10 || w.pending}
                onClick={() =>
                  w.run(() => recordRowCheckAction({ rowId: f.id, note }), "Check recorded.")
                }
              >
                Record the check
              </Button>
            </div>
          )}
        </div>
      )}
      {w.status}
    </li>
  );
}
