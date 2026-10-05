# ADR 0210 — One command path for capture, an encrypted outbox, and a small offline cache

**Status:** Proposed — 2026-10-05. NCDSync build (§9, B5).

## Decision

1. Every capture write is a command `{id (client UUID), type, payload, clientTs}` validated with Zod and applied once by
   `applyCommand`. Replaying an id is a no-op that returns the original result. The command, its handler and its log row
   share one transaction under `medsync_ncd_app`.
2. The entry time is a server value carried in the context. Only the demo loader and tests may supply it; the client
   timestamp is stored apart and never becomes the entry time.
3. The client outbox lives in IndexedDB, encrypted with a non-extractable AES-GCM device key. Commands are sent in order
   per patient, with back-off. A permanent refusal (including a command for a removed demo patient) is discarded with a
   visible note. Death, transfer, merge and approvals are online-only.
4. The offline read cache holds today's clinic, the patients scheduled or opened today with their trajectories, and the
   overdue list as last fetched. It is replaced whole at every refresh and purged on sign-out once the outbox is empty.
5. A service worker scoped to `/ncd` caches only a static shell and hashed build assets (D-24, extending ADR 0088).

## Consequences

- Two same-day visits for one patient are both kept and the pair goes to the query list; clinical records are
  append-and-version, so no data is lost silently.
- Browser-level offline tests are not run (no browser runner); the outbox, idempotency, ordering and purge are tested on a
  fake IndexedDB and on the PGlite lane.
