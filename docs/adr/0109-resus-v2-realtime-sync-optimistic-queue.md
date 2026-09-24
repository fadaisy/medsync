# ADR 0109 — Resus Desk v2: realtime sync, optimistic queue and a server-anchored clock

**Status:** Accepted — 2026-09-24 (E1, E2, E3 at GATE A)
**Context:** v1 refreshed the whole route after every tap (`router.refresh`), so each entry waited on a round trip,
two devices at one bedside drifted apart, a dropped network lost taps silently, and times came from each device's
own clock. An arrest is recorded by several people on several devices in a room with poor connectivity.

## Decision

1. **Idempotent writes.** Every v2 write carries a `clientEventId` (uuid, unique per episode) and the bedside
   `recordedAt`; one Drizzle transaction locks the episode, re-reads the timeline, inserts the event(s), derives the
   header from the timeline (`phase`, arrest sequence, first-arrest time — never from what the action intended) and
   writes the audit row. A retry whose event already landed returns the stored result and writes nothing else;
   actions may pass the row count their checks used, and a moved record is refused so the queue retries on a fresh
   read. A bedside time more than 60 s in the future or before the resus started is refused; one that differs from
   receipt by more than 60 s is marked `lateEntry`. Concluded or cancelled episodes answer read-only.
2. **Optimistic queue** (`useDesk`): the desk shows an entry at once as _pending_, sends in order, retries with
   backoff (cap 10 s) while online, pauses offline, and flushes on reconnect; a `beforeunload` guard warns while
   anything is pending; an amber "Offline — N entries waiting" chip shows the backlog. The queue is in memory (E1)
   — no IndexedDB of clinical data on shared devices.
3. **Server-anchored clock:** server time is fetched on load and every 5 min (offset from the round-trip midpoint);
   `recordedAt = Date.now() + offset`; an amber warning shows when the device is off by > 30 s. Only leaf clock
   components re-render each second.
4. **Realtime by Broadcast from the database (E2):** an AFTER INSERT trigger on the timeline sends
   `{eventId, kind, recordedAt}` to the private topic `resus:<episodeId>`; episode state/phase changes go to
   `resus-board:<hospitalId>`. RLS on `realtime.messages` limits each topic to active clinical staff of that hospital.
   Payloads carry no PHI — clients fetch the delta through a scoped server action. If the channel cannot
   subscribe, the desk polls every 10 s. Broadcast calls are guarded so a missing `realtime` schema never breaks a
   write.
5. **Corrections are events** (a superseding note; "undone" for undo) — the timeline stays append-only.

## Consequences

**Positive:** taps land instantly; every device converges on the same record; nothing is lost on a flaky network;
times are consistent across devices. **Negative:** a queue in memory is lost if the tab is closed while offline (the
unload guard warns); broadcast from the database needs the Supabase `realtime.send` function, which the owner's
project must have.

## Related

`lib/resus/v2-record.ts`, `app/nurse/resus/[episodeId]/_components/v2/use-desk.ts`,
`supabase/migrations/0068_resus_desk_v2.sql`, `tests/rls/resus-v2-*.test.ts`, ADR 0102.
