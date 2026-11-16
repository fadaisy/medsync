"use client";

import type { LayoutEditorData } from "@/lib/wards/data";

import { WardEditor } from "@/components/wards/editor/ward-editor";
import { WARDS } from "@/content/hospital-admin/wards";
import {
  discardLayoutDraft,
  publishLayout,
  saveLayoutDraft,
  saveWardFromLayout,
  startLayoutFromRegister,
} from "../actions";

const HUB = "/hospital-admin/departments";

const ACTIONS = {
  saveDraft: saveLayoutDraft,
  publish: publishLayout,
  startFromRegister: startLayoutFromRegister,
  discardDraft: discardLayoutDraft,
  saveWard: saveWardFromLayout,
};

const LINKS = {
  hub: HUB,
  wards: `${HUB}/wards`,
  crumbs: [{ label: WARDS.builder.crumb, href: `${HUB}/wards` }],
  layout: (id: string) => `${HUB}/wards/${id}/layout`,
  board: (id: string) => `${HUB}/wards/${id}/board`,
  newWard: `${HUB}/wards?new=1`,
};

/** The ward builder in the admin frame (phase 2 of ADR 0520): the same editor, filling the frame's page. */
export function LayoutEditorClient({ data }: { data: LayoutEditorData }) {
  return <WardEditor data={data} actions={ACTIONS} links={LINKS} fit="frame" />;
}
