/**
 * PII-redacted JSON logger for Edge Functions. Mirrors lib/logger.ts on the
 * Next side. Keep PII_FIELD_NAMES in sync between the two files when you add
 * a new sensitive field.
 *
 * Edge runs on Deno; we can't share the Next module via @/ aliases.
 */

const PII_FIELD_NAMES = new Set<string>([
  "name",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "full_name",
  "fullname",
  "email",
  "email_address",
  "phone",
  "phone_number",
  "phonenumber",
  "mobile",
  "nin",
  "national_id",
  "nationalid",
  "date_of_birth",
  "dateofbirth",
  "dob",
  "address",
  "street",
  "password",
  "passwd",
  "token",
  "access_token",
  "refresh_token",
  "session",
  "authorization",
  "cookie",
]);

const REDACTED = "[REDACTED]";

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (Object.prototype.toString.call(value) !== "[object Object]") return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PII_FIELD_NAMES.has(k.toLowerCase()) ? REDACTED : redact(v, seen);
  }
  return out;
}

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, fn: string, message: string, context?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    fn,
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console -- intentional structured stdout from the logger
  else console.log(line);
}

/**
 * Bind a logger to a function name. Every line emitted carries `fn: "<name>"`
 * so multi-function deployments stay legible.
 */
export function makeLogger(fn: string) {
  return {
    info: (msg: string, ctx?: Record<string, unknown>) => emit("info", fn, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", fn, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("error", fn, msg, ctx),
  };
}
