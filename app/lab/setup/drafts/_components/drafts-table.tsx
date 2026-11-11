"use client";

import type { DraftBand, DraftState, ResearchDrafts } from "@/lib/lab/drafts-read";
import Link from "next/link";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LAB2 } from "@/content/lab-phase-2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { recordDraftCheckAction, rejectBandAction } from "@/lib/lab/catalogue-v2-actions";
import { signRangeAsLeadAction } from "@/lib/lab/measures-actions";
import { DRAFTS } from "../_lib/copy";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { bandFromDays } from "../../ranges/_lib/ages";
import { SignButton } from "./sign-button";

const T = DRAFTS.table;
const B = DRAFTS.band;
type Reference = ResearchDrafts["references"][number];

export function DraftStateWord({ state }: { state: DraftState }) {
  return (
    <StatusWord tone={state === "ready" ? "neutral" : "caution"}>{DRAFTS.state[state]}</StatusWord>
  );
}

/** §5.13 table: reference drafts open their bands; cut-off drafts are edited in Ranges and cut-offs. */
export function DraftsTable({
  references,
  schemes,
}: Pick<ResearchDrafts, "references" | "schemes">) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = references.find((r) => r.versionId === openId);
  const cell = "px-3 py-2 align-top";
  return (
    <>
      <div className="border-border bg-card overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{T.caption}</caption>
          <thead>
            <tr className="bg-muted text-ink-600 text-caption">
              {T.columns.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-border h-[34px] border-b px-3 font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {references.length + schemes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-body-s text-muted-foreground px-3 py-4">
                  {T.empty}
                </td>
              </tr>
            ) : null}
            {references.map((r) => (
              <tr
                key={r.versionId}
                className="border-ink-150 text-body-s hover:bg-muted/50 border-b last:border-b-0"
              >
                <td className={cell}>
                  <button
                    type="button"
                    onClick={() => setOpenId(r.versionId)}
                    className="focus-visible:shadow-focus flex min-h-11 flex-col items-start rounded-sm text-left font-medium text-teal-700 underline-offset-4 outline-none hover:underline sm:min-h-0"
                  >
                    {r.result}
                    <span className="text-muted-foreground font-normal">{r.test}</span>
                  </button>
                </td>
                <td className={cell}>
                  <Pill>{T.reference}</Pill>
                </td>
                <td className={cell}>
                  {r.sources.map((s, i) => (
                    <span key={s.full} title={s.full}>
                      {i ? "; " : ""}
                      {s.short}
                    </span>
                  ))}
                </td>
                <td className={cell}>{r.confidence.join(" · ") || "—"}</td>
                <td className={cell}>
                  <DraftStateWord state={r.state} />
                </td>
              </tr>
            ))}
            {schemes.map((s) => (
              <tr key={s.id} className="border-ink-150 text-body-s border-b last:border-b-0">
                <td className={cell}>
                  <span className="font-medium">{s.result}</span>
                  <Link
                    href="/lab/setup/ranges"
                    className="flex min-h-11 items-center text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
                  >
                    {T.openRanges}
                    <span className="sr-only"> for {s.result}</span>
                  </Link>
                </td>
                <td className={cell}>
                  <Pill>{T.cutoffs}</Pill>
                </td>
                <td className={cell}>{s.label}</td>
                <td className={cell}>—</td>
                <td className={cell}>
                  <DraftStateWord state={s.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <DraftDialog
          key={open.versionId}
          draft={open}
          onOpenChange={(o) => !o && setOpenId(null)}
        />
      ) : null}
    </>
  );
}

const ageWords = (from: number | null, to: number | null) => {
  const w = (d: number) => {
    const a = bandFromDays(d);
    return `${a.n} ${a.unit}`;
  };
  if (from === null && to === null) return B.anyAge;
  if (to === null) return `From ${w(from!)}`;
  if (from === null) return `Under ${w(to)}`;
  return `${w(from)} to under ${w(to)}`;
};

/** §5.13 panel: every band with its provenance; a check to record, an alternative to reject. */
function DraftDialog({
  draft,
  onOpenChange,
}: {
  draft: Reference;
  onOpenChange: (open: boolean) => void;
}) {
  const live = draft.bands.filter((b) => b.rejectedReason === null);
  const openCheck = live.some((b) => b.verification && !b.checked);
  const overlap = live.some((b) => b.overlaps);
  const blocked = openCheck
    ? DRAFTS.send.blockedCheck
    : overlap
      ? DRAFTS.send.blockedOverlap
      : null;
  return (
    <EditorDialog open onOpenChange={onOpenChange} width="wide">
      <SheetHeader>
        <SheetTitle>{B.title(draft.result, draft.test)}</SheetTitle>
        <SheetDescription>
          {B.description} <span className="font-mono">{draft.unit}</span>
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-4 md:grid-cols-2">
        {draft.bands.map((b, i) => (
          <BandCard key={b.id} band={b} n={i + 1} unit={draft.unit} />
        ))}
      </SheetBody>
      <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <DraftStateWord state={draft.state} />
        <div className="flex flex-col items-end gap-2">
          {blocked ? (
            <p id="send-blocked" className="text-body-s text-muted-foreground">
              {blocked}
            </p>
          ) : null}
          {draft.state !== "cso" ? (
            <SignButton
              label={DRAFTS.send.button}
              okText={DRAFTS.send.sent}
              authoredByMe={draft.authoredByMe}
              noteLabel={DRAFTS.send.note}
              disabledReason={blocked || null}
              describedBy={blocked ? "send-blocked" : undefined}
              onSign={(exceptionNote) =>
                signRangeAsLeadAction({ versionId: draft.versionId, exceptionNote })
              }
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="min-h-11 sm:min-h-8"
          >
            {DRAFTS.close}
          </Button>
        </div>
      </SheetFooter>
    </EditorDialog>
  );
}

const dec = (s: string) => (s.trim() ? s.trim().replace(",", ".") : null);

function BandCard({ band: b, n, unit }: { band: DraftBand; n: number; unit: string }) {
  const { pending, message, act } = useAct();
  const [finding, setFinding] = useState<"matches" | "corrected">("matches");
  const [where, setWhere] = useState("");
  const [low, setLow] = useState(b.low ?? "");
  const [high, setHigh] = useState(b.high ?? "");
  const [reason, setReason] = useState("");
  const rejected = b.rejectedReason !== null;
  const needsCheck = !rejected && !!b.verification && !b.checked;
  const p = b.provenance;
  const id = `band-${b.id}`;
  const facts: [string, string | null | undefined][] = [
    [B.where, p.where],
    [B.population, p.population],
    [B.method, p.method],
    [B.confidence, p.confidence],
    [B.reason, p.reason],
  ];
  return (
    <section
      aria-labelledby={`${id}-h`}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${id}-h`} className={`text-body-s font-medium ${rejected ? "line-through" : ""}`}>
          <span className="sr-only">Band {n}: </span>
          {B.sex[b.sex] ?? b.sex} · {ageWords(b.ageFromDays, b.ageToDays)} ·{" "}
          <span className="tabular-nums">
            {b.low ?? "…"}–{b.high ?? "…"} {unit}
          </span>
        </h3>
        {rejected ? (
          <StatusWord>{B.rejected(b.rejectedReason!)}</StatusWord>
        ) : needsCheck ? (
          <StatusWord tone="caution">{DRAFTS.state.check}</StatusWord>
        ) : b.overlaps ? (
          <StatusWord tone="caution">{B.overlaps}</StatusWord>
        ) : b.checked ? (
          <StatusWord>{B.checked(b.checkNote ?? "")}</StatusWord>
        ) : (
          <StatusWord>{DRAFTS.state.ready}</StatusWord>
        )}
      </div>
      <div
        className={`flex flex-col gap-1 ${rejected ? "text-muted-foreground line-through" : ""}`}
      >
        <p className="text-body-s">{b.source}</p>
        <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </div>
      {needsCheck ? (
        <div className="border-status-caution-fg/40 bg-status-caution-bg flex flex-col gap-3 rounded-md border p-3">
          <StatusWord tone="caution" className="self-start">
            {DRAFTS.state.check}
          </StatusWord>
          <p className="text-body-s">{b.verification}</p>
          <p className="text-caption text-muted-foreground">
            {LAB2.drafts.check.replace("{table or page}", p.where ?? "the table")}
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-s mb-1 font-medium">{B.found}</legend>
            <div className="flex flex-wrap gap-4">
              {(["matches", "corrected"] as const).map((f) => (
                <label key={f} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
                  <input
                    type="radio"
                    name={`${id}-finding`}
                    value={f}
                    checked={finding === f}
                    onChange={() => setFinding(f)}
                    className="size-4"
                  />
                  {B[f]}
                </label>
              ))}
            </div>
            {finding === "corrected" ? (
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    [B.low, low, setLow],
                    [B.high, high, setHigh],
                  ] as const
                ).map(([label, v, set]) => (
                  <label key={label} className="text-body-s flex flex-col gap-1">
                    <span className="text-muted-foreground">
                      {label} ({unit})
                    </span>
                    <Input
                      value={v}
                      onChange={(e) => set(e.target.value)}
                      inputMode="decimal"
                      className="min-h-11 w-28 text-right tabular-nums sm:min-h-9"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">{B.checkedWhere}</span>
            <Input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              maxLength={300}
              className="min-h-11 sm:min-h-9"
            />
          </label>
          <div>
            <LabButton
              type="button"
              variant="secondary"
              onClick={() =>
                act(
                  () =>
                    recordDraftCheckAction({
                      bandId: b.id,
                      finding,
                      where,
                      low: finding === "corrected" ? dec(low) : null,
                      high: finding === "corrected" ? dec(high) : null,
                    }),
                  B.recorded,
                )
              }
              className="min-h-11 sm:min-h-8"
              busy={pending}
            >
              {B.record}
            </LabButton>
          </div>
        </div>
      ) : null}
      {!rejected ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-body-s flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-muted-foreground">{B.rejectReason}</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              className="min-h-11 sm:min-h-9"
            />
          </label>
          <LabButton
            type="button"
            variant="quiet"
            busy={pending}
            disabledReason={reason.trim().length < 3 ? LABWS2_SETUP.sweep.whyShortReason : null}
            onClick={() =>
              act(() => rejectBandAction({ bandId: b.id, reason: reason.trim() }), B.rejectedOk)
            }
            className="min-h-11 sm:min-h-8"
          >
            {B.reject}
          </LabButton>
        </div>
      ) : null}
      <Said message={message} />
    </section>
  );
}
