/**
 * Visits, v2 (patient app v2 §5.2, W4 on the phone): offers that need an answer first (labelled, neutral: the
 * design system keeps amber for clinical state, so it overrides the prompt's amber here; with Keep, Pick
 * another day, Cancel), then upcoming visits for the patient and their household with the code and how each is
 * paid, then past visits. Payment chips never use red, amber or green (MR5); stages never a number (MR4).
 */
import type { PaymentChip } from "@patient-core/payments";
import { Text, View } from "react-native";
import { PAYMENTS_COPY } from "@content/patient-app/payments";

import { Button, DateTile, SectionHead } from "@/components/tide";
import { Press } from "@/components/tide/press";
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
  const row = (v: VisitRowV2, dim = false) => {
    const chip = CHIP_WORDS[v.chip];
    const paid = v.chip === "paid_app" || v.chip === "paid_counter";
    return (
      <Press
        key={v.id}
        onPress={() => onOpen(v.id)}
        accessibilityLabel={`${v.dayLabel} ${v.day}, ${v.clinic}, ${v.who}, ${v.window}${chip ? `, ${chip}` : ""}`}
        style={{ flexDirection: "row", gap: tSpace[3], padding: tSpace[3], borderRadius: tRadius.card, backgroundColor: t.surface, boxShadow: t.shadow.card, alignItems: "center" }}
      >
        <DateTile day={v.day} label={v.dayLabel} dim={dim} width={64} height={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
            {v.clinic}
          </Text>
          <Text style={[tType.caption, { color: t.ink3 }]}>
            {v.who} · {v.window}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], marginTop: 2 }}>
            <Text style={{ fontFamily: tFont.mono, color: t.ink2, letterSpacing: 2 }}>{v.code}</Text>
            {chip ? (
              <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: paid ? t.accentTint : t.surface3 }}>
                <Text style={[tType.micro, { color: paid ? t.accentText : t.ink2 }]}>{chip}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Press>
    );
  };
  return (
    <View style={{ gap: 28 }}>
      {offers.length ? (
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Needs your answer" />
          {offers.map((o) => (
            <View key={o.id} style={{ padding: tSpace[4], borderRadius: tRadius.card, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.lineStrong, gap: tSpace[3] }}>
              <Text style={[tType.label, { color: t.ink }]}>{o.title}</Text>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>{o.line}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
                <Button label="Keep" onPress={() => onOffer(o.id, "keep")} size="sm" />
                <Button label="Pick another day" onPress={() => onOffer(o.id, "pick")} size="sm" variant="outline" />
                <Button label="Cancel" onPress={() => onOffer(o.id, "cancel")} size="sm" variant="soft" />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ gap: tSpace[3] }}>
        <SectionHead title="Coming up" />
        {upcoming.length ? upcoming.map((v) => row(v)) : <Text style={[tType.bodyS, { color: t.ink3 }]}>Nothing booked.</Text>}
      </View>
      {past.length ? (
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Past visits" />
          {past.map((v) => row(v, true))}
        </View>
      ) : null}
    </View>
  );
}
