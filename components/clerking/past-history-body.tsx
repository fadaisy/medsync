"use client";

import type { HistoryBodyProps } from "./history-sections";
import type { DxPick } from "@/components/emr/desk/pickers";
import type { DxTerm } from "@/components/emr/desk/search";
import type { SectionHandlers } from "@/components/emr/desk/sections";
import type { History } from "@/lib/clerking/answers";
import type { Catalogue, Option } from "@/lib/clerking/catalogue";
import type { ClerkingDeskData } from "@/lib/clerking/desk-data";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, LayoutGridIcon, LockIcon, PlusIcon, XIcon } from "lucide-react";

import { REFUTE_ALLERGY_REASONS } from "@/components/emr/desk/model";
import { DiagnosisPicker } from "@/components/emr/desk/pickers";
import { ReasonChoice } from "@/components/emr/desk/sections";
import { EmrDialog } from "@/components/emr/emr-dialog";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { toggleEntry } from "@/lib/clerking/answers";
import { isRestricted } from "@/lib/clerking/catalogue";
import { lc } from "@/lib/clerking/compose";
import { operationById, operationGroups } from "@/lib/clerking/pick-lists";
import { REACTION_TO_MANIFESTATION } from "@/lib/clerking/record-map";
import { cn } from "@/lib/utils";
import { Chip, FieldRow, PANEL, PANEL_HEAD, YesNoRow } from "./controls";
import { PickAllDialog } from "./pick-all-dialog";

/**
 * [04] Past medical history (§5.6), two columns. Left: conditions (a yes offers "known for" and a
 * problem-list entry to confirm, never added on its own; D-CV-09), then operations and
 * transfusions (note only). Right: medicines and allergies, which write through the record at once
 * (D-CV-10, D-EMR-01/04): the cards show the record, the desk's handlers write it, and the refreshed
 * payload redraws them. Every word shown for an answer comes from the catalogue's lists.
 */

export interface MedicineAdd {
  drugText: string;
  /** A restricted catalogue pick (antiretrovirals, TB treatment): stored restricted (Law 10). */
  restricted: boolean;
  informant?: string;
}
export interface MedicinePatch {
  doseText?: string | null;
  frequencyCode?: string | null;
  adherence?: string | null;
  informant?: string | null;
}
export interface AllergyWrite {
  /** A change to this allergy (its next version); absent: a new allergy named `substanceText`. */
  supersedesId?: string;
  substanceText?: string;
  manifestations?: string[];
  severity?: string;
  informant?: string;
  verification?: "refuted";
  reasonCode?: string;
}

/** A write's outcome, so the cards can show a change at once and undo it when the write fails. */
type Saved = Promise<boolean> | void;

export interface PastHistoryHandlers {
  onRecordMedicine?: (m: MedicineAdd) => Saved;
  onMedicineDetails?: (statementId: string, patch: MedicinePatch) => void;
  onAllergy?: (a: AllergyWrite) => Saved;
  /** X on an item first recorded at this visit by this clinician: entered in error. */
  onRemoveAddedHere?: (kind: "medication" | "allergy", id: string) => Saved;
  /** "Code it": the allergy editor, started from this allergy. */
  onCodeAllergy?: (id: string, name: string) => void;
  onAssertAllergy?: (a: "no_known_drug_allergies") => void;
  onConfirmCondition?: (condition: string, pick: DxPick) => void;
}

export interface PastHistoryProps extends HistoryBodyProps {
  record: Pick<ClerkingDeskData, "medicines" | "allergies">;
  /** The active problems' names (a condition already there reads "On the problem list"). */
  problems: readonly string[];
  /** Chart writes allowed (open visit, not deceased). */
  act: boolean;
  busy: string | null;
  on: PastHistoryHandlers & Pick<SectionHandlers, "onMedicine">;
  loadTerms: () => Promise<DxTerm[]>;
  searchTerms?: (q: string) => Promise<DxTerm[]>;
}

const labelOf = (opts: readonly Option[], id: string | null | undefined) =>
  opts.find((o) => o.id === id)?.label;

function Lock() {
  return (
    <span title="Restricted" className="text-muted-foreground inline-flex">
      <LockIcon aria-hidden className="size-3" />
      <span className="sr-only">Restricted</span>
    </span>
  );
}

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className={cn("text-body-s text-foreground font-medium", PANEL_HEAD)}>{children}</h3>
      {aside ? <span className="text-caption text-muted-foreground">{aside}</span> : null}
    </div>
  );
}

const INPUT =
  "border-input bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-8 min-w-0 rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11 disabled:opacity-60";

/* ─── Shown at once ─────────────────────────────────────────────── */

/**
 * A tap shows at once: an add as a "Saving" card, a removal hidden. A failed write undoes its
 * change; a saved one gives way when the refreshed record arrives with it.
 */
function usePending<R>(record: R) {
  const [adds, setAdds] = useState<{ key: number; name: string; savedWith?: R }[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const latest = useRef(record);
  useEffect(() => {
    latest.current = record;
  });
  const next = useRef(0);
  return {
    gone,
    adding: (names: ReadonlySet<string>) =>
      adds.filter(
        (a) => !names.has(a.name.toLowerCase()) && (!a.savedWith || a.savedWith === record),
      ),
    add(name: string, write: Promise<boolean> | void) {
      const key = next.current++;
      setAdds((l) => [
        ...l.filter((a) => !a.savedWith || a.savedWith === latest.current),
        { key, name },
      ]);
      void Promise.resolve(write).then((ok) =>
        setAdds((l) =>
          ok === false
            ? l.filter((a) => a.key !== key)
            : l.map((a) => (a.key === key ? { ...a, savedWith: latest.current } : a)),
        ),
      );
    },
    remove(id: string, write: Promise<boolean> | void) {
      setGone((g) => new Set(g).add(id));
      void Promise.resolve(write).then((ok) => {
        if (ok === false)
          setGone((g) => {
            const n = new Set(g);
            n.delete(id);
            return n;
          });
      });
    },
  };
}

function SavingCard({ name }: { name: string }) {
  return (
    <li className="border-border bg-card flex flex-col rounded-lg border py-2 pr-2 pl-3 opacity-70 max-sm:rounded-none max-sm:border-0 max-sm:border-t max-sm:px-0 max-sm:py-3">
      <span className="text-body-s text-foreground font-medium">{name}</span>
      <span className="text-caption text-muted-foreground">Saving…</span>
    </li>
  );
}

/* ─── Words ─────────────────────────────────────────────────────── */

/** "5 mg · once daily · sometimes misses · from medicine card or book". */
export function medicineSummary(cat: Catalogue, m: ClerkingDeskData["medicines"][number]) {
  const l = cat.data.medicines;
  const src = labelOf(l.source, m.informant);
  return [
    m.doseText || "dose not known",
    lc(labelOf(l.frequency, m.frequencyCode) ?? "frequency not known"),
    lc(labelOf(l.adherence, m.adherence) ?? "adherence not asked"),
    src ? `from ${lc(src)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

type AllergyItem = ClerkingDeskData["allergies"]["items"][number];

export function allergySummary(cat: Catalogue, a: AllergyItem) {
  const l = cat.data.allergies;
  const r = a.reactions.map((id) => labelOf(l.reactions, id)).filter((x): x is string => !!x);
  const sev = labelOf(l.severity, a.severity);
  const src = labelOf(l.source, a.source);
  return [
    r.length ? r.map(lc).join(", ") : "reaction not recorded",
    sev ? lc(sev) : null,
    src ? `from ${lc(src)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const highRisk = (cat: Catalogue, a: AllergyItem) =>
  a.reactions.some((id) => cat.data.allergies.reactions.find((o) => o.id === id)?.high_risk);

/** The allergy status line (§5.6): amber until it is confirmed at this visit. */
export function allergyStatus(
  a: ClerkingDeskData["allergies"],
  confirmed: boolean,
): { text: string; caution: boolean } {
  const n = a.items.length;
  if (a.status === "listed" && n) {
    const what = `${n} ${n === 1 ? "allergy" : "allergies"} on record`;
    return confirmed
      ? { text: `${what}, confirmed today`, caution: false }
      : { text: `${what}, not yet confirmed today`, caution: true };
  }
  if (a.status === "no_known_drug_allergies")
    return a.touchedThisVisit
      ? { text: "No known drug allergies, confirmed today", caution: false }
      : { text: "No known drug allergies, not yet confirmed today", caution: true };
  if (a.status === "unable_to_assess") return { text: "Unable to assess", caution: false };
  return { text: "Allergy status not recorded", caution: true };
}

/* ─── The body ──────────────────────────────────────────────────── */

export function PastHistoryBody(props: PastHistoryProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const cond = props.cat.data.past_history.conditions.find((c) => c.id === confirming);
  return (
    // Phone: one column of panels, allergies first (§4.8); the column wrappers dissolve.
    <div className="grid gap-x-8 gap-y-6 max-sm:flex max-sm:flex-col max-sm:gap-3 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6 max-sm:contents">
        <Conditions {...props} onConfirm={setConfirming} />
        <OperationsAndTransfusions {...props} />
      </div>
      <div className="flex min-w-0 flex-col gap-6 max-sm:contents">
        <Medicines {...props} />
        <Allergies {...props} />
      </div>
      <EmrDialog
        sheet
        open={!!cond}
        onOpenChange={(o) => (o ? undefined : setConfirming(null))}
        title="Confirm on the problem list"
        description={
          props.patient ? (
            <>
              <span>{props.patient.name}</span>{" "}
              <span className="font-mono tabular-nums">{props.patient.mrn}</span>
            </>
          ) : undefined
        }
      >
        {cond ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-s text-foreground">
              {`Choose the term for ${lc(cond.label)}. Nothing is added until you pick one.`}
            </p>
            <DiagnosisPicker
              id="clerking-pmh-problem"
              label="Problem"
              load={props.loadTerms}
              search={props.searchTerms}
              initialQuery={cond.label}
              onPick={(pick) => {
                props.on.onConfirmCondition?.(cond.id, pick);
                setConfirming(null);
              }}
            />
          </div>
        ) : null}
      </EmrDialog>
    </div>
  );
}

/* ─── Conditions ────────────────────────────────────────────────── */

function Conditions({
  cat,
  history,
  onHistory,
  editable,
  act,
  problems,
  onConfirm,
}: PastHistoryProps & { onConfirm: (id: string) => void }) {
  const list = cat.data.past_history.conditions;
  const since = cat.data.option_sets[cat.data.past_history.since_options_ref] ?? [];
  const put = (fn: (c: History["past"]["conditions"]) => History["past"]["conditions"]) =>
    onHistory((h) => ({ ...h, past: { ...h.past, conditions: fn(h.past.conditions) } }));
  const yes = list.filter((c) => history.past.conditions[c.id]?.answer === "yes");
  const listed = new Set(problems.map((x) => x.toLowerCase()));
  return (
    <section
      aria-labelledby="clerking-pmh-conditions"
      className={cn("flex flex-col gap-2 max-sm:order-3", PANEL)}
    >
      <Heading aside="Any of these?">
        <span id="clerking-pmh-conditions">Conditions</span>
      </Heading>
      <div className="flex flex-col">
        {list.map((c) => (
          <YesNoRow
            key={c.id}
            label={c.label}
            value={history.past.conditions[c.id]?.answer}
            restricted={isRestricted(c.sensitivity)}
            disabled={!editable}
            onAnswer={(a) => put((m) => toggleEntry(m, c.id, a))}
          />
        ))}
      </div>
      {yes.map((c) => {
        const entry = history.past.conditions[c.id]!;
        const onList = !!entry.onProblemList || listed.has(c.label.toLowerCase());
        return (
          <div
            key={c.id}
            data-condition={c.id}
            className="bg-muted/40 border-border flex flex-col gap-2 rounded-md border p-3 max-sm:rounded-xl max-sm:border-0"
          >
            <span className="text-body-s text-foreground font-medium">{`${c.label}: known for`}</span>
            <div
              role="group"
              aria-label={`${c.label}: known for`}
              className="flex flex-wrap gap-1.5 max-sm:gap-2"
            >
              {since.map((o) => (
                <Chip
                  key={o.id}
                  selected={entry.since === o.id}
                  disabled={!editable}
                  onPress={() =>
                    put((m) => {
                      const cur = m[c.id];
                      if (!cur) return m;
                      const next = { ...cur };
                      if (cur.since === o.id) delete next.since;
                      else next.since = o.id;
                      return { ...m, [c.id]: next };
                    })
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </div>
            {onList ? (
              <span className="text-caption inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
                <CheckIcon aria-hidden className="size-3" />
                On the problem list
              </span>
            ) : act ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                aria-haspopup="dialog"
                onClick={() => onConfirm(c.id)}
              >
                Confirm on the problem list
              </Button>
            ) : null}
          </div>
        );
      })}
      <p className="text-caption text-muted-foreground">
        A yes adds the condition to the problem list for you to confirm. Locked items are restricted
        and never leave clinical views.
      </p>
    </section>
  );
}

/* ─── Operations and transfusions (note only) ────────────────────── */

type Op = { text: string; code?: string; year?: number; where?: string };
type Tf = { when?: string; reaction?: string };

function OperationsAndTransfusions({ cat, history, onHistory, editable, sex }: PastHistoryProps) {
  const [picking, setPicking] = useState(false);
  const groups = operationGroups(sex ?? null);
  const t = cat.data.past_history.transfusions;
  const when = t.fields.find((f) => f.id === "when")?.options ?? [];
  const reaction = t.fields.find((f) => f.id === "reaction")?.options ?? [];
  const note = typeof t.note === "string" ? t.note : null;
  const ops = history.past.operations;
  const tfs = history.past.transfusions;
  const none = ops === "none" && tfs === "none";
  const past = (patch: Partial<History["past"]>) =>
    onHistory((h) => ({ ...h, past: { ...h.past, ...patch } }));
  const opList = Array.isArray(ops) ? ops : [];
  const tfList = Array.isArray(tfs) ? tfs : [];
  const setOp = (i: number, patch: Partial<Op>) =>
    onHistory((h) => {
      const list = Array.isArray(h.past.operations) ? [...h.past.operations] : [];
      const next: Op = { ...list[i]!, ...patch };
      // Typed words keep the pick's id only while they still read as its label.
      if ("text" in patch) {
        const hit = groups
          .flatMap((g) => g.items)
          .find((o) => o.label.toLowerCase() === next.text.trim().toLowerCase());
        if (hit) next.code = hit.id;
        else delete next.code;
      }
      list[i] = next;
      return { ...h, past: { ...h.past, operations: list } };
    });
  const picked = new Set(opList.flatMap((o) => (o.code ? [o.code] : [])));
  const pick = (id: string) => {
    const op = operationById(id);
    if (!op) return;
    past({
      operations: picked.has(id)
        ? opList.filter((o) => o.code !== id).length
          ? opList.filter((o) => o.code !== id)
          : undefined
        : [...opList.filter((o) => o.text.trim()), { text: op.label, code: op.id }],
    });
  };
  const setTf = (i: number, key: keyof Tf, id: string) =>
    onHistory((h) => {
      const list = Array.isArray(h.past.transfusions) ? [...h.past.transfusions] : [];
      const cur = { ...list[i]! };
      if (cur[key] === id) delete cur[key];
      else cur[key] = id;
      list[i] = cur;
      return { ...h, past: { ...h.past, transfusions: list } };
    });
  return (
    <section
      aria-labelledby="clerking-pmh-ops"
      className={cn("flex flex-col gap-2 max-sm:order-4", PANEL)}
    >
      <Heading>
        <span id="clerking-pmh-ops">Operations and transfusions</span>
      </Heading>
      <div className="flex flex-wrap gap-1.5 max-sm:gap-2">
        <Chip
          selected={none}
          disabled={!editable}
          onPress={() =>
            past(
              none
                ? { operations: undefined, transfusions: undefined }
                : { operations: "none", transfusions: "none" },
            )
          }
        >
          None
        </Chip>
        <Chip
          dashed
          selected={false}
          disabled={!editable}
          onPress={() => past({ operations: [...opList, { text: "" }] })}
        >
          <PlusIcon aria-hidden className="size-3.5" />
          Operation
        </Chip>
        <Chip dashed selected={false} disabled={!editable} onPress={() => setPicking(true)}>
          <LayoutGridIcon aria-hidden className="size-3.5" />
          Choose operations
        </Chip>
        <Chip
          dashed
          selected={false}
          disabled={!editable}
          onPress={() => past({ transfusions: [...tfList, {}] })}
        >
          <PlusIcon aria-hidden className="size-3.5" />
          Transfusion
        </Chip>
      </div>
      {opList.map((o, i) => (
        <div
          key={`op-${i}`}
          role="group"
          aria-label={`Operation ${i + 1}`}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            aria-label="Operation"
            placeholder="Type or choose an operation"
            list="clerking-ops-list"
            autoComplete="off"
            className={`${INPUT} flex-1`}
            value={o.text}
            disabled={!editable}
            onChange={(e) => setOp(i, { text: e.target.value })}
          />
          <input
            aria-label="Year"
            placeholder="Year"
            inputMode="numeric"
            className={`${INPUT} w-20 font-mono tabular-nums`}
            value={o.year ?? ""}
            disabled={!editable}
            onChange={(e) => {
              const y = Number.parseInt(e.target.value, 10);
              setOp(i, { year: y >= 1900 && y <= 2100 ? y : undefined });
            }}
          />
          <input
            aria-label="Where"
            placeholder="Where"
            className={`${INPUT} w-32`}
            value={o.where ?? ""}
            disabled={!editable}
            onChange={(e) => setOp(i, { where: e.target.value || undefined })}
          />
          {editable ? (
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={`Remove operation ${i + 1}`}
              onClick={() => {
                const next = opList.filter((_, j) => j !== i);
                past({ operations: next.length ? next : undefined });
              }}
            >
              <XIcon aria-hidden />
            </Button>
          ) : null}
        </div>
      ))}
      {tfList.map((tf, i) => (
        <div
          key={`tf-${i}`}
          className="border-border max-sm:bg-muted/40 flex flex-col gap-2 rounded-md border p-2.5 max-sm:rounded-xl max-sm:border-0"
          data-transfusion={i}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-s text-foreground font-medium">{`Transfusion ${i + 1}`}</span>
            {editable ? (
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`Remove transfusion ${i + 1}`}
                onClick={() => {
                  const next = tfList.filter((_, j) => j !== i);
                  past({ transfusions: next.length ? next : undefined });
                }}
              >
                <XIcon aria-hidden />
              </Button>
            ) : null}
          </div>
          <FieldRow label="When">
            {when.map((o) => (
              <Chip
                key={o.id}
                selected={tf.when === o.id}
                disabled={!editable}
                onPress={() => setTf(i, "when", o.id)}
              >
                {o.label}
              </Chip>
            ))}
          </FieldRow>
          <FieldRow label="Reaction">
            {reaction.map((o) => (
              <Chip
                key={o.id}
                selected={tf.reaction === o.id}
                disabled={!editable}
                onPress={() => setTf(i, "reaction", o.id)}
              >
                {o.label}
              </Chip>
            ))}
          </FieldRow>
        </div>
      ))}
      {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
      <datalist id="clerking-ops-list">
        {groups
          .flatMap((g) => g.items)
          .map((o) => (
            <option key={o.id} value={o.label} />
          ))}
      </datalist>
      <PickAllDialog
        open={picking}
        onOpenChange={setPicking}
        kicker="Past surgical history"
        title="Operations"
        description="By specialty. Tap to add or remove; the list stays open. Anything else, type it as they name it."
        empty="Nothing matches. Close this and type it as they name it."
        groups={groups.map((g) => ({
          id: g.id,
          label: g.label,
          items: g.items.map((o) => ({ ...o, restricted: isRestricted(o.sensitivity) })),
        }))}
        added={picked}
        onPick={pick}
      />
    </section>
  );
}

/* ─── Medicines (immediate, through the medication record) ───────── */

function Medicines({
  cat,
  header,
  history,
  onHistory,
  editable,
  record,
  act,
  busy,
  on,
}: PastHistoryProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const l = cat.data.medicines;
  const shown = usePending(record.medicines);
  const meds = record.medicines.filter((m) => !shown.gone.has(m.statementId));
  const pending = !!busy?.startsWith("med");
  const can = act && !pending;
  // Who is telling us, as a medicine source when the words match (patient, carer, letter).
  const informant = l.source.some((o) => o.id === header.historian) ? header.historian : undefined;
  const names = new Set(meds.map((m) => m.name.toLowerCase()));
  const adding = shown.adding(names);
  const taken = new Set([...names, ...adding.map((a) => a.name.toLowerCase())]);
  const picks = l.quick_picks.filter((q) => !taken.has(q.label.toLowerCase()));
  const add = (drugText: string, restricted: boolean) =>
    shown.add(
      drugText,
      on.onRecordMedicine?.({ drugText, restricted, ...(informant ? { informant } : {}) }),
    );
  // X: a medicine added here was a slip (void it); one from before, they no longer take it.
  const removeMed = (m: (typeof meds)[number]) =>
    shown.remove(
      m.statementId,
      m.addedHere
        ? on.onRemoveAddedHere?.("medication", m.statementId)
        : on.onMedicine?.(m.statementId, "stopped", "not_taking"),
    );
  const chips = (
    m: (typeof meds)[number],
    field: "frequencyCode" | "adherence" | "informant",
    opts: readonly Option[],
  ) =>
    opts.map((o) => (
      <Chip
        key={o.id}
        selected={m[field] === o.id}
        disabled={!can}
        onPress={() =>
          on.onMedicineDetails?.(m.statementId, { [field]: m[field] === o.id ? null : o.id })
        }
      >
        {o.label}
      </Chip>
    ));
  return (
    <section
      aria-labelledby="clerking-pmh-meds"
      className={cn("flex flex-col gap-2 max-sm:order-2", PANEL)}
    >
      <Heading aside={`${meds.length} ${meds.length === 1 ? "medicine" : "medicines"}`}>
        <span id="clerking-pmh-meds">Medicines</span>
      </Heading>
      {meds.length || adding.length ? (
        <ul className="flex flex-col gap-2 max-sm:gap-0">
          {meds.map((m) => {
            const isOpen = open === m.statementId;
            return (
              <li
                key={m.statementId}
                data-medicine={m.statementId}
                className="border-border bg-card rounded-lg border max-sm:rounded-none max-sm:border-0 max-sm:border-t"
              >
                <div className="flex items-center gap-2 py-2 pr-2 pl-3 max-sm:py-3 max-sm:pr-0 max-sm:pl-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`clerking-med-${m.statementId}`}
                    onClick={() => setOpen(isOpen ? null : m.statementId)}
                    className="focus-visible:shadow-focus flex min-w-0 flex-1 flex-col rounded-sm text-left outline-none"
                  >
                    <span className="text-body-s text-foreground max-sm:text-body-m inline-flex items-center gap-1.5 font-medium">
                      {m.name}
                      {m.restricted ? <Lock /> : null}
                    </span>
                    <span className="text-caption text-muted-foreground max-sm:text-body-s truncate max-sm:whitespace-normal">
                      {medicineSummary(cat, m)}
                    </span>
                  </button>
                  {act ? (
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Remove ${m.name}`}
                      title={m.addedHere ? "Remove" : "No longer taking it: remove"}
                      onClick={() => removeMed(m)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {isOpen ? (
                  <div
                    id={`clerking-med-${m.statementId}`}
                    className="border-border flex flex-col gap-2.5 border-t p-3"
                  >
                    <FieldRow label="Dose" group={false}>
                      <input
                        key={`${m.statementId}:${m.doseText ?? ""}`}
                        aria-label={`Dose of ${m.name}`}
                        placeholder="As on the packet, if known"
                        defaultValue={m.doseText ?? ""}
                        disabled={!can}
                        className={`${INPUT} w-full`}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (m.doseText ?? ""))
                            on.onMedicineDetails?.(m.statementId, { doseText: v || null });
                        }}
                      />
                    </FieldRow>
                    <FieldRow label="How often">{chips(m, "frequencyCode", l.frequency)}</FieldRow>
                    <FieldRow label="Taking it">{chips(m, "adherence", l.adherence)}</FieldRow>
                    <FieldRow label="Source">{chips(m, "informant", l.source)}</FieldRow>
                  </div>
                ) : null}
              </li>
            );
          })}
          {adding.map((a) => (
            <SavingCard key={a.key} name={a.name} />
          ))}
        </ul>
      ) : (
        <Chip
          selected={!!history.past.medicinesNone}
          disabled={!editable}
          onPress={() =>
            onHistory((h) => {
              const past = { ...h.past };
              if (past.medicinesNone) delete past.medicinesNone;
              else past.medicinesNone = true;
              return { ...h, past };
            })
          }
        >
          Takes none, including herbal
        </Chip>
      )}
      {act ? (
        <>
          <div
            role="group"
            aria-label="Common medicines"
            className="flex flex-wrap gap-1.5 max-sm:gap-2"
          >
            {picks.map((q) => (
              <Chip
                key={q.id}
                dashed
                selected={false}
                onPress={() => add(q.label, isRestricted(q.sensitivity))}
              >
                <PlusIcon aria-hidden className="size-3.5" />
                {q.label}
                {isRestricted(q.sensitivity) ? <Lock /> : null}
              </Chip>
            ))}
          </div>
          <input
            aria-label="Add a medicine as they name it"
            placeholder="Another medicine, as they name it"
            value={typed}
            className={`${INPUT} w-full`}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !typed.trim()) return;
              e.preventDefault();
              add(typed.trim(), false);
              setTyped("");
            }}
          />
        </>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Record what the patient takes, as they name it. Confirmed at every visit.
      </p>
    </section>
  );
}

/* ─── Allergies (immediate, through the allergy record) ──────────── */

function Allergies({
  cat,
  header,
  history,
  onHistory,
  editable,
  record,
  act,
  busy,
  on,
}: PastHistoryProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [refuting, setRefuting] = useState<string | null>(null);
  const l = cat.data.allergies;
  const shown = usePending(record.allergies);
  const a = {
    ...record.allergies,
    items: record.allergies.items.filter((x) => !shown.gone.has(x.id)),
  };
  const confirmed = a.touchedThisVisit || !!history.past.allergiesConfirmed;
  const status = allergyStatus(a, confirmed);
  const pending = !!busy?.startsWith("allergy");
  const can = act && !pending;
  // "Not known" records no reaction (GATE A H2): the empty list says it, so it has no chip.
  const reactions = l.reactions.filter((r) => REACTION_TO_MANIFESTATION[r.id] !== null);
  const names = new Set(a.items.map((x) => x.name.toLowerCase()));
  const adding = shown.adding(names);
  const taken = new Set([...names, ...adding.map((x) => x.name.toLowerCase())]);
  const picks = l.quick_picks.filter((q) => !taken.has(q.label.toLowerCase()));
  const nkda = a.status === "no_known_drug_allergies" && a.touchedThisVisit;
  const informant = l.source.some((o) => o.id === header.historian) ? header.historian : undefined;
  return (
    <section
      aria-labelledby="clerking-pmh-allergies"
      className={cn("flex flex-col gap-2 max-sm:order-1", PANEL)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          id="clerking-pmh-allergies"
          className={cn("text-body-s text-foreground font-medium", PANEL_HEAD)}
        >
          Allergies
        </h3>
        <span aria-live="polite">
          {status.caution ? (
            <StatusWord tone="caution">{status.text}</StatusWord>
          ) : (
            <span className="text-caption text-teal-700 dark:text-teal-300">{status.text}</span>
          )}
        </span>
      </div>
      {a.items.length || adding.length ? (
        <ul className="flex flex-col gap-2 max-sm:gap-0">
          {a.items.map((x) => {
            const isOpen = open === x.id;
            const toggleReaction = (id: string) => {
              const next = x.reactions.includes(id)
                ? x.reactions.filter((r) => r !== id)
                : [...x.reactions, id];
              on.onAllergy?.({
                supersedesId: x.id,
                manifestations: next.flatMap((r) => REACTION_TO_MANIFESTATION[r] ?? []),
              });
            };
            return (
              <li
                key={x.id}
                data-allergy={x.id}
                className="border-border bg-card rounded-lg border max-sm:rounded-none max-sm:border-0 max-sm:border-t"
              >
                <div className="flex items-center gap-2 py-2 pr-2 pl-3 max-sm:py-3 max-sm:pr-0 max-sm:pl-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`clerking-allergy-${x.id}`}
                    onClick={() => setOpen(isOpen ? null : x.id)}
                    className="focus-visible:shadow-focus flex min-w-0 flex-1 flex-col rounded-sm text-left outline-none"
                  >
                    <span className="text-body-s text-foreground max-sm:text-body-m inline-flex flex-wrap items-center gap-1.5 font-medium">
                      {x.name}
                      {x.restricted ? <Lock /> : null}
                      {x.coded ? null : <StatusWord tone="caution">Uncoded</StatusWord>}
                      {highRisk(cat, x) ? <StatusWord tone="caution">High risk</StatusWord> : null}
                    </span>
                    <span className="text-caption text-muted-foreground max-sm:text-body-s truncate max-sm:whitespace-normal">
                      {allergySummary(cat, x)}
                    </span>
                  </button>
                  {act && !x.coded ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0 whitespace-nowrap"
                      aria-haspopup="dialog"
                      disabled={pending}
                      onClick={() => on.onCodeAllergy?.(x.id, x.name)}
                    >
                      Code it
                    </Button>
                  ) : null}
                  {act ? (
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={x.addedHere ? `Remove ${x.name}` : `Not an allergy: ${x.name}`}
                      title={x.addedHere ? "Remove" : "Not an allergy: remove with a reason"}
                      onClick={() =>
                        x.addedHere
                          ? shown.remove(x.id, on.onRemoveAddedHere?.("allergy", x.id))
                          : setRefuting(refuting === x.id ? null : x.id)
                      }
                    >
                      <XIcon aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {refuting === x.id ? (
                  <div className="border-border border-t px-3 py-2">
                    <ReasonChoice
                      name={`clerking-refute-${x.id}`}
                      label={`Why is ${x.name} not an allergy`}
                      reasons={REFUTE_ALLERGY_REASONS}
                      onChoose={(code) => {
                        setRefuting(null);
                        shown.remove(
                          x.id,
                          on.onAllergy?.({
                            supersedesId: x.id,
                            verification: "refuted",
                            reasonCode: code,
                          }),
                        );
                      }}
                      onCancel={() => setRefuting(null)}
                    />
                  </div>
                ) : null}
                {isOpen ? (
                  <div
                    id={`clerking-allergy-${x.id}`}
                    className="border-border flex flex-col gap-2.5 border-t p-3"
                  >
                    <FieldRow label="Reaction">
                      {reactions.map((o) => (
                        <Chip
                          key={o.id}
                          selected={x.reactions.includes(o.id)}
                          disabled={!can}
                          onPress={() => toggleReaction(o.id)}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    </FieldRow>
                    <FieldRow label="Severity">
                      {l.severity.map((o) => (
                        <Chip
                          key={o.id}
                          selected={x.severity === o.id}
                          disabled={!can}
                          onPress={() =>
                            x.severity !== o.id &&
                            on.onAllergy?.({ supersedesId: x.id, severity: o.id })
                          }
                        >
                          {o.label}
                        </Chip>
                      ))}
                    </FieldRow>
                    <FieldRow label="Source">
                      {l.source.map((o) => (
                        <Chip
                          key={o.id}
                          selected={x.source === o.id}
                          disabled={!can}
                          onPress={() =>
                            x.source !== o.id &&
                            on.onAllergy?.({ supersedesId: x.id, informant: o.id })
                          }
                        >
                          {o.label}
                        </Chip>
                      ))}
                    </FieldRow>
                  </div>
                ) : null}
              </li>
            );
          })}
          {adding.map((x) => (
            <SavingCard key={x.key} name={x.name} />
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5 max-sm:gap-2">
        {a.items.length ? (
          <Chip
            selected={!!history.past.allergiesConfirmed}
            disabled={!editable}
            onPress={() =>
              onHistory((h) => {
                const past = { ...h.past };
                if (past.allergiesConfirmed) delete past.allergiesConfirmed;
                else past.allergiesConfirmed = true;
                return { ...h, past };
              })
            }
          >
            Still true today
          </Chip>
        ) : act ? (
          <Chip
            selected={nkda}
            disabled={pending || nkda}
            onPress={() => on.onAssertAllergy?.("no_known_drug_allergies")}
          >
            No known drug allergies
          </Chip>
        ) : null}
      </div>
      {act ? (
        <div
          role="group"
          aria-label="Common allergies"
          className="flex flex-wrap gap-1.5 max-sm:gap-2"
        >
          {picks.map((q) => (
            <Chip
              key={q.id}
              dashed
              selected={false}
              onPress={() =>
                shown.add(
                  q.label,
                  on.onAllergy?.({ substanceText: q.label, ...(informant ? { informant } : {}) }),
                )
              }
            >
              <PlusIcon aria-hidden className="size-3.5" />
              {q.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </section>
  );
}
