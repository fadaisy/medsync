import type { NotifFilter, NotifGroup } from "@/data/notifications";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import {
  Button,
  Chip,
  ChipRow,
  Icon,
  IconDisc,
  Note,
  Press,
  Screen,
  TextLink,
} from "@/components/tide";
import { medicinesRepo } from "@/data/medicines";
import { GROUP_WORDS, notificationsRepo, useNotifications } from "@/data/notifications";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "care", label: "Care" },
  { key: "visit", label: "Visits" },
  { key: "med", label: "Medicines" },
];
const GROUPS: NotifGroup[] = ["today", "yesterday", "earlier"];

/**
 * Notifications (F-06): the messages MedSync sent this patient and the
 * medicines due now, grouped by day and filterable, each with the action it
 * asks for inside the row so "I took it" never needs another screen.
 */
export default function NotificationsScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const { items, unread, status } = useNotifications();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const shown = items.filter((n) => filter === "all" || n.type === filter);
  const canMarkAll = items.some((n) => n.unread && n.dispatchIds.length > 0);

  return (
    <Screen
      back={{ label: "Home" }}
      title="Notifications"
      subtitle={unread ? `${unread} new` : "All caught up"}
      headerRight={
        canMarkAll ? (
          <TextLink label="Mark all read" onPress={notificationsRepo.markAllRead} />
        ) : null
      }
    >
      <ChipRow scroll>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            size="sm"
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>

      {status === "loading" && items.length === 0 ? (
        <View style={{ paddingVertical: tSpace[6], alignItems: "center" }}>
          <ActivityIndicator color={t.ink3} accessibilityLabel="Loading" />
        </View>
      ) : null}
      {status === "error" ? (
        <View style={{ gap: tSpace[3] }}>
          <Note tone="plain">Couldn&apos;t load your messages. Try again.</Note>
          <Button
            label="Try again"
            variant="soft"
            size="md"
            icon="replay"
            onPress={notificationsRepo.reload}
          />
        </View>
      ) : null}
      {status === "ready" && shown.length === 0 ? (
        <Note tone="plain">
          {filter === "all"
            ? "Nothing here yet. Messages about your visits and medicines show here."
            : "Nothing here yet."}
        </Note>
      ) : null}

      {GROUPS.map((g) => {
        const rows = shown.filter((n) => n.group === g);
        if (rows.length === 0) return null;
        return (
          <View key={g} style={{ gap: tSpace[2] }}>
            <Text accessibilityRole="header" style={[tType.overline, { color: t.ink3 }]}>
              {GROUP_WORDS[g]}
            </Text>
            <View
              style={{
                borderRadius: tRadius.cardLg,
                backgroundColor: t.surface,
                boxShadow: t.shadow.card,
                overflow: "hidden",
              }}
            >
              {rows.map((n, i) => {
                const href = n.href;
                const action = n.action;
                const open = () => {
                  notificationsRepo.markRead(n);
                  if (href) router.push(href);
                };
                return (
                  <View
                    key={n.id}
                    style={{
                      flexDirection: "row",
                      gap: tSpace[3],
                      padding: tSpace[3.5],
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: t.line,
                    }}
                  >
                    <IconDisc name={n.icon} size={40} color={t.area[n.area]} bg={t.surface2} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Press
                        onPress={open}
                        haptic={false}
                        accessibilityRole={href ? "link" : "text"}
                        accessibilityLabel={`${n.unread ? "New. " : ""}${n.title}. ${n.line}. ${n.time}`}
                        style={{ gap: 2 }}
                      >
                        <View
                          style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}
                        >
                          {n.unread ? (
                            <View
                              accessibilityElementsHidden
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: t.accent,
                              }}
                            />
                          ) : null}
                          <Text
                            style={[
                              tType.label,
                              {
                                flex: 1,
                                fontFamily: n.unread ? tFont.bold : tFont.semibold,
                                color: t.ink,
                              },
                            ]}
                          >
                            {n.title}
                          </Text>
                          <Text
                            style={{ fontFamily: tFont.monoSemibold, fontSize: 12, color: t.ink3 }}
                          >
                            {n.time}
                          </Text>
                        </View>
                        <Text style={[tType.bodyS, { color: t.ink2 }]}>{n.line}</Text>
                      </Press>
                      {action?.kind === "takeDose" ? (
                        <Button
                          size="sm"
                          label="I took it"
                          icon="check"
                          style={{ alignSelf: "flex-start", marginTop: tSpace[1.5] }}
                          onPress={() => medicinesRepo.take(action.doseId, now)}
                        />
                      ) : null}
                      {action?.kind === "link" ? (
                        <Button
                          size="sm"
                          variant="soft"
                          label={action.label}
                          style={{ alignSelf: "flex-start", marginTop: tSpace[1.5] }}
                          onPress={() => {
                            notificationsRepo.markRead(n);
                            router.push(action.href);
                          }}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <Press
        onPress={() => router.push("/me")}
        accessibilityLabel="Choose what you get. App, SMS, or a voice call in Luganda or English."
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[3],
          padding: tSpace[3.5],
          borderRadius: tRadius.cardLg,
          backgroundColor: t.surface2,
        }}
      >
        <IconDisc name="settings" size={36} color={t.ink2} bg={t.surface} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.label, { color: t.ink }]}>Choose what you get</Text>
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
            App, SMS, or a voice call in Luganda or English
          </Text>
        </View>
        <Icon name="forward" size={20} color={t.ink3} />
      </Press>
    </Screen>
  );
}
