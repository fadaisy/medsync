/**
 * Home, the plus's take dialog, and Mood (PROMPT-PATIENT-WEB-TIDE Step 3). Phone strings are copied word for
 * word from mobile/src (the file is named beside each group); web-only strings are marked "web". The CSO
 * signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const HOME_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const HOME_COPY = {
  // mobile/src/app/(app)/(tabs)/index.tsx
  hello: "Hello,",
  there: "there",
  /** web: the avatar's name. */
  avatarLabel: "Me",
  today: "Today",
  thisWeek: "This week",
  segmentsLabel: "Today or this week",
  moodTitle: "How are you today?",
  moods: { good: "Good", okay: "Okay", low: "Not well" },
  moodPick: (label: string) => `Today I feel ${label}`,
  moodWeekLink: "This week's moods. See all.",
  seeAll: "See all",
  tellTeam: "Tell my team",
  bookVisit: "Book a visit",
  dayTitle: "Here is your day",
  dayLoading: "Loading your day",
  dayFailed: "Couldn't load your day.",
  tryAgain: "Try again",
  firstRunTitle: "Start your day here",
  firstRunBody:
    "Add the medicines you take, or log a reading. Your day builds up here. Only you can see what you log.",
  addMedicine: "Add a medicine",
  logReading: "Log a reading",
  kindWords: { bp: "Blood pressure", sugar: "Blood sugar", weight: "Weight", pulse: "Pulse" },
  readingWord: {
    weight: "saved",
    ok: "in your range",
    watch: "outside your target",
    danger: "needs attention",
  },
  doseTitle: (slot: string, medicine: string) => `${slot} medicine · ${medicine}`,
  doseTaken: (at: string) => `${at} · taken`,
  moveSteps: (steps: string, aim: string) => `Move · ${steps} of ${aim} steps`,
  moveMinutes: (moved: number, goal: number) => `Move · ${moved} of ${goal} minutes`,
  minutesNone: "No active minutes logged yet today",
  minutesGoal: "Today's active minutes goal reached",
  minutesSome: (moved: number, goal: number) => `${moved} of ${goal} active minutes today`,
  moveNone: "Nothing logged yet today",
  moveGoal: "Today's goal reached",
  moveToGo: (left: number) => `${left} minutes to go today`,
  eatNone: "Eat · nothing logged yet",
  eatTap: "Tap to add what you eat",
  water: (n: number, of: number) => `Water · ${n} of ${of} glasses`,
  waterNone: "Tap to log a glass",
  waterDone: "Today's glasses done",
  waterToGo: (left: number) => `${left} more to go today`,
  nowPill: (time: string) => `Now · ${time}`,
  snoozedPill: (time: string) => `Snoozed · ${time}`,
  medicinesOverline: "Medicines",
  slotMedicine: (slot: string) => `${slot} medicine`,
  asPrescribed: (medicine: string) => `${medicine}, as your clinician prescribed`,
  tookIt: "I took it",
  notYet: "Not yet",
  savedOnlyYou: "Saved · only you can see it",
  snoozed: "Snoozed for 15 minutes",
  next: (time: string, medicine: string) => `Next · ${time} · ${medicine}`,
  nothingDue: "Nothing due right now",
  nothingDueLine: "Log a reading from the plus below",

  // mobile/src/features/home/doctors.tsx
  seeDoctor: "See a doctor",
  doctorsLoading: "Loading the doctors",
  doctorsFailed: "Couldn't load the doctors. Check your connection.",
  doctorsNone: "No doctor takes bookings on MedSync yet.",
  doctorsNoHospital: "Choose your hospital to see its doctors.",
  chooseHospital: "Choose a hospital",
  doctorFilters: "Filter the doctors",
  walkInsToday: "Walk-ins today",
  ratingNew: "New",
  comeToday: "Come today",
  comeTodayLabel: (dept: string, hospital: string) => `Come today to ${dept}, ${hospital}`,
  askForDay: " Ask for a day.",
  andMore: (hospital: string, n: number) => `${hospital} and ${n} more`,

  // web: the right column (§Step 3: next visit, Log a reading tiles, medicines this week).
  nextVisit: "Your next visit",
  noVisit: "No visit booked.",
  seeVisits: "See your visits",
  logTiles: "Log a reading",
  medsWeek: "Medicines this week",
  medsWeekLine: (taken: number, total: number) => `${taken} of ${total} doses taken`,
  medsWeekNone: "No doses on your list this week.",
  medsDay: (day: string, taken: number, total: number) =>
    total ? `${day}: ${taken} of ${total} taken` : `${day}: no doses`,
  seeMedicines: "See your medicines",

  // web: the plus's "Right now" card and the Log a reading door.
  rightNow: "Right now",
  lastReading: (line: string) => `Last: ${line}`,
} as const;

/** mobile/src/features/home/medicine-sheet.tsx and features/care/add-medicine.tsx */
export const TAKE_COPY = {
  title: "Which one did you take?",
  addTitle: "Add a medicine",
  overline: (taken: number, total: number) =>
    total ? `Today · ${taken} of ${total} taken` : "Today",
  none: "No doses on your list for today. Add a medicine below.",
  takenAt: (at: string) => `Taken at ${at}`,
  dueNow: "Due now",
  later: "Not due yet",
  missed: "Not marked",
  noEntry: "No entry",
  tookEarly: "Took it early",
  savedEarly: (time: string) => `Saved as taken early · ${time}`,
  saved: "Saved",
  undone: "Undone",
  undoFailed: "Couldn't undo that. Try again later.",
  undoLabel: (slot: string) => `Undo ${slot} dose`,
  notOnList: "Something not on my list",
  notOnListLine: "Add it by name and the times you take it",
  missedNote: "Missed one? Do not take two at once. Ask your clinician or pharmacist what to do.",
  done: "Done",
  nameLabel: "Name of the medicine",
  namePlaceholder: "As written on the packet",
  whenLabel: "When do you take it? Pick none if only when you need it.",
  /** The phone's line, with D-PW-04's "who sees" words in place of its second sentence. */
  prescribed: "Take it as your clinician prescribed.",
  add: "Add medicine",
  cancel: "Cancel",
  /** web: the disabled reason (every disabled button says why). */
  nameFirst: "Write the medicine's name first.",
  added: (name: string) => `Added ${name} · only you can see your list`,
} as const;

/** mobile/src/app/(app)/mood.tsx */
export const MOOD_COPY = {
  overline: "Me · Mood",
  title: "How you have felt",
  back: "Me",
  views: { week: "Week", month: "Month", year: "Year" },
  viewsLabel: "Show a week, a month or a year",
  loading: "Loading…",
  failed: "Couldn't load your moods.",
  none: "Nothing yet. Pick a face on Home each day, and your weeks and months show here.",
  thisWeek: "This week",
  today: "Today",
  weekCount: (g: number, o: number, l: number) => `${g} good · ${o} okay · ${l} not well`,
  thisMonth: "This month",
  monthCount: (g: number, o: number, l: number) =>
    `${g} good · ${o} okay · ${l} not well, so far this month`,
  byMonth: "Month by month",
  nothingLogged: "Nothing logged",
  monthMix: (m: string, g: number, o: number, l: number) =>
    `${m}: ${g}% good, ${o}% okay, ${l}% not well`,
  monthNone: (m: string) => `${m}: nothing logged`,
  notWellNote: "Not well a few days in a row? Book a visit, or press Help if it cannot wait.",
  faces: { good: "Good", okay: "Okay", low: "Not well", none: "Not recorded" },
} as const;
