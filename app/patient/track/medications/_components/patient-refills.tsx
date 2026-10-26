"use client";

import type { PatientRefills } from "@/lib/pharmacy/refill-read";
import { useId, useState } from "react";

import { ReviewDialog, SELECT, TARGET, TEXTAREA } from "@/app/pharmacy/_components/review-dialogs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NETWORK_UI } from "@/content/pharmacy-network";
import { askForNextSupply } from "../refill-actions";

const P = NETWORK_UI.refills.patient;
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

/** 5.4: each repeat medicine in one sentence, and the one ask it allows now. */
export function PatientRefillsSection({ data }: { data: PatientRefills }) {
  if (!data.repeats.length) return null;
  return (
    <section aria-labelledby="meds-repeats" className="flex flex-col gap-3">
      <h2 id="meds-repeats" className="text-foreground text-heading-s">
        {P.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {data.repeats.map((r) => (
          <li
            key={r.prescriptionId}
            className="bg-card dark:shadow-card flex flex-col gap-2 rounded-xl p-4 shadow-xs"
          >
            <h3 className="text-foreground text-body">{r.medicine}</h3>
            <p className="text-body-s text-foreground">{r.words}</p>
            {r.allowed ? <p className="text-body-s text-muted-foreground">{r.allowed}</p> : null}
            {r.request ? <p className="text-body-s text-muted-foreground">{r.request}</p> : null}
            {r.canAsk || r.canAskClinic ? (
              <Ask
                lineId={r.prescriptionId}
                medicine={r.medicine}
                clinic={!r.canAsk}
                points={data.points[r.hospitalId] ?? []}
                collectors={data.collectors}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ask({
  lineId,
  medicine,
  clinic,
  points,
  collectors,
}: {
  lineId: string;
  medicine: string;
  clinic: boolean;
  points: PatientRefills["points"][string];
  collectors: PatientRefills["collectors"];
}) {
  const id = useId();
  const [who, setWho] = useState("self");
  const label = clinic ? P.askClinic : P.ask;
  return (
    <ReviewDialog
      label={label}
      title={`${label}: ${medicine}`}
      submit={P.send}
      variant={clinic ? "secondary" : "primary"}
      onSave={async (clientKey, d) => {
        const collector =
          who === "self"
            ? { kind: "self" }
            : who === "new"
              ? { kind: "new", name: str(d, "name"), relationship: str(d, "relationship") }
              : { kind: "named", collectorId: who };
        const r = await askForNextSupply({
          clientKey,
          lineIds: [lineId],
          note: str(d, "note"),
          collector,
          pointId: str(d, "point"),
        });
        return r.ok
          ? { ok: true as const, id: clientKey, serverTime: new Date().toISOString() }
          : { ok: false as const, code: "conflict" as const, error: r.error ?? "" };
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-p`}>{P.where}</Label>
        <select id={`${id}-p`} name="point" required className={SELECT}>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-w`}>{P.who}</Label>
        <select
          id={`${id}-w`}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className={SELECT}
        >
          <option value="self">{P.me}</option>
          {collectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.relationship})
            </option>
          ))}
          <option value="new">{P.someone}</option>
        </select>
      </div>
      {who === "new" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-n`}>{P.name}</Label>
            <Input id={`${id}-n`} name="name" required minLength={2} className={TARGET} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-r`}>{P.relationship}</Label>
            <Input id={`${id}-r`} name="relationship" required minLength={2} className={TARGET} />
          </div>
          <p className="text-body-s text-muted-foreground">{P.save}.</p>
        </>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>{P.note}</Label>
        <textarea
          id={`${id}-note`}
          name="note"
          maxLength={500}
          placeholder={P.notePlaceholder}
          className={TEXTAREA}
        />
      </div>
    </ReviewDialog>
  );
}
