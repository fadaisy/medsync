"use client";

import type { ActionResult } from "@/lib/emr/write/context";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { TabList } from "@/components/medsync/tab-list";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
export function useWrite() {
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
    <span role="status" aria-live="polite" className="text-body-s">
      {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
    </span>
  );
  return { run, pending, fresh, status };
}

type Tab = "single" | "choose" | "check" | "linked";
const PAGE = 15;

/** One line per item: name, detail, action. Stacks below `md`. */
export const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-2.5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] md:items-center";
/** The action cell: beside the text on a phone, its own column from `md`. */
export const ACT =
  "col-start-2 row-span-2 row-start-1 flex flex-wrap items-center justify-end gap-2 self-center md:col-start-auto md:row-span-1 md:row-start-auto";
const HEAD = `${ROW} text-caption text-muted-foreground bg-muted hidden font-medium md:grid`;
const SELECT =
  "border-input bg-background text-body-s h-11 w-full min-w-0 rounded-md border px-2 md:h-9";
const matches = (q: string, ...xs: (string | null)[]) =>
  !q || xs.some((x) => x?.toLowerCase().includes(q));

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
  const [tab, setTab] = useState<Tab>("single");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const open = proposals.filter((p) => !p.linkedRowId);
  const linked = proposals.filter((p) => p.linkedRowId);
  const oneRow = open.filter((p) => p.candidates.length === 1);
  const manyRows = open.filter((p) => p.candidates.length > 1);
  const single = oneRow.filter((p) => p.candidates[0]!.linkable);
  const toCheck = [...flagged].sort((a, b) => Number(!!a.check) - Number(!!b.check));
  const unchecked = flagged.filter((f) => !f.check).length;
  const panel = "nl-panel";
  const pick = <T,>(xs: T[], name: (x: T) => string) => {
    const hit = xs.filter((x) => matches(q, name(x)));
    const pages = Math.max(1, Math.ceil(hit.length / PAGE));
    const at = Math.min(page, pages - 1);
    return { rows: hit.slice(at * PAGE, at * PAGE + PAGE), total: hit.length, at, pages };
  };
  const go = (t: Tab) => {
    setTab(t);
    setPage(0);
  };
  const shown =
    tab === "single"
      ? pick(oneRow, (p) => p.generic)
      : tab === "choose"
        ? pick(manyRows, (p) => p.generic)
        : tab === "linked"
          ? pick(linked, (p) => p.generic)
          : null;
  const shownFlagged = tab === "check" ? pick(toCheck, (f) => f.genericName) : null;
  const pager = shown ?? shownFlagged!;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-muted-foreground">
        <span className="text-foreground font-medium">{edition.name}</span> · {edition.source} ·
        loaded {when(edition.importedAt)} · {counts.medicines} medicines, {counts.supplies}{" "}
        supplies, {counts.specialist} specialist, {counts.flagged} flagged
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabList
          label="National list"
          controls={panel}
          value={tab}
          onChange={go}
          options={[
            { value: "single", label: "One match", count: oneRow.length },
            { value: "choose", label: "Choose a row", count: manyRows.length },
            { value: "check", label: "To check", count: unchecked },
            { value: "linked", label: "Linked", count: linked.length },
          ]}
        />
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <Label htmlFor="nl-find" className="sr-only">
            Find by name
          </Label>
          <Input
            id="nl-find"
            type="search"
            placeholder="Find by name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="min-h-11 sm:min-h-9"
          />
        </div>
      </div>

      <div id={panel} role="tabpanel" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-s text-muted-foreground max-w-prose">
            {tab === "single"
              ? "Each has exactly one row with the same name. Link them one by one, or review them all together."
              : tab === "choose"
                ? "Each has several rows with the same name. Choose the one that matches how it is prescribed."
                : tab === "check"
                  ? "These rows were not read with confidence and stay as printed. A flagged medicine row can be linked only after you record that you checked it against the PDF."
                  : "Unlink a medicine if it was linked to the wrong row."}
          </p>
          {tab === "single" && single.length ? (
            <ConfirmSingles editionId={edition.id} single={single} />
          ) : null}
        </div>
        {tab === "check" ? (
          <Table head={["Item", "Why it is flagged", ""]} empty="Nothing matches.">
            {shownFlagged!.rows.map((f) => (
              <FlaggedRow key={f.id} f={f} />
            ))}
          </Table>
        ) : tab === "linked" ? (
          <Table
            head={["Medicine", "Linked to", ""]}
            empty={linked.length ? "Nothing matches." : "Nothing is linked yet."}
          >
            {shown!.rows.map((p) => (
              <LinkedRow key={p.medicineId} editionId={edition.id} p={p} />
            ))}
          </Table>
        ) : (
          <Table
            head={["Medicine", "National-list row", ""]}
            empty={
              (tab === "single" ? oneRow : manyRows).length ? "Nothing matches." : "All linked."
            }
          >
            {shown!.rows.map((p) => (
              <ProposalRow key={p.medicineId} editionId={edition.id} p={p} />
            ))}
          </Table>
        )}
        {pager.pages > 1 ? (
          <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-s text-muted-foreground" aria-live="polite">
              {pager.at * PAGE + 1}–{Math.min(pager.total, (pager.at + 1) * PAGE)} of {pager.total}
            </span>
            <span className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 md:min-h-9"
                disabled={pager.at === 0}
                onClick={() => setPage(pager.at - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 md:min-h-9"
                disabled={pager.at >= pager.pages - 1}
                onClick={() => setPage(pager.at + 1)}
              >
                Next
              </Button>
            </span>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function Table({
  head,
  empty,
  children,
}: {
  head: string[];
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      <div className={HEAD} aria-hidden="true">
        {head.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      {children.length ? (
        <ul className="divide-border divide-y">{children}</ul>
      ) : (
        <p className="text-body-s text-muted-foreground px-4 py-3">{empty}</p>
      )}
    </div>
  );
}

function ProposalRow({ editionId, p }: { editionId: string; p: Proposal }) {
  const one = p.candidates.length === 1;
  const [chosen, setChosen] = useState(one && p.candidates[0]!.linkable ? p.candidates[0]!.id : "");
  const w = useWrite();
  const pickId = `pick-${p.medicineId}`;
  const c0 = p.candidates[0]!;
  return (
    <li className={ROW}>
      <span className="text-body-s text-foreground font-medium">{p.generic}</span>
      {one ? (
        <span className="text-body-s text-muted-foreground flex flex-wrap items-center gap-2">
          {describe(c0) || "no form or strength printed"}
          {!c0.linkable ? <StatusWord tone="caution">Check it first</StatusWord> : null}
        </span>
      ) : (
        <span>
          <label htmlFor={pickId} className="sr-only">
            National-list row for {p.generic}
          </label>
          <select
            id={pickId}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className={SELECT}
          >
            <option value="" disabled>
              Choose one of {p.candidates.length} rows
            </option>
            {p.candidates.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.linkable}>
                {describe(c) || "no form or strength printed"}
                {!c.linkable ? " (check it first)" : ""}
              </option>
            ))}
          </select>
        </span>
      )}
      <span className={ACT}>
        {w.fresh ?? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 md:min-h-9"
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
            Link
          </Button>
        )}
        {w.status}
      </span>
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
            <li
              key={p.medicineId}
              className="text-body-s grid gap-x-4 py-1.5 sm:grid-cols-[minmax(0,13rem)_1fr]"
            >
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
    <li className={ROW}>
      <span className="text-body-s text-foreground font-medium">{p.generic}</span>
      <span className="text-body-s text-muted-foreground">
        {row ? describe(row) : "a row no longer listed"}
      </span>
      <span className={ACT}>
        {w.fresh ?? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-9"
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
      </span>
    </li>
  );
}

function FlaggedRow({ f }: { f: Flagged }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const w = useWrite();
  const id = `check-${f.id}`;
  const what = [f.form, f.strength].filter(Boolean).join(" · ");
  return (
    <li className={ROW}>
      <span className="text-body-s flex flex-col">
        <span className="text-foreground font-medium">{f.genericName}</span>
        <span className="text-caption text-muted-foreground">
          {[
            f.kind === "supply" ? "Health supply" : "Medicine",
            what,
            f.sourcePage && `page ${f.sourcePage}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="text-body-s text-muted-foreground">
        {f.check ? (
          <>
            <span className="text-foreground">Checked {when(f.check.at)}:</span> {f.check.note}
          </>
        ) : (
          f.checkNote
        )}
      </span>
      <span className={ACT}>
        {f.check ? (
          <span className="text-body-s text-muted-foreground">Checked</span>
        ) : (
          <EditorDialog
            width="medium"
            open={open}
            onOpenChange={setOpen}
            trigger={
              <DialogTrigger
                render={<Button variant="secondary" className="min-h-11 md:min-h-9" />}
              >
                Record a check
              </DialogTrigger>
            }
          >
            <SheetHeader>
              <SheetTitle>{f.genericName}</SheetTitle>
              <SheetDescription>
                {f.sourcePage ? `Open the PDF at page ${f.sourcePage}. ` : ""}Why it is flagged:{" "}
                {f.checkNote}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-2">
              <Label htmlFor={id}>What you checked against the printed list</Label>
              <textarea
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={600}
                rows={3}
                className="border-input bg-background text-body-s focus-visible:ring-ring/50 rounded-md border px-3 py-2 outline-none focus-visible:ring-[3px]"
              />
              {w.status}
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="secondary"
                className={TARGET}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              {w.fresh ?? (
                <Button
                  type="button"
                  className={TARGET}
                  disabled={note.trim().length < 10 || w.pending}
                  onClick={() =>
                    w.run(() => recordRowCheckAction({ rowId: f.id, note }), "Check recorded.")
                  }
                >
                  Record the check
                </Button>
              )}
            </SheetFooter>
          </EditorDialog>
        )}
      </span>
    </li>
  );
}
