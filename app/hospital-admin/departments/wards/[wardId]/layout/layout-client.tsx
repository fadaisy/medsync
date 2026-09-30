"use client";

import type { LayoutEditorData } from "@/lib/wards/data";

import { WardEditor } from "@/components/wards/editor/ward-editor";
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
  layout: (id: string) => `${HUB}/wards/${id}/layout`,
  board: (id: string) => `${HUB}/wards/${id}/board`,
  newWard: `${HUB}/wards?new=1`,
};

export function LayoutEditorClient({ data }: { data: LayoutEditorData }) {
  return <WardEditor data={data} actions={ACTIONS} links={LINKS} />;
}
