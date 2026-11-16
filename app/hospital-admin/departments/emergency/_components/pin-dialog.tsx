"use client";

import type { Location } from "../_lib/model";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Chip, ChipRow, DeskDialog, Field, k } from "@/components/clinics-schedule/shared";
import { EMERG } from "@/content/hospital-admin/emergency";
import { setLocationAction } from "../_lib/actions";
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

/**
 * Pin the exact location (the prototype's pin dialog, as far as the data goes): the hospital keeps one point,
 * `hospitals.latitude/longitude`, so there is one pin, placed on the emergency entrance by clicking a live street
 * map, typing coordinates, or asking this device where it is. It is saved through the same one-admin, audited path
 * as the profile's location form.
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
      cls={k("su-m")}
    >
      <div className={e.pinw}>
        <div className={k("su-sec")}>
          <EntranceMap pin={pin} onPick={place} label={P.map} />
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
