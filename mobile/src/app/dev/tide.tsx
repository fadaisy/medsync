import type { Mood, NavPlace } from "@/components/tide";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import {
  Avatar,
  Band,
  Button,
  Capsule,
  Card,
  Cascade,
  CascadeStep,
  Chip,
  ChipRow,
  DateTile,
  IconDisc,
  MoodFace,
  Note,
  OtpBoxes,
  PhoneField,
  Pill,
  ProgressBar,
  RangeBar,
  Ring,
  Screen,
  SectionHead,
  Segments,
  SegmentTiles,
  Sheet,
  Sparkbars,
  StatusPill,
  Stepper,
  Tablet,
  TextField,
  TextLink,
  TideNav,
  Toast,
} from "@/components/tide";
import { useTheme, useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * `/dev/tide`: every Tide primitive in every state, in whichever theme is
 * picked at the top. Development builds only (the root layout guards it).
 */
export default function TideGallery() {
  const t = useTide();
  const { preference, setPreference } = useTheme();
  const { width } = useWindowDimensions();
  const [seg, setSeg] = useState<"today" | "week">("today");
  const [tile, setTile] = useState<"bp" | "sugar" | "weight" | "pulse">("bp");
  const [chip, setChip] = useState(true);
  const [name, setName] = useState("Sarah");
  const [pw, setPw] = useState("");
  const [hidden, setHidden] = useState(true);
  const [phone, setPhone] = useState("772 123 418");
  const [otp, setOtp] = useState("4829");
  const [top, setTop] = useState("138");
  const [sheet, setSheet] = useState(false);
  const [place, setPlace] = useState<NavPlace>("home");
  const [mood, setMood] = useState<Mood>("good");

  const label = (s: string) => <Text style={[tType.overline, { color: t.ink3 }]}>{s}</Text>;

  return (
    <Screen overline="Development" title="Tide gallery" back={{ label: "Back" }}>
      <Segments
        options={[
          { key: "system", label: "System" },
          { key: "light", label: "Light" },
          { key: "dark", label: "Dark" },
        ]}
        value={preference}
        onChange={setPreference}
      />

      {label("Buttons")}
      <View style={{ gap: tSpace[2] }}>
        <Button label="Save reading" />
        <Button label="I took it" variant="accent" icon="check" />
        <Button label="Not yet" variant="soft" />
        <Button label="Change day" variant="outline" />
        <Button label="Yes, get help now" variant="danger" icon="phone" />
        <Button label="Continue" disabled />
        <Button label="Sending" busy />
        <View style={{ flexDirection: "row", gap: tSpace[2], alignItems: "center" }}>
          <Button label="Join the line" size="md" />
          <Button label="Ask for refill" size="sm" />
          <TextLink label="See all" />
        </View>
      </View>

      {label("Pills and status")}
      <View style={{ gap: tSpace[2] }}>
        <Pill label="Now · 13:00" dot={t.ink} />
        <Pill label="Open now · until 16:00" dot={t.accent} bg={t.accentTint} fg={t.accentText} />
        <Pill
          label="Next open day: Tue 20 Oct"
          dot={t.area.visits}
          bg={t.place.tint}
          fg={t.place.text}
        />
        <View style={{ flexDirection: "row", gap: tSpace[2], flexWrap: "wrap" }}>
          <StatusPill tone="stable" label="In your range" />
          <StatusPill tone="caution" label="Above target" />
          <StatusPill tone="critical" label="Danger" />
          <StatusPill tone="pending" label="Waiting for the clinic" />
        </View>
      </View>

      {label("Segments, tiles, chips")}
      <Segments
        tone="accent"
        options={[
          { key: "today", label: "Today" },
          { key: "week", label: "This week" },
        ]}
        value={seg}
        onChange={setSeg}
      />
      <SegmentTiles
        value={tile}
        onChange={setTile}
        options={[
          { key: "bp", label: "Pressure", icon: "activity", iconColor: t.area.readings },
          { key: "sugar", label: "Sugar", icon: "droplet", iconColor: t.area.medicines },
          { key: "weight", label: "Weight", icon: "scale", iconColor: t.accentText },
          { key: "pulse", label: "Pulse", icon: "heart", iconColor: t.area.visits },
        ]}
      />
      <ChipRow scroll>
        <Chip label="Available now" selected={chip} onPress={() => setChip(!chip)} />
        <Chip label="Diabetes" />
        <Chip label="General" />
        <Chip label="Children" />
        <Chip label="Eye" />
      </ChipRow>
      <ChipRow>
        <Chip label="Chest pain" tone="danger" selected />
        <Chip label="Hard to breathe" tone="danger" />
      </ChipRow>

      {label("Fields")}
      <TextField
        label="First name"
        value={name}
        onChangeText={setName}
        state={name ? "good" : "idle"}
      />
      <TextField
        label="Password"
        value={pw}
        onChangeText={setPw}
        secure={hidden}
        onToggleSecure={() => setHidden(!hidden)}
        placeholder="12 or more characters"
        state={pw.length >= 12 ? "good" : pw.length > 0 ? "error" : "idle"}
        error="Use 12 or more characters"
      />
      <PhoneField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        error="Ugandan mobile numbers start with 7"
      />
      <PhoneField large value={phone} onChangeText={setPhone} />
      <OtpBoxes value={otp} onChangeText={setOtp} />
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Stepper
          label="Top number"
          unit="mmHg"
          value={top}
          onChange={setTop}
          step={2}
          min={60}
          max={260}
        />
      </View>

      {label("Surfaces")}
      <Card>
        <SectionHead title="Health trends" action="See all" />
        <Text style={[tType.bodyM, { color: t.ink2 }]}>A white card on the grey ground.</Text>
      </Card>
      <Band>
        <Text style={[tType.overline, { color: t.onBandAccent }]}>Medicines this week</Text>
        <Text style={[tType.heading, { color: t.onBand }]}>23 of 25 doses taken</Text>
      </Band>
      <Note>We save your place in line. We cannot tell you the hour.</Note>
      <Note tone="caution" icon="alert">
        A caution note, always with words.
      </Note>
      <View style={{ flexDirection: "row", gap: tSpace[3], alignItems: "center" }}>
        <Avatar initials="AN" />
        <Avatar initials="MM" bg={t.place.tint} fg={t.place.text} />
        <IconDisc name="pill" color={t.area.medicines} bg={t.surface2} />
        <IconDisc name="message" color={t.area.team} bg={t.info.tint} />
        <Capsule left={t.area.medicines} right={t.surface2} />
        <Tablet color={t.accentSoft} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -tSpace[5] }}>
        <DateTile day="17" label="Today" selected bleed="left" />
        <DateTile day="23" label="Fri" />
        <DateTile day="29" label="Thu" dim />
      </View>

      {label("Cascade")}
      <Cascade>
        <CascadeStep step={0} icon="pill" title="Morning medicine" line="07:12 · taken" done />
        <CascadeStep
          step={1}
          icon="activity"
          title="Blood pressure · 138/86"
          line="07:40 · above your target"
          done
        />
        <CascadeStep
          step={2}
          icon="message"
          title="Your care team replied"
          line="09:15 · about this morning"
          last
        />
      </Cascade>

      {label("Charts")}
      <View style={{ flexDirection: "row", gap: tSpace[4], alignItems: "center" }}>
        <Ring value={1 / 3} size={116} stroke={12} accessibilityLabel="1 of 3 doses taken today">
          <Text style={[tType.numeral, { color: t.ink }]}>1/3</Text>
        </Ring>
        <Ring value={0.92} size={84} stroke={10} color={t.accent} />
        <View style={{ flex: 1, gap: tSpace[2] }}>
          <ProgressBar value={0.6} />
          <ProgressBar value={0.13} color={t.caution.text} />
          <RangeBar min={0} max={5} goodFrom={0} goodTo={2.6} value={3.1} tone="caution" />
          <RangeBar min={0} max={120} goodFrom={60} goodTo={120} value={86} tone="stable" />
        </View>
      </View>
      <Sparkbars values={[9.2, 8.9, 8.6, 7.8]} min={5} max={10} target={7} />

      {label("Mood faces")}
      <View style={{ flexDirection: "row", gap: tSpace[3] }}>
        {(["good", "okay", "low", "none"] as const).map((m) => (
          <Chip key={m} label={m} selected={mood === m} onPress={() => setMood(m)} size="sm" />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: tSpace[3] }}>
        <MoodFace mood="good" pop={mood === "good"} />
        <MoodFace mood="okay" pop={mood === "okay"} />
        <MoodFace mood="low" pop={mood === "low"} />
        <MoodFace mood="none" />
      </View>

      {label("Nav")}
      <View style={{ marginHorizontal: -tSpace[1] }}>
        <TideNav
          width={width - 32}
          current={place}
          onNavigate={setPlace}
          onPlus={() => setSheet(true)}
          careCount={1}
        />
      </View>

      {label("Sheet and toast")}
      <Button label="Open a sheet" variant="soft" onPress={() => setSheet(true)} />
      <View style={{ height: 70 }}>
        <Toast text="Your care team can see it" actionLabel="Undo" bottom={0} />
      </View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        overline="Today · 1 of 3 taken"
        title="Which one did you take?"
      >
        <Note>
          Missed one? Do not take two at once. Tell your care team and they will advise you.
        </Note>
        <Button label="Done" onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}
