"use client";

import type { SectionProps } from "./roster-tab";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import { useState } from "react";

import { DateField, PickField } from "@/app/lab/_components/v2/fields";
import { handOverAction } from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { linkBtn, pillBtn, sectionTitle } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CADRE } from "@/content/pharmacy-roster";
import { RG } from "@/content/pharmacy-roster-grid";
import { isPharmacyPlace } from "@/lib/pharmacy/derive/roster";
import { useAct } from "./slot-dialog";

const T = RG.hand;

/** A Postgres timestamptz text as epoch ms, and as its Kampala date. */
const tsMs = (ts: string) => Date.parse(ts.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
const kampalaDay = (ts: string) => {
  const t = tsMs(ts);
  return Number.isNaN(t) ? ts.slice(0, 10) : new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
};

/** §5 history: each handover and each take-back, newest first (a replaced handover is not a take-back). */
export function handOverHistory(view: RosterView) {
  const name = (u: string) => view.people.find((p) => p.userId === u)?.name ?? T.someone;
  const placeNames = (ids: readonly string[]) =>
    ids.map((id) => view.places.find((p) => p.id === id)?.name ?? "").filter(Boolean);
  const out: { at: number; line: string }[] = [];
  for (const d of view.delegations) {
    out.push({
      at: tsMs(d.createdAt),
      line: T.logHanded(
        kampalaDay(d.createdAt),
        name(d.fromUser),
        T.what(placeNames(d.places)),
        name(d.toUser),
        d.until,
        d.canPublish,
      ),
    });
    if (!d.revokedAt) continue;
    const at = tsMs(d.revokedAt);
    const replaced = view.delegations.some(
      (o) => o.id !== d.id && o.toUser === d.toUser && Math.abs(tsMs(o.createdAt) - at) < 60_000,
    );
    if (!replaced)
      out.push({ at, line: T.logTook(kampalaDay(d.revokedAt), name(d.fromUser), name(d.toUser)) });
  }
  return out.sort((a, b) => b.at - a.at).map((e) => e.line);
}

/** §5: the in-charge hands making the roster to someone, for all or some pharmacy places, until an optional date. */
export function HandOverDialog({
  view,
  toast,
  open,
  onClose,
}: SectionProps & { open: boolean; onClose: () => void }) {
  const [busy, run] = useAct(toast);
  const [to, setTo] = useState("");
  const [all, setAll] = useState(true);
  const [places, setPlaces] = useState<string[]>([]);
  const [until, setUntil] = useState("");
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState("");
  const pharm = view.places.filter(isPharmacyPlace);
  const staff = view.people.filter(
    (p) => p.userId !== view.viewerId && p.places.some((id) => pharm.some((x) => x.id === id)),
  );
  const log = handOverHistory(view).slice(0, 5);
  const reset = () => {
    setTo("");
    setAll(true);
    setPlaces([]);
    setUntil("");
    setPublish(true);
    setError("");
  };
  const shut = () => {
    reset();
    onClose();
  };
  const save = () => {
    if (!to) return setError(T.err.to);
    if (!all && !places.length) return setError(T.err.places);
    if (until && until < view.now.date) return setError(T.err.passed);
    const who = staff.find((p) => p.userId === to)?.name ?? "";
    const what = T.what(all ? [] : pharm.filter((p) => places.includes(p.id)).map((p) => p.name));
    void run(
      () =>
        handOverAction({
          toUser: to,
          places: all ? [] : places,
          until: until || null,
          canPublish: all && publish,
        }),
      () => {
        shut();
        toast(T.done(who, what));
      },
    );
  };

  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && shut()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5 pb-3">
        <DialogTitle>{T.title}</DialogTitle>
        <p className="text-body-s text-ink-600 m-0">{T.sub}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
        <PickField
          label={T.to}
          placeholder={T.pick}
          forceList
          value={to}
          onChange={(v) => {
            setTo(v);
            setError("");
          }}
          options={staff.map((p) => ({ value: p.userId, label: p.name, detail: CADRE[p.cadre] }))}
        />
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="text-body-s text-foreground mb-1.5 font-semibold">{T.for}</legend>
          <span className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={all}
              className={pillBtn(all)}
              onClick={() => {
                setAll(!all);
                setPlaces([]);
                setError("");
              }}
            >
              {T.all}
            </button>
            {pharm.map((p) => {
              const on = !all && places.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  className={pillBtn(on)}
                  onClick={() => {
                    const base = all ? [] : places;
                    setAll(false);
                    setPlaces(on ? base.filter((x) => x !== p.id) : [...base, p.id]);
                    setPublish(false);
                    setError("");
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </span>
        </fieldset>
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <DateField
              label={T.until}
              value={until}
              onChange={(v) => {
                setUntil(v);
                setError("");
              }}
              allowFuture
              min={view.now.date}
            />
            {until ? (
              <button type="button" className={linkBtn} onClick={() => setUntil("")}>
                {T.clear}
              </button>
            ) : null}
          </div>
          <span className="text-ink-600 text-[12px]">{T.untilHint}</span>
        </div>
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            checked={publish}
            onChange={() => {
              setPublish(!publish);
              setError("");
            }}
            className="accent-primary size-[18px]"
          />
          {T.publish}
        </label>
        {error ? (
          <p role="alert" className="text-status-critical-fg-aa m-0 text-[13px] font-semibold">
            {error}
          </p>
        ) : null}
        {log.length ? (
          <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-1 p-3">
            <span className={sectionTitle}>{T.history}</span>
            {log.map((l, i) => (
              <span key={i} className="text-ink-700 text-[12px] leading-4">
                {l}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="border-border flex justify-end gap-2 border-t px-6 py-3">
        <LabButton variant="text" onClick={shut}>
          {T.cancel}
        </LabButton>
        <LabButton variant="primary" busy={busy} onClick={save}>
          {T.submit}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
