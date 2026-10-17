"use client";

import type { UnitRegistry } from "@/lib/lab/referral-results";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB4 } from "@/content/lab-phase-4";
import {
  attachScanAction,
  checkPaperIdentityAction,
  createScanUploadAction,
  releasePaperResultAction,
} from "@/lib/lab/referral-actions";
import { componentEntry } from "@/lib/lab/referral-results";
import { fromCanonical, toCanonical } from "@/lib/units";
import { cn } from "@/lib/utils";
import { inputClass, newKey, selectClass } from "../../../_components/pop";
import { Field, Said } from "../../../setup/criticals/_components/setup-forms";

/* Result back on paper (Lab Phase 4 §5.4, artboard 4; RB-1..RB-8). The flag shown is computed from the printed
   range only; the conversion is the registry's (lib/units); the server checks all of it again. */

export interface Component {
  conceptId: string;
  name: string;
  hospitalUnit: string | null;
}
const fileTypes = ["application/pdf", "image/jpeg", "image/png"];

export function ResultForm({
  referralId,
  partner,
  components,
  units,
  checkers,
  scans,
}: {
  referralId: string;
  partner: string;
  components: Component[];
  units: { code: string; display: string }[];
  checkers: { id: string; name: string }[];
  scans: { theirReport: string | null; uploadedAt: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [id, setId] = useState({ theirNumber: "", name: "", birthDate: "" });
  const [matched, setMatched] = useState<boolean | null>(null);
  const [rep, setRep] = useState({ theirReport: "", reportedAt: "", authorisedBy: "" });
  const [vals, setVals] = useState(components.map(() => ({ value: "", unit: "", range: "" })));
  const [checker, setChecker] = useState("");
  const [scanOk, setScanOk] = useState(false);
  const [called, setCalled] = useState("");
  const [uploaded, setUploaded] = useState(scans.length > 0);
  const key = useMemo(() => newKey(), []);
  const known = new Set(units.flatMap((u) => [u.code, u.display]));
  const toCode = new Map(units.map((u) => [u.display, u.code]));
  const registry = (c: Component): UnitRegistry => ({
    knows: (u) => known.has(u),
    hospitalUnit: c.hospitalUnit ?? "",
    toHospital: (v, u) => {
      if (!c.hospitalUnit) return null;
      const can = toCanonical(c.conceptId, v, toCode.get(u) ?? u);
      if ("error" in can) return null;
      const h = fromCanonical(c.conceptId, can.value, c.hospitalUnit);
      return "error" in h ? null : h.value;
    },
  });
  const entries = components.map((c, i) =>
    vals[i]!.value.trim()
      ? componentEntry({
          value: vals[i]!.value,
          unitAsPrinted: vals[i]!.unit,
          rangeAsPrinted: vals[i]!.range || null,
          registry: registry(c),
        })
      : null,
  );
  const check = () =>
    start(async () => {
      const r = await checkPaperIdentityAction({ referralId, ...id });
      setMatched(r.ok);
      setMessage(r.ok ? null : { ok: false, text: r.error });
    });
  const upload = (file: File | undefined) =>
    start(async () => {
      if (!file || !fileTypes.includes(file.type))
        return setMessage({ ok: false, text: "Use a PDF, JPG or PNG." });
      const t = await createScanUploadAction({ referralId, type: file.type });
      if (!t.ok) return setMessage({ ok: false, text: t.error });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const res = await fetch(t.signedUrl, {
        method: "PUT",
        body,
        headers: { "x-upsert": "false", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      }).catch(() => null);
      if (!res?.ok) return setMessage({ ok: false, text: "The upload didn't arrive. Try again." });
      const a = await attachScanAction({
        referralId,
        path: t.path,
        theirReport: rep.theirReport.trim() || null,
      });
      if (!a.ok) return setMessage({ ok: false, text: a.error });
      setUploaded(true);
      setMessage({ ok: true, text: "Scan attached." });
    });
  const release = () =>
    start(async () => {
      const r = await releasePaperResultAction({
        referralId,
        ...id,
        ...rep,
        components: components
          .map((c, i) => ({
            conceptId: c.conceptId,
            value: vals[i]!.value.trim(),
            unitAsPrinted: vals[i]!.unit,
            rangeAsPrinted: vals[i]!.range.trim() || null,
          }))
          .filter((c) => c.value),
        checkedByUserId: checker || null,
        scanConfirmed: scanOk,
        calledWard: called.trim() || null,
        clientKey: key,
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({
        ok: true,
        text: ["Released to the doctor.", ...(r.data?.notes ?? [])].join(" "),
      });
      router.push("/lab/referrals");
    });
  const flagWords = {
    low: "Low",
    high: "High",
    normal: "In range",
    abnormal: "Not as printed",
  } as const;
  return (
    <div className="flex flex-col gap-5">
      <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-heading-s">The report&apos;s identity, typed from the paper</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Their form number">
            <Input
              className={cn(inputClass, "font-mono")}
              value={id.theirNumber}
              onChange={(e) => (setId({ ...id, theirNumber: e.target.value }), setMatched(null))}
            />
          </Field>
          <Field label="Name as printed">
            <Input
              className={inputClass}
              value={id.name}
              onChange={(e) => (setId({ ...id, name: e.target.value }), setMatched(null))}
            />
          </Field>
          <Field label="Date of birth as printed">
            <Input
              className={inputClass}
              value={id.birthDate}
              placeholder="DD/MM/YYYY"
              onChange={(e) => (setId({ ...id, birthDate: e.target.value }), setMatched(null))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={check}
            disabled={pending || !id.theirNumber || !id.name || !id.birthDate}
          >
            Check against the referral
          </Button>
          {matched ? (
            <StatusWord glyph={CheckIcon} icon>
              The report&apos;s form number, name and date of birth match this referral.
            </StatusWord>
          ) : null}
        </div>
      </section>
      <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-heading-s">Report details</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Reported by">
            <Input className={inputClass} value={partner} readOnly />
          </Field>
          <Field label="Their report number">
            <Input
              className={cn(inputClass, "font-mono")}
              value={rep.theirReport}
              onChange={(e) => setRep({ ...rep, theirReport: e.target.value })}
            />
          </Field>
          <Field label="Reported on, as printed">
            <Input
              className={inputClass}
              value={rep.reportedAt}
              onChange={(e) => setRep({ ...rep, reportedAt: e.target.value })}
            />
          </Field>
          <Field label="Authorised by, as printed">
            <Input
              className={inputClass}
              value={rep.authorisedBy}
              onChange={(e) => setRep({ ...rep, authorisedBy: e.target.value })}
            />
          </Field>
        </div>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Results as printed</caption>
            <thead>
              <tr className="bg-muted">
                {[
                  "Test",
                  "Result as printed",
                  "Unit as printed",
                  "Their range, as printed",
                  "Flag",
                  "In this hospital's unit",
                ].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => {
                const e = entries[i];
                const set =
                  (k: "value" | "unit" | "range") => (ev: { target: { value: string } }) =>
                    setVals((v) => v.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)));
                return (
                  <tr key={c.conceptId} className="border-ink-150 border-b last:border-b-0">
                    <td className="text-body-s px-3 py-2">
                      <label htmlFor={`v-${i}`}>{c.name}</label>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        id={`v-${i}`}
                        className={cn(inputClass, "w-28 font-mono")}
                        value={vals[i]!.value}
                        onChange={set("value")}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Unit for ${c.name}`}
                        className={cn(selectClass, "w-32")}
                        value={vals[i]!.unit}
                        onChange={set("unit")}
                      >
                        <option value="">Choose</option>
                        {units.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.display}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Their range for ${c.name}`}
                        className={cn(inputClass, "w-32 font-mono")}
                        value={vals[i]!.range}
                        onChange={set("range")}
                      />
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {e ? (e.flag ? flagWords[e.flag] : LAB4.noRangePrinted) : "—"}
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {!e ? (
                        "—"
                      ) : e.blocks.length ? (
                        <StatusWord tone="caution">{e.blocks[0]}</StatusWord>
                      ) : e.converted === "same_unit" ? (
                        "Same unit"
                      ) : e.converted ? (
                        `${Math.round(e.converted.value * 100) / 100} ${e.converted.unit} · converted`
                      ) : (
                        "Cannot be converted"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-heading-s">Scan and check</h2>
        <label className="text-body-s flex flex-col gap-1">
          <span>
            {uploaded
              ? "Scan attached. Attach another page:"
              : "Scan or photograph of the paper report (required before release)"}
          </span>
          <input
            type="file"
            accept={fileTypes.join(",")}
            onChange={(e) => upload(e.target.files?.[0])}
            className="text-body-s"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Checked against the paper by">
            <select
              className={selectClass}
              value={checker}
              onChange={(e) => setChecker(e.target.value)}
            >
              <option value="">Nobody else is on duty</option>
              {checkers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="The reference lab's own call to the ward, if it happened">
            <Input
              className={inputClass}
              value={called}
              onChange={(e) => setCalled(e.target.value)}
              maxLength={300}
            />
          </Field>
        </div>
        {checker ? (
          <label className="text-body-s flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={scanOk}
              onChange={(e) => setScanOk(e.target.checked)}
            />
            The checker confirms the scan shows report {rep.theirReport || "this report"}.
          </label>
        ) : (
          <p className="text-caption text-muted-foreground">
            Alone on duty, the result is released marked &quot;Entered by one person&quot; and
            checked at the next shift.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={release} disabled={pending || !matched || !uploaded}>
            Release to the doctor
          </Button>
          <p className="text-caption text-muted-foreground">
            Flags use the reference lab&apos;s printed range, never this hospital&apos;s.
          </p>
        </div>
        <Said message={message} />
      </section>
    </div>
  );
}
