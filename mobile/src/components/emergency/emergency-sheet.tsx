import type { IconName } from "@/components/tide";
import type { ContactKind, PendingPreArrival, SheetContact } from "@/lib/emergency";
import { useEffect, useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { Linking, Text, View } from "react-native";

import { FirstAidCards } from "@/components/emergency/first-aid-cards";
import { Watermark } from "@/components/emergency/watermark";
import { Card, Icon, Press, Screen, TextLink } from "@/components/tide";
import {
  e1Tiles,
  emergencyEvent,
  firstAidCardsLive,
  preAlertLive,
  readPendingPreArrival,
  telUrl,
  useEmergencySheet,
} from "@/lib/emergency";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * E1 — the Emergency sheet (PRD MS-PRD-SYM-001 §8.2; ADR 0098 rulings 7, 8).
 * One screen, both doors: the Emergency tab draws it with the patient's
 * hospital, the pre-auth root route draws it with none. Permanently light
 * (Law 3). This file and the pre-alert's Send and the status header are
 * where the app's red lives (tests/design/red-reserved.test.ts). Drawn in
 * Tide (ADR 0340): the red Help disc sits in its header like every screen's.
 *
 * The primary call is the first VERIFIED contact the server returned — the
 * hospital's own `emergency_phone` rides first as `hospital:<id>` when one
 * is named (ruling 8) — and when nothing is verified the sheet says "Go to
 * the nearest emergency unit" with no number: a guessed number here would be
 * the most dangerous fabricated datum in the product. Up to three more
 * numbers follow, each labelled by kind. Draft (unverified) rows come only
 * outside production and only under the watermark.
 *
 * Numbers never appear in this file; they come from data.
 */
export function EmergencySheet({
  hospitalId,
  from,
  showDrafts,
  onBack,
  onTell,
  onOpenStatus,
}: {
  hospitalId: string | null;
  /** `"catalog"` when the symptom catalog's interrupt opened this: no tiles, one warning haptic. */
  from?: string;
  /** The tab shows unverified rows under the watermark outside production; the pre-auth sheet never does. */
  showDrafts: boolean;
  onBack?: () => void;
  /** "Tell a hospital I'm coming" with the tiles picked so far. */
  onTell: (picks: string[]) => void;
  /** A pre-alert this device already sent and has not closed. */
  onOpenStatus?: (pending: PendingPreArrival) => void;
}) {
  return (
    <ForcedScheme scheme="light">
      <SheetBody
        hospitalId={hospitalId}
        from={from}
        showDrafts={showDrafts}
        onBack={onBack}
        onTell={onTell}
        onOpenStatus={onOpenStatus}
      />
    </ForcedScheme>
  );
}

const KIND_WORD: Record<ContactKind, string> = {
  general: "Emergency line",
  ambulance: "Ambulance",
  crisis: "Crisis support",
  sv: "Sexual violence support",
};

/** Catalog icon key → a glyph. The word beside it carries the meaning (PRD §7.1). */
const TILE_ICON: Record<string, IconName> = {
  lungs: "wind",
  heart: "heart",
  brain: "zap",
  child: "user",
  thermometer: "activity",
  droplet: "droplet",
};

function SheetBody({
  hospitalId,
  from,
  showDrafts,
  onBack,
  onTell,
  onOpenStatus,
}: {
  hospitalId: string | null;
  from?: string;
  showDrafts: boolean;
  onBack?: () => void;
  onTell: (picks: string[]) => void;
  onOpenStatus?: (pending: PendingPreArrival) => void;
}) {
  const tide = useTide();
  const { sheet } = useEmergencySheet(hospitalId);
  const [picks, setPicks] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPreArrival | null>(null);
  const fromCatalog = from === "catalog";
  const canTell = preAlertLive();

  // PRD §7.5: ONE haptic per emergency interrupt — the catalog's interrupt
  // fires it (emergency-interrupt.tsx), so arriving here from it fires none.
  // No pulsing anywhere — the phone does not read reduced-motion today, so
  // there is no motion to reduce.

  useEffect(() => {
    if (!canTell || !onOpenStatus) return;
    let cancelled = false;
    readPendingPreArrival().then((p) => {
      if (!cancelled) setPending(p);
    });
    return () => {
      cancelled = true;
    };
  }, [canTell, onOpenStatus]);

  const contacts = sheet?.contacts ?? [];
  const verified = contacts.filter((c) => !c.draft);
  const primary = verified[0] ?? null;
  const secondary = verified.slice(1, 4);
  const drafts = showDrafts ? contacts.filter((c) => c.draft).slice(0, 3) : [];

  const call = (c: SheetContact) => {
    emergencyEvent("call_tapped", { contact_id: c.id });
    Linking.openURL(telUrl(c.number)).catch(() => {});
  };
  const toggle = (key: string) =>
    setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  return (
    <Screen
      back={onBack ? { onPress: onBack } : undefined}
      helpSource="emergency-sheet"
      stagger={false}
    >
      <View style={{ gap: tSpace[2] }}>
        {/* The one red heading in the app: it names the tier in the PRD's word. */}
        <Text accessibilityRole="header" style={[tType.display, { color: tide.emergencyBand }]}>
          {t(CATALOG, "tier.E")}
        </Text>
        <Text style={[tType.body, { fontFamily: tFont.medium, color: tide.ink }]}>
          If the person is not breathing or can&rsquo;t be woken, call now.
        </Text>
      </View>

      {/* The primary call. One tap, no data: `tel:` rides the cellular
          network, and the number was verified by a human before it was
          allowed here. */}
      {primary ? (
        <Press
          accessibilityLabel={`Call ${primary.label}, ${primary.number}`}
          onPress={() => call(primary)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3],
            minHeight: 64,
            paddingHorizontal: tSpace[5],
            paddingVertical: tSpace[3],
            borderRadius: tRadius.card,
            backgroundColor: tide.emergency,
            boxShadow: tide.shadow.emergency,
          }}
        >
          <Icon name="phone" size={22} color={tide.onEmergency} strokeWidth={2.2} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[tType.heading, { color: tide.onEmergency }]}>Call {primary.label}</Text>
            <Text
              style={[
                tType.bodyM,
                { fontFamily: tFont.mono, color: tide.onEmergency, fontVariant: ["tabular-nums"] },
              ]}
            >
              {primary.number}
            </Text>
          </View>
        </Press>
      ) : (
        <View
          style={{
            padding: tSpace[4],
            borderRadius: tRadius.card,
            backgroundColor: tide.critical.tint,
            gap: tSpace[1],
          }}
        >
          <Text style={[tType.heading, { color: tide.critical.text }]}>
            Go to the nearest emergency unit
          </Text>
          <Text style={[tType.bodyM, { color: tide.ink }]}>
            No verified emergency number is available here yet. They see the sickest people first.
          </Text>
        </View>
      )}

      {secondary.length ? (
        <View style={{ gap: tSpace[2] }}>
          {secondary.map((c) => (
            <ContactRow key={c.id} contact={c} onPress={() => call(c)} />
          ))}
        </View>
      ) : null}

      {canTell ? (
        // White fill, red text and border (PRD §8.2 item 3).
        <Press
          onPress={() => onTell(picks)}
          style={{
            minHeight: 52,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: tSpace[6],
            borderRadius: tRadius.pill,
            borderWidth: 1.5,
            borderColor: tide.emergency,
            backgroundColor: tide.surface,
          }}
        >
          <Text style={[tType.label, { color: tide.emergencyBand }]}>
            Tell a hospital I&rsquo;m coming
          </Text>
        </Press>
      ) : null}

      {pending && onOpenStatus ? (
        <View style={{ alignItems: "center" }}>
          <TextLink label="See the pre-alert you sent" onPress={() => onOpenStatus(pending)} />
        </View>
      ) : null}

      {!fromCatalog ? (
        <View style={{ gap: tSpace[2], marginTop: tSpace[2] }}>
          <Text accessibilityRole="header" style={[tType.heading, { color: tide.ink }]}>
            What&rsquo;s happening?
          </Text>
          <Text style={[tType.bodyS, { color: tide.ink2 }]}>
            Optional. It helps the hospital get ready.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
            {e1Tiles().map((item) => {
              const selected = picks.includes(item.key);
              const label = t(CATALOG, item.labelKey);
              // Chosen = navy, Tide's selection (near-white at night, but this sheet is light).
              const fg = selected ? tide.onPrimary : tide.ink;
              return (
                <Press
                  key={item.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={label}
                  onPress={() => toggle(item.key)}
                  style={{
                    width: "48%",
                    flexGrow: 1,
                    minHeight: 72,
                    padding: tSpace[3],
                    gap: tSpace[1],
                    borderRadius: tRadius.row,
                    backgroundColor: selected ? tide.primary : tide.surface,
                    boxShadow: selected ? undefined : tide.shadow.card,
                  }}
                >
                  <Icon name={TILE_ICON[item.icon] ?? "alert"} size={20} color={fg} />
                  <Text style={[tType.labelS, { color: fg }]}>{label}</Text>
                </Press>
              );
            })}
          </View>
        </View>
      ) : null}

      {drafts.length ? (
        <View style={{ gap: tSpace[2], marginTop: tSpace[2] }}>
          <Watermark>These numbers are not yet verified and do not show in production.</Watermark>
          <View style={{ gap: tSpace[2] }}>
            {drafts.map((c) => (
              <ContactRow key={c.id} contact={c} onPress={() => call(c)} draft />
            ))}
          </View>
        </View>
      ) : null}

      {firstAidCardsLive() ? <FirstAidCards /> : null}
    </Screen>
  );
}

/** A secondary number: its kind, its label, and the `tel:` tap. */
function ContactRow({
  contact,
  onPress,
  draft = false,
}: {
  contact: SheetContact;
  onPress: () => void;
  draft?: boolean;
}) {
  const tide = useTide();
  return (
    <Card
      accessibilityLabel={`Call ${KIND_WORD[contact.kind]}, ${contact.label}, ${contact.number}${draft ? ", unverified" : ""}`}
      onPress={onPress}
      radius={tRadius.row}
      style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3], minHeight: 56 }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[tType.overline, { color: tide.ink3 }]}>
          {KIND_WORD[contact.kind]}
          {draft ? " · Unverified" : ""}
        </Text>
        <Text style={[tType.bodyM, { color: tide.ink }]}>{contact.label}</Text>
      </View>
      <Text
        style={[
          tType.labelS,
          { fontFamily: tFont.monoSemibold, color: tide.accentText, fontVariant: ["tabular-nums"] },
        ]}
      >
        {contact.number}
      </Text>
    </Card>
  );
}
