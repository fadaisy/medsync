"use client";

import type { History, HistoryHeader } from "@/lib/clerking/answers";
import type { Catalogue, PatientSex } from "@/lib/clerking/catalogue";
import { useMemo, useState } from "react";
import { CheckIcon, LayoutGridIcon, LockIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import {
  addComplaint,
  durationText,
  removeComplaint,
  toggleAnswer,
  updateComplaint,
} from "@/lib/clerking/answers";
import { isRestricted } from "@/lib/clerking/catalogue";
import { lc } from "@/lib/clerking/compose";
import { Chip, Segmented, YesNoRow } from "./controls";
import {
  alsoAskedGroups,
  complaintGroups,
  complaintIndex,
  entrySummary,
  searchComplaints,
  whereWords,
} from "./model";
import { PropertyEditor } from "./property-editor";

/**
 * [01] Complaint (§5.2) and [02] History (§5.3), and the props every history section body takes.
 * Systems, Past history, Family and Social live in their own files.
 */

export interface HistoryBodyProps {
  cat: Catalogue;
  header: HistoryHeader;
  history: History;
  onHeader: (h: HistoryHeader) => void;
  onHistory: (update: (h: History) => History) => void;
  editable: boolean;
  /** The signed REF-FLAG-PAIN-SEVERE value, or null. */
  cautionFrom: number | null;
  /** The recorded sex (sex-appropriate systems, C2). */
  sex?: PatientSex;
  /** Two identifiers for the pop-ups (Law 9). */
  patient?: { name: string; mrn: string };
  /** Complaint: open this card first (a linked answer tapped in Systems, D-CV-08). */
  openKey?: string | null;
  /** Systems: a linked answer opens its complaint. */
  onOpenComplaint?: (key: string) => void;
}

const INPUT =
  "border-input bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-8 rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11 disabled:opacity-60";

/* ─── [01] Complaint ────────────────────────────────────────────── */

export function ComplaintBody(props: HistoryBodyProps) {
  const { cat, header, history, onHeader, onHistory, editable, cautionFrom } = props;
  const [open, setOpen] = useState<string | null>(
    () => props.openKey ?? history.complaints.at(-1)?.key ?? null,
  );
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const index = useMemo(() => complaintIndex(cat), [cat]);
  const hits = q.trim() ? searchComplaints(index, q) : [];

  const add = (symptom: string | null, text?: string) => {
    const existing = symptom ? history.complaints.find((c) => c.symptom === symptom) : undefined;
    const key = existing?.key ?? crypto.randomUUID();
    if (!existing) onHistory((h) => addComplaint(h, symptom, key, text));
    setOpen(key);
    setQ("");
  };
  const picks = cat.data.complaint_quick_picks
    .map((id) => cat.symptom(id))
    .filter((s) => s && !history.complaints.some((c) => c.symptom === s.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-4">
        <span aria-hidden className="text-caption text-muted-foreground">
          History from
        </span>
        <Segmented
          label="History from"
          options={cat.data.option_sets.historian ?? []}
          value={header.historian}
          disabled={!editable}
          onPick={(id) =>
            onHeader({ ...header, historian: header.historian === id ? undefined : id })
          }
        />
        <label className="text-caption text-muted-foreground inline-flex items-center gap-2">
          Language
          <input
            className={`${INPUT} w-32`}
            value={header.language ?? ""}
            disabled={!editable}
            onChange={(e) => onHeader({ ...header, language: e.target.value || undefined })}
          />
        </label>
        <label className="text-caption text-muted-foreground inline-flex items-center gap-2">
          Interpreter
          <input
            className={`${INPUT} w-48`}
            value={header.interpreter ?? ""}
            placeholder="Name and relationship"
            disabled={!editable}
            onChange={(e) => onHeader({ ...header, interpreter: e.target.value || undefined })}
          />
        </label>
      </div>

      {history.complaints.length ? (
        <ul aria-label="Presenting complaints" className="flex flex-col gap-3">
          {history.complaints.map((c) => {
            const s = c.symptom ? (cat.symptom(c.symptom) ?? null) : null;
            const name = s?.label ?? c.text ?? "";
            const isOpen = open === c.key;
            const toggle = () => setOpen(isOpen ? null : c.key);
            const summary = s ? entrySummary(cat, s, c) : "";
            return (
              <li key={c.key} className="border-border overflow-hidden rounded-lg border">
                <div className="bg-muted/40 flex items-center gap-2 py-1.5 pr-2 pl-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`clerking-cc-${c.key}`}
                    onClick={toggle}
                    className="focus-visible:shadow-focus flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left outline-none"
                  >
                    <span className="text-body-m text-foreground shrink-0 font-medium">{name}</span>
                    {!s || s.duration ? (
                      c.duration ? (
                        <span className="text-body-s text-foreground shrink-0 font-mono tabular-nums">
                          {durationText(c.duration)}
                        </span>
                      ) : (
                        <StatusWord tone="caution" className="shrink-0">
                          How long?
                        </StatusWord>
                      )
                    ) : null}
                    {s ? (
                      <span className="text-body-s text-muted-foreground min-w-0 truncate">
                        {summary || "No properties yet"}
                      </span>
                    ) : (
                      <StatusWord tone="neutral" className="shrink-0">
                        Uncatalogued, no properties
                      </StatusWord>
                    )}
                  </button>
                  <Button variant="secondary" size="sm" onClick={toggle} className="shrink-0">
                    {isOpen ? "Done" : "Properties"}
                  </Button>
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Remove ${name}`}
                      onClick={() => onHistory((h) => removeComplaint(h, c.key))}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {isOpen ? (
                  <div id={`clerking-cc-${c.key}`} className="border-border border-t p-3">
                    <PropertyEditor
                      cat={cat}
                      symptom={s}
                      entry={c}
                      cautionFrom={cautionFrom}
                      disabled={!editable}
                      onEntry={(fn) => onHistory((h) => updateComplaint(h, c.key, fn))}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">No complaint recorded yet.</p>
      )}

      {editable ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="clerking-complaint-search" className="text-caption text-muted-foreground">
            Add a complaint
          </label>
          <div className="flex items-center gap-2">
            <span className="border-input bg-card focus-within:shadow-focus flex min-h-9 flex-1 items-center gap-2 rounded-sm border px-2.5 pointer-coarse:min-h-11">
              <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
              <input
                id="clerking-complaint-search"
                value={q}
                autoComplete="off"
                placeholder="Type a symptom, a synonym or the local term"
                aria-keyshortcuts="/"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQ("");
                  if (e.key !== "Enter" || !q.trim()) return;
                  e.preventDefault();
                  add(hits[0]?.symptom.id ?? null, hits[0] ? undefined : q);
                }}
                className="text-body-s text-foreground min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 pointer-coarse:min-h-11"
              onClick={() => setShowAll(true)}
            >
              <LayoutGridIcon aria-hidden />
              Show all
            </Button>
          </div>
          {q.trim() ? (
            <ul
              aria-label="Matching symptoms"
              className="border-border flex flex-col rounded-md border"
            >
              {hits.map((hit) => (
                <li key={hit.symptom.id}>
                  <button
                    type="button"
                    onClick={() => add(hit.symptom.id)}
                    className="hover:bg-muted focus-visible:bg-muted flex min-h-9 w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left outline-none pointer-coarse:min-h-11"
                  >
                    <span className="text-body-s text-foreground">{hit.label}</span>
                    <span className="text-caption text-muted-foreground">
                      {whereWords(cat, hit.symptom)}
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => add(null, q)}
                  className="hover:bg-muted focus-visible:bg-muted flex min-h-9 w-full flex-wrap items-center gap-2 px-3 py-1.5 text-left outline-none pointer-coarse:min-h-11"
                >
                  <span className="text-body-s text-foreground">{`Add “${q.trim()}” as typed`}</span>
                  <StatusWord tone="neutral">Uncatalogued, no properties</StatusWord>
                </button>
              </li>
            </ul>
          ) : null}
          {picks.length ? (
            <div
              role="group"
              aria-label="Common complaints"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span aria-hidden className="text-caption text-muted-foreground mr-1">
                Common
              </span>
              {picks.map((s) => (
                <Chip key={s!.id} dashed selected={false} onPress={() => add(s!.id)}>
                  <PlusIcon aria-hidden className="size-3.5" />
                  {s!.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {editable ? (
        <AllComplaints
          open={showAll}
          onOpenChange={setShowAll}
          cat={cat}
          sex={props.sex ?? null}
          added={new Set(history.complaints.flatMap((c) => (c.symptom ? [c.symptom] : [])))}
          onPick={(id) => add(id)}
        />
      ) : null}
    </div>
  );
}

/**
 * "Show all": every complaint the catalogue offers, by body system, in the same badges as the
 * Common picks. A tap adds it (the pop-up stays open, so several can be added); one already added
 * shows a tick and opens its card. A filter narrows the list by name or synonym.
 */
function AllComplaints({
  open,
  onOpenChange,
  cat,
  sex,
  added,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cat: Catalogue;
  sex: PatientSex;
  added: ReadonlySet<string>;
  onPick: (symptomId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => complaintGroups(cat, sex), [cat, sex]);
  const f = filter.trim().toLowerCase();
  const shown = f
    ? groups
        .map((g) => ({
          ...g,
          symptoms: g.symptoms.filter((s) =>
            [s.label, ...s.synonyms, ...s.local_terms].some((x) => x.toLowerCase().includes(f)),
          ),
        }))
        .filter((g) => g.symptoms.length)
    : groups;
  const total = groups.reduce((n, g) => n + g.symptoms.length, 0);
  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setFilter("");
      }}
      width="wide"
      kicker="Presenting complaint"
      title="All complaints"
      description={`${total} complaints in the catalogue, by body system. Tap to add; the list stays open.`}
      footer={
        <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="border-input bg-card focus-within:shadow-focus flex min-h-9 items-center gap-2 rounded-sm border px-2.5 pointer-coarse:min-h-11">
          <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="sr-only">Filter complaints</span>
          <input
            value={filter}
            autoComplete="off"
            placeholder="Filter by name or synonym"
            onChange={(e) => setFilter(e.target.value)}
            className="text-body-s text-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {shown.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            Nothing matches. Close this and add it as typed from the search.
          </p>
        ) : (
          <div className="gap-x-8 md:columns-2">
            {shown.map((g) => (
              <section
                key={g.id}
                aria-labelledby={`all-cc-${g.id}`}
                className="mb-5 flex break-inside-avoid flex-col gap-2"
              >
                <h3 id={`all-cc-${g.id}`} className="text-body-s text-foreground font-medium">
                  {g.label}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {g.symptoms.map((s) => {
                    const on = added.has(s.id);
                    return (
                      <Chip key={s.id} dashed={!on} selected={on} onPress={() => onPick(s.id)}>
                        {on ? (
                          <CheckIcon aria-hidden className="size-3.5" />
                        ) : (
                          <PlusIcon aria-hidden className="size-3.5" />
                        )}
                        {s.label}
                        {isRestricted(s.sensitivity) ? (
                          <LockIcon aria-label="Restricted" className="size-3" />
                        ) : null}
                        {on ? <span className="sr-only">(added)</span> : null}
                      </Chip>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </EmrDialog>
  );
}

/* ─── [02] History of presenting complaint ──────────────────────── */

export function HistoryBody({ cat, history, onHistory, editable }: HistoryBodyProps) {
  const groups = alsoAskedGroups(cat, history);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="clerking-story" className="text-body-s text-foreground font-medium">
          The story, in your words
        </label>
        <textarea
          id="clerking-story"
          rows={5}
          value={history.story ?? ""}
          disabled={!editable}
          aria-describedby="clerking-story-help"
          onChange={(e) => {
            const story = e.target.value;
            onHistory((h) => ({ ...h, story }));
          }}
          className="border-input bg-card text-body-m text-foreground focus-visible:shadow-focus w-full rounded-md border px-3 py-2 leading-relaxed outline-none"
        />
        <p id="clerking-story-help" className="text-caption text-muted-foreground">
          The facts from Complaint are already in the note. Write what the chips cannot say.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.symptom.id} aria-label={`Also asked, because of ${lc(g.symptom.label)}`}>
          <h3 className="text-body-s text-foreground pb-1 font-medium">
            {`Also asked, because of ${lc(g.symptom.label)}`}
          </h3>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {g.rows.map((r) => (
              <YesNoRow
                key={r.key}
                label={r.label}
                value={history.alsoAsked[r.key]}
                disabled={!editable}
                onAnswer={(a) =>
                  onHistory((h) => ({ ...h, alsoAsked: toggleAnswer(h.alsoAsked, r.key, a) }))
                }
              />
            ))}
          </div>
        </section>
      ))}
      <p className="text-caption text-muted-foreground">
        These questions follow the complaint. A different complaint brings its own.
      </p>
    </div>
  );
}
