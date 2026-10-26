"use client";

import { useState } from "react";
import { useTheme } from "next-themes";

import {
  Chip,
  ChipRow,
  Dialog,
  NumberField,
  Segments,
  TextField,
  Toast,
} from "@/components/tide/controls";
import { Button, Card, SectionHead } from "@/components/tide/kit";

/** The gallery's interactive half: fields, chips, segments, the dialog, the toast, and the theme. */
export function GalleryControls() {
  const { theme, setTheme } = useTheme();
  const [seg, setSeg] = useState<"today" | "week">("today");
  const [chip, setChip] = useState("morning");
  const [num, setNum] = useState("120");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  return (
    <Card>
      <SectionHead title="Controls" />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5">
        <Segments
          label="Theme"
          value={(theme as "system" | "light" | "dark") ?? "system"}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <Segments
          label="Show"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "This week" },
          ]}
        />
        <ChipRow label="Time of day">
          {["morning", "midday", "evening", "night"].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
              {c[0]!.toUpperCase() + c.slice(1)}
            </Chip>
          ))}
        </ChipRow>
        <div className="grid gap-4 min-[761px]:grid-cols-3">
          <TextField label="Your name" placeholder="[First name]" />
          <TextField
            label="Phone"
            hint="We send codes here."
            error="Enter 9 digits after +256."
            defaultValue="70"
          />
          <NumberField label="Top number" unit="mmHg" value={num} onChange={setNum} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button tone="soft" onClick={() => setOpen(true)}>
            Open a dialog
          </Button>
          <Button tone="soft" onClick={() => setToast(true)}>
            Show a toast
          </Button>
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="A centred dialog"
        withHelp
        footer={
          <>
            <Button tone="outline" size="m" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button size="m" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <p>Focus is trapped here and returns to the button that opened it.</p>
      </Dialog>
      {toast ? (
        <Toast
          message="Saved · only you can see it"
          onUndo={() => setToast(false)}
          onClose={() => setToast(false)}
        />
      ) : null}
    </Card>
  );
}
