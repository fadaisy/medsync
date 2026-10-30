"use client";

import type { SchemePayload } from "@/lib/lab/signed-config";
import { useId, useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { saveConfigDraftAction } from "@/lib/lab/catalogue-v2-actions";
import { configSignErrors, CONTEXTS, METHODS } from "@/lib/lab/signed-config";
import {
  ageWords,
  CONTEXT_WORDS,
  METHOD_WORDS,
  SEX_WORDS,
  signErrorWords,
} from "../_lib/schemes-copy";
import { LabButton } from "@/components/tide/work/button";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { SchemeSign } from "./scheme-sign";

type Row = SchemePayload["rows"][number];
type Bound = Row["bounds"][number];

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";
const box = "size-4 accent-teal-600";
const num = (v: string) => (v.trim() === "" ? null : v.trim().replace(",", "."));

/**
 * The scheme editor (§5.12): a centred wide dialog over what the draft holds. Only what is here, or what
 * the person types, is saved — the editor adds no number. Saving keeps a draft; signing needs a draft with
 * no problems, saved as shown.
 */
export function SchemeEditor({
  conceptId,
  display,
  initial,
  draftId,
  authoredByMe,
}: {
  conceptId: string;
  display: string;
  /** The open draft, else the newest draft, else the scheme in force. */
  initial: SchemePayload;
  /** The open draft (not yet signed by the lead), if any. */
  draftId: string | null;
  authoredByMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<SchemePayload>(initial);
  const { pending, message, act } = useAct();
  const problemsId = useId();
  const errors = configSignErrors("scheme", s);
  const unparsable = errors.some((e) => e.startsWith("payload:"));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  const patchRow = (i: number, p: Partial<Row>) =>
    setS((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const patchBound = (i: number, k: number, p: Partial<Bound>) =>
    setS((x) => ({
      ...x,
      rows: x.rows.map((r, j) =>
        j === i ? { ...r, bounds: r.bounds.map((b, m) => (m === k ? { ...b, ...p } : b)) } : r,
      ),
    }));
  const patchCategory = (i: number, p: { label?: string; abnormal?: boolean }) =>
    setS((x) => ({
      ...x,
      categories: x.categories.map((c, j) => (j === i ? { ...c, ...p } : c)),
    }));

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<DialogTrigger render={<Button variant="secondary" />}>Edit draft</DialogTrigger>}
    >
      <SheetHeader>
        <SheetTitle>Decision cut-offs: {display}</SheetTitle>
        <SheetDescription>
          In <span className="font-mono">{s.unit}</span>. A draft is not used until the laboratory
          lead and the CSO have both signed it.
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        {errors.length ? (
          <div
            id={problemsId}
            className="bg-status-caution-bg dark:text-status-caution-fg ring-status-caution-fg/25 text-body-s flex flex-col gap-1 rounded-md p-3 text-amber-800 ring-1"
          >
            <p className="font-medium">This draft cannot be signed yet</p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {errors.map((e) => (
                <li key={e}>{signErrorWords(e)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section aria-labelledby={`${problemsId}-scheme`} className="flex flex-col gap-3">
            <h3 id={`${problemsId}-scheme`} className="text-heading-s">
              Scheme
            </h3>
            <label className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">Label</span>
              <Input
                value={s.label}
                onChange={(e) => setS((x) => ({ ...x, label: e.target.value }))}
                maxLength={120}
                className="min-h-11 sm:min-h-9"
              />
            </label>
            <label className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">Source</span>
              <Input
                value={s.source}
                onChange={(e) => setS((x) => ({ ...x, source: e.target.value }))}
                maxLength={500}
                className="min-h-11 sm:min-h-9"
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-s mb-1 font-medium">Categories</legend>
              {s.categories.map((c, i) => (
                <div key={c.code} className="flex flex-wrap items-center gap-2">
                  <span className="text-caption text-muted-foreground w-24 truncate font-mono">
                    {c.code}
                  </span>
                  <Input
                    aria-label={`Category ${c.code} label`}
                    value={c.label}
                    onChange={(e) => patchCategory(i, { label: e.target.value })}
                    maxLength={80}
                    className="min-h-11 w-40 sm:min-h-9"
                  />
                  <label className="text-body-s flex min-h-11 items-center gap-1.5 sm:min-h-0">
                    <input
                      type="checkbox"
                      checked={c.abnormal}
                      onChange={(e) => patchCategory(i, { abnormal: e.target.checked })}
                      className={box}
                    />
                    Abnormal
                  </label>
                </div>
              ))}
            </fieldset>
            {s.elevation ? (
              <p className="text-caption text-muted-foreground">
                The elevation adjustment ({s.elevation.table.length} rows, in {s.elevation.unit}) is
                kept as drafted; it is read only here.
              </p>
            ) : null}
          </section>
          <section aria-labelledby={`${problemsId}-rows`} className="flex flex-col gap-3">
            <h3 id={`${problemsId}-rows`} className="text-heading-s">
              Rows
            </h3>
            {s.rows.map((r, i) => (
              <fieldset key={i} className="border-border flex flex-col gap-2 rounded-md border p-3">
                <legend className="text-body-s px-1 font-medium">
                  Row {i + 1}: {SEX_WORDS[r.sex]}, {ageWords(r.ageFromDays, r.ageToDays)}
                </legend>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="text-body-s flex items-center gap-2">
                    <span className="text-muted-foreground">Context</span>
                    <select
                      value={r.context}
                      onChange={(e) => patchRow(i, { context: e.target.value as Row["context"] })}
                      className={selectClass}
                    >
                      {CONTEXTS.map((c) => (
                        <option key={c} value={c}>
                          {CONTEXT_WORDS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-body-s text-muted-foreground">Results from</span>
                  {METHODS.map((m) => (
                    <label
                      key={m}
                      className="text-body-s flex min-h-11 items-center gap-1.5 sm:min-h-0"
                    >
                      <input
                        type="checkbox"
                        checked={r.methods.includes(m)}
                        onChange={(e) =>
                          patchRow(i, {
                            methods: e.target.checked
                              ? METHODS.filter((x) => x === m || r.methods.includes(x))
                              : r.methods.filter((x) => x !== m),
                          })
                        }
                        className={box}
                      />
                      {METHOD_WORDS[m]}
                    </label>
                  ))}
                </div>
                <div className="overflow-auto">
                  <table className="text-body-s w-full border-collapse text-left">
                    <thead>
                      <tr className="text-caption text-muted-foreground">
                        {["Category", "From", "Includes from", "To", "Includes to"].map((h) => (
                          <th key={h} scope="col" className="px-1 py-1 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.bounds.map((b, k) => {
                        const at = `Row ${i + 1} boundary ${k + 1}`;
                        return (
                          <tr key={k}>
                            <td className="px-1 py-1">
                              <select
                                aria-label={`${at} category`}
                                value={b.category}
                                onChange={(e) => patchBound(i, k, { category: e.target.value })}
                                className={selectClass}
                              >
                                {s.categories.some((c) => c.code === b.category) ? null : (
                                  <option value={b.category}>
                                    {LABWS2_SETUP.sweep.unknownCategory}
                                  </option>
                                )}
                                {s.categories.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {(["from", "to"] as const).map((side) => (
                              <BoundCells
                                key={side}
                                label={`${at} ${side}`}
                                value={b[side]}
                                inclusive={b[`${side}Inclusive`]}
                                onValue={(v) => patchBound(i, k, { [side]: num(v) })}
                                onInclusive={(v) => patchBound(i, k, { [`${side}Inclusive`]: v })}
                              />
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-muted-foreground">
                  An empty From means no lower end; an empty To, no upper end.
                </p>
              </fieldset>
            ))}
          </section>
        </div>
        <Said message={message} />
      </SheetBody>
      <SheetFooter className="sm:items-start">
        {draftId ? (
          <SchemeSign
            configId={draftId}
            authoredByMe={authoredByMe}
            blockedReason={
              errors.length
                ? "Fix the problems listed at the top first."
                : dirty
                  ? "Save the draft first: you sign what is saved."
                  : null
            }
          />
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
        <LabButton
          type="button"
          aria-describedby={unparsable ? problemsId : undefined}
          onClick={() =>
            act(
              () => saveConfigDraftAction({ kind: "scheme", key: conceptId, payload: s }),
              "Draft saved. It is not used until the laboratory lead and the CSO have both signed it.",
            )
          }
          variant="primary"
          busy={pending}
          disabledReason={unparsable ? LABWS2.reasons.unparsable : null}
        >
          Save draft
        </LabButton>
      </SheetFooter>
    </EditorDialog>
  );
}

function BoundCells({
  label,
  value,
  inclusive,
  onValue,
  onInclusive,
}: {
  label: string;
  value: string | null;
  inclusive: boolean;
  onValue: (v: string) => void;
  onInclusive: (v: boolean) => void;
}) {
  return (
    <>
      <td className="px-1 py-1">
        <Input
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onValue(e.target.value)}
          inputMode="decimal"
          className="min-h-11 w-24 text-right tabular-nums sm:min-h-9"
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="checkbox"
          aria-label={`${label} included`}
          checked={inclusive}
          onChange={(e) => onInclusive(e.target.checked)}
          className={box}
        />
      </td>
    </>
  );
}
