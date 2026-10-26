import {
  Avatar,
  Band,
  Button,
  Card,
  EmptyState,
  IconDisc,
  Note,
  Pill,
  SectionHead,
  Skeleton,
  StatusPill,
} from "@/components/tide/kit";
import { PageHeader, PatientShell } from "@/components/tide/shell";
import { AddButton } from "../_components/add-dialog";
import { GalleryControls } from "./controls";

/**
 * The kit's harness page (§5.4, S1): every component and state, on fixtures (L1: the Demo data pill). Public
 * so the harness can render it without an account; it shows no patient data. Theme follows the app setting.
 */
export default function Gallery() {
  return (
    <PatientShell plus={<AddButton />} dosesDue={2} place={{ initials: "MH", name: "[Hospital]" }}>
      <PageHeader
        greeting
        overline="Kit"
        area="me"
        title="Good morning, [First name]"
        subtitle="Every component and state."
        demo
        unseen={3}
        avatar={{ initials: "FN", label: "[First name], your profile" }}
      />
      <PageHeader
        back={{ href: "/patient", label: "Home" }}
        overline="Visits"
        area="visits"
        title="A pushed page"
        unseen={0}
      />

      <Card>
        <SectionHead title="Buttons" />
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Button>Primary</Button>
          <Button tone="accent">Accent</Button>
          <Button tone="soft">Soft</Button>
          <Button tone="outline">Outline</Button>
          <Button tone="danger">Get help now</Button>
          <Button size="m">Medium</Button>
          <Button size="s" tone="soft">
            Small
          </Button>
          <Button busy>Saving</Button>
          <Button disabledReason="Choose a day first.">Book</Button>
        </div>
        <Band className="mt-4 flex flex-wrap gap-3">
          <Button tone="glass">Glass on navy</Button>
          <Button tone="onBand">On navy</Button>
        </Band>
      </Card>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-6 max-[1100px]:grid-cols-1">
        <Card>
          <SectionHead title="Pills and states" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>Plain</Pill>
            <Pill tone="info">Info</Pill>
            <Pill tone="place">[Hospital]</Pill>
            <Pill tone="accent">Now</Pill>
            <Pill tone="navy">Navy</Pill>
            <StatusPill tone="stable">In your target</StatusPill>
            <StatusPill tone="caution">Above your target</StatusPill>
            <StatusPill tone="critical">Danger</StatusPill>
            <StatusPill tone="pending">Waiting</StatusPill>
            <StatusPill tone="info">New</StatusPill>
          </div>
          <div className="mt-4 grid gap-3">
            <Note tone="info">An info note.</Note>
            <Note tone="caution">A caution note, always with words.</Note>
            <Note>A plain note.</Note>
            <Note tone="place">A place note.</Note>
          </div>
        </Card>
        <Card>
          <SectionHead title="Bits" />
          <div className="mt-4 flex items-center gap-3">
            <IconDisc>i</IconDisc>
            <IconDisc tone="accent">a</IconDisc>
            <Avatar initials="FN" label="[First name]" />
          </div>
          <div className="mt-4 grid gap-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
          <div className="mt-4">
            <EmptyState title="Nothing yet" body="When you log a reading it shows here." />
          </div>
        </Card>
      </div>

      <GalleryControls />
    </PatientShell>
  );
}
