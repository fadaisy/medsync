import type { ShareLength, SharePurpose } from "@/data/location-share";
import { useState } from "react";
import { Share, Text } from "react-native";

import { Button, Chip, ChipRow, Note, Sheet } from "@/components/tide";
import {
  clockWords,
  leftWords,
  SHARE_CONSENT,
  SHARE_NO_LINK,
  SHARE_OPEN_ONLY,
  startShare,
  useActiveShare,
} from "@/data/location-share";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

const LENGTHS: { key: ShareLength; label: string }[] = [
  { key: 15, label: "15 min" },
  { key: 60, label: "1 hour" },
  { key: "until stopped", label: "Until I stop" },
];

/** Send the family link with the phone's own share menu (WhatsApp, SMS…). No name in the message. */
export function sendShareLink(link: string, endsAt: Date | null) {
  const until = endsAt ? ` until ${clockWords(endsAt)}` : "";
  void Share.share({ message: `See where I am on MedSync${until}: ${link}` }).catch(() => {});
}

/**
 * "Share my live location" (ADR 0343). The entry point picks the purpose
 * (Help: emergency, a visit: visit). Before a share: how long, the consent
 * words, Start. During one: Send the link, Stop. Teal and navy only: sharing
 * is not an emergency signal (law L3).
 */
export function ShareLocationSheet({
  visible,
  onClose,
  purpose,
}: {
  visible: boolean;
  onClose: () => void;
  purpose: SharePurpose;
}) {
  const t = useTide();
  const share = useActiveShare();
  const now = useNow(15_000);
  const [length, setLength] = useState<ShareLength>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await startShare(purpose, length);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  const stop = async () => {
    setBusy(true);
    setError(await share.stop());
    setBusy(false);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      overline={share.active ? "Sharing now" : "Location"}
      overlineColor={t.accentText}
      title="Share my live location"
    >
      {share.active && share.endsAt ? (
        <>
          <Text style={[tType.bodyM, { color: t.ink }]} accessibilityLiveRegion="polite">
            {`Sharing until ${clockWords(share.endsAt)} · ${leftWords(share.endsAt, now)}`}
          </Text>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            {share.lastSentAt
              ? `Last sent at ${clockWords(share.lastSentAt)}.`
              : "Waiting for the first position."}
          </Text>
          <Note tone="info">{SHARE_OPEN_ONLY}</Note>
          {share.link ? (
            <Button
              label="Send the link"
              variant="accent"
              icon="send"
              onPress={() => share.link && sendShareLink(share.link, share.endsAt)}
            />
          ) : (
            <Note tone="plain">{SHARE_NO_LINK}</Note>
          )}
          {error ? (
            <Note tone="plain" icon="alert">
              {error}
            </Note>
          ) : null}
          <Button label="Stop sharing" variant="outline" busy={busy} onPress={() => void stop()} />
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={[tType.labelS, { color: t.ink2 }]}>
            For how long?
          </Text>
          <ChipRow>
            {LENGTHS.map((l) => (
              <Chip
                key={String(l.key)}
                label={l.label}
                selected={length === l.key}
                onPress={() => setLength(l.key)}
              />
            ))}
          </ChipRow>
          <Text style={[tType.bodyM, { color: t.ink }]}>{SHARE_CONSENT.words}</Text>
          <Note tone="info">{SHARE_OPEN_ONLY}</Note>
          {error ? (
            <Note tone="plain" icon="alert">
              {error}
            </Note>
          ) : null}
          <Button
            label="Start sharing"
            variant="accent"
            icon="locate"
            busy={busy}
            onPress={() => void start()}
            style={{ marginTop: tSpace[1] }}
          />
        </>
      )}
    </Sheet>
  );
}
