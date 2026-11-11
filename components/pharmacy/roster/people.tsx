"use client";

import type { SectionProps } from "./roster-tab";
import type { Tone } from "./swaps";
import type { Cadre, LicState } from "@/lib/pharmacy/derive/roster";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import { useState } from "react";

import { DateField, PickField } from "@/app/lab/_components/v2/fields";
import {
  addPersonAction,
  recordLicenceAction,
  updateMyPhotoAction,
} from "@/app/pharmacy/setup/roster-actions";
import { PhotoForm } from "@/components/forms";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { linkBtn, pillBtn } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { DialogTitle } from "@/components/ui/dialog";
import { CADRE } from "@/content/pharmacy-roster";
import { RS } from "@/content/pharmacy-roster-sections";
import { addDays, canWitness, isPharmacyPlace, licState } from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Chip, FormDialog, inputCls, labelCls, NeedsDb, useAct } from "./swaps";

type Person = RosterView["people"][number];
const LIC_TONE: Record<Exclude<LicState, "na">, Tone> = {
  ok: "green",
  soon: "amber",
  expired: "red",
  missing: "red",
};
const ADD_CADRES: readonly Cadre[] = ["pharmacist", "technician", "dispenser", "store_keeper"];

/** §15 People and §10 licences. */
export function PeopleList({ view, toast }: SectionProps) {
  const P = RS.people;
  const [renew, setRenew] = useState<{ userId: string; on: string; number: string } | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, run] = useAct(toast);
  if (!view.ready) return <NeedsDb title={P.title} />;

  const today = view.now.date;
  const placeName = (id: string) => view.places.find((p) => p.id === id)?.name ?? "";

  const saveRenew = (p: Person) => {
    if (!renew) return;
    if (!renew.on || renew.on <= today) return toast(P.renewErr);
    const number = p.licence?.number ?? renew.number.trim();
    if (number.length < 2) return toast(P.numberErr);
    const on = renew.on;
    void run(
      () =>
        recordLicenceAction({
          userId: p.userId,
          body: p.licence?.body ?? (p.cadre === "pharmacist" ? "PSU" : "AHPC"),
          number,
          expiresOn: on,
        }),
      () => {
        setRenew(null);
        return P.renewed(p.name, on);
      },
    );
  };

  return (
    <Panel
      title={
        <>
          {P.title}
          <span className="text-muted-foreground font-normal">{P.count(view.people.length)}</span>
        </>
      }
      note={P.sub}
      action={
        view.inCharge ? (
          <LabButton variant="primary" onClick={() => setAddOpen(true)}>
            {P.add}
          </LabButton>
        ) : null
      }
    >
      <ul className="divide-border flex flex-col divide-y">
        {view.people.map((p) => {
          const ls = licState(p, today, view.params);
          const isMe = p.userId === view.viewerId;
          const rn = renew?.userId === p.userId ? renew : null;
          return (
            <li
              key={p.userId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar person={p} size={36} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-m font-semibold">{p.name}</span>
                  <span className="text-muted-foreground text-[13px] leading-[17px]">
                    {CADRE[p.cadre]} · {p.places.map(placeName).filter(Boolean).join(", ")}
                  </span>
                  {ls !== "na" && !rn ? (
                    <span className="text-ink-700 flex flex-wrap items-center gap-1.5 text-[12px]">
                      {p.licence
                        ? P.licLine(
                            p.licence.body,
                            p.licence.number,
                            ls === "expired",
                            p.licence.expiresOn,
                          )
                        : P.licMissing}
                      <Chip small tone={LIC_TONE[ls]}>
                        {P.lic[ls]}
                      </Chip>
                      {view.inCharge && ls !== "ok" ? (
                        <button
                          type="button"
                          className={cn(linkBtn, "min-h-6 text-[12px] underline")}
                          onClick={() => setRenew({ userId: p.userId, on: "", number: "" })}
                        >
                          {P.renew}
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                  {rn ? (
                    <div
                      className="mt-1 flex flex-wrap items-end gap-1.5"
                      onKeyDown={(e) => e.key === "Escape" && setRenew(null)}
                    >
                      {!p.licence ? (
                        <label className="flex flex-col gap-1">
                          <span className={labelCls}>{P.number}</span>
                          <input
                            value={rn.number}
                            maxLength={40}
                            autoFocus
                            onChange={(e) => setRenew({ ...rn, number: e.target.value })}
                            className={cn(inputCls, "w-40")}
                          />
                        </label>
                      ) : null}
                      <DateField
                        label={P.newExpiry}
                        value={rn.on}
                        min={addDays(today, 1)}
                        allowFuture
                        onChange={(v) => setRenew({ ...rn, on: v })}
                      />
                      <LabButton
                        size="sm"
                        variant="primary"
                        busy={pending}
                        onClick={() => saveRenew(p)}
                      >
                        {RS.save}
                      </LabButton>
                      <LabButton size="sm" onClick={() => setRenew(null)}>
                        {RS.cancel}
                      </LabButton>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-ink-700 text-[13px]">
                  {canWitness(p.cadre) ? P.canWitness : P.cannotWitness}
                </span>
                {isMe ? (
                  <LabButton size="sm" onClick={() => setPhotoOpen(true)}>
                    {p.photo ? P.changePhoto : P.addPhoto}
                  </LabButton>
                ) : !p.photo ? (
                  <span className="text-ink-500 text-[12px]">{P.noPhoto}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {photoOpen ? (
        <PhotoDialog
          me={view.people.find((p) => p.userId === view.viewerId)!}
          onClose={() => setPhotoOpen(false)}
        />
      ) : null}
      {addOpen ? <AddPerson view={view} toast={toast} onClose={() => setAddOpen(false)} /> : null}
    </Panel>
  );
}

/** Only the person themselves: the server writes the session user's own photo. */
function PhotoDialog({ me, onClose }: { me: Person; onClose: () => void }) {
  const P = RS.people;
  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex items-start justify-between gap-3 px-6 pt-5">
        <DialogTitle>{me.photo ? P.changePhoto : P.addPhoto}</DialogTitle>
        <LabButton variant="text" onClick={onClose}>
          {P.close}
        </LabButton>
      </div>
      <div className="px-6 py-4">
        <PhotoForm action={updateMyPhotoAction} currentUrl={me.photo} personName={me.name} />
      </div>
    </EditorDialog>
  );
}

function AddPerson({ view, toast, onClose }: SectionProps & { onClose: () => void }) {
  const F = RS.people.form;
  // The integrator passes the hospital's staff not yet on the roster (they sign in with their own account).
  const staff = (view as RosterView & { staff?: { userId: string; name: string }[] }).staff ?? [];
  const [f, setF] = useState({
    userId: "",
    cadre: "pharmacist" as Cadre,
    places: [] as string[],
    error: "",
  });
  const [pending, run] = useAct(toast);
  const upd = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, error: "" }));
  const picked = staff.find((s) => s.userId === f.userId);
  const send = () => {
    if (!picked) return setF((x) => ({ ...x, error: F.err.who }));
    if (!f.places.length) return setF((x) => ({ ...x, error: F.err.places }));
    void run(
      () => addPersonAction({ userId: picked.userId, cadre: f.cadre, places: f.places }),
      () => {
        onClose();
        return null;
      },
    );
  };
  return (
    <FormDialog
      open
      onClose={onClose}
      title={F.title}
      error={f.error}
      submit={F.save}
      onSubmit={send}
      pending={pending}
    >
      <div className="flex items-center gap-3.5">
        <Avatar person={{ name: picked?.name ?? "?" }} size={44} />
        <span className="flex flex-col gap-1">
          <span className={labelCls}>{F.picture}</span>
          <span className="text-muted-foreground text-[12px] leading-4">{F.pictureNote}</span>
        </span>
      </div>
      {staff.length ? (
        <PickField
          label={F.who}
          forceList
          options={staff.map((s) => ({ value: s.userId, label: s.name }))}
          value={f.userId}
          onChange={(v) => upd({ userId: v })}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{F.who}</span>
          <p className="text-body-s text-muted-foreground">{F.noStaff}</p>
        </div>
      )}
      <PickField
        label={F.cadre}
        options={ADD_CADRES.map((c) => ({ value: c, label: CADRE[c] }))}
        value={f.cadre}
        onChange={(v) => upd({ cadre: v as Cadre })}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className={cn(labelCls, "mb-1.5")}>{F.worksAt}</legend>
        <span className="flex flex-wrap gap-1.5">
          {view.places.filter(isPharmacyPlace).map((p) => {
            const on = f.places.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  upd({ places: on ? f.places.filter((x) => x !== p.id) : [...f.places, p.id] })
                }
                className={cn(pillBtn(on), "focus-visible:shadow-focus h-9 outline-none")}
              >
                {p.name}
              </button>
            );
          })}
        </span>
      </fieldset>
    </FormDialog>
  );
}
