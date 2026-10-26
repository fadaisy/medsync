import type { Attachment } from "@/data/attachments";
import type { DayOption, Days, SessionOption, Ticket as TicketData } from "@/data/visits";
import type { NoteSelection } from "@/features/visits/symptom-note-logic";
import type { Door } from "@/features/visits/why-coming";
import type { AppointmentReason } from "@/lib/booking";
import { useEffect, useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import {
  Button,
  Card,
  FieldError,
  Icon,
  IconDisc,
  Note,
  Press,
  Screen,
  TextField,
  Ticket,
} from "@/components/tide";
import { sendAttachments } from "@/data/attachments";
import { loadDays, payments, requestDay, useTickets } from "@/data/visits";
import { AttachmentTools } from "@/features/visits/attachments";
import { BookingCalendar } from "@/features/visits/calendar";
import { dayState, firstOpenDay } from "@/features/visits/calendar-logic";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import {
  clockOf,
  dayKeyOf,
  dayNumberOf,
  feeText,
  longDayOf,
  monthShortOf,
  shortDayOf,
  weekdayOf,
} from "@/features/visits/logic";
import { HonestNote, pickStyle, StepTitle } from "@/features/visits/parts";
import { SymptomNote } from "@/features/visits/symptom-note";
import { bookingSymptoms, EMPTY_NOTE } from "@/features/visits/symptom-note-logic";
import { Countdown, TimeWheel } from "@/features/visits/time-wheel";
import { WhyComing } from "@/features/visits/why-coming";
import { APPOINTMENT_REASONS, newIdempotencyKey } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { useCatalogMode } from "@/lib/symptoms";
import { useNow } from "@/lib/use-now";
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
 * The days sit on a month calendar reaching `PATIENT_BOOKING_HORIZON_DAYS`
 * ahead; a day with no open time cannot be chosen. A clinic day shows morning
 * or afternoon as when doors open, never as your hour (law L8). A named
 * doctor's day shows its open times on a scroll wheel beside a countdown to
 * the chosen one, with the owner's plain words that the doctor may see you
 * later (18 Oct 2026). No count of what is left is ever
 * shown (ADR 0084). Payment is simulated (`payments`). With no hospital chosen the patient
 * chooses one first; nothing is shown in its place.
 */
const REASONS = new Set<string>(APPOINTMENT_REASONS.map((r) => r.value));

export default function BookDayScreen() {
  const t = useTide();
  const router = useRouter();
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
  // What the visit is for: given by Book a visit, else the patient says it here.
  // It used to fall back to "Routine follow-up", which named visits wrongly (owner, 18 Oct 2026).
  const [reason, setReason] = useState<AppointmentReason | null>(
    params.reason && REASONS.has(params.reason) ? (params.reason as AppointmentReason) : null,
  );
  const [door, setDoor] = useState<Door | null>(null);
  const fullName = auth?.user.user_metadata?.full_name;
  const patient =
    params.memberName ??
    (typeof fullName === "string" && fullName.trim() ? fullName : "[First name] [Surname]");

  const [days, setDays] = useState<Days | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(params.day ?? null);
  const [part, setPart] = useState<"Morning" | "Afternoon" | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [whoId, setWhoId] = useState<string | null>(null);
  const [pay, setPay] = useState<"momo" | "later">("momo");
  const [note, setNote] = useState("");
  const [symptoms, setSymptoms] = useState<NoteSelection>(EMPTY_NOTE);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [unsent, setUnsent] = useState(0);
  const catalog = useCatalogMode();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const all = useTickets();
  const now = useNow(60_000);
  const ticket = ticketId ? (all.find((x) => x.id === ticketId) ?? null) : null;

  const { doctor, department, hospital } = params;
  useEffect(() => {
    if (!reason) return;
    let live = true;
    loadDays(
      reason,
      doctor ? { userId: doctor, departmentId: department, hospitalId: hospital } : null,
    ).then(
      (d) => {
        if (live) setDays(d);
      },
      (e: unknown) => {
        // The reason, for whoever is running the app in development; the patient sees plain words.
        if (__DEV__) console.warn("[book/day] loading open days failed:", e);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [reason, doctor, department, hospital, attempt]);

  if (ticket) return <Sent ticket={ticket} unsent={unsent} />;

  // The reason sets the fee and which clinic days take the visit, so it comes first.
  // Book a visit already asked it (its reason rides in the params): then this goes straight on.
  const asked = !!params.reason;
  const pickReason = (r: AppointmentReason) => {
    if (r === reason) return;
    setReason(r);
    setDays(null);
    setFailed(false);
    setSlotId(null);
    setPart(null);
    setWhoId(null);
    setKey(null);
  };
  const reasonPicker = asked ? null : (
    <WhyComing
      door={door ?? (reason ? "planned" : null)}
      onDoor={setDoor}
      reason={reason}
      onReason={pickReason}
      // The checker comes back here with the reason, and the doctor, it was opened with.
      onSymptoms={(area) =>
        router.push({
          pathname: "/symptoms",
          params: {
            ...(area ? { area } : {}),
            ...(doctor ? { doctor } : {}),
            ...(department ? { department } : {}),
            ...(hospital ? { hospital } : {}),
          },
        })
      }
    />
  );
  const helpInPage = door === "wrong";
  if (!reason) {
    return (
      <Screen
        back={{ label: "Book a visit" }}
        title="Ask for a day"
        help={helpInPage ? "none" : "round"}
        helpSource="book-day"
      >
        {reasonPicker}
      </Screen>
    );
  }

  if (!days) {
    return (
      <Screen back={{ label: "Book a visit" }} title="Ask for a day" helpSource="book-day">
        {failed ? (
          <View style={{ gap: tSpace[4] }}>
            <View style={{ alignItems: "center", gap: tSpace[3], paddingVertical: tSpace[6] }}>
              <IconDisc name="calendar" size={56} color={t.area.visits} bg={t.surface2} />
              <Text
                accessibilityRole="header"
                style={[tType.heading, { color: t.ink, textAlign: "center" }]}
              >
                {"We couldn't load the open days"}
              </Text>
              <Text style={[tType.bodyM, { color: t.ink2, textAlign: "center" }]}>
                Your phone may be offline, or the clinic list is busy. Nothing was booked.
              </Text>
            </View>
            <Button
              label="Try again"
              onPress={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            />
            <Button
              label="Back to doctors"
              variant="outline"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            />
          </View>
        ) : (
          <View style={{ gap: tSpace[4] }}>
            {reasonPicker}
            <ActivityIndicator color={t.ink} accessibilityLabel="Loading the clinic days" />
          </View>
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

  const today = dayKeyOf(now);
  const takeable = (d: DayOption) => d.sessions.some((s) => s.placesLeft > 0);
  const openKeys = new Set(days.days.filter(takeable).map((d) => d.key));
  const first = firstOpenDay(today, openKeys);
  const dayKey = picked && dayState(picked, today, openKeys) === "open" ? picked : first;
  const day = days.days.find((d) => d.key === dayKey) ?? null;
  const doctorName = days.doctorName;
  const clinicName =
    day?.sessions[0]?.clinicName ?? days.days[0]?.sessions[0]?.clinicName ?? "The clinic";

  // A named doctor: every open time of the day, and the patient picks one.
  const slots = doctorName ? (day?.sessions ?? []).filter((s) => s.slot) : [];
  // The wheel always has a time in its band, so the first open time stands until another is chosen.
  const slotSession = slots.find((s) => s.id === slotId) ?? slots[0] ?? null;

  // A clinic day: morning or afternoon, and who to see.
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
  const inChosen = chosenPart ? inPart(chosenPart).filter((s) => s.placesLeft > 0) : [];
  // "Any doctor" takes the cheapest open place; a named doctor is their own session.
  const anySession = [...inChosen].sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0))[0] ?? null;
  const named = inChosen.filter((s) => s.clinicianName !== "Clinic team");
  const whoSel = whoId === "any" ? null : whoId;
  const session: SessionOption | null = doctorName
    ? slotSession
    : (whoSel && inChosen.find((s) => s.id === whoSel)) || anySession;
  const whoOptions = doctorName
    ? []
    : [
        { key: "any", name: "Any doctor", fee: anySession?.fee ?? null },
        ...named.map((s) => ({ key: s.id, name: s.clinicianName, fee: s.fee })),
      ];
  const fee = session?.fee ?? null;
  const when = slotSession?.slot
    ? clockOf(slotSession.slot.startsAtIso)
    : (chosenPart ?? "").toLowerCase();
  const dayWords = day ? `${weekdayOf(day.key)} ${dayNumberOf(day.key)} ${when}` : "";
  const send = !session
    ? doctorName
      ? "Choose a time"
      : "Choose a day"
    : fee && pay === "momo"
      ? `Pay ${feeText(fee)} · ${dayWords}`
      : `Ask for ${dayWords}`;

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
      symptoms: bookingSymptoms(symptoms, CATALOG),
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // The request stands whatever happens to the files; the ticket says if any did not go.
    const sent = await sendAttachments(res.ticket.id, attachments);
    setBusy(false);
    setUnsent(sent.failed);
    setKey(null);
    setTicketId(res.ticket.id);
  };

  const header = {
    back: { label: "Book a visit" },
    overline: doctorName ? `${days.hospitalName} · ${clinicName}` : days.hospitalName,
    overlineColor: t.area.visits,
    title: doctorName ? `Ask ${doctorName} for a day` : "Ask for a day",
    helpSource: "book-day",
  } as const;

  if (!first) {
    return (
      <Screen {...header}>
        <Card>
          <View style={{ alignItems: "center", gap: tSpace[3], paddingVertical: tSpace[4] }}>
            <IconDisc name="calendar" size={56} color={t.area.visits} bg={t.surface2} />
            <Text
              accessibilityRole="header"
              style={[tType.heading, { color: t.ink, textAlign: "center" }]}
            >
              No open days in the next two months
            </Text>
            <Text style={[tType.bodyM, { color: t.ink2, textAlign: "center" }]}>
              {doctorName
                ? `${doctorName} has no open time on MedSync yet. Try another doctor, or come back later.`
                : "No clinic day for this kind of visit is open on MedSync yet. Come back later."}
            </Text>
          </View>
        </Card>
        <Button
          label={doctorName ? "Back to doctors" : "Back to Book a visit"}
          variant="outline"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </Screen>
    );
  }

  return (
    <Screen {...header}>
      {reasonPicker}

      <BookingCalendar
        today={today}
        open={openKeys}
        selected={day?.key ?? null}
        onSelect={(k) => {
          setPicked(k);
          setSlotId(null);
          setPart(null);
          setWhoId(null);
          reset();
        }}
      />

      {day && doctorName ? (
        <View style={{ gap: tSpace[3] }}>
          <StepTitle>{`Choose a time on ${longDayOf(day.key)}`}</StepTitle>
          {slotSession?.slot ? (
            <Card padding={tSpace[3]} style={{ flexDirection: "row", gap: tSpace[3] }}>
              <Countdown
                iso={slotSession.slot.startsAtIso}
                whenLine={`${shortDayOf(day.key)} at ${clockOf(slotSession.slot.startsAtIso)}`}
              />
              <TimeWheel
                key={day.key}
                label={`Times on ${longDayOf(day.key)}`}
                times={slots.map((s) => (s.slot ? clockOf(s.slot.startsAtIso) : ""))}
                index={slots.indexOf(slotSession)}
                onChange={(k) => {
                  setSlotId(slots[k]?.id ?? null);
                  reset();
                }}
              />
            </Card>
          ) : null}
          {slotSession ? (
            <Note tone="plain" icon="clock">
              Please arrive a little early. The doctor may see you later than this time.
            </Note>
          ) : null}
        </View>
      ) : null}

      {day && !doctorName ? (
        <View style={{ gap: tSpace[2] }}>
          <StepTitle>Morning or afternoon?</StepTitle>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            {(["Morning", "Afternoon"] as const).map((p) => {
              const ss = inPart(p);
              const ok = partOpen(p);
              const doors = ss[0]?.doors;
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
                      ? `${p}, ${doors ? `doors open ${doors}` : "open"}`
                      : `${p}, ${ss.length ? "full" : "no clinic"}`
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
                        ? doors
                          ? `Doors ${doors}`
                          : "Open"
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
        </View>
      ) : null}

      {catalog && catalog !== "off" ? (
        <SymptomNote
          mode={catalog}
          // ponytail: the adult list, also when booking for a household member; ask who it is for if children book here.
          audience="adult"
          value={symptoms}
          onChange={(v) => {
            setSymptoms(v);
            reset();
          }}
        />
      ) : null}
      <View style={{ gap: tSpace[2] }}>
        <TextField
          label={catalog && catalog !== "off" ? undefined : "Anything the doctor should know?"}
          optional={!catalog || catalog === "off"}
          accessibilityLabel="Anything else, in your own words"
          value={note}
          onChangeText={(v) => {
            setNote(v);
            reset();
          }}
          placeholder="Anything else, in your own words"
          maxLength={500}
          multiline
        />
        <AttachmentTools
          value={attachments}
          onAdd={(list) => setAttachments((a) => [...a, ...list])}
          onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))}
          onText={(words) => {
            setNote((n) => (n.trim() ? `${n.trimEnd()} ${words}` : words).slice(0, 500));
            reset();
          }}
        />
      </View>

      {session && fee ? (
        <View style={{ gap: tSpace[2] }}>
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
function Sent({ ticket: tk, unsent }: { ticket: TicketData; unsent: number }) {
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
          // A doctor's slot has the time the patient chose (ADR 0403); a clinic day promises none.
          { label: "Time", value: tk.time ? `${tk.time} · arrive a little early` : "Not promised" },
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
      {unsent ? (
        <Note tone="plain" icon="info">
          {`${unsent === 1 ? "One file" : `${unsent} files`} you added did not send. Your request is made; show ${unsent === 1 ? "it" : "them"} at the desk.`}
        </Note>
      ) : null}
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
