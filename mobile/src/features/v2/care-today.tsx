/**
 * Care mode on the phone, part 1 (patient app v2 §5.6 to §5.7; Step 7), behind `appV2Mobile` and `careMode`
 * (off in production until Gate CG, MR11). Today: one hero from the ladder (S17), the plan as a day bar and
 * tickable rows (ticks queue offline, S18), the reading snippets (+ Log opens Add a reading for that measure),
 * and the week of medicines. The Plan page: the day as a vertical list and the week. Medicines: each dose with
 * why, when and status, "as on your pharmacy label" (MR3: never an amount).
 *
 * Props-driven so `/dev/care-v2` renders them on fixtures; the routes below load the patient's own rows.
 */
import type { PlanPoint } from "@/components/tide/v2";
import type { PlanSlot, WeekMark } from "@patient-core/care-plan";
import type { Hero } from "@patient-core/today-hero";
import type { SugarContext } from "@patient-core/readings";
import { Text, View } from "react-native";
import { CARE_V2_COPY } from "@content/patient-app/care";

import { Button, Card, SectionHead } from "@/components/tide";
import { DayBar, DoseRow, ReadingSnippet } from "@/components/tide/v2";
import { HeroCard } from "@/components/tide/v2-hero";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const C = CARE_V2_COPY;

export interface Snippet {
  metric: "bp" | "sugar" | "weight";
  ctx: SugarContext;
  unit: string;
  days: { date: string; value: number | null; bottom?: number | null }[];
  weekAgo: number | null;
}

export interface WeekDot {
  label: string;
  mark: WeekMark;
}

/** A slot as the kit's plan point: done means taken (a skip or a snooze is not done). */
export function pointOf(s: PlanSlot): PlanPoint {
  return { key: s.key, label: s.name, at: s.at, done: s.state === "done", kind: s.kind };
}

export function slotWord(s: PlanSlot): string {
  switch (s.state) {
    case "done":
      return C.plan.taken;
    case "skipped":
      return C.plan.skipped;
    case "snoozed":
      return C.plan.snoozed;
    case "missed":
      return C.plan.missed;
    case "due":
      return C.plan.due;
    case "later":
      return s.at;
  }
}

export function CareTodayV2(p: {
  hero: Hero;
  slots: PlanSlot[];
  nowLabel: string;
  snippets: Snippet[];
  week: WeekDot[];
  note: string | null;
  onHeroAction?: () => void;
  onTick: (s: PlanSlot) => void;
  onLog: (metric: Snippet["metric"]) => void;
  onSeePlan: () => void;
}) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[5] }}>
      <HeroCard hero={p.hero} onAction={p.onHeroAction} />
      {p.note ? (
        <Text accessibilityLiveRegion="polite" style={[tType.caption, { color: t.ink2 }]}>
          {p.note}
        </Text>
      ) : null}

      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={C.plan.title} action={C.plan.seePlan} onAction={p.onSeePlan} />
        {p.slots.length === 0 ? (
          <Text style={[tType.body, { color: t.ink2 }]}>{C.plan.empty}</Text>
        ) : (
          <>
            <DayBar points={p.slots.map(pointOf)} now={p.nowLabel} />
            {p.slots
              .filter((s) => s.state === "due" || s.state === "snoozed" || s.state === "later")
              .slice(0, 3)
              .map((s) => (
                <DoseRow key={s.key} point={pointOf(s)} onToggle={() => p.onTick(s)} />
              ))}
          </>
        )}
      </View>

      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={C.plan.readings} />
        {p.snippets.map((s) => (
          <ReadingSnippet
            key={s.metric}
            metric={s.metric}
            ctx={s.ctx}
            unit={s.unit}
            days={s.days}
            weekAgo={s.weekAgo}
            onLog={() => p.onLog(s.metric)}
          />
        ))}
      </View>

      {p.week.length ? <WeekDots week={p.week} /> : null}
    </View>
  );
}

/** The week as dots, each with its words (never colour alone). Adherence is the patient's habit, not a
 * clinical state: the accent for all taken, outlines otherwise, never red, amber or green. */
export function WeekDots({ week }: { week: WeekDot[] }) {
  const t = useTide();
  return (
    <Card>
      <View style={{ gap: tSpace[3] }}>
        <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
          {C.plan.week}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {week.map((d) => (
            <View
              key={d.label}
              accessible
              accessibilityLabel={`${d.label}: ${C.plan.weekMarks[d.mark]}`}
              style={{ alignItems: "center", gap: tSpace[1.5] }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: tRadius.pill,
                  backgroundColor: d.mark === "taken" ? t.accent : d.mark === "some" ? t.accentTint : t.surface,
                  borderWidth: d.mark === "taken" ? 0 : 1.5,
                  borderColor: d.mark === "missed" ? t.ink3 : d.mark === "none" ? t.line : t.accent,
                  borderStyle: d.mark === "due" ? "dashed" : "solid",
                }}
              />
              <Text style={[tType.caption, { color: t.ink3 }]}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** The Plan page: the whole day, every slot tickable, then the week. */
export function CarePlanV2(p: { slots: PlanSlot[]; week: WeekDot[]; onTick: (s: PlanSlot) => void }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[5] }}>
      {p.slots.length === 0 ? (
        <Text style={[tType.body, { color: t.ink2 }]}>{C.plan.empty}</Text>
      ) : (
        <View style={{ gap: tSpace[2] }}>
          {p.slots.map((s) => (
            <View key={s.key} style={{ gap: tSpace[1] }}>
              <DoseRow point={pointOf(s)} onToggle={() => p.onTick(s)} />
              <Text style={[tType.caption, { color: t.ink3, paddingLeft: tSpace[3] }]}>
                {[s.why, slotWord(s)].filter(Boolean).join(" · ")}
              </Text>
            </View>
          ))}
        </View>
      )}
      {p.week.length ? <WeekDots week={p.week} /> : null}
    </View>
  );
}

/** Medicines: each dose's name, why, when and status, and the week. Never an amount (MR3). */
export function MedicinesV2(p: { slots: PlanSlot[]; week: WeekDot[]; onTick: (s: PlanSlot) => void }) {
  const t = useTide();
  const doses = p.slots.filter((s) => s.kind === "dose");
  return (
    <View style={{ gap: tSpace[4] }}>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{C.plan.label}</Text>
      {doses.length === 0 ? <Text style={[tType.body, { color: t.ink2 }]}>{C.plan.empty}</Text> : null}
      {doses.map((s) => (
        <Card key={s.key}>
          <View style={{ gap: tSpace[2] }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[3] }}>
              <Text style={[tType.label, { color: t.ink, flex: 1 }]}>{s.name}</Text>
              <Text style={[tType.labelS, { color: t.ink2 }]}>{slotWord(s)}</Text>
            </View>
            <Text style={[tType.caption, { color: t.ink3 }]}>{[s.why, s.at].filter(Boolean).join(" · ")}</Text>
            {s.state === "due" || s.state === "snoozed" || s.state === "missed" ? (
              <Button
                label={C.hero.dueAction}
                variant="accent"
                size="md"
                accessibilityLabel={C.plan.tick.replace("{item}", s.name)}
                onPress={() => p.onTick(s)}
              />
            ) : null}
          </View>
        </Card>
      ))}
      {p.week.length ? <WeekDots week={p.week} /> : null}
    </View>
  );
}
