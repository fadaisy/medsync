import type { Ticket } from "@/components/tide/ticket";
import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import * as Sharing from "expo-sharing";
import { Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { FieldError } from "@/components/tide/field";
import { Icon } from "@/components/tide/icon";
import { Button } from "@/components/tide/primitives";
import { Sheet } from "@/components/tide/sheet";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type TicketProps = ComponentProps<typeof Ticket>;

/** A story picture, 9:16, the shape Snapchat, Instagram and WhatsApp status take. */
const CARD_W = 270;
const CARD_H = 480;

/**
 * "Share" on the ticket (ADR 0348): a picture of the visit for Snapchat,
 * WhatsApp, Instagram or anywhere the phone's share sheet reaches. The
 * patient sees exactly what goes before it goes. It carries the hospital and
 * the day only: never the name, the code (anyone holding it could use the
 * ticket), the clinic (it can say what is wrong) or the fee.
 */
export function TicketShareSheet({
  visible,
  onClose,
  ticket,
}: {
  visible: boolean;
  onClose: () => void;
  ticket: TicketProps;
}) {
  const t = useTide();
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setError("Sharing isn't available on this phone.");
        return;
      }
      const uri = await captureRef(card, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: 1080,
        height: 1920,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: "Share your visit",
      });
      onClose();
    } catch {
      setError("The picture didn't share. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const { kind, hospitalName, day, dayLine, sessionLine, stage } = ticket;
  return (
    <Sheet visible={visible} onClose={onClose} title="Share your visit">
      <View style={{ alignItems: "center" }}>
        <View
          ref={card}
          collapsable={false}
          accessibilityLabel={`Picture to share: ${kind === "day" ? `a visit on ${dayLine} ${day}` : "in the line"} at ${hospitalName}`}
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: tRadius.panel,
            overflow: "hidden",
            backgroundColor: t.band,
            padding: tSpace[5],
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: tRadius.sm,
                backgroundColor: t.onBand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="building" size={17} color={t.band} strokeWidth={2} />
            </View>
            <Text style={[tType.labelS, { flex: 1, color: t.onBand }]} numberOfLines={2}>
              {hospitalName}
            </Text>
          </View>

          <View style={{ gap: tSpace[2] }}>
            <Text
              style={[
                tType.caption,
                { fontFamily: tFont.semibold, letterSpacing: 1, color: t.onBand2 },
              ]}
            >
              {kind === "day" ? "I'M SEEING A DOCTOR" : "I'M IN THE LINE"}
            </Text>
            {kind === "day" ? (
              <>
                <Text
                  style={{
                    fontFamily: tFont.monoBold,
                    fontSize: 96,
                    lineHeight: 96,
                    letterSpacing: -3,
                    color: t.onBand,
                  }}
                >
                  {day}
                </Text>
                <Text style={[tType.heading, { fontFamily: tFont.bold, color: t.onBand }]}>
                  {dayLine}
                </Text>
                {sessionLine ? (
                  <Text style={[tType.bodyM, { color: t.onBand2 }]}>{sessionLine}</Text>
                ) : null}
              </>
            ) : (
              <Text
                style={{ fontFamily: tFont.bold, fontSize: 40, lineHeight: 44, color: t.accent }}
              >
                {stage}
              </Text>
            )}
          </View>

          {/* The tear line, so the picture still reads as a ticket. */}
          <View style={{ gap: tSpace[3] }}>
            <View style={{ borderTopWidth: 2, borderStyle: "dashed", borderColor: t.bandGlass }} />
            <Text
              style={{
                fontFamily: tFont.extrabold,
                fontSize: 20,
                letterSpacing: -0.4,
                color: t.onBand,
              }}
            >
              MedSync
            </Text>
          </View>
        </View>
      </View>
      <Text
        style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
      >
        Only the hospital and the day. Your name, code, clinic and fee are left off.
      </Text>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button label="Share picture" icon="send" busy={busy} onPress={() => void share()} />
    </Sheet>
  );
}
