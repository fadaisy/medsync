"use client";

import type { Edge, Known } from "@/lib/clerking/impression/relations";
import type { Catalogued, DueLabel } from "@/lib/clerking/impression/relations-catalogue";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { GripVerticalIcon, LockIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import { relWord } from "@/lib/clerking/impression/relations";
import {
  cataloguedRelation,
  listedReversed,
  precipitantsFor,
} from "@/lib/clerking/impression/relations-catalogue";
import { cn } from "@/lib/utils";

/**
 * The relation dialogs and rows of the Impression board (dx-relations-design §4.2–4.3): the chooser
 * a drop opens when the catalogue cannot decide (D-REL-06: reverse direction, ambiguous, not
 * listed), "Relate to…" (the keyboard and touch path: pick the target, then the relation), Change
 * on a cause link, the demotion confirm (Gate B) and the Background row. Every pop-up is the
 * centred EmrDialog; every relation is in words.
 */

/** A relation the clinician chose: the record's direction, condition first. */
export interface RelateChoice {
  conditionId: string;
  relatedConditionId: string;
  /** risk_factor_for: an included risk-factor line (D-REL-04), never from the chooser. */
  relationType: "due_to" | "associated_with" | "risk_factor_for";
  label: DueLabel | null;
  qualifiers: string[];
  catalogueRef: string | null;
}

export interface RelateEnd {
  id: string;
  name: string;
  dxId: string | null;
  known?: boolean;
}

export interface RelateRequest {
  src: RelateEnd;
  /** Absent: "Relate to…" picks the target first. */
  tgt?: RelateEnd;
  /** Change the wording of an existing cause link (src is its condition, tgt its cause). */
  edit?: Edge;
}

type ChoiceId = DueLabel | "associated" | "reversed";
const CHOICES: { id: Exclude<ChoiceId, "reversed">; words: string }[] = [
  { id: "secondary", words: "is secondary to" },
  { id: "complication", words: "is a complication of" },
  { id: "precipitated_by", words: "was precipitated by" },
  { id: "associated", words: "is associated with (not a cause)" },
];

const catalogueChoice = (c: Catalogued | null): ChoiceId | null =>
  !c ? null : c.type === "associated_with" ? "associated" : c.label;

/** The catalogue's word for a pair, for the target list ("Suggested: secondary to"). */
export function suggestion(src: string | null, tgt: string | null): string | null {
  if (!src || !tgt) return null;
  const c = cataloguedRelation(src, tgt);
  if (c && !c.ambiguous) return `Suggested: ${relWord(c)}`;
  if (c) return "Listed both ways: you choose the direction";
  if (listedReversed(src, tgt)) return "Suggested the other way round";
  return null;
}

export function RelateDialog({
  req,
  targets,
  onClose,
  onLink,
}: {
  req: RelateRequest | null;
  /** For "Relate to…": every place it could go, with why a place is refused. */
  targets: (RelateEnd & { refused: string | null })[];
  onClose: () => void;
  onLink: (c: RelateChoice) => void;
}) {
  const [picked, setPicked] = useState<RelateEnd | null>(null);
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [quals, setQuals] = useState<string[] | null>(null);
  const [lastReq, setLastReq] = useState<RelateRequest | null>(null);
  // A new request starts clean (state reset on prop change, without an effect).
  if (req !== lastReq) {
    setLastReq(req);
    setPicked(null);
    setChoice(req?.edit?.label ?? null);
    setQuals(req?.edit ? req.edit.qualifiers : null);
  }
  const src = req?.src;
  const tgt = req?.tgt ?? picked;
  const cat = src && tgt && src.dxId && tgt.dxId ? cataloguedRelation(src.dxId, tgt.dxId) : null;
  const rev =
    src && tgt && src.dxId && tgt.dxId && listedReversed(src.dxId, tgt.dxId)
      ? cataloguedRelation(tgt.dxId, src.dxId)
      : null;
  // "Relate to…" after picking a target preselects the catalogue's unambiguous choice; a drop that
  // reached the chooser has none to preselect (D-REL-06).
  const pre = !req?.tgt && cat && !cat.ambiguous ? catalogueChoice(cat) : null;
  const sel = choice ?? pre;
  const flip = sel === "reversed";
  const effectDx = flip ? tgt?.dxId : src?.dxId;
  const causal = sel !== null && sel !== "associated";
  const offers = causal && effectDx ? precipitantsFor(effectDx) : [];
  const q = quals ?? [];
  const close = () => onClose();

  const link = () => {
    if (!src || !tgt || !sel) return;
    const used = flip ? rev : cat;
    const type = flip ? rev!.type : sel === "associated" ? "associated_with" : "due_to";
    const label: DueLabel | null = flip ? rev!.label : sel === "associated" ? null : sel;
    onLink({
      conditionId: flip ? tgt.id : src.id,
      relatedConditionId: flip ? src.id : tgt.id,
      relationType: type,
      label,
      qualifiers: type === "due_to" ? q.filter((x) => offers.some((o) => o.id === x)) : [],
      catalogueRef: used && used.type === type && used.label === label ? used.ref : null,
    });
  };

  const title = req?.edit
    ? `Change the link: ${src?.name}`
    : tgt
      ? `How does ${src?.name} relate to ${tgt.name}?`
      : `Relate ${src?.name} to…`;
  return (
    <EmrDialog
      open={!!req}
      onOpenChange={(o) => !o && close()}
      title={title}
      description={
        req?.edit
          ? "Choose the wording of this cause link."
          : tgt
            ? cat?.ambiguous
              ? "The catalogue lists these two both ways round: choose the direction."
              : "Nothing is chosen for you: choose how they relate, or leave them unrelated."
            : "Choose the diagnosis it relates to. The catalogue's suggestion is shown first."
      }
      footer={
        tgt ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {req?.edit ? null : (
              <Button variant="secondary" onClick={close}>
                Leave unrelated (co-existing)
              </Button>
            )}
            <Button disabled={!sel} onClick={link}>
              {req?.edit ? "Save" : "Link"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        )
      }
    >
      {!tgt ? (
        <ul className="flex flex-col gap-1.5" aria-label="Diagnoses it could relate to">
          {targets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={!!t.refused}
                onClick={() => setPicked(t)}
                className="border-border hover:bg-muted focus-visible:shadow-focus flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left outline-none disabled:opacity-60 pointer-coarse:min-h-11"
              >
                <span className="text-body-s text-foreground">
                  {t.known ? `Known: ${t.name}` : t.name}
                </span>
                <span className="text-caption text-muted-foreground">
                  {t.refused ?? suggestion(src?.dxId ?? null, t.dxId) ?? "Not in the catalogue"}
                </span>
              </button>
            </li>
          ))}
          {targets.length ? null : (
            <li className="text-body-s text-muted-foreground">
              Nothing on the board to relate to.
            </li>
          )}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="How they relate" className="flex flex-col gap-1.5">
            {rev && !req?.edit ? (
              <Choice
                on={sel === "reversed"}
                onPick={() => setChoice("reversed")}
                text={`Did you mean: ${tgt.name} ${relWord(rev)} ${src?.name}?`}
              />
            ) : null}
            {CHOICES.filter((c) => !req?.edit || c.id !== "associated").map((c) => (
              <Choice
                key={c.id}
                on={sel === c.id}
                onPick={() => setChoice(c.id)}
                text={`${src?.name} ${c.words} ${tgt.known ? "known " : ""}${tgt.name}`}
              />
            ))}
          </div>
          {offers.length ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-caption text-muted-foreground">
                Also precipitated by (optional)
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {offers.map((o) => {
                  const on = q.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setQuals(on ? q.filter((x) => x !== o.id) : [...q, o.id])}
                      className={cn(
                        "text-caption border-border focus-visible:shadow-focus min-h-8 rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11",
                        on
                          ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                          : "bg-card",
                      )}
                    >
                      {on ? `Included: ${o.display}` : o.display}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </div>
      )}
    </EmrDialog>
  );
}

function Choice({ on, onPick, text }: { on: boolean; onPick: () => void; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        "text-body-s focus-visible:shadow-focus flex min-h-9 items-center gap-2 rounded-md border px-3 text-left outline-none pointer-coarse:min-h-11",
        on
          ? "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
          : "border-border hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-3.5 shrink-0 rounded-full border",
          on ? "border-4 border-teal-700" : "border-ink-400",
        )}
      />
      {text}
    </button>
  );
}

/** "Move Malaria to the differential?": the links to be retired, by name (Gate B). */
export function DemoteDialog({
  ask,
  onCancel,
  onConfirm,
}: {
  ask: { name: string; links: string[] } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <EmrDialog
      open={!!ask}
      onOpenChange={(o) => !o && onCancel()}
      title={`Move ${ask?.name} to the differential?`}
      description="A differential cannot be linked (D-REL-08). These links will be retired, with the reason; the linked diagnoses stay on the visit as co-existing."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Retire the links and move</Button>
        </>
      }
    >
      <ul className="text-body-s text-foreground flex list-disc flex-col gap-1 pl-5">
        {ask?.links.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </EmrDialog>
  );
}

/** One relation as the card shows it, in words, with its own controls. */
export function RelationLine({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="text-caption text-foreground inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{text}</span>
      {children}
    </span>
  );
}

/** A small text button for a relation (Change, Undo, Unlink). */
export function LinkButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="text-caption focus-visible:shadow-focus rounded-xs font-medium text-teal-700 outline-none hover:underline disabled:opacity-50 dark:text-teal-300 pointer-coarse:min-h-11"
    >
      {children}
    </button>
  );
}

/** The grip a card is moved by (pointer, long-press or Space). */
export function Grip(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="text-muted-foreground hover:bg-muted focus-visible:shadow-focus inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm outline-none select-none aria-pressed:bg-teal-50 aria-pressed:text-teal-800 dark:aria-pressed:bg-teal-950 dark:aria-pressed:text-teal-200 pointer-coarse:size-11"
    >
      <GripVerticalIcon aria-hidden className="size-3.5" />
    </button>
  );
}

/** "Background: known conditions" (R5): the problem list as read-only chips. */
export function BackgroundRow({
  items,
  canWrite,
  drag,
  overWords,
  onActive,
}: {
  items: { item: Known; active: boolean }[];
  canWrite: boolean;
  drag: {
    grip: (k: Known) => ButtonHTMLAttributes<HTMLButtonElement> | null;
    target: (k: Known) => Record<string, string>;
  };
  /** What a drop here would do, while a card is over it. */
  overWords: (k: Known) => string | null;
  onActive: ((k: Known) => void) | null;
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="impression-background" className="flex flex-col gap-2">
      <h3 id="impression-background" className="text-label text-foreground">
        Background: known conditions
      </h3>
      <ul className="flex flex-wrap gap-2">
        {items.map(({ item: k, active }) => {
          const g = canWrite && !active ? drag.grip(k) : null;
          const words = overWords(k);
          return (
            <li
              key={k.logicalId}
              data-card=""
              {...drag.target(k)}
              className="border-border bg-card flex min-h-9 flex-wrap items-center gap-2 rounded-md border px-2 py-1 data-[dragging=true]:opacity-60 data-[over=true]:ring-2 data-[over=true]:ring-teal-600"
            >
              {g ? <Grip {...g} /> : null}
              <span className="text-body-s text-foreground inline-flex items-center gap-1">
                {k.restricted ? <LockIcon aria-label="Restricted" className="size-3" /> : null}
                {k.display}
              </span>
              <span className="text-caption text-muted-foreground">{`On record since ${k.since.slice(0, 4)}`}</span>
              {active ? (
                <span className="text-caption text-teal-text">Active this visit</span>
              ) : canWrite && onActive ? (
                <LinkButton onClick={() => onActive(k)}>Active this visit</LinkButton>
              ) : null}
              {words ? <span className="text-caption text-teal-text">{words}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
