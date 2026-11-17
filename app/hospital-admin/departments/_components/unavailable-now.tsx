"use client";

import type { DepartmentsData, SubjectKind } from "../_lib/model";
import type { OpenProblem } from "@/supabase/functions/_shared/services-hub";
import Link from "next/link";
import { useState } from "react";

import { Chip, ChipRow, DeskDialog, Field, k, Seg } from "@/components/clinics-schedule/shared";
import { DEPTS } from "@/content/hospital-admin/departments";
import { fill } from "@/content/lab-workspace-v2";
import {
  AVAILABILITY_REASONS,
  availabilityReasonLabel,
} from "@/supabase/functions/_shared/services-hub";
import { fmtDate, fmtDay, plural } from "../_lib/model";
import { useOp } from "../_lib/use-op";
import d from "./departments.module.css";

const U = DEPTS.unavailable;
const KINDS = Object.keys(U.kinds) as SubjectKind[];
/** A chosen date means 09:00 Kampala time that day, as the old Availability page sent it. */
const backIso = (ymd: string) => (ymd ? new Date(`${ymd}T09:00:00+03:00`).toISOString() : null);

/**
 * Unavailable now (was the Availability tab, §5.8): reported problems, temporarily closed wards and closures in one
 * list (AV-3). Past its expected-back date a problem says "Unconfirmed, check", never silently available (AV-2);
 * resolving keeps its history (AV-1). It informs; nothing clinical blocks on it (AV-4).
 */
export function UnavailableNow({ data, reporting }: { data: DepartmentsData; reporting: boolean }) {
  const [report, setReport] = useState(reporting);
  const [editing, setEditing] = useState<OpenProblem | null>(null);
  const [kind, setKind] = useState<"" | SubjectKind>("");
  const total = data.problems.length + data.closedWards.length + data.closures.length;
  const history = data.history.filter((h) => !kind || h.kind === kind);

  return (
    <>
      <div className={`${k("ahead")} ${d.head}`}>
        <p className={k("su-note")}>{U.note}</p>
        <span className={k("grow")} />
        <button
          type="button"
          className={k("btn", "sm")}
          onClick={() => setReport(true)}
          data-tour="wt-dp-prob"
        >
          {U.report}
        </button>
      </div>
      <div className={k("su-card")}>
        {data.problems.map((p) => (
          <div key={p.problemId} className={`${k("su-td")} ${d.tdWrap}`}>
            <span className={`${k("su-tdt")} ${d.wrapText}`}>
              <b>
                {fill(U.line, {
                  service: p.subjectLabel,
                  state: p.unconfirmed
                    ? U.unconfirmed
                    : p.state === "limited"
                      ? U.limited
                      : U.unavailable,
                })}
              </b>
              <small>
                {U.kinds[p.subjectKind as SubjectKind] ?? ""} ·{" "}
                {fill(U.sub, {
                  reason: p.note
                    ? `${availabilityReasonLabel(p.reason)}: ${p.note}`
                    : availabilityReasonLabel(p.reason),
                  since: fmtDate(p.since),
                  back: p.expectedBackAt ? fmtDate(p.expectedBackAt) : U.notKnown,
                })}
              </small>
            </span>
            <button
              type="button"
              className={k("btn", "sm", p.unconfirmed && "k")}
              onClick={() => setEditing(p)}
            >
              {p.unconfirmed ? U.confirm : U.update}
            </button>
          </div>
        ))}
        {data.closedWards.map((w) => (
          <div key={`w-${w.id}`} className={`${k("su-td")} ${d.tdWrap}`}>
            <span className={`${k("su-tdt")} ${d.wrapText}`}>
              <b>{fill(U.line, { service: w.name, state: U.closedWard })}</b>
              <small>
                {U.kinds.ward} ·{" "}
                {fill(U.sub, {
                  reason: w.reason ?? "",
                  since: fmtDate(w.since),
                  back: w.back ? fmtDay(w.back) : U.notKnown,
                })}
              </small>
            </span>
            <Link
              href={`/hospital-admin/departments/wards?open=${w.id}`}
              className={k("btn", "sm", "q")}
            >
              {U.openWard}
            </Link>
          </div>
        ))}
        {data.closures.map((c) => (
          <div key={`c-${c.id}`} className={`${k("su-td")} ${d.tdWrap}`}>
            <span className={`${k("su-tdt")} ${d.wrapText}`}>
              <b>
                {fill(U.line, {
                  service:
                    c.scope === "hospital" ? U.closureWhole : fill(U.closureOf, { scope: c.scope }),
                  state: U.closure,
                })}
              </b>
              <small>
                {fill(U.closureSub, {
                  reason: c.reason,
                  from: fmtDay(c.startsOn),
                  to: fmtDay(c.endsOn),
                })}
              </small>
            </span>
            <Link href="/hospital-admin/clinics?view=closures" className={k("btn", "sm", "q")}>
              {U.openClosures}
            </Link>
          </div>
        ))}
        {total === 0 ? <p className={k("su-none")}>{U.none}</p> : null}
      </div>

      <div className={k("su-card")}>
        <div className={k("su-ch")}>
          <b>{U.history}</b>
          <small>{data.history.length}</small>
        </div>
        <div className={`${k("su-sec")} ${d.pad}`}>
          <Seg
            opts={[["", U.everything], ...KINDS.map((x) => [x, U.kinds[x]] as const)]}
            value={kind}
            onPick={setKind}
            label={U.history}
            className={d.wrapSeg}
          />
          {history.length ? (
            <ul className={d.lines}>
              {history.map((h) => (
                <li key={h.problemId}>
                  {fill(U.historyLine, {
                    label: h.label,
                    state: h.state === "limited" ? U.limited : U.unavailable,
                    reason: availabilityReasonLabel(h.reason),
                    from: fmtDate(h.since),
                    to: fmtDate(h.resolvedAt),
                    days: plural(U.day, h.days),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <p className={k("su-note")}>{U.historyNone}</p>
          )}
        </div>
      </div>

      {report ? <ReportDialog data={data} onClose={() => setReport(false)} /> : null}
      {editing ? (
        <ProblemDialog key={editing.problemId} p={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className={k("su-note")} role="alert">
      {error}
    </p>
  ) : null;
}

/** Report a problem (the prototype's mProb): what, which, how bad, why, and when it is expected back. */
function ReportDialog({ data, onClose }: { data: DepartmentsData; onClose: () => void }) {
  const op = useOp();
  const R = DEPTS.report;
  const [kind, setKind] = useState<SubjectKind>("test");
  const [ref, setRef] = useState("");
  const [state, setState] = useState<"unavailable" | "limited">("unavailable");
  const [reason, setReason] = useState("");
  const [back, setBack] = useState("");
  const [note, setNote] = useState("");
  const options = data.subjects[kind];
  const ok = !!ref && !!reason && (reason !== "other" || note.trim().length > 0);
  return (
    <DeskDialog
      open
      onClose={onClose}
      label={R.title}
      tile="alert"
      title={R.title}
      lead={R.lead}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        <span className={k("cap")}>{R.kind}</span>
        <Seg
          opts={KINDS.map((x) => [x, U.kinds[x]] as const)}
          value={kind}
          onPick={(x) => {
            setKind(x);
            setRef("");
          }}
          label={R.kind}
          className={d.wrapSeg}
        />
        <Field as="label" label={R.which}>
          <select
            className={`${k("in")} ${d.select}`}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          >
            <option value="">{options.length ? R.pick : R.nothing}</option>
            {options.map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <span className={k("cap")}>{R.state}</span>
        <Seg
          opts={[
            ["unavailable", U.unavailable],
            ["limited", U.limited],
          ]}
          value={state}
          onPick={setState}
          label={R.state}
        />
        <span className={k("cap")}>{R.reason}</span>
        <ChipRow label={R.reason}>
          {AVAILABILITY_REASONS.map((r) => (
            <Chip key={r.code} on={reason === r.code} onClick={() => setReason(r.code)}>
              {r.label}
            </Chip>
          ))}
        </ChipRow>
        <Field as="label" label={R.back} hint={R.backHint}>
          <input
            type="date"
            className={`${k("in")} ${d.select}`}
            value={back}
            onChange={(e) => setBack(e.target.value)}
          />
        </Field>
        <Field as="label" label={R.note} hint={reason === "other" ? R.noteNeeded : R.noteHint}>
          <input
            className={`${k("in")} ${d.select}`}
            value={note}
            maxLength={280}
            placeholder={R.notePh}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy || !ok}
          onClick={() =>
            op.run(
              {
                op: "report_problem",
                subject_kind: kind,
                subject_ref: ref,
                state,
                reason_code: reason,
                note: note.trim() || undefined,
                expected_back_at: backIso(back),
              },
              onClose,
            )
          }
        >
          {R.btn}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {R.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}

/** One problem: confirm it is still down, mark it back, or update it. */
function ProblemDialog({ p, onClose }: { p: OpenProblem; onClose: () => void }) {
  const op = useOp();
  const P = DEPTS.problem;
  const [back, setBack] = useState(p.expectedBackAt ? p.expectedBackAt.slice(0, 10) : "");
  const [state, setState] = useState<"unavailable" | "limited">(p.state);
  const [note, setNote] = useState("");
  return (
    <DeskDialog
      open
      onClose={onClose}
      label={p.subjectLabel}
      tile="alert"
      title={p.subjectLabel}
      lead={fill(P.lead, {
        kind: U.kinds[p.subjectKind as SubjectKind] ?? "",
        state: (p.state === "limited" ? U.limited : U.unavailable).toLowerCase(),
        since: fmtDate(p.since),
      })}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        {p.unconfirmed ? <p className={k("su-note")}>{U.unconfirmedSub}</p> : null}
        <Field as="label" label={P.back}>
          <input
            type="date"
            className={`${k("in")} ${d.select}`}
            value={back}
            onChange={(e) => setBack(e.target.value)}
          />
        </Field>
        <div className={d.row}>
          <button
            type="button"
            className={k("btn", "sm", "k")}
            disabled={op.busy}
            onClick={() =>
              op.run(
                {
                  op: "confirm_still_down",
                  problem_id: p.problemId,
                  expected_back_at: backIso(back),
                },
                onClose,
              )
            }
          >
            {P.still}
          </button>
          <button
            type="button"
            className={k("btn", "sm")}
            disabled={op.busy}
            onClick={() =>
              op.run(
                {
                  op: "resolve_problem",
                  problem_id: p.problemId,
                  note: note.trim() || undefined,
                },
                onClose,
              )
            }
          >
            {P.resolve}
          </button>
        </div>
        <span className={k("cap")}>{P.updateCap}</span>
        <Seg
          opts={[
            ["unavailable", U.unavailable],
            ["limited", U.limited],
          ]}
          value={state}
          onPick={setState}
          label={P.state}
        />
        <Field as="label" label={P.note}>
          <input
            className={`${k("in")} ${d.select}`}
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy}
          onClick={() =>
            op.run(
              {
                op: "update_problem",
                problem_id: p.problemId,
                state,
                note: note.trim() || undefined,
                expected_back_at: backIso(back),
              },
              onClose,
            )
          }
        >
          {P.save}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {DEPTS.report.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
