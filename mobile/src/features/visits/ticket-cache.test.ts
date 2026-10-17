import type { Ticket } from "@/features/visits/ticket-cache";

import { dropTicket, readTickets, saveTicket } from "@/features/visits/ticket-cache";

const ticket = (id: string): Ticket => ({
  id,
  kind: "queue",
  hospitalName: "[Hospital name]",
  clinic: "Diabetes clinic",
  see: "Any doctor",
  room: "Room 4",
  patient: "[First name]",
  code: "KWP-4827",
  issuedAtIso: "2026-10-17T10:04:00Z",
  dayKey: null,
  part: null,
  doors: null,
  awaiting: false,
  fee: null,
  feeLabel: null,
  paid: false,
  demoPayment: false,
});

describe("offline ticket cache", () => {
  it("round-trips a ticket exactly, newest first, replacing by id", async () => {
    await saveTicket(ticket("a"));
    await saveTicket(ticket("b"));
    await saveTicket({ ...ticket("a"), paid: true });
    const all = await readTickets();
    expect(all.map((t) => t.id)).toEqual(["a", "b"]);
    expect(all[0]).toEqual({ ...ticket("a"), paid: true });
    await dropTicket("a");
    expect((await readTickets()).map((t) => t.id)).toEqual(["b"]);
  });
});
