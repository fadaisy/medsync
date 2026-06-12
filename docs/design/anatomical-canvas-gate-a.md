# Anatomical Canvas — GATE A: assets, theme, mapping & feasibility (for sign-off)

> **Status:** GATE A deliverable — plan + feasibility for review. **No code built.** Path A only (2D illustrated, themeable body map + SVG hotspots driving the _existing_ exam capture). Path C (live 3D) reserved for hub kiosks/desktop later.
> **Sign-off needed:** **Fadhul (CSO)** — visual direction + anatomical-accuracy plan; **legal** — attribution / ShareAlike note (§7). Build (GATE B) does not start until this is signed.

---

## 1. The one-line shape

The Anatomical Canvas is a **new VIEW, not a new data model.** It is a themeable, full-body illustrated map with an SVG hotspot/pin layer where tapping a region/zone/organ/pin **opens or cycles the exact capture control that already exists** for that finding. It writes to the **same per-exam state object the grid/list already uses** — so a finding set on the canvas _is the same record_ as in the grid, and vice-versa. It never adds a clinical field, value-set, or store. It degrades to the grid/list on low-end devices.

---

## 2. What the investigation found (the facts this plan rests on)

### 2a. Dark theme — ALREADY COMPLETE (no infra work)

The kickoff scopes "extend the design system with a dark theme." **This already exists and ships today:**

- `app/providers.tsx` — `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `storageKey="medsync-theme"`, `disableTransitionOnChange`).
- `components/theme-toggle.tsx` — working light/dark toggle (Sun/Moon crossfade), system-aware on first paint.
- `app/globals.css` — full light `:root` + `.dark` token blocks; `@custom-variant dark`; semantic tokens (`--background`, `--foreground`, `--card`, `--border`, teal scale, `--destructive`), shadows, and easing/duration variables. **`--ease-expo-out: cubic-bezier(0.16, 1, 0.3, 1)`** is exactly the easing the kickoff names. Clinical-red is **`#DC2626`**; teal anchor remaps teal-600 (light) → teal-500 (dark).
- `DESIGN-medsync.md` documents the dark theme (ADR-0003 superseded ADR-0002 "no dark mode").
- ~168 `dark:` usages across components — the system is already dark-aware.

➡️ **Canvas dark-theme scope = use existing tokens + verify dark contrast on the new art/overlays.** No token system to build. The `.medsync-forced-dark` utility is available for any always-dark overlay band.

### 2b. The "write-through QC sync" dependency — NOT BUILT (reframed below)

The kickoff repeatedly says the canvas "writes through the shared-parameter QC sync (one record, many views)." **That sync layer does not exist in code.** Only the audit artifacts exist, on the unmerged `feat/exam-consistency-qc` branch (PR #119): `docs/clinical/examination-shared-parameter-registry.md` + draft `docs/adr/0073-examination-shared-parameter-qc.md`. On `main`, each system exam owns an **independent** state object in `clerkship-form.tsx` (`examGeneral`/`examCardiovascular`/`examRespiratory`/`examAbdominal`/`examNeurological`/`examMusculoskeletal`/`examEndoVascularFoot`); there is **no** cross-exam reconciliation, and contradictions (e.g. GCS 15 in General vs 8 in CNS) are not detected.

➡️ **Reframe (and this is fine):** "one record, many views" is satisfied **per exam today** — the canvas and the grid are two views of the _same_ `examAbdominal` (etc.) object, because the canvas calls the _same_ `onChange`. The **cross-exam** shared-parameter sync (GCS, BP, pulses-by-side, lymph-node groups shared across systems) is a **separate, currently-unbuilt layer**. When it lands, the canvas inherits it for free (both views already route through one state). **This plan does NOT depend on the QC sync being built first** — see §5.

### 2c. Persistence / audit — inherited unchanged

A canvas tap → `onChange(nextExam)` → parent state → `buildClerkshipInput` → `ClerkshipInputSchema` (zod) → `clerkshipInputToClerkship` → `recordClerkshipVersion()` → `clinical_documentation` (append-only, versioned, cadre-stamped, JSONB `section_data`). The canvas writes to the same state, so **versioning / append-only / audit are inherited with zero change**.

### 2d. The spatial captures already exist (the canvas routes to them)

All three are shipped (Examination UI rework, PR #120), with clean interfaces:

| Component       | File                  | Reads/writes           | Handler surface                                                                                    |
| --------------- | --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `AbdoRegionMap` | `abdo-region-map.tsx` | `AbdoExam` (9 regions) | `modality: "tenderness"\|"guarding"`, `onCycle(region)`                                            |
| `ChestZoneMap`  | `chest-zone-map.tsx`  | `RespExam` (6 zones)   | `modality: percussion\|breathSounds\|vocalResonance\|added`, `onCycle(zone)`, `onSelectZone(zone)` |
| `LimbFigure`    | `limb-figure.tsx`     | `NeuroExam` (4 limbs)  | `cyclePower(limb)`, `setLimb(key,limb,v)`, `setPlantar(side,p)`                                    |

Today these live **inside** their system cards (a per-system tab switcher in `clerkship-form.tsx` step 3). **No full-body view exists yet.** No body-map/anatomy/attributions component exists anywhere.

### 2e. Performance / offline reality

**No PWA / service worker / offline cache** exists; `public/` holds only a few founder JPEGs; the shipped maps are **procedural inline SVG** (no network fetch). ➡️ The genuinely offline-true, themeable, tiny, IP-clean path is **bundled/inline vector art**, not network-fetched images. A true offline app-shell (service worker) is a _separate_ effort, out of scope here.

---

## 3. Region / zone / organ / pin → existing-capture mapping

Every interactive element routes to an existing capture. **Nothing new is captured.**

| Canvas element                                         | Routes to (existing)                                              | Mechanism                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Abdomen 9 regions                                      | `AbdoExam` tenderness/guarding                                    | `AbdoRegionMap.onCycle(region)`                         |
| Abdomen organ pins (liver/spleen/kidney/aorta/bladder) | existing structured-organ capture                                 | opens the organ control in `abdominal-exam.tsx`         |
| Chest zones (ant/post × upper/mid/lower × L/R)         | `RespExam` percussion/breath/VR/added                             | `ChestZoneMap.onCycle(zone)`/`onSelectZone(zone)`       |
| Limbs (R/L arm, R/L leg)                               | `NeuroExam` power/tone/reflex/plantar                             | `LimbFigure.cyclePower`/`setLimb`/`setPlantar`          |
| CVS landmark pins (apex, valve areas, JVP)             | existing CVS captures (incl. apex interspace/line, JVP height)    | opens the control in `cardiovascular-exam.tsx`          |
| Pulses-by-side, lymph-node groups                      | existing captures (CVS/general) — **shared-parameter candidates** | per-exam state now; cross-exam sync when QC layer lands |
| General organ/landmark findings                        | existing General captures                                         | opens the control in `exam-sections.tsx`                |
| Diabetic-foot schematic + monofilament sites           | **pattern designed now, wired when the foot exam ships**          | future `evf` foot capture                               |

A **front/back + regional-zoom** toggle; each region/pin reflects captured state at a glance (**positive / negative / not-examined — honest**, using the shipped teal→amber ramp with clinical-red reserved).

---

## 4. Asset recommendation (free-first) — **decision needed at sign-off**

The kickoff prefers **Servier Medical Art (CC BY 4.0)**. The investigation surfaces a real, honest tradeoff against what already ships:

- **Option 1 — Refined procedural SVG body (RECOMMENDED to start).** Extend the exact approach already shipped (the abdo/chest/limb maps are procedural inline SVG): one stylised full-body outline, themeable via `currentColor`/tokens, **zero external dependency, zero attribution/ShareAlike, instant light+dark theming, smallest possible payload, truly offline, 100% our IP.** Lowest risk; visually consistent with what's live.
- **Option 2 — Servier Medical Art (CC BY 4.0) vector base.** Richer/more illustrative anatomy. **Adds:** an in-app **attributions screen**, **CSO anatomical-accuracy sign-off per region**, and bundling each asset as a themeable vector (transparent, tintable). No ShareAlike (CC BY only) → licence-clean. Heavier than Option 1.
- **Option 3 — Commissioned stylised body.** Full ownership + exact brand fit, no attribution strings. Cost + lead time. Only if neither above fits the look.

**Recommendation:** start GATE B on **Option 1** (consistent, free, offline, IP-clean), and **drop in Servier vector art (Option 2) for specific organ/detail pins** where illustrative richness clearly helps — with the attributions screen built and the CSO accuracy review in place. Avoid all paid/3D (BioDigital/Zygote/Visible Body) and **never** the Dribbble render. **This is the main thing for Fadhul to decide at sign-off.**

**Attributions plan (if any CC-BY asset is used):** a small in-app "Image credits" screen, e.g. _"Anatomical illustrations: Servier Medical Art (smart.servier.com), CC BY 4.0."_ Licence + attribution recorded per asset in-repo; licence re-verified at integration.

---

## 5. Write-through model (works today; QC-sync-ready)

- The canvas takes the **same `value`/`onChange` per-exam props** the grid uses and routes taps to the **same handlers** (`onCycle`/`setLimb`/etc.). Canvas + grid are two views of one state object → **"one record, many views" holds per exam now.**
- **No dependency on the unbuilt QC sync.** Cross-exam shared parameters (GCS, BP, pulses-by-side, lymph-node groups) remain per-exam until the QC layer (PR #119 → future GATE B+) ships; when it does, the canvas needs **no change** because both views already write through one state path.
- A user can flip canvas ↔ grid freely; state is identical either way.

## 6. Graceful fallback + accessibility (same mechanism)

- The canvas is an **enhancement layer.** On low-end devices / slow links / **asset-load failure**, it falls back to the **existing grid/list** (already shipped, already the accessible equivalent). Medicine is captured either way; the map never blocks capture.
- **WCAG 2.2 AA is guaranteed via the grid/list** (full keyboard + screen-reader, state announced) regardless of the canvas. The canvas is also keyboard/SR-navigable where feasible (focusable regions/pins, `aria-pressed`, state in labels — as the shipped maps already do), but the grid is the guarantee.
- **Performance budget (proposed, to hold at GATE D):** body art ≤ ~30 KB gzipped (procedural SVG is far smaller); no layout jank on a mid-range tablet; interactions on `--ease-expo-out`, all `prefers-reduced-motion`-safe (instant, no transform); no blocking the capture path; assets bundled (offline) — not lazily fetched.

## 7. For legal (carry from the asset evaluation)

1. **Attribution (CC BY):** Servier/OpenStax/CC-BY require credit → in-app attributions screen (cheap, standard).
2. **ShareAlike (CC BY-SA):** only relevant to **Path C** (Z-Anatomy/BodyParts3D 3D) — **not used in Path A.** If/when Path C, keep SA assets as separable, clearly-licensed files and confirm the copyleft boundary. **Path A with Servier (CC BY, no SA) is licence-clean.**
3. **Never** the Dribbble render or any unlicensed image.

## 8. Confirmations & flags

- ✅ **No new clinical data model.** No new fields, value-sets, or store. Canvas = view + interaction only; same records, same persistence, same audit.
- ✅ **Clinical-red reserved in both themes** (`#DC2626`); severity ramps teal→amber; **not-examined ≠ normal** stays visually honest light + dark.
- ✅ **Decision-support, never autonomous** — a tap records exactly what the clinician sets; never auto-confirms/auto-diagnoses.
- ⚠️ **QC cross-exam sync is unbuilt** (PR #119 unmerged) — the canvas does not need it; flagged so cross-system shared parameters are understood as per-exam until that layer ships.
- ⚠️ **Font discrepancy:** `DESIGN-medsync.md` names Neue Haas Grotesk, but the repo ships **Fraunces / Geist / Geist-Mono.** Follow the repo (as the Examination rework did).
- ⚠️ **No PWA/offline shell** — true offline relies on bundled/inline vector art (Option 1 or bundled Option 2), not network-fetched images. A service worker is a separate future effort.

## 9. Proposed build order after sign-off (unchanged from kickoff)

- **GATE B:** the reusable themeable body-map + SVG hotspot/pin component; wire **Abdomen** (9-region + organ pins) end-to-end via the existing capture; both themes; interactions; fallback to the abdominal grid; a11y via the grid. **Stop.**
- **GATE C:** roll out respiratory chest zones, neuro limbs, CVS/general organ + pulse + lymph pins; front/back/zoom; design the foot-map pattern. **Stop.**
- **GATE D:** theme/motion/fallback/a11y/perf passes; attributions screen live; clinical-content-parity audit; ADR; CHANGELOG. **Stop for review.**
