import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Issued tickets, kept on the phone (prompt §8.3, PRD G3): the ticket and its
 * code must render at the desk with no network. Only what the ticket prints
 * is stored; no reason, symptom or note, and no count of people (that is
 * read fresh, never kept).
 */
export interface Ticket {
  /** The intake or appointment id. */
  id: string;
  kind: "queue" | "day";
  hospitalName: string;
  clinic: string;
  see: string;
  room: string;
  patient: string;
  code: string;
  issuedAtIso: string;
  /** Day: the clinic day as `YYYY-MM-DD`, its part and when doors open ("08:00"). */
  dayKey: string | null;
  part: "Morning" | "Afternoon" | null;
  doors: string | null;
  /** Day: true until the clinic confirms. */
  awaiting: boolean;
  /** UGX, or null for no fee. */
  fee: number | null;
  /** The clinic's own fee words when they are a range ("UGX 20,000 – 50,000"); else null. */
  feeLabel: string | null;
  paid: boolean;
  /** Paid through the simulated payments object (`mobilePayments` off). */
  demoPayment: boolean;
}

const KEY = "medsync-tickets-v1";
/** Old tickets are useless at a desk; keep a handful. */
const KEEP = 10;

export async function readTickets(): Promise<Ticket[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Ticket[]) : [];
  } catch {
    return [];
  }
}

/** Newest first; a ticket with the same id replaces the old copy. */
export async function saveTicket(ticket: Ticket): Promise<void> {
  const rest = (await readTickets()).filter((t) => t.id !== ticket.id);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([ticket, ...rest].slice(0, KEEP)));
  } catch {
    // A full store loses the offline copy, never the ticket on screen.
  }
}

export async function dropTicket(id: string): Promise<void> {
  const rest = (await readTickets()).filter((t) => t.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => {});
}
