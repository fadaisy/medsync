import { hhmm } from "@/data/medicines";
import { createStore, useStore } from "@/data/store";
import { enqueue } from "@/offline/outbox";

/**
 * The care-team chat. Demo data: the thread is the board's (TChat), shown only
 * when `mobileChat` is on (ADR 0342 §4). There is no messaging engine yet, so a sent message goes
 * into this store as "Waiting to send" and into the outbox on the phone, and
 * nowhere else.
 */
export type Role = "doctor" | "nurse" | "pharmacist" | "dietitian";

export const ROLES: { key: Role; initials: string; label: string }[] = [
  { key: "doctor", initials: "DR", label: "Doctor" },
  { key: "nurse", initials: "NS", label: "Nurse" },
  { key: "pharmacist", initials: "PH", label: "Pharmacist" },
  { key: "dietitian", initials: "DT", label: "Dietitian" },
];
export const ROLE_WORDS: Record<Role, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  pharmacist: "Pharmacist",
  dietitian: "Dietitian",
};

export type MessageBody =
  | { kind: "text"; text: string }
  /** The doctor's "Lab results ready" card; its rows come from the labs repository. */
  | { kind: "labs"; text: string; replies: string[] }
  | { kind: "reading"; top: number; bottom: number; at: string }
  /** Static: there is no voice playback (PRD non-goal). */
  | { kind: "voice"; length: string; seconds: number };

export interface ChatMessage {
  id: string;
  from: Role | "me";
  day: "Wed 14 Oct" | "Today";
  time: string;
  body: MessageBody;
  /** A button under the bubble that opens a screen. */
  action?: { label: string; href: "/care/medicines" };
  status?: "seen" | "waiting";
}

const THREAD: ChatMessage[] = [
  {
    id: "t1",
    from: "doctor",
    day: "Wed 14 Oct",
    time: "16:20",
    body: {
      kind: "labs",
      text: "We ordered your tests. We will talk about them on Friday.",
      replies: ["What should I change?", "Okay, Friday"],
    },
  },
  {
    id: "t2",
    from: "nurse",
    day: "Today",
    time: "09:15",
    body: {
      kind: "text",
      text: "Your morning reading was a little high. How are you feeling today?",
    },
  },
  {
    id: "t3",
    from: "me",
    day: "Today",
    time: "09:19",
    body: { kind: "reading", top: 138, bottom: 86, at: "07:40" },
  },
  {
    id: "t4",
    from: "me",
    day: "Today",
    time: "09:20",
    status: "seen",
    body: { kind: "text", text: "I feel okay. I had a small headache yesterday." },
  },
  {
    id: "t5",
    from: "doctor",
    day: "Today",
    time: "10:02",
    body: {
      kind: "text",
      text: "Thank you. Keep taking your medicines as prescribed and log one more reading this evening. We will look at it together on Friday.",
    },
  },
  {
    id: "t6",
    from: "me",
    day: "Today",
    time: "10:05",
    body: { kind: "voice", length: "0:12", seconds: 12 },
  },
  {
    id: "t7",
    from: "pharmacist",
    day: "Today",
    time: "11:30",
    body: {
      kind: "text",
      text: "Your refill is ready from Thursday. You can collect it or have it delivered.",
    },
    action: { label: "Order my refill", href: "/care/medicines" },
  },
];

export const QUICK_REPLIES = ["I am okay", "I have a question", "Share my readings"];

const store = createStore<ChatMessage[]>(THREAD);

export const chatRepo = {
  /** Always: there is no messaging engine; the thread only shows when `mobileChat` is on. */
  demo: true,
  list: (): ChatMessage[] => store.get(),

  /** Adds the message as "Waiting to send" and queues it on the phone. Returns the outbox write. */
  send(text: string, at: Date) {
    const body = text.trim();
    if (!body) return null;
    const id = `me-${at.getTime()}-${store.get().length}`;
    store.set((list) => [
      ...list,
      {
        id,
        from: "me",
        day: "Today",
        time: hhmm(at),
        status: "waiting",
        body: { kind: "text", text: body },
      },
    ]);
    return enqueue("message", { id, text: body, at: at.toISOString() });
  },
};

export function useChat(): ChatMessage[] {
  return useStore(store);
}

/** The team's first message today, for the Care hub's card (the TCare board shows the nurse's). */
export function useChatPreview(): { from: string; time: string; text: string } {
  const list = useStore(store);
  const first = list.find((m) => m.day === "Today" && m.from !== "me" && m.body.kind === "text");
  if (!first || first.from === "me" || first.body.kind !== "text")
    return { from: "", time: "", text: "" };
  return { from: ROLE_WORDS[first.from], time: first.time, text: first.body.text };
}
