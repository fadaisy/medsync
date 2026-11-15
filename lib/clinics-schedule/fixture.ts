/**
 * The Getting ready fixture (Appendix A), for the styleguide harness, screenshots and tests. Invented names only.
 * Booked counts are the booking engine's read model (`clinic_sessions.booked_count`) as seeded here, never typed
 * in a component. Holidays are rows of the Hub's verified list (migration 0080). Scenarios: ready, first, offline.
 */
import type {
  Band,
  Booked,
  Change,
  Clinic,
  Device,
  Exception,
  Holiday,
  LeaveRequest,
  Person,
  Place,
  Session,
  Snapshot,
  Weekday,
} from "./model";

import { DRAFT_BANDS } from "@/content/clinics-schedule/bands";
import { CLINIC_PALETTE } from "@/content/clinics-schedule/palette";
import { BANDS, emptySnapshot } from "./model";

export interface Version {
  number: number;
  at: string;
  by: string;
  textsSent: number;
  changes: Change[];
}
/** A scheduled publish (schedule_publish_jobs): its changes leave the drafts until it runs or is cancelled. */
export interface Job {
  id: string;
  runAt: string;
  by: string;
  changes: Change[];
}
export interface CsUser {
  id: string;
  name: string;
  can: "publish" | "draft";
}

export interface CsData {
  fixture: boolean;
  hospitalName: string;
  level: string;
  /** Today in Kampala, YYYY-MM-DD; the clock for every date shown. */
  today: string;
  departments: Record<string, { name: string; live: boolean }>;
  published: Snapshot;
  drafts: Change[];
  versions: Version[];
  job: Job | null;
  booked: Booked;
  holidays: Holiday[];
  hours: { open: number; close: number } | null;
  /** D-CS-18: the configured per-text rate; null = not set. */
  unitCost: number | null;
  bookingUrl: string;
  user: CsUser;
  users: CsUser[];
  /** Who wrote each change, by author id. */
  names: Record<string, string>;
}

const h = (n: number) => n * 60;
const D = {
  med: "d-med",
  obs: "d-obs",
  sur: "d-sur",
  ent: "d-ent",
  den: "d-den",
  mh: "d-mh",
  reh: "d-reh",
  pae: "d-pae",
};
const DEPTS: CsData["departments"] = {
  [D.med]: { name: "Medicine", live: true },
  [D.obs]: { name: "Obstetrics and gynaecology", live: true },
  [D.sur]: { name: "Surgery", live: true },
  [D.ent]: { name: "Eye and ENT", live: true },
  [D.den]: { name: "Dental", live: true },
  [D.mh]: { name: "Mental health", live: true },
  [D.reh]: { name: "Rehabilitation", live: true },
  [D.pae]: { name: "Paediatrics", live: true },
};

const blocks: [string, string, "general" | "private" | null, string[]][] = [
  [
    "b-main",
    "Main OPD block",
    "general",
    ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Room 6", "Room 7"],
  ],
  ["b-opb", "Outpatients block B", "general", ["Room 8", "Room 9", "Room 10", "Room 11"]],
  ["b-eye", "Eye and Dental annex", "general", ["Eye room", "Dental suite"]],
  ["b-mat", "Maternity wing", "general", ["ANC room 1", "ANC room 2"]],
  ["b-pae", "Paediatric wing", "general", ["Paed room 1", "Play room"]],
  ["b-reh", "Rehabilitation block", "general", ["Physio gym"]],
  ["b-pri", "Private wing", "private", ["Suite 1", "Suite 2", "Suite 3"]],
];
const room = (block: string, name: string) => `${block}:${name.toLowerCase().replace(/\s+/g, "-")}`;

const people: [string, string, string, string, Band, string, string | null, boolean][] = [
  // id, name, role as patients read it, cadre, band, dept, office, consent
  [
    "p-okello",
    "Dr. Okello",
    "Physician",
    "physician",
    "specialist",
    D.med,
    room("b-pri", "Suite 1"),
    true,
  ],
  ["p-namata", "Dr. Namata", "Medical officer", "doctor", "mo", D.med, null, true],
  ["p-kiggundu", "Dr. Kiggundu", "Medical officer", "doctor", "mo", D.med, null, false],
  ["p-nakato", "Midwife Nakato", "Midwife", "midwife", "nurse", D.obs, null, true],
  [
    "p-auma",
    "Dr. Auma",
    "Obstetrician",
    "obstetrician",
    "consultant",
    D.obs,
    room("b-pri", "Suite 2"),
    true,
  ],
  [
    "p-ochieng",
    "Dr. Ochieng",
    "Eye surgeon",
    "eye surgeon",
    "specialist",
    D.ent,
    room("b-eye", "Eye room"),
    false,
  ],
  ["p-mugisha", "Dr. Mugisha", "ENT surgeon", "ENT surgeon", "specialist", D.ent, null, false],
  [
    "p-ssali",
    "Dr. Ssali",
    "General surgeon",
    "surgeon",
    "consultant",
    D.sur,
    room("b-pri", "Suite 3"),
    true,
  ],
  [
    "p-tumusiime",
    "Dr. Tumusiime",
    "Orthopaedic surgeon",
    "orthopaedic surgeon",
    "specialist",
    D.sur,
    null,
    false,
  ],
  ["p-nalwoga", "Dr. Nalwoga", "Dental surgeon", "dental surgeon", "mo", D.den, null, true],
  [
    "p-byaruhanga",
    "Dr. Byaruhanga",
    "Psychiatrist",
    "psychiatrist",
    "specialist",
    D.mh,
    room("b-opb", "Room 11"),
    false,
  ],
  ["p-wasswa", "Physio Wasswa", "Physiotherapist", "physiotherapist", "co", D.reh, null, true],
  ["p-akot", "Nutritionist Akot", "Nutritionist", "nutritionist", "co", D.med, null, false],
  ["p-lubega", "Dr. Lubega", "Neurologist", "neurologist", "consultant", D.med, null, false],
  [
    "p-kyomuhendo",
    "Dr. Kyomuhendo",
    "Kidney specialist",
    "physician",
    "specialist",
    D.med,
    null,
    false,
  ],
  [
    "p-opio",
    "Dr. Opio",
    "Cardiologist",
    "physician",
    "consultant",
    D.med,
    room("b-pri", "Suite 1"),
    false,
  ],
  ["p-mukasa", "Dr. Mukasa", "Urologist", "surgeon", "specialist", D.sur, null, false],
  ["p-ayebare", "Dr. Ayebare", "Paediatrician", "paediatrician", "specialist", D.pae, null, true],
  ["p-kato", "Dr. Kato", "Clinical officer", "clinical officer", "co", D.med, null, false],
  ["p-nakitto", "Dr. Nakitto", "Medical officer", "doctor", "mo", D.med, null, false],
  ["p-apio", "Sister Apio", "Nurse", "nurse", "nurse", D.pae, null, false],
];

type S = Partial<Session> & {
  d: Weekday[];
  st: number;
  en: number;
  rooms: string[];
  docs: string[];
};
const clinics: [string, string, string, number, string, string, S[], Partial<Clinic>][] = [
  // id, name, short, colour index, dept, block, sessions, extra
  [
    "c-opd",
    "General OPD",
    "OPD",
    0,
    D.med,
    "b-main",
    [
      {
        d: [1, 2, 3, 4, 5],
        st: h(8),
        en: h(16),
        rooms: [room("b-main", "Room 3"), room("b-main", "Room 4")],
        docs: ["p-namata", "p-kiggundu"],
        brk: { start: h(13), end: h(14) },
      },
      { d: [6], st: h(8), en: h(13), rooms: [room("b-main", "Room 3")], docs: ["p-kiggundu"] },
    ],
    {
      live: true,
      code: "general_medical_opd",
      words: "For any new problem or a check-up. A nurse sees you first.",
      feeMode: "band",
    },
  ],
  [
    "c-dm",
    "Diabetes Clinic",
    "Diabetes",
    1,
    D.med,
    "b-main",
    [{ d: [2, 5], st: h(10), en: h(12), rooms: [room("b-main", "Room 7")], docs: ["p-okello"] }],
    {
      live: true,
      code: "diabetes",
      words: "Reviews for people living with diabetes. Bring your sugar book and medicines.",
      feeMode: "flat",
      feeUgx: 50000,
    },
  ],
  [
    "c-anc",
    "Antenatal Clinic",
    "Antenatal",
    5,
    D.obs,
    "b-mat",
    [{ d: [2, 4], st: h(8), en: h(13), rooms: [room("b-mat", "ANC room 1")], docs: ["p-nakato"] }],
    {
      live: true,
      code: "antenatal_maternal",
      words: "Pregnancy check-ups with the midwife. Bring your mother's card.",
      feeMode: "free",
    },
  ],
  [
    "c-htn",
    "Hypertension Clinic",
    "Hypertension",
    2,
    D.med,
    "b-main",
    [
      {
        d: [2, 5],
        st: h(10),
        en: h(12),
        rooms: [room("b-main", "Room 7")],
        docs: ["p-okello"],
        kind: "times",
        slotMin: 20,
      },
    ],
    {
      live: true,
      code: "hypertension_cardiac",
      words: "Blood pressure reviews at a set time with the doctor.",
      feeMode: "band",
    },
  ],
  [
    "c-eye",
    "Eye Clinic",
    "Eye",
    6,
    D.ent,
    "b-eye",
    [{ d: [2, 4], st: h(8), en: h(13), rooms: [room("b-eye", "Eye room")], docs: ["p-ochieng"] }],
    { code: "eye", feeMode: "flat", feeUgx: 40000, words: "Eye checks, glasses and eye problems." },
  ],
  [
    "c-ent",
    "ENT Clinic",
    "ENT",
    7,
    D.ent,
    "b-eye",
    [{ d: [3], st: h(8), en: h(13), rooms: [room("b-eye", "Eye room")], docs: ["p-mugisha"] }],
    { code: "ent", feeMode: "band", words: "Ear, nose and throat problems." },
  ],
  [
    "c-sur",
    "Surgical OPD",
    "Surgery",
    4,
    D.sur,
    "b-opb",
    [{ d: [1, 4], st: h(8), en: h(13), rooms: [room("b-opb", "Room 8")], docs: ["p-ssali"] }],
    {
      code: "surgical_opd",
      feeMode: "band",
      words: "Lumps, hernias, wounds and reviews after an operation.",
    },
  ],
  [
    "c-ort",
    "Orthopaedic Clinic",
    "Ortho",
    3,
    D.sur,
    "b-opb",
    [{ d: [3], st: h(8), en: h(13), rooms: [room("b-opb", "Room 9")], docs: ["p-tumusiime"] }],
    {
      code: "orthopaedic",
      feeMode: "band",
      words: "Bone and joint problems, and fracture reviews.",
    },
  ],
  [
    "c-den",
    "Dental Clinic",
    "Dental",
    9,
    D.den,
    "b-eye",
    [
      {
        d: [1, 2, 3, 4, 5],
        st: h(8),
        en: h(14),
        rooms: [room("b-eye", "Dental suite")],
        docs: ["p-nalwoga"],
      },
    ],
    { code: "dental", feeMode: "flat", feeUgx: 30000, words: "Toothache, check-ups and cleaning." },
  ],
  [
    "c-skin",
    "Skin Clinic",
    "Skin",
    8,
    D.med,
    "b-opb",
    [{ d: [2], st: h(8), en: h(12), rooms: [room("b-opb", "Room 10")], docs: [] }],
    { code: "skin", feeMode: "band", words: "Rashes, itching and other skin problems." },
  ],
  [
    "c-gyn",
    "Gynaecology Clinic",
    "Gynae",
    10,
    D.obs,
    "b-pri",
    [
      {
        d: [3],
        st: h(9),
        en: h(13),
        rooms: [room("b-pri", "Suite 2")],
        docs: ["p-auma"],
        kind: "times",
        slotMin: 20,
      },
    ],
    {
      code: null,
      tier: "both",
      feeMode: "band",
      words: "Women's health problems outside pregnancy.",
    },
  ],
  [
    "c-mh",
    "Mental Health Clinic",
    "Mental health",
    11,
    D.mh,
    "b-opb",
    [
      {
        d: [5],
        st: h(9),
        en: h(13),
        rooms: [room("b-opb", "Room 11")],
        docs: ["p-byaruhanga"],
        kind: "times",
        slotMin: 30,
      },
    ],
    {
      code: "mental_health",
      confidential: true,
      feeMode: "band",
      words: "Talk to someone about stress, low mood, sleep or worry.",
    },
  ],
  [
    "c-phy",
    "Physiotherapy",
    "Physio",
    2,
    D.reh,
    "b-reh",
    [{ d: [2, 4], st: h(9), en: h(12), rooms: [room("b-reh", "Physio gym")], docs: ["p-wasswa"] }],
    {
      code: null,
      feeMode: "flat",
      feeUgx: 20000,
      words: "Exercises and treatment for pain and recovery.",
    },
  ],
  [
    "c-nut",
    "Nutrition Clinic",
    "Nutrition",
    6,
    D.med,
    "b-main",
    [{ d: [1], st: h(9), en: h(12), rooms: [room("b-main", "Room 5")], docs: ["p-akot"] }],
    { code: "nutrition", feeMode: "free", words: "" },
  ],
  [
    "c-neu",
    "Neurology Clinic",
    "Neuro",
    1,
    D.med,
    "b-opb",
    [{ d: [4], st: h(9), en: h(13), rooms: [room("b-opb", "Room 10")], docs: ["p-lubega"] }],
    {
      code: "epilepsy_neurology",
      referral: true,
      feeMode: "band",
      words: "Headaches, fits, numbness and nerve problems. Referral letter needed.",
    },
  ],
  [
    "c-kid",
    "Kidney Clinic",
    "Kidney",
    7,
    D.med,
    "b-opb",
    [],
    {
      code: "renal_dialysis",
      referral: true,
      feeMode: "band",
      words: "Kidney reviews. Referral letter needed.",
    },
  ],
  [
    "c-hrt",
    "Heart Clinic",
    "Heart",
    4,
    D.med,
    "b-pri",
    [{ d: [1], st: h(9), en: h(13), rooms: [room("b-pri", "Suite 1")], docs: ["p-opio"] }],
    {
      code: null,
      referral: true,
      tier: "private",
      feeMode: "band",
      words: "Heart reviews. Referral letter needed.",
    },
  ],
  [
    "c-uro",
    "Urology Clinic",
    "Urology",
    3,
    D.sur,
    "b-opb",
    [{ d: [5], st: h(8), en: h(12), rooms: [room("b-opb", "Room 9")], docs: ["p-mukasa"] }],
    { code: null, feeMode: "band", words: "Bladder, kidney stone and prostate problems." },
  ],
  [
    "c-scd",
    "Sickle Cell Clinic",
    "Sickle cell",
    0,
    D.pae,
    "b-pae",
    [
      {
        d: [5],
        st: h(8),
        en: h(13),
        rooms: [room("b-pae", "Paed room 1")],
        docs: ["p-ayebare", "p-apio"],
      },
    ],
    {
      code: "sickle_cell",
      ages: "children",
      feeMode: "free",
      words: "Reviews for children living with sickle cell. Bring the child's clinic card.",
    },
  ],
];

/** Booked people per upcoming session, as the booking engine's read model would hold them (live clinics only). */
const BOOKED: Record<string, number> = {
  "c-opd-1-0": 31,
  "c-opd-2-0": 27,
  "c-opd-3-0": 24,
  "c-opd-4-0": 22,
  "c-opd-5-0": 19,
  "c-opd-6-1": 9,
  "c-dm-2-0": 14,
  "c-dm-5-0": 11,
  "c-anc-2-0": 18,
  "c-anc-4-0": 16,
  "c-htn-2-0": 6,
  "c-htn-5-0": 5,
};

const ALL_DESK = [
  "c-opd",
  "c-dm",
  "c-anc",
  "c-htn",
  "c-eye",
  "c-ent",
  "c-sur",
  "c-ort",
  "c-den",
  "c-skin",
  "c-gyn",
  "c-mh",
  "c-nut",
  "c-neu",
  "c-kid",
  "c-uro",
];

export function fixtureData(scenario: "ready" | "first" | "offline" = "ready"): CsData {
  const s = emptySnapshot();
  for (const [id, name, tier, rooms] of blocks) {
    s.places[id] = { id, kind: "block", name, parentId: null, tier } satisfies Place;
    for (const r of rooms)
      s.places[room(id, r)] = { id: room(id, r), kind: "room", name: r, parentId: id, tier: null };
  }
  for (const [id, name, role, cadre, band, dept, office, consent] of people)
    s.people[id] = {
      id,
      name,
      role,
      cadre,
      band,
      departmentId: dept,
      officeId: office,
      showName: consent,
      showPhoto: false,
      consentOn: consent ? "2026-11-02" : null,
      consentBy: consent ? "u-admin" : null,
      userId: `u-${id}`,
    } satisfies Person;
  for (const [id, name, short, ci, dept, block, sess, extra] of clinics) {
    if (scenario === "first" && id !== "c-opd") continue;
    const team = [...new Set(sess.flatMap((x) => x.docs))];
    s.clinics[id] = {
      id,
      name,
      shortName: short,
      colour: CLINIC_PALETTE[ci] ?? "",
      departmentId: dept,
      blockId: block,
      roomIds: [...new Set(sess.flatMap((x) => x.rooms))],
      tier: "general",
      ages: "all",
      words: "",
      referral: false,
      confidential: false,
      feeMode: null,
      feeUgx: null,
      feePrivateUgx: null,
      feeOverrides: {},
      rules: {
        aheadDays: 30,
        closes: "start",
        sameDay: true,
        walkins: true,
        reminder: true,
        followUpSkipTriage: false,
      },
      pay: { cash: true, mtn: true, airtel: false },
      payWhen: "arrive",
      team,
      live: false,
      paused: false,
      code: null,
      ...extra,
    } satisfies Clinic;
    if (scenario === "first") s.clinics[id]!.live = false;
    sess.forEach((x, i) =>
      x.d.forEach((d) => {
        const sid = `${id}-${d}-${i}`;
        s.sessions[sid] = {
          id: sid,
          clinicId: id,
          weekday: d,
          start: x.st,
          end: x.en,
          kind: x.kind ?? "day",
          slotMin: x.slotMin ?? 20,
          visitMin: x.kind === "times" ? (x.slotMin ?? 20) : 15,
          places: null,
          holdPct: x.kind === "times" ? 0 : 10,
          brk: x.brk ?? null,
          every: 1,
          nth: null,
          roomIds: x.rooms,
          personIds: x.docs,
        };
      }),
    );
  }
  for (const b of BANDS)
    s.bands[b] = { id: b, ...DRAFT_BANDS[b], rowId: `band-${b}`, approved: true };

  const devices: Device[] = [
    {
      id: "v-d1",
      kind: "desk",
      name: "Reception desk 1",
      place: "Main hall",
      clinicIds: ALL_DESK.slice(0, 9),
      lockMin: 10,
      lastSeen: "now",
      online: true,
    },
    {
      id: "v-d2",
      kind: "desk",
      name: "Reception desk 2",
      place: "Outpatients corridor",
      clinicIds: [...ALL_DESK.slice(9), "c-scd"],
      lockMin: 10,
      lastSeen: "now",
      online: true,
    },
    {
      id: "v-t1",
      kind: "tablet",
      name: "Triage station 1",
      place: "Triage bay",
      clinicIds: ["c-opd"],
      lockMin: 5,
      lastSeen: "now",
      online: true,
    },
    {
      id: "v-s1",
      kind: "screen",
      name: "Waiting-room screen 1",
      place: "Main hall",
      clinicIds: ["c-opd", "c-dm", "c-htn", "c-anc"],
      lockMin: null,
      lastSeen: "now",
      online: true,
    },
    {
      id: "v-s2",
      kind: "screen",
      name: "Waiting-room screen 2",
      place: "Outpatients corridor",
      clinicIds: ["c-sur", "c-ort", "c-skin", "c-neu"],
      lockMin: null,
      lastSeen: "05:12",
      online: false,
    },
  ];
  for (const d of devices)
    s.devices[d.id] = { ...d, clinicIds: d.clinicIds.filter((c) => s.clinics[c]) };

  const ex: Exception[] = [
    {
      id: "x-wdd",
      type: "extra",
      from: "2026-11-14",
      to: "2026-11-14",
      part: { start: h(9), end: h(13) },
      clinicIds: ["c-dm"],
      personId: null,
      coverId: null,
      policy: "offer",
      reason: "Screening day",
      extra: { clinicId: "c-dm", start: h(9), end: h(13), places: 40, personIds: ["p-okello"] },
    },
    {
      id: "x-namata",
      type: "away",
      from: "2026-11-23",
      to: "2026-11-27",
      part: null,
      clinicIds: [],
      personId: "p-namata",
      coverId: "p-kiggundu",
      policy: "offer",
      reason: "Annual leave",
      extra: null,
    },
  ];
  if (scenario !== "first") for (const x of ex) s.exceptions[x.id] = x;

  const holidays: Holiday[] = [
    ["2026-12-25", "Christmas Day"],
    ["2026-12-26", "Boxing Day"],
    ["2027-01-01", "New Year's Day"],
    ["2027-01-26", "NRM Liberation Day"],
    ["2027-02-16", "Archbishop Janani Luwum Day"],
    ["2027-03-08", "International Women's Day"],
    ["2027-03-26", "Good Friday"],
    ["2027-03-29", "Easter Monday"],
    ["2027-05-01", "Labour Day"],
    ["2027-06-03", "Martyrs' Day"],
    ["2027-06-09", "National Heroes' Day"],
    ["2027-10-09", "Independence Day"],
  ].map(([date = "", name = ""], i) => ({ id: String(100 + i), date, name, provisional: false }));
  for (const id of ["100", "101", "102"])
    s.holidays[id] = { id, decision: "closed", rowId: `hd-${id}` };

  const leave: LeaveRequest[] = [
    {
      id: "l-ayebare",
      personId: "p-ayebare",
      from: "2026-11-30",
      to: "2026-12-04",
      am: false,
      reason: "Conference",
      sentAt: "2026-11-10",
      status: "new",
    },
    {
      id: "l-kato",
      personId: "p-kato",
      from: "2026-11-20",
      to: "2026-11-20",
      am: true,
      reason: "Family event",
      sentAt: "2026-11-11",
      status: "new",
    },
  ];
  if (scenario !== "first") for (const l of leave) s.leave[l.id] = l;
  // Dr. Kato needs a session for the request to matter; Dr. Ayebare runs Sickle cell with Sister Apio (cover).
  const fri = s.sessions["c-opd-5-0"];
  if (fri) s.sessions[fri.id] = { ...fri, personIds: ["p-namata", "p-kiggundu", "p-kato"] };

  const users: CsUser[] = [
    { id: "u-admin", name: "Grace Atim", can: "publish" },
    { id: "u-admin2", name: "Moses Ouma", can: "publish" },
  ];
  const ch = (id: string, summary: string, at: string): Change => ({
    id,
    summary,
    author: "u-admin",
    at,
    edits: [],
  });
  return {
    fixture: true,
    hospitalName: "St. Example Hospital",
    level: "district",
    today: "2026-11-12",
    departments: DEPTS,
    published: s,
    drafts: [],
    versions:
      scenario === "first"
        ? []
        : [
            {
              number: 1,
              at: "2026-11-02T09:10:00Z",
              by: "u-admin",
              textsSent: 0,
              changes: [
                ch(
                  "v1a",
                  "General OPD, Diabetes, Antenatal and Hypertension opened for booking",
                  "2026-11-02T09:00:00Z",
                ),
              ],
            },
            {
              number: 2,
              at: "2026-11-09T15:40:00Z",
              by: "u-admin2",
              textsSent: 0,
              changes: [
                ch("v2a", "Reception desk 2 now covers Sickle cell", "2026-11-09T15:30:00Z"),
                ch(
                  "v2b",
                  "World Diabetes Day screening added for Sat 14 Nov",
                  "2026-11-09T15:35:00Z",
                ),
              ],
            },
          ],
    job: null,
    booked: scenario === "first" ? {} : BOOKED,
    holidays,
    hours: { open: h(8), close: h(17) },
    unitCost: null,
    bookingUrl: "https://tether.health/book/st-example",
    user: users[0]!,
    users,
    names: { "u-admin": "Grace Atim", "u-admin2": "Moses Ouma" },
  };
}
