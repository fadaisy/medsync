"use client";

import type { PicklistItem } from "@/lib/clerkship/catalog";
import type { ClerkFamilyItem, ClerkIce, ClerkSocial } from "@/lib/encounter/clerkship";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";

import { cageScore, FH_SCREEN, packYears } from "@/lib/clerkship/history";
import { loadClerkshipPicklistsAction } from "../actions";

/**
 * Tap-first Family + Social/Personal history + ICE. Pickers, chips, number
 * pickers; pack-years auto-calculated (never typed); CAGE as a supportive 4-tap;
 * explicit negatives (no significant FH / non-smoker / no alcohol). Sensitive
 * sections framed non-judgmentally. Decision-support — screens are prompts.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const SECTION = "border-border/70 flex flex-col gap-3 rounded-xl border p-3.5";
const H = "text-foreground text-[13px] font-semibold";
const LBL = "text-muted-foreground w-24 shrink-0 text-[10px] tracking-wide uppercase";
const chip = (active: boolean) =>
  `rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const NIL = `inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset ${EASE}`;
const tinyInput =
  "border-input bg-card rounded px-1.5 py-0.5 text-[12px] outline-none focus-visible:border-teal-500";

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
            <Picker
              items={lists?.condition ?? []}
              placeholder="Add a family condition…"
              allowOther
              onPick={(it) =>
                p.setFamilyHistory([
                  ...p.familyHistory,
                  { relative: "mother", conditionCode: it.code, conditionDisplay: it.display },
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
                  <input
                    className={`${tinyInput} w-28`}
                    placeholder="Age at onset/death"
                    value={f.ageOnset ?? ""}
                    onChange={(e) =>
                      p.setFamilyHistory(
                        p.familyHistory.map((x, j) =>
                          j === i ? { ...x, ageOnset: e.target.value } : x,
                        ),
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
          {(["never", "current", "ex"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.smokingStatus === v)}
              onClick={() => set({ smokingStatus: s.smokingStatus === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
          {s.smokingStatus && s.smokingStatus !== "never" ? (
            <>
              <NumberPick
                label="cig/day"
                value={s.cigsPerDay}
                onChange={(n) => set({ cigsPerDay: n })}
              />
              <NumberPick
                label="years"
                value={s.smokingYears}
                onChange={(n) => set({ smokingYears: n })}
              />
              {py != null ? (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] text-teal-700 tabular-nums dark:bg-teal-950/40 dark:text-teal-200">
                  {py} pack-years
                </span>
              ) : null}
              {s.smokingStatus === "ex" ? (
                <input
                  className={`${tinyInput} w-20`}
                  placeholder="quit yr"
                  value={s.quitYear ?? ""}
                  onChange={(e) => set({ quitYear: e.target.value })}
                />
              ) : null}
            </>
          ) : null}
        </Row>

        {/* Alcohol */}
        <Row label="Alcohol">
          {(["never", "occasional", "regular", "ex"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.alcoholStatus === v)}
              onClick={() => set({ alcoholStatus: s.alcoholStatus === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
          {s.alcoholStatus && s.alcoholStatus !== "never" ? (
            <NumberPick
              label="units/wk"
              value={s.alcoholUnitsPerWeek}
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
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${cage >= 2 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}
              >
                CAGE {cage}/4
              </span>
            ) : null}
          </Row>
        ) : null}

        {/* Recreational drugs (sensitive) */}
        <Row label="Drugs">
          {(["never", "past", "current"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.drugUse === v)}
              onClick={() => set({ drugUse: s.drugUse === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
          {s.drugUse && s.drugUse !== "never" ? (
            <input
              className={`${tinyInput} flex-1`}
              placeholder="substance / route (sensitive)"
              value={s.drugDetail ?? ""}
              onChange={(e) => set({ drugDetail: e.target.value })}
            />
          ) : null}
        </Row>

        {/* Occupation + exposures */}
        <Row label="Occupation">
          <OccPicker
            items={lists?.occupation ?? []}
            value={s.occupation}
            onPick={(it) => set({ occupationCode: it.code, occupation: it.display })}
          />
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
          {(["alone", "with_family", "with_spouse", "institution"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.living === v)}
              onClick={() => set({ living: s.living === v ? undefined : v })}
            >
              {v.replace(/_/g, " ")}
            </button>
          ))}
        </Row>
        <Row label="Function">
          {(["independent", "some_help", "dependent"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.func === v)}
              onClick={() => set({ func: s.func === v ? undefined : v })}
            >
              {v.replace(/_/g, " ")}
            </button>
          ))}
        </Row>
        <Row label="Mobility">
          {(["independent", "aid", "wheelchair", "bedbound"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.mobility === v)}
              onClick={() => set({ mobility: s.mobility === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
        </Row>

        {/* Lifestyle */}
        <Row label="Activity">
          {(["sedentary", "moderate", "active"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={chip(s.activity === v)}
              onClick={() => set({ activity: s.activity === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
          <input
            className={`${tinyInput} w-32`}
            placeholder="recent travel"
            value={s.recentTravel ?? ""}
            onChange={(e) => set({ recentTravel: e.target.value })}
          />
        </Row>
      </section>

      {/* ── ICE ── */}
      <section className={SECTION}>
        <span className={H}>Ideas · concerns · expectations</span>
        {(
          [
            ["ideas", "Ideas"],
            ["concerns", "Concerns"],
            ["expectations", "Expectations"],
          ] as const
        ).map(([k, lbl]) => (
          <Row key={k} label={lbl}>
            <input
              className={`${tinyInput} flex-1`}
              value={p.ice[k] ?? ""}
              onChange={(e) => p.setIce({ ...p.ice, [k]: e.target.value })}
              placeholder={`${lbl} (brief)`}
            />
          </Row>
        ))}
      </section>
    </div>
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

function NumberPick({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        className={`${tinyInput} w-16`}
        placeholder={label}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
      />
      <span className="text-muted-foreground text-[10px]">{label}</span>
    </span>
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
    <div className="border-border/60 bg-muted/20 flex flex-col gap-2 rounded-lg border px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-foreground text-[12.5px] font-medium">{title}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function OccPicker({
  items,
  value,
  onPick,
}: {
  items: PicklistItem[];
  value: string | undefined;
  onPick: (it: PicklistItem) => void;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((it) => it.display.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [q, items]);
  if (value)
    return (
      <button
        type="button"
        className={chip(true)}
        onClick={() =>
          onPick({ code: "", listType: "", display: "", synonyms: [], meta: {}, ugandaFlag: null })
        }
      >
        {value} ✕
      </button>
    );
  return (
    <div className="flex flex-1 flex-col gap-1">
      <input
        className={`${tinyInput} w-full`}
        placeholder="Occupation…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() ? (
        <div className="flex flex-wrap gap-1">
          {matches.map((it) => (
            <button
              key={it.code}
              type="button"
              className={chip(false)}
              onClick={() => {
                onPick(it);
                setQ("");
              }}
            >
              {it.display}
            </button>
          ))}
          <button
            type="button"
            className={chip(false)}
            onClick={() => {
              onPick({
                code: `adhoc_${q
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")}`,
                listType: "",
                display: q.trim(),
                synonyms: [],
                meta: {},
                ugandaFlag: null,
              });
              setQ("");
            }}
          >
            “{q.trim()}”
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Picker({
  items,
  placeholder,
  allowOther,
  onPick,
}: {
  items: PicklistItem[];
  placeholder: string;
  allowOther?: boolean;
  onPick: (it: PicklistItem) => void;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? items
          .filter(
            (it) =>
              it.display.toLowerCase().includes(t) ||
              it.synonyms.some((y) => y.toLowerCase().includes(t)),
          )
          .slice(0, 8)
      : [];
  }, [q, items]);
  return (
    <div className="flex flex-col gap-1.5">
      <input
        className={`${tinyInput} w-full py-1.5`}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() ? (
        <div className="flex flex-wrap gap-1">
          {matches.map((it) => (
            <button
              key={it.code}
              type="button"
              className={chip(false)}
              onClick={() => {
                onPick(it);
                setQ("");
              }}
            >
              <PlusIcon className="mr-0.5 inline size-3" aria-hidden />
              {it.display}
            </button>
          ))}
          {allowOther ? (
            <button
              type="button"
              className={chip(false)}
              onClick={() => {
                onPick({
                  code: `adhoc_${q
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")}`,
                  listType: "",
                  display: q.trim(),
                  synonyms: [],
                  meta: {},
                  ugandaFlag: null,
                });
                setQ("");
              }}
            >
              <PlusIcon className="mr-0.5 inline size-3" aria-hidden />“{q.trim()}” (other)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
