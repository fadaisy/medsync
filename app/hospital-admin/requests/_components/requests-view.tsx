"use client";

import type { CopyRequest } from "../_lib/copies";
import type { PendingRow } from "../_lib/pending-rows";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DeskDialog, Field, Icon, k } from "@/components/clinics-schedule/shared";
import { REQUESTS } from "@/content/hospital-admin/admin-nav";
import { fill } from "@/content/lab-workspace-v2";
import { fulfilRecordsRequestAction } from "../_lib/actions";
import v from "./requests-view.module.css";

type Tab = "clinician" | "copies";

const PATH = "/hospital-admin/requests";
const DUE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
/** `YYYY-MM-DD` as the page prints a date: "Wed 2 Dec". */
const dueText = (d: string) => DUE.format(new Date(`${d}T00:00:00Z`));

/**
 * Requests (ADR 0515), in the Tether desk look. The clinician list is read-only and in the order it came: the
 * admin opens the session in the week plan to change who runs it. A copy of results is marked sent with a note.
 */
export function RequestsView({
  tab: initial,
  pending,
  cut,
  copies,
}: {
  tab: Tab;
  pending: readonly PendingRow[];
  cut: boolean;
  copies: readonly CopyRequest[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initial);
  const [sel, setSel] = useState<CopyRequest | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [busy, start] = useTransition();
  const C = REQUESTS.clinician;
  const P = REQUESTS.copies;
  const short = note.trim().length < 8;

  const pick = (t: Tab) => {
    setTab(t);
    router.replace(t === "copies" ? `${PATH}?tab=copies` : PATH, { scroll: false });
  };
  const close = () => {
    setSel(null);
    setNote("");
    setError(null);
  };
  const markSent = () => {
    if (!sel || short) return;
    const id = sel.id;
    start(async () => {
      const r = await fulfilRecordsRequestAction({ id, note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      setSaid(P.done);
      router.refresh();
    });
  };

  const tabs: ReadonlyArray<[Tab, string, number]> = [
    ["clinician", REQUESTS.tabs.clinician, pending.length],
    ["copies", REQUESTS.tabs.copies, copies.length],
  ];

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{REQUESTS.title}</h1>
            <span className={k("adate")}>{REQUESTS.lead}</span>
          </div>
        </div>
        <div className={k("su-ctb")}>
          <div className={k("su-cfs")} role="tablist" aria-label={REQUESTS.title}>
            {tabs.map(([t, label, n]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={k(tab === t && "on")}
                onClick={() => pick(t)}
              >
                {label}
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>

        {tab === "clinician" ? (
          <>
            <p className={k("su-note")}>{C.note}</p>
            <div className={k("su-card")}>
              {pending.length ? (
                pending.map((r) => (
                  <div key={r.id} className={`${k("su-td")} ${v.row}`}>
                    <span className={k("su-tdi")} aria-hidden="true">
                      <Icon n="clock" size={16} />
                    </span>
                    <span className={k("su-tdt")}>
                      <b>{r.title}</b>
                      <small>{r.sub}</small>
                    </span>
                    <span className={v.acts}>
                      {r.urgent ? <span className={k("su-st", "setup")}>{C.urgent}</span> : null}
                      {r.stale ? <span className={k("su-st", "setup")}>{C.stale}</span> : null}
                      <Link
                        className={k("btn", "sm", "q")}
                        href="/hospital-admin/clinics?view=week"
                      >
                        {C.open}
                      </Link>
                    </span>
                  </div>
                ))
              ) : (
                <p className={k("su-none")}>{C.empty}</p>
              )}
            </div>
            {cut ? <p className={k("su-note")}>{fill(C.more, { shown: pending.length })}</p> : null}
          </>
        ) : (
          <>
            <p className={k("su-note")}>{P.note}</p>
            <div className={k("su-card")}>
              {copies.length ? (
                copies.map((c) => (
                  <div key={c.id} className={`${k("su-td")} ${v.row}`}>
                    <span className={k("su-tdi")} aria-hidden="true">
                      <Icon n="ticket" size={16} />
                    </span>
                    <span className={k("su-tdt")}>
                      <b>{fill(P.title, { code: c.code ?? P.noNumber })}</b>
                      <small>
                        {fill(P.due, { date: dueText(c.dueOn) })}
                        {c.held ? ` · ${P.held}` : ""}
                      </small>
                    </span>
                    <span className={v.acts}>
                      <button
                        type="button"
                        className={k("btn", "sm")}
                        onClick={() => {
                          setSel(c);
                          setSaid("");
                        }}
                      >
                        {P.mark}
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <p className={k("su-none")}>{P.empty}</p>
              )}
            </div>
          </>
        )}
        <p className={k("su-note")} role="status" aria-live="polite">
          {said}
        </p>
      </div>

      <DeskDialog
        open={!!sel}
        onClose={close}
        label={P.dialogTitle}
        tile="ticket"
        title={P.dialogTitle}
        lead={
          sel ? fill(P.dialogLead, { code: sel.code ?? P.noNumber, date: dueText(sel.dueOn) }) : ""
        }
      >
        <div className={k("su-sec")}>
          <Field as="label" label={P.how}>
            <input
              className={k("in")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={P.howPh}
              maxLength={300}
              autoFocus
            />
          </Field>
          <p className={k("su-note")}>{P.hint}</p>
          {error ? (
            <p className={k("su-note")} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={k("mf")}>
          <button
            type="button"
            className={k("btn", "k")}
            disabled={short || busy}
            onClick={markSent}
          >
            {P.mark}
          </button>
          <button type="button" className={k("btn")} onClick={close}>
            {P.cancel}
          </button>
        </div>
      </DeskDialog>
    </div>
  );
}
