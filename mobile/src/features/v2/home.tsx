/**
 * Visit mode Home on the phone (patient app v2, feature matrix 3.1, boards 1 and 16): the
 * next visit as the ticket (with the stage strip on the day), the two ways to book, the small card, results and
 * the people the patient books for. The same sections and words as the web's `v2-home-web.tsx`
 * (@content/patient-app/home, drafts until the CSO signs).
 *
 * `HomeV2View` is props-driven, so the dev gallery renders it on fixtures. No red, amber or green here: nothing on
 * this page is a clinical state (MR5). No queue numbers (MR4). Results are free whatever the plan (MR9).
 */
import type { TicketV2Props } from "@/components/tide/v2";
import type { StageView } from "@patient-core/visit-stages";
import type { ReactNode } from "react";
import { CARE_V2_COPY as CARE } from "@content/patient-app/care";
import { HOME_V2_COPY as H } from "@content/patient-app/home";
import { MEMBERSHIP_COPY as M } from "@content/patient-app/membership";
import { Text, View } from "react-native";

import {
  Button,
  Card,
  Icon,
  IconDisc,
  Note,
  Press,
  SectionHead,
  SkeletonCard,
  TextLink,
} from "@/components/tide";
import { StageStrip, TicketV2 } from "@/components/tide/v2";
import { BRAND_V2 } from "@/components/tide/v2-shell";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

export type HomeVisit =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "none" }
  | { state: "ready"; ticket: TicketV2Props; stage: StageView; today: boolean };

/** The phone holds the tests a clinician ordered and no result values yet (ADR 0342 §2). */
export type HomeResults = { state: "off" } | { state: "ordered"; tests: number; note: string };

export interface HomeV2Props {
  visit: HomeVisit;
  results: HomeResults;
  household: { id: string; label: string }[];
  /** Null until the membership has loaded: the card waits, it never guesses a tier. */
  card: { tierName: string; memberNo: string; plus: boolean } | null;
  /** "See a doctor": the current doctors list, where the phone has it (3.5, kept). */
  doctors?: ReactNode;
  /** The ways to the patient's own log while Care mode is locked: the Care screen and Wellness. */
  careLink: boolean;
  onOpenVisit: () => void;
  onRetryVisit: () => void;
  onBookToday: () => void;
  onBookDay: () => void;
  onOpenCard: () => void;
  onResults: () => void;
  onBookFor: (id: string) => void;
  onAddSomeone: () => void;
  onCare: () => void;
  onWellness: () => void;
}

export function HomeV2View(p: HomeV2Props) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[6] }}>
      <VisitSection {...p} />

      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={H.book.title} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[3] }}>
          <BookCard
            icon="clock"
            title={H.book.today}
            note={H.book.todayNote}
            onPress={p.onBookToday}
          />
          <BookCard
            icon="calendarPlus"
            title={H.book.day}
            note={H.book.dayNote}
            onPress={p.onBookDay}
          />
        </View>
      </View>

      {p.doctors}

      {p.card ? (
        <Press
          onPress={p.onOpenCard}
          accessibilityLabel={`${H.card.open}. ${BRAND_V2}, ${p.card.tierName}.`}
          style={{
            borderRadius: tRadius.cardLg,
            padding: tSpace[5],
            gap: tSpace[2.5],
            backgroundColor: t.ticket.navy,
            boxShadow: t.shadow.card,
          }}
        >
          <Text style={[tType.overline, { color: t.onBand2 }]}>{H.card.title}</Text>
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={[tType.section, { color: t.ticket.onNavy }]}>{BRAND_V2}</Text>
            <View
              style={{
                borderRadius: tRadius.pill,
                paddingHorizontal: tSpace[2.5],
                paddingVertical: tSpace[1],
                backgroundColor: t.bandGlass,
              }}
            >
              <Text style={[tType.caption, { color: t.ticket.onNavy }]}>{p.card.tierName}</Text>
            </View>
          </View>
          <Text
            style={{
              fontFamily: tFont.mono,
              fontSize: 14,
              letterSpacing: 2.2,
              color: t.ticket.onNavy,
            }}
          >
            {p.card.memberNo}
          </Text>
          {!p.card.plus ? (
            <Text style={[tType.bodyS, { color: t.onBand2 }]}>{M.plans.trial}</Text>
          ) : null}
        </Press>
      ) : null}

      <Card padding={tSpace[5]} style={{ gap: tSpace[3] }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <CardTitle icon="flask">{H.results.title}</CardTitle>
          <View
            style={{
              borderRadius: tRadius.pill,
              paddingHorizontal: tSpace[2.5],
              paddingVertical: tSpace[1],
              backgroundColor: t.accentTint,
            }}
          >
            <Text style={[tType.caption, { color: t.accentText }]}>{H.results.free}</Text>
          </View>
        </View>
        {p.results.state === "ordered" ? (
          <>
            <Text style={[tType.bodyM, { color: t.ink }]}>
              {p.results.tests === 1
                ? H.phone.results.orderedOne
                : H.phone.results.ordered.replace("{n}", String(p.results.tests))}
            </Text>
            <Text style={[tType.bodyS, { color: t.ink3 }]}>{p.results.note}</Text>
            <View style={{ alignSelf: "flex-start" }}>
              <TextLink label={H.results.open} onPress={p.onResults} />
            </View>
          </>
        ) : (
          <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>{H.results.off}</Text>
        )}
      </Card>

      <Card padding={tSpace[5]} style={{ gap: tSpace[3] }}>
        <CardTitle icon="users">{H.household.title}</CardTitle>
        {p.household.length === 0 ? (
          <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>{H.household.none}</Text>
        ) : (
          <View style={{ gap: tSpace[1] }}>
            {p.household.map((m) => (
              <Press
                key={m.id}
                onPress={() => p.onBookFor(m.id)}
                accessibilityRole="link"
                haptic={false}
                style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
              >
                <Text style={[tType.labelS, { fontSize: 15, color: t.accentText }]}>
                  {H.household.book.replace("{name}", m.label)}
                </Text>
              </Press>
            ))}
          </View>
        )}
        <Button
          label={H.household.add}
          variant="soft"
          size="sm"
          onPress={p.onAddSomeone}
          style={{ alignSelf: "flex-start" }}
        />
      </Card>

      {p.careLink ? (
        <View style={{ gap: tSpace[3] }}>
          <LinkRow
            icon="heart"
            title={H.phone.care.title}
            note={H.phone.care.note}
            label={H.phone.care.open}
            onPress={p.onCare}
          />
          <LinkRow
            icon="walk"
            title={CARE.wellness.title}
            note={CARE.wellness.note}
            label={CARE.wellness.title}
            onPress={p.onWellness}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Today's or the next visit; a quiet outline of the ticket when none is booked. */
function VisitSection(p: HomeV2Props) {
  const t = useTide();
  const v = p.visit;
  if (v.state === "loading")
    return (
      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={H.next} />
        <SkeletonCard label="Loading your visits" lines={3} height={220} />
      </View>
    );
  if (v.state === "failed")
    return (
      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={H.next} />
        <Note tone="plain">{H.phone.visitFailed}</Note>
        <Button
          label={H.phone.retry}
          variant="outline"
          size="sm"
          onPress={p.onRetryVisit}
          style={{ alignSelf: "flex-start" }}
        />
      </View>
    );
  if (v.state === "none")
    return (
      <View
        style={{
          borderRadius: tRadius.cardLg,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: t.lineStrong,
          padding: tSpace[5],
          gap: tSpace[3],
        }}
      >
        <IconDisc name="calendarDays" color={t.ink2} bg={t.surface3} size={44} />
        <View style={{ gap: tSpace[1] }}>
          <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
            {H.none}
          </Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>{H.noneNote}</Text>
        </View>
      </View>
    );
  return (
    <View style={{ gap: tSpace[3] }}>
      <SectionHead title={v.today ? H.today : H.next} />
      <TicketV2 {...v.ticket} />
      {v.today ? (
        <Card padding={tSpace[4]}>
          <StageStrip view={v.stage} />
        </Card>
      ) : null}
      <Button
        label={H.seeVisit}
        variant="outline"
        size="md"
        iconRight="arrowRight"
        onPress={p.onOpenVisit}
        style={{ alignSelf: "flex-start" }}
      />
    </View>
  );
}

function BookCard({
  icon,
  title,
  note,
  onPress,
}: {
  icon: "clock" | "calendarPlus";
  title: string;
  note: string;
  onPress: () => void;
}) {
  const t = useTide();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}. ${note}`}
      padding={tSpace[4]}
      // Side by side at phone width; one under the other when the text is set large.
      style={{ flexGrow: 1, flexBasis: 148, gap: tSpace[2] }}
    >
      <Icon name={icon} size={24} color={t.accentText} />
      <Text style={[tType.heading, { color: t.ink }]}>{title}</Text>
      <Text style={[tType.bodyM, { fontSize: 14, lineHeight: 20, color: t.ink2 }]}>{note}</Text>
    </Card>
  );
}

/** One quiet row to a current screen: a disc, a title over a line, a chevron. */
function LinkRow({
  icon,
  title,
  note,
  label,
  onPress,
}: {
  icon: "heart" | "walk";
  title: string;
  note: string;
  label: string;
  onPress: () => void;
}) {
  const t = useTide();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${label}. ${note}`}
      padding={tSpace[4]}
      style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
    >
      <IconDisc name={icon} color={t.ink2} bg={t.surface2} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.label, { color: t.ink }]}>{title}</Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{note}</Text>
      </View>
      <Icon name="forward" size={18} color={t.ink3} />
    </Card>
  );
}

function CardTitle({ icon, children }: { icon: "flask" | "users"; children: ReactNode }) {
  const t = useTide();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], flexShrink: 1 }}>
      <Icon name={icon} size={20} color={t.ink} />
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        {children}
      </Text>
    </View>
  );
}
