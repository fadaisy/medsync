"use client";

import type { PendingAffiliationRow } from "../_lib/data";
import type { StaffActionState } from "../actions";
import { useState, useTransition } from "react";

import { Chip, ChipRow, Field, ini, k } from "@/components/clinics-schedule/shared";
import { PEOPLE } from "@/content/hospital-admin/people";
import { fill } from "@/content/lab-workspace-v2";
import { APPROVAL } from "@/content/onboarding-staff";
import { askedText, employmentText, staleTag } from "../_lib/people";
import { getEvidenceSignedUrlAction } from "../../../admin/actions";
import {
  approveStaffAffiliationAction,
  rejectStaffAffiliationAction,
  requestStaffInfoAction,
} from "../actions";
import v from "./people-view.module.css";

const R = PEOPLE.review;

/** People › To review: everyone whose affiliation is `pending_approval`, newest first (as the query orders it). */
export function ReviewList({
  rows,
  sel,
  onOpen,
}: {
  rows: readonly PendingAffiliationRow[];
  sel: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div className={k("su-card", "su-lr")}>
        <div className={k("su-ch")}>
          <b>{R.cardTitle}</b>
          <small>{R.cardSub}</small>
        </div>
        {rows.length ? (
          rows.map((r) => {
            const stale = staleTag(r.daysSinceSubmission);
            return (
              <div key={r.id} className={`${k("su-lri")} ${sel === r.id ? v.on : ""}`}>
                <span className={k("pav")} aria-hidden="true">
                  <b>{ini(r.fullName)}</b>
                </span>
                <span className={k("su-cn")}>
                  <b>
                    {r.fullName}
                    {r.reviewNote ? <span className={k("su-st", "setup")}>{R.infoTag}</span> : null}
                  </b>
                  <small>
                    {r.roleName}
                    {r.cadreGradeName ? ` · ${r.cadreGradeName}` : ""}
                  </small>
                </span>
                <span className={k("su-cn")}>
                  <b className={k("su-lrimp")}>{r.departmentName}</b>
                  <small>{askedText(r.daysSinceSubmission)}</small>
                </span>
                <span className={k("su-hola")}>
                  {stale ? <span className={k("su-st", "setup")}>{stale}</span> : null}
                  <button
                    type="button"
                    className={k("btn", "sm", sel === r.id && "k")}
                    aria-pressed={sel === r.id}
                    onClick={() => onOpen(r.id)}
                  >
                    {R.open}
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p className={k("su-none")}>{R.empty}</p>
        )}
      </div>
      <p className={k("su-note")}>{R.note}</p>
    </>
  );
}

type Step = "approve" | "info" | "reject";

/**
 * One person asking to join, beside the list. The evidence branches on the cadre as before: a clinician's council
 * registration and licence (no licence, no approval: DOC-1, which the Edge Function also enforces), or a
 * non-clinical person's NIN on file, appointment letter and authorising officer. Each decision needs a reason of
 * 8 characters or more, which the Edge Function audits.
 */
export function ReviewPanel({
  row,
  onClose,
  onDone,
}: {
  row: PendingAffiliationRow;
  onClose: () => void;
  /** `keep`: the person stays on the list (asked for more), so the panel stays open. */
  onDone: (text: string, keep: boolean) => void;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [text, setText] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const waitingLicence = row.isClinical && !row.licenceDocumentPath;
  const short = text.trim().length < 8;
  const stale = staleTag(row.daysSinceSubmission);

  const pick = (s: Step) => {
    setStep(s);
    setText("");
    setError(null);
  };

  const confirm = () => {
    if (!step || short || busy) return;
    const fd = new FormData();
    fd.set("affiliation_id", row.id);
    fd.set(step === "info" ? "note" : "reason", text.trim());
    if (step === "approve" && row.isClinical && validUntil)
      fd.set("licence_valid_until", validUntil);
    const action =
      step === "approve"
        ? approveStaffAffiliationAction
        : step === "reject"
          ? rejectStaffAffiliationAction
          : requestStaffInfoAction;
    start(async () => {
      let r: StaffActionState;
      try {
        r = await action({}, fd);
      } catch {
        setError(PEOPLE.failed);
        return;
      }
      if (!r.ok) {
        setError(r.error ?? PEOPLE.failed);
        return;
      }
      const done = R.done[step];
      setStep(null);
      setText("");
      onDone(done, step === "info");
    });
  };

  const facts: Array<[string, string]> = [
    [R.rows.role, row.roleName],
    [R.rows.cadre, row.cadreName],
    ...(row.cadreGradeName ? [[R.rows.grade, row.cadreGradeName] as [string, string]] : []),
    [R.rows.department, row.departmentName],
    ...(row.specialtyName ? [[R.rows.specialty, row.specialtyName] as [string, string]] : []),
    [R.rows.employment, employmentText(row.employmentType)],
    [R.rows.email, row.email],
    [R.rows.path, row.isClinical ? R.clinical : R.nonClinical],
    ...(row.isClinical
      ? ([
          [R.rows.council, row.councilName ?? R.none],
          [R.rows.registration, row.registrationNumber ?? R.none],
          ...(row.registrationExpiry ? [[R.rows.expires, row.registrationExpiry]] : []),
        ] as Array<[string, string]>)
      : ([
          [R.rows.nin, row.ninOnFile ? R.ninOnFile : R.ninMissing],
          ...(row.staffNumber ? [[R.rows.staffNumber, row.staffNumber]] : []),
          ...(row.authorisingOfficerName
            ? [
                [
                  R.rows.authorising,
                  row.authorisingOfficerRole
                    ? `${row.authorisingOfficerName} · ${row.authorisingOfficerRole}`
                    : row.authorisingOfficerName,
                ],
              ]
            : []),
        ] as Array<[string, string]>)),
  ];

  const doc = row.isClinical
    ? row.licenceDocumentPath
      ? ({ bucket: "clinician-licences", path: row.licenceDocumentPath, label: R.licence } as const)
      : null
    : row.appointmentLetterPath
      ? ({
          bucket: "staff-identity-documents",
          path: row.appointmentLetterPath,
          label: R.letter,
        } as const)
      : null;

  const S = step ? R.step[step] : null;

  return (
    <aside className={k("det", "su-det")} aria-label={row.fullName}>
      <div className={k("su-dh")}>
        <span className={k("pav")} aria-hidden="true">
          <b>{ini(row.fullName)}</b>
        </span>
        <div>
          <h2>{row.fullName}</h2>
          <p>
            {row.roleName} · {row.departmentName}
          </p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={onClose}>
          {PEOPLE.close}
        </button>
      </div>

      <p className={k("su-note")}>
        {askedText(row.daysSinceSubmission)}
        {stale ? (
          <>
            {" "}
            <span className={k("su-st", "setup")}>{stale}</span>
          </>
        ) : null}
      </p>

      {row.reviewNote ? (
        <p className={v.box}>
          {R.infoBox} {fill(R.yourNote, { note: row.reviewNote })}
        </p>
      ) : null}

      <div className={k("su-sec")}>
        <span className={k("cap")}>{R.onFile}</span>
        <div className={`${k("su-sum2")} ${v.sum}`}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
        {!row.isClinical ? <p className={k("su-note")}>{R.attest}</p> : null}
        {row.isClinical && row.councilCode === "UMDPC" ? (
          <div className={k("mf")}>
            <a
              className={k("btn", "sm", "q")}
              href={APPROVAL.umdpcRegisterUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {APPROVAL.checkUmdpc}
            </a>
          </div>
        ) : null}
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{R.document}</span>
        {doc ? (
          <DocButton bucket={doc.bucket} path={doc.path} label={doc.label} />
        ) : (
          <p className={v.box}>{row.isClinical ? APPROVAL.noLicence : R.noLetter}</p>
        )}
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{R.decision}</span>
        <ChipRow label={R.decision}>
          {(["approve", "info", "reject"] as const).map((s) =>
            s === "approve" && waitingLicence ? (
              <button
                key={s}
                type="button"
                className={k("chip")}
                disabled
                aria-describedby="people-approve-blocked"
              >
                {R.steps[s]}
              </button>
            ) : (
              <Chip key={s} on={step === s} onClick={() => pick(s)}>
                {R.steps[s]}
              </Chip>
            ),
          )}
        </ChipRow>
        {waitingLicence ? (
          <p id="people-approve-blocked" className={k("su-note")}>
            {APPROVAL.waitingLicence}
          </p>
        ) : null}

        {step && S ? (
          <>
            <Field as="label" label={S.label}>
              <textarea
                className={k("in", "su-ta")}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PEOPLE.reasonPh}
                maxLength={500}
                autoFocus
              />
            </Field>
            <p className={k("su-note")}>{S.hint}</p>
            {step === "approve" && row.isClinical ? (
              <Field as="label" label={APPROVAL.validUntil} hint={APPROVAL.validUntilHint}>
                <input
                  className={k("in")}
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            ) : null}
            {error ? (
              <p className={k("su-note")} role="alert">
                {error}
              </p>
            ) : null}
            <div className={k("mf")}>
              <button
                type="button"
                className={k("btn", "k")}
                disabled={short || busy}
                onClick={confirm}
              >
                {busy ? R.working : S.go}
              </button>
              <button
                type="button"
                className={k("btn")}
                onClick={() => setStep(null)}
                disabled={busy}
              >
                {PEOPLE.cancel}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}

/** Opens a stored document through a five-minute signed link (the same action the old sheet used). */
function DocButton({
  bucket,
  path,
  label,
}: {
  bucket: "clinician-licences" | "staff-identity-documents";
  path: string;
  label: string;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const openDoc = () => {
    const fd = new FormData();
    fd.set("bucket", bucket);
    fd.set("path", path);
    start(async () => {
      try {
        const r = await getEvidenceSignedUrlAction({ ok: false, error: "" }, fd);
        if (r.ok) {
          setError(null);
          window.open(r.url, "_blank", "noopener,noreferrer");
        } else setError(r.error);
      } catch {
        setError(PEOPLE.failed);
      }
    });
  };
  return (
    <>
      <div className={`${k("su-sum2")} ${v.sum}`}>
        <div>
          <span>{label}</span>
          <b>{path.split(".").pop()?.toUpperCase() ?? ""}</b>
        </div>
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "sm")} onClick={openDoc} disabled={busy}>
          {busy ? R.opening : R.openDoc}
        </button>
      </div>
      {error ? (
        <p className={k("su-note")} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
