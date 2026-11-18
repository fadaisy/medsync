/**
 * Visits, v2 (patient app v2 §5.2, W4 on the phone; redrawn 18 Nov 2026 from the owner's approved prototype):
 * one list for the patient and everyone they book for, with a filter by person. Offers that need an answer
 * come first (labelled, neutral: the design system keeps amber for clinical state, so it overrides the prompt's
 * amber here; with Keep, Pick another day, Cancel), then upcoming visits, each one card with the day, the
 * clinic, who it is for, the code and how it is paid, then past visits in one quiet list.
 *
 * Payment chips never use red, amber or green (MR5); stages never a number (MR4). No hour is promised: a row
 * shows the visit's window as the loader gives it.
 */
import type { PaymentChip } from "@patient-core/payments";
import { useState } from "react";
import { PAYMENTS_COPY } from "@content/patient-app/payments";
import { Text, View } from "react-native";

import { Button, Chip, ChipRow, Icon } from "@/components/tide";
import { Press } from "@/components/tide/press";
import { spokenCode } from "@/components/tide/v2";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

export interface VisitRowV2 {
  id: string;
  day: string;
  dayLabel: string;
  clinic: string;
  who: string;
  window: string;
  code: string;
  chip: PaymentChip;
}

export interface OfferV2 {
  id: string;
  title: string;
  line: string;
}

const CHIP_WORDS: Record<PaymentChip, string | null> = {
  paid_app: PAYMENTS_COPY.chip.paidApp,
  paid_counter: PAYMENTS_COPY.chip.paidCounter,
  at_hospital: PAYMENTS_COPY.chip.atHospital,
  none: null,
};

/** The filter's first chip: everyone. */
const ALL = "All";

export function VisitsList({
  offers,
  upcoming,
  past,
  onOpen,
  onOffer,
}: {
  offers: OfferV2[];
  upcoming: VisitRowV2[];
  past: VisitRowV2[];
  onOpen: (id: string) => void;
  onOffer: (id: string, answer: "keep" | "pick" | "cancel") => void;
}) {
  const t = useTide();
  const [who, setWho] = useState<string | null>(null);
  // The people with a visit on this page, in the order they first appear. One person needs no filter.
  const people = [...new Set([...upcoming, ...past].map((v) => v.who))];
  const chosen = who && people.includes(who) ? who : null;
  const shown = (v: VisitRowV2) => chosen === null || v.who === chosen;
  const coming = upcoming.filter(shown);
  const gone = past.filter(shown);

  return (
    <View style={{ gap: tSpace[6] }}>
      {people.length > 1 ? (
        <ChipRow scroll>
          <Chip label={ALL} selected={chosen === null} onPress={() => setWho(null)} />
          {people.map((p) => (
            <Chip key={p} label={p} selected={chosen === p} onPress={() => setWho(p)} />
          ))}
        </ChipRow>
      ) : null}

      {offers.length ? (
        <View style={{ gap: tSpace[2] }}>
          <Label>Needs your answer</Label>
          {offers.map((o) => (
            <View
              key={o.id}
              style={{
                padding: tSpace[5],
                borderRadius: tRadius.xl,
                backgroundColor: t.surface,
                boxShadow: t.shadow.card,
                gap: tSpace[3],
              }}
            >
              <View style={{ gap: tSpace[1] }}>
                <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
                  {o.title}
                </Text>
                <Text style={[tType.bodyM, { color: t.ink2 }]}>{o.line}</Text>
              </View>
              <Button label="Keep" variant="accent" onPress={() => onOffer(o.id, "keep")} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
                <Button
                  label="Pick another day"
                  variant="outline"
                  size="md"
                  onPress={() => onOffer(o.id, "pick")}
                  style={{ flex: 1 }}
                />
                <Press
                  onPress={() => onOffer(o.id, "cancel")}
                  accessibilityLabel="Cancel"
                  style={{
                    minHeight: 44,
                    paddingHorizontal: tSpace[4],
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={[tType.label, { fontSize: 15, color: t.ink2 }]}>Cancel</Text>
                </Press>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: tSpace[2] }}>
        <Label>Coming up</Label>
        {coming.length ? (
          coming.map((v) => <VisitCard key={v.id} v={v} onOpen={onOpen} />)
        ) : (
          <Text style={[tType.bodyM, { color: t.ink2, paddingLeft: 4 }]}>Nothing booked.</Text>
        )}
      </View>

      {gone.length ? (
        <View style={{ gap: tSpace[2] }}>
          <Label>Past visits</Label>
          <View
            style={{
              borderRadius: tRadius.cardLg,
              backgroundColor: t.surface,
              boxShadow: t.shadow.card,
              overflow: "hidden",
            }}
          >
            {gone.map((v, i) => (
              <Press
                key={v.id}
                haptic={false}
                onPress={() => onOpen(v.id)}
                accessibilityLabel={`${v.dayLabel} ${v.day}, ${v.clinic}, ${v.who}`}
                style={{
                  minHeight: 60,
                  paddingHorizontal: tSpace[4],
                  paddingVertical: tSpace[2.5],
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tSpace[3],
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: t.line,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={[tType.label, { fontSize: 15, color: t.ink }]}>
                    {v.clinic}
                  </Text>
                  <Text style={[tType.bodyS, { color: t.ink2 }]}>
                    {v.dayLabel} {v.day} · {v.who}
                  </Text>
                </View>
                <Icon name="forward" size={18} color={t.ink3} />
              </Press>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A group's quiet name above its cards. */
function Label({ children }: { children: string }) {
  const t = useTide();
  return (
    <Text accessibilityRole="header" style={[tType.overline, { color: t.ink3, paddingLeft: 4 }]}>
      {children}
    </Text>
  );
}

/** One upcoming visit: the day on a navy tile, the clinic, who it is for, the code and how it is paid. */
function VisitCard({ v, onOpen }: { v: VisitRowV2; onOpen: (id: string) => void }) {
  const t = useTide();
  const chip = CHIP_WORDS[v.chip];
  return (
    <Press
      onPress={() => onOpen(v.id)}
      accessibilityLabel={`${v.dayLabel} ${v.day}, ${v.clinic}, ${v.who}, ${v.window}, code ${spokenCode(v.code)}${chip ? `, ${chip}` : ""}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3.5],
        padding: tSpace[3.5],
        borderRadius: tRadius.cardLg,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      <View
        style={{
          width: 56,
          height: 64,
          borderRadius: tRadius.row,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.band,
        }}
      >
        <Text style={{ fontFamily: tFont.semibold, fontSize: 24, lineHeight: 26, color: t.onBand }}>
          {v.day}
        </Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.onBand2 }]}>
          {v.dayLabel}
        </Text>
      </View>
      <View style={{ flex: 1, gap: tSpace[1.5] }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
            <Text numberOfLines={1} style={[tType.heading, { flex: 1, color: t.ink }]}>
              {v.clinic}
            </Text>
            <Icon name="forward" size={18} color={t.ink3} />
          </View>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            {v.who} · {v.window}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[1.5] }}>
          <Tag mono>{v.code}</Tag>
          {chip ? <Tag>{chip}</Tag> : null}
        </View>
      </View>
    </Press>
  );
}

/** A small neutral label: the code in the mono face, or how the visit is paid. Never a clinical colour. */
function Tag({ children, mono = false }: { children: string; mono?: boolean }) {
  const t = useTide();
  return (
    <View
      style={{
        height: 26,
        paddingHorizontal: tSpace[2.5],
        borderRadius: tRadius.pill,
        justifyContent: "center",
        backgroundColor: t.surface2,
      }}
    >
      <Text
        style={
          mono
            ? { fontFamily: tFont.mono, fontSize: 13, letterSpacing: 1.2, color: t.ink }
            : [tType.caption, { color: t.ink2 }]
        }
      >
        {children}
      </Text>
    </View>
  );
}
