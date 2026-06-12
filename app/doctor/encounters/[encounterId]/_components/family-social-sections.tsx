"use client";

import type { PicklistItem } from "@/lib/clerkship/catalog";
import type { ClerkFamilyItem, ClerkIce, ClerkSocial } from "@/lib/encounter/clerkship";
import { useEffect, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";

import { cageScore, FH_SCREEN, packYears } from "@/lib/clerkship/history";
import { loadClerkshipPicklistsAction } from "../actions";
import { AddSelect, NumSelect, YearSelect } from "./tap-controls";

/**
 * Tap-first Family + Social/Personal history + ICE — NO typing. Dropdowns, chips,
 * year/number pickers; pack-years auto-calculated; CAGE as a supportive 4-tap;
 * explicit negatives. Sensitive sections framed non-judgmentally; screens are
 * prompts, not labels. Decision-support, not autonomous.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const SECTION = "border-border/70 flex flex-col gap-3 rounded-xl border p-3.5";
const H = "text-foreground text-[13px] font-semibold";
const LBL = "text-muted-foreground w-24 shrink-0 text-[10px] tracking-wide uppercase";
const chip = (active: boolean) =>
  `tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const NIL = `tap inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset ${EASE}`;

const CIG_DAY = [5, 10, 15, 20, 25, 30, 40, 60];
const SMOKE_YEARS = [1, 2, 5, 10, 15, 20, 30, 40, 50];
const UNITS = [1, 5, 10, 14, 20, 30, 40, 50, 70, 100];
const DRUG_ROUTES = ["oral", "smoked", "inhaled", "injected", "other"];
const ICE_OPTIONS: Record<keyof ClerkIce, string[]> = {
  ideas: [
    "something serious",
    "minor / self-limiting",
    "an infection",
    "heart problem",
    "cancer worry",
    "unsure",
  ],
  concerns: [
    "worried it's serious",
    "pain",
    "unable to work",
    "cost",
    "family impact",
    "prognosis",
  ],
  expectations: [
    "reassurance",
    "a diagnosis",
    "tests",
    "treatment",
    "referral",
    "sick note",
    "admission",
  ],
};

type Props = {
  familyHistory: ClerkFamilyItem[];
  setFamilyHistory: (v: ClerkFamilyItem[]) => void;
  fhScreen: Record<string, "yes" | "no" | "unsure">;
  setFhScreen: (v: Record<string, "yes" | "no" | "unsure">) => void;
  social: ClerkSocial;
  setSocial: (v: ClerkSocial) => void;
  ice: ClerkIce;
  setIce: (v: ClerkIce) => void;
  negatives: Record<string, boolean>;
  setNegatives: (v: Record<string, boolean>) => void;
};

export function FamilySocialSections(p: Props) {
  const [lists, setLists] = useState<Record<string, PicklistItem[]> | null>(null);
  useEffect(() => {
    loadClerkshipPicklistsAction()
      .then(setLists)
      .catch(() => setLists({}));
  }, []);
  const s = p.social;
  const set = (patch: Partial<ClerkSocial>) => p.setSocial({ ...s, ...patch });
  const setNeg = (k: string, on: boolean) => p.setNegatives({ ...p.negatives, [k]: on });
  const py = packYears(s.cigsPerDay, s.smokingYears);
  const cage = cageScore(s.cage);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Family history ── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={H}>Family history</span>
          <NilTap
            label="No significant FH"
            on={!!p.negatives.no_fh}
            onToggle={(v) => {
              setNeg("no_fh", v);
              if (v) p.setFamilyHistory([]);
            }}
          />
        </div>
        {!p.negatives.no_fh ? (
          <>
            <AddSelect
              options={(lists?.condition ?? []).map((c) => ({ value: c.code, label: c.display }))}
              placeholder="Add a family condition…"
              onAdd={(value, label) =>
                p.setFamilyHistory([
                  ...p.familyHistory,
                  { relative: "mother", conditionCode: value, conditionDisplay: label },
                ])
              }
            />
            {p.familyHistory.map((f, i) => (
              <ItemCard
                key={i}
                title={f.conditionDisplay}
                onRemove={() => p.setFamilyHistory(p.familyHistory.filter((_, j) => j !== i))}
              >
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      "mother",
                      "father",
                      "sibling",
                      "child",
                      "grandparent",
                      "aunt_uncle",
                      "other",
                    ] as const
                  ).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={chip(f.relative === r)}
                      onClick={() =>
                        p.setFamilyHistory(
                          p.familyHistory.map((x, j) => (j === i ? { ...x, relative: r } : x)),
                        )
                      }
                    >
                      {r.replace(/_/g, "/")}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-[10px] uppercase">
                    age onset/death
                  </span>
                  <YearSelect
                    value={f.ageOnset}
                    placeholder="Age…"
                    onChange={(v) =>
                      p.setFamilyHistory(
                        p.familyHistory.map((x, j) => (j === i ? { ...x, ageOnset: v } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={chip(!!f.deceased)}
                    onClick={() =>
                      p.setFamilyHistory(
                        p.familyHistory.map((x, j) =>
                          j === i ? { ...x, deceased: !x.deceased } : x,
                        ),
                      )
                    }
                  >
                    deceased
                  </button>
                </div>
              </ItemCard>
            ))}
            <div className="border-border/50 mt-1 border-t pt-2">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Any family history of?
              </span>
              <div className="mt-1.5 flex flex-col gap-1">
                {FH_SCREEN.map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <span className="text-[12px]">{f.label}</span>
                    <Tri
                      value={p.fhScreen[f.key]}
                      onChange={(v) => {
                        const n = { ...p.fhScreen };
                        if (v) n[f.key] = v;
                        else delete n[f.key];
                        p.setFhScreen(n);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* ── Social / personal history ── */}
      <section className={SECTION}>
        <span className={H}>Social &amp; personal history</span>

        {/* Smoking */}
        <Row label="Smoking">
          <Chips
            options={["never", "current", "ex"]}
            value={s.smokingStatus}
            onPick={(v) => set({ smokingStatus: v as ClerkSocial["smokingStatus"] })}
          />
          {s.smokingStatus && s.smokingStatus !== "never" ? (
            <>
              <NumSelect
                label="cig/day"
                value={s.cigsPerDay}
                options={CIG_DAY}
                onChange={(n) => set({ cigsPerDay: n })}
              />
              <NumSelect
                label="years"
                value={s.smokingYears}
                options={SMOKE_YEARS}
                onChange={(n) => set({ smokingYears: n })}
              />
              {py != null ? (
                <span
                  key={py}
                  className="scale-in rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] text-teal-700 tabular-nums dark:bg-teal-950/40 dark:text-teal-200"
                >
                  {py} pack-years
                </span>
              ) : null}
              {s.smokingStatus === "ex" ? (
                <YearSelect
                  value={s.quitYear}
                  placeholder="quit yr"
                  onChange={(v) => set({ quitYear: v })}
                />
              ) : null}
            </>
          ) : null}
        </Row>

        {/* Alcohol */}
        <Row label="Alcohol">
          <Chips
            options={["never", "occasional", "regular", "ex"]}
            value={s.alcoholStatus}
            onPick={(v) => set({ alcoholStatus: v as ClerkSocial["alcoholStatus"] })}
          />
          {s.alcoholStatus && s.alcoholStatus !== "never" ? (
            <NumSelect
              label="units/wk"
              value={s.alcoholUnitsPerWeek}
              options={UNITS}
              onChange={(n) => set({ alcoholUnitsPerWeek: n })}
            />
          ) : null}
        </Row>
        {s.alcoholStatus && s.alcoholStatus !== "never" ? (
          <Row label="CAGE">
            {(
              [
                ["cutDown", "Cut down"],
                ["annoyed", "Annoyed"],
                ["guilty", "Guilty"],
                ["eyeOpener", "Eye-opener"],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={chip(!!s.cage?.[k])}
                onClick={() => set({ cage: { ...s.cage, [k]: !s.cage?.[k] } })}
              >
                {lbl}
              </button>
            ))}
            {cage > 0 ? (
              <span
                key={cage}
                className={`scale-in rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${cage >= 2 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}
              >
                CAGE {cage}/4
              </span>
            ) : null}
          </Row>
        ) : null}

        {/* Recreational drugs (sensitive) */}
        <Row label="Drugs">
          <Chips
            options={["never", "past", "current"]}
            value={s.drugUse}
            onPick={(v) => set({ drugUse: v as ClerkSocial["drugUse"] })}
          />
          {s.drugUse && s.drugUse !== "never" ? (
            <Chips
              options={DRUG_ROUTES}
              value={s.drugDetail}
              onPick={(v) => set({ drugDetail: v })}
            />
          ) : null}
        </Row>

        {/* Occupation + exposures */}
        <Row label="Occupation">
          {s.occupation ? (
            <button
              type="button"
              className={chip(true)}
              onClick={() => set({ occupation: undefined, occupationCode: undefined })}
            >
              {s.occupation} <XIcon className="ml-0.5 inline size-3" aria-hidden />
            </button>
          ) : (
            <AddSelect
              options={(lists?.occupation ?? []).map((o) => ({ value: o.code, label: o.display }))}
              placeholder="Occupation…"
              onAdd={(value, label) => set({ occupationCode: value, occupation: label })}
            />
          )}
        </Row>
        <Row label="Exposures">
          {(lists?.exposure ?? []).map((ex) => {
            const on = s.exposures?.includes(ex.display);
            return (
              <button
                key={ex.code}
                type="button"
                className={chip(!!on)}
                onClick={() =>
                  set({
                    exposures: on
                      ? (s.exposures ?? []).filter((y) => y !== ex.display)
                      : [...(s.exposures ?? []), ex.display],
                  })
                }
              >
                {ex.display}
              </button>
            );
          })}
        </Row>

        {/* Living + function */}
        <Row label="Lives">
          <Chips
            options={["alone", "with_family", "with_spouse", "institution"]}
            value={s.living}
            onPick={(v) => set({ living: v as ClerkSocial["living"] })}
          />
        </Row>
        <Row label="Function">
          <Chips
            options={["independent", "some_help", "dependent"]}
            value={s.func}
            onPick={(v) => set({ func: v as ClerkSocial["func"] })}
          />
        </Row>
        <Row label="Mobility">
          <Chips
            options={["independent", "aid", "wheelchair", "bedbound"]}
            value={s.mobility}
            onPick={(v) => set({ mobility: v as ClerkSocial["mobility"] })}
          />
        </Row>
        <Row label="Activity">
          <Chips
            options={["sedentary", "moderate", "active"]}
            value={s.activity}
            onPick={(v) => set({ activity: v as ClerkSocial["activity"] })}
          />
        </Row>
        <Row label="Recent travel">
          <Chips
            options={["no", "yes"]}
            value={s.recentTravel}
            onPick={(v) => set({ recentTravel: v })}
          />
        </Row>
      </section>

      {/* ── ICE ── */}
      <section className={SECTION}>
        <span className={H}>Ideas · concerns · expectations</span>
        {(["ideas", "concerns", "expectations"] as const).map((k) => (
          <Row key={k} label={k}>
            <Chips
              options={ICE_OPTIONS[k]}
              value={p.ice[k]}
              onPick={(v) => p.setIce({ ...p.ice, [k]: v })}
            />
          </Row>
        ))}
      </section>
    </div>
  );
}

/** Single-select chip group (tap to set / tap again to clear). */
function Chips({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          className={chip(value === o)}
          onClick={() => onPick(value === o ? undefined : o)}
        >
          {o.replace(/_/g, " ")}
        </button>
      ))}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={LBL}>{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Tri({
  value,
  onChange,
}: {
  value: "yes" | "no" | "unsure" | undefined;
  onChange: (v: "yes" | "no" | "unsure" | undefined) => void;
}) {
  return (
    <div className="flex gap-1">
      {(["yes", "no", "unsure"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={chip(value === v)}
          onClick={() => onChange(value === v ? undefined : v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function NilTap({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      className={
        on
          ? `${NIL} bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200`
          : `${NIL} text-muted-foreground ring-border hover:bg-muted/60`
      }
    >
      {on ? <CheckIcon className="size-3" aria-hidden /> : null}
      {label}
    </button>
  );
}

function ItemCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/60 bg-muted/20 scale-in flex flex-col gap-2 rounded-lg border px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-foreground text-[12.5px] font-medium">{title}</span>
        <button
          type="button"
          onClick={onRemove}
          className="tap text-muted-foreground hover:text-destructive rounded-md p-0.5 transition-colors"
          aria-label="Remove"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
