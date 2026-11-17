/**
 * The day of the visit, v2 (patient app v2 §5.5, phone board 2): the ticket, quick actions (Add to calendar,
 * Directions, Share, The text we sent), where you are (five named steps, never a number, MR4), the Called
 * banner, and Questions for the doctor (write while waiting, three suggestions, tick as asked, remove; the
 * nurse and doctor read them, the desk does not, D-PA-10). Paying the fee from the ticket (P4) opens the pay
 * sheet. Data comes in as props, so the same screen renders on fixtures for screenshots.
 */
import type { TicketV2Props } from "@/components/tide/v2";
import type { VisitQuestion } from "@/data/visit-v2";
import type { StageView } from "@patient-core/visit-stages";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { VISIT_COPY } from "@content/patient-app/visit";

import { Button, Chip, SectionHead } from "@/components/tide";
import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { CalledBanner, StageList, TicketV2 } from "@/components/tide/v2";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const Q = VISIT_COPY.questions;
const A = VISIT_COPY.actions;

export interface VisitDayProps {
  ticket: TicketV2Props;
  stage: StageView;
  stageTimes: (string | null)[];
  calledRoom: string | null;
  questions: VisitQuestion[];
  nurseNote: string | null;
  onAddQuestion: (text: string, suggested: boolean) => void;
  onMarkQuestion: (id: string, change: "asked" | "not_asked" | "remove") => void;
  onAction: (a: "calendar" | "directions" | "share" | "text") => void;
  onEditNote?: () => void;
  onPayNow?: () => void;
  onOnMyWay?: () => void;
}

export function VisitDay(p: VisitDayProps) {
  const t = useTide();
  const [draft, setDraft] = useState("");
  const asked = new Set(p.questions.map((q) => q.body));
  const add = (text: string, suggested: boolean) => {
    if (!text.trim()) return;
    p.onAddQuestion(text.trim(), suggested);
    setDraft("");
  };
  return (
    <View style={{ gap: 28 }}>
      {p.calledRoom ? <CalledBanner room={p.calledRoom} code={p.ticket.code} onOnMyWay={p.onOnMyWay} /> : null}
      <TicketV2 {...p.ticket} onPayNow={p.onPayNow} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
        {(
          [
            ["calendar", A.calendar, "calendar"],
            ["directions", A.directions, "navigation"],
            ["share", A.share, "send"],
            ["text", A.text, "message"],
          ] as const
        ).map(([key, label, icon]) => (
          <Press
            key={key}
            onPress={() => p.onAction(key)}
            accessibilityLabel={label}
            style={{
              flexGrow: 1,
              flexBasis: "45%",
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2],
              paddingHorizontal: tSpace[4],
              borderRadius: tRadius.row,
              backgroundColor: t.surface,
            }}
          >
            <Icon name={icon} size={18} color={t.ink2} />
            <Text style={[tType.labelS, { color: t.ink }]}>{label}</Text>
          </Press>
        ))}
      </View>

      <View style={{ gap: tSpace[3] }}>
        <SectionHead title="Where you are" />
        <StageList view={p.stage} times={p.stageTimes} />
      </View>

      <View style={{ gap: tSpace[3] }}>
        <SectionHead title={Q.title} />
        <Text style={[tType.bodyS, { color: t.ink3 }]}>{Q.note}</Text>
        {p.questions.map((q) => (
          <View
            key={q.id}
            style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3], padding: tSpace[3], borderRadius: tRadius.row, backgroundColor: t.surface2 }}
          >
            <Press
              onPress={() => p.onMarkQuestion(q.id, q.asked ? "not_asked" : "asked")}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: q.asked }}
              accessibilityLabel={`${Q.asked}: ${q.body}`}
              style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: q.asked ? t.accent : t.lineStrong, backgroundColor: q.asked ? t.accent : "transparent" }}
            >
              {q.asked ? <Icon name="check" size={14} color={t.onAccent} /> : <View />}
            </Press>
            <Text style={[tType.body, { flex: 1, color: q.asked ? t.ink3 : t.ink, textDecorationLine: q.asked ? "line-through" : "none" }]}>
              {q.body}
            </Text>
            <Press onPress={() => p.onMarkQuestion(q.id, "remove")} accessibilityLabel={`${Q.remove}: ${q.body}`}>
              <Icon name="close" size={18} color={t.ink3} />
            </Press>
          </View>
        ))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
          {Q.suggestions
            .filter((s) => !asked.has(s))
            .map((s) => (
              <Chip key={s} label={s} onPress={() => add(s, true)} />
            ))}
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[2], alignItems: "center" }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={Q.add}
            placeholderTextColor={t.ink4}
            maxLength={280}
            accessibilityLabel={Q.add}
            onSubmitEditing={() => add(draft, false)}
            style={[tType.body, { flex: 1, minHeight: 48, paddingHorizontal: tSpace[4], borderRadius: tRadius.field, backgroundColor: t.surface, color: t.ink }]}
          />
          <Button label="Add" onPress={() => add(draft, false)} size="md" variant="soft" disabled={!draft.trim()} />
        </View>
        {p.nurseNote ? (
          <View style={{ padding: tSpace[4], borderRadius: tRadius.row, backgroundColor: t.surface, gap: 4 }}>
            <Text style={[tType.overline, { color: t.ink3 }]}>{Q.nurseNote}</Text>
            <Text style={[tType.body, { color: t.ink }]}>{p.nurseNote}</Text>
            {p.onEditNote ? (
              <Press onPress={p.onEditNote} accessibilityLabel={Q.edit}>
                <Text style={[tType.labelS, { color: t.accentText }]}>{Q.edit}</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
