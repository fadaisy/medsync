# ADR-0008: PHI encryption — AES-256-GCM, `iv:authTag:ciphertext` format

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.7
- **Deciders:** Usama Fadhul

## Context

The kickoff mandates app-level PHI encryption on top of Supabase's at-rest disk encryption — for fields where the highest sensitivity (NIN, patient full names _as stored in clinical tables_, free-text notes, free-text lab results) warrants belt-and-braces.

Two upstream constraints shape the design:

1. **No `pgsodium` / Transparent Column Encryption.** Supabase pending-deprecated both for new projects. We need a path that lives in the application layer, not the database.
2. **`MEDSYNC_PHI_KEY` is the single most sensitive secret in the system.** Loss or leak compromises every encrypted field. Rotation must be possible without rebuilding the schema.

Phase 0.7 lands the library + tests. The library has no callers yet — encrypted columns appear in Phase 1+ clinical tables. Shipping it now (with the lib unused) is intentional: it forces us to nail the wire format and key handling before we have data we'd hate to migrate.

## Decisions

### 1. Algorithm: AES-256-GCM

- **AES-256** — standard, FIPS-approved, hardware-accelerated on every server we'll ever run on.
- **GCM mode** — authenticated encryption (AEAD). The 16-byte auth tag detects any tampering with the IV, the ciphertext, or both. Without auth, a flipped bit in storage silently corrupts data and the app doesn't notice. With GCM, decrypt throws.
- 12-byte (96-bit) IV — the GCM-standard length. Random per encryption (`node:crypto.randomBytes(12)`). Reusing an IV under the same key is catastrophic for GCM (key recovery becomes possible), so a fresh IV per call is non-negotiable.

### 2. Wire format: `iv:authTag:ciphertext` (3 base64 segments, colon-separated)

Stored as a single `text` column in Postgres. Decoding splits on `:` and base64-decodes each segment. Chosen over JSON / Buffer concat / pgsodium-style binary because:

- Three separate fixed-purpose segments are unambiguous.
- Base64 is portable across the wire and survives copy-paste / log emission without re-encoding.
- Single `text` column means no Drizzle/Postgres schema work beyond what we already have. Easy to inspect a row in psql.

### 3. Key handling

- Key lives in `MEDSYNC_PHI_KEY` env var — base64 that must decode to exactly 32 bytes. Read on every call (cheap; `process.env` access is constant time).
- `generateKey()` exported as the canonical way to mint a new key (`node -e "import('./lib/encryption.js').then(m => console.log(m.generateKey()))"` for a one-liner).
- **Never** committed. Lives in `.env.local` for dev, Vercel env for runtime, Supabase Functions secrets for Edge Functions. `.env.example` shows the variable name with an empty value.
- `lib/encryption.ts` imports `"server-only"` — a client component importing it fails Next's build. We alias `server-only` to a no-op in `vitest.config.ts` for unit tests.

### 4. Library API (`lib/encryption.ts`)

```ts
encrypt(plaintext: string): string                 // iv:authTag:ciphertext
decrypt(payload: string): string                   // throws on any error
generateKey(): string                              // base64, 32 bytes
ciphertextsEqual(a: string, b: string): boolean    // timing-safe compare
```

Errors are explicit and helpful:

- Missing `MEDSYNC_PHI_KEY` → "MEDSYNC_PHI_KEY is not set. Generate one with …"
- Wrong key length → "MEDSYNC_PHI_KEY must decode to exactly 32 bytes"
- Malformed payload (segment count / segment length) → specific message
- Tamper (GCM auth-tag failure) → `final()` throws; we let it propagate

The errors describe what went wrong without echoing the key or any plaintext.

### 5. Trade-offs encoded in the API

- **Encrypted columns are NOT queryable or indexable by content.** Same plaintext encrypts to different ciphertext each call (random IV), so `WHERE column = encrypt(query)` always misses. Operational fields (email lookups, MRN search) stay plaintext; only the highest-sensitivity stored values get encrypted. Documented in `DESIGN-medsync.md` and in `lib/encryption.ts`'s header.
- **No deterministic-encryption variant.** We don't want to encourage queryable encryption (that mode leaks frequency / equality info to anyone with read access to the column). If a column needs lookup, it stays plaintext.

### 6. Key rotation — documented procedure, NOT automated in 0.7

A new `MEDSYNC_PHI_KEY` invalidates every existing ciphertext. Phase 0.7 does not implement rotation; the procedure when we need it:

1. Generate new key. Keep old key.
2. Set `MEDSYNC_PHI_KEY_NEW` env var alongside the old one.
3. Run a one-off migration script (lives in `scripts/` when written) that:
   - SELECTs each encrypted column.
   - Decrypts with `MEDSYNC_PHI_KEY` (old).
   - Re-encrypts with `MEDSYNC_PHI_KEY_NEW`.
   - UPDATEs the row.
4. Swap envs: `MEDSYNC_PHI_KEY` ← new, drop the `_NEW`.
5. Discard old key.

This is straightforward because each encrypted value is independent. The cost is a write per row. Adding a `keyId` prefix to the wire format (e.g. `v2:iv:authTag:ciphertext`) would let us run with both keys simultaneously during the migration; deferred until rotation is actually needed (YAGNI risk: we may never rotate in Phase 0/1; if we do, add the prefix at that point as a format v2).

### 7. Tests (`tests/encryption/encryption.test.ts`)

16 tests covering:

- Round-trip for ASCII, empty string, and UTF-8 (`°` `₂` `ü`).
- Wire format is 3 base64 segments.
- Same plaintext → different ciphertext (IV uniqueness).
- Tamper detection per segment (IV, auth tag, ciphertext).
- Wrong-key decrypt throws.
- Malformed payload throws (missing segments, wrong IV length, wrong auth tag length).
- Missing `MEDSYNC_PHI_KEY` → helpful error from both `encrypt` and `decrypt`.
- Wrong key length → helpful error.
- `generateKey()` produces a 32-byte base64 key.

All 16 pass. Total suite: 58/58 across 8 files.

## Consequences

**Positive**

- A single small, audited library is the only place plaintext-to-ciphertext conversion happens. Reviewer can read it in two screens; auditor can verify the chosen primitives are sound.
- Tamper detection is real and tested. A flipped bit in Supabase's backup tapes (or in any future migration) becomes a decrypt error, not silent corruption.
- The wire format is forward-compatible. If we later add `keyId` for rotation we can prefix `v2:` and check the prefix on decrypt; old `v1` rows continue to decrypt.

**Negative / trade-offs**

- **No content-queryable encryption.** Encrypted columns can be SELECTed in full and decrypted client-side, or filtered by other (plaintext) columns, but never `WHERE encryptedCol = ?`. Operational decisions defer encryption until they really need it.
- **Key rotation is a future migration.** Documented; not automated. If MEDSYNC_PHI_KEY leaks, rotation requires a maintenance window for the re-encrypt pass.
- **No hardware-backed key storage.** Vercel env / Supabase secrets store the key as a string. For the highest-risk deployments (post-Pro upgrade) we may want a KMS — deferred to Phase 5+ when we have real patient data.
- **`server-only` is stubbed in tests.** A test file _could_ import `lib/encryption.ts` and never trigger the build-time guard. Acceptable because the guard is production-build enforcement; tests aren't shipped.

## Alternatives considered

- **Supabase `pgsodium` / Transparent Column Encryption.** Rejected — Supabase has deprecated both for new projects.
- **AES-256-CBC + HMAC.** Rejected — GCM is simpler (one algorithm, one auth tag) and the standard for new AEAD designs. CBC+HMAC has more failure modes (padding oracle attacks if HMAC is checked after decryption).
- **XChaCha20-Poly1305.** Rejected only because `node:crypto` doesn't expose it natively; would require a userland library. AES-256-GCM is hardware-accelerated and FIPS-approved; XChaCha20 doesn't buy us anything here.
- **Deterministic encryption (AES-SIV) for queryable columns.** Rejected — defers complexity without solving the underlying problem. Plaintext operational columns + encrypted sensitive columns is the right separation.
- **Per-record key (envelope encryption).** Rejected for Phase 0 — overkill. Single master key with documented rotation procedure is the right scope.
- **`keyId` prefix on the wire format now.** Deferred — YAGNI until first rotation. Easy to add as a `v2:` prefix later without breaking `v1:` (= no-prefix) rows.

## Follow-ups

- Phase 1+: introduce the first encrypted column (likely `users.full_name` or `patients.nin` in a Phase 1 clinical table). At that point: add a Drizzle column type helper that auto-encrypts on write / auto-decrypts on read, with `as` casts so the column type is `string` to consumers.
- When key rotation becomes necessary: implement the migration script described in §6, add a `v2:` prefix to the wire format, document the cut-over in CHANGELOG.
- Phase 5+ (real patient data): evaluate moving the master key to a KMS (AWS KMS, GCP KMS, or Vercel's eventual offering).
- Add a CI check that `lib/encryption.ts` is never imported from a `"use client"` file (defence in depth on top of `server-only`).
