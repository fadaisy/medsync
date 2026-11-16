"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DeskDialog, Field, k, Toggle } from "@/components/clinics-schedule/shared";
import { PROFILE } from "@/content/hospital-admin/profile-reports";
import { fill } from "@/content/lab-workspace-v2";
import { setOutbreakModeAction } from "../actions";
import v from "./profile-view.module.css";

const O = PROFILE.outbreak;

/**
 * Outbreak mode (clerking desk v2, D-CV-06), in the desk: while it is on, the clerking desk's outbreak screen (fever
 * plus at least three listed symptoms) is active for this hospital. Fever with an exposure is always screened,
 * whatever this says. The switch opens a centred dialog that asks for the reason; every change is audited by
 * `setOutbreakModeAction`. Settings, not an emergency: no red here.
 */
export function OutbreakCard({ on, reason }: { on: boolean | null; reason: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [busy, start] = useTransition();

  if (on === null)
    return (
      <div className={k("su-card")} data-tour="wt-ob">
        <div className={k("su-ch")}>
          <b>{O.title}</b>
        </div>
        <p className={k("su-none")}>{O.unavailable}</p>
      </div>
    );

  const title = on ? O.turnOff : O.turnOn;
  const short = text.trim().length < 8;
  const close = () => {
    setOpen(false);
    setText("");
    setError(null);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (short) return;
    const form = new FormData(e.currentTarget);
    const next = !on;
    start(async () => {
      const r = await setOutbreakModeAction({}, form);
      if (r.error) {
        setError(r.error);
        return;
      }
      close();
      setSaid(next ? O.doneOn : O.doneOff);
      router.refresh();
    });
  };

  return (
    <div className={k("su-card")} data-tour="wt-ob">
      <div className={k("su-ch")}>
        <b>{O.title}</b>
        <small>{on ? O.on : O.off}</small>
      </div>
      <div className={`${k("su-sec")} ${v.pad}`}>
        <Toggle
          on={on}
          flip={() => {
            setSaid("");
            setOpen(true);
          }}
          t={[O.toggle, O.lineOn, O.lineOff]}
        />
        {on && reason ? <p className={k("su-note")}>{fill(O.reasonGiven, { reason })}</p> : null}
        <p className={k("su-note")}>{O.note}</p>
        <p className={k("su-note")} role="status" aria-live="polite">
          {said}
        </p>
      </div>

      <DeskDialog
        open={open}
        onClose={close}
        label={title}
        tile="sun"
        title={title}
        lead={O.dialogLead}
      >
        <form onSubmit={submit} className={v.form}>
          <div className={k("su-sec")}>
            <p className={k("su-note")}>{O.dialogNote}</p>
            <input type="hidden" name="on" value={on ? "false" : "true"} />
            <Field as="label" label={O.reason}>
              <input
                className={k("in")}
                name="reason"
                minLength={8}
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={on ? O.reasonPhOff : O.reasonPhOn}
                autoFocus
              />
            </Field>
            <p className={k("su-note")}>{O.reasonHint}</p>
            {error ? (
              <p className={k("su-note")} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className={k("mf")}>
            <button type="submit" className={k("btn", "k")} disabled={short || busy}>
              {title}
            </button>
            <button type="button" className={k("btn")} onClick={close}>
              {O.cancel}
            </button>
          </div>
        </form>
      </DeskDialog>
    </div>
  );
}
