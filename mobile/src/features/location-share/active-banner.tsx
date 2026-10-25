import { useState } from "react";
import { Text, View } from "react-native";

import { Band, Button, Icon } from "@/components/tide";
import { clockWords, leftWords, useActiveShare } from "@/data/location-share";
import { sendShareLink } from "@/features/location-share/share-sheet";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tSpace, tType } from "@/theme/tide";

/**
 * Whether the banner has anything to show. The parent renders the banner only
 * then, because `<Screen>` gives every child a slot and a gap, even an empty one.
 */
export function useShareBannerShown(): boolean {
  return useActiveShare().active;
}

/**
 * While a live location share runs: when it ends, the time left, and Stop,
 * on Home and Help. Navy with the teal accent, never red: sharing is a
 * choice the patient made, not an alarm (law L3). Nothing when no share runs.
 */
export function ActiveShareBanner() {
  const t = useTide();
  const share = useActiveShare();
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!share.active || !share.endsAt) return null;
  const endsAt = share.endsAt;

  const stop = async () => {
    setBusy(true);
    setError(await share.stop());
    setBusy(false);
  };

  return (
    <Band style={{ gap: tSpace[2] }}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}
      >
        <Icon name="locate" size={18} color={t.onBandAccent} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.label, { fontFamily: tFont.bold, color: t.onBand }]}>
            {`Sharing your location · ends ${clockWords(endsAt)}`}
          </Text>
          <Text style={[tType.caption, { color: t.onBand2 }]}>
            {`${leftWords(endsAt, now)} · updates only while MedSync is open`}
          </Text>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[tType.bodyS, { color: t.onBand }]}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        {share.link ? (
          <Button
            label="Send the link"
            variant="accent"
            size="sm"
            onPress={() => share.link && sendShareLink(share.link, endsAt)}
          />
        ) : null}
        <Button
          label="Stop"
          variant="soft"
          size="sm"
          busy={busy}
          accessibilityLabel="Stop sharing your location"
          onPress={() => void stop()}
        />
      </View>
    </Band>
  );
}
