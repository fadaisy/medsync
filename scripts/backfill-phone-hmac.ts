/* eslint-disable no-console */
/**
 * Backfill `patient_profiles.phone_hmac` (migration 0062, Gate F).
 *
 * Every row written before 0062 has a phone ciphertext and no blind index,
 * so USSD/SMS cannot find "my next visit" for those patients or offer
 * "Booking as {name}". This decrypts each phone with MEDSYNC_PHI_KEY and
 * writes `blindIndex(phone)` — the same function `lib/encryption.ts` and
 * `_shared/encryption.ts` share. Idempotent: rows that already carry a
 * hash are skipped. Owner action: `npm run db:backfill-phone-hmac`.
 *
 * Plaintext never leaves this process and is never printed.
 */
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";

for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.env.DATABASE_URL;
const keyB64 = process.env.MEDSYNC_PHI_KEY;
if (!url || !keyB64) {
  console.error("DATABASE_URL and MEDSYNC_PHI_KEY are required.");
  process.exit(1);
}
const key = Buffer.from(keyB64, "base64");

/** `lib/encryption.ts`'s wire format: iv:tag:ciphertext, base64, AES-256-GCM. */
function decrypt(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("bad ciphertext shape");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]).toString("utf8");
}

/** `blindIndex()`: HMAC-SHA256 keyed by SHA-256("medsync-blind-index" ‖ key), hex. */
function blindIndex(value: string): string {
  const derived = createHash("sha256").update("medsync-blind-index").update(key).digest();
  return createHmac("sha256", derived).update(value).digest("hex");
}

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const rows = (await sql`
    select id, phone_encrypted from public.patient_profiles where phone_hmac is null
  `) as unknown as { id: string; phone_encrypted: string }[];
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const hmac = blindIndex(decrypt(row.phone_encrypted));
      await sql`update public.patient_profiles set phone_hmac = ${hmac} where id = ${row.id}`;
      done += 1;
    } catch {
      failed += 1; // a key or shape problem; the row is left NULL and counted
    }
  }
  console.log(`phone_hmac backfill: ${done} written, ${failed} skipped, ${rows.length} candidates`);
}

main()
  .then(() => sql.end())
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
