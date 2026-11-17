"use client";

import type { Cap } from "../_lib/model";
import type { CapabilityKey } from "@/supabase/functions/_shared/services-hub";
import { useState } from "react";

import {
  Chip,
  ChipRow,
  DeskDialog,
  Field,
  k,
  Seg,
  Toggle,
} from "@/components/clinics-schedule/shared";
import { EMERG } from "@/content/hospital-admin/emergency";
import { fill } from "@/content/lab-workspace-v2";
import { checkCapabilityValue } from "@/supabase/functions/_shared/services-hub";
import { proposeCapabilityAction } from "../_lib/actions";
import { fmtPhone, show } from "../_lib/model";
import { useOp } from "../../_lib/use-op";
import e from "./emergency.module.css";

const C = EMERG.change;
type PreAlert = { enabled: boolean; owner: string };

/** The control's starting value: the live value, in the shape the control edits. */
function initial(key: CapabilityKey, v: unknown): unknown {
  switch (key.value.type) {
    case "multi":
      return Array.isArray(v) ? v : [];
    case "phone":
    case "text":
      return typeof v === "string" ? v : "";
    case "pre_alert": {
      const p = (v ?? { enabled: false, owner: null }) as {
        enabled: boolean;
        owner: string | null;
      };
      return { enabled: p.enabled, owner: p.owner ?? "" } satisfies PreAlert;
    }
    default:
      return v ?? null;
  }
}

/**
 * Change one setting (the prototype's change dialog): one proper control per value type, Now → Proposed, and a
 * reason. The proposed value is checked by the services hub's own `checkCapabilityValue`, the same check the Edge
 * Function runs, so what the admin sees accepted is what the function accepts. A routing value is sent for a
 * second admin to verify; any other value applies at once.
 */
export function ChangeDialog({
  capKey: key,
  cap,
  onClose,
  onDone,
}: {
  capKey: CapabilityKey;
  cap: Cap;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const op = useOp();
  const [raw, setRaw] = useState<unknown>(() => initial(key, cap.value));
  const [why, setWhy] = useState("");
  const t = key.value;
  const checked = checkCapabilityValue(key.key, raw);
  const now = show(key, cap.value);
  const same =
    checked.ok && JSON.stringify(checked.value ?? null) === JSON.stringify(cap.value ?? null);
  const proposed = checked.ok ? show(key, checked.value) : "—";
  const who = key.section === 1 ? C.whoRouting : C.whoSupport;
  const go = () =>
    checked.ok &&
    op.call(
      () => proposeCapabilityAction({ key: key.key, value: checked.value, reason: why.trim() }),
      () => onDone(key.routing ? C.sent : C.saved),
    );

  let control: React.ReactNode = null;
  if (key.key === "emergency_capability" && t.type === "choice") {
    control = (
      <>
        <span className={k("cap")}>{C.receiving}</span>
        <Seg
          opts={(["24h", "daytime", "none"] as const).map((c) => [c, C.recvOpts[c]] as const)}
          value={(raw as string | null) ?? null}
          onPick={setRaw}
          label={C.receiving}
          sm={false}
          className={e.wrapSeg}
        />
        {raw === "none" ? <p className={k("su-note")}>{C.recvNote}</p> : null}
      </>
    );
  } else if (t.type === "choice" || t.type === "yesno") {
    const opts: readonly (readonly [unknown, string])[] =
      t.type === "choice"
        ? t.options.map((o) => [o.code, o.label] as const)
        : [
            [true, C.yes],
            [false, C.no],
          ];
    control = (
      <>
        <span className={k("cap")}>{C.choose}</span>
        {opts.map(([v, label]) => (
          <Toggle key={String(v)} on={raw === v} flip={() => setRaw(v)} t={[label, ""]} />
        ))}
      </>
    );
  } else if (t.type === "multi") {
    const list = raw as string[];
    control = (
      <>
        <span className={k("cap")}>{C.chooseAny}</span>
        {t.options.map((o) => {
          const on = list.includes(o.code);
          return (
            <Toggle
              key={o.code}
              on={on}
              flip={() => setRaw(on ? list.filter((c) => c !== o.code) : [...list, o.code])}
              t={[o.label, ""]}
            />
          );
        })}
      </>
    );
  } else if (t.type === "count") {
    const n = typeof raw === "number" ? raw : 0;
    const clamp = (x: number) => Math.max(0, Math.min(t.max, x));
    control = (
      <Field label={C.count} hint={fill(C.countHint, { max: t.max })}>
        <span className={e.stepper}>
          <button
            type="button"
            className={k("btn", "sm")}
            aria-label={C.fewer}
            onClick={() => setRaw(clamp(n - 1))}
          >
            −
          </button>
          <input
            className={`${k("in")} ${e.field} ${e.num}`}
            inputMode="numeric"
            aria-label={key.label}
            value={raw === null || raw === undefined ? "" : String(raw)}
            onChange={(ev) => {
              const d = ev.target.value.replace(/\D/g, "");
              setRaw(d === "" ? null : clamp(Number(d)));
            }}
          />
          <button
            type="button"
            className={k("btn", "sm")}
            aria-label={C.more}
            onClick={() => setRaw(clamp(n + 1))}
          >
            +
          </button>
        </span>
      </Field>
    );
  } else if (t.type === "phone") {
    const v = raw as string;
    control = (
      <>
        <Field as="label" label={C.number}>
          <input
            className={`${k("in")} ${e.field}`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={C.phonePh}
            value={v}
            onChange={(ev) => setRaw(ev.target.value)}
          />
        </Field>
        <p className={k("su-note")}>
          {!v.trim()
            ? cap.value
              ? C.phoneClear
              : key.key === "ambulance_line"
                ? C.phoneTollFree
                : C.phoneHint
            : checked.ok
              ? fill(C.phoneOk, { n: fmtPhone(String(checked.value)) })
              : C.phoneBad}
        </p>
      </>
    );
  } else if (t.type === "text") {
    const v = raw as string;
    control = (
      <>
        <Field as="label" label={C.directions}>
          <textarea
            className={`${k("in")} ${e.ta}`}
            maxLength={t.max}
            placeholder={C.directionsPh}
            value={v}
            onChange={(ev) => setRaw(ev.target.value)}
          />
        </Field>
        <p className={k("su-note")}>
          {C.directionsHint} {fill(C.left, { n: t.max - v.length })}
        </p>
      </>
    );
  } else if (t.type === "pre_alert") {
    const p = raw as PreAlert;
    control = (
      <>
        <span className={k("cap")}>{C.preAlerts}</span>
        <Seg
          opts={[
            ["yes", C.yes],
            ["no", C.no],
          ]}
          value={p.enabled ? "yes" : "no"}
          onPick={(x) => setRaw({ ...p, enabled: x === "yes" })}
          label={C.preAlerts}
        />
        {p.enabled ? (
          <Field as="label" label={C.owner}>
            <input
              className={`${k("in")} ${e.field}`}
              maxLength={240}
              placeholder={C.ownerPh}
              value={p.owner}
              onChange={(ev) => setRaw({ ...p, owner: ev.target.value })}
            />
          </Field>
        ) : null}
        <p className={k("su-note")}>{C.ownerHint}</p>
      </>
    );
  }

  const label = same ? C.first : !checked.ok ? C.check : key.routing ? C.sendRouting : C.save;
  return (
    <DeskDialog
      open
      onClose={onClose}
      label={key.label}
      tile="swap"
      title={key.label}
      lead={fill(key.routing ? C.leadRouting : C.leadDirect, { who })}
      cls={k("su-m", "md")}
    >
      <div className={e.chg}>
        <div className={k("su-sec")}>{control}</div>
        <div className={k("su-sec")}>
          <div className={e.cmp}>
            <div>
              <span className={k("cap")}>{C.now}</span>
              <b>{now}</b>
            </div>
            <span className={e.arrow} aria-hidden="true">
              →
            </span>
            <div>
              <span className={k("cap")}>{C.proposed}</span>
              <b>{proposed}</b>
            </div>
          </div>
          {same ? <p className={k("su-note")}>{C.same}</p> : null}
          {!checked.ok ? (
            <p className={k("su-note")} role="alert">
              {checked.error}
            </p>
          ) : null}
          <span className={k("cap")}>{C.why}</span>
          <ChipRow label={C.why}>
            {C.reasons.map((r) => (
              <Chip key={r} on={why === r} onClick={() => setWhy(r)}>
                {r}
              </Chip>
            ))}
          </ChipRow>
          <input
            className={`${k("in")} ${e.field}`}
            value={why}
            maxLength={500}
            placeholder={C.whyPh}
            aria-label={C.why}
            onChange={(ev) => setWhy(ev.target.value)}
          />
        </div>
      </div>
      {op.error ? (
        <p className={k("su-note")} role="alert">
          {op.error}
        </p>
      ) : null}
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy || same || !checked.ok || why.trim().length < 8}
          onClick={go}
        >
          {label}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {C.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
