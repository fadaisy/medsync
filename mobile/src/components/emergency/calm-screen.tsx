import type { SheetContact } from "@/lib/emergency";
import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";

import { Button, Note, Screen } from "@/components/tide";
import { emergencyEvent, telUrl } from "@/lib/emergency";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * The two special routes (PRD §5.5): self-harm and sexual violence. Calm
 * on purpose — NO red, no alarm haptic, no questionnaire, no motion. The
 * words are the screen; the contacts are whatever is verified for the
 * route's kind (nothing national is at ship — ADR 0098 ruling 8 — so the
 * hospital's own line stands in until they are sourced). Permanently light
 * (Law 3). Drawn in Tide without the header's red Help disc (`help="none"`):
 * no red here is the rule, and the screen's contacts are the help.
 */
export function CalmScreen({
  title,
  lead,
  body,
  contacts,
  fallback,
  children,
  onBack,
}: {
  title: string;
  lead: string;
  body?: string;
  /** The route's contacts (`crisis` / `sv`) first, then the general line — verified only. */
  contacts: SheetContact[];
  /** The line shown when there is nothing to dial. */
  fallback: string;
  children?: ReactNode;
  onBack: () => void;
}) {
  return (
    <ForcedScheme scheme="light">
      <CalmBody
        title={title}
        lead={lead}
        body={body}
        contacts={contacts}
        fallback={fallback}
        onBack={onBack}
      >
        {children}
      </CalmBody>
    </ForcedScheme>
  );
}

function CalmBody({
  title,
  lead,
  body,
  contacts,
  fallback,
  children,
  onBack,
}: {
  title: string;
  lead: string;
  body?: string;
  contacts: SheetContact[];
  fallback: string;
  children?: ReactNode;
  onBack: () => void;
}) {
  const t = useTide();
  const call = (c: SheetContact) => {
    emergencyEvent("call_tapped", { contact_id: c.id });
    Linking.openURL(telUrl(c.number)).catch(() => {});
  };
  return (
    <Screen title={title} back={{ onPress: onBack }} help="none" stagger={false} gap={tSpace[5]}>
      <Text style={[tType.section, { color: t.ink }]}>{lead}</Text>
      {body ? <Text style={[tType.body, { color: t.ink }]}>{body}</Text> : null}

      {contacts.length ? (
        <View style={{ gap: tSpace[4] }}>
          {contacts.map((c) => (
            <View key={c.id} style={{ gap: tSpace[2] }}>
              <Text style={[tType.labelS, { color: t.ink }]}>{c.label}</Text>
              <Button
                variant="outline"
                icon="phone"
                label={`Call ${c.number}`}
                accessibilityLabel={`Call ${c.label}, ${c.number}`}
                onPress={() => call(c)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Note tone="plain" icon={null}>
          {fallback}
        </Note>
      )}

      {children}
    </Screen>
  );
}
