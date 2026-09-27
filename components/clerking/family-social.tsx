"use client";

import type { HistoryBodyProps } from "./history-sections";
import type { History } from "@/lib/clerking/answers";
import type { Option } from "@/lib/clerking/catalogue";
import type { ReactNode } from "react";
import { LockIcon } from "lucide-react";

import { packYears, setAlcohol, setTobacco, toggleEntry, toggleIn } from "@/lib/clerking/answers";
import { isRestricted } from "@/lib/clerking/catalogue";
import { Chip, Stepper, YesNoRow } from "./controls";

/**
 * [05] Family history (§5.7) and [06] Social history (§5.8). Both are note-only in the draft:
 * family conditions are written, one per relative, when the note is signed (H13); tobacco status
 * commits as soc.tobacco at signing (H4); the rest stays in the note until CFC v1.2 is signed.
 * Hook-free, so the tests press them.
 */

function Lock() {
  return (
    <span title="Restricted" className="text-muted-foreground inline-flex">
      <LockIcon aria-hidden className="size-3" />
      <span className="sr-only">Restricted</span>
    </span>
  );
}

/* ─── [05] Family ───────────────────────────────────────────────── */

export function FamilyBody({ cat, history, onHistory, editable }: HistoryBodyProps) {
  const list = cat.data.family_history.conditions;
  const rel = cat.data.option_sets[cat.data.family_history.relations_ref] ?? [];
  const put = (fn: (f: History["family"]) => History["family"]) =>
    onHistory((h) => ({ ...h, family: fn(h.family) }));
  const yes = list.filter((c) => history.family[c.id]?.answer === "yes");
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-body-s text-foreground font-medium">In a parent, sibling or child</h3>
      <div className="grid gap-x-8 sm:grid-cols-2">
        {list.map((c) => (
          <YesNoRow
            key={c.id}
            label={c.label}
            value={history.family[c.id]?.answer}
            restricted={isRestricted(c.sensitivity)}
            disabled={!editable}
            onAnswer={(a) => put((f) => toggleEntry(f, c.id, a))}
          />
        ))}
      </div>
      {yes.map((c) => {
        const who = history.family[c.id]?.relations ?? [];
        return (
          <div
            key={c.id}
            data-family={c.id}
            className="bg-muted/40 border-border flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-3"
          >
            <span className="text-body-s text-foreground font-medium">{`${c.label}: who`}</span>
            <div role="group" aria-label={`${c.label}: who`} className="flex flex-wrap gap-1.5">
              {rel.map((o) => (
                <Chip
                  key={o.id}
                  selected={who.includes(o.id)}
                  disabled={!editable}
                  onPress={() =>
                    put((f) => {
                      const cur = f[c.id];
                      if (!cur) return f;
                      const relations = toggleIn(cur.relations, o.id);
                      const next = { ...cur, relations };
                      if (!relations) delete next.relations;
                      return { ...f, [c.id]: next };
                    })
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── [06] Social ───────────────────────────────────────────────── */

/** A label column (110 px, as the prototype) and its controls. */
function Row({ label, lock, children }: { label: string; lock?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <span className="text-caption text-muted-foreground inline-flex items-center gap-1 sm:w-[110px] sm:shrink-0 sm:pt-2">
        {label}
        {lock ? <Lock /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function Chips({
  label,
  options,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  options: readonly Option[];
  selected: (id: string) => boolean;
  onPress: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.id}
          selected={selected(o.id)}
          disabled={disabled}
          onPress={() => onPress(o.id)}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

const INPUT =
  "border-input bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-8 w-full max-w-sm rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11 disabled:opacity-60";

export function SocialBody({ cat, history, onHistory, editable }: HistoryBodyProps) {
  const sh = cat.data.social_history;
  const so = history.social;
  const off = !editable;
  const put = (fn: (s: History["social"]) => History["social"]) =>
    onHistory((h) => ({ ...h, social: fn(h.social) }));
  const one = <K extends keyof History["social"]>(key: K, id: string) =>
    put((s) => {
      const next = { ...s };
      if (next[key] === id) delete next[key];
      else (next as Record<string, unknown>)[key] = id;
      return next;
    });
  const many = (key: "otherForms" | "drinks" | "substances", id: string, exclusive?: string[]) =>
    put((s) => {
      const list = toggleIn(s[key], id, exclusive);
      const next = { ...s, [key]: list };
      if (!list) delete next[key];
      return next;
    });
  const step = (key: "perDay" | "years", max: number) => (d: 1 | -1) =>
    put((s) => ({ ...s, [key]: Math.min(max, Math.max(0, (s[key] ?? 0) + d)) }));
  const smoker = so.tobacco === "former" || so.tobacco === "current";
  const py = packYears(so.perDay, so.years);
  const drinks = !!so.alcohol && so.alcohol !== "none";
  const substancesLocked = isRestricted(sh.other_substances.sensitivity);
  return (
    <div className="flex flex-col gap-4">
      <Row label="Tobacco">
        <Chips
          label="Tobacco"
          options={sh.tobacco.status}
          selected={(id) => so.tobacco === id}
          onPress={(id) => put((s) => setTobacco(s, id))}
          disabled={off}
        />
        {smoker ? (
          <>
            <div className="text-body-s text-muted-foreground flex flex-wrap items-center gap-2">
              <Stepper
                label="Cigarettes a day"
                value={so.perDay ?? null}
                onStep={step("perDay", 999)}
                disabled={off}
              />
              <span>a day</span>
              <span>for</span>
              <Stepper
                label="Years smoked"
                value={so.years ?? null}
                onStep={step("years", 120)}
                disabled={off}
              />
              <span>years</span>
              {py !== null ? (
                <output
                  aria-label="Pack-years"
                  className="text-foreground ml-2 font-mono tabular-nums"
                >{`${py} pack-years`}</output>
              ) : null}
            </div>
            <Chips
              label="Other forms of tobacco"
              options={sh.tobacco.other_forms}
              selected={(id) => !!so.otherForms?.includes(id)}
              onPress={(id) => many("otherForms", id)}
              disabled={off}
            />
            {so.tobacco === "former" ? (
              <Chips
                label="Stopped"
                options={sh.tobacco.quit_when}
                selected={(id) => so.quitWhen === id}
                onPress={(id) => one("quitWhen", id)}
                disabled={off}
              />
            ) : null}
          </>
        ) : null}
      </Row>
      <Row label="Alcohol">
        <Chips
          label="Alcohol"
          options={sh.alcohol.pattern}
          selected={(id) => so.alcohol === id}
          onPress={(id) => put((s) => setAlcohol(s, id))}
          disabled={off}
        />
        {drinks ? (
          <Chips
            label="Drinks"
            options={sh.alcohol.types}
            selected={(id) => !!so.drinks?.includes(id)}
            onPress={(id) => many("drinks", id)}
            disabled={off}
          />
        ) : null}
      </Row>
      <Row label="Other substances" lock={substancesLocked}>
        <Chips
          label="Other substances"
          options={sh.other_substances.options}
          selected={(id) => !!so.substances?.includes(id)}
          onPress={(id) => many("substances", id, ["none"])}
          disabled={off}
        />
      </Row>
      <Row label="Lives">
        <Chips
          label="Lives"
          options={sh.living}
          selected={(id) => so.living === id}
          onPress={(id) => one("living", id)}
          disabled={off}
        />
      </Row>
      <Row label="Activity">
        <Chips
          label="Activity"
          options={sh.activity}
          selected={(id) => so.activity === id}
          onPress={(id) => one("activity", id)}
          disabled={off}
        />
      </Row>
      <Row label="Occupation">
        <input
          aria-label="Occupation"
          className={INPUT}
          value={so.occupation ?? ""}
          disabled={off}
          onChange={(e) => {
            const v = e.target.value;
            put((s) => {
              const next: History["social"] = { ...s, occupation: v };
              if (!v) delete next.occupation;
              return next;
            });
          }}
        />
        <div role="group" aria-label="Occupation hints" className="flex flex-wrap gap-1.5">
          {sh.occupation.hints.map((hint) => (
            <Chip
              key={hint}
              dashed
              selected={false}
              disabled={off}
              onPress={() => put((s) => ({ ...s, occupation: hint }))}
            >
              {hint}
            </Chip>
          ))}
        </div>
      </Row>
      <Row label="Travel">
        <Chips
          label="Travel"
          options={sh.travel.options}
          selected={(id) => so.travel === id}
          onPress={(id) =>
            put((s) => {
              const next = { ...s, travel: s.travel === id ? undefined : id };
              if (!next.travel) delete next.travel;
              if (!next.travel || next.travel === "none") delete next.travelDetail;
              return next;
            })
          }
          disabled={off}
        />
        {so.travel && so.travel !== "none" ? (
          <input
            aria-label="Where and when"
            placeholder="Where and when"
            className={INPUT}
            value={so.travelDetail ?? ""}
            disabled={off}
            onChange={(e) => {
              const v = e.target.value;
              put((s) => {
                const next: History["social"] = { ...s, travelDetail: v };
                if (!v) delete next.travelDetail;
                return next;
              });
            }}
          />
        ) : null}
      </Row>
      <Row label="Diet">
        <Chips
          label="Diet"
          options={sh.diet}
          selected={(id) => so.diet === id}
          onPress={(id) => one("diet", id)}
          disabled={off}
        />
      </Row>
    </div>
  );
}
