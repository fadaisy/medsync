"use client";

import type { SavedReading, StartValues } from "@/lib/patient-web/readings";
import type { ReadingInput, ReadingKind, SugarContext } from "@patient-core/readings";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readingValueText, SUGAR_CONTEXT_WORDS, THRESHOLDS_NOTE } from "@patient-core/readings";
import {
  ActivityIcon,
  CameraIcon,
  ClockIcon,
  DropletIcon,
  HeartIcon,
  MicIcon,
  MoonIcon,
  ScaleIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
  UtensilsIcon,
} from "lucide-react";

import { READINGS_COPY as C } from "@/content/patient/readings";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { recentReadingsAction, saveReadingAction } from "@/lib/patient-web/reading-actions";
import {
  lastTimeLine,
  readingBand,
  readingInput,
  saveButton,
  startValues,
} from "@/lib/patient-web/readings";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Chip, ChipRow, Dialog, NumberField, Toast } from "./controls";
import { Button, ICON } from "./kit";
import { CheckBand, ChestPainRow, DangerInterrupt } from "./reading-check";

/**
 * Log a reading (phone reading-sheet.tsx and care/reading.tsx, F-05/F-15), one form for the full page and the
 * centred dialog. The numbers start from the patient's own last reading, or empty. The live check is
 * `checkReading` over the pending-CSO thresholds (L7). Only the patient sees it, so a dangerous number opens
 * the danger interrupt and chest pain goes to Help: no one else is alerted.
 */

const TILES: { kind: ReadingKind; Icon: typeof ActivityIcon }[] = [
  { kind: "bp", Icon: ActivityIcon },
  { kind: "sugar", Icon: DropletIcon },
  { kind: "weight", Icon: ScaleIcon },
  { kind: "pulse", Icon: HeartIcon },
];
const CONTEXT_ICONS: Record<SugarContext, typeof SunIcon> = {
  fasting: SunriseIcon,
  lunch: SunIcon,
  supper: SunsetIcon,
  after: UtensilsIcon,
  bedtime: MoonIcon,
  random: ClockIcon,
};
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

export function ReadingForm({
  initialKind = "bp",
  recent,
  sayIt = false,
  onSaved,
  onLeave,
}: {
  initialKind?: ReadingKind;
  /** The patient's own readings, newest first; null while loading. */
  recent: SavedReading[] | null;
  /** `patientFlag("sayIt")`; there is no server transcription route, so on it shows as not available yet. */
  sayIt?: boolean;
  /** After a calm save. Absent (the full page), the form shows its own toast. */
  onSaved?: (line: string) => void;
  /** Before leaving for Help or the danger interrupt (the dialog closes). */
  onLeave?: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ReadingKind>(initialKind);
  const [ctx, setCtx] = useState<SugarContext>("fasting");
  const [edited, setEdited] = useState<Partial<StartValues>>({});
  const [feel, setFeel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [photoLine, setPhotoLine] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readings = recent ?? [];
  // What the patient changed; anything untouched shows their last reading.
  const values: StartValues = { ...startValues(readings), ...edited };
  const input = readingInput(kind, values, ctx);
  const band = readingBand(input);
  const chestPain = feel.includes("chest");
  const save = saveButton(band.level, chestPain);
  const set = (key: keyof StartValues) => (v: string) => setEdited((s) => ({ ...s, [key]: v }));

  const pickFeel = (key: string) =>
    setFeel((f) => {
      if (key === "fine") return f.includes("fine") ? [] : ["fine"];
      const rest = f.filter((k) => k !== "fine");
      return rest.includes(key) ? rest.filter((k) => k !== key) : [...rest, key];
    });

  // The danger interrupt opens in place (W4: no reading in the address; no browser storage).
  const [danger, setDanger] = useState<ReadingInput | null>(null);

  const onSave = async () => {
    setProblem(null);
    const bpPulse = kind === "bp" && edited.pulse ? Number(edited.pulse) : null;
    const saving = band.level !== "empty" ? saveReadingAction(input, feel) : null;
    // A pulse given with blood pressure is its own reading, saved beside it.
    if (saving && bpPulse) void saveReadingAction({ kind: "pulse", value: bpPulse }, []);
    // Help never waits for the network.
    if (save.help) {
      if (chestPain || band.level !== "danger") {
        onLeave?.();
        router.push("/emergency");
      } else setDanger(input);
      return;
    }
    if (!saving) return;
    setBusy(true);
    try {
      const res = await saving;
      if (!res.ok) return setProblem(res.error);
      const watch = band.level === "watch" ? C.savedWatch : "";
      const line = C.savedToast
        .replace("{value}", readingValueText(input))
        .replace("{watch}", watch);
      setEdited({});
      setFeel([]);
      if (onSaved) onSaved(line);
      else {
        setToast(line);
        router.refresh();
      }
    } catch {
      setProblem(PATIENT_WEB_COPY.offline);
    } finally {
      setBusy(false);
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || kind === "pulse") return;
    setPhotoLine(null);
    setPhotoBusy(true);
    try {
      setPhotoLine(await readPhoto(kind, file, (found) => setEdited((s) => ({ ...s, ...found }))));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (danger)
    return (
      <div data-pw-light="">
        <DangerInterrupt input={danger} />
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div
        role="group"
        aria-label="Kind of reading"
        className="grid grid-cols-4 gap-2 max-[480px]:grid-cols-2"
      >
        {TILES.map(({ kind: k, Icon }) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setPhotoLine(null);
            }}
            className={cn(
              "rounded-pw-row flex min-h-16 flex-col items-center justify-center gap-1.5 px-2 py-3 text-[15px] font-semibold",
              "transition-[scale,background-color] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none",
              FOCUS,
              kind === k
                ? "bg-pw-act text-pw-on-act"
                : "bg-pw-surface text-pw-ink ring-pw-line hover:bg-pw-surface-3 ring-1 ring-inset",
            )}
          >
            <Icon className="size-5" {...ICON} />
            {C.tiles[k]}
          </button>
        ))}
      </div>

      {sayIt || kind !== "pulse" ? (
        <div className="flex flex-wrap gap-2">
          {sayIt ? (
            <Button tone="soft" size="m" disabledReason={PATIENT_WEB_COPY.notAvailable}>
              <MicIcon className="size-5" {...ICON} />
              {C.sayIt}
            </Button>
          ) : null}
          {kind !== "pulse" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => void onPhoto(e.target.files?.[0])}
              />
              <Button
                tone="soft"
                size="m"
                busy={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                <CameraIcon className="size-5" {...ICON} />
                {photoBusy ? C.photoBusy : C.photo}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {photoLine ? (
        <p aria-live="polite" className="text-pw-ink-2 text-[15px] font-medium">
          {photoLine}
        </p>
      ) : null}

      <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-4 p-5">
        <p className="text-pw-ink-2 text-[15px] font-medium">{C.prompts[kind]}</p>
        {kind === "bp" ? (
          <>
            <div className="grid gap-3 min-[761px]:grid-cols-2">
              <NumberField
                label={C.fields.top}
                unit="mmHg"
                value={values.top}
                onChange={set("top")}
                step={2}
                min={60}
                max={260}
              />
              <NumberField
                label={C.fields.bottom}
                unit="mmHg"
                value={values.bottom}
                onChange={set("bottom")}
                step={2}
                min={30}
                max={160}
              />
            </div>
            <NumberField
              label={C.fields.bpPulse}
              unit={C.pulseUnit}
              value={edited.pulse ?? ""}
              onChange={set("pulse")}
              min={20}
              max={250}
            />
          </>
        ) : (
          <NumberField
            label={C.fields[kind]}
            unit={kind === "pulse" ? C.pulseUnit : kind === "sugar" ? "mmol/L" : "kg"}
            value={values[kind]}
            onChange={set(kind)}
            step={kind === "sugar" ? 0.1 : kind === "weight" ? 0.5 : 1}
            decimals={kind === "pulse" ? 0 : 1}
            min={1}
            max={300}
          />
        )}
        <CheckBand level={band.level} text={band.text} selfCare={band.selfCare} />
        <p className="text-pw-ink-3 text-[13px] font-medium">
          {C.lastTime} {recent ? lastTimeLine(readings, kind, new Date()) : "…"}
        </p>
      </section>

      {kind === "sugar" ? (
        <ChipRow label={C.whenChecked}>
          <p className="w-full text-base font-semibold">{C.whenChecked}</p>
          {(Object.keys(SUGAR_CONTEXT_WORDS) as SugarContext[]).map((c) => {
            const Icon = CONTEXT_ICONS[c];
            return (
              <Chip key={c} selected={ctx === c} onClick={() => setCtx(c)}>
                <Icon className="size-[18px]" {...ICON} />
                {capital(SUGAR_CONTEXT_WORDS[c])}
              </Chip>
            );
          })}
        </ChipRow>
      ) : null}

      <div className="flex flex-col gap-3">
        <ChipRow label={C.howFeel}>
          <p className="w-full text-base font-semibold">
            {C.howFeel} <span className="text-pw-ink-3 font-medium">{C.optional}</span>
          </p>
          {C.feelings.map((f) => (
            <Chip key={f.key} selected={feel.includes(f.key)} onClick={() => pickFeel(f.key)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
        {chestPain ? <ChestPainRow /> : null}
      </div>

      {problem ? (
        <p role="alert" className="text-pw-ink text-center text-[15px] font-semibold">
          {problem}
        </p>
      ) : null}
      <Button
        tone={save.help ? "danger" : "primary"}
        busy={busy}
        disabledReason={save.disabled ? band.text : undefined}
        onClick={() => void onSave()}
        className="w-full"
      >
        {save.label}
      </Button>
      <p className="text-pw-ink-3 text-center text-[13px] font-medium">
        {PATIENT_WEB_COPY.whoSeesLog} {C.notAlerted} {THRESHOLDS_NOTE}
      </p>
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

/** The same form as a centred dialog, for the plus and Home. It loads the patient's readings when it opens. */
export function ReadingDialog({
  open,
  onOpenChange,
  initialKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: ReadingKind;
}) {
  const [recent, setRecent] = useState<SavedReading[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    recentReadingsAction()
      .then((r) => live && setRecent(r))
      .catch(() => live && setRecent([]));
    return () => {
      live = false;
    };
  }, [open]);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title={C.title} withHelp>
        {/* Remount per opening so the form starts fresh from the latest readings. */}
        {open ? (
          <ReadingForm
            key={recent ? "ready" : "loading"}
            initialKind={initialKind}
            recent={recent}
            onLeave={() => onOpenChange(false)}
            onSaved={(line) => {
              onOpenChange(false);
              setToast(line);
            }}
          />
        ) : null}
      </Dialog>
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}

/**
 * The photo door (phone data/reading-photo.ts): shrunk to 1024 px, sent to `/api/mobile/reading-photo` with
 * the patient's own access token, as the phone sends it. Nothing is stored; the numbers only fill the boxes.
 */
async function readPhoto(
  kind: Exclude<ReadingKind, "pulse">,
  file: File,
  fill: (v: Partial<StartValues>) => void,
): Promise<string> {
  let image: string;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? "";
  } catch {
    return C.photoNoRead;
  }
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return C.signInAgain;
  try {
    const res = await fetch("/api/mobile/reading-photo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kind, mime: "image/jpeg", image }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      top?: string;
      bottom?: string;
      pulse?: string;
      value?: string;
      error?: string;
    } | null;
    if (!res.ok || !body) return body?.error ?? C.photoNoRead;
    if (!body.ok) return C.photoNoRead;
    const found: Partial<StartValues> =
      kind === "bp"
        ? {
            ...(body.top ? { top: body.top } : {}),
            ...(body.bottom ? { bottom: body.bottom } : {}),
            ...(body.pulse ? { pulse: body.pulse } : {}),
          }
        : body.value
          ? { [kind]: body.value }
          : {};
    if (!Object.keys(found).length) return C.photoNoRead;
    fill(found);
    return C.photoFilled;
  } catch {
    return C.photoOffline;
  }
}
