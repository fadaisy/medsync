#!/usr/bin/env node
/**
 * Three test patients for the patient web's harness and parity crawl (GATE A D-PW-14). The OWNER runs it, on the
 * dev database only, against a running dev server:
 *
 *   PW_TEST_PASSWORD='<a 12+ character password>' node scripts/patient-web/seed-test-patients.mjs http://localhost:3217
 *
 * It writes nothing through a new path: accounts come from the public sign-up route (/api/mobile/patient-signup,
 * the phone's), and each patient's own rows are inserted with that patient's session under RLS, as the phone does.
 *   pw-test-1@medsync.test  "loaded": one medicine with a morning time, one blood-pressure reading
 *   pw-test-2@medsync.test  "empty": nothing
 *   pw-test-3@medsync.test  "household": the household member is added in the app (pt-add-household-member needs
 *                           the adult switch the patient presses), so this one starts empty too
 * Visits need a published clinic session and a bookable clinician on the dev database; book them in the app as
 * pw-test-1. Names are marked as tests; there is no real person behind any of them (L14).
 */
const BASE = process.argv[2] ?? "http://localhost:3217";
const PASSWORD = process.env.PW_TEST_PASSWORD;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!PASSWORD || PASSWORD.length < 12) throw new Error("Set PW_TEST_PASSWORD (12+ characters).");
if (!URL_ || !ANON) throw new Error("Load .env.local first: set -a; . ./.env.local; set +a");
if (/prod/i.test(process.env.NEXT_PUBLIC_MEDSYNC_ENV ?? ""))
  throw new Error("Refusing: this is for the dev database.");

const PATIENTS = [
  { n: 1, firstName: "Test", surname: "Patient One", phone: "0700000101" },
  { n: 2, firstName: "Test", surname: "Patient Two", phone: "0700000102" },
  { n: 3, firstName: "Test", surname: "Patient Three", phone: "0700000103" },
];

const meta = await (await fetch(`${BASE}/api/mobile/patient-signup`)).json();
if (!meta.open) throw new Error("Sign-ups are closed on this server.");
const [place] = (await (await fetch(`${BASE}/api/mobile/patient-signup?q=Kampala`)).json()).places;
if (!place) throw new Error("No place found for 'Kampala'.");

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`${email}: sign-in failed (${r.status})`);
  return r.json();
}

async function insert(token, table, row) {
  const r = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
}

for (const p of PATIENTS) {
  const email = `pw-test-${p.n}@medsync.test`;
  const input = {
    firstName: p.firstName,
    surname: p.surname,
    sex: "prefer_not_say",
    dobDay: "1",
    dobMonth: "1",
    dobYear: "1980",
    phone: p.phone,
    place: place.code,
    email,
    password: PASSWORD,
    smsConsent: false,
    consent: true,
    consentVersion: meta.notice.version,
    consentSha: meta.notice.sha,
  };
  const res = await (
    await fetch(`${BASE}/api/mobile/patient-signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, key: crypto.randomUUID() }),
    })
  ).json();
  const exists = !res.ok && JSON.stringify(res).includes("already");
  if (!res.ok && !exists) throw new Error(`${email}: ${JSON.stringify(res)}`);
  const s = await signIn(email);
  if (p.n === 1 && !exists) {
    const uid = s.user.id;
    await insert(s.access_token, "self_medications", {
      patient_user_id: uid,
      name: "Test medicine A",
      schedule_pattern: "once_daily",
      schedule_times: ["08:00"],
    });
    await insert(s.access_token, "personal_health_logs", {
      patient_user_id: uid,
      kind: "bp",
      numeric_value_1: 128,
      numeric_value_2: 82,
      unit: "mmHg",
    });
  }
  console.log(`${email}: ${exists ? "already there" : "created"}`);
}
