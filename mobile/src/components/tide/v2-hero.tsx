/**
 * Today's hero card on the phone (patient app v2 §5.6, M6), from the ladder in @patient-core/today-hero. Its own
 * file because only the danger hero may be red (MR5): this file is on the red allowlist
 * (src/theme/colour-laws.test.ts), a clinical-safety review. The words are the web's (@content/patient-app/care).
 */
import type { Hero } from "@patient-core/today-hero";
import { Text, View } from "react-native";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { heroTone } from "@patient-core/today-hero";

import { Button } from "@/components/tide/primitives";
import { useTide } from "@/theme/theme";
import { tFont, tSpace, tType } from "@/theme/tide";

const H = CARE_V2_COPY.hero;

export function HeroCard({ hero, onAction }: { hero: Hero; onAction?: () => void }) {
  const t = useTide();
  const tone = heroTone(hero);
  const words = (() => {
    switch (hero.kind) {
      case "danger":
        return { kicker: H.danger, title: hero.danger.at, action: H.dangerAction };
      case "team":
        return { kicker: H.team, title: hero.ask.from, action: H.teamAction };
      case "due":
        return { kicker: H.due, title: `${hero.due.label} · ${hero.due.dueAt}`, action: H.dueAction };
      case "visit":
        return { kicker: H.visit, title: hero.visit.window, action: H.visitAction };
      case "next":
        return { kicker: H.next, title: `${hero.next.label} · ${hero.next.at}`, action: null };
      case "rest":
        return { kicker: hero.until ? H.rest : H.restNone, title: hero.until ?? "", action: null };
    }
  })();
  const bg = tone === "emergency" ? t.emergency : tone === "accent" ? t.band : t.surface;
  const fg = tone === "emergency" ? t.onEmergency : tone === "accent" ? t.onBand : t.ink;
  return (
    <View
      accessibilityRole={hero.kind === "danger" ? "alert" : undefined}
      style={{ backgroundColor: bg, borderRadius: 22, padding: tSpace[5], gap: tSpace[3], boxShadow: tone === "emergency" ? t.shadow.emergency : t.shadow.card }}
    >
      <Text style={[tType.overline, { color: fg, opacity: 0.85 }]}>{words.kicker}</Text>
      {words.title ? <Text style={{ fontFamily: tFont.semibold, fontSize: 24, color: fg }}>{words.title}</Text> : null}
      {words.action && onAction ? (
        <Button label={words.action} onPress={onAction} variant={tone === "accent" ? "accent" : "soft"} size="md" />
      ) : null}
    </View>
  );
}
