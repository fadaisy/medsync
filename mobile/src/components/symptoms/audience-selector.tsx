import type { Palette } from "@/theme/tokens";
import type { SubmissionAudience } from "@shared/symptom-catalog/types";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { StyleSheet, View } from "react-native";

import { Chip, ChipRow } from "@/components/ui/chip";
import { useStyles } from "@/theme/theme";
import { space } from "@/theme/tokens";

/** Who the symptoms are about, as the patient answers it (PRD §6.1). */
export interface AudienceChoice {
  who: "me" | "child" | "other";
  band: "child_u2m" | "child_2m_5y" | "child_5_12";
  pregnant: boolean;
}

export const DEFAULT_AUDIENCE: AudienceChoice = { who: "me", band: "child_2m_5y", pregnant: false };

/** The catalog audience the choice resolves to — what `classify` and the server see. */
export function toAudience(choice: AudienceChoice): SubmissionAudience {
  if (choice.who === "child") return choice.band;
  return choice.pregnant ? "pregnant" : "adult";
}

const BANDS: AudienceChoice["band"][] = ["child_u2m", "child_2m_5y", "child_5_12"];

/** The inverse, for a screen that comes back to S1 with a selection in hand. "Someone else" is not recoverable and reads as "Me". */
export function fromAudience(audience: SubmissionAudience, pregnant: boolean): AudienceChoice {
  if (audience === "adult" || audience === "pregnant") {
    return { ...DEFAULT_AUDIENCE, pregnant: pregnant || audience === "pregnant" };
  }
  return { ...DEFAULT_AUDIENCE, who: "child", band: audience };
}

/**
 * The top row: Me · A child · Someone else, as radio chips. A child opens
 * the age bands; an adult sees the pregnancy toggle only when it can apply
 * (`showPregnancy`: the profile's sex is female or unknown, or it is someone
 * else). One row each, no carousel.
 */
export function AudienceSelector({
  value,
  onChange,
  showPregnancy,
}: {
  value: AudienceChoice;
  onChange: (next: AudienceChoice) => void;
  showPregnancy: boolean;
}) {
  const styles = useStyles(makeStyles);
  const pregnancyApplies = value.who === "other" || (value.who === "me" && showPregnancy);
  return (
    <View style={styles.block}>
      <ChipRow>
        <Chip
          label="Me"
          selected={value.who === "me"}
          onPress={() => onChange({ ...value, who: "me" })}
        />
        <Chip
          label="A child"
          selected={value.who === "child"}
          onPress={() => onChange({ ...value, who: "child" })}
        />
        <Chip
          label="Someone else"
          selected={value.who === "other"}
          onPress={() => onChange({ ...value, who: "other" })}
        />
      </ChipRow>
      {value.who === "child" ? (
        <ChipRow>
          {BANDS.map((band) => (
            <Chip
              key={band}
              label={t(CATALOG, `audience.${band}`)}
              selected={value.band === band}
              onPress={() => onChange({ ...value, band })}
            />
          ))}
        </ChipRow>
      ) : null}
      {pregnancyApplies ? (
        <ChipRow>
          <Chip
            role="button"
            label={t(CATALOG, "audience.pregnant")}
            selected={value.pregnant}
            onPress={() => onChange({ ...value, pregnant: !value.pregnant })}
          />
        </ChipRow>
      ) : null}
    </View>
  );
}

const makeStyles = (_c: Palette) => StyleSheet.create({ block: { gap: space[2] } });
