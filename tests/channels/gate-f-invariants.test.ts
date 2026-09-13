import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normaliseCode, parseKeyword } from "@/lib/channels/sms-keywords";
import { composeSmsReply } from "@/lib/notifications/dispatches";

/**
 * Gate F (ADR 0091) — the keyword parser, and the invariants a reviewer
 * would otherwise grep for by hand. Source-level where the rule is about
 * WHO may call WHAT, and WHERE a phone is allowed to appear.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SQL = read("supabase/migrations/0062_ussd.sql");

describe("SMS keywords (pure)", () => {
  it("YES / CONFIRM / OK + code → confirm; CANCEL / NO + code → cancel; case and spacing forgiven", () => {
    expect(parseKeyword("YES K7M2XQ")).toEqual({ keyword: "confirm", code: "K7M2XQ" });
    expect(parseKeyword("  confirm   k7m2xq ")).toEqual({ keyword: "confirm", code: "K7M2XQ" });
    expect(parseKeyword("ok k7m-2xq")).toEqual({ keyword: "confirm", code: "K7M2XQ" });
    expect(parseKeyword("CANCEL K7M2XQ")).toEqual({ keyword: "cancel", code: "K7M2XQ" });
    expect(parseKeyword("no K7M2XQ")).toEqual({ keyword: "cancel", code: "K7M2XQ" });
  });

  it("STOP and its cousins → stop; HELP → help; a verb with no or a bad code → help; else unknown", () => {
    for (const w of ["STOP", "stop", "STOPALL", "Unsubscribe", "END"]) {
      expect(parseKeyword(w)).toEqual({ keyword: "stop" });
    }
    expect(parseKeyword("help")).toEqual({ keyword: "help" });
    expect(parseKeyword("YES")).toEqual({ keyword: "help" });
    expect(parseKeyword("YES K7M2")).toEqual({ keyword: "help" });
    // No look-alike guessing: 0/O/1/I are not in the alphabet.
    expect(parseKeyword("YES K7M2X0")).toEqual({ keyword: "help" });
    // A shared-shortcode keyword left in front by the operator is tolerated — one word only.
    expect(parseKeyword("MEDSYNC YES K7M2XQ")).toEqual({ keyword: "confirm", code: "K7M2XQ" });
    expect(parseKeyword("MEDSYNC STOP")).toEqual({ keyword: "stop" });
    expect(parseKeyword("please medsync yes K7M2XQ")).toEqual({ keyword: "unknown" });
    expect(parseKeyword("hello there")).toEqual({ keyword: "unknown" });
    expect(parseKeyword("")).toEqual({ keyword: "unknown" });
  });

  it("normaliseCode upper-cases and strips spaces and dashes, nothing more", () => {
    expect(normaliseCode(" k7m-2 xq")).toBe("K7M2XQ");
    expect(normaliseCode("k7m2x0")).toBe("K7M2X0");
  });

  it("every reply is one GSM-7 part and says the code back; STOP is answered once with the honest line", () => {
    for (const key of [
      "confirmed",
      "cancelled",
      "not_confirmable",
      "not_cancellable",
      "unknown_code",
      "help",
      "stopped",
      "too_many",
    ]) {
      const text = composeSmsReply(key, "K7M2XQ");
      expect(text.length, key).toBeLessThanOrEqual(160);
      expect(text, key).toMatch(/^[\x20-\x7E]+$/);
      expect(text, key).toMatch(/^MedSync: /);
    }
    expect(composeSmsReply("confirmed", "k7m2xq")).toContain("Code K7M2XQ");
    expect(composeSmsReply("stopped", null)).toContain("SMS is off for this number");
    expect(composeSmsReply("nonsense", null)).toBe(composeSmsReply("help", null));
  });
});

describe("the system-* functions: service role only, never a user JWT", () => {
  for (const name of ["system-ussd-book", "system-ussd-act"]) {
    it(`${name} refuses anything but the service-role Bearer and never calls getCaller`, () => {
      const src = fnSrc(name);
      expect(src).toContain("if (!isServiceRoleCall(request)) return unauthorized(init");
      expect(src).not.toContain("getCaller(");
      expect(src).not.toContain("hasRole(");
      expect(src).toContain("const actorId = systemActorId();");
      expect(src).toContain("if (!actorId) return serverError(");
    });
  }

  it("isServiceRoleCall: the injected key byte-for-byte, or a gateway-verified JWT whose role is service_role — nothing else", () => {
    const src = read("supabase/functions/_shared/system-actor.ts");
    expect(src).toContain('if (!header.startsWith("Bearer ")) return false;');
    expect(src).toContain("if (key.length > 0 && bearer === key) return true;");
    expect(src).toContain('return jwtRole(bearer) === "service_role";');
    // The claim is trusted only because the gateway verified the signature:
    // no deploy instruction anywhere may turn that off.
    for (const doc of ["docs/ops-channels.md", "docs/booking-app-handoff.md", "CHANGELOG.md"]) {
      // Mentioning the flag as a warning is fine; a deploy command carrying it is not.
      expect(read(doc), doc).not.toMatch(/functions deploy[^\n]*--no-verify-jwt/);
    }
    expect(src).toMatch(/never pass --no-verify-jwt/);
    // system-propose-urgent-appointment shares the check and fails closed on a missing actor.
    const urgent = fnSrc("system-propose-urgent-appointment");
    expect(urgent).toContain("isServiceRoleCall(request)");
    expect(urgent).not.toContain("00000000-0000-0000-0000-000000000000");
  });

  it("system-ussd-book books THROUGH THE CORE with origin/channel ussd and never links a phone to an account", () => {
    const src = fnSrc("system-ussd-book");
    expect(src).toMatch(/import \{[^}]*bookAppointment[^}]*\} from "\.\.\/_shared\/book\.ts"/);
    expect(src).toContain('origin: "ussd"');
    expect(src).toContain('channel: "ussd"');
    expect(src).toContain("patient: { provisionalId }");
    expect(src).not.toContain("patient_user_id");
    expect(src).not.toContain("reconciled_patient_user_id");
    // Carrier-verified: the phone is stamped verified, and reused within expiry.
    expect(src).toContain("phone_verified_at: new Date().toISOString()");
    expect(src).toMatch(/\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  });

  it("system-ussd-act acts only on a visit that BELONGS to the phone (provisional or account blind index)", () => {
    const src = fnSrc("system-ussd-act");
    expect(src).toContain("provHmac !== phoneHmac && profileHmac !== phoneHmac");
    expect(src).toMatch(/return notFound\(init, "No visit with that code for this phone\."\)/);
    // STOP: opt-out by phone, consent revoked for account holders, audited.
    expect(src).toContain('.from("sms_opt_outs")');
    expect(src).toContain('action: "sms_stop"');
    expect(src).toMatch(/\.eq\("consent_type", "sms_communication"\)\s*\.is\("revoked_at", null\)/);
    // The cancel path is cancel-appointment's: release + reap + waitlist.
    expect(src).toContain('rpc("release_session_position"');
    expect(src).toContain("await releaseCapacity(sb, appt.id, log, requestId)");
  });

  it("the Next side calls them with the SERVICE ROLE key only from server env, and only these two", () => {
    const src = read("lib/channels/system-call.ts");
    expect(src).toContain('import "server-only";');
    expect(src).toContain("authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`");
    for (const route of [
      "app/api/ussd/[secret]/route.ts",
      "app/api/sms/inbound/[secret]/route.ts",
    ]) {
      const calls = [...read(route).matchAll(/callSystem[^(]*\(\s*"([a-z-]+)"/g)].map((m) => m[1]);
      expect(calls.length, route).toBeGreaterThan(0);
      for (const c of calls) expect(["system-ussd-book", "system-ussd-act"], route).toContain(c);
    }
  });
});

describe("the webhooks: secret path + IP allowlist, idempotent, no phone in a log", () => {
  const routes = {
    ussd: read("app/api/ussd/[secret]/route.ts"),
    inbound: read("app/api/sms/inbound/[secret]/route.ts"),
    dlr: read("app/api/sms/dlr/[secret]/route.ts"),
  };

  it("all three AT webhooks answer 404 unless webhookAuthorised (constant-time secret + optional IPs)", () => {
    expect(routes.ussd).toContain("webhookAuthorised(request, secret, env.USSD_WEBHOOK_SECRET)");
    expect(routes.inbound).toContain("webhookAuthorised(request, secret, env.SMS_WEBHOOK_SECRET)");
    expect(routes.dlr).toContain("webhookAuthorised(request, secret, env.SMS_WEBHOOK_SECRET)");
    const auth = read("lib/channels/webhook-auth.ts");
    expect(auth).toContain("timingSafeEqual(a, b)");
    expect(auth).toContain("if (list.length === 0) return true;");
    expect(auth).toMatch(/x-forwarded-for[\s\S]*?split\(","\)\[0\]/);
  });

  it("USSD: a replayed callback (same sessionId + text) returns the stored reply and applies nothing", () => {
    expect(routes.ussd).toMatch(
      /row\.lastInput === text && row\.lastReply[\s\S]*?return plain\(row\.lastReply/,
    );
    expect(routes.ussd).toContain("idempotency_key: `ussd:${sessionId}`");
  });

  it("inbound SMS: AT's id is the lock — a redelivery inserts nothing and does nothing", () => {
    expect(routes.inbound).toMatch(
      /\.onConflictDoNothing\(\{ target: inboundSms\.providerMessageId \}\)[\s\S]*?if \(!row\) return NextResponse\.json\(\{ ok: true, replayed: true \}\)/,
    );
    expect(SQL).toContain("CONSTRAINT inbound_sms_provider_unique UNIQUE (provider_message_id)");
  });

  it("rate limits: 20 USSD sessions and 10 inbound SMS per phone per hour; the flood is not answered", () => {
    expect(routes.ussd).toContain("const SESSIONS_PER_PHONE_PER_HOUR = 20;");
    expect(routes.inbound).toContain("const INBOUND_PER_PHONE_PER_HOUR = 10;");
    expect(routes.inbound).toMatch(/if \(n > INBOUND_PER_PHONE_PER_HOUR\)[\s\S]*?dropped: true/);
    expect(routes.inbound).toMatch(
      /if \(n === INBOUND_PER_PHONE_PER_HOUR\)[\s\S]*?reply = "too_many"/,
    );
  });

  it("no route logs a phone number or the message body", () => {
    for (const [name, src] of Object.entries(routes)) {
      const code = stripComments(src);
      const logCalls = [...code.matchAll(/logger\.\w+\([^)]*\)/gs)].map((m) => m[0]);
      for (const call of logCalls) {
        expect(call, name).not.toMatch(/phone(?!Hmac)|from\b|text\b|body\b|lastReply/);
      }
      // A reply is never composed from the inbound text.
      if (name === "inbound") expect(code).not.toMatch(/reply\s*=\s*parsed\.data\.text/);
    }
  });

  it("the strings table is the only source of USSD/SMS words; Luganda is a data change", () => {
    const strings = read("lib/channels/strings.ts");
    expect(strings).toMatch(
      /export const LANGUAGES[\s\S]*?\{ code: "en", digit: "1", name: "English" \}/,
    );
    expect(strings).toMatch(/export type Language = "en";/);
    // The dispatcher's SMS reply composer reads the same table.
    expect(read("lib/notifications/dispatches.ts")).toContain('t(DEFAULT_LANGUAGE, "sms_help")');
  });
});

describe("migration 0062 as written", () => {
  it("ussd_sessions, inbound_sms, sms_opt_outs: RLS forced with ZERO policies (service-role only)", () => {
    for (const table of ["ussd_sessions", "inbound_sms", "sms_opt_outs"]) {
      expect(SQL).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(SQL).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}`));
    }
  });

  it("the phone is ciphertext + blind index on every channel table; never plaintext", () => {
    for (const table of ["ussd_sessions", "inbound_sms"]) {
      const body = SQL.slice(SQL.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`));
      const def = body.slice(0, body.indexOf(";"));
      expect(def, table).toContain("phone_encrypted text NOT NULL");
      expect(def, table).toContain("phone_hmac text NOT NULL");
      expect(def, table).not.toMatch(/phone_e164|phone text|body text|message text/);
    }
  });

  it("origin admits 'ussd'; dispatch kinds admit 'sms_reply'; hospital_id nullable; +sms_stop", () => {
    expect(SQL).toMatch(/appointments_origin_check CHECK \(\s*origin IN \([^)]*'ussd'\)/);
    expect(SQL).toMatch(/notification_dispatches_kind_check CHECK \([\s\S]*?'sms_reply'/);
    expect(SQL).toContain("ALTER COLUMN hospital_id DROP NOT NULL");
    expect(SQL).toMatch(/sa_audit_log_action_check CHECK \([\s\S]*?'sms_stop'/);
  });

  it("the dispatcher refuses every SMS to an opted-out phone except the STOP reply itself", () => {
    const route = stripComments(read("app/api/cron/dispatch-reminders/route.ts"));
    expect(route).toContain(".from(smsOptOuts)");
    expect(route).toMatch(/failureReason: "sms_opted_out"/);
    expect(route).toMatch(/r\?\.kind === "sms_reply" &&[\s\S]*?\.reply === "stopped"/);
  });
});

function fnSrc(name: string): string {
  return read(`supabase/functions/${name}/index.ts`);
}
