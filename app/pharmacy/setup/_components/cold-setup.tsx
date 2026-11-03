"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { RC } from "@/content/pharmacy-rework-records";
import { addFridgeAction, setEpiClinicAction, setEpiVaccineAction } from "../actions";
import { Chips } from "./chips";

const C = RC.setup.places.cold;
type Place = { id: string; name: string };
const field =
  "bg-card rounded-tide-field h-11 max-w-md px-3 text-[14px] shadow-[inset_0_0_0_1px_var(--color-ink-300)]";
const names = (places: Place[]) => Object.fromEntries(places.map((p) => [p.id, p.name]));

/** One dialog shell: title, body, error and Save. */
function SetupDialog({
  label,
  title,
  save,
  ready,
  after,
  onClosed,
  children,
}: {
  label: string;
  title: string;
  save: () => Promise<{ ok: boolean; error?: string }>;
  ready: boolean;
  /** Shown once saved, instead of closing (the sensor key). */
  after?: ReactNode;
  onClosed?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = (o: boolean) => {
    if (pending) return;
    setOpen(o);
    if (!o) {
      setDone(false);
      onClosed?.();
    }
  };
  return (
    <>
      <LabButton variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </LabButton>
      <EditorDialog open={open} onOpenChange={close} width="medium">
        <div className="px-6 pt-5">
          <DialogTitle>{title}</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          {done ? after : children}
          {error ? (
            <p role="alert" className="text-body-s text-ink-900 font-semibold">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end px-6 pb-5">
          {done ? (
            <LabButton onClick={() => close(false)}>{C.done}</LabButton>
          ) : (
            <LabButton
              busy={pending}
              onClick={() =>
                ready &&
                start(async () => {
                  setError(null);
                  const r = await save();
                  if (!r.ok) return setError(r.error ?? null);
                  router.refresh();
                  if (after) setDone(true);
                  else close(false);
                })
              }
            >
              {C.save}
            </LabButton>
          )}
        </div>
      </EditorDialog>
    </>
  );
}

/** A fridge: place, code and name; the sensor key is generated here and shown once after saving. */
export function AddFridgeDialog({ places }: { places: Place[] }) {
  const fresh = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [sensorKey, setSensorKey] = useState(fresh);
  const [place, setPlace] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [sensor, setSensor] = useState<string | null>("no");
  return (
    <SetupDialog
      label={C.addFridge}
      title={C.addFridgeTitle}
      ready={!!place && !!code.trim() && name.trim().length >= 2}
      after={
        sensor === "yes" ? (
          <div className="flex flex-col gap-2">
            <p className="text-body-s">{C.sensorKey}</p>
            <code className="bg-tide-sunken rounded-tide-field p-3 text-[13px] break-all select-all">
              {sensorKey}
            </code>
          </div>
        ) : undefined
      }
      onClosed={() => {
        setKey(crypto.randomUUID());
        setSensorKey(fresh());
        setCode("");
        setName("");
        setModel("");
      }}
      save={() =>
        addFridgeAction({
          clientKey: key,
          locationId: place,
          code,
          name,
          model: model || null,
          sensorKey: sensor === "yes" ? sensorKey : null,
        })
      }
    >
      <>
        <Chips
          label={C.place}
          keys={places.map((p) => p.id)}
          words={names(places)}
          value={place}
          set={setPlace}
        />
        <label className="flex flex-col gap-2">
          <span className="text-body-s font-semibold">{C.code}</span>
          <input
            value={code}
            maxLength={20}
            onChange={(e) => setCode(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-body-s font-semibold">{C.name}</span>
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-body-s font-semibold">{C.model}</span>
          <input
            value={model}
            maxLength={120}
            onChange={(e) => setModel(e.target.value)}
            className={field}
          />
        </label>
        <Chips
          label={C.sensor}
          keys={["no", "yes"]}
          words={{ no: C.sensorNone, yes: C.sensorYes }}
          value={sensor}
          set={setSensor}
        />
      </>
    </SetupDialog>
  );
}

export function EpiClinicDialog({ places, current }: { places: Place[]; current: string | null }) {
  const [place, setPlace] = useState<string | null>(current);
  return (
    <SetupDialog
      label={C.setClinic}
      title={C.setClinicTitle}
      ready={!!place}
      save={() => setEpiClinicAction({ locationId: place })}
    >
      <Chips
        label={C.place}
        keys={places.map((p) => p.id)}
        words={names(places)}
        value={place}
        set={setPlace}
      />
    </SetupDialog>
  );
}

const VIALS = ["1", "2", "5", "10", "20"];

export function EpiVaccineDialog({ products }: { products: Place[] }) {
  const [vaccine, setVaccine] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [doses, setDoses] = useState<string | null>("10");
  const [max, setMax] = useState("");
  return (
    <SetupDialog
      label={C.setVaccine}
      title={C.setVaccineTitle}
      ready={!!vaccine && !!product}
      save={() =>
        setEpiVaccineAction({
          vaccine,
          productId: product,
          dosesPerVial: Number(doses),
          maxLevel: max ? Number(max) : null,
        })
      }
    >
      <>
        <Chips
          label={C.vaccine}
          keys={Object.keys(VACCINE_NAMES)}
          words={VACCINE_NAMES}
          value={vaccine}
          set={setVaccine}
        />
        <label className="flex flex-col gap-2">
          <span className="text-body-s font-semibold">{C.product}</span>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className={field}>
            <option value="">{C.product}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Chips
          label={C.dosesPerVial}
          keys={VIALS}
          words={Object.fromEntries(VIALS.map((v) => [v, v]))}
          value={doses}
          set={setDoses}
        />
        <label className="flex flex-col gap-2">
          <span className="text-body-s font-semibold">{C.maxLevel}</span>
          <input
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
            className={field}
          />
        </label>
      </>
    </SetupDialog>
  );
}
