/**
 * Lab Workspace v2, Reports (prompt 5.9): the place's new and changed words. Draft; covered by LABWS2_COPY_STATUS
 * in content/lab-workspace-v2.ts. The signed Lab Phase 3 words (LAB3_REPORTS, LAB3_HMIS, LAB3_REGISTER) are
 * reused as they are.
 */
export const LABWS2_REPORTS = {
  tabsLabel: "Reports",
  hmisTab: "HMIS 105 · due {date}",
  period: {
    label: "Period",
    toDay: "to {day}",
    range: "{from} to {to}",
    presets: {
      today: "Today",
      last7: "Last 7 days",
      this_month: "This month",
      last_month: "Last month",
      last3: "Last 3 months",
      custom: "Pick dates",
    },
    pickFirst: "Pick the first day.",
    pickLast: "From {day}. Now pick the last day.",
    months: "Months",
  },
  filters: {
    label: "Filters",
    chip: "{name}: {value}",
    all: "all",
    allOption: "All",
    search: "Search {name}",
  },
  indicators: {
    lastMonth: "{month}: {value}",
    lastMonthNoData: "{month}: no data",
    spark: "{name}, {from} to {to}: {values}",
    sparkNoData: "no data",
    weekly: "Median turnaround per week, receipt to release",
    weeklyNote: "{scope} · minutes",
    allSections: "All sections",
    stated: "stated {time}",
    statedMixed: "Stated times differ by test ({times}), so no single line is drawn.",
    statedNone: "These tests have no stated time.",
    chartSummary:
      "Median turnaround per week from the week of {from} to the week of {to}: lowest {min} min, highest {max} min, latest {last} min.",
    chartEmpty: "Nothing was released with a receipt time in these six months.",
    viewTable: "View as table",
    weekColumns: ["Week of", "Median, minutes", "Released"],
    noDataCell: "No data",
    rejectionsNone: "No specimen was rejected in this period.",
    reasonsNote: "Most from {ward} ({n}). Each bar opens its specimens.",
    reasonLine: "{reason}: {n}, most from {ward} ({wardN})",
    perSection: "Turnaround by section, 90 % of reports within",
    perSectionColumns: ["Section", "90 % within", "Stated", "Released"],
  },
  register: {
    section: "Section",
    register: "Register",
    day: "Day",
  },
  hmis: {
    month: "Month",
    asOf: "{month} · as of {time}",
    sections: "HMIS 105 sections",
    changed: "Changed since signing",
    changeCounts: "({added} added, {removed} removed)",
    blank: "blank",
    stateWords: { draft: "draft", checked: "checked", signed: "signed", exported: "exported" },
    none: "No records are counted in this number.",
    other:
      "{n} quality-control, EQA or stock records are counted here; they are on the Quality and Stock pages.",
  },
  downloads: {
    title: "Downloads and prints",
    note: "Everything this place gives you to download or print, for the period chosen above.",
    indicatorsCsv: "Indicators, CSV",
    indicatorsCsvDetail:
      "Every number on Indicators for {period}, with the as-of time. No records, no patients.",
    hmisCsv: "HMIS 105, CSV",
    hmisCsvDetail: "{month}, revision {rev}. Downloading a signed report records it as exported.",
    hmisCsvLead: "The laboratory lead downloads the HMIS 105 CSV.",
    hmisPrint: "HMIS 105, printed form",
    hmisPrintDetail: "{month}, revision {rev}, A4 landscape.",
    hmisNone: "HMIS 105 for {month} is not counted yet, so there is nothing to download or print.",
    registerPrint: "Daily register, print",
    registerPrintDetail:
      "Open the register for one section and one day; printing records a print event first.",
    open: "Open",
  },
  records: {
    back: "Back to {place}",
  },
} as const;
