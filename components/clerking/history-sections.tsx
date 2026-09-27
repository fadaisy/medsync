"use client";

import type { History, HistoryHeader } from "@/lib/clerking/answers";
import type { Catalogue } from "@/lib/clerking/catalogue";
import type { SectionId } from "@/lib/clerking/status";
import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import {
  addComplaint,
  durationText,
  removeComplaint,
  toggleAnswer,
  updateComplaint,
} from "@/lib/clerking/answers";
import { lc } from "@/lib/clerking/compose";
import { Chip, Segmented, YesNoRow } from "./controls";
import {
  alsoAskedGroups,
  complaintIndex,
  entrySummary,
  searchComplaints,
  whereWords,
} from "./model";
import { PropertyEditor } from "./property-editor";

/**
 * The history half's section bodies built so far: [01] Complaint (§5.2) and [02] History (§5.3).
 * Systems, Past history, Family and Social are Phase 5–6 (PendingBody below marks the seam).
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
}

const INPUT =
  "border-input bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-8 rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11 disabled:opacity-60";

/* ─── [01] Complaint ────────────────────────────────────────────── */

export function ComplaintBody(props: HistoryBodyProps) {
  const { cat, header, history, onHeader, onHistory, editable, cautionFrom } = props;
  const [open, setOpen] = useState<string | null>(() => history.complaints.at(-1)?.key ?? null);
  const [q, setQ] = useState("");
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
          <span className="border-input bg-card focus-within:shadow-focus flex min-h-9 items-center gap-2 rounded-sm border px-2.5 pointer-coarse:min-h-11">
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
    </div>
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

/* ─── Phase 5–6 seam ────────────────────────────────────────────── */

/**
 * TODO(clerking-v2 Phase 5: Systems; Phase 6: Past history, Family, Social): replace with
 * SystemsBody / PastHistoryBody / FamilyBody / SocialBody, each taking HistoryBodyProps (plus, for
 * Past history, the medicine and allergy handlers from the desk's `on`).
 */
export function PendingBody({ section }: { section: SectionId }) {
  return (
    <p data-pending={section} className="text-body-s text-muted-foreground">
      This section is not built yet on the new desk.
    </p>
  );
}
