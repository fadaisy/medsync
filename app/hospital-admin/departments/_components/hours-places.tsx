"use client";

import type { DepartmentsData } from "../_lib/model";
import type { PlaceRow } from "@/lib/services/data";
import Link from "next/link";
import { useState } from "react";

import { DeskDialog, Field, k } from "@/components/clinics-schedule/shared";
import { DEPTS } from "@/content/hospital-admin/departments";
import { fill } from "@/content/lab-workspace-v2";
import { fmtDay } from "../_lib/model";
import { useOp } from "../_lib/use-op";
import d from "./departments.module.css";

const H = DEPTS.hours;
type Span = { from: string; to: string } | null;

/**
 * Hours and places (was the Hours & places tab, §5.9): outpatient hours by weekday, the places things point to, and
 * the year's public holidays with their source. Closures moved to Clinics & schedule's Closures view; this links
 * there rather than keeping a second list.
 */
export function HoursPlaces({ data }: { data: DepartmentsData }) {
  return (
    <>
      <p className={k("su-note")}>{H.note}</p>
      <Hours initial={data.opdHours} />
      <Places places={data.places} />
      <div className={k("su-card")}>
        <div className={`${k("su-td")} ${d.tdWrap}`}>
          <span className={`${k("su-tdt")} ${d.wrapText}`}>
            <b>{H.closuresCap}</b>
            <small>{H.closuresSub}</small>
          </span>
          <Link href="/hospital-admin/clinics?view=closures" className={k("btn", "sm")}>
            {H.openClosures}
          </Link>
        </div>
      </div>
      <Holidays holidays={data.holidays} />
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

/** Outpatient hours (`opd_hours`, not a routing value: it applies at once). One span a day, as the old page kept. */
function Hours({ initial }: { initial: Record<string, { from: string; to: string }[]> | null }) {
  const op = useOp();
  const [said, setSaid] = useState("");
  const [h, setH] = useState<Record<string, Span>>(() =>
    Object.fromEntries(
      H.days.map((_, i) => [String(i + 1), initial?.[String(i + 1)]?.[0] ?? null]),
    ),
  );
  const set = (day: string, v: Span) => {
    setSaid("");
    setH((x) => ({ ...x, [day]: v }));
  };
  const save = () =>
    op.run(
      {
        op: "set_capability",
        key: "opd_hours",
        value: Object.fromEntries(
          Object.entries(h)
            .filter(([, v]) => v)
            .map(([day, v]) => [day, [v]]),
        ),
      },
      () => setSaid(H.hoursSaved),
    );
  return (
    <div className={k("su-card")}>
      <div className={k("su-ch")}>
        <b>{H.opdCap}</b>
        <small>{H.opdSub}</small>
      </div>
      {H.days.map((day, i) => {
        const key = String(i + 1);
        const v = h[key] ?? null;
        return (
          <div key={day} className={d.hrow}>
            <b>{day}</b>
            {v ? (
              <>
                <input
                  type="time"
                  className={`${k("in")} ${d.time}`}
                  aria-label={fill(H.opens, { day })}
                  value={v.from}
                  onChange={(e) => set(key, { ...v, from: e.target.value })}
                />
                <span className={k("su-note")}>{H.to}</span>
                <input
                  type="time"
                  className={`${k("in")} ${d.time}`}
                  aria-label={fill(H.closes, { day })}
                  value={v.to}
                  onChange={(e) => set(key, { ...v, to: e.target.value })}
                />
                <button
                  type="button"
                  className={k("btn", "sm", "q")}
                  onClick={() => set(key, null)}
                >
                  {H.closed}
                </button>
              </>
            ) : (
              <>
                <span className={k("su-note")}>{initial ? H.closed : H.notSet}</span>
                <button
                  type="button"
                  className={k("btn", "sm", "q")}
                  onClick={() => set(key, { from: "08:00", to: "17:00" })}
                >
                  {H.open}
                </button>
              </>
            )}
          </div>
        );
      })}
      <div className={`${k("su-sec")} ${d.pad}`}>
        <ErrorNote error={op.error} />
        <div className={d.row}>
          <button type="button" className={k("btn", "sm", "k")} disabled={op.busy} onClick={save}>
            {H.saveHours}
          </button>
          <span className={k("su-note")} role="status" aria-live="polite">
            {said}
          </span>
        </div>
      </div>
    </div>
  );
}

function Places({ places }: { places: PlaceRow[] }) {
  const [editing, setEditing] = useState<PlaceRow | "new" | null>(null);
  const visible = places.filter((p) => !p.archived);
  return (
    <div className={k("su-card")}>
      <div className={k("su-ch")}>
        <b>{H.placesCap}</b>
        <small>{H.placesSub}</small>
        <span className={d.grow} />
        <button type="button" className={k("btn", "sm")} onClick={() => setEditing("new")}>
          {H.addPlace}
        </button>
      </div>
      {visible.length ? (
        visible.map((p) => (
          <div key={p.id} className={`${k("su-td")} ${d.tdWrap}`}>
            <span className={`${k("su-tdt")} ${d.wrapText}`}>
              <b>{p.name}</b>
              <small>
                {[p.building, p.floor, p.room].filter(Boolean).join(" · ")}
                {p.directions ? ` · ${p.directions}` : ""}
              </small>
            </span>
            <button type="button" className={k("btn", "sm", "q")} onClick={() => setEditing(p)}>
              {H.change}
            </button>
          </div>
        ))
      ) : (
        <p className={k("su-none")}>{H.noPlaces}</p>
      )}
      {editing ? (
        <PlaceDialog
          key={editing === "new" ? "new" : editing.id}
          place={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function PlaceDialog({ place, onClose }: { place: PlaceRow | null; onClose: () => void }) {
  const op = useOp();
  const P = DEPTS.place;
  const [f, setF] = useState({
    name: place?.name ?? "",
    building: place?.building ?? "",
    floor: place?.floor ?? "",
    room: place?.room ?? "",
    directions: place?.directions ?? "",
  });
  const [archiving, setArchiving] = useState(false);
  const [why, setWhy] = useState("");
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [key]: e.target.value }));
  return (
    <DeskDialog
      open
      onClose={onClose}
      label={place ? place.name : P.add}
      tile="nav"
      title={place ? place.name : P.add}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        <Field as="label" label={P.name} hint={P.nameHint}>
          <input
            className={`${k("in")} ${d.select}`}
            value={f.name}
            maxLength={80}
            onChange={set("name")}
          />
        </Field>
        <div className={d.row}>
          <Field as="label" label={P.building}>
            <input
              className={`${k("in")} ${d.select}`}
              value={f.building}
              maxLength={60}
              onChange={set("building")}
            />
          </Field>
          <Field as="label" label={P.floor}>
            <input
              className={`${k("in")} ${d.select}`}
              value={f.floor}
              maxLength={30}
              onChange={set("floor")}
            />
          </Field>
          <Field as="label" label={P.room}>
            <input
              className={`${k("in")} ${d.select}`}
              value={f.room}
              maxLength={30}
              onChange={set("room")}
            />
          </Field>
        </div>
        <Field
          as="label"
          label={P.directions}
          hint={fill(P.directionsHint, { n: f.directions.length })}
        >
          <input
            className={`${k("in")} ${d.select}`}
            value={f.directions}
            maxLength={140}
            placeholder={P.directionsPh}
            onChange={set("directions")}
          />
        </Field>
        {place ? (
          archiving ? (
            <div className={d.confirm}>
              <span className={k("su-note")}>{P.archiveSub}</span>
              <input
                className={`${k("in")} ${d.select}`}
                value={why}
                maxLength={500}
                placeholder={P.why}
                aria-label={P.why}
                onChange={(e) => setWhy(e.target.value)}
              />
              <div className={d.row}>
                <button
                  type="button"
                  className={k("btn", "sm", "k")}
                  disabled={op.busy || why.trim().length < 8}
                  onClick={() =>
                    op.run(
                      { op: "archive", target: "place", id: place.id, reason: why.trim() },
                      onClose,
                    )
                  }
                >
                  {P.archiveGo}
                </button>
                <button
                  type="button"
                  className={k("btn", "sm")}
                  onClick={() => setArchiving(false)}
                >
                  {P.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={k("btn", "sm", "q")}
              onClick={() => setArchiving(true)}
            >
              {P.archive}
            </button>
          )
        ) : null}
      </div>
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy || f.name.trim().length < 1}
          onClick={() =>
            op.run({ op: "upsert_place", id: place?.id, ...f, name: f.name.trim() }, onClose)
          }
        >
          {P.save}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {P.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}

/** Public holidays: reference data with its source; clinics skip them unless a clinic says otherwise. */
function Holidays({
  holidays,
}: {
  holidays: { date: string; name: string; provisional: boolean; source: string }[];
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const years = [...new Set(holidays.map((x) => x.date.slice(0, 4)))];
  return (
    <div className={k("su-card")}>
      <div className={k("su-ch")}>
        <b>{H.holidaysCap}</b>
        <small>{H.holidaysSub}</small>
      </div>
      <div className={`${k("su-sec")} ${d.pad}`}>
        {years.map((y) => (
          <div key={y} className={d.group}>
            <span className={k("cap")}>{y}</span>
            <ul className={`${d.lines} ${d.hgrid}`}>
              {holidays
                .filter((x) => x.date.startsWith(y))
                .map((x) => (
                  <li key={`${x.date}-${x.name}`} className={x.date < today ? d.past : undefined}>
                    <b className={d.mono}>{fmtDay(x.date)}</b> {x.name}
                    {x.provisional ? ` · ${H.moon}` : ""}
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {holidays.length ? (
          <p className={k("su-note")}>
            {fill(H.source, { source: [...new Set(holidays.map((x) => x.source))].join("; ") })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
