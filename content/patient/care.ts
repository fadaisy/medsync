/**
 * Care on the web: the hub, Medicines, Health trends, Lab tests, Move and eat, Messages. Phone words are
 * copied here (the phone files import React Native) with their source named; web-only words say "web".
 * Reading words, levels and targets come from `@patient-core`, never from here. No dose amount anywhere (L5).
 * Movement, food and water keep the wording the phone ships ("You and your care team can see…", migration
 * 0188) while D-PW-04's open item stands: that wording is a draft until the owner chooses. The CSO signs;
 * Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const CARE_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const lower = (s: string) => s.toLowerCase();

export const CARE_COPY = {
  backToCare: "Care",
  tryAgain: "Try again",

  // mobile/src/app/(app)/(tabs)/care.tsx
  hub: {
    title: "Your care",
    overline: "Care",
    loadingMeds: "Loading your medicines",
    medsWeek: "Medicines this week",
    medsWeekLine: (taken: number, total: number) =>
      total ? `${taken} of ${total} doses taken` : "No doses on your list yet",
    medsWeekLabel: (taken: number, total: number) =>
      `Medicines this week: ${taken} of ${total} doses taken. Open medicines.`,
    addMedicines: "Add your medicines",
    addMedicinesLine: "Names and times of day, to keep track",
    slotDue: (slot: string, due: boolean) => `${slot} medicine is ${due ? "due" : "next"}`,
    nothingMore: "Nothing more due today",
    noDoses: "No doses due today",
    takenToday: (taken: number, total: number) => `${taken} of ${total} taken today`,
    open: "Open",
    trends: "Health trends",
    seeAll: "See all",
    tileLabel: (name: string, value: string, unit: string, trend: string) =>
      `${name}: ${value} ${unit}. ${trend}`,
    labs: "Lab tests",
    allTests: "All tests",
    labsLabel: "Lab tests. Open the list.",
    andMore: (n: number) => ` and ${n} more`,
    noTests: "No tests from your visits yet.",
    move: "Move and eat",
    minutes: (n: number) => `${n.toLocaleString("en-US")} min`,
    walkedOf: (goal: number) => `of ${goal} walked today`,
    glassesOf: (goal: number) => `of ${goal} glasses`,
    seeTeam: "See your care team",
    bookVisit: "Book a visit",
    bookVisitLine: "Your care team does not see what you log here. Bring it to your visit.",
  },

  // mobile/src/app/(app)/care/medicines.tsx
  meds: {
    title: "Medicines",
    loading: "Loading your medicines…",
    failed: "Couldn't load your medicines.",
    ringLabel: (taken: number, total: number) => `${taken} of ${total} doses taken today`,
    takenToday: "taken today",
    weekLine: (taken: number, total: number) => `${taken} of ${total} this week`,
    status: {
      taken: "Taken",
      due: "Due now",
      later: "Later",
      missed: "Missed",
      noEntry: "No entry",
    },
    takenAt: (at: string) => `Taken ${at}`,
    snoozedLine: (until: string) => `Snoozed · ${until}`,
    timelineLabel: "Today's doses",
    nowPill: (time: string) => `Now · ${time}`,
    tookIt: "I took it",
    inFifteen: "In 15 min",
    snoozeLabel: "Snooze for 15 minutes",
    snoozed: "Snoozed",
    /** web: the disabled reason. */
    snoozedUntil: (until: string) => `We will remind you at ${until}, while this page is open.`,
    takeFailed: "Couldn't record that — try again.",
    done: (slot: string, at: string) => `${slot} done · ${at}`,
    next: (slot: string, time: string) => `Next: ${lower(slot)} at ${time}.`,
    allDone: "That is all for today.",
    undo: "Undo",
    undoLabel: (slot: string) => `Undo, ${lower(slot)} not taken`,
    undoFailed: "Couldn't undo that. Try again later.",
    week: "This week",
    weekDoses: (taken: number, total: number) => `${taken} of ${total} doses`,
    dayLabel: (day: string, n: number, of: number) => `${day}, ${n} of ${of} taken`,
    today: "Today",
    mine: "My medicines",
    active: (n: number) => `${n} active`,
    empty:
      "Nothing on your list yet. Add the medicines you take, with the times of day, and mark each dose here.",
    paused: "Paused · ",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    stopTitle: (name: string) => `Stop ${name}?`,
    stopBody: "It leaves your list. Only stop a medicine your clinician told you to stop.",
    yesStop: "Yes, stop it",
    keep: "Keep it",
    saveFailed: "Couldn't save that. Try again when you are online.",
    stopped: (name: string) => `Stopped ${name}`,
    pausedToast: (name: string) => `Paused ${name}`,
    resumed: (name: string) => `${name} is back on your list`,
    add: "Add a medicine",
    /** The phone's footer, with D-PW-04's "who sees" words in place of its second sentence. */
    prescribed: "Take each one as your clinician prescribed.",
    /** web: the pharmacy's list shows names only; its amounts stay on the label (L5, S15). */
    onTheLabel: "How much to take is on the label and the paper you were given.",
  },

  // mobile/src/app/(app)/care/trends.tsx
  trends: {
    title: "Health trends",
    logReading: "Log a reading",
    metricLabel: "Which reading",
    whenMeasured: "When was it measured?",
    target: (when: string, hi: number, unit: string) =>
      `Target ${lower(when)}: up to ${hi} ${unit}`,
    loading: "Loading your readings…",
    failed: "Couldn't load your readings.",
    sugarLabel: (when: string) => `Blood sugar · ${lower(when)}`,
    thisWeek: (label: string) => `${label} · this week`,
    inYourRange: "In your range",
    yourTarget: "Your target",
    outside: "Outside target",
    /** web: the chart's text alternative states its finding (S16). */
    chartLabel: (label: string) => `${label} over the last seven days`,
    finding: (n: number, outside: number | null) =>
      n === 0
        ? "No readings this week."
        : `${n} ${n === 1 ? "reading" : "readings"} this week${
            outside === null ? ", no target for this reading" : `, ${outside} outside target`
          }.`,
    diary: "Your sugar diary",
    diaryLine: "Every reading this week, by time of day",
    chartOnlyYou: "Only you can see this chart. Show it at your visit.",
    readings: "Readings",
    none: "No readings of this kind in the last seven days. Tap + to log one.",
  },

  // mobile/src/app/(app)/care/labs.tsx, features/care-more/lab-parts.tsx
  labs: {
    title: "Lab tests",
    subtitle: "Tests your clinician ordered at your visits",
    empty:
      "No tests yet. When a clinician orders a test at a visit and shares the visit with you, it shows here.",
    // web: the old results page's words (app/patient/results/page.tsx); names only on Care (S15).
    ready: "Ready",
    notReady: "Not ready to show yet",
    off: "Lab tests are not shown in the app at your hospital yet.",
    noConsent: "Results show here only if you agree. Nothing is shown until then.",
    minor:
      "Results for children and young people are not shown in the app yet. Ask at the hospital.",
    unsigned: "Your hospital has not started showing results in the app yet.",
    namesOnly: "Only the names of your tests show here. Open My results to read them.",
    openResults: "Open My results",
    failed: "Couldn't load your tests.",
  },

  // mobile/src/app/(app)/care/activity.tsx, features/care-more/*, data/activity.ts
  move: {
    title: "Move and eat",
    tabsLabel: "Move or eat",
    tabs: { move: "Move", eat: "Eat" },
    /** The care team reads what the patient logs (migration 0188, ADR 0413). Draft: D-PW-04 open item. */
    note: "You and your care team can see what you log here.",
    /** web */
    failed: "Couldn't load what you logged.",
    stepsToday: "Steps today",
    activeToday: "Active today",
    stepsRing: (steps: string, aim: string) => `${steps} steps today, a common aim is ${aim}`,
    minutesRing: (m: number, goal: number) => `${m} of ${goal} active minutes today`,
    activeLine: (m: number, kcal: number) =>
      `${m} active min${kcal ? ` · about ${kcal} kcal` : ""}`,
    minutesShown: (m: number) => `${m} min`,
    start: "Start an activity",
    logOne: "Log one I did",
    today: "Today",
    exerciseLine: (m: number, kcal: number | null) => `${m} min${kcal ? ` · ${kcal} kcal` : ""}`,
    viewLabel: "Steps or minutes",
    views: { steps: "Steps", minutes: "Minutes" },
    stepsWeek: "Steps this week",
    minutesWeek: "Active minutes this week",
    perDay: (n: string) => `${n} a day`,
    ofGoal: (n: number, goal: number) => `${n} of ${goal}`,
    weekLabel: (what: string, days: string) => `${what}: ${days}.`,
    stepsAim: (aim: string) =>
      `A common aim is about ${aim} steps a day. Ask your care team what is right for you.`,
    minutesAim: (goal: number) =>
      `A common goal is ${goal} minutes of brisk activity a week. Ask your care team what is right for you.`,
    safety: {
      label: "Safety while you move",
      overline: "Safety while you move",
      title: "Stop at once if you feel any of these",
      signs: [
        "Chest pain or tightness",
        "Very short of breath",
        "Dizzy or about to faint",
        "Shaky, sweaty or confused",
      ],
      whatToDo: "What to do",
      steps: [
        "1. Stop and sit down.",
        "2. Shaky, sweaty or confused? Eat or drink something sweet now.",
        "3. Chest pain or it is not getting better? Get help.",
      ],
      help: "I feel this now · Get help",
    },
    dialog: {
      liveOverline: "Start an activity",
      logOverline: "Log an activity",
      liveTitle: "What are you doing?",
      logTitle: "What did you do?",
      activityLabel: "Activity",
      effortLabel: "How hard",
      efforts: { easy: "Easy", moderate: "Moderate", hard: "Hard" },
      kcalSoFar: (k: number) => `About ${k} kcal so far`,
      keepGoing: "Keep going",
      needWeight: "Log your weight to see energy used",
      pause: "Pause",
      carryOn: "Carry on",
      startTimer: "Start",
      finish: "Finish and save",
      howLong: "How long",
      minutesUnit: "minutes",
      kcalFrom: (k: number) => `About ${k} kcal, from your weight and the activity`,
      needWeightLog: "Log your weight to see about how much energy this used",
      save: "Save activity",
      source: "Energy is an estimate from the 2024 Compendium of Physical Activities.",
      saved: (label: string, m: number, kcal: number | null) =>
        `Saved · ${label}, ${m} min${kcal ? `, about ${kcal} kcal` : ""}`,
      /** web: disabled reasons. */
      atLeastMinute: "Time at least one minute first.",
      sayHowLong: "Say how long first.",
      saveFailed: "Couldn't save that. Try again later.",
    },
    plate: {
      title: "Your plate guide",
      label: "Plate guide: half vegetables, a quarter starch, a quarter protein",
      half: "Half: greens and vegetables",
      starch: "Quarter: matooke, posho, rice",
      protein: "Quarter: beans, fish, chicken",
    },
    water: {
      title: "Water",
      loading: "Loading…",
      count: (n: number, of: number) => `${n} of ${of} glasses`,
      glass: (i: number, full: boolean) => `Glass ${i}${full ? ", drunk" : ""}`,
    },
  },

  // mobile/src/features/care-more/meal-parts.tsx, product-parts.tsx, data/products.ts
  meals: {
    title: "Meals",
    addFood: "Add food",
    empty: "Nothing logged today. After you eat, tap Add food and pick what was on your plate.",
    energy: "Energy",
    carbs: "Carbs",
    load: "Glycemic load",
    loadUnknown: "Glycemic load is not known for today: some foods have no published GI.",
    slotKcal: (k: number) => `${k} kcal`,
    entryLine: (portion: string, kcal: number, carbs: number) =>
      `${portion} · ${kcal} kcal · ${carbs} g carbs`,
    remove: (name: string) => `Remove ${name}`,
    removed: (name: string) => `Removed · ${name}`,
    removeFailed: "Couldn't remove that. Try again when you are online.",
    saved: (name: string) => `Saved · you and your care team can see it · ${name}`,
    saveFailed: "Couldn't save that. Try again later.",
    overline: { pick: "Add food", howMuch: "How much", packaged: "Packaged food" },
    titles: { pick: "What did you eat?", scan: "Type the barcode", form: "From the label" },
    backToSearch: "Back to search",
    looking: "Looking it up…",
    offNote: "Products are looked up in Open Food Facts, an open database.",
    /** web: no camera barcode reader on the web (§3); the code is typed. */
    typeBarcode: "Type a barcode",
    barcodeLabel: "Barcode",
    barcodeHint: "The numbers under the stripes on the pack",
    lookUp: "Look it up",
    barcodeFirst: "Type the barcode's numbers first.",
    typePackaged: "Type a packaged food",
    offMissing:
      "This barcode is not in Open Food Facts yet. Photograph the nutrition label, or type it in.",
    offOffline:
      "Can't look the barcode up without a connection. Type it in from the nutrition label.",
    typeIntro: "Type it in from the nutrition label, per 100 g.",
    searchPlaceholder: "Search: matooke, beans, chai…",
    searchLabel: "Search foods",
    groupsLabel: "Food groups",
    all: "All",
    searching: "Searching…",
    more: (n: number) => `${n} more · type to narrow`,
    nothing: "Nothing by that name in the list yet. Try another name for it.",
    changeFood: "Change food",
    fromOff:
      "From Open Food Facts, typed in by volunteers from the label. Check it against the pack.",
    portionsLabel: "Portion",
    portion: (label: string, grams: number) => `${label} (${grams} g)`,
    byWeight: "By weight",
    weight: "Weight",
    grams: "grams",
    howMany: "How many",
    times: "portions",
    mealLabel: "Which meal",
    totalLine: (kcal: number, carbs: number) => `${kcal} kcal · ${carbs} g carbs`,
    nutrients: (p: string, f: string, fi: string) => `Protein ${p} · fat ${f} · fibre ${fi}`,
    giLoad: (gi: string, load: number | null) =>
      `${gi} · glycemic load ${load === null ? "not known" : load}`,
    save: "Save",
    pickAmount: "Say how much first.",
    portionNote: "Portion sizes are a guide. Values come from published food tables.",
    form: {
      readPhoto: "Read the label from a photo",
      check: "Check each value against the label before you go on.",
      name: "Name",
      namePlaceholder: "As on the pack",
      optional: " (optional)",
      fields: {
        kcal: "Energy (kcal per 100 g)",
        carbs: "Carbohydrate (g per 100 g)",
        protein: "Protein (g per 100 g)",
        fat: "Fat (g per 100 g)",
        fibre: "Fibre (g per 100 g)",
        servingG: "One serving (g)",
      },
      continue: "Continue",
      noRead: "Couldn't read the label. Try again with the panel filling the photo, or type it.",
      signInAgain: "Sign in again.",
      offline: "Couldn't reach MedSync. Check your connection, or type it.",
    },
  },

  // mobile/src/app/(app)/care/chat.tsx (ChatNotYet)
  messages: {
    title: "Messages",
    notYet: "Messaging your care team is not available yet.",
    instead:
      "To talk to a clinician, book a visit. If you feel very unwell, press the red Help button.",
    book: "Book a visit",
  },
} as const;
