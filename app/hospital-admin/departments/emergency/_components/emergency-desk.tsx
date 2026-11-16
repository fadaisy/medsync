"use client";

import type { Cap, HelpPreview, Location } from "../_lib/model";
import type { CapabilityKey } from "@/supabase/functions/_shared/services-hub";
import Link from "next/link";
import { useState } from "react";

import { Chip, ChipRow, DeskDialog, Icon, k } from "@/components/clinics-schedule/shared";
import { EMERG } from "@/content/hospital-admin/emergency";
import { fill } from "@/content/lab-workspace-v2";
import { CAPABILITY_KEYS, CAPABILITY_SECTIONS } from "@/supabase/functions/_shared/services-hub";
import { rejectCapabilityAction, verifyCapabilityAction } from "../_lib/actions";
import { coordsText, fmtPhone, show } from "../_lib/model";
import { useOp } from "../../_lib/use-op";
import { ChangeDialog } from "./change-dialog";
import e from "./emergency.module.css";
import { PinDialog } from "./pin-dialog";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Kampala",
  });
const ICONS: Record<string, string> = {
  emergency_capability: "alert",
  triage_system: "tick",
  resus_bays: "card",
  accepts_pre_alerts: "arrivals",
  emergency_sms_number: "chat",
  ambulance_line: "phone",
  arrival_directions: "nav",
};
/** Sections 2–9: what the hospital can take in. Section 1 is the emergency department's routing card. */
const SUPPORT = [2, 3, 4, 5, 6, 7, 8, 9];
const KEYS = CAPABILITY_KEYS.filter((x) => x.key !== "opd_hours");

type Modal = { k: "change"; key: string } | { k: "reject"; key: string } | { k: "pin" } | null;

/**
 * Emergency and support (ADR 0520 phase 2), in the Tether desk as the approved prototype: the receiving banner (ink,
 * never red), the changes waiting for a second admin with Verify and Reject, the routing card beside what the public
 * Help screen shows, and the support cards. Every Change opens one dialog with the proper control for that value.
 */
export function EmergencyDesk({
  caps,
  location,
  help,
}: {
  caps: Cap[];
  location: Location;
  help: HelpPreview;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const [said, setSaid] = useState("");
  const op = useOp();
  const cap = (key: string) => caps.find((c) => c.key === key)!;
  const keyOf = (key: string) => KEYS.find((x) => x.key === key)!;
  const pending = KEYS.filter((x) => cap(x.key)?.pending);
  const ed = cap("emergency_capability");
  const pre = cap("accepts_pre_alerts")?.value as { enabled: boolean } | null;
  const edValue = (ed?.value as "24h" | "daytime" | "none" | null) ?? "none";
  const done = (text: string) => {
    setModal(null);
    setSaid(text);
  };
  const verify = (key: string) =>
    op.call(
      () => verifyCapabilityAction({ key }),
      () => setSaid(EMERG.pending.verified),
    );
  const open = modal && modal.k !== "pin" ? keyOf(modal.key) : null;

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={`${k("ahead")} ${e.head}`}>
          <div className={k("ahl")}>
            <h1>{EMERG.title}</h1>
            <span className={k("adate")}>{EMERG.lead}</span>
          </div>
        </div>

        <div className={`${e.hero} ${edValue === "none" ? e.off : ""}`}>
          <span className={e.heroIcon} aria-hidden="true">
            <Icon n="arrivals" size={22} />
          </span>
          <div className={`${k("su-cn")} ${e.wrapText}`}>
            <b>{EMERG.hero[edValue]}</b>
            <small>
              {[
                edValue === "none" ? EMERG.hero.noneSub : null,
                pre?.enabled ? EMERG.hero.preOn : EMERG.hero.preOff,
                ed?.pending ? EMERG.hero.waiting : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </div>
          <span className={e.grow} />
          {ed && !ed.pending ? (
            <button
              type="button"
              className={k("btn", "sm")}
              onClick={() => setModal({ k: "change", key: "emergency_capability" })}
            >
              {EMERG.hero.change}
            </button>
          ) : null}
        </div>

        {pending.length ? (
          <div className={k("su-card")}>
            <div className={k("su-ch")}>
              <b>{EMERG.pending.title}</b>
              <small>
                {fill(EMERG.pending.count[pending.length === 1 ? 0 : 1], { n: pending.length })} ·{" "}
                {EMERG.pending.rule}
              </small>
            </div>
            {pending.map((x) => {
              const c = cap(x.key);
              return (
                <div key={x.key} className={`${k("su-td")} ${e.tdWrap}`}>
                  <span className={`${k("su-tdt")} ${e.wrapText}`}>
                    <b>{x.label}</b>
                    <small>
                      {fill(EMERG.pending.line, {
                        from: show(x, c.value),
                        to: show(x, c.pendingValue),
                      })}
                    </small>
                    <small>
                      {fill(EMERG.pending.by, {
                        name: c.pending!.byName,
                        date: fmtDate(c.pending!.at),
                      })}
                    </small>
                  </span>
                  <span className={e.acts}>
                    {c.pending!.mine ? (
                      <span className={e.tag}>{EMERG.pending.yours}</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={k("btn", "sm", "k")}
                          disabled={op.busy}
                          onClick={() => verify(x.key)}
                        >
                          {EMERG.pending.verify}
                        </button>
                        <button
                          type="button"
                          className={k("btn", "sm", "q")}
                          onClick={() => setModal({ k: "reject", key: x.key })}
                        >
                          {EMERG.pending.reject}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
            {op.error ? (
              <p className={k("su-none")} role="alert">
                {op.error}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={e.em}>
          <div className={k("su-card")}>
            <div className={k("su-ch")}>
              <b>{EMERG.routing.title}</b>
              <small>{EMERG.routing.sub}</small>
            </div>
            {KEYS.filter((x) => x.section === 1).map((x) => (
              <div key={x.key} className={`${k("su-td")} ${e.tdWrap}`}>
                <span className={k("su-tdi")} aria-hidden="true">
                  <Icon n={ICONS[x.key] ?? "tick"} size={16} />
                </span>
                <span className={`${k("su-tdt")} ${e.wrapText}`}>
                  <b>{x.label}</b>
                  <small>{show(x, cap(x.key).value)}</small>
                  <small>{status(x, cap(x.key))}</small>
                </span>
                <RowAction
                  k={x}
                  c={cap(x.key)}
                  onChange={() => setModal({ k: "change", key: x.key })}
                />
              </div>
            ))}
            <div className={`${k("su-td")} ${e.tdWrap}`}>
              <span className={k("su-tdi")} aria-hidden="true">
                <Icon n="nav" size={16} />
              </span>
              <span className={`${k("su-tdt")} ${e.wrapText}`}>
                <b>{EMERG.location.label}</b>
                <small>
                  {location.latitude !== null && location.longitude !== null
                    ? coordsText(location.latitude, location.longitude)
                    : EMERG.location.none}
                </small>
                <small>{EMERG.location.rule}</small>
              </span>
              <span className={e.acts}>
                <button
                  type="button"
                  className={k("btn", "sm")}
                  onClick={() => setModal({ k: "pin" })}
                >
                  {EMERG.row.change}
                </button>
              </span>
            </div>
          </div>
          <HelpScreen help={help} pinned={location.latitude !== null} />
        </div>

        <div className={`${k("su-ch")} ${e.plain}`}>
          <b>{EMERG.support.title}</b>
          <small>{EMERG.support.sub}</small>
        </div>
        <div className={e.sup}>
          {SUPPORT.map((n) => {
            const keys = KEYS.filter((x) => x.section === n);
            const waiting = keys.some((x) => cap(x.key).pending);
            return (
              <div key={n} className={`${k("su-card", "su-sec")} ${e.pad}`}>
                <span className={e.cardHead}>
                  <b>{CAPABILITY_SECTIONS[n]}</b>
                  <span className={e.grow} />
                  {waiting ? <span className={e.tag}>{EMERG.row.waiting}</span> : null}
                </span>
                {keys.map((x) => (
                  <div key={x.key} className={e.line}>
                    <span className={k("su-tgt")}>
                      <b>{x.label}</b>
                      <small>{show(x, cap(x.key).value)}</small>
                      <small>{status(x, cap(x.key))}</small>
                    </span>
                    <span className={e.grow} />
                    <RowAction
                      k={x}
                      c={cap(x.key)}
                      onChange={() => setModal({ k: "change", key: x.key })}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className={k("su-note")}>{EMERG.sections}</p>
        <p className={k("su-note")} role="status" aria-live="polite">
          {said}
        </p>
      </div>

      {modal?.k === "change" && open ? (
        <ChangeDialog
          key={open.key}
          capKey={open}
          cap={cap(open.key)}
          onClose={() => setModal(null)}
          onDone={done}
        />
      ) : null}
      {modal?.k === "reject" && open ? (
        <RejectDialog key={open.key} capKey={open} onClose={() => setModal(null)} onDone={done} />
      ) : null}
      {modal?.k === "pin" ? (
        <PinDialog location={location} onClose={() => setModal(null)} onDone={done} />
      ) : null}
    </div>
  );
}

/** Under a value: who verified it, that it is not verified yet, or that it applies at once. */
function status(x: CapabilityKey, c: Cap): string {
  const R = EMERG.row;
  if (c.derived) return c.derivedFrom === "dispensing_points" ? R.fromPoints : R.fromWards;
  if (!x.routing) return R.direct;
  if (c.pending) return R.waiting;
  if (c.verified)
    return fill(R.verified, { name: c.verified.byName, date: fmtDate(c.verified.at) });
  return c.value === null || c.value === undefined || c.value === "" ? "" : R.unverified;
}

function RowAction({ k: x, c, onChange }: { k: CapabilityKey; c: Cap; onChange: () => void }) {
  if (c.derived) {
    const points = c.derivedFrom === "dispensing_points";
    return (
      <Link
        href={points ? "/hospital-admin/departments" : "/hospital-admin/departments/wards"}
        className={k("btn", "sm", "q")}
      >
        {points ? EMERG.row.openDepartments : EMERG.row.openWards}
      </Link>
    );
  }
  if (c.pending) return <span className={e.tag}>{EMERG.row.waiting}</span>;
  return (
    <button
      type="button"
      className={k("btn", "sm", x.section === 1 ? undefined : "q")}
      onClick={onChange}
    >
      {EMERG.row.change}
    </button>
  );
}

/** What the public Help screen (/emergency) shows for this hospital: its own query, verified numbers only. */
function HelpScreen({ help, pinned }: { help: HelpPreview; pinned: boolean }) {
  const H = EMERG.help;
  return (
    <div className={e.help} aria-label={H.title}>
      <span className={k("cap")}>{H.title}</span>
      <div className={e.phone}>
        <b>{help.name}</b>
        {help.failed ? (
          <small>{H.failed}</small>
        ) : (
          <>
            <div className={e.kv}>
              <span>{H.list}</span>
              <b>
                {!help.preAlertLive ? H.listNotLive : help.preAlertEnabled ? H.listOn : H.listOff}
              </b>
            </div>
            <div className={e.kv}>
              <span>{H.line}</span>
              <b>{help.emergencyLine ? fmtPhone(help.emergencyLine) : H.lineNone}</b>
            </div>
            <div className={e.kv}>
              <span>{H.ambulance}</span>
              <b>
                {help.ambulanceVerified
                  ? fmtPhone(help.ambulanceVerified)
                  : help.ambulanceWaiting
                    ? H.ambulanceWaiting
                    : H.ambulanceNone}
              </b>
            </div>
            <div className={e.kv}>
              <span>{H.where}</span>
              <b>{help.directions ?? H.whereNone}</b>
            </div>
            <small>{H.whereNote}</small>
            <div className={e.kv}>
              <span>{H.place}</span>
              <b>{pinned ? H.placeOn : H.placeOff}</b>
            </div>
          </>
        )}
        <small>{H.verifiedOnly}</small>
      </div>
    </div>
  );
}

/** Reject a pending change: the reason is required and audited; the verified value stays. */
function RejectDialog({
  capKey,
  onClose,
  onDone,
}: {
  capKey: CapabilityKey;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const op = useOp();
  const R = EMERG.reject;
  const [why, setWhy] = useState("");
  return (
    <DeskDialog
      open
      onClose={onClose}
      label={R.title}
      tile="alert"
      title={R.title}
      lead={`${capKey.label} · ${R.lead}`}
      cls={k("su-m", "sm")}
    >
      <div className={k("su-sec")}>
        <span className={k("cap")}>{R.why}</span>
        <ChipRow label={R.why}>
          {R.reasons.map((r) => (
            <Chip key={r} on={why === r} onClick={() => setWhy(r)}>
              {r}
            </Chip>
          ))}
        </ChipRow>
        <input
          className={`${k("in")} ${e.field}`}
          value={why}
          maxLength={500}
          placeholder={R.whyPh}
          aria-label={R.why}
          onChange={(ev) => setWhy(ev.target.value)}
        />
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
          disabled={op.busy || why.trim().length < 8}
          onClick={() =>
            op.call(
              () => rejectCapabilityAction({ key: capKey.key, reason: why.trim() }),
              () => onDone(EMERG.pending.rejected),
            )
          }
        >
          {R.go}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {R.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
