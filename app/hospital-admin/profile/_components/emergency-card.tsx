"use client";

import type { EmergencySettings } from "@/lib/emergency/queries";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DeskDialog, Field, k } from "@/components/clinics-schedule/shared";
import { PROFILE } from "@/content/hospital-admin/profile-reports";
import { fill } from "@/content/lab-workspace-v2";
import { setEmergencySettingsAction } from "../actions";
import v from "./profile-view.module.css";

const E = PROFILE.emergency;
const L = PROFILE.location;

/**
 * The facility's emergency profile (PRD MS-PRD-SYM-001 §8.3 "Hospital", Phase 5; ADR 0098 ruling 5), in the desk.
 *
 * ADR 0158 (CAP-5): the values that decide where an emergency goes (receiving hours, pre-alerts and their board
 * owner, entrance directions, the SMS and ambulance numbers) change in Emergency and support, where a second admin
 * verifies them. Here they are shown read-only. The facility's coordinates stay editable, in a centred dialog that
 * posts the same fields to the same action (`setEmergencySettingsAction`, audited, scope resolved server-side).
 */
export function EmergencyCard({ settings }: { settings: EmergencySettings | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [busy, start] = useTransition();

  if (!settings)
    return (
      <div className={k("su-card")}>
        <div className={k("su-ch")}>
          <b>{E.title}</b>
        </div>
        <p className={k("su-none")}>{E.unreadable}</p>
      </div>
    );

  const rows: [string, string | null][] = [
    [E.receiving, E.capability[settings.emergencyCapability] ?? settings.emergencyCapability],
    [
      E.preAlerts,
      settings.preAlertEnabled
        ? fill(E.preAlertYes, { owner: settings.boardOwnerNote ?? E.noOwner })
        : E.preAlertNo,
    ],
    [E.entrance, settings.emergencyEntranceDirections],
    [E.sms, settings.emergencySmsNumber],
    [E.ambulance, settings.ambulanceNumber],
  ];
  const close = () => {
    setOpen(false);
    setError(null);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const r = await setEmergencySettingsAction({}, form);
      if (r.error) {
        setError(r.error);
        return;
      }
      close();
      setSaid(L.done);
      router.refresh();
    });
  };

  return (
    <div className={k("su-card")}>
      <div className={k("su-ch")}>
        <b>{E.title}</b>
        <small>{E.sub}</small>
      </div>
      <div className={`${k("su-sec")} ${v.pad}`}>
        <div className={`${k("su-sum2")} ${v.sum}`}>
          {rows.map(([term, value]) => (
            <div key={term}>
              <span>{term}</span>
              <b>{value || PROFILE.notSet}</b>
            </div>
          ))}
        </div>
        <p className={k("su-note")}>{E.verify}</p>
        <Link
          className={`${k("btn", "sm", "q")} ${v.start}`}
          href="/hospital-admin/departments/emergency"
        >
          {E.change}
        </Link>
      </div>
      <div className={k("su-ch")}>
        <b>{L.title}</b>
        <small>{L.sub}</small>
      </div>
      <div className={`${k("su-sec")} ${v.pad}`}>
        <div className={`${k("su-sum2")} ${v.sum}`}>
          <div>
            <span>{L.lat}</span>
            <b>{settings.latitude ?? PROFILE.notSet}</b>
          </div>
          <div>
            <span>{L.lng}</span>
            <b>{settings.longitude ?? PROFILE.notSet}</b>
          </div>
        </div>
        <p className={k("su-note")}>{L.hint}</p>
        <button
          type="button"
          className={`${k("btn", "sm")} ${v.start}`}
          onClick={() => {
            setSaid("");
            setOpen(true);
          }}
        >
          {L.edit}
        </button>
        <p className={k("su-note")} role="status" aria-live="polite">
          {said}
        </p>
      </div>

      <DeskDialog
        open={open}
        onClose={close}
        label={L.dialogTitle}
        tile="nav"
        title={L.dialogTitle}
        lead={L.dialogLead}
      >
        <form onSubmit={submit} className={v.form}>
          <div className={k("su-sec")}>
            <div className={v.coords}>
              <Field as="label" label={L.lat} hint={L.optional}>
                <input
                  className={k("in")}
                  name="latitude"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-2}
                  max={5}
                  defaultValue={settings.latitude ?? ""}
                  placeholder={L.latPh}
                />
              </Field>
              <Field as="label" label={L.lng} hint={L.optional}>
                <input
                  className={k("in")}
                  name="longitude"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={29}
                  max={36}
                  defaultValue={settings.longitude ?? ""}
                  placeholder={L.lngPh}
                />
              </Field>
            </div>
            <p className={k("su-note")}>{L.hint}</p>
            <Field as="label" label={L.reason}>
              <input
                className={k("in")}
                name="reason"
                minLength={8}
                required
                placeholder={L.reasonPh}
              />
            </Field>
            <p className={k("su-note")}>{L.reasonHint}</p>
            {error ? (
              <p className={k("su-note")} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className={k("mf")}>
            <button type="submit" className={k("btn", "k")} disabled={busy}>
              {busy ? L.saving : L.save}
            </button>
            <button type="button" className={k("btn")} onClick={close}>
              {L.cancel}
            </button>
          </div>
        </form>
      </DeskDialog>
    </div>
  );
}
