"use client";

import type { PlaceHit } from "../_lib/geo";
import type { Location } from "../_lib/model";
import type { MapLayer } from "./entrance-map";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Chip, ChipRow, DeskDialog, Field, k, Seg } from "@/components/clinics-schedule/shared";
import { EMERG } from "@/content/hospital-admin/emergency";
import { setLocationAction } from "../_lib/actions";
import { findPlaces, googleMapsUrl } from "../_lib/geo";
import { coordsText, parseCoords } from "../_lib/model";
import { useOp } from "../../_lib/use-op";
import e from "./emergency.module.css";

// Leaflet needs `window`, and stays out of the page's first load.
const EntranceMap = dynamic(() => import("./entrance-map"), {
  ssr: false,
  loading: () => <div className={e.map} />,
});

const P = EMERG.pin;
type Pin = { lat: number; lng: number } | null;
type Locate = "idle" | "busy" | "refused";
type Find = { state: "idle" | "busy" | "none" | "failed" } | { state: "hits"; hits: PlaceHit[] };

/**
 * Pin the exact location (the prototype's pin dialog, as far as the data goes): the hospital keeps one point,
 * `hospitals.latitude/longitude`, so there is one pin, placed on the emergency entrance. Find the place by name,
 * then click the street map or the satellite view, type coordinates, or ask this device where it is; check it in
 * Google Maps. It is saved through the same one-admin, audited path as the profile's location form.
 */
export function PinDialog({
  location,
  onClose,
  onDone,
}: {
  location: Location;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const op = useOp();
  const start: Pin =
    location.latitude !== null && location.longitude !== null
      ? { lat: location.latitude, lng: location.longitude }
      : null;
  const [pin, setPin] = useState<Pin>(start);
  const [text, setText] = useState(start ? coordsText(start.lat, start.lng) : "");
  const [locate, setLocate] = useState<Locate>("idle");
  const [why, setWhy] = useState("");
  const [layer, setLayer] = useState<MapLayer>("satellite");
  const [q, setQ] = useState("");
  const [find, setFind] = useState<Find>({ state: "idle" });
  const typed = text.trim() ? parseCoords(text) : null;
  const moved = JSON.stringify(pin) !== JSON.stringify(start);
  // The table's CHECK (hospitals_coordinates_range): a point inside Uganda, or none.
  const inside = !pin || (pin.lat >= -2 && pin.lat <= 5 && pin.lng >= 29 && pin.lng <= 36);

  const place = (p: { lat: number; lng: number }) => {
    setPin(p);
    setText(coordsText(p.lat, p.lng));
  };
  const here = () => {
    if (!("geolocation" in navigator)) {
      setLocate("refused");
      return;
    }
    setLocate("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocate("idle");
        place({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocate("refused"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const search = async () => {
    if (q.trim().length < 3 || find.state === "busy") return;
    setFind({ state: "busy" });
    const hits = await findPlaces(q);
    if (hits === null) setFind({ state: "failed" });
    else if (!hits.length) setFind({ state: "none" });
    else if (hits.length === 1) {
      place({ lat: hits[0]!.lat, lng: hits[0]!.lng });
      setFind({ state: "hits", hits });
    } else setFind({ state: "hits", hits });
  };
  const save = () =>
    op.call(
      () =>
        setLocationAction({
          latitude: pin ? Number(pin.lat.toFixed(6)) : null,
          longitude: pin ? Number(pin.lng.toFixed(6)) : null,
          reason: why.trim(),
        }),
      () => onDone(P.saved),
    );

  return (
    <DeskDialog
      open
      onClose={onClose}
      label={P.title}
      tile="nav"
      title={P.title}
      lead={P.lead}
      size="xw"
    >
      <div className={e.pinw}>
        <div className={k("su-sec")}>
          <form
            className={e.find}
            role="search"
            onSubmit={(ev) => {
              ev.preventDefault();
              void search();
            }}
          >
            <input
              className={`${k("in")} ${e.field}`}
              value={q}
              placeholder={P.findPh}
              aria-label={P.find}
              onChange={(ev) => setQ(ev.target.value)}
            />
            <button
              type="submit"
              className={k("btn", "sm")}
              disabled={q.trim().length < 3 || find.state === "busy"}
            >
              {find.state === "busy" ? P.finding : P.findGo}
            </button>
          </form>
          {find.state === "none" ? <p className={k("su-note")}>{P.findNone}</p> : null}
          {find.state === "failed" ? <p className={k("su-note")}>{P.findFailed}</p> : null}
          {find.state === "hits" && find.hits.length > 1 ? (
            <div className={e.hits} role="list" aria-label={P.find}>
              <p className={k("su-note")}>{P.findPick}</p>
              {find.hits.map((h) => (
                <button
                  key={`${h.lat},${h.lng}`}
                  type="button"
                  role="listitem"
                  className={e.hit}
                  onClick={() => place({ lat: h.lat, lng: h.lng })}
                >
                  {h.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className={e.mapBar}>
            <Seg
              opts={[
                ["satellite", P.layers.satellite],
                ["map", P.layers.map],
              ]}
              value={layer}
              onPick={setLayer}
              label={P.layerLabel}
            />
            {pin ? (
              <a
                className={k("btn", "sm", "q")}
                href={googleMapsUrl(pin.lat, pin.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {P.google}
              </a>
            ) : null}
          </div>
          <EntranceMap pin={pin} onPick={place} label={P.map} layer={layer} />
          <p className={k("su-note")}>{P.hint}</p>
        </div>
        <div className={k("su-sec")}>
          <Field as="label" label={P.coords}>
            <input
              className={`${k("in")} ${e.field}`}
              inputMode="decimal"
              placeholder={P.coordsPh}
              value={text}
              onChange={(ev) => {
                setText(ev.target.value);
                const p = parseCoords(ev.target.value);
                if (p) setPin(p);
              }}
            />
          </Field>
          <p className={k("su-note")}>
            {!inside
              ? P.coordsBad
              : !text.trim()
                ? pin
                  ? P.coordsHint
                  : P.cleared
                : typed
                  ? P.coordsOk
                  : P.coordsBad}
          </p>
          <div className={e.acts}>
            <button
              type="button"
              className={k("btn", "sm")}
              disabled={locate === "busy"}
              onClick={here}
            >
              {locate === "busy" ? P.hereBusy : P.here}
            </button>
            {pin ? (
              <button
                type="button"
                className={k("btn", "sm", "q")}
                onClick={() => {
                  setPin(null);
                  setText("");
                }}
              >
                {P.clear}
              </button>
            ) : null}
          </div>
          {locate === "refused" ? <p className={k("su-note")}>{P.hereNo}</p> : null}
          <span className={k("cap")}>{P.why}</span>
          <ChipRow label={P.why}>
            {EMERG.change.reasons.map((r) => (
              <Chip key={r} on={why === r} onClick={() => setWhy(r)}>
                {r}
              </Chip>
            ))}
          </ChipRow>
          <input
            className={`${k("in")} ${e.field}`}
            value={why}
            maxLength={500}
            placeholder={P.whyPh}
            aria-label={P.why}
            onChange={(ev) => setWhy(ev.target.value)}
          />
          <p className={k("su-note")}>{P.rule}</p>
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
          disabled={op.busy || !moved || !inside || why.trim().length < 8}
          onClick={save}
        >
          {moved ? P.save : P.nothing}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {P.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
