"use client";

import type { CarryForward } from "../actions";
import type { PicklistItem } from "@/lib/clerkship/catalog";
import type {
  ClerkAllergy,
  ClerkMedication,
  ClerkPmhItem,
  ClerkPshItem,
} from "@/lib/encounter/clerkship";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";

import { PMH_SCREEN } from "@/lib/clerkship/history";
import { loadCarryForwardAction, loadClerkshipPicklistsAction } from "../actions";

/**
 * Tap-first history sections — Past Medical, Past Surgical, Drug & Allergies.
 * Curated pick-lists + chips/toggles/number-pickers; free-text is the per-item
 * fallback. Explicit recorded negatives (NKDA / none / no operations) — not
 * blank. Writes to section_data; PMH conditions → problem list, drugs →
 * medications, allergies → allergies (encounter objects). Decision-support.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const SECTION = "border-border/70 flex flex-col gap-3 rounded-xl border p-3.5";
const H = "text-foreground text-[13px] font-semibold";
const chip = (active: boolean) =>
  `rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const NIL = `inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset ${EASE}`;
const tinyInput =
  "border-input bg-card rounded px-1.5 py-0.5 text-[12px] outline-none focus-visible:border-teal-500";

type Props = {
  pmhItems: ClerkPmhItem[];
  setPmhItems: (v: ClerkPmhItem[]) => void;
  pmhScreen: Record<string, "yes" | "no" | "unsure">;
  setPmhScreen: (v: Record<string, "yes" | "no" | "unsure">) => void;
  pshItems: ClerkPshItem[];
  setPshItems: (v: ClerkPshItem[]) => void;
  medications: ClerkMedication[];
  setMedications: (v: ClerkMedication[]) => void;
  allergies: ClerkAllergy[];
  setAllergies: (v: ClerkAllergy[]) => void;
  negatives: Record<string, boolean>;
  setNegatives: (v: Record<string, boolean>) => void;
  encounterId: string;
};

export function HistorySections(p: Props) {
  const [lists, setLists] = useState<Record<string, PicklistItem[]> | null>(null);
  const [carry, setCarry] = useState<CarryForward | null>(null);
  useEffect(() => {
    loadClerkshipPicklistsAction()
      .then(setLists)
      .catch(() => setLists({}));
    loadCarryForwardAction(p.encounterId)
      .then(setCarry)
      .catch(() => setCarry(null));
  }, [p.encounterId]);

  const setNeg = (key: string, on: boolean) => p.setNegatives({ ...p.negatives, [key]: on });

  // Carry-forward: surface the patient's stored record to CONFIRM/import — not re-enter.
  const newAllergies = (carry?.allergies ?? []).filter(
    (a) => !p.allergies.some((x) => x.substance.toLowerCase() === a.substance.toLowerCase()),
  );
  const newProblems = (carry?.problems ?? []).filter(
    (pr) => !p.pmhItems.some((x) => x.display.toLowerCase() === pr.item.toLowerCase()),
  );
  const newMeds = (carry?.medications ?? []).filter(
    (m) => !p.medications.some((x) => x.name.toLowerCase() === m.name.toLowerCase()),
  );
  const hasCarry = newAllergies.length || newProblems.length || newMeds.length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Carry-forward: confirm/import from the patient's record (not re-enter) ── */}
      {hasCarry ? (
        <div className="rounded-xl border border-teal-200/70 bg-teal-50/50 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.1em] text-teal-700 uppercase dark:text-teal-400">
            From this patient&apos;s record — tap to confirm into this encounter
          </span>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {newAllergies.length ? (
              <CarryRow label="Allergies">
                {newAllergies.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    className={chip(false)}
                    onClick={() => {
                      setNeg("nkda", false);
                      p.setAllergies([
                        ...p.allergies,
                        {
                          substance: a.substance,
                          reaction: a.reaction ?? undefined,
                          severity: (a.severity as ClerkAllergy["severity"]) ?? undefined,
                        },
                      ]);
                    }}
                  >
                    <PlusIcon className="mr-0.5 inline size-3" aria-hidden />
                    {a.substance}
                  </button>
                ))}
              </CarryRow>
            ) : null}
            {newProblems.length ? (
              <CarryRow label="Problems">
                {newProblems.map((pr, i) => (
                  <button
                    key={i}
                    type="button"
                    className={chip(false)}
                    onClick={() => {
                      setNeg("no_pmh", false);
                      p.setPmhItems([...p.pmhItems, { code: `record_${i}`, display: pr.item }]);
                    }}
                  >
                    <PlusIcon className="mr-0.5 inline size-3" aria-hidden />
                    {pr.item}
                  </button>
                ))}
              </CarryRow>
            ) : null}
            {newMeds.length ? (
              <CarryRow label="Medications">
                {newMeds.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    className={chip(false)}
                    onClick={() => {
                      setNeg("no_meds", false);
                      p.setMedications([
                        ...p.medications,
                        {
                          name: m.name,
                          dose: m.dose ?? undefined,
                          route: m.route ?? undefined,
                          frequency: m.frequency ?? undefined,
                        },
                      ]);
                    }}
                  >
                    <PlusIcon className="mr-0.5 inline size-3" aria-hidden />
                    {m.name}
                  </button>
                ))}
              </CarryRow>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Past Medical History ── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={H}>Past medical history</span>
          <NilTap
            label="No significant PMH"
            on={!!p.negatives.no_pmh}
            onToggle={(v) => {
              setNeg("no_pmh", v);
              if (v) p.setPmhItems([]);
            }}
          />
        </div>
        {!p.negatives.no_pmh ? (
          <>
            <Picker
              items={lists?.condition ?? []}
              placeholder="Add a condition…"
              onPick={(it) =>
                p.setPmhItems([
                  ...p.pmhItems,
                  { code: it.code, display: it.display, adHoc: it.code.startsWith("adhoc_") },
                ])
              }
            />
            {p.pmhItems.map((item, i) => {
              const meta = (lists?.condition ?? []).find((c) => c.code === item.code)?.meta as
                | { complications?: string[] }
                | undefined;
              return (
                <ItemCard
                  key={i}
                  title={item.display}
                  onRemove={() => p.setPmhItems(p.pmhItems.filter((_, j) => j !== i))}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${tinyInput} w-20`}
                      placeholder="Year"
                      value={item.year ?? ""}
                      onChange={(e) =>
                        p.setPmhItems(
                          p.pmhItems.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)),
                        )
                      }
                    />
                    {(
                      [
                        "well_controlled",
                        "poorly_controlled",
                        "remission",
                        "resolved",
                        "newly_diagnosed",
                      ] as const
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={chip(item.status === s)}
                        onClick={() =>
                          p.setPmhItems(
                            p.pmhItems.map((x, j) =>
                              j === i ? { ...x, status: x.status === s ? undefined : s } : x,
                            ),
                          )
                        }
                      >
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={chip(!!item.onTreatment)}
                      onClick={() =>
                        p.setPmhItems(
                          p.pmhItems.map((x, j) =>
                            j === i ? { ...x, onTreatment: !x.onTreatment } : x,
                          ),
                        )
                      }
                    >
                      on treatment
                    </button>
                  </div>
                  {meta?.complications?.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground text-[10px] uppercase">
                        complications
                      </span>
                      {meta.complications.map((c) => {
                        const on = item.complications?.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            className={chip(!!on)}
                            onClick={() =>
                              p.setPmhItems(
                                p.pmhItems.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        complications: on
                                          ? (x.complications ?? []).filter((y) => y !== c)
                                          : [...(x.complications ?? []), c],
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </ItemCard>
              );
            })}
            {/* Always-screen toggles */}
            <div className="border-border/50 mt-1 border-t pt-2">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Ever had? (quick screen)
              </span>
              <div className="mt-1.5 flex flex-col gap-1">
                {PMH_SCREEN.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <span className="text-[12px]">{s.label}</span>
                    <TriToggle
                      value={p.pmhScreen[s.key]}
                      onChange={(v) => {
                        const next = { ...p.pmhScreen };
                        if (v) next[s.key] = v;
                        else delete next[s.key];
                        p.setPmhScreen(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* ── Past Surgical History ── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={H}>Past surgical history</span>
          <NilTap
            label="No previous operations"
            on={!!p.negatives.no_psh}
            onToggle={(v) => {
              setNeg("no_psh", v);
              if (v) p.setPshItems([]);
            }}
          />
        </div>
        {!p.negatives.no_psh ? (
          <>
            <Picker
              items={lists?.operation ?? []}
              placeholder="Add an operation…"
              onPick={(it) =>
                p.setPshItems([...p.pshItems, { code: it.code, display: it.display }])
              }
            />
            {p.pshItems.map((item, i) => (
              <ItemCard
                key={i}
                title={item.display}
                onRemove={() => p.setPshItems(p.pshItems.filter((_, j) => j !== i))}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${tinyInput} w-20`}
                    placeholder="Year"
                    value={item.year ?? ""}
                    onChange={(e) =>
                      p.setPshItems(
                        p.pshItems.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)),
                      )
                    }
                  />
                  {(["ga", "spinal", "local", "unsure"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={chip(item.anaesthetic === a)}
                      onClick={() =>
                        p.setPshItems(
                          p.pshItems.map((x, j) =>
                            j === i
                              ? { ...x, anaesthetic: x.anaesthetic === a ? undefined : a }
                              : x,
                          ),
                        )
                      }
                    >
                      {a === "ga" ? "GA" : a}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={chip(!!item.anaestheticComplication)}
                    onClick={() =>
                      p.setPshItems(
                        p.pshItems.map((x, j) =>
                          j === i
                            ? { ...x, anaestheticComplication: !x.anaestheticComplication }
                            : x,
                        ),
                      )
                    }
                  >
                    anaesthetic complication
                  </button>
                </div>
              </ItemCard>
            ))}
          </>
        ) : null}
      </section>

      {/* ── Drug history ── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={H}>Drug history</span>
          <NilTap
            label="No regular medications"
            on={!!p.negatives.no_meds}
            onToggle={(v) => {
              setNeg("no_meds", v);
              if (v) p.setMedications([]);
            }}
          />
        </div>
        {!p.negatives.no_meds ? (
          <>
            <Picker
              items={lists?.drug ?? []}
              placeholder="Add a medication…"
              allowOther
              onPick={(it) =>
                p.setMedications([
                  ...p.medications,
                  { name: it.display, adHoc: it.code.startsWith("adhoc_") },
                ])
              }
            />
            {p.medications.map((m, i) => (
              <ItemCard
                key={i}
                title={m.name}
                onRemove={() => p.setMedications(p.medications.filter((_, j) => j !== i))}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${tinyInput} w-24`}
                    placeholder="Dose"
                    value={m.dose ?? ""}
                    onChange={(e) =>
                      p.setMedications(
                        p.medications.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)),
                      )
                    }
                  />
                  {["OD", "BD", "TDS", "QDS", "PRN", "weekly"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={chip(m.frequency === f)}
                      onClick={() =>
                        p.setMedications(
                          p.medications.map((x, j) =>
                            j === i ? { ...x, frequency: x.frequency === f ? undefined : f } : x,
                          ),
                        )
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground text-[10px] uppercase">adherence</span>
                  {(["good", "occasional_miss", "frequent_miss", "stopped"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={chip(m.adherence === a)}
                      onClick={() =>
                        p.setMedications(
                          p.medications.map((x, j) =>
                            j === i ? { ...x, adherence: x.adherence === a ? undefined : a } : x,
                          ),
                        )
                      }
                    >
                      {a.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </ItemCard>
            ))}
            <p className="text-muted-foreground text-[10.5px]">
              Prompt OTC, herbal / traditional remedies, contraceptives, recent
              antibiotics/steroids.
            </p>
          </>
        ) : null}
      </section>

      {/* ── Allergies ── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={H}>Allergies</span>
          <NilTap
            label="NKDA"
            title="No known drug allergies"
            on={!!p.negatives.nkda}
            onToggle={(v) => {
              setNeg("nkda", v);
              if (v) p.setAllergies([]);
            }}
          />
        </div>
        {!p.negatives.nkda ? (
          <>
            <Picker
              items={lists?.allergen ?? []}
              placeholder="Add an allergy…"
              allowOther
              onPick={(it) => p.setAllergies([...p.allergies, { substance: it.display }])}
            />
            {p.allergies.map((a, i) => (
              <ItemCard
                key={i}
                title={a.substance}
                onRemove={() => p.setAllergies(p.allergies.filter((_, j) => j !== i))}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground text-[10px] uppercase">reaction</span>
                  {[
                    "rash",
                    "urticaria",
                    "angioedema",
                    "anaphylaxis",
                    "GI upset",
                    "breathing difficulty",
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={chip((a.reaction ?? "").split(",").includes(r))}
                      onClick={() => p.setAllergies(toggleReaction(p.allergies, i, r))}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground text-[10px] uppercase">severity</span>
                  {(["mild", "moderate", "severe", "anaphylaxis"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={chip(a.severity === s)}
                      onClick={() =>
                        p.setAllergies(
                          p.allergies.map((x, j) =>
                            j === i ? { ...x, severity: x.severity === s ? undefined : s } : x,
                          ),
                        )
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </ItemCard>
            ))}
            <p className="text-muted-foreground text-[10.5px]">Allergies surface at prescribing.</p>
          </>
        ) : null}
      </section>
    </div>
  );
}

function toggleReaction(allergies: ClerkAllergy[], i: number, r: string): ClerkAllergy[] {
  return allergies.map((x, j) => {
    if (j !== i) return x;
    const cur = (x.reaction ?? "").split(", ").filter(Boolean);
    const next = cur.includes(r) ? cur.filter((y) => y !== r) : [...cur, r];
    return { ...x, reaction: next.join(", ") || undefined };
  });
}

function CarryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[10px] tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function NilTap({
  label,
  title,
  on,
  onToggle,
}: {
  label: string;
  title?: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      title={title}
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

function TriToggle({
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
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items
      .filter(
        (it) =>
          it.display.toLowerCase().includes(s) ||
          it.synonyms.some((y) => y.toLowerCase().includes(s)),
      )
      .slice(0, 8);
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
