import type { MatchLevel } from "@/types";

/**
 * The match levels of the medicine check, strictest first: the same active composition, the kit medicine contains all
 * active substances of the checked one, or they share at least one. Each level finds everything the stricter ones do.
 */
export const MATCH_LEVELS = ["exact", "all", "any"] as const satisfies readonly MatchLevel[];

/** The level of a check that does not name one; "all" would already change the answer for 36% of single-substance medicines. */
export const DEFAULT_MATCH_LEVEL: MatchLevel = "exact";

export function isMatchLevel(value: unknown): value is MatchLevel {
  return typeof value === "string" && (MATCH_LEVELS as readonly string[]).includes(value);
}

/** What the screen says on each level. */
export interface MatchLevelTexts {
  /** The label of the level in the switch. */
  label: string;
  /** The verdict title when only kit items of a matching composition are found. */
  substanceTitle: string;
  /** The line under "Nie masz tego leku" when the checked medicine could be compared. */
  noneDetail: string;
  /** The heading of the matching-composition items listed under the medicine itself. */
  alsoHeading: string;
  /** The consult-a-pharmacist notice shown with matching-composition items. */
  caution: string;
}

const LOOSE_CAUTION = "Te leki mogą mieć inny skład. Nie zamieniaj ich bez porady farmaceuty lub lekarza.";

export const MATCH_LEVEL_TEXTS: Record<MatchLevel, MatchLevelTexts> = {
  exact: {
    label: "Ten sam skład",
    substanceTitle: "Masz lek z tą samą substancją czynną",
    noneDetail: "Ani leku z tą samą substancją czynną",
    alsoHeading: "Także z tą samą substancją czynną",
    caution: "Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.",
  },
  all: {
    label: "Zawiera wszystkie składniki",
    substanceTitle: "Masz lek zawierający składniki tego leku",
    noneDetail: "Ani leku zawierającego jego składniki",
    alsoHeading: "Także leki zawierające jego składniki",
    caution: LOOSE_CAUTION,
  },
  any: {
    label: "Zawiera którykolwiek składnik",
    substanceTitle: "Masz lek ze wspólnym składnikiem",
    noneDetail: "Ani leku z żadnym z jego składników",
    alsoHeading: "Także leki ze wspólnym składnikiem",
    caution: LOOSE_CAUTION,
  },
};
