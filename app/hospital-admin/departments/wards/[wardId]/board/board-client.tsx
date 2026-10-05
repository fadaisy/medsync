"use client";

import type { BoardData } from "@/lib/wards/board";

import { BedBoard } from "@/components/wards/board/bed-board";
import {
  adminAllocateAdmissionBed,
  adminAssignBed,
  adminConfirmArrival,
  adminReleaseAdmissionBed,
  adminReleaseBed,
  adminSetBedState,
} from "../actions";

const HUB = "/hospital-admin/departments";

const ACTIONS = {
  setState: adminSetBedState,
  assign: adminAssignBed,
  release: adminReleaseBed,
  allocate: adminAllocateAdmissionBed,
  confirmArrival: adminConfirmArrival,
  releaseAdmission: adminReleaseAdmissionBed,
};
const LINKS = {
  crumbs: [
    { label: "Hospital admin", href: "/hospital-admin" },
    { label: "Departments & services", href: HUB },
    { label: "Wards", href: `${HUB}/wards` },
  ],
  board: (id: string) => `${HUB}/wards/${id}/board`,
  layout: (id: string) => `${HUB}/wards/${id}/layout`,
};

export function BoardClient({ data, hospitalId }: { data: BoardData; hospitalId: string }) {
  return <BedBoard data={data} hospitalId={hospitalId} mayAct actions={ACTIONS} links={LINKS} />;
}
