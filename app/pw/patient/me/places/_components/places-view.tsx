"use client";

import type { Place, PlaceKind } from "@patient-core/me-places";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import {
  ADDRESS_MAX,
  kindWords,
  LABEL_MAX,
  labelProblem,
  PLACE_CONSENT,
  PLACE_KINDS,
  placeLabel,
} from "@patient-core/me-places";
import { CheckIcon, HomeIcon, LocateFixedIcon, MapPinIcon, PlusIcon } from "lucide-react";

import { Chip, ChipRow, Dialog, TextField } from "@/components/tide/controls";
import { Button, EmptyState, ICON, Note, Pill } from "@/components/tide/kit";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import {
  addPlaceAction,
  deletePlaceAction,
  setHomeAction,
  updatePlaceAction,
} from "@/lib/patient-web/me-actions";

/** The fixed pin: navy with a teal mark, never red (it is a place, not an alarm). */
function Pin({ home }: { home: boolean }) {
  const Icon = home ? HomeIcon : MapPinIcon;
  return (
    <span className="bg-pw-band text-pw-accent grid size-11 shrink-0 place-items-center rounded-full">
      <Icon className="size-5" {...ICON} />
    </span>
  );
}

export function PlacesView({ places }: { places: Place[] }) {
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const hasHome = places.some((p) => p.isHome);

  const makeHome = (id: string) =>
    start(async () => {
      setBusyId(id);
      setProblem(null);
      const r = await setHomeAction(id).catch(() => ({ ok: false as const, error: W.offline }));
      setBusyId(null);
      if (!r.ok) setProblem(r.error);
    });

  return (
    <>
      {!places.length ? <EmptyState title={C.placesEmpty} /> : null}
      <ul className="flex flex-col gap-3">
        {places.map((pl) => {
          const label = placeLabel(pl);
          return (
            <li
              key={pl.id}
              className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-1 p-4"
            >
              <button
                type="button"
                onClick={() => setEditing(pl)}
                aria-label={`${label}${pl.isHome ? ", your home" : ""}. ${pl.address ?? C.noAddress}. Edit`}
                className="rounded-pw-row hover:bg-pw-surface-2 focus-visible:outline-pw-focus -m-1 flex items-center gap-3 p-1 text-left focus-visible:outline-2"
              >
                <Pin home={pl.kind === "home"} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[17px] leading-[22px] font-semibold">{label}</span>
                  <span className="text-pw-ink-2 text-[15px] font-medium">
                    {pl.address ?? C.noAddress}
                  </span>
                </span>
                {pl.isHome ? <Pill>{C.home}</Pill> : null}
              </button>
              {!pl.isHome ? (
                <button
                  type="button"
                  onClick={() => makeHome(pl.id)}
                  aria-busy={busyId === pl.id || undefined}
                  className="text-pw-accent-text focus-visible:outline-pw-focus inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
                >
                  {busyId === pl.id ? C.saving : C.makeHome}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {problem ? <Note>{problem}</Note> : null}
      <Button onClick={() => setEditing("new")} className="self-start">
        <PlusIcon className="size-5" {...ICON} />
        {C.addPlace}
      </Button>
      {editing ? (
        <PlaceDialog
          key={editing === "new" ? "new" : editing.id}
          place={editing === "new" ? null : editing}
          makeHome={editing === "new" && !hasHome}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

// Leaflet needs `window`, and stays out of the page's first load.
const PinMap = dynamic(() => import("./pin-map"), {
  ssr: false,
  loading: () => <div className="rounded-pw-row bg-pw-surface-2 h-64 w-full" />,
});

type Locate = "idle" | "busy" | "set" | "moved" | "refused" | "none";

/**
 * Add a place or edit one: the label (Home, Work, or the patient's own word), the pin from "Use my location"
 * (pressed, never on open), the address, and delete after an in-dialog confirm. A new place saves only with
 * PLACE_CONSENT ticked.
 */
function PlaceDialog({
  place,
  makeHome,
  onClose,
}: {
  place: Place | null;
  makeHome: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? "home");
  const [custom, setCustom] = useState(place?.customLabel ?? "");
  const [pin, setPin] = useState(place ? { lat: place.lat, lng: place.lng } : null);
  const [locate, setLocate] = useState<Locate>("idle");
  const [address, setAddress] = useState(place?.address ?? "");
  const [consent, setConsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const labelError = labelProblem(kind, custom);
  const reason = !pin
    ? C.needPin
    : (labelError ?? (place === null && !consent ? C.needConsent : undefined));

  const pickOnMap = (p: { lat: number; lng: number }) => {
    setPin(p);
    setLocate("moved");
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setLocate("none");
    setLocate("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocate("set");
      },
      () => setLocate("refused"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setProblem(null);
      const r = await fn().catch(() => ({ ok: false as const, error: W.offline }));
      if (r.ok) onClose();
      else setProblem(r.error);
    });

  const save = () => {
    if (!pin || reason) return;
    const input = { kind, customLabel: custom, lat: pin.lat, lng: pin.lng, address };
    // The first home saved becomes the home clinics are suggested from.
    run(() =>
      place
        ? updatePlaceAction(place.id, input)
        : addPlaceAction(input, makeHome && kind === "home", consent),
    );
  };

  const pinLine =
    locate === "busy"
      ? C.locating
      : locate === "refused"
        ? C.locationRefused
        : locate === "none"
          ? C.locationNone
          : locate === "set"
            ? C.pinSet
            : locate === "moved"
              ? C.pinMoved
              : pin
                ? C.pinWords
                : C.noPin;

  return (
    <Dialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      title={place ? placeLabel(place) : C.addPlace}
      footer={
        <Button busy={busy && !confirmDelete} disabledReason={reason} onClick={save}>
          {place ? C.saveChanges : C.saveThisPlace}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-base leading-5 font-semibold">{C.label}</span>
          <ChipRow label={C.label}>
            {PLACE_KINDS.map((k) => (
              <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
                {kindWords(k)}
              </Chip>
            ))}
          </ChipRow>
        </div>
        {kind === "other" ? (
          <TextField
            label={C.nameThis}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={C.nameHint}
            maxLength={LABEL_MAX}
            error={custom ? (labelError ?? undefined) : undefined}
          />
        ) : null}
        <div className="flex flex-col gap-2">
          <span className="text-base leading-5 font-semibold">{C.whereItIs}</span>
          <div className="rounded-pw-row bg-pw-surface-2 flex flex-wrap items-center gap-3 p-3">
            <Pin home={kind === "home"} />
            <p
              role="status"
              className="text-pw-ink-2 min-w-0 flex-[1_1_180px] text-[15px] font-medium"
            >
              {locate === "set" ? (
                <CheckIcon className="text-pw-accent-text mr-1 inline size-4" {...ICON} />
              ) : null}
              {pinLine}
            </p>
            <Button tone="soft" size="m" busy={locate === "busy"} onClick={useMyLocation}>
              <LocateFixedIcon className="size-5" {...ICON} />
              {C.useLocation}
            </Button>
          </div>
          <PinMap pin={pin} onPick={pickOnMap} label={C.mapLabel} />
          <p className="text-pw-ink-2 text-[13px] leading-[18px] font-medium">{C.mapHint}</p>
        </div>
        <TextField
          label={C.address}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={C.addressHint}
          maxLength={ADDRESS_MAX}
        />
        {place ? null : (
          <label className="rounded-pw-row bg-pw-surface-2 flex cursor-pointer items-start gap-3 p-4">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="accent-pw-act mt-0.5 size-6 shrink-0"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{PLACE_CONSENT.title}</span>
              <span className="text-pw-ink-2 text-[15px] leading-[21px]">
                {PLACE_CONSENT.words}
              </span>
            </span>
          </label>
        )}
        {problem ? <Note>{problem}</Note> : null}
        {place && !confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-pw-accent-text focus-visible:outline-pw-focus inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
          >
            {C.deletePlace}
          </button>
        ) : null}
        {place && confirmDelete ? (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold">{C.deleteConfirm(placeLabel(place))}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="m" busy={busy} onClick={() => run(() => deletePlaceAction(place.id))}>
                {C.delete}
              </Button>
              <Button size="m" tone="outline" onClick={() => setConfirmDelete(false)}>
                {C.keepIt}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
