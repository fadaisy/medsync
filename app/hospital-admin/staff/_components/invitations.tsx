"use client";

import type { InvitationRow } from "../_lib/data";
import type { InviteStaffState, IssuedInvitation, StaffActionState } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DeskDialog, Field, Icon, k } from "@/components/clinics-schedule/shared";
import { PEOPLE } from "@/content/hospital-admin/people";
import { fill } from "@/content/lab-workspace-v2";
import { dayText } from "../_lib/people";
import { inviteStaffAction, revokeStaffInvitationAction } from "../actions";
import v from "./people-view.module.css";

const I = PEOPLE.invites;

/** Workflow tags: square and neutral, the word carries the state (ADR 0162). */
const TAG: Record<InvitationRow["status"], string | false> = {
  pending: "ready",
  accepted: "live",
  revoked: false,
  expired: false,
};

function line(r: InvitationRow): string {
  const sent = fill(I.sent, { date: dayText(r.invitedAtIso) });
  if (r.status === "accepted" && r.acceptedAtIso)
    return `${sent} · ${fill(I.accepted, { date: dayText(r.acceptedAtIso) })}`;
  if (r.status === "revoked" && r.revokedAtIso)
    return `${sent} · ${fill(I.revokedOn, { date: dayText(r.revokedAtIso) })}`;
  if (r.status === "expired")
    return `${sent} · ${fill(I.expiredOn, { date: dayText(r.expiresAtIso) })}`;
  return `${sent} · ${fill(I.until, { date: dayText(r.expiresAtIso) })}`;
}

/**
 * People › Invitations: every invitation for this hospital, newest first, and the links just issued. A link is
 * shown once: the database keeps only its hash, so a sent invitation can be revoked but its link cannot be shown
 * again.
 */
export function InvitationsList({
  rows,
  issued,
  say,
}: {
  rows: readonly InvitationRow[];
  issued: readonly IssuedInvitation[];
  say: (text: string) => void;
}) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<InvitationRow | null>(null);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const short = why.trim().length < 8;

  const close = () => {
    setRevoking(null);
    setWhy("");
    setError(null);
  };
  const revoke = () => {
    if (!revoking || short || busy) return;
    const fd = new FormData();
    fd.set("invitation_id", revoking.id);
    fd.set("reason", why.trim());
    start(async () => {
      let r: StaffActionState;
      try {
        r = await revokeStaffInvitationAction({}, fd);
      } catch {
        setError(PEOPLE.failed);
        return;
      }
      if (!r.ok) {
        setError(r.error ?? PEOPLE.failed);
        return;
      }
      close();
      say(I.revokedSay);
      router.refresh();
    });
  };

  return (
    <>
      {issued.length ? (
        <div className={k("su-card")}>
          <div className={k("su-ch")}>
            <b>{I.newTitle}</b>
            <small>{I.newSub}</small>
          </div>
          {issued.map((x) => (
            <IssuedRow key={x.id} x={x} />
          ))}
        </div>
      ) : null}

      <div className={k("su-card")} data-tour="wt-invites">
        <div className={k("su-ch")}>
          <b>{I.cardTitle}</b>
          <small>{I.cardSub}</small>
        </div>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className={`${k("su-td")} ${v.row}`}>
              <span className={k("su-tdi")} aria-hidden="true">
                <Icon n="chat" size={16} />
              </span>
              <span className={k("su-tdt")}>
                <b>{r.name ? `${r.name} · ${r.email}` : r.email}</b>
                <small>
                  {line(r)}
                  {r.source === "bulk" ? ` · ${I.bulk}` : ""}
                </small>
              </span>
              <span className={v.acts}>
                <span className={k("su-st", TAG[r.status])}>{I.status[r.status]}</span>
                {r.status === "pending" ? (
                  <button
                    type="button"
                    className={k("btn", "sm", "q")}
                    onClick={() => {
                      setRevoking(r);
                      setWhy("");
                      setError(null);
                    }}
                  >
                    {I.revoke}
                  </button>
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <p className={k("su-none")}>{I.empty}</p>
        )}
      </div>

      <DeskDialog
        open={!!revoking}
        onClose={close}
        label={I.revokeDialog.title}
        size="slm"
        tile="chat"
        title={I.revokeDialog.title}
        lead={revoking ? fill(I.revokeDialog.lead, { email: revoking.email }) : ""}
      >
        <div className={k("su-sec")}>
          <Field as="label" label={I.revokeDialog.why}>
            <input
              className={k("in")}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder={PEOPLE.reasonPh}
              maxLength={300}
              autoFocus
            />
          </Field>
          {error ? (
            <p className={k("su-note")} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={k("mf")}>
          <button type="button" className={k("btn", "k")} disabled={short || busy} onClick={revoke}>
            {busy ? I.revokeDialog.working : I.revokeDialog.go}
          </button>
          <button type="button" className={k("btn")} onClick={close}>
            {PEOPLE.cancel}
          </button>
        </div>
      </DeskDialog>
    </>
  );
}

function IssuedRow({ x }: { x: IssuedInvitation }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(x.claim_url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={`${k("su-td")} ${v.row}`}>
      <span className={k("su-tdi")} aria-hidden="true">
        <Icon n="chat" size={16} />
      </span>
      <span className={k("su-tdt")}>
        <b>{x.email}</b>
        <small className={v.link}>{x.claim_url}</small>
      </span>
      <span className={v.acts}>
        <button type="button" className={k("btn", "sm")} onClick={copy}>
          {copied ? I.copied : I.copy}
        </button>
      </span>
    </div>
  );
}

/**
 * Invite people: one email per line and a reason. The Server Action checks and de-duplicates the list (up to 100)
 * and the Edge Function writes one invitation and one audit row per person, returning each link once.
 */
export function InviteDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (issued: readonly IssuedInvitation[]) => void;
}) {
  const D = I.dialog;
  const [emails, setEmails] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const ready = emails.trim().length > 0 && why.trim().length >= 8;

  const close = () => {
    setError(null);
    onClose();
  };
  const send = () => {
    if (!ready || busy) return;
    const fd = new FormData();
    fd.set("emails_blob", emails);
    fd.set("reason", why.trim());
    start(async () => {
      let r: InviteStaffState;
      try {
        r = await inviteStaffAction({}, fd);
      } catch {
        setError(PEOPLE.failed);
        return;
      }
      if (!r.ok) {
        setError(r.error ?? PEOPLE.failed);
        return;
      }
      setEmails("");
      setWhy("");
      setError(null);
      onSent(r.invitations);
    });
  };

  return (
    <DeskDialog
      open={open}
      onClose={close}
      label={D.title}
      tile="chat"
      title={D.title}
      lead={D.lead}
    >
      <div className={k("su-sec")}>
        <Field as="label" label={D.emails} hint={D.emailsHint}>
          <textarea
            className={k("in", "su-ta")}
            rows={4}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={D.emailsPh}
            autoFocus
          />
        </Field>
        <Field as="label" label={D.why}>
          <input
            className={k("in")}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder={PEOPLE.reasonPh}
            maxLength={300}
          />
        </Field>
        <p className={k("su-note")}>{D.note}</p>
        {error ? (
          <p className={k("su-note")} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} disabled={!ready || busy} onClick={send}>
          {busy ? D.working : D.go}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {PEOPLE.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
