"use client";

import type { SearchResult } from "../../actions";
import type { EnrolOptions } from "@/lib/ncdreg/read/enrol-options";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchAction } from "../../actions";
import { useOutbox } from "../../_components/outbox-provider";
import { ConfirmValues, Seg } from "../../visit/[visitId]/_components/controls";
import { placeSearchAction } from "../actions";

/** Placeholder notice, awaiting legal sign-off (SIGNOFF-REGISTER S11). */
const NOTICE_VERSION = "0.1-draft";
const NOTICE =
  "Draft notice, awaiting legal sign-off. The clinic keeps a record of your condition, visits and medicines to look after you and to plan the service. Only staff caring for you see your name. You can say no to SMS reminders and to calls.";

type Reg = { on: boolean; subtype: string; basis: string; year: string; month: string; where: string; referral: string };
type Place = Awaited<ReturnType<typeof placeSearchAction>>[number];

const field = "border-input focus-visible:shadow-focus h-10 w-full rounded-lg border bg-transparent px-3 text-[14px] outline-none";
const TIER_WORDS = { definite: "Definite matches", probable: "Probable matches", possible: "Possible matches" } as const;
const MATCH_WORDS: Record<string, string> = {
  hospital_number: "hospital number",
  national_id: "national ID",
  phone: "phone",
  similar_name: "similar name",
  sex: "sex",
  birth_year: "birth year",
};

export function EnrolForm({
  modules,
  synthetic,
  options,
  walkIn,
  today,
}: {
  modules: ConditionModule[];
  synthetic: boolean;
  options: EnrolOptions;
  walkIn: boolean;
  today: string;
}) {
  const router = useRouter();
  const { submit } = useOutbox();
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [sex, setSex] = useState<"female" | "male" | null>(null);
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [hospNo, setHospNo] = useState("");
  const [nin, setNin] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [nokName, setNokName] = useState("");
  const [nokPhone, setNokPhone] = useState("");
  const [placeQ, setPlaceQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [parish, setParish] = useState("");
  const [village, setVillage] = useState("");
  const [regs, setRegs] = useState<Record<string, Reg>>(() =>
    Object.fromEntries(modules.map((m) => [m.code, { on: false, subtype: m.subtypes.length === 1 ? m.subtypes[0]!.code : "", basis: "", year: "", month: "", where: "", referral: "" }])),
  );
  const [height, setHeight] = useState("");
  const [tobacco, setTobacco] = useState<string | null>(null);
  const [alcohol, setAlcohol] = useState<string | null>(null);
  const [cvd, setCvd] = useState<string[]>([]);
  const [ckd, setCkd] = useState<string | null>(null);
  const [fhDm, setFhDm] = useState<string | null>(null);
  const [fhHt, setFhHt] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [sms, setSms] = useState(true);
  const [calls, setCalls] = useState(true);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const birthYear = dob ? Number(dob.slice(0, 4)) : age ? Number(today.slice(0, 4)) - Number(age) : null;
  useEffect(() => {
    if (given.trim().length + family.trim().length < 3 && !phone1 && !hospNo && !nin) return;
    const t = window.setTimeout(() => {
      searchAction({ givenName: given, familyName: family, sex, birthYear, phones: [phone1 || null, phone2 || null], hospitalNumber: hospNo || null, nationalId: nin || null })
        .then(setSearch)
        .catch(() => setMsg("Search needs a connection."));
    }, 400);
    return () => window.clearTimeout(t);
  }, [given, family, sex, birthYear, phone1, phone2, hospNo, nin]);

  useEffect(() => {
    if (placeQ.trim().length < 2 || place?.label === placeQ) return;
    const t = window.setTimeout(() => placeSearchAction(placeQ).then(setPlaces).catch(() => setPlaces([])), 250);
    return () => window.clearTimeout(t);
  }, [placeQ, place]);

  const blocking = (search?.candidates ?? []).filter((c) => c.tier !== "possible" && !dismissed.includes(c.personId));
  const chosen = modules.filter((m) => regs[m.code]?.on);
  const regsValid = chosen.length > 0 && chosen.every((m) => {
    const r = regs[m.code]!;
    return r.subtype && r.basis && /^\d{4}$/.test(r.year);
  });
  const ready = !!search && !blocking.length && given.trim() && family.trim() && sex && (dob || age) && regsValid && ack;
  const missing = [
    !search ? "run the search (type a name, phone or hospital number)" : null,
    blocking.length ? "settle the definite and probable matches" : null,
    !given.trim() || !family.trim() ? "names" : null,
    !sex ? "sex" : null,
    !dob && !age ? "date of birth or estimated age" : null,
    !regsValid ? "at least one condition with type, basis and year of diagnosis" : null,
    !ack ? "the privacy notice" : null,
  ].filter(Boolean);

  const enrol = (startVisit: boolean, confirmations: string[] = []) =>
    start(async () => {
      setMsg(null);
      if (!search) return;
      const personId = crypto.randomUUID();
      const r = await submit("person.enrol", {
        personId,
        searchToken: search.token,
        identity: {
          givenName: given.trim(),
          familyName: family.trim(),
          sex,
          dateOfBirth: dob || null,
          ageYears: dob ? null : Number(age),
          phone1: phone1 || null,
          phone2: phone2 || null,
          nokName: nokName || null,
          nokPhone: nokPhone || null,
          hospitalNumber: hospNo || null,
          nationalId: nin || null,
          district: place ? place.district : null,
          subcounty: place?.subcounty ?? null,
          parish: parish || null,
          village: village || null,
        },
        registrations: chosen.map((m) => {
          const g = regs[m.code]!;
          return {
            registrationId: crypto.randomUUID(),
            condition: m.code,
            subtype: g.subtype,
            basisOfDiagnosis: g.basis,
            diagnosisYear: Number(g.year),
            diagnosisMonth: g.month ? Number(g.month) : null,
            whereFirstDiagnosed: g.where || null,
            referralSource: g.referral || null,
          };
        }),
        baseline: {
          heightCm: height ? Number(height) : null,
          tobacco,
          alcohol,
          knownCvd: cvd,
          knownKidneyDisease: ckd == null ? null : ckd === "yes",
          familyHistoryDiabetes: fhDm == null ? null : fhDm === "yes",
          familyHistoryHypertension: fhHt == null ? null : fhHt === "yes",
        },
        privacy: { version: NOTICE_VERSION, acknowledged: true },
        smsAllowed: sms,
        callsAllowed: calls,
        isSynthetic: synthetic,
        dismissedCandidates: dismissed,
        confirmations,
      });
      if (!r.ok) {
        if (r.code === "needs_confirmation") return setConfirm(((r.detail?.fields as string[]) ?? []).slice());
        if (r.code === "duplicates") {
          setSearch({ token: search.token, candidates: search.candidates });
          return setMsg("Possible existing records need a decision first.");
        }
        return setMsg(r.message);
      }
      if ("queued" in r) return setMsg("Enrolled on this device. The record is sent when the connection returns.");
      if (startVisit) {
        const visitId = crypto.randomUUID();
        const a = await submit("visit.arrive", { visitId, personId, visitType: walkIn ? "unscheduled" : "scheduled" });
        if (a.ok) return router.push(`/ncd/visit/${visitId}`);
      }
      router.push(`/ncd/patients/${personId}`);
    });

  const yesNo = useMemo(() => [["yes", "Yes"], ["no", "No"]] as const, []);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()} aria-label="Enrol a patient">
        {synthetic ? (
          <p className="bg-ink-50 text-caption text-ink-700 rounded-lg px-3 py-2">
            Draft standard version 0.1, not approved for patient data: this record is created as a synthetic test record.
          </p>
        ) : null}
        <Block title="Identity">
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Given name" value={given} onChange={setGiven} autoFocus />
            <Text label="Family name" value={family} onChange={setFamily} />
          </div>
          <Seg label="Sex" hideLabel={false} value={sex} onChange={(v) => setSex(v as "female" | "male")} options={[["female", "Female"], ["male", "Male"]]} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-label">Date of birth</span>
              <input type="date" max={today} className={field} value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
            <Text label="Or estimated age (years)" value={age} onChange={(v) => setAge(v.replace(/\D/g, ""))} numeric disabled={!!dob} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Hospital number (optional)" value={hospNo} onChange={setHospNo} />
            <Text label="National ID number (optional, never required)" value={nin} onChange={setNin} />
          </div>
        </Block>

        <Block title="Contact and residence">
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Phone 1" value={phone1} onChange={setPhone1} tel />
            <Text label="Phone 2" value={phone2} onChange={setPhone2} tel />
            <Text label="Next of kin name" value={nokName} onChange={setNokName} />
            <Text label="Next of kin phone" value={nokPhone} onChange={setNokPhone} tel />
          </div>
          <div className="relative flex flex-col gap-1">
            <label htmlFor="place" className="text-label">
              Sub-county or district
            </label>
            <input
              id="place"
              className={field}
              value={place ? place.label : placeQ}
              onChange={(e) => (setPlace(null), setPlaceQ(e.target.value))}
              role="combobox"
              aria-expanded={!place && places.length > 0}
              aria-controls="place-list"
              autoComplete="off"
            />
            {!place && places.length ? (
              <ul id="place-list" role="listbox" className="border-border bg-popover shadow-popover absolute top-full z-10 mt-1 w-full rounded-lg border p-1">
                {places.map((p) => (
                  <li key={p.code}>
                    <button type="button" role="option" aria-selected={false} className="hover:bg-ink-100 w-full rounded px-2 py-1.5 text-left text-[13px]" onClick={() => (setPlace(p), setPlaces([]))}>
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Parish" value={parish} onChange={setParish} />
            <Text label="Village" value={village} onChange={setVillage} />
          </div>
        </Block>

        <Block title="Conditions">
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <label key={m.code} className={cn("text-label inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3", regs[m.code]?.on ? "border-teal-edge bg-teal-tint" : "border-input")}>
                <input type="checkbox" checked={!!regs[m.code]?.on} onChange={(e) => setRegs({ ...regs, [m.code]: { ...regs[m.code]!, on: e.target.checked } })} />
                {m.label}
              </label>
            ))}
          </div>
          {chosen.map((m) => {
            const r = regs[m.code]!;
            const set = (patch: Partial<Reg>) => setRegs({ ...regs, [m.code]: { ...r, ...patch } });
            return (
              <div key={m.code} className="border-border flex flex-col gap-3 rounded-lg border p-3">
                <h3 className="text-label">{m.label}</h3>
                {m.subtypes.length > 1 ? <Seg label="Type" hideLabel={false} value={r.subtype} onChange={(v) => set({ subtype: v })} options={m.subtypes.map((s) => [s.code, s.label] as const)} /> : null}
                <Seg label="Basis of diagnosis" hideLabel={false} value={r.basis} onChange={(v) => set({ basis: v })} options={m.basis_of_diagnosis.map((s) => [s.code, s.label] as const)} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <Text label="Year diagnosed" value={r.year} onChange={(v) => set({ year: v.replace(/\D/g, "").slice(0, 4) })} numeric />
                  <Text label="Month (optional)" value={r.month} onChange={(v) => set({ month: v.replace(/\D/g, "").slice(0, 2) })} numeric />
                </div>
                <Seg label="Where first diagnosed" hideLabel={false} value={r.where} onChange={(v) => set({ where: v })} options={options.whereFirst} />
                <Seg label="Referred from" hideLabel={false} value={r.referral} onChange={(v) => set({ referral: v })} options={options.referral} />
              </div>
            );
          })}
        </Block>

        <Block title="Baseline">
          <div className="grid gap-3 sm:grid-cols-3">
            <Text label="Height cm" value={height} onChange={(v) => setHeight(v.replace(",", "."))} numeric />
          </div>
          <Seg label="Tobacco" hideLabel={false} value={tobacco} onChange={setTobacco} options={options.tobacco} />
          <Seg label="Alcohol" hideLabel={false} value={alcohol} onChange={setAlcohol} options={options.alcohol} />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label mb-1">Known cardiovascular disease</legend>
            <div className="flex flex-wrap gap-3">
              {options.knownCvd.map(([c, l]) => (
                <label key={c} className="text-body-s inline-flex items-center gap-2">
                  <input type="checkbox" checked={cvd.includes(c)} onChange={(e) => setCvd(e.target.checked ? [...cvd, c] : cvd.filter((x) => x !== c))} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <Seg label="Known kidney disease" hideLabel={false} value={ckd} onChange={setCkd} options={yesNo} />
          <Seg label="Family history of diabetes" hideLabel={false} value={fhDm} onChange={setFhDm} options={yesNo} />
          <Seg label="Family history of hypertension" hideLabel={false} value={fhHt} onChange={setFhHt} options={yesNo} />
        </Block>

        <Block title="Notice and contact preferences">
          <p className="text-body-s text-ink-700 bg-ink-50 rounded-lg p-3">{NOTICE}</p>
          <label className="text-body-s inline-flex items-center gap-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> The notice was given to the patient (version {NOTICE_VERSION})
          </label>
          <label className="text-body-s inline-flex items-center gap-2">
            <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS reminders allowed
          </label>
          <label className="text-body-s inline-flex items-center gap-2">
            <input type="checkbox" checked={calls} onChange={(e) => setCalls(e.target.checked)} /> Calls allowed
          </label>
        </Block>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="lg" disabled={!ready || pending} onClick={() => enrol(true)}>
            Enrol and start visit
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={!ready || pending} onClick={() => enrol(false)}>
            Enrol only
          </Button>
          {!ready ? <p className="text-caption text-ink-600">Still needed: {missing.join("; ")}.</p> : null}
        </div>
        {msg ? (
          <p role="status" className="text-body-s text-ink-800">
            {msg}
          </p>
        ) : null}
        <ConfirmValues fields={confirm} onCancel={() => setConfirm(null)} onConfirm={(f) => (setConfirm(null), enrol(true, f))} />
      </form>

      <aside aria-labelledby="cand-h" className="border-border sticky top-4 flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="cand-h" className="text-heading-s">
          Possible existing records
        </h2>
        {!search ? <p className="text-body-s text-muted-foreground">Type a name, phone or hospital number. The search runs as you type.</p> : null}
        {search && !search.candidates.length ? <p className="text-body-s text-ink-700">No existing record matches. You can enrol a new patient.</p> : null}
        {(["definite", "probable", "possible"] as const).map((tier) => {
          const list = (search?.candidates ?? []).filter((c) => c.tier === tier);
          if (!list.length) return null;
          return (
            <section key={tier} className="flex flex-col gap-2">
              <h3 className="text-label">{TIER_WORDS[tier]}</h3>
              <ul className="flex flex-col gap-2">
                {list.map((c) => {
                  const off = dismissed.includes(c.personId);
                  return (
                    <li key={c.personId} className={cn("border-border flex flex-col gap-1.5 rounded-lg border p-3", off && "opacity-60")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground font-mono text-[12px]">{c.registryNumber}</span>
                      </div>
                      <p className="text-caption text-ink-600">
                        {c.sex === "female" ? "F" : "M"} · {c.age} y · matched {c.matched.map((m) => MATCH_WORDS[m] ?? m).join(", ")}
                      </p>
                      <div className="flex gap-2">
                        <Link href={`/ncd/patients/${c.personId}`} className="text-teal-text text-[13px] underline-offset-2 hover:underline">
                          This is the patient
                        </Link>
                        {tier !== "possible" ? (
                          <button type="button" className="text-ink-700 text-[13px] underline-offset-2 hover:underline" onClick={() => setDismissed(off ? dismissed.filter((x) => x !== c.personId) : [...dismissed, c.personId])}>
                            {off ? "Undo: not this patient" : "Not this patient"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </aside>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-border flex flex-col gap-3 rounded-xl border p-4">
      <legend className="text-heading-s px-1">{title}</legend>
      {children}
    </fieldset>
  );
}

function Text({
  label,
  value,
  onChange,
  numeric,
  tel,
  autoFocus,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  tel?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label">{label}</span>
      <input
        className={field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? "decimal" : tel ? "tel" : undefined}
        type={tel ? "tel" : "text"}
        autoFocus={autoFocus}
        disabled={disabled}
      />
    </label>
  );
}
