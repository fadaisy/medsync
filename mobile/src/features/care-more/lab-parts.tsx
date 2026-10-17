import type { LabFold, LabPanel, LabRow } from "@/data/labs";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Card, Icon, Note, RangeBar, Sparkbars, StatusPill } from "@/components/tide";
import { boundText, goodSpan, HBA1C, labStatus, panelStatus } from "@/data/labs";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/** A panel card: icon, title, the panel's word, then its rows and one line on what it means. */
function PanelFrame({
  title,
  sub,
  icon,
  status,
  meaning,
  children,
}: {
  title: string;
  sub: string;
  icon: LabPanel["icon"];
  status: { tone: "stable" | "caution"; word: string };
  meaning: string;
  children: ReactNode;
}) {
  const t = useTide();
  return (
    <Card padding={tSpace[3.5]} style={{ gap: tSpace[1.5] }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[2.5],
          paddingBottom: tSpace[1],
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: tRadius.sm,
            backgroundColor: t.surface2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={19} color={t.area.medicines} />
        </View>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
            {title}
          </Text>
          <Text style={[tType.caption, { fontFamily: tType.bodyS.fontFamily, color: t.ink2 }]}>
            {sub}
          </Text>
        </View>
        <StatusPill tone={status.tone} label={status.word} />
      </View>
      {children}
      <Note style={{ marginTop: tSpace[1], padding: tSpace[2.5] }}>{meaning}</Note>
    </Card>
  );
}

/** HbA1c: the value, the change since last time, and four quarters against the target line. */
export function HbA1cPanel() {
  const t = useTide();
  const h = HBA1C;
  const status = labStatus(h.value, h.bound);
  const prev = h.history[h.history.length - 2];
  const change = Math.round((h.value - prev) * 10) / 10;
  const sinceName = h.monthNames[h.monthNames.length - 2];
  const W = 190;
  const summary = `HbA1c: ${h.history.map((v, i) => `${h.monthNames[i]} ${v}`).join(", ")} percent; target below ${h.bound.limit}`;
  const column = (labels: string[], bold: boolean) => (
    <View style={{ flexDirection: "row", width: W }}>
      {labels.map((l, i) => (
        <Text
          key={i}
          style={[
            bold ? tType.caption : tType.micro,
            {
              flex: 1,
              textAlign: "center",
              color: bold ? t.ink : i === labels.length - 1 ? t.ink : t.ink2,
            },
          ]}
        >
          {l}
        </Text>
      ))}
    </View>
  );
  return (
    <PanelFrame
      title="HbA1c"
      sub="3-month sugar average"
      icon="droplet"
      status={status}
      meaning={h.meaning}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
        <View style={{ gap: 2, flexShrink: 0 }}>
          <Text style={[tType.numeral, { fontFamily: tType.label.fontFamily, color: t.ink }]}>
            {h.value}
            <Text style={[tType.label, { fontSize: 18 }]}>{h.unit}</Text>
          </Text>
          <View
            accessible
            accessibilityLabel={`${change < 0 ? "Down" : "Up"} ${Math.abs(change)} since ${sinceName}`}
            style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}
          >
            <Icon
              name={change < 0 ? "arrowDown" : "arrowUp"}
              size={15}
              color={t.accentText}
              strokeWidth={2.4}
            />
            <Text style={[tType.caption, { fontSize: 13, color: t.accentText }]}>
              {Math.abs(change)} since {sinceName}
            </Text>
          </View>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={summary}
          style={{ marginLeft: "auto", gap: 2 }}
        >
          {column(h.history.map(String), true)}
          <Sparkbars
            values={h.history}
            min={5}
            max={10}
            target={h.bound.limit}
            width={W}
            height={52}
            showValues={false}
          />
          {column(h.months, false)}
          <Text
            style={[
              tType.micro,
              { fontFamily: tType.caption.fontFamily, color: t.accentText, textAlign: "right" },
            ]}
          >
            Target below {h.bound.limit}%
          </Text>
        </View>
      </View>
    </PanelFrame>
  );
}

function RowLine({ row }: { row: LabRow }) {
  const t = useTide();
  const s = labStatus(row.value, row.bound);
  const { goodFrom, goodTo } = goodSpan(row);
  const target = boundText(row.bound);
  return (
    <View
      accessible
      accessibilityLabel={`${row.name}, ${row.value} ${row.unit}, ${s.word}. ${target}.`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2.5],
        paddingVertical: 7,
        borderTopWidth: 1,
        borderTopColor: t.surface3,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[tType.labelS, { color: t.ink }]}>{row.name}</Text>
        <Text style={[tType.micro, { color: t.ink3 }]}>{target}</Text>
      </View>
      <RangeBar
        min={row.scale.min}
        max={row.scale.max}
        goodFrom={goodFrom}
        goodTo={goodTo}
        value={row.value}
        tone={s.tone}
      />
      <View style={{ alignItems: "flex-end", gap: 2, minWidth: 92 }}>
        <Text style={[tType.label, { fontSize: 15, color: t.ink, fontVariant: ["tabular-nums"] }]}>
          {row.value} <Text style={[tType.micro, { color: t.ink2 }]}>{row.unit}</Text>
        </Text>
        <StatusPill
          tone={s.tone}
          label={s.word}
          style={{ minHeight: 22, paddingHorizontal: tSpace[2] }}
        />
      </View>
    </View>
  );
}

function FoldLine({ fold }: { fold: LabFold }) {
  const t = useTide();
  return (
    <View
      style={{
        gap: tSpace[1.5],
        paddingVertical: 7,
        borderTopWidth: 1,
        borderTopColor: t.surface3,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[tType.caption, { fontSize: 13, color: t.ink }]}>{fold.title}</Text>
        <Text style={[tType.caption, { fontSize: 13, color: t.stable.text }]}>{fold.word}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[1.5] }}>
        {fold.items.map((i) => (
          <View
            key={i}
            style={{
              minHeight: 28,
              paddingHorizontal: tSpace[2.5],
              borderRadius: tRadius.pill,
              backgroundColor: t.bg,
              justifyContent: "center",
            }}
          >
            <Text style={[tType.caption, { color: t.ink }]}>{i}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PanelCard({ panel }: { panel: LabPanel }) {
  return (
    <PanelFrame
      title={panel.title}
      sub={panel.sub}
      icon={panel.icon}
      status={panelStatus(panel.items)}
      meaning={panel.meaning}
    >
      {panel.items.map((i) =>
        i.type === "row" ? <RowLine key={i.id} row={i} /> : <FoldLine key={i.id} fold={i} />,
      )}
    </PanelFrame>
  );
}

/** The three summary tiles: need attention, healthy, your visit. */
export function SummaryTiles({
  needReview,
  healthy,
  visit,
}: {
  needReview: number;
  healthy: number;
  visit: string;
}) {
  const t = useTide();
  const tile = (
    value: string,
    word: string,
    bg: string,
    fg: string,
    sub: string,
    shadow?: string,
  ) => (
    <View
      accessible
      accessibilityLabel={`${value} ${word}`}
      style={{
        flex: 1,
        paddingVertical: tSpace[2.5],
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.field,
        backgroundColor: bg,
        boxShadow: shadow,
      }}
    >
      <Text
        style={[tType.heading, { fontFamily: tType.numeral.fontFamily, fontSize: 18, color: fg }]}
      >
        {value}
      </Text>
      <Text style={[tType.caption, { color: sub }]}>{word}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: tSpace[2] }}>
      {tile(String(needReview), "need attention", t.caution.tint, t.caution.text, t.caution.text)}
      {tile(String(healthy), "healthy", t.stable.tint, t.stable.text, t.stable.text)}
      {tile(visit, "your visit", t.surface, t.ink, t.ink2, t.shadow.card)}
    </View>
  );
}
