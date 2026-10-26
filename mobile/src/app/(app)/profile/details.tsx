import type { DetailsForm, OnFile, Section } from "@/data/profile-details";
import type { HospitalOption } from "@/lib/booking";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  FieldLabel,
  Icon,
  Note,
  PhoneField,
  Press,
  Screen,
  TextField,
  TextLink,
} from "@/components/tide";
import { initials, metaName } from "@/data/me";
import {
  DETAILS_OFF,
  detailsBody,
  detailsFromAppOn,
  formFrom,
  ID_TYPES,
  LANGUAGES,
  loadDetails,
  RELATIONSHIPS,
  saveDetails,
  TITLES,
} from "@/data/profile-details";
import {
  AVATAR_PICKER_OPTIONS,
  choosePrimaryHospital,
  fetchHospitals,
  fetchMyAvatarUrl,
  fetchPatientProfile,
  uploadAvatar,
} from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type Errors = Partial<Record<Section | "form", string>>;

/**
 * "A few more details": the six things sign-up leaves for later. Opened once
 * right after sign-up (`?welcome=1`, from Home) and from Me. Every section is
 * optional. Photo and hospital save the moment they are picked (RLS, straight
 * from the phone); title, language, ID and next of kin save together through
 * the web route, which holds the encryption key and never sends the ID or the
 * next of kin back. Errors are plain words in a neutral note, never red.
 */
export default function ProfileDetailsScreen() {
  const t = useTide();
  const router = useRouter();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const isWelcome = welcome === "1";
  const { session } = useSession();
  const name = metaName(session?.user.user_metadata);

  const [attempt, setAttempt] = useState(0);
  const [onFile, setOnFile] = useState<OnFile | null>(null);
  const [form, setForm] = useState<DetailsForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nokEditing, setNokEditing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    if (!detailsFromAppOn) return;
    let live = true;
    void loadDetails().then((r) => {
      if (!live) return;
      if (!r.ok) {
        setLoadError(r.message);
        return;
      }
      setLoadError(null);
      setOnFile(r.onFile);
      setForm(formFrom(r.onFile));
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const patch = (next: Partial<DetailsForm>) => setForm((f) => (f ? { ...f, ...next } : f));
  const body = onFile && form ? detailsBody(form, onFile) : {};
  const dirty = Object.keys(body).length > 0;

  const goHome = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setErrors({});
    const r = await saveDetails(body);
    if (!r.ok) {
      setSaving(false);
      setErrors({ form: r.message });
      return;
    }
    setErrors(r.errors);
    const fresh = await loadDetails();
    setSaving(false);
    if (fresh.ok) {
      setOnFile(fresh.onFile);
      // What saved now shows from the file; what was refused stays typed so it can be fixed.
      setForm((f) => {
        const base = formFrom(fresh.onFile);
        if (!f) return base;
        return {
          ...base,
          ...(r.errors.title ? { title: f.title } : {}),
          ...(r.errors.language
            ? { languageChoice: f.languageChoice, languageOther: f.languageOther }
            : {}),
          ...(r.errors.id ? { idType: f.idType, idNumber: f.idNumber } : {}),
          ...(r.errors.nok
            ? { nokName: f.nokName, nokRelationship: f.nokRelationship, nokPhone: f.nokPhone }
            : {}),
        };
      });
      if (r.saved.includes("nok")) setNokEditing(false);
    }
    if (r.saved.length) setSavedOnce(true);
  };

  const ready = onFile !== null && form !== null;
  const savedLine =
    savedOnce && !dirty ? (
      <View
        key="saved"
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[1.5],
          alignSelf: "center",
        }}
      >
        <Icon name="check" size={16} color={t.accentText} strokeWidth={2.8} />
        <Text style={[tType.labelS, { color: t.accentText }]}>Saved</Text>
      </View>
    ) : null;

  const footer = !ready ? (
    isWelcome ? (
      <Button label="Go to my home" onPress={goHome} />
    ) : null
  ) : (
    <>
      {savedLine}
      {isWelcome && savedOnce && !dirty ? (
        <Button label="Go to my home" onPress={goHome} />
      ) : (
        <Button label="Save" onPress={() => void save()} disabled={!dirty} busy={saving} />
      )}
    </>
  );

  return (
    <Screen
      back={isWelcome ? { label: "Skip for now", onPress: goHome } : { label: "Me" }}
      helpSource="profile-details"
      title="A few more details"
      subtitle="All optional. Your hospital uses these to find your records and reach someone for you."
      footer={footer}
      gap={tSpace[3]}
    >
      <PhotoSection key="photo" name={name} />

      {ready ? (
        <Part key="title" title="Title" added={onFile.titleCode !== null} error={errors.title}>
          <ChipRow>
            {TITLES.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                size="sm"
                selected={form.title === o.key}
                onPress={() => patch({ title: o.key })}
              />
            ))}
          </ChipRow>
        </Part>
      ) : null}

      {ready ? (
        <Part
          key="language"
          title="Preferred language"
          added={!!onFile.preferredLanguage}
          error={errors.language}
        >
          <ChipRow>
            {[...LANGUAGES, "Other"].map((l) => (
              <Chip
                key={l}
                label={l}
                size="sm"
                selected={form.languageChoice === l}
                onPress={() => patch({ languageChoice: form.languageChoice === l ? null : l })}
              />
            ))}
          </ChipRow>
          {form.languageChoice === "Other" ? (
            <TextField
              label="Your language"
              value={form.languageOther}
              onChangeText={(languageOther) => patch({ languageOther })}
              maxLength={40}
            />
          ) : null}
        </Part>
      ) : null}

      <HospitalSection key="hospital" />

      {ready ? (
        <Part key="id" title="National ID" added={onFile.idOnFile} error={errors.id}>
          {onFile.idOnFile ? (
            <Text style={[tType.bodyS, { color: t.ink2 }]}>
              {`${ID_TYPES.find((o) => o.key === onFile.idType)?.label ?? "An ID"} on file. To change it, contact support.`}
            </Text>
          ) : (
            <>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                Once added, only support can change it.
              </Text>
              <ChipRow>
                {ID_TYPES.map((o) => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    size="sm"
                    selected={form.idType === o.key}
                    onPress={() => patch({ idType: o.key })}
                  />
                ))}
              </ChipRow>
              <TextField
                label="Number, as printed"
                value={form.idNumber}
                onChangeText={(idNumber) => patch({ idNumber })}
                maxLength={40}
                autoComplete="off"
                inputProps={{ autoCapitalize: "characters", autoCorrect: false }}
              />
            </>
          )}
        </Part>
      ) : null}

      {ready ? (
        <Part
          key="nok"
          title="Next of kin"
          added={onFile.nokOnFile}
          addedWords={
            onFile.nokOnFile && onFile.relationship
              ? `Added · ${RELATIONSHIPS.find((o) => o.key === onFile.relationship)?.label ?? ""}`
              : undefined
          }
          error={errors.nok}
        >
          {onFile.nokOnFile && !nokEditing ? (
            <>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                Their name and number are kept safe and not shown here.
              </Text>
              <TextLink label="Replace" onPress={() => setNokEditing(true)} />
            </>
          ) : (
            <>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                Someone your hospital can call for you. Add a name and a phone, or leave both empty.
              </Text>
              <TextField
                label="Their name"
                value={form.nokName}
                onChangeText={(nokName) => patch({ nokName })}
                maxLength={120}
                autoComplete="name"
              />
              <FieldLabel optional>Relationship</FieldLabel>
              <ChipRow>
                {RELATIONSHIPS.map((o) => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    size="sm"
                    selected={form.nokRelationship === o.key}
                    onPress={() =>
                      patch({ nokRelationship: form.nokRelationship === o.key ? null : o.key })
                    }
                  />
                ))}
              </ChipRow>
              <PhoneField
                label="Their phone"
                value={form.nokPhone}
                onChangeText={(nokPhone) => patch({ nokPhone })}
              />
              {nokEditing ? (
                <TextLink
                  label="Keep the one on file"
                  onPress={() => {
                    setNokEditing(false);
                    patch({ nokName: "", nokPhone: "", nokRelationship: onFile.relationship });
                  }}
                />
              ) : null}
            </>
          )}
        </Part>
      ) : null}

      {!detailsFromAppOn ? (
        <Note key="off" tone="plain">
          {DETAILS_OFF}
        </Note>
      ) : !ready ? (
        loadError ? (
          <View key="failed" style={{ gap: tSpace[2], alignItems: "flex-start" }}>
            <Note tone="plain" icon="alert" style={{ alignSelf: "stretch" }}>
              {`${loadError} Your title, language, ID and next of kin will show here.`}
            </Note>
            <Button
              label="Try again"
              variant="outline"
              size="sm"
              onPress={() => {
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        ) : (
          <View
            key="loading"
            style={{ flexDirection: "row", gap: tSpace[2], alignItems: "center" }}
          >
            <ActivityIndicator color={t.ink2} />
            <Text style={[tType.bodyM, { color: t.ink2 }]}>Loading your details…</Text>
          </View>
        )
      ) : null}

      {errors.form ? (
        <Note key="form" tone="plain" icon="alert">
          {errors.form}
        </Note>
      ) : null}
    </Screen>
  );
}

/** One quiet card: a heading, an "Added" mark with a check (words, not colour alone), the inputs. */
function Part({
  title,
  added,
  addedWords,
  error,
  children,
}: {
  title: string;
  added: boolean;
  addedWords?: string;
  error?: string;
  children: ReactNode;
}) {
  const t = useTide();
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tSpace[2],
        }}
      >
        <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
          {title}
        </Text>
        {added ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}>
            <Icon name="check" size={14} color={t.accentText} strokeWidth={2.8} />
            <Text style={[tType.caption, { color: t.accentText }]}>{addedWords ?? "Added"}</Text>
          </View>
        ) : null}
      </View>
      {children}
      {error ? (
        <Note tone="plain" icon="alert">
          {error}
        </Note>
      ) : null}
    </Card>
  );
}

/** The photo, as Me changes it: the picker's square crop, saved the moment it is picked. */
function PhotoSection({ name }: { name: string | null }) {
  const t = useTide();
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMyAvatarUrl().then(
      (u) => live && setUrl(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const pick = async () => {
    if (uploading) return;
    setError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync(AVATAR_PICKER_OPTIONS);
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      setUploading(true);
      setUrl(await uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your photo. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Part title="Photo" added={url !== null} error={error ?? undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
        {url ? (
          <Image
            source={{ uri: url }}
            accessibilityLabel="Your photo"
            accessibilityIgnoresInvertColors
            style={{ width: 56, height: 56, borderRadius: 28 }}
          />
        ) : (
          <Avatar initials={initials(name)} size={56} />
        )}
        <View style={{ flex: 1, gap: tSpace[1] }}>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            Helps staff know it is you at the desk.
          </Text>
          <TextLink
            label={uploading ? "Saving…" : url ? "Change" : "Add a photo"}
            onPress={() => void pick()}
          />
        </View>
      </View>
    </Part>
  );
}

/** The usual hospital: the same write as the doors' picker, saved the moment one is tapped. */
function HospitalSection() {
  const t = useTide();
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<HospitalOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPatientProfile().then(
      (p) => live && setCurrent(p?.hospitalName ?? null),
      () => live && setCurrent(null),
    );
    return () => {
      live = false;
    };
  }, []);

  const openList = () => {
    setOpen(true);
    setError(null);
    if (list) return;
    fetchHospitals().then(setList, () => {
      setOpen(false);
      setError("Couldn't load the hospitals. Check your connection.");
    });
  };

  const choose = async (h: HospitalOption) => {
    setBusy(h.id);
    setError(null);
    try {
      await choosePrimaryHospital(h.id);
      setCurrent(h.name);
      setOpen(false);
    } catch {
      setError("Couldn't save your hospital. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Part title="Usual hospital" added={!!current} error={error ?? undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
        <Text style={[tType.bodyM, { flex: 1, color: current ? t.ink : t.ink2 }]}>
          {current === undefined ? "Loading…" : (current ?? "Not chosen yet")}
        </Text>
        {current !== undefined && !open ? (
          <TextLink label={current ? "Change" : "Choose"} onPress={openList} />
        ) : null}
      </View>
      {open ? (
        list === null ? (
          <ActivityIndicator color={t.ink2} accessibilityLabel="Loading the hospitals" />
        ) : list.length === 0 ? (
          <Note tone="plain">No hospital is on MedSync yet.</Note>
        ) : (
          list.map((h) => (
            <Press
              key={h.id}
              onPress={() => void choose(h)}
              disabled={busy !== null}
              accessibilityLabel={`Choose ${h.name}`}
              style={{
                minHeight: 52,
                padding: tSpace[3],
                borderRadius: tRadius.row,
                gap: 2,
                backgroundColor: t.surface2,
                opacity: busy !== null && busy !== h.id ? 0.5 : 1,
              }}
            >
              <Text style={[tType.labelS, { color: t.ink }]}>{h.name}</Text>
              {h.district ? (
                <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                  {h.district}
                </Text>
              ) : null}
            </Press>
          ))
        )
      ) : null}
    </Part>
  );
}
