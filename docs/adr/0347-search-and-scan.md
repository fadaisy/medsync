# ADR 0347 — Scan or search from anywhere

**Status:** Accepted — 2026-10-19.

## Decision

- **Opening it.** Ctrl K (Cmd K) opens a centred dialog on every lab screen.
- **Matching** (`lib/lab/search.ts`, `lib/lab/search-actions.ts`), under the clinical reader:
  - an exact label or manifest number first;
  - then a hospital number;
  - then a name prefix of at least three letters.
  - Names are encrypted at rest, so a name is matched only among the open worklist's patients.
- **Actions and pages** come from the viewer's visible tabs.
- **Scanning.** A scanned label (the scanner sends Enter) with one live hit opens its specimen at once. Ctrl Enter runs the first action; "Receive {label}" goes to the bench, where the existing scan-to-receive runs.
- **Privacy.** The search term is never logged and never put in a URL.
