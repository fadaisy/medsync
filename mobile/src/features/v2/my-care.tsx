/**
 * Care mode on the phone, part 2 (patient app v2 §5.8; Step 8), behind `careMode`.
 * My care: the team (a name only with consent, S20; roles always; the first contact tagged; what each does
 * next) and the checks this year (Overdue with Book it, Due, Done; words with every state). Messages: the
 * thread, the team's hours, "Not for emergencies" with Help, quick prompts and a composer; a check-in is a
 * team request shown on top until answered. Wellness: the patient's own logging, shared by both modes.
 * The danger flow: the steps from `@patient-core/danger-flow`, offline, Help one press away at every step.
 * Props-driven for fixtures. Red only on Help (the kit's danger button); amber is the clinical "Overdue".
 */
import type { CareMessage } from "@/data/my-care";
import type { FlowStep } from "@patient-core/danger-flow";
import type { CheckLine, TeamCard } from "@patient-core/my-care";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { timerText } from "@patient-core/danger-flow";

import { Button, Card, Chip, SectionHead } from "@/components/tide";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const M = CARE_V2_COPY.myCare;
const G = CARE_V2_COPY.messages;
const D = CARE_V2_COPY.danger;
const W = CARE_V2_COPY.wellness;

const shortDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

export function MyCareV2(p: {
  team: TeamCard[];
  checks: CheckLine[];
  unread: number;
  onBook: (check: string) => void;
  onMessages: () => void;
}) {
  const t = useTide();
  const stateWord = { due: M.due, overdue: M.overdue, done: M.done } as const;
  return (
    <View style={{ gap: tSpace[5] }}>
      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={M.team} />
        {p.team.length === 0 ? <Text style={[tType.body, { color: t.ink2 }]}>{M.noTeam}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[3] }}>
          {p.team.map((m) => (
            <View
              key={m.id}
              accessible
              accessibilityLabel={[m.name, m.role, m.firstContact ? M.firstContact : null, m.nextStep].filter(Boolean).join(", ")}
              style={{
                flexBasis: "47%",
                flexGrow: 1,
                backgroundColor: t.surface,
                boxShadow: t.shadow.card,
                borderRadius: tRadius.cardLg,
                padding: tSpace[3.5],
                gap: tSpace[1],
              }}
            >
              {m.firstContact ? (
                <Text style={[tType.labelS, { color: t.accentText }]}>{M.firstContact}</Text>
              ) : null}
              <Text style={[tType.label, { color: t.ink }]}>{m.name ?? m.role}</Text>
              {m.name ? <Text style={[tType.caption, { color: t.ink2 }]}>{m.role}</Text> : null}
              {m.nextStep ? <Text style={[tType.caption, { color: t.ink3 }]}>{m.nextStep}</Text> : null}
            </View>
          ))}
        </View>
      </View>

      {p.checks.length ? (
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title={M.checks} />
          {p.checks.map((c) => (
            <Card key={c.key}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
                <View style={{ flex: 1, gap: tSpace[1] }}>
                  <Text style={[tType.label, { color: t.ink }]}>{M.checkNames[c.key] ?? c.key}</Text>
                  <Text style={[tType.caption, { color: t.ink3 }]}>
                    {c.lastIso ? M.lastDone.replace("{date}", shortDate(c.lastIso)) : M.neverRecorded}
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: tRadius.sm,
                    paddingHorizontal: tSpace[2],
                    paddingVertical: tSpace[1],
                    backgroundColor: c.state === "overdue" ? t.caution.tint : t.surface2,
                  }}
                >
                  <Text style={[tType.labelS, { color: c.state === "overdue" ? t.caution.text : t.ink2 }]}>
                    {stateWord[c.state]}
                  </Text>
                </View>
              </View>
              {c.state !== "done" ? (
                <Button label={M.bookIt} variant="outline" size="sm" onPress={() => p.onBook(c.key)} style={{ marginTop: tSpace[3] }} />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <Button
        label={p.unread ? `${M.messages} · ${p.unread}` : M.messages}
        variant="outline"
        size="md"
        icon="message"
        onPress={p.onMessages}
      />
    </View>
  );
}

export function MessagesV2(p: {
  messages: CareMessage[];
  onSend: (body: string) => void;
  onHelp: () => void;
}) {
  const t = useTide();
  const [draft, setDraft] = useState("");
  const lastMine = p.messages.filter((m) => m.fromPatient).at(-1)?.atIso ?? "";
  const ask = p.messages.filter((m) => !m.fromPatient && m.kind === "request" && m.atIso > lastMine).at(-1);
  const send = (body: string) => {
    const b = body.trim();
    if (!b) return;
    p.onSend(b);
    setDraft("");
  };
  return (
    <View style={{ gap: tSpace[4] }}>
      <View style={{ gap: tSpace[1] }}>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{G.hours}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
          <Text style={[tType.bodyS, { color: t.ink, flex: 1 }]}>{G.notForEmergencies}</Text>
          <Button label="Help" variant="danger" size="sm" onPress={p.onHelp} />
        </View>
      </View>

      {ask ? (
        <Card accessibilityLabel={G.checkIn}>
          <Text style={[tType.labelS, { color: t.accentText }]}>{G.checkIn}</Text>
          <Text style={[tType.body, { color: t.ink, marginTop: tSpace[1] }]}>{ask.body}</Text>
        </Card>
      ) : null}

      {p.messages.length === 0 ? <Text style={[tType.body, { color: t.ink2 }]}>{G.empty}</Text> : null}
      <View style={{ gap: tSpace[2] }}>
        {p.messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.fromPatient ? "flex-end" : "flex-start",
              maxWidth: "85%",
              backgroundColor: m.fromPatient ? t.accentTint : t.surface,
              borderRadius: tRadius.cardLg,
              padding: tSpace[3],
              gap: tSpace[1],
            }}
          >
            <Text style={[tType.body, { color: t.ink }]}>{m.body}</Text>
            <Text style={[tType.caption, { color: t.ink3 }]}>
              {m.queued ? G.queued : shortDate(m.atIso)}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
        {G.quick.map((q) => (
          <Chip key={q} label={q} onPress={() => send(q)} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: tSpace[2], alignItems: "flex-end" }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={G.placeholder}
          placeholderTextColor={t.ink3}
          accessibilityLabel={G.placeholder}
          multiline
          maxLength={1000}
          style={[
            tType.body,
            { flex: 1, minHeight: 44, color: t.ink, backgroundColor: t.surface, borderRadius: tRadius.cardLg, padding: tSpace[3] },
          ]}
        />
        <Button label={G.send} variant="accent" size="md" disabled={!draft.trim()} onPress={() => send(draft)} />
      </View>
    </View>
  );
}

export function WellnessV2(p: { onOpen: (where: "move" | "mood" | "eat") => void }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[4] }}>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{W.note}</Text>
      {(["move", "mood", "eat"] as const).map((k) => (
        <Button key={k} label={W[k]} variant="outline" size="lg" iconRight="forward" onPress={() => p.onOpen(k)} />
      ))}
    </View>
  );
}

/**
 * The steps whose main action is the red "Get help now", which opens Help and is the first thing under the
 * words. While one shows, the danger screen hides its header Help (ADR 0528, amending law L6).
 */
export function helpInPageFor(s: FlowStep): boolean {
  return s.step === "help" || s.step === "help_now";
}

/**
 * One step of a danger flow. The next reading is typed here and saved by the caller (which tells the team when
 * online, S19). The warning signs and Help are on every step.
 */
export function DangerFlowV2(p: {
  step: FlowStep;
  now: Date;
  onNext: () => void;
  onReading: (a: number, b: number | null) => void;
  onWarningSign: () => void;
  onHelp: () => void;
  onDone: () => void;
  teamNote: string | null;
}) {
  const t = useTide();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const s = p.step;
  const title = s.flow === "low_sugar" ? D.lowSugar.title : s.flow === "very_high_bp" ? D.highBp.title : D.helpNow;
  const line = (() => {
    if (s.step === "help" || s.step === "help_now") return s.flow === "low_sugar" ? D.lowSugar.stillLow : D.helpNow;
    if (s.flow === "low_sugar") {
      if (s.step === "sweet") return D.lowSugar.sweet;
      if (s.step === "sit") return D.lowSugar.sit;
      if (s.step === "wait") return D.lowSugar.wait.replace("{time}", timerText(s.untilIso, p.now));
      if (s.step === "recheck") return D.lowSugar.recheck;
      if (s.step === "better") return D.lowSugar.better;
    }
    if (s.flow === "very_high_bp") {
      if (s.step === "rest") return D.highBp.rest;
      if (s.step === "second") return D.highBp.second;
      if (s.step === "call_nurse") return D.highBp.callNurse;
      if (s.step === "better") return D.highBp.better;
    }
    return "";
  })();
  const field = (value: string, set: (v: string) => void, label: string) => (
    <TextInput
      value={value}
      onChangeText={set}
      keyboardType="decimal-pad"
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={t.ink3}
      style={[tType.heading, { flex: 1, minHeight: 52, color: t.ink, backgroundColor: t.surface, borderRadius: tRadius.cardLg, padding: tSpace[3] }]}
    />
  );
  const ended = s.step === "better" || s.step === "call_nurse";
  const helpStep = helpInPageFor(s);
  return (
    <View style={{ gap: tSpace[5] }}>
      <View accessibilityRole="alert" style={{ gap: tSpace[2] }}>
        <Text style={[tType.title, { color: t.ink }]}>{title}</Text>
        <Text style={[tType.body, { color: t.ink }]}>{line}</Text>
        <Text style={[tType.caption, { color: t.ink3 }]}>{D.pending}</Text>
      </View>

      {helpStep ? <Button label={D.helpNow} variant="danger" size="lg" onPress={p.onHelp} /> : null}
      {s.step === "sweet" ? <Button label={D.lowSugar.sweetDone} variant="primary" onPress={p.onNext} /> : null}
      {s.step === "sit" ? <Button label={D.lowSugar.sitDone} variant="primary" onPress={p.onNext} /> : null}
      {s.step === "wait" ? (
        <Button label={D.lowSugar.recheck} variant="primary" disabled={timerText(s.untilIso, p.now) !== "0:00"} onPress={p.onNext} />
      ) : null}
      {s.step === "rest" ? <Button label={D.highBp.restDone} variant="primary" onPress={p.onNext} /> : null}
      {s.step === "recheck" || s.step === "second" ? (
        <View style={{ gap: tSpace[3] }}>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            {s.flow === "very_high_bp" ? (
              <>
                {field(a, setA, "Top")}
                {field(b, setB, "Bottom")}
              </>
            ) : (
              field(a, setA, "mmol/L")
            )}
          </View>
          <Button
            label={D.save}
            variant="primary"
            onPress={() => {
              const n = Number(a.replace(",", "."));
              const m = s.flow === "very_high_bp" ? Number(b.replace(",", ".")) : null;
              if (Number.isFinite(n) && (m === null || Number.isFinite(m))) p.onReading(n, m);
            }}
          />
        </View>
      ) : null}
      {ended ? <Button label="Done" variant="outline" onPress={p.onDone} /> : null}
      {p.teamNote ? <Text style={[tType.caption, { color: t.ink2 }]}>{p.teamNote}</Text> : null}

      {!helpStep ? (
        <Card>
          <View style={{ gap: tSpace[2] }}>
            <Text style={[tType.label, { color: t.ink }]}>{D.signs.title}</Text>
            {D.signs.list.map((x) => (
              <Text key={x} style={[tType.body, { color: t.ink }]}>
                · {x}
              </Text>
            ))}
            <Button label={D.signs.have} variant="danger" size="md" onPress={p.onWarningSign} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
