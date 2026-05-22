import { describe, expect, test } from "vitest";

import { PII_FIELD_NAMES, redactPII } from "@/lib/logger";

describe("lib/logger — redactPII", () => {
  test("redacts every PII field name at the top level", () => {
    const input = {
      full_name: "Mukasa, Joseph",
      email: "mukasa@example.com",
      phone: "+256700123456",
      nin: "CM12345678901234",
      dob: "1980-01-01",
      password: "should-never-appear",
      hospital_id: "abc",
      level: "national_referral",
    };
    const out = redactPII(input);
    expect(out.full_name).toBe("[REDACTED]");
    expect(out.email).toBe("[REDACTED]");
    expect(out.phone).toBe("[REDACTED]");
    expect(out.nin).toBe("[REDACTED]");
    expect(out.dob).toBe("[REDACTED]");
    expect(out.password).toBe("[REDACTED]");
    expect(out.hospital_id).toBe("abc");
    expect(out.level).toBe("national_referral");
  });

  test("redacts PII deep inside nested objects", () => {
    const input = {
      patient: {
        profile: {
          full_name: "Test Person",
          mrn: "MRN-2026-00001",
        },
      },
    };
    const out = redactPII(input) as { patient: { profile: { full_name: string; mrn: string } } };
    expect(out.patient.profile.full_name).toBe("[REDACTED]");
    expect(out.patient.profile.mrn).toBe("MRN-2026-00001");
  });

  test("redacts PII inside array elements", () => {
    const input = {
      users: [
        { id: "1", email: "a@x.com" },
        { id: "2", email: "b@x.com" },
      ],
    };
    const out = redactPII(input) as { users: Array<{ id: string; email: string }> };
    expect(out.users[0]?.email).toBe("[REDACTED]");
    expect(out.users[1]?.email).toBe("[REDACTED]");
    expect(out.users[0]?.id).toBe("1");
  });

  test("field-name matching is case-insensitive", () => {
    const input = { FullName: "x", Email: "y", NIN: "z" };
    const out = redactPII(input) as Record<string, string>;
    expect(out.FullName).toBe("[REDACTED]");
    expect(out.Email).toBe("[REDACTED]");
    expect(out.NIN).toBe("[REDACTED]");
  });

  test("handles Error objects without leaking PII in messages they wrap", () => {
    // The Error message may still contain PII (we can't statically scan it),
    // but the Error itself is preserved with name + message + stack so it's
    // useful in logs. Callers must not put PHI in Error messages.
    const err = new Error("auth failed");
    const out = redactPII({ error: err }) as { error: { name: string; message: string } };
    expect(out.error.name).toBe("Error");
    expect(out.error.message).toBe("auth failed");
  });

  test("handles circular references", () => {
    const a: Record<string, unknown> = { full_name: "x" };
    a.self = a;
    const out = redactPII(a) as Record<string, unknown>;
    expect(out.full_name).toBe("[REDACTED]");
    expect(out.self).toBe("[CIRCULAR]");
  });

  test("does not mutate the input", () => {
    const input = { email: "a@x.com", id: "1" };
    const out = redactPII(input);
    expect(input.email).toBe("a@x.com");
    expect(out).not.toBe(input);
  });

  test("passes primitives through unchanged", () => {
    expect(redactPII("hello")).toBe("hello");
    expect(redactPII(42)).toBe(42);
    expect(redactPII(true)).toBe(true);
    expect(redactPII(null)).toBeNull();
    expect(redactPII(undefined)).toBeUndefined();
  });

  test("PII_FIELD_NAMES includes the kickoff-mandated set", () => {
    for (const required of [
      "name",
      "first_name",
      "last_name",
      "full_name",
      "email",
      "phone",
      "phone_number",
      "nin",
      "national_id",
      "date_of_birth",
      "dob",
      "address",
      "password",
    ]) {
      expect(PII_FIELD_NAMES.has(required)).toBe(true);
    }
  });
});
