"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClockIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB4 } from "@/content/lab-phase-4";
import { readiness } from "@/lib/lab/manifest";
import {
  addToManifestAction,
  createAliquotAction,
  recordHandoverAction,
  recordManifestReceiptAction,
  recordOutbreakReferralAction,
  sealManifestAction,
} from "@/lib/lab/referral-actions";
import { cn } from "@/lib/utils";
import { inputClass, newKey, Pop, selectClass } from "../../_components/pop";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* The To refer send panel (Lab Phase 4 §5.1, artboard 1; RF-1, RF-2, RF-6, RF-7). Every check shown here is
   made again on the server; the panel only says, in words, what is still missing. */

export interface ReferRow {
  orderId: string;
  specimenId: string | null;
  labNumber: string | null;
  specimen: string | null;
  patientName: string;
  patientMrn: string;
  test: string;
  testCode: string | null;
  restricted: boolean;
  highRisk: boolean;
  why: "not_done_here" | "analyser_down";
  whyWords: string;
  waitingSince: Date;
  referredTo: string[];
}
export interface SendPartner {
  id: string;
  name: string;
  kind: string;
  transport: { code: string; words: string }[];
  /** Signed legal record and field list (PT-5): without them nothing can be sent there. */
  ready: boolean;
  tests: Record<
    string,
    { theirCode: string; category: string; requiredIds: { key: string; words: string }[] }
  >;
  packing: Record<string, { key: string; words: string }[]>;
}
export interface OpenManifest {
  id: string;
  number: string;
  state: string;
  partner: string;
  transport: string;
}

type Segment = "all" | "not_done_here" | "analyser_down" | "high_risk";
const waited = (from: Date) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60_000));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

export function SendPanel({
  rows,
  partners,
  manifests,
  canRefer,
}: {
  rows: ReferRow[];
  partners: SendPartner[];
  manifests: OpenManifest[];
  canRefer: boolean;
}) {
  const [segment, setSegment] = useState<Segment>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const counts: Record<Segment, number> = {
    all: rows.length,
    not_done_here: rows.filter((r) => r.why === "not_done_here").length,
    analyser_down: rows.filter((r) => r.why === "analyser_down").length,
    high_risk: rows.filter((r) => r.highRisk).length,
  };
  const shown = rows.filter((r) =>
    segment === "all" ? true : segment === "high_risk" ? r.highRisk : r.why === segment,
  );
  const selected = rows.filter((r) => r.specimenId && picked.includes(r.specimenId));
  const highRisk = rows.filter((r) => r.highRisk);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const SEG: Record<Segment, string> = {
    all: "All",
    not_done_here: "Not done here",
    analyser_down: "Analyser down",
    high_risk: "High risk",
  };
  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Filter"
        className="border-border bg-muted flex w-fit flex-wrap gap-1 rounded-md border p-1"
      >
        {(Object.keys(SEG) as Segment[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={segment === s}
            onClick={() => setSegment(s)}
            className={cn(
              "text-body-s min-h-11 rounded-sm px-3 sm:min-h-8",
              segment === s ? "bg-card shadow-card font-medium" : "text-muted-foreground",
            )}
          >
            {SEG[s]} <span className="font-mono tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="border-border bg-card overflow-auto rounded-lg border">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Specimens to refer</caption>
              <thead>
                <tr className="bg-muted">
                  {[
                    "",
                    "Specimen",
                    "Patient",
                    "Test",
                    "Why referred",
                    "Waiting",
                    "Already sent to",
                  ].map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium whitespace-nowrap"
                    >
                      {h || <span className="sr-only">Select</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.orderId} className="border-ink-150 border-b last:border-b-0">
                    <td className="px-3 py-2">
                      {r.specimenId && !r.highRisk && canRefer ? (
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={picked.includes(r.specimenId)}
                          onChange={() => toggle(r.specimenId!)}
                          aria-label={`Select ${r.labNumber ?? "specimen"}`}
                        />
                      ) : null}
                    </td>
                    <td className="text-body-s px-3 py-2">
                      <span className="font-mono">{r.labNumber ?? "No lab number"}</span>
                      <br />
                      <span className="text-muted-foreground text-caption">{r.specimen}</span>
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {r.patientName}
                      <br />
                      <span className="text-muted-foreground text-caption font-mono">
                        {r.patientMrn}
                      </span>
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {r.test}{" "}
                      {r.restricted ? (
                        <span className="text-caption text-muted-foreground">Restricted</span>
                      ) : null}
                      {r.highRisk ? (
                        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                          High risk
                        </StatusWord>
                      ) : null}
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {r.why === "analyser_down" ? (
                        <StatusWord tone="caution" glyph={ClockIcon}>
                          {r.whyWords}
                        </StatusWord>
                      ) : (
                        r.whyWords
                      )}
                    </td>
                    <td className="text-body-s px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                      {waited(r.waitingSince)}
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {r.referredTo.length ? r.referredTo.join(", ") : "—"}
                      {r.referredTo.length && r.specimenId && canRefer ? (
                        <AliquotButton specimenId={r.specimenId} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {highRisk.map((r) => (
            <div
              key={r.orderId}
              role="note"
              className="bg-status-caution-bg border-status-caution-fg/40 text-body-s flex flex-col gap-2 rounded-md border p-3"
            >
              <p className="text-status-caution-fg-aa font-semibold">
                <TriangleAlertIcon aria-hidden className="mr-1 inline size-4" />
                {fill(LAB4.highRiskReferral, { labNo: r.labNumber ?? "This specimen" })}
              </p>
              {canRefer && r.specimenId ? (
                <OutbreakDialog
                  specimenId={r.specimenId}
                  labNumber={r.labNumber}
                  partners={partners.filter((p) => p.kind === "outbreak")}
                />
              ) : null}
            </div>
          ))}
          <Manifests manifests={manifests} canRefer={canRefer} />
        </div>
        {canRefer ? (
          <Send selected={selected} partners={partners.filter((p) => p.kind !== "outbreak")} />
        ) : null}
      </div>
    </div>
  );
}

function Send({ selected, partners }: { selected: ReferRow[]; partners: SendPartner[] }) {
  const { pending, message, act } = useAct();
  const [partnerId, setPartnerId] = useState("");
  const [transport, setTransport] = useState("");
  const [ids, setIds] = useState<Record<string, Record<string, string>>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [consent, setConsent] = useState("");
  const partner = partners.find((p) => p.id === partnerId);
  const tests = selected.map((r) => ({ r, map: partner?.tests[r.testCode ?? ""] }));
  const categories = [
    ...new Set(tests.map((t) => t.map?.category).filter((c): c is string => !!c)),
  ];
  const items = categories.flatMap((c) => partner?.packing[c] ?? []);
  const unmapped = tests.filter((t) => !t.map).map((t) => t.r.test);
  const perRow = tests.map((t) =>
    readiness({
      requiredIds: t.map?.requiredIds.map((x) => x.key) ?? [],
      scanned: ids[t.r.specimenId!] ?? {},
      packingItems: items.map((i) => i.key),
      ticked,
      unmappedTests: t.map ? [] : [t.r.test],
    }),
  );
  const missingIds = perRow.reduce((n, r) => n + r.missingIds, 0);
  const missingItems =
    perRow[0]?.missingItems ?? items.filter((i) => !ticked.includes(i.key)).length;
  const abroad = partner?.kind === "abroad";
  const ready =
    !!partner &&
    partner.ready &&
    !!transport &&
    selected.length > 0 &&
    unmapped.length === 0 &&
    missingIds === 0 &&
    missingItems === 0 &&
    (!abroad || consent.trim().length >= 3);
  const reason = !partner
    ? "Choose a destination."
    : !partner.ready
      ? "The data protection lead has not signed this partner's legal record and field list."
      : unmapped.length
        ? fill(LAB4.mapBeforeSending, { Test: unmapped[0]!, partner: partner.name })
        : !transport
          ? "Choose how it travels."
          : missingIds || missingItems
            ? fill(LAB4.addToManifestDisabled, { n: missingIds, m: missingItems })
            : abroad && consent.trim().length < 3
              ? fill(LAB4.crossBorderRefused, { Partner: partner.name })
              : null;
  const key = useMemo(() => newKey(), [selected.length, partnerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = () =>
    act(async () => {
      const r = await addToManifestAction({
        partnerId,
        transport: partner!.transport.find((t) => t.code === transport)?.words ?? transport,
        items: selected.map((s) => ({
          specimenId: s.specimenId!,
          externalIds: ids[s.specimenId!] ?? {},
          packing: ticked,
          consentRef: abroad ? consent.trim() : null,
        })),
        clientKey: key,
      });
      if (r.ok) {
        setIds({});
        setTicked([]);
      }
      return r;
    }, "Added to the manifest.");
  return (
    <aside className="border-border bg-card flex h-fit flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-heading-s">
        Send {selected.length} {selected.length === 1 ? "specimen" : "specimens"}
      </h2>
      {selected.length === 0 ? (
        <p className="text-body-s text-muted-foreground">
          Select specimens in the list to send them.
        </p>
      ) : null}
      <Field label="Destination">
        <select
          value={partnerId}
          onChange={(e) => (setPartnerId(e.target.value), setTransport(""), setTicked([]))}
          className={selectClass}
        >
          <option value="">Choose</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.ready ? "" : " (not signed yet)"}
            </option>
          ))}
        </select>
      </Field>
      {partner ? (
        <Field label="How it travels">
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            className={selectClass}
          >
            <option value="">Choose</option>
            {partner.transport.map((t) => (
              <option key={t.code} value={t.code}>
                {t.words}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {partner && tests.some((t) => t.map?.requiredIds.length) ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-s font-medium">This destination needs</p>
          {tests.map(({ r, map }) =>
            (map?.requiredIds ?? []).map((req) => (
              <label
                key={`${r.specimenId}:${req.key}`}
                className="text-body-s flex items-center gap-2"
              >
                <span className="w-24 shrink-0 font-mono">{r.labNumber}</span>
                <Input
                  className={cn(inputClass, "font-mono")}
                  aria-label={`${req.words} for ${r.labNumber}`}
                  placeholder={`Scan ${req.words.toLowerCase()}`}
                  value={ids[r.specimenId!]?.[req.key] ?? ""}
                  onChange={(e) =>
                    setIds((x) => ({
                      ...x,
                      [r.specimenId!]: { ...x[r.specimenId!], [req.key]: e.target.value },
                    }))
                  }
                />
                <span aria-live="polite" className="text-caption w-16">
                  {ids[r.specimenId!]?.[req.key]?.trim() ? "Scanned" : "Needed"}
                </span>
              </label>
            )),
          )}
        </div>
      ) : null}
      {items.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s mb-1 font-medium">Packed as this destination asks</legend>
          {items.map((i) => (
            <label key={i.key} className="text-body-s flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={ticked.includes(i.key)}
                onChange={() =>
                  setTicked((t) =>
                    t.includes(i.key) ? t.filter((x) => x !== i.key) : [...t, i.key],
                  )
                }
              />
              {i.words}
            </label>
          ))}
        </fieldset>
      ) : null}
      {abroad ? (
        <Field label="The patient's recorded consent (reference)">
          <Input
            className={inputClass}
            value={consent}
            onChange={(e) => setConsent(e.target.value)}
            maxLength={200}
          />
        </Field>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={add} disabled={!ready || pending}>
          Add to manifest
        </Button>
        {!ready && reason && selected.length ? (
          <p className="text-caption text-muted-foreground">{reason}</p>
        ) : null}
        <Said message={message} />
      </div>
      <p className="text-caption text-muted-foreground">
        Sending never cancels the order: the doctor sees where the specimen went on it.
      </p>
    </aside>
  );
}

function AliquotButton({ specimenId }: { specimenId: string }) {
  const { pending, message, act } = useAct();
  return (
    <span className="ml-2 inline-flex flex-col">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 sm:min-h-8"
        disabled={pending}
        onClick={() =>
          act(
            () => createAliquotAction({ specimenId, clientKey: newKey() }),
            "Aliquot made: it has its own lab number.",
          )
        }
      >
        Make an aliquot
      </Button>
      <Said message={message} />
    </span>
  );
}

function OutbreakDialog({
  specimenId,
  labNumber,
  partners,
}: {
  specimenId: string;
  labNumber: string | null;
  partners: SendPartner[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    partnerId: partners[0]?.id ?? "",
    ipcLead: "",
    surveillanceFocal: "",
    note: "",
  });
  const save = () =>
    act(async () => {
      const r = await recordOutbreakReferralAction({
        specimenId,
        partnerId: f.partnerId,
        informed: { ipcLead: f.ipcLead, surveillanceFocal: f.surveillanceFocal },
        handedAt: new Date().toISOString(),
        note: f.note.trim() || null,
        clientKey: newKey(),
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Recorded: handed to the outbreak team.");
  return (
    <Pop
      label="Record outbreak referral"
      sr={labNumber ?? undefined}
      title={`Outbreak referral · ${labNumber ?? "specimen"}`}
      lede="MedSync records the referral and tracks it. It does not arrange the transport."
      open={open}
      setOpen={setOpen}
      action={
        <Button type="button" onClick={save} disabled={pending || !f.partnerId}>
          Record
        </Button>
      }
    >
      {partners.length === 0 ? (
        <p className="text-body-s">Add the outbreak destination under Partners first.</p>
      ) : null}
      <Field label="Destination">
        <select
          value={f.partnerId}
          onChange={(e) => setF({ ...f, partnerId: e.target.value })}
          className={selectClass}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Infection prevention lead told">
          <Input
            className={inputClass}
            value={f.ipcLead}
            onChange={(e) => setF({ ...f, ipcLead: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="District surveillance focal person told">
          <Input
            className={inputClass}
            value={f.surveillanceFocal}
            onChange={(e) => setF({ ...f, surveillanceFocal: e.target.value })}
            maxLength={120}
          />
        </Field>
      </div>
      <Field label="Note (optional)">
        <Input
          className={inputClass}
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          maxLength={500}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

function Manifests({ manifests, canRefer }: { manifests: OpenManifest[]; canRefer: boolean }) {
  if (!manifests.length) return null;
  const STATE: Record<string, string> = {
    open: "Open",
    sealed: "Sealed, waiting for the courier",
    handed_over: "Handed over",
  };
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-heading-s">Manifests</h2>
      <ul className="border-border bg-card divide-ink-150 divide-y rounded-lg border">
        {manifests.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="font-mono">{m.number}</span>
            <span className="text-body-s">
              {m.partner} · {m.transport}
            </span>
            <StatusWord>{STATE[m.state] ?? m.state}</StatusWord>
            <span className="flex-1" />
            {canRefer && m.state === "open" ? (
              <SealDialog manifestId={m.id} number={m.number} />
            ) : null}
            {m.state !== "open" ? (
              <Link
                href={`/lab/refer/manifests/${m.id}/print`}
                prefetch={false}
                className={buttonVariants({
                  variant: "secondary",
                  className: "min-h-11 sm:min-h-8",
                })}
              >
                Print
              </Link>
            ) : null}
            {canRefer && m.state === "sealed" ? (
              <HandoverDialog manifestId={m.id} number={m.number} />
            ) : null}
            {canRefer && m.state === "handed_over" ? (
              <ReceiptDialog manifestId={m.id} number={m.number} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SealDialog({ manifestId, number }: { manifestId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState("1");
  return (
    <Pop
      label="Seal"
      sr={number}
      title={`Seal ${number}`}
      lede="A sealed manifest cannot change; a missed specimen goes on a new one."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await sealManifestAction({ manifestId, packages: Number(packages) });
              if (r.ok) setOpen(false);
              return r;
            }, "Sealed. Print it now.")
          }
        >
          Seal
        </Button>
      }
    >
      <Field label="Packages">
        <Input
          type="number"
          min={1}
          max={50}
          value={packages}
          onChange={(e) => setPackages(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

function HandoverDialog({ manifestId, number }: { manifestId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Pop
      label="Hand over"
      sr={number}
      title={`Hand over ${number}`}
      lede="The paper signature stays on the printed sheet."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await recordHandoverAction({
                manifestId,
                handedTo: name,
                handedAt: new Date().toISOString(),
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Handed over.")
          }
        >
          Record handover
        </Button>
      }
    >
      <Field label="Courier or rider">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

function ReceiptDialog({ manifestId, number }: { manifestId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    how: "signed_copy",
    by: "",
    count: "",
    condition: ["intact"] as string[],
    note: "",
  });
  const conditions = ["intact", "leaking", "broken", "missing"] as const;
  const words: Record<string, string> = {
    intact: "All intact",
    leaking: "Leaking",
    broken: "Broken",
    missing: "Missing",
  };
  return (
    <Pop
      label="Record receipt"
      sr={number}
      title={`Received · ${number}`}
      lede="From the signed copy returned, a call, or the reference lab's message."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await recordManifestReceiptAction({
                manifestId,
                how: f.how,
                receivedBy: f.by,
                receivedAt: new Date().toISOString(),
                condition: f.condition,
                count: Number(f.count),
                affected: [],
                note: f.note.trim() || null,
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Receipt recorded.")
          }
        >
          Record
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="How we know">
          <select
            value={f.how}
            onChange={(e) => setF({ ...f, how: e.target.value })}
            className={selectClass}
          >
            <option value="signed_copy">Signed copy returned</option>
            <option value="phone">Phone call</option>
            <option value="message">Their message</option>
          </select>
        </Field>
        <Field label="Received by">
          <Input
            value={f.by}
            onChange={(e) => setF({ ...f, by: e.target.value })}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field label="Number received">
          <Input
            type="number"
            min={0}
            value={f.count}
            onChange={(e) => setF({ ...f, count: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="text-body-s text-muted-foreground mb-1">Condition on arrival</legend>
        {conditions.map((c) => (
          <label key={c} className="text-body-s flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={f.condition.includes(c)}
              onChange={() =>
                setF({
                  ...f,
                  condition: f.condition.includes(c)
                    ? f.condition.filter((x) => x !== c)
                    : [...f.condition.filter((x) => (c === "intact" ? false : x !== "intact")), c],
                })
              }
            />
            {words[c]}
          </label>
        ))}
      </fieldset>
      <Said message={message} />
    </Pop>
  );
}
