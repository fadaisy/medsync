import type { DayOption, Days, SessionOption, Ticket as TicketData } from "@/data/visits";
import type { AppointmentReason } from "@/lib/booking";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  Button,
  Card,
  FieldError,
  Icon,
  Note,
  Press,
  Screen,
  TextField,
  Ticket,
} from "@/components/tide";
import { loadDays, payments, requestDay, useTickets } from "@/data/visits";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import {
  clockOf,
  dayKeyOf,
  dayNumberOf,
  feeText,
  monthShortOf,
  shortDayOf,
  weekdayOf,
} from "@/features/visits/logic";
import { HonestNote, pickStyle, StepTitle } from "@/features/visits/parts";
import { APPOINTMENT_REASONS, newIdempotencyKey } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Ask for a day (board TBookDay, prompt §8.3, PRD F-11 and F-12).
 *
 * All real: the published clinic days that take this kind of visit
 * (`fetchSessions`, `fetchServiceLines`) or, from a doctor's card on Home,
 * that clinician's own open slots (`pt-bookable-clinicians`), and the request
 * itself (`pt-request-appointment`, one idempotency key per attempt). The fee
 * is the clinic's own price list; where none is priced it says "No fee".
 *
 * Morning or afternoon is shown as when doors open, never as your hour (law
 * L8). Payment is simulated (`payments`). With no hospital chosen the patient
 * chooses one first; nothing is shown in its place.
 */
const REASONS = new Set<string>(APPOINTMENT_REASONS.map((r) => r.value));

export default function BookDayScreen() {
  const t = useTide();
  const { session: auth } = useSession();
  const params = useLocalSearchParams<{
    day?: string;
    reason?: string;
    member?: string;
    memberName?: string;
    /** Home's "Ask for a day": the clinician's user id and their department. */
    doctor?: string;
    department?: string;
    /** The doctor's hospital, which may not be the patient's own (ADR 0086). */
    hospital?: string;
  }>();
  const reason = (
    params.reason && REASONS.has(params.reason) ? params.reason : "follow_up"
  ) as AppointmentReason;
  const fullName = auth?.user.user_metadata?.full_name;
  const patient =
    params.memberName ??
    (typeof fullName === "string" && fullName.trim() ? fullName : "[First name] [Surname]");

  const [days, setDays] = useState<Days | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(params.day ?? null);
  const [part, setPart] = useState<"Morning" | "Afternoon" | null>(null);
  const [whoId, setWhoId] = useState<string | null>(null);
  const [pay, setPay] = useState<"momo" | "later">("momo");
  const [note, setNote] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const all = useTickets();
  const ticket = ticketId ? (all.find((x) => x.id === ticketId) ?? null) : null;

  const { doctor, department, hospital } = params;
  useEffect(() => {
    let live = true;
    loadDays(
      reason,
      doctor ? { userId: doctor, departmentId: department, hospitalId: hospital } : null,
    ).then(
      (d) => {
        if (live) setDays(d);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [reason, doctor, department, hospital, attempt]);

  if (ticket) return <Sent ticket={ticket} />;

  if (!days) {
    return (
      <Screen back={{ label: "Book a visit" }} title="Ask for a day" helpSource="book-day">
        {failed ? (
          <View style={{ gap: tSpace[3] }}>
            <Note tone="plain">
              {"Couldn't load the clinic days. Check your connection and try again."}
            </Note>
            <Button
              label="Try again"
              variant="outline"
              onPress={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        ) : (
          <ActivityIndicator color={t.ink} accessibilityLabel="Loading the clinic days" />
        )}
      </Screen>
    );
  }

  const hospitalId = days.hospitalId;
  if (!hospitalId) {
    return (
      <Screen back={{ label: "Book a visit" }} title="Ask for a day" helpSource="book-day">
        <HospitalPicker
          onChosen={() => {
            setDays(null);
            setAttempt((n) => n + 1);
          }}
        />
      </Screen>
    );
  }

  const takeable = (d: DayOption) => d.sessions.some((s) => s.placesLeft > 0);
  const day = days.days.find((d) => d.key === picked) ?? days.days.find(takeable) ?? null;
  const inPart = (p: "Morning" | "Afternoon") => (day?.sessions ?? []).filter((s) => s.part === p);
  const partOpen = (p: "Morning" | "Afternoon") => inPart(p).some((s) => s.placesLeft > 0);
  const chosenPart =
    part && partOpen(part)
      ? part
      : partOpen("Morning")
        ? "Morning"
        : partOpen("Afternoon")
          ? "Afternoon"
          : null;
  const open = chosenPart ? inPart(chosenPart).filter((s) => s.placesLeft > 0) : [];
  // "Any doctor" takes the cheapest open place; a named doctor is their own session.
  const anySession = [...open].sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0))[0] ?? null;
  const named = open.filter((s) => s.clinicianName !== "Clinic team");
  const whoSel = whoId === "any" ? null : whoId;
  const session: SessionOption | null = (whoSel && open.find((s) => s.id === whoSel)) || anySession;
  // From a doctor's card the clinician is already chosen: no "who" question.
  const whoOptions = days.doctorName
    ? []
    : [
        { key: "any", name: "Any doctor", fee: anySession?.fee ?? null },
        ...named.map((s) => ({ key: s.id, name: s.clinicianName, fee: s.fee })),
      ];
  const fee = session?.fee ?? null;
  const clinicName = days.days[0]?.sessions[0]?.clinicName ?? "The clinic";
  const weekdays = [...new Set(days.days.map((d) => weekdayOf(d.key)))];
  const dayWords = day
    ? `${weekdayOf(day.key)} ${dayNumberOf(day.key)} ${(chosenPart ?? "").toLowerCase()}`
    : "";
  const send = fee && pay === "momo" ? `Pay ${feeText(fee)} · ${dayWords}` : `Ask for ${dayWords}`;

  const reset = () => setKey(null);

  const onSend = async () => {
    if (!day || !session || busy) return;
    const k = key ?? newIdempotencyKey();
    setKey(k);
    setBusy(true);
    setError(null);
    const res = await requestDay({
      days: { ...days, hospitalId },
      day,
      session,
      reason,
      note,
      forProvisionalId: params.member ?? null,
      patient,
      payNow: pay === "momo",
      idempotencyKey: k,
      now: new Date(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setKey(null);
    setTicketId(res.ticket.id);
  };

  return (
    <Screen
      back={{ label: "Book a visit" }}
      overline={
        days.days.length ? `${clinicName} · open ${weekdays.join(" and ")}` : days.hospitalName
      }
      overlineColor={t.area.visits}
      title={days.doctorName ? `Ask ${days.doctorName} for a day` : "Ask for a day"}
      helpSource="book-day"
    >
      {days.days.length === 0 ? (
        <Note tone="plain">
          {days.doctorName
            ? `${days.doctorName} has no open day on MedSync in the next two weeks.`
            : "No clinic day for this kind of visit is open on MedSync in the next two weeks."}
        </Note>
      ) : (
        // The rail runs off the right edge: no right padding.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
          contentContainerStyle={{ paddingLeft: tSpace[5], gap: tSpace[2], paddingVertical: 4 }}
        >
          {days.days.map((d) => {
            const on = d.key === day?.key;
            const room = takeable(d);
            return (
              <Press
                key={d.key}
                onPress={() => {
                  setPicked(d.key);
                  setWhoId(null);
                  reset();
                }}
                disabled={!room}
                accessibilityState={{ selected: on, disabled: !room }}
                accessibilityLabel={`${shortDayOf(d.key)}, ${room ? "places left" : "full"}`}
                style={{
                  width: 74,
                  height: 96,
                  borderRadius: tRadius.panel,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  backgroundColor: on ? t.band : room ? t.surface : t.surface3,
                  boxShadow: on || !room ? undefined : t.shadow.card,
                }}
              >
                <Text style={[tType.caption, { color: on ? t.onBand2 : room ? t.ink2 : t.ink4 }]}>
                  {weekdayOf(d.key).toUpperCase()}
                </Text>
                <Text
                  style={{
                    fontFamily: tFont.monoSemibold,
                    fontSize: 28,
                    lineHeight: 32,
                    color: on ? t.onBand : room ? t.ink : t.ink4,
                  }}
                >
                  {dayNumberOf(d.key).padStart(2, "0")}
                </Text>
                <Text
                  style={[
                    tType.micro,
                    {
                      fontFamily: tFont.semibold,
                      color: on ? t.onBandAccent : room ? t.accentText : t.ink4,
                    },
                  ]}
                >
                  {room ? "Room" : "Full"}
                </Text>
              </Press>
            );
          })}
        </ScrollView>
      )}

      {day ? (
        <View style={{ gap: tSpace[2] }}>
          <StepTitle>Morning or afternoon?</StepTitle>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            {(["Morning", "Afternoon"] as const).map((p) => {
              const ss = inPart(p);
              const ok = partOpen(p);
              const places = ss.reduce((n, s) => n + s.placesLeft, 0);
              const on = p === chosenPart;
              return (
                <Press
                  key={p}
                  onPress={() => {
                    setPart(p);
                    setWhoId(null);
                    reset();
                  }}
                  disabled={!ok}
                  accessibilityState={{ selected: on, disabled: !ok }}
                  accessibilityLabel={
                    ok
                      ? `${p}, ${ss[0]?.doors ? `doors open ${ss[0].doors}, ` : ""}${places} places left`
                      : `${p}, full`
                  }
                  style={{
                    flex: 1,
                    minHeight: 72,
                    paddingHorizontal: tSpace[3.5],
                    justifyContent: "center",
                    gap: 2,
                    borderRadius: tRadius.card,
                    opacity: ok ? 1 : 0.5,
                    ...pickStyle(t, on),
                  }}
                >
                  <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{p}</Text>
                  <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                    {ss.length === 0
                      ? "No clinic"
                      : ok
                        ? `${ss[0]?.doors ? `Doors ${ss[0].doors} · ` : ""}${places} places left`
                        : "Full"}
                  </Text>
                </Press>
              );
            })}
          </View>
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
            The time is when doors open, not your hour. You are seen in the order people arrive with
            a code.
          </Text>
        </View>
      ) : null}

      {session ? (
        <View style={{ gap: tSpace[2] }}>
          {days.doctorName ? (
            <Text style={[tType.bodyM, { color: t.ink2 }]}>
              {`${days.doctorName} · ${session.feeLabel ?? feeText(session.fee)}`}
            </Text>
          ) : (
            <StepTitle>Who do you want to see?</StepTitle>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
            {whoOptions.map((o) => {
              const on = o.key === "any" ? whoSel === null : whoSel === o.key;
              return (
                <Press
                  key={o.key}
                  onPress={() => {
                    setWhoId(o.key);
                    reset();
                  }}
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${o.name}, ${feeText(o.fee)}`}
                  style={{
                    flexGrow: 1,
                    flexBasis: "45%",
                    padding: tSpace[3],
                    borderRadius: tRadius.row,
                    gap: 2,
                    ...pickStyle(t, on),
                  }}
                >
                  <Text style={[tType.labelS, { color: t.ink }]} numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                    {feeText(o.fee)}
                  </Text>
                </Press>
              );
            })}
          </View>
          {fee ? (
            <View style={{ flexDirection: "row", gap: tSpace[2] }}>
              {(
                [
                  ["momo", "Pay now · Mobile Money", "Your day is held once paid"],
                  ["later", "Pay later", "Here before the day, or at the desk"],
                ] as const
              ).map(([k, title, line]) => (
                <Press
                  key={k}
                  onPress={() => setPay(k)}
                  accessibilityState={{ selected: pay === k }}
                  accessibilityLabel={`${title}. ${line}`}
                  style={{
                    flex: 1,
                    padding: tSpace[3],
                    borderRadius: tRadius.field,
                    gap: 2,
                    ...pickStyle(t, pay === k),
                  }}
                >
                  <Text style={[tType.labelS, { fontSize: 13, color: t.ink }]}>{title}</Text>
                  <Text style={[tType.micro, { color: t.ink2 }]}>{line}</Text>
                </Press>
              ))}
            </View>
          ) : null}
          {fee && pay === "momo" && !flag("mobilePayments") ? (
            <Note tone="plain" icon="smartphone">
              Demo payment: no money moves, and your ticket says so.
            </Note>
          ) : null}
        </View>
      ) : null}

      <TextField
        label="Anything the doctor should know?"
        optional
        value={note}
        onChangeText={(v) => {
          setNote(v);
          reset();
        }}
        placeholder="Type here"
        maxLength={500}
        multiline
      />

      {error ? <FieldError>{error}</FieldError> : null}
      <View style={{ gap: tSpace[2] }}>
        <Button label={send} busy={busy} disabled={!session} onPress={() => void onSend()} />
        <Text
          style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
        >
          The clinic confirms it. You will see the answer in Visits.
        </Text>
      </View>
    </Screen>
  );
}

/** The day ticket and what happens next. */
function Sent({ ticket: tk }: { ticket: TicketData }) {
  const t = useTide();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = tk.dayKey ?? dayKeyOf(tk.issuedAtIso);
  const steps: [string, boolean][] = [
    ["You asked", true],
    ["The clinic confirms it", !tk.awaiting],
    ["A reminder the day before", false],
    ["Show your code at the desk", false],
  ];
  return (
    <Screen
      back={{ label: "Book a visit" }}
      overline="Request sent"
      overlineColor={t.area.visits}
      title={tk.awaiting ? "Waiting for the clinic" : "Your day is confirmed"}
      helpSource="ticket"
    >
      <Ticket
        kind="day"
        hospitalName={tk.hospitalName}
        day={dayNumberOf(key)}
        dayLine={`${weekdayOf(key)} · ${monthShortOf(key)}`.toUpperCase()}
        sessionLine={tk.doors ? `${tk.part ?? ""} · doors ${tk.doors}` : (tk.part ?? "")}
        status={tk.awaiting ? "Waiting for the clinic to confirm" : "Confirmed"}
        details={[
          { label: "Clinic", value: tk.clinic },
          { label: "See", value: tk.see },
          { label: "Room", value: tk.room },
          { label: "Time", value: "Not promised" },
          { label: "Patient", value: tk.patient },
          {
            label: "Asked",
            value: `${shortDayOf(dayKeyOf(tk.issuedAtIso))} · ${clockOf(tk.issuedAtIso)}`,
          },
        ]}
        fee={tk.fee}
        feeLabel={tk.feeLabel}
        paid={tk.paid}
        demoPayment={tk.demoPayment}
        paying={paying}
        onPayNow={() => {
          setPaying(true);
          void payments.payTicket(tk).then((r) => {
            setPaying(false);
            if (!r.ok) setErr(r.error);
          });
        }}
        code={tk.code}
      />
      {err ? <FieldError>{err}</FieldError> : null}
      <Card>
        <Text accessibilityRole="header" style={[tType.label, { fontSize: 15, color: t.ink }]}>
          What happens next
        </Text>
        {steps.map(([label, done], i) => (
          <View
            key={label}
            style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? t.primary : "transparent",
                borderWidth: done ? 0 : 2,
                borderColor: i === 1 ? t.primary : t.lineStrong,
              }}
            >
              {done ? <Icon name="check" size={14} color={t.onPrimary} strokeWidth={2.4} /> : null}
            </View>
            <Text style={[tType.bodyM, { color: done || i === 1 ? t.ink : t.ink2 }]}>
              {done ? label : `${label} · not yet`}
            </Text>
          </View>
        ))}
      </Card>
      <HonestNote after="Your code works at the desk even with no internet." />
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button
          label="Change day"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/visits/[id]", params: { id: tk.id } })}
        />
        <Button
          label="See my week"
          style={{ flex: 1 }}
          onPress={() => router.dismissTo("/(app)/(tabs)/visits")}
        />
      </View>
    </Screen>
  );
}
