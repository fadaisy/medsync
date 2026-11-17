/**
 * Patient app v2 kit, phone (§5–6). The same components, words and rules as the web's components/tide/v2-*.tsx:
 * the ticket, the payment line, the pay choice, the prompt wait, the receipt, the refund tracker, the visit
 * stages, the Called banner, the dose row and day bar, the reading snippet, the membership card and the tier
 * card. Payment states use the accent, never the clinical red, amber or green (MR5). Rules come from @patient-core, words from @content/patient-app (one source each). No red here (MR5):
 * the danger hero is in v2-hero.tsx. No dose amounts (MR3); no queue numbers (MR4).
 */
import type { Network, PromptView, RefundStatus, TicketPayLine } from "@patient-core/payments";
import type { Metric } from "@patient-core/care-trends";
import type { SugarContext } from "@patient-core/readings";
import type { StageView } from "@patient-core/visit-stages";
import { useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { MEMBERSHIP_COPY } from "@content/patient-app/membership";
import { PAYMENTS_COPY } from "@content/patient-app/payments";
import { VISIT_COPY } from "@content/patient-app/visit";
import { feeText } from "@patient-core/fees";
import { NETWORK_NAME, refundStep } from "@patient-core/payments";
import { inTargetCount, targetMarks, weekChange } from "@patient-core/reading-cards";
import { STAGES } from "@patient-core/visit-stages";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { Button, StatusPill } from "@/components/tide/primitives";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const T = VISIT_COPY.ticket;
const P = PAYMENTS_COPY;
const amount = (n: number) => feeText(n).replace("UGX ", "");

/** "K7M 42Q" read as "K, 7, M. 4, 2, Q." */
export function spokenCode(code: string): string {
  return code
    .split(/\s+/)
    .map((g) => g.split("").join(", "))
    .join(". ");
}

/* ─── The ticket (§5.3): the phone keeps the vertical tear-off ─────────────────── */

export interface TicketV2Props {
  hospitalName: string;
  hospitalInitials: string;
  day: string;
  dayLine: string;
  window: string;
  doctorTime: boolean;
  clinic: string;
  room: string | null;
  patient: string;
  block: string | null;
  pay: TicketPayLine;
  code: string;
  onPayNow?: () => void;
}

export function TicketV2(p: TicketV2Props) {
  const t = useTide();
  const notch = { position: "absolute" as const, width: 24, height: 24, borderRadius: 12, top: -12, backgroundColor: t.bg };
  return (
    <View
      accessible={false}
      style={{ borderRadius: tRadius.cardLg, overflow: "hidden", backgroundColor: t.ticket.stub, boxShadow: t.shadow.card }}
    >
      <View style={{ backgroundColor: t.ticket.navy, padding: tSpace[5], gap: tSpace[4] }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: tSpace[3] }}>
          <View style={[s.initials, { backgroundColor: t.bandGlass }]}>
            <Text style={[tType.labelS, { color: t.ticket.onNavy }]}>{p.hospitalInitials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[tType.label, { color: t.ticket.onNavy }]} numberOfLines={1}>
              {p.hospitalName}
            </Text>
            <Text style={[tType.caption, { color: t.onBand2 }]}>Kampala · {T.kicker}</Text>
          </View>
          {p.pay.kind === "paid" ? (
            <View style={[s.tag, { backgroundColor: t.bandGlass }]}>
              <Text style={[tType.labelS, { color: t.ticket.onNavy }]}>Paid</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: tSpace[4] }}>
          <Text style={{ fontFamily: tFont.semibold, fontSize: 64, lineHeight: 66, color: t.ticket.day }}>{p.day}</Text>
          <View style={{ paddingBottom: 6, gap: 2, flexShrink: 1 }}>
            <Text style={[tType.label, { color: t.ticket.onNavy }]}>{p.dayLine}</Text>
            <Text style={[tType.bodyS, { color: t.ticket.onNavy }]}>{p.window}</Text>
            <Text style={[tType.caption, { color: t.onBand2 }]}>{p.doctorTime ? T.comeEarly : T.seenInTurn}</Text>
          </View>
        </View>
      </View>
      {/* The tear: a dashed rule with two half-circle cut-outs in the page colour. */}
      <View style={{ height: 24, justifyContent: "center" }} importantForAccessibility="no-hide-descendants">
        <View style={{ marginHorizontal: 16, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: t.ticket.tear }} />
        <View style={[notch, { left: -12, top: 0 }]} />
        <View style={[notch, { right: -12, top: 0 }]} />
      </View>
      <View style={{ padding: tSpace[5], paddingTop: tSpace[2], gap: tSpace[3] }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: tSpace[2] }}>
          {(
            [
              [T.labels.clinic, p.clinic],
              [T.labels.room, p.room ?? "—"],
              [T.labels.patient, p.patient],
              [T.labels.block, p.block ?? "—"],
            ] as const
          ).map(([k, v]) => (
            <View key={k} style={{ width: "50%" }}>
              <Text style={[tType.overline, { color: t.ticket.onStub, opacity: 0.7 }]}>{k}</Text>
              <Text style={[tType.label, { color: t.ticket.onStub }]} numberOfLines={1}>
                {v}
              </Text>
            </View>
          ))}
        </View>
        <PayLine pay={p.pay} onPayNow={p.onPayNow} onStub />
        <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: t.ticket.tear, paddingTop: tSpace[3], gap: 2 }}>
          <Text
            accessibilityLabel={spokenCode(p.code)}
            style={{ fontFamily: tFont.monoSemibold, fontSize: 26, letterSpacing: 4, color: t.ticket.onStub }}
          >
            {p.code}
          </Text>
          <Text style={[tType.caption, { color: t.ticket.onStub, opacity: 0.7 }]}>{T.showCode}</Text>
        </View>
      </View>
    </View>
  );
}

/** The payment line (§5.4). Payment states are never red (MR5). On the stub it uses the ticket's own ink. */
export function PayLine({ pay, onPayNow, onStub = false }: { pay: TicketPayLine; onPayNow?: () => void; onStub?: boolean }) {
  const t = useTide();
  if (pay.kind === "free") return null;
  const box = onStub
    ? { borderWidth: 1, borderColor: t.ticket.tear, color: t.ticket.onStub, bg: "transparent" }
    : null;
  if (pay.kind === "paid" || pay.kind === "refunded") {
    const tone = pay.kind === "paid" ? { tint: t.accentTint, text: t.accentText } : t.pending;
    const text =
      pay.kind === "paid"
        ? P.line.paid
            .replace("{amount}", amount(pay.amountUgx))
            .replace("{network}", pay.method === "counter" ? P.chip.paidCounter : NETWORK_NAME[pay.method])
            .replace("{receipt}", `R ${String(pay.receiptNumber).padStart(4, "0")}`)
        : `${P.refund.steps[2]!.replace("{network}", "Mobile Money")} · ${feeText(pay.amountUgx)}`;
    return (
      <View
        accessibilityRole="text"
        style={[s.payBox, box ? { borderWidth: 1, borderColor: box.borderColor } : { backgroundColor: tone.tint }]}
      >
        <Text style={[tType.labelS, { color: box?.color ?? tone.text }]}>{text}</Text>
        {pay.kind === "paid" ? (
          <Text style={[tType.caption, { color: box?.color ?? tone.text }]}>{P.line.paidNote}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View
      style={[
        s.payBox,
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        box ? { borderWidth: 1, borderColor: box.borderColor } : { backgroundColor: t.surface2 },
      ]}
    >
      <Text style={[tType.labelS, { color: box?.color ?? t.ink }]}>
        {P.line.toPay.replace("{amount}", amount(pay.amountUgx))}
      </Text>
      {onPayNow ? <Button label={P.line.payNow} onPress={onPayNow} variant="accent" size="sm" /> : null}
    </View>
  );
}

/* ─── Paying (§5.4) ───────────────────────────────────────────────────────────── */

export function PayChoice({
  value,
  onChange,
  network,
  maskedNumber,
  onChangeNumber,
}: {
  value: "momo" | "hospital";
  onChange: (v: "momo" | "hospital") => void;
  network: Network;
  maskedNumber: string;
  onChangeNumber?: () => void;
}) {
  const t = useTide();
  const option = (v: "momo" | "hospital", title: string, note: string, extra?: React.ReactNode) => {
    const on = value === v;
    return (
      <Press
        onPress={() => onChange(v)}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${title}. ${note}`}
        style={[s.option, { backgroundColor: on ? t.accentTint : t.surface, borderColor: on ? t.accent : t.line }]}
      >
        <View style={[s.radio, { borderColor: on ? t.focus : t.lineStrong }]}>
          {on ? <View style={[s.radioDot, { backgroundColor: t.focus }]} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[tType.label, { color: t.ink }]}>{title}</Text>
          <Text style={[tType.bodyS, { color: t.ink3 }]}>{note}</Text>
          {extra}
        </View>
      </Press>
    );
  };
  return (
    <View style={{ gap: tSpace[3] }} accessibilityRole="radiogroup">
      <Text style={[tType.heading, { color: t.ink }]}>{P.choice.title}</Text>
      {option(
        "momo",
        P.choice.momo,
        P.choice.momoNote,
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], marginTop: 4 }}>
          <Icon name="smartphone" size={16} color={t.ink2} />
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            {NETWORK_NAME[network]} · {maskedNumber}
          </Text>
          {onChangeNumber ? (
            <Press onPress={onChangeNumber} accessibilityLabel={P.choice.change}>
              <Text style={[tType.labelS, { color: t.accentText }]}>{P.choice.change}</Text>
            </Press>
          ) : null}
        </View>,
      )}
      {option("hospital", P.choice.hospital, P.choice.hospitalNote)}
      <Text style={[tType.caption, { color: t.ink3 }]}>{P.choice.feeNote}</Text>
    </View>
  );
}

export function PromptStatus({ view }: { view: PromptView }) {
  const t = useTide();
  const words =
    view === "paid"
      ? { title: P.announce.paid, note: P.line.paidNote }
      : view === "approve_on_phone"
        ? { title: P.prompt.waiting, note: P.prompt.waitingNote }
        : { title: P.prompt.nothingTaken, note: P.prompt.nothingTakenNote };
  const bg = view === "paid" ? t.accentTint : t.surface2;
  const fg = view === "paid" ? t.accentText : t.ink;
  return (
    <View accessibilityLiveRegion="polite" style={[s.row, { backgroundColor: bg, borderRadius: tRadius.card, padding: tSpace[4] }]}>
      <Icon name={view === "approve_on_phone" ? "smartphone" : "check"} size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.label, { color: fg }]}>{words.title}</Text>
        <Text style={[tType.bodyS, { color: fg }]}>{words.note}</Text>
      </View>
    </View>
  );
}

export interface ReceiptView {
  number: number;
  hospital: string;
  issuedAt: string;
  items: { label: string; amountUgx: number }[];
  totalUgx: number;
  method: Network | "counter";
  reference: string | null;
  payer: string;
  patient: string;
}

export function Receipt({ r }: { r: ReceiptView }) {
  const t = useTide();
  const line = (a: string, b: string, bold = false) => (
    <View key={a} style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[bold ? tType.label : tType.bodyS, { color: t.ink }]}>{a}</Text>
      <Text style={[bold ? tType.label : tType.bodyS, { color: t.ink, fontVariant: ["tabular-nums"] }]}>{b}</Text>
    </View>
  );
  return (
    <View style={[s.card, { backgroundColor: t.surface, boxShadow: t.shadow.card }]} accessibilityLabel={P.receipt.title}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[tType.heading, { color: t.ink }]}>{P.receipt.title}</Text>
        <Text style={{ fontFamily: tFont.mono, color: t.ink2 }}>R {String(r.number).padStart(4, "0")}</Text>
      </View>
      <Text style={[tType.caption, { color: t.ink3 }]}>
        {r.hospital} · {r.issuedAt}
      </Text>
      {r.items.map((i) => line(i.label, feeText(i.amountUgx)))}
      <View style={{ height: 1, backgroundColor: t.line }} />
      {line(P.receipt.total, feeText(r.totalUgx), true)}
      <Text style={[tType.caption, { color: t.ink3 }]}>
        {P.receipt.method}: {r.method === "counter" ? P.chip.paidCounter : NETWORK_NAME[r.method]}
        {r.reference ? ` · ${P.receipt.reference} ${r.reference}` : ""}
        {r.payer !== r.patient ? ` · ${P.receipt.paidBy.replace("{payer}", r.payer).replace("{patient}", r.patient)}` : ""}
      </Text>
    </View>
  );
}

export function RefundTracker({ status, network }: { status: RefundStatus; network: Network }) {
  const t = useTide();
  const done = refundStep(status);
  return (
    <View style={{ gap: tSpace[3] }}>
      {P.refund.steps.map((step, i) => {
        const reached = i < done;
        return (
          <View key={step} style={s.row}>
            <View style={[s.dot28, { backgroundColor: reached ? t.accent : t.surface3 }]}>
              {reached ? (
                <Icon name="check" size={16} color={t.onAccent} />
              ) : (
                <Text style={[tType.labelS, { color: t.ink3 }]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[reached ? tType.label : tType.body, { color: reached ? t.ink : t.ink3 }]}>
              {step.replace("{network}", NETWORK_NAME[network])}
            </Text>
          </View>
        );
      })}
      {done < 3 ? <Text style={[tType.caption, { color: t.ink3 }]}>{P.refund.smsNote}</Text> : null}
    </View>
  );
}

/* ─── The day of the visit (§5.5) ─────────────────────────────────────────────── */

export function StageList({ view, times }: { view: StageView; times: (string | null)[] }) {
  const t = useTide();
  return (
    <View accessibilityLabel="Where you are">
      {STAGES.map((st, i) => {
        const done = i < view.index;
        const now = i === view.index;
        return (
          <View key={st} style={{ flexDirection: "row", gap: tSpace[3] }} accessibilityState={{ selected: now }}>
            <View style={{ alignItems: "center" }}>
              <View
                style={[s.dot28, { backgroundColor: done ? t.accent : now ? t.primary : t.surface3 }]}
              >
                {done ? (
                  <Icon name="check" size={16} color={t.onAccent} />
                ) : (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: now ? t.onPrimary : t.ink4 }} />
                )}
              </View>
              {i < STAGES.length - 1 ? (
                <View style={{ width: 2, flex: 1, minHeight: 20, marginVertical: 4, backgroundColor: done ? t.accent : t.line }} />
              ) : null}
            </View>
            <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: tSpace[4] }}>
              <Text style={[now ? tType.label : tType.body, { color: now || done ? t.ink : t.ink3 }]}>
                {now ? view.label : st}
              </Text>
              <Text style={[tType.caption, { color: t.ink3 }]}>{times[i] ?? ""}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function StageStrip({ view }: { view: StageView }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[2] }}>
      <View style={{ flexDirection: "row", gap: 6 }} importantForAccessibility="no-hide-descendants">
        {STAGES.map((st, i) => (
          <View key={st} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= view.index ? t.accent : t.line }} />
        ))}
      </View>
      <Text style={[tType.label, { color: t.ink }]}>{view.label}</Text>
    </View>
  );
}

/** "Called to Room 4": a strong lagoon banner, announced assertively (§11). Haptics are the screen's job. */
export function CalledBanner({ room, code, onOnMyWay }: { room: string; code: string; onOnMyWay?: () => void }) {
  const t = useTide();
  const title = VISIT_COPY.called.title.replace("{room}", room);
  AccessibilityInfo.announceForAccessibility?.(`${title}. ${spokenCode(code)}`);
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[s.card, s.row, { backgroundColor: t.accent, boxShadow: t.shadow.accent, flexWrap: "wrap" }]}
    >
      <Icon name="bell" size={26} color={t.onAccent} />
      <View style={{ flex: 1, minWidth: 140 }}>
        <Text style={[tType.title, { color: t.onAccent }]}>{title}</Text>
        <Text style={{ fontFamily: tFont.mono, color: t.onAccent, letterSpacing: 2 }}>{code}</Text>
      </View>
      {onOnMyWay ? <Button label={VISIT_COPY.called.onMyWay} onPress={onOnMyWay} size="md" /> : null}
    </View>
  );
}

/* ─── Care (§5.6–5.7) ─────────────────────────────────────────────────────────── */

export interface PlanPoint {
  key: string;
  label: string;
  at: string;
  done: boolean;
  kind: "dose" | "check" | "walk";
}

export function DoseRow({ point, onToggle }: { point: PlanPoint; onToggle: () => void }) {
  const t = useTide();
  const C = CARE_V2_COPY.plan;
  return (
    <Press
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: point.done }}
      accessibilityLabel={(point.done ? C.untick : C.tick).replace("{item}", `${point.label}, ${point.at}`)}
      style={[s.option, { backgroundColor: t.surface2, borderColor: "transparent", alignItems: "center", minHeight: 56 }]}
    >
      <View style={[s.check, point.done ? { backgroundColor: t.accent, borderColor: t.accent } : { borderColor: t.lineStrong }]}>
        {point.done ? <Icon name="check" size={14} color={t.onAccent} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
          {point.label}
        </Text>
        <Text style={[tType.caption, { color: t.ink3 }]}>
          {point.at}
          {point.kind === "dose" ? ` · ${C.label}` : ""}
        </Text>
      </View>
      <Text style={[tType.caption, { color: t.ink3 }]}>{point.done ? C.taken : C.due}</Text>
    </Press>
  );
}

/** The phone's day bar: the plan's points along 06:00–22:00 with a Now marker. Ticks happen in the rows. */
export function DayBar({ points, now }: { points: PlanPoint[]; now: string }) {
  const t = useTide();
  const mins = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const pct = (s: string) => `${Math.min(100, Math.max(0, ((mins(s) - 360) / 960) * 100))}%` as const;
  return (
    <View style={{ height: 36, justifyContent: "center", marginHorizontal: 10 }} importantForAccessibility="no-hide-descendants">
      <View style={{ height: 2, backgroundColor: t.line }} />
      <View style={{ position: "absolute", left: pct(now), top: 0, bottom: 0, width: 2, backgroundColor: t.accentText }} />
      {points.map((p) => (
        <View
          key={p.key}
          style={{
            position: "absolute",
            left: pct(p.at),
            marginLeft: -7,
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: p.done ? t.accent : t.lineStrong,
            backgroundColor: p.done ? t.accent : t.surface,
          }}
        />
      ))}
    </View>
  );
}

export interface DayReading {
  date: string;
  value: number | null;
  bottom?: number | null;
}

/** The reading snippet on Today (§5.7): same maths and words as the web card; tap a day to read it. */
export function ReadingSnippet({
  metric,
  ctx,
  unit,
  days,
  weekAgo,
  weightNextStep = null,
  onLog,
}: {
  metric: Exclude<Metric, "pulse">;
  ctx: SugarContext;
  unit: string;
  days: DayReading[];
  weekAgo: number | null;
  weightNextStep?: number | null;
  onLog?: () => void;
}) {
  const t = useTide();
  const C = CARE_V2_COPY.readings;
  let last = -1;
  days.forEach((d, i) => d.value !== null && (last = i));
  const [focus, setFocus] = useState<number | null>(null);
  const shown = focus ?? last;
  const day = shown >= 0 ? days[shown]! : null;
  const marks = targetMarks(metric, ctx, weightNextStep);
  const change = weekChange(metric, ctx, weekAgo, days[last]?.value ?? null, weightNextStep);
  const count = inTargetCount(metric, ctx, days.map((d) => d.value));
  const inBand = (v: number | null) =>
    v === null ? null : marks.band ? v >= marks.band.lo && v <= marks.band.hi : metric === "bp" ? v < marks.lines[0]!.value : null;
  const status = inBand(day?.value ?? null);
  const valueText = day?.value == null ? "—" : metric === "bp" ? `${day.value}/${day.bottom ?? "—"}` : String(day.value);

  const W = 300, H = 90, PAD = 8;
  const vals = days.flatMap((d) => [d.value, d.bottom ?? null]).filter((v): v is number => v !== null);
  const refs = [...(marks.band ? [marks.band.lo, marks.band.hi] : []), ...marks.lines.map((l) => l.value)];
  let lo = Math.min(...vals, ...refs), hi = Math.max(...vals, ...refs);
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  const pad = (hi - lo || 1) * 0.1;
  lo -= pad; hi += pad;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(days.length - 1, 1);
  const y = (v: number) => PAD + ((hi - v) * (H - 2 * PAD)) / (hi - lo);

  return (
    <View style={[s.card, { backgroundColor: t.surface, boxShadow: t.shadow.card }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[tType.label, { color: t.ink }]}>{C.titles[metric]}</Text>
        {status === null ? null : <StatusPill tone={status ? "stable" : "caution"} label={status ? C.inTarget : C.outOfTarget} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: tSpace[2], flexWrap: "wrap" }} accessibilityLiveRegion="polite">
        <Text style={{ fontFamily: tFont.semibold, fontSize: 32, color: t.ink }}>{valueText}</Text>
        <Text style={[tType.bodyS, { color: t.ink3 }]}>{unit}</Text>
        {change && focus === null ? (
          <Text
            style={[
              tType.labelS,
              { color: change.tone === "good" ? t.stable.text : change.tone === "caution" ? t.caution.text : t.ink3 },
            ]}
          >
            {change.text}
          </Text>
        ) : null}
        <Text style={[tType.caption, { color: t.ink3, marginLeft: "auto" }]}>{day?.date ?? C.noReading}</Text>
      </View>
      <View>
        <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} accessibilityLabel={`${C.titles[metric]}. ${count?.text ?? ""}`}>
          {marks.band ? (
            <Rect x={PAD} width={W - 2 * PAD} y={y(marks.band.hi)} height={Math.max(0, y(marks.band.lo) - y(marks.band.hi))} fill={t.stable.tint} />
          ) : null}
          {marks.lines.map((l) => (
            <Line key={l.label} x1={PAD} x2={W - PAD} y1={y(l.value)} y2={y(l.value)} stroke={t.stable.text} strokeOpacity={0.6} strokeDasharray={l.dashed ? "4 4" : undefined} />
          ))}
          {focus !== null ? <Line x1={x(focus)} x2={x(focus)} y1={2} y2={H - 2} stroke={t.ink3} /> : null}
          {days.map((d, i) =>
            d.value === null ? null : (
              <Circle key={i} cx={x(i)} cy={y(d.value)} r={i === shown ? 5 : 3.5} fill={inBand(d.value) === false ? t.caution.text : t.area.readings} />
            ),
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { flexDirection: "row" }]}>
          {days.map((d, i) => (
            <Press
              key={i}
              haptic={false}
              onPress={() => setFocus(focus === i ? null : i)}
              accessibilityLabel={`${d.date}: ${d.value === null ? C.noReading : `${metric === "bp" ? `${d.value}/${d.bottom ?? ""}` : d.value} ${unit}`}`}
              style={{ flex: 1 }}
            >
              <View />
            </Press>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[tType.labelS, { color: t.ink2 }]}>{count?.text ?? ""}</Text>
        {onLog ? <Button label={C.log} icon="plus" onPress={onLog} variant="soft" size="sm" /> : null}
      </View>
    </View>
  );
}

/* ─── Me (§5.9) ──────────────────────────────────────────────────────────────── */

export type Tier = "basic" | "plus_family" | "plus_care" | "family_care";

export interface MedicalId {
  emergencyContact: string;
  bloodGroup: string | null;
  allergies: string[];
  conditions: string[];
  hospitalLine: string;
  qr: React.ReactNode;
}

/** The membership card: front and back, "Turn over" is a real button; Reduce Motion swaps faces with a fade. */
export function MembershipCard({ tier, name, memberNo, id }: { tier: Tier; name: string; memberNo: string; id: MedicalId }) {
  const t = useTide();
  const M = MEMBERSHIP_COPY;
  const [back, setBack] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [turn] = useState(() => new Animated.Value(0));
  const flip = async () => {
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    const to = back ? 0 : 1;
    if (reduce) turn.setValue(to);
    else Animated.timing(turn, { toValue: to, duration: 400, useNativeDriver: true }).start();
    setBack(!back);
  };
  const surface = {
    basic: { bg: t.tier.basic, fg: t.tier.onBasic },
    plus_family: { bg: t.tier.plusFamily, fg: t.tier.onTier },
    plus_care: { bg: t.tier.plusCare, fg: t.tier.onTier },
    family_care: { bg: t.tier.familyCare, fg: t.tier.onTier },
  }[tier];
  const tierName = { basic: M.tiers.basic, plus_family: M.tiers.plusFamily, plus_care: M.tiers.plusCare, family_care: M.tiers.familyCare }[tier];
  const front = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const rear = turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const face = { position: "absolute" as const, inset: 0, backfaceVisibility: "hidden" as const, borderRadius: tRadius.cardLg, padding: tSpace[5] };
  return (
    <View style={{ gap: tSpace[3], alignItems: "center" }}>
      <View style={{ width: "100%", aspectRatio: 1.586 }}>
        <Animated.View
          importantForAccessibility={back ? "no-hide-descendants" : "auto"}
          style={[face, { backgroundColor: surface.bg, justifyContent: "space-between", transform: [{ perspective: 1200 }, { rotateY: front }] }]}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[tType.heading, { color: surface.fg }]}>Tether</Text>
            <View style={[s.tag, tier === "family_care" ? { borderWidth: 1, borderColor: t.tier.gold } : { backgroundColor: t.bandGlass }]}>
              <Text style={[tType.labelS, { color: tier === "family_care" ? t.tier.gold : surface.fg }]}>{tierName}</Text>
            </View>
          </View>
          <View>
            <Text style={[tType.heading, { color: surface.fg }]}>{name}</Text>
            <Text style={{ fontFamily: tFont.mono, color: surface.fg, letterSpacing: 3 }}>{memberNo}</Text>
          </View>
        </Animated.View>
        <Animated.View
          importantForAccessibility={back ? "auto" : "no-hide-descendants"}
          style={[face, { backgroundColor: t.surface, flexDirection: "row", gap: tSpace[3], transform: [{ perspective: 1200 }, { rotateY: rear }] }]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[tType.label, { color: t.ink }]}>{M.card.back.title}</Text>
            <Text style={[tType.caption, { color: t.ink }]}>
              {M.card.back.emergencyContact}: {id.emergencyContact}
            </Text>
            <Text style={[tType.caption, { color: t.ink }]}>
              {M.card.back.bloodGroup}: {id.bloodGroup ?? "—"}
            </Text>
            <Text style={[tType.caption, { color: t.ink }]}>
              {M.card.back.allergies}: {id.allergies.join(", ") || "—"}
            </Text>
            {showConditions ? (
              <Text style={[tType.caption, { color: t.ink }]}>
                {M.card.back.conditions}: {id.conditions.join(", ") || "—"}
              </Text>
            ) : (
              <Press onPress={() => setShowConditions(true)} accessibilityLabel={M.card.back.showConditions}>
                <Text style={[tType.labelS, { color: t.accentText }]}>{M.card.back.showConditions}</Text>
              </Press>
            )}
          </View>
          <View style={{ width: 96, alignItems: "center", gap: 4 }}>
            {id.qr}
            <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>{M.card.back.qrNote}</Text>
          </View>
        </Animated.View>
      </View>
      <Button label={back ? M.card.turnBack : M.card.turnOver} onPress={flip} variant="soft" size="md" />
    </View>
  );
}

export function TierCard({
  tier,
  monthlyUgx,
  yearlyUgx,
  features,
  current,
  onChoose,
  chooseLabel,
}: {
  tier: Exclude<Tier, "basic">;
  monthlyUgx: number;
  yearlyUgx: number;
  features: string[];
  current: boolean;
  onChoose: () => void;
  /** The button's words; the kit's default is the trial offer. */
  chooseLabel?: string;
}) {
  const t = useTide();
  const M = MEMBERSHIP_COPY;
  const name = { plus_family: M.tiers.plusFamily, plus_care: M.tiers.plusCare, family_care: M.tiers.familyCare }[tier];
  const swatch = { plus_family: t.tier.plusFamily, plus_care: t.tier.plusCare, family_care: t.tier.familyCare }[tier];
  return (
    <View style={[s.card, { backgroundColor: t.surface, boxShadow: t.shadow.card }]}>
      <View style={{ width: 48, height: 8, borderRadius: 4, backgroundColor: swatch }} />
      <Text style={[tType.heading, { color: t.ink }]}>{name}</Text>
      <Text style={[tType.title, { color: t.ink }]}>UGX {monthlyUgx.toLocaleString("en-GB")}</Text>
      <Text style={[tType.caption, { color: t.ink3 }]}>
        {M.plans.yearly}: UGX {yearlyUgx.toLocaleString("en-GB")} · {M.plans.yearlyNote}
      </Text>
      {features.map((f) => (
        <Text key={f} style={[tType.bodyS, { color: t.ink2 }]}>
          • {f}
        </Text>
      ))}
      <Text style={[tType.caption, { color: t.ink3 }]}>{M.plans.neverAhead}</Text>
      <Button label={current ? name : (chooseLabel ?? M.plans.trial)} onPress={onChoose} variant={current ? "soft" : "accent"} disabled={current} size="md" />
    </View>
  );
}

const s = StyleSheet.create({
  initials: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  payBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  option: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 18, borderWidth: 1.5, alignItems: "flex-start" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot28: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 22, padding: 20, gap: 12 },
});
