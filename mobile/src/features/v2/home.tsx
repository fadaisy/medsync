/**
 * Visit mode Home on the phone (patient app v2, feature matrix 3.1; redrawn 18 Nov 2026 from the owner's
 * approved prototype): one card for the visit, one quiet group for the patient's own care, and the people the
 * patient books for. The words are the web's (@content/patient-app/home, drafts until the CSO signs).
 *
 * The visit card is one object in every state: the same place and shape, only its content changes. With no
 * visit it holds the two ways to book; with one it holds the day; on the day it holds the code to show at the
 * desk and the stage, in words and one bar. The membership card is on Me and no longer repeated here.
 *
 * `HomeV2View` is props-driven, so the dev gallery renders it on fixtures. No red, amber or green here: nothing on
 * this page is a clinical state (MR5). No queue numbers, and the stage is never a number (MR4). Results are free
 * whatever the plan (MR9).
 *
 * In Care mode (`careMode`, locked until Gate CG) the route also passes `care`, and the top card is then chosen
 * by `homeTop` (home-top.tsx): a reading that needs action, a question from the team, something due, a near
 * visit, the week's readings, or the visit card. When it is not the visit card, the visit sits in one quiet row
 * under it (`VisitRow`). Without `care` this page is the visit card, exactly as before. The one red card is the
 * danger hero, drawn by `HeroCard` in its own allowlisted file; amber and green are only on the trend card.
 */
import type { IconName } from "@/components/tide";
import type { TicketV2Props } from "@/components/tide/v2";
import type { HomeCare } from "@/features/v2/home-top";
import type { StageView } from "@patient-core/visit-stages";
import type { ReactNode } from "react";
import { CARE_V2_COPY as CARE } from "@content/patient-app/care";
import { HOME_V2_COPY as H } from "@content/patient-app/home";
import { VISIT_COPY as V } from "@content/patient-app/visit";
import { STAGES } from "@patient-core/visit-stages";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Avatar, Button, Card, Icon, Press, SectionHead, SkeletonCard } from "@/components/tide";
import { spokenCode } from "@/components/tide/v2";
import { HeroCard } from "@/components/tide/v2-hero";
import { homeTop, HomeTrendCard } from "@/features/v2/home-top";
import { EASE_OUT } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

export type HomeVisit =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "none" }
  | {
      state: "ready";
      ticket: TicketV2Props;
      stage: StageView;
      today: boolean;
      /** The visit is tomorrow: with today, what "near" means for the top card in Care mode. */
      tomorrow?: boolean;
    };

/** The phone holds the tests a clinician ordered and no result values yet (ADR 0342 §2). */
export type HomeResults = { state: "off" } | { state: "ordered"; tests: number; note: string };

export interface HomeV2Props {
  visit: HomeVisit;
  results: HomeResults;
  household: { id: string; label: string }[];
  /** "See a doctor": the current doctors list, where the phone has it (3.5, kept). */
  doctors?: ReactNode;
  /** The ways to the patient's own log while Care mode is locked: readings, medicines and Wellness. */
  careLink: boolean;
  /** Care mode only: what the top card may show in place of the visit. Left out, Home is the visit card. */
  care?: HomeCare;
  onOpenVisit: () => void;
  onRetryVisit: () => void;
  onBookToday: () => void;
  onBookDay: () => void;
  onResults: () => void;
  onBookFor: (id: string) => void;
  onAddSomeone: () => void;
  onCare: () => void;
  onReadings: () => void;
  onMedicines: () => void;
  onWellness: () => void;
}

export function HomeV2View(p: HomeV2Props) {
  return (
    <View style={{ gap: tSpace[6] }}>
      {p.care ? <TopCard {...p} care={p.care} /> : <VisitCard {...p} />}
      <CareGroup {...p} />
      <People {...p} />
      {p.doctors}
    </View>
  );
}

/** "Monday · November" and "16" read as "Monday 16 November". */
export function visitDayLine(ticket: Pick<TicketV2Props, "day" | "dayLine">): string {
  const [weekday, month] = ticket.dayLine.split(" · ");
  return month ? `${weekday} ${ticket.day} ${month}` : `${ticket.day} ${ticket.dayLine}`;
}

/* ─── The top card in Care mode ──────────────────────────────────────────────── */

/**
 * What matters most right now, by `homeTop`. While the care rows load the card waits, so it never shows the
 * visit and then swaps. Anything that is not the visit card has the visit in a row under it.
 */
function TopCard(p: HomeV2Props & { care: HomeCare }) {
  const c = p.care;
  if (c.state === "loading")
    return <SkeletonCard label="Loading your visits" lines={3} height={236} />;
  if (c.state === "none") return <VisitCard {...p} />;
  const top = homeTop({ today: c.today, visit: p.visit, trend: c.trend !== null });
  if (top.kind === "visit") return <VisitCard {...p} />;
  const trend = c.trend;
  return (
    <View style={{ gap: tSpace[4] }}>
      {top.kind === "trends" ? (
        trend ? (
          <HomeTrendCard
            trend={trend}
            first={c.noReadings === true}
            onLog={() => c.onLog(trend.metric)}
            onSeeAll={c.onSeeAll}
          />
        ) : null
      ) : (
        <HeroCard hero={top.hero} onAction={() => c.onHeroAction(top.hero)} />
      )}
      <VisitRow {...p} />
    </View>
  );
}

/**
 * The visit, in one quiet row under a top card that is showing something else: the next visit and its day,
 * today's visit with its code, a failed load with the way to try again, or "No visit booked" leading to
 * booking. Never a stage as a number (MR4) and never an hour that is not the ticket's own window.
 */
function VisitRow(p: HomeV2Props) {
  const t = useTide();
  const v = p.visit;
  // Still loading: nothing to say yet, and the row arrives with the answer.
  if (v.state === "loading") return null;
  const row =
    v.state === "failed"
      ? { title: H.phone.visitFailed, line: H.phone.retry, code: null, go: p.onRetryVisit }
      : v.state === "none"
        ? { title: H.none, line: H.noneNote, code: null, go: p.onBookDay }
        : v.today
          ? {
              title: H.today,
              line: v.stage.index === 0 ? V.ticket.showCode : v.stage.label,
              code: v.ticket.code,
              go: p.onOpenVisit,
            }
          : {
              title: H.next,
              line: `${visitDayLine(v.ticket)} · ${v.ticket.clinic}`,
              code: v.tomorrow ? v.ticket.code : null,
              go: p.onOpenVisit,
            };
  return (
    <Press
      testID="home-visit-row"
      onPress={row.go}
      accessibilityRole={v.state === "failed" ? "button" : "link"}
      accessibilityLabel={[row.title, row.line, row.code ? spokenCode(row.code) : null]
        .filter(Boolean)
        .join(". ")}
      style={{
        minHeight: 68,
        paddingVertical: tSpace[3],
        paddingHorizontal: tSpace[3.5],
        borderRadius: tRadius.cardLg,
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.surface2,
        }}
      >
        <Icon name="calendar" size={20} color={t.area.visits} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{row.title}</Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{row.line}</Text>
      </View>
      {row.code ? <CodePill code={row.code} announce={false} /> : null}
      <Icon name="forward" size={20} color={t.ink3} />
    </Press>
  );
}

/* ─── The visit card ─────────────────────────────────────────────────────────── */

function VisitCard(p: HomeV2Props) {
  const t = useTide();
  const v = p.visit;
  if (v.state === "loading")
    return <SkeletonCard label="Loading your visits" lines={3} height={236} />;

  const ready = v.state === "ready" ? v : null;
  const today = ready?.today ?? false;
  return (
    <Card radius={tRadius.xl} padding={tSpace[5]} style={{ gap: tSpace[4] }}>
      <View
        style={{
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tSpace[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], flexShrink: 1 }}>
          {/* The visits place: a dot beside the words, never a fill behind them. */}
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.area.visits }} />
          <Text style={[tType.overline, { color: t.ink2 }]}>{today ? H.today : H.next}</Text>
        </View>
        {ready && !today ? <CodePill code={ready.ticket.code} /> : null}
      </View>

      {v.state === "failed" ? (
        <>
          <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
            {H.phone.visitFailed}
          </Text>
          <Button label={H.phone.retry} variant="outline" onPress={p.onRetryVisit} />
        </>
      ) : null}

      {v.state === "none" ? (
        <>
          <View style={{ gap: tSpace[1] }}>
            <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
              {H.none}
            </Text>
            <Text style={[tType.bodyM, { color: t.ink2 }]}>{H.noneNote}</Text>
          </View>
          <View style={{ gap: tSpace[2] }}>
            <Button label={H.book.day} variant="accent" onPress={p.onBookDay} />
            <Quiet label={H.book.today} onPress={p.onBookToday} />
          </View>
        </>
      ) : null}

      {ready ? (
        <>
          <View style={{ gap: tSpace[1] }}>
            <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
              {today ? V.ticket.showCode : visitDayLine(ready.ticket)}
            </Text>
            <Text style={[tType.bodyM, { color: t.ink2 }]}>
              {ready.ticket.clinic} · {ready.ticket.hospitalName}
            </Text>
            {/* Who it is for: the next visit can be a parent's or a child's. */}
            <Text style={[tType.bodyM, { color: t.ink2 }]}>
              {ready.ticket.patient} · {ready.ticket.window}
            </Text>
          </View>
          {today ? (
            <View
              accessible
              accessibilityLabel={spokenCode(ready.ticket.code)}
              style={{
                borderRadius: tRadius.md,
                paddingVertical: tSpace[3.5],
                alignItems: "center",
                backgroundColor: t.surface2,
              }}
            >
              <Text
                style={{
                  fontFamily: tFont.mono,
                  fontSize: 28,
                  lineHeight: 32,
                  letterSpacing: 3,
                  color: t.ink,
                }}
              >
                {ready.ticket.code}
              </Text>
            </View>
          ) : null}
          {today ? <StageBar view={ready.stage} /> : null}
          <View style={{ gap: tSpace[2] }}>
            <Button label={H.seeVisit} variant="accent" onPress={p.onOpenVisit} />
            <Quiet label={H.phone.manageVisit} onPress={p.onOpenVisit} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

/** The visit code, small, in the card's corner. Read out letter by letter. */
function CodePill({ code, announce = true }: { code: string; announce?: boolean }) {
  const t = useTide();
  return (
    <View
      accessible={announce}
      accessibilityLabel={announce ? spokenCode(code) : undefined}
      style={{
        height: 28,
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.pill,
        justifyContent: "center",
        backgroundColor: t.surface2,
      }}
    >
      <Text style={{ fontFamily: tFont.mono, fontSize: 13, letterSpacing: 1.2, color: t.ink }}>
        {code}
      </Text>
    </View>
  );
}

/**
 * Where the patient is, as a sentence and one bar. The bar is how far along the day is; it is hidden from
 * screen readers, which hear the words. Never "step 3 of 5": the stage is not a number (MR4).
 */
export function StageBar({ view }: { view: StageView }) {
  const t = useTide();
  const reduced = useReducedMotion();
  return (
    <View style={{ gap: tSpace[2] }}>
      <Text style={[tType.label, { color: t.ink }]}>{view.label}</Text>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ height: 6, borderRadius: 3, backgroundColor: t.surface3, overflow: "hidden" }}
      >
        <Animated.View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: t.ink,
            width: `${((view.index + 1) / STAGES.length) * 100}%`,
            transitionProperty: "width",
            transitionDuration: reduced ? 0 : 400,
            transitionTimingFunction: EASE_OUT,
          }}
        />
      </View>
    </View>
  );
}

/** The second, quieter action under a card's main button: a 48 pt row of teal text. */
function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={[tType.label, { fontSize: 15, color: t.accentText }]}>{label}</Text>
    </Press>
  );
}

/* ─── Your care ──────────────────────────────────────────────────────────────── */

function CareGroup(p: HomeV2Props) {
  const t = useTide();
  const doors: { key: string; label: string; icon: IconName; color: string; go: () => void }[] = [
    {
      key: "readings",
      label: H.phone.care.readings,
      icon: "activity",
      color: t.area.readings,
      go: p.onReadings,
    },
    {
      key: "medicines",
      label: H.phone.care.medicines,
      icon: "pill",
      color: t.area.medicines,
      go: p.onMedicines,
    },
    { key: "results", label: H.results.title, icon: "flask", color: t.area.team, go: p.onResults },
    {
      key: "wellness",
      label: CARE.wellness.title,
      icon: "walk",
      color: t.area.me,
      go: p.onWellness,
    },
  ];
  const ordered = p.results.state === "ordered" ? p.results : null;
  const resultsLine = ordered
    ? ordered.tests === 1
      ? H.phone.results.orderedOne
      : H.phone.results.ordered.replace("{n}", String(ordered.tests))
    : H.results.off;

  const results = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.bodyM, { color: ordered ? t.ink : t.ink2 }]}>{resultsLine}</Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{H.results.free}</Text>
      </View>
      {ordered ? <Icon name="forward" size={18} color={t.ink3} /> : null}
    </View>
  );
  const resultsRow = ordered ? (
    <Press
      onPress={p.onResults}
      accessibilityRole="link"
      accessibilityLabel={`${resultsLine}. ${H.results.free}. ${H.results.open}`}
      style={{ minHeight: 48, justifyContent: "center" }}
    >
      {results}
    </Press>
  ) : (
    <View style={{ minHeight: 48, justifyContent: "center" }}>{results}</View>
  );

  if (!p.careLink)
    return (
      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={H.results.title} />
        <Card padding={tSpace[4]}>{resultsRow}</Card>
      </View>
    );

  return (
    <View style={{ gap: tSpace[3] }}>
      <Press
        onPress={p.onCare}
        accessibilityRole="link"
        accessibilityLabel={`${H.phone.care.open}. ${H.phone.care.note}`}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
          {H.phone.care.title}
        </Text>
        <Icon name="forward" size={20} color={t.ink3} />
      </Press>
      <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
        <View style={{ flexDirection: "row" }}>
          {doors.map((d) => (
            <Press
              key={d.key}
              onPress={d.go}
              accessibilityLabel={d.label}
              style={{
                flex: 1,
                alignItems: "center",
                gap: tSpace[1.5],
                paddingVertical: tSpace[1],
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: t.surface2,
                }}
              >
                <Icon name={d.icon} size={22} color={d.color} />
              </View>
              <Text numberOfLines={1} style={[tType.caption, { color: t.ink }]}>
                {d.label}
              </Text>
            </Press>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: t.line }} />
        {resultsRow}
      </Card>
    </View>
  );
}

/* ─── People you book for ────────────────────────────────────────────────────── */

const initialOf = (label: string) => label.trim().charAt(0).toUpperCase() || "?";

function People(p: HomeV2Props) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[3] }}>
      <SectionHead title={H.household.title} />
      {p.household.length === 0 ? (
        <Text style={[tType.bodyM, { color: t.ink2 }]}>{H.household.none}</Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
        {p.household.map((m) => (
          <Press
            key={m.id}
            onPress={() => p.onBookFor(m.id)}
            accessibilityRole="link"
            accessibilityLabel={H.household.book.replace("{name}", m.label)}
            style={{
              height: 48,
              paddingLeft: tSpace[1.5],
              paddingRight: tSpace[4],
              borderRadius: tRadius.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2],
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.lineStrong,
            }}
          >
            <Avatar initials={initialOf(m.label)} size={36} />
            <Text numberOfLines={1} style={[tType.label, { fontSize: 15, color: t.ink }]}>
              {m.label}
            </Text>
          </Press>
        ))}
        <Press
          onPress={p.onAddSomeone}
          accessibilityLabel={H.household.add}
          style={{
            height: 48,
            paddingLeft: tSpace[3],
            paddingRight: tSpace[4],
            borderRadius: tRadius.pill,
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[1.5],
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: t.lineStrong,
          }}
        >
          <Icon name="plus" size={18} color={t.ink2} strokeWidth={2} />
          <Text style={[tType.label, { fontSize: 15, color: t.ink2 }]}>{H.household.add}</Text>
        </Press>
      </View>
    </View>
  );
}
