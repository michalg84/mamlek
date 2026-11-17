// Tests of the public.medicine_check() rule on a real local database, on synthetic products and kits that are rolled
// back. Every answer also goes through the same guard and verdict function the screen uses, so a renamed field or an
// unexpected value between SQL and TypeScript fails here. The expected values come from the PRD (FR-011, FR-012),
// decisions D1-D3 of the medicine-check research and the author's decisions of 2026-10-13, not from running the code.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkVerdict, parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MedicineCheckResponse } from "@/types";
import { World, actAs, checkAs, connectLocal, expectSqlError, type KitRef } from "./medicine-check-fixtures";

type Match = "variant" | "substance";
type MatchedBy = "common_name" | "substances" | null;
type Kind = "variant" | "substance" | "none";
/** [kit item, match, matchedBy, withdrawn] */
type ExpectedItem = [KitRef, Match, MatchedBy, boolean];

interface RuleCase {
  name: string;
  user: string;
  searched: number;
  /** The matching kit items, in the order the rule must return them. */
  items: ExpectedItem[];
  comparable: boolean;
  kind: Kind;
}

const w = new World();
const UNKNOWN_PRODUCT = 9_000_000_999;

// --- The products of the 17 cases ported from the former database check script ------------------------------------

const sortis = w.product({
  name: "Sortis",
  strength: "20 mg",
  form: "tabletki powlekane",
  commonName: "Atorvastatinum",
  substances: ["Atorvastatinum calcicum trihydricum"],
});
// Same variant key in a different letter case (a parallel import).
const sortisParallel = w.product({
  name: "SORTIS",
  strength: "20 MG",
  form: "Tabletki powlekane",
  commonName: "Atorvastatinum",
  substances: ["Atorvastatinum calcicum trihydricum"],
});
// Same variant key, product withdrawn.
const sortisRemoved = w.product({
  name: "Sortis",
  strength: "20 mg",
  form: "tabletki powlekane",
  commonName: "Atorvastatinum",
  substances: ["Atorvastatinum calcicum trihydricum"],
  removed: true,
});
const sortisRemovedPackage = w.extraPackage(sortis, { removed: true });
// Same common name as Sortis, another salt in the substances.
const atoris = w.product({
  name: "Atoris",
  strength: "20 mg",
  form: "tabletki powlekane",
  commonName: "Atorvastatinum",
  substances: ["Atorvastatinum calcicum"],
});
const metafen = w.product({
  name: "Metafen",
  strength: "200 mg",
  form: "tabletki",
  commonName: "Ibuprofenum",
  substances: ["Ibuprofenum"],
});
// Another common name, the same substance as Metafen (written with stray spaces and in lower case).
const lizymax = w.product({
  name: "Lizymax",
  strength: "342 mg",
  form: "tabletki powlekane",
  commonName: "Ibuprofenum lysinum",
  substances: [" ibuprofenum "],
});
const smecta = w.product({
  name: "Smecta",
  strength: "3 g",
  form: "proszek do sporządzania zawiesiny doustnej",
  commonName: "Diosmectitum",
  substances: [],
});
const diosmectite = w.product({
  name: "Diosmectite Synthetic",
  strength: "3 g",
  form: "proszek",
  commonName: "Diosmectitum",
  substances: ["Diosmectitum"],
});
const afronis = w.product({
  name: "Afronis",
  strength: null,
  form: "tabletki do ssania",
  commonName: "Preparat złożony",
  substances: ["Mentholum", "Eucalypti aetheroleum"],
});
const aromaActiv = w.product({
  name: "Aroma-Activ",
  strength: null,
  form: "tabletki do ssania",
  commonName: "Preparat złożony",
  substances: ["Mentholum", "Pini aetheroleum"],
});
// Only the substance "Preparat złożony", generic common name.
const herbalA = w.product({
  name: "Herbal A",
  strength: null,
  form: "tabletki",
  commonName: "Produkt złożony",
  substances: ["Preparat złożony"],
});
const herbalB = w.product({
  name: "Herbal B",
  strength: null,
  form: "krople",
  commonName: "Produkt ziołowy",
  substances: ["Preparat złożony"],
});
const homeoA = w.product({
  name: "Homeo A",
  strength: null,
  form: "granulki",
  commonName: "Homeopatyczny produkt leczniczy",
  substances: [],
});
const homeoB = w.product({
  name: "Homeo B",
  strength: null,
  form: "krople",
  commonName: "Homeopatyczny produkt leczniczy",
  substances: [],
});
// "Preparat witaminowy": generic by its prefix, not on the list.
const vitaminA = w.product({
  name: "Vitamin A",
  strength: null,
  form: "proszek",
  commonName: "Preparat witaminowy",
  substances: ["Acidum ascorbicum"],
});
const vitaminB = w.product({
  name: "Vitamin B",
  strength: null,
  form: "proszek",
  commonName: "Preparat witaminowy",
  substances: ["Acidum folicum"],
});
const comboAB = w.product({
  name: "Combo AB",
  strength: "5 mg + 80 mg",
  form: "tabletki",
  commonName: "Amlodipinum + Valsartanum",
  substances: ["Amlodipini besilas", "Valsartanum"],
});
// The same parts in the other order and in another letter case, other substances.
const comboBA = w.product({
  name: "Combo BA",
  strength: "5 mg + 80 mg",
  form: "tabletki",
  commonName: "valsartanum  +  AMLODIPINUM",
  substances: ["Amlodipini maleas", "Valsartanum"],
});
const monoA = w.product({
  name: "Mono A",
  strength: "5 mg",
  form: "tabletki",
  commonName: "Amlodipinum",
  substances: ["Amlodipinum"],
});
// Same variant key as Afronis (no strength on both sides).
const afronisParallel = w.product({
  name: "AFRONIS",
  strength: null,
  form: "Tabletki do ssania",
  commonName: "Preparat złożony",
  substances: ["Mentholum"],
});

// --- Ported cases: one account each -------------------------------------------------------------------------------

const uSame = w.user();
const kSame = w.kitItem(uSame, sortis.packageId);
const uParallel = w.user();
const kParallel = w.kitItem(uParallel, sortisParallel.packageId);
const uWithdrawn = w.user();
const kRemovedPackage = w.kitItem(uWithdrawn, sortisRemovedPackage);
const kRemovedProduct = w.kitItem(uWithdrawn, sortisRemoved.packageId);
const uAtoris = w.user();
const kAtoris = w.kitItem(uAtoris, atoris.packageId);
const uLizymax = w.user();
const kLizymax = w.kitItem(uLizymax, lizymax.packageId);
const uDiosmectite = w.user();
const kDiosmectite = w.kitItem(uDiosmectite, diosmectite.packageId);
const uAromaActiv = w.user();
w.kitItem(uAromaActiv, aromaActiv.packageId);
const uHerbalB = w.user();
w.kitItem(uHerbalB, herbalB.packageId);
const uOtherMedicine = w.user();
w.kitItem(uOtherMedicine, atoris.packageId);
const uHomeoB = w.user();
w.kitItem(uHomeoB, homeoB.packageId);
const uVitaminB = w.user();
w.kitItem(uVitaminB, vitaminB.packageId);
const uComboBA = w.user();
const kComboBA = w.kitItem(uComboBA, comboBA.packageId);
const uComboAB = w.user();
w.kitItem(uComboAB, comboAB.packageId);
const uAfronisParallel = w.user();
const kAfronisParallel = w.kitItem(uAfronisParallel, afronisParallel.packageId);
const uEmptyKit = w.user();
const uOrder = w.user();
const kOrderNoDate = w.kitItem(uOrder, sortis.packageId);
const kOrderLater = w.kitItem(uOrder, sortis.packageId, { expiresOn: "2030-12-31", precision: "day" });
const kOrderExpired = w.kitItem(uOrder, sortis.packageId, { expiresOn: "2020-01-31", precision: "month" });
const kOrderSubstance = w.kitItem(uOrder, atoris.packageId, { expiresOn: "2019-06-30", precision: "month" });

// --- New cases: risk 1, "nie masz" for something that is in the kit -----------------------------------------------

// G1: a second active pack of the same product is still the same medicine.
const polopiryna = w.product({
  name: "Polopiryna S",
  strength: "300 mg",
  form: "tabletki dojelitowe",
  commonName: "Acidum acetylsalicylicum",
  substances: ["Acidum acetylsalicylicum"],
});
const polopirynaSecondPack = w.extraPackage(polopiryna);
const uG1 = w.user();
const kG1 = w.kitItem(uG1, polopirynaSecondPack);

// G2: the same brand in another strength is not the same medicine, but is the same substance.
const brandHigh = w.product({
  name: "Lipimed",
  strength: "40 mg",
  form: "tabletki powlekane",
  commonName: "Simvastatinum",
  substances: ["Simvastatinum"],
});
const brandLow = w.product({
  name: "Lipimed",
  strength: "10 mg",
  form: "tabletki powlekane",
  commonName: "Simvastatinum",
  substances: ["Simvastatinum"],
});
const uG2 = w.user();
const kG2 = w.kitItem(uG2, brandLow.packageId);

// G4: no strength on one side and a strength on the other is not the same variant.
const nospaNoStrength = w.product({
  name: "Spasmed",
  strength: null,
  form: "tabletki",
  commonName: "Drotaverinum",
  substances: ["Drotaverini hydrochloridum"],
});
const nospaStrength = w.product({
  name: "Spasmed",
  strength: "40 mg",
  form: "tabletki",
  commonName: "Drotaverinum",
  substances: ["Drotaverini hydrochloridum"],
});
const uG4 = w.user();
const kG4 = w.kitItem(uG4, nospaNoStrength.packageId);

// G5 (D3): a searched product withdrawn from the registry is still checked, and its pack is found.
const uG5 = w.user();
const kG5 = w.kitItem(uG5, sortis.packageId);

// G6: a withdrawn kit item matched by substance is marked withdrawn.
const ibuprofenOld = w.product({
  name: "Ibuprofen Vetus",
  strength: "200 mg",
  form: "tabletki",
  commonName: "Ibuprofenum vetus",
  substances: ["Ibuprofenum"],
  removed: true,
});
const uG6 = w.user();
const kG6 = w.kitItem(uG6, ibuprofenOld.packageId);

// G7: a generic common name on both sides, equal substance sets: matched by the substances.
const rhinoA = w.product({
  name: "Rhinopharm",
  strength: null,
  form: "kapsułki",
  commonName: "Preparat złożony",
  substances: ["Mentholum", "Eucalypti aetheroleum"],
});
const rhinoB = w.product({
  name: "Rhinopharm Plus",
  strength: null,
  form: "kapsułki",
  commonName: "Preparat złożony",
  substances: ["Mentholum", "Eucalypti aetheroleum"],
});
const uG7 = w.user();
const kG7 = w.kitItem(uG7, rhinoB.packageId);

// G9: the same substances listed in another order.
const orderA = w.product({
  name: "Inhalol",
  strength: null,
  form: "krople",
  commonName: "Mentholi compositum",
  substances: ["Mentholum", "Eucalypti aetheroleum"],
});
const orderB = w.product({
  name: "Eucamen",
  strength: null,
  form: "krople",
  commonName: "Eucalypti compositum",
  substances: ["Eucalypti aetheroleum", "Mentholum"],
});
const uG9 = w.user();
const kG9 = w.kitItem(uG9, orderB.packageId);

// G11: names that differ only in letter case, with Polish characters.
const zolcUpper = w.product({
  name: "ŻÓŁĆ Forte",
  strength: "10 mg",
  form: "tabletki",
  commonName: "Zolcum",
  substances: ["Zolcum"],
});
const zolcLower = w.product({
  name: "żółć forte",
  strength: "10 mg",
  form: "tabletki",
  commonName: "Zolcum",
  substances: ["Zolcum"],
});
const uG11 = w.user();
const kG11 = w.kitItem(uG11, zolcLower.packageId);

// --- New cases: risk 2, "ta sama substancja" for something that is not -------------------------------------------

// G14: a strict subset of the substances, spelled identically, never matches, in either direction.
const paracetamolOnly = w.product({
  name: "Paracetamol Solo",
  strength: "500 mg",
  form: "tabletki",
  commonName: "Paracetamolum",
  substances: ["Paracetamolum"],
});
const paracetamolCaffeine = w.product({
  name: "Paracetamol Plus",
  strength: "500 mg + 65 mg",
  form: "tabletki",
  commonName: "Paracetamolum cum coffeino",
  substances: ["Paracetamolum", "Coffeinum"],
});
const uG14Subset = w.user();
const kG14Subset = w.kitItem(uG14Subset, paracetamolOnly.packageId);
const uG14Superset = w.user();
const kG14Superset = w.kitItem(uG14Superset, paracetamolCaffeine.packageId);

// G15: a common name made of a real part and a placeholder is generic as a whole.
const mixedA = w.product({
  name: "Mixed A",
  strength: null,
  form: "tabletki",
  commonName: "Paracetamolum + Preparat złożony",
  substances: ["Paracetamolum"],
});
const mixedB = w.product({
  name: "Mixed B",
  strength: null,
  form: "tabletki",
  commonName: "Paracetamolum + Preparat złożony",
  substances: ["Coffeinum"],
});
const uG15 = w.user();
w.kitItem(uG15, mixedB.packageId);

// G16: a placeholder on one side only.
const realName = w.product({
  name: "Ketonal Solo",
  strength: "50 mg",
  form: "kapsułki",
  commonName: "Ketoprofenum",
  substances: ["Ketoprofenum"],
});
const placeholderName = w.product({
  name: "Ketonal Mix",
  strength: "50 mg",
  form: "kapsułki",
  commonName: "Preparat złożony",
  substances: ["Diclofenacum"],
});
const uG16 = w.user();
w.kitItem(uG16, placeholderName.packageId);

// G11 (placeholder): upper case with Polish characters is still a placeholder.
const shoutA = w.product({
  name: "Shout A",
  strength: null,
  form: "tabletki do ssania",
  commonName: "PREPARAT ZŁOŻONY",
  substances: ["Mentholum"],
});
const shoutB = w.product({
  name: "Shout B",
  strength: null,
  form: "tabletki do ssania",
  commonName: "PREPARAT ZŁOŻONY",
  substances: ["Pini aetheroleum"],
});
const uShout = w.user();
w.kitItem(uShout, shoutB.packageId);

// --- Author's decisions of 2026-10-13 -----------------------------------------------------------------------------

// G18 (D1): the same common name with unrelated substance sets is still a same-substance match.
const commonA = w.product({
  name: "Zorex A",
  strength: "5 mg",
  form: "tabletki",
  commonName: "Testosum",
  substances: ["Substantia prima"],
});
const commonB = w.product({
  name: "Zorex B",
  strength: "5 mg",
  form: "tabletki",
  commonName: "Testosum",
  substances: ["Substantia secunda"],
});
const uG18 = w.user();
const kG18 = w.kitItem(uG18, commonB.packageId);

// G19: both sets equal, so "common_name" wins as the reason.
const bothA = w.product({
  name: "Amlodipine X",
  strength: "5 mg",
  form: "tabletki",
  commonName: "Amlodipinum",
  substances: ["Amlodipini besilas"],
});
const bothB = w.product({
  name: "Amlodipine Y",
  strength: "5 mg",
  form: "tabletki",
  commonName: "Amlodipinum",
  substances: ["Amlodipini besilas"],
});
const uG19 = w.user();
const kG19 = w.kitItem(uG19, bothB.packageId);

// G8: another salt under another common name is not matched; accepted limitation of the cautious rule.
const saltA = w.product({
  name: "Salt A",
  strength: "40 mg",
  form: "tabletki",
  commonName: "Telmisartanum",
  substances: ["Telmisartanum"],
});
const saltB = w.product({
  name: "Salt B",
  strength: "40 mg",
  form: "tabletki",
  commonName: "Telmisartanum natricum",
  substances: ["Telmisartanum natricum"],
});
const uG8 = w.user();
w.kitItem(uG8, saltB.packageId);

// G22: the fields the screen reads carry the values inserted.
const shape = w.product({
  name: "Shapeform",
  strength: "10 mg",
  form: "kapsułki twarde",
  commonName: "Shapeum",
  substances: ["Zeta substantia", "Alfa substantia"],
  holder: "Shape Pharma Sp. z o.o.",
  units: [{ count: "2", kind: "blister", capacity: "15", capacity_unit: "tabl.", info: "po 15 szt." }],
});
const uShape = w.user();
const kShape = w.kitItem(uShape, shape.packageId, { quantity: 12 });

// --- Match levels (S-06, FR-016): exact = equal set, all = kit set contains the searched one, any = overlap ---------

// G14 on the looser levels: the substances only overlap with an unrelated common name, so only the substance path can
// match. The kit of uG14Superset holds paracetamol + caffeine (a superset of the searched paracetamol), the kit of
// uG14Subset holds paracetamol alone (a subset of the searched paracetamol + caffeine).
const paracetamolAscorbic = w.product({
  name: "Paracetamol C",
  strength: "500 mg + 200 mg",
  form: "tabletki",
  commonName: "Paracetamolum cum acido ascorbico",
  substances: ["Paracetamolum", "Acidum ascorbicum"],
});
// Overlap that is neither a subset nor a superset: paracetamol + vitamin C against paracetamol + caffeine.
const uOverlap = w.user();
const kOverlap = w.kitItem(uOverlap, paracetamolAscorbic.packageId);

// The common-name path on every level, with substances that share nothing.
const npsSearched = w.product({
  name: "Nomen Duo",
  strength: "1 mg",
  form: "tabletki",
  commonName: "Npsalfum + Npsbetum",
  substances: ["Substantia una"],
});
const npsSuperset = w.product({
  name: "Nomen Tres",
  strength: "1 mg",
  form: "tabletki",
  commonName: "Npsgammum + Npsbetum + Npsalfum",
  substances: ["Substantia duo"],
});
const npsSubset = w.product({
  name: "Nomen Unus",
  strength: "1 mg",
  form: "tabletki",
  commonName: "Npsalfum",
  substances: ["Substantia tres"],
});
const uNpsSuperset = w.user();
const kNpsSuperset = w.kitItem(uNpsSuperset, npsSuperset.packageId);
const uNpsSubset = w.user();
const kNpsSubset = w.kitItem(uNpsSubset, npsSubset.packageId);

// "-" as the common name is a placeholder: it never matches, also with itself (2 products in the 2026-11-16 registry).
const dashA = w.product({ name: "Dash A", strength: null, form: "płyn", commonName: "-", substances: [] });
const dashB = w.product({ name: "Dash B", strength: null, form: "krople", commonName: " - ", substances: [] });
const uDash = w.user();
w.kitItem(uDash, dashB.packageId);

// Strength order: variant, equal set, superset, overlap, although the weaker matches expire sooner.
const ordo = w.product({
  name: "Ordo",
  strength: "10 mg + 5 mg",
  form: "tabletki",
  commonName: "Ordinum + Secundum",
  substances: ["Ordinum", "Secundum"],
});
const ordoEqual = w.product({
  name: "Ordo Bis",
  strength: "10 mg + 5 mg",
  form: "tabletki",
  commonName: "Secundum + Ordinum",
  substances: ["Secundum", "Ordinum"],
});
const ordoSuperset = w.product({
  name: "Ordo Plus",
  strength: "10 mg + 5 mg + 1 mg",
  form: "tabletki",
  commonName: "Ordinum + Secundum + Tertium",
  substances: ["Ordinum", "Secundum", "Tertium"],
});
const ordoOverlap = w.product({
  name: "Ordo Mono",
  strength: "10 mg",
  form: "tabletki",
  commonName: "Ordinum",
  substances: ["Ordinum"],
});
const uStrength = w.user();
const kStrengthOverlap = w.kitItem(uStrength, ordoOverlap.packageId, { expiresOn: "2020-01-31", precision: "month" });
const kStrengthSuperset = w.kitItem(uStrength, ordoSuperset.packageId, { expiresOn: "2021-01-31", precision: "month" });
const kStrengthEqual = w.kitItem(uStrength, ordoEqual.packageId, { expiresOn: "2030-01-31", precision: "month" });
const kStrengthVariant = w.kitItem(uStrength, ordo.packageId);

// matchedBy is the path with the smaller strength: a superset by common name (2) loses to an equal substance set (1).
const ordoNamedMore = w.product({
  name: "Ordo Quart",
  strength: "10 mg + 5 mg",
  form: "tabletki",
  commonName: "Ordinum + Secundum + Quartum",
  substances: ["Ordinum", "Secundum"],
});
const uTie = w.user();
const kTie = w.kitItem(uTie, ordoNamedMore.packageId);

// A searched product with no usable set matches nothing on any level, even with a full kit (the `x @> '{}'` trap).
const uFullKit = w.user();
for (const product of [sortis, metafen, diosmectite, aromaActiv, herbalB, homeoB, comboAB, paracetamolCaffeine]) {
  w.kitItem(uFullKit, product.packageId);
}

const cases: RuleCase[] = [
  // Ported (17 of 17; "unknown id", "order" and "withdrawn" have their own tests below).
  {
    name: "same product",
    user: uSame,
    searched: sortis.id,
    items: [[kSame, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  {
    name: "parallel import (other id, same key in other letter case)",
    user: uParallel,
    searched: sortis.id,
    items: [[kParallel, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  {
    name: "Sortis vs Atoris (same common name, different salt)",
    user: uAtoris,
    searched: sortis.id,
    items: [[kAtoris, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "Metafen vs Lizymax (different common name, same substance)",
    user: uLizymax,
    searched: metafen.id,
    items: [[kLizymax, "substance", "substances", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "Smecta without substances vs Diosmectitum",
    user: uDiosmectite,
    searched: smecta.id,
    items: [[kDiosmectite, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: 'common name "Preparat złożony", different substances',
    user: uAromaActiv,
    searched: afronis.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: 'only substance "Preparat złożony" and a generic common name',
    user: uHerbalB,
    searched: herbalA.id,
    items: [],
    comparable: false,
    kind: "none",
  },
  {
    name: 'common name "Preparat witaminowy" (generic by prefix), different substances',
    user: uVitaminB,
    searched: vitaminA.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "two-part common name in another order and letter case",
    user: uComboBA,
    searched: comboAB.id,
    items: [[kComboBA, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "one part of a two-part common name is not a match",
    user: uComboAB,
    searched: monoA.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "same variant key with no strength on both sides",
    user: uAfronisParallel,
    searched: afronis.id,
    items: [[kAfronisParallel, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  {
    name: "other medicine",
    user: uOtherMedicine,
    searched: metafen.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "searched without substances and with a generic common name",
    user: uHomeoB,
    searched: homeoA.id,
    items: [],
    comparable: false,
    kind: "none",
  },
  {
    name: "other user's variant item stays hidden (RLS)",
    user: uEmptyKit,
    searched: sortis.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  // Risk 1: with the medicine, or its substance, in the kit the verdict is never "nie masz".
  {
    name: "G1: a second active pack of the same product is the same medicine",
    user: uG1,
    searched: polopiryna.id,
    items: [[kG1, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  {
    name: "G2: the same brand in another strength is the same substance, not the same medicine",
    user: uG2,
    searched: brandHigh.id,
    items: [[kG2, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G4: no strength on one side and a strength on the other is the same substance, not the same medicine",
    user: uG4,
    searched: nospaStrength.id,
    items: [[kG4, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G5 (D3): a searched product withdrawn from the registry still finds its pack",
    user: uG5,
    searched: sortisRemoved.id,
    items: [[kG5, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  {
    name: "G6: a withdrawn item matched by substance is marked withdrawn",
    user: uG6,
    searched: metafen.id,
    items: [[kG6, "substance", "substances", true]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G7: generic common name on both sides but equal substance sets matches by the substances",
    user: uG7,
    searched: rhinoA.id,
    items: [[kG7, "substance", "substances", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G9: the same substances in another order match",
    user: uG9,
    searched: orderA.id,
    items: [[kG9, "substance", "substances", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G11: a medicine name that differs only in letter case (Polish characters) is the same medicine",
    user: uG11,
    searched: zolcUpper.id,
    items: [[kG11, "variant", null, false]],
    comparable: true,
    kind: "variant",
  },
  // Risk 2: no same-substance claim for something that is not.
  {
    name: "G14: a strict subset of the substances is not a match (kit holds the subset)",
    user: uG14Subset,
    searched: paracetamolCaffeine.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "G14: a strict subset of the substances is not a match (kit holds the superset)",
    user: uG14Superset,
    searched: paracetamolOnly.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "G15: a common name of a real part and a placeholder does not match by name",
    user: uG15,
    searched: mixedA.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "G16: a placeholder common name on one side only does not match",
    user: uG16,
    searched: realName.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  {
    name: "G11: a placeholder common name in upper case with Polish characters is still a placeholder",
    user: uShout,
    searched: shoutA.id,
    items: [],
    comparable: true,
    kind: "none",
  },
  // Author's decisions of 2026-10-13.
  {
    name: "G18 (D1): the same common name with unrelated substances is a same-substance match by common_name",
    user: uG18,
    searched: commonA.id,
    items: [[kG18, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: 'G19: equal common-name and substance sets report "common_name"',
    user: uG19,
    searched: bothA.id,
    items: [[kG19, "substance", "common_name", false]],
    comparable: true,
    kind: "substance",
  },
  {
    name: "G8: another salt under another common name is not matched (accepted limitation of the cautious rule)",
    user: uG8,
    searched: saltA.id,
    items: [],
    comparable: true,
    kind: "none",
  },
];

let client: pg.Client;

beforeAll(async () => {
  client = await connectLocal();
  await client.query("begin");
  await w.seed(client);
});

afterAll(async () => {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
});

// A failed statement aborts the transaction; a savepoint per test keeps one failure from failing the rest.
beforeEach(async () => {
  await client.query("savepoint t");
});

afterEach(async () => {
  await client.query("rollback to savepoint t");
  await client.query("release savepoint t");
});

/** The answer of the rule, which must pass the guard the screen applies. */
async function answer(user: string, product: number, level?: string): Promise<MedicineCheckResponse> {
  const raw = await checkAs(client, user, product, level);
  const parsed = parseMedicineCheck(raw);
  if (!parsed) {
    throw new Error(`The screen would reject this answer of the rule: ${JSON.stringify(raw)}`);
  }
  return parsed;
}

describe("medicine_check rule", () => {
  it.each(cases)("$name", async ({ user, searched, items, comparable, kind }) => {
    const result = await answer(user, searched);

    expect(result.items.map((i) => [i.id, i.match, i.matchedBy, i.withdrawn])).toEqual(
      items.map(([ref, match, matchedBy, withdrawn]) => [ref.id, match, matchedBy, withdrawn]),
    );
    expect(result.comparable).toBe(comparable);
    expect(checkVerdict(result).kind).toBe(kind);
  });

  it("returns the searched product with its full data (same product)", async () => {
    const result = await answer(uSame, sortis.id);

    expect(result.searched).toEqual({
      id: sortis.id,
      name: "Sortis",
      strength: "20 mg",
      form: "tabletki powlekane",
      commonName: "Atorvastatinum",
      substances: ["Atorvastatinum calcicum trihydricum"],
    });
  });

  it("returns both a withdrawn package and a withdrawn product as the same medicine, marked withdrawn", async () => {
    const result = await answer(uWithdrawn, sortis.id);

    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.match === "variant" && i.withdrawn)).toBe(true);
    expect(result.items.map((i) => i.id).sort()).toEqual([kRemovedPackage.id, kRemovedProduct.id].sort());
    expect(checkVerdict(result).kind).toBe("variant");
  });

  it("orders variant first, then by expiry (expired, later, none), then the substance item", async () => {
    const result = await answer(uOrder, sortis.id);

    expect(result.items.map((i) => i.id)).toEqual([
      kOrderExpired.id,
      kOrderLater.id,
      kOrderNoDate.id,
      kOrderSubstance.id,
    ]);
    expect(result.items[0].expiresOn).toBe("2020-01-31");
    expect(result.items[0].expiryPrecision).toBe("month");
    expect(checkVerdict(result).kind).toBe("variant");
  });

  it("returns null for an unknown product, which neither passes the guard nor yields a verdict", async () => {
    const raw = await checkAs(client, uSame, UNKNOWN_PRODUCT);

    expect(raw).toBeNull();
    expect(parseMedicineCheck(raw)).toBeNull();
  });

  it("G22: the item carries the values the screen reads (name, strength, form, substances in order, units, quantity)", async () => {
    const result = await answer(uShape, shape.id);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: kShape.id,
      packageId: shape.packageId,
      match: "variant",
      matchedBy: null,
      name: "Shapeform",
      strength: "10 mg",
      form: "kapsułki twarde",
      holder: "Shape Pharma Sp. z o.o.",
      commonName: "Shapeum",
      substances: ["Zeta substantia", "Alfa substantia"],
      units: [{ count: "2", kind: "blister", capacity: "15", capacity_unit: "tabl.", info: "po 15 szt." }],
      quantity: 12,
      expiresOn: null,
      expiryPrecision: null,
      withdrawn: false,
    });
  });
});

type Level = "exact" | "all" | "any";
const LEVELS: Level[] = ["exact", "all", "any"];
/** [kit item, match, matchedBy] */
type LevelItem = [KitRef, Match, MatchedBy];

interface LevelCase {
  name: string;
  user: string;
  searched: number;
  /** The matching kit items on each level, in the order the rule must return them. */
  levels: Record<Level, LevelItem[]>;
}

const levelCases: LevelCase[] = [
  {
    name: "G14: the kit holds a superset of the substances: matches from all on",
    user: uG14Superset,
    searched: paracetamolOnly.id,
    levels: {
      exact: [],
      all: [[kG14Superset, "substance", "substances"]],
      any: [[kG14Superset, "substance", "substances"]],
    },
  },
  {
    name: "G14: the kit holds a subset of the substances: matches only on any",
    user: uG14Subset,
    searched: paracetamolCaffeine.id,
    levels: { exact: [], all: [], any: [[kG14Subset, "substance", "substances"]] },
  },
  {
    name: "overlapping substances, neither subset nor superset: match only on any",
    user: uOverlap,
    searched: paracetamolCaffeine.id,
    levels: { exact: [], all: [], any: [[kOverlap, "substance", "substances"]] },
  },
  {
    name: "common-name parts superset with unrelated substances: matches from all on, by common_name",
    user: uNpsSuperset,
    searched: npsSearched.id,
    levels: {
      exact: [],
      all: [[kNpsSuperset, "substance", "common_name"]],
      any: [[kNpsSuperset, "substance", "common_name"]],
    },
  },
  {
    name: "common-name parts subset with unrelated substances: matches only on any, by common_name",
    user: uNpsSubset,
    searched: npsSearched.id,
    levels: { exact: [], all: [], any: [[kNpsSubset, "substance", "common_name"]] },
  },
  {
    name: 'common name "-" is a placeholder: no match on any level, also with itself',
    user: uDash,
    searched: dashA.id,
    levels: { exact: [], all: [], any: [] },
  },
  {
    name: "a searched product with no usable set matches nothing in a full kit (the x @> '{}' trap)",
    user: uFullKit,
    searched: homeoA.id,
    levels: { exact: [], all: [], any: [] },
  },
  {
    name: "a searched product with only a placeholder substance matches nothing in a full kit",
    user: uFullKit,
    searched: herbalA.id,
    levels: { exact: [], all: [], any: [] },
  },
  {
    name: "order by strength: variant, equal set, superset, overlap, although the weaker ones expire sooner",
    user: uStrength,
    searched: ordo.id,
    levels: {
      exact: [
        [kStrengthVariant, "variant", null],
        [kStrengthEqual, "substance", "common_name"],
      ],
      all: [
        [kStrengthVariant, "variant", null],
        [kStrengthEqual, "substance", "common_name"],
        [kStrengthSuperset, "substance", "common_name"],
      ],
      any: [
        [kStrengthVariant, "variant", null],
        [kStrengthEqual, "substance", "common_name"],
        [kStrengthSuperset, "substance", "common_name"],
        [kStrengthOverlap, "substance", "common_name"],
      ],
    },
  },
  {
    name: "matchedBy is the stronger path: an equal substance set beats a common-name superset",
    user: uTie,
    searched: ordo.id,
    levels: {
      exact: [[kTie, "substance", "substances"]],
      all: [[kTie, "substance", "substances"]],
      any: [[kTie, "substance", "substances"]],
    },
  },
];

describe("medicine_check match levels", () => {
  it.each(levelCases.flatMap((c) => LEVELS.map((level) => ({ ...c, level, expected: c.levels[level] }))))(
    "$name ($level)",
    async ({ user, searched, level, expected }) => {
      const result = await answer(user, searched, level);

      expect(result.items.map((i) => [i.id, i.match, i.matchedBy])).toEqual(
        expected.map(([ref, match, matchedBy]) => [ref.id, match, matchedBy]),
      );
      expect(checkVerdict(result).kind).toBe(
        expected.some(([, match]) => match === "variant") ? "variant" : expected.length > 0 ? "substance" : "none",
      );
    },
  );

  it.each(cases)("monotonic: exact ⊆ all ⊆ any, and exact is the default ($name)", async ({ user, searched }) => {
    const ids = async (level?: Level) => (await answer(user, searched, level)).items.map((i) => i.id);
    const [byDefault, exact, all, any] = [await ids(), await ids("exact"), await ids("all"), await ids("any")];

    expect(exact).toEqual(byDefault);
    expect(all).toEqual(expect.arrayContaining(exact));
    expect(any).toEqual(expect.arrayContaining(all));
  });

  it("echoes the level, exact when the call leaves it out", async () => {
    for (const level of [undefined, ...LEVELS]) {
      const raw = (await checkAs(client, uSame, sortis.id, level)) as { level?: unknown };
      expect(raw.level).toBe(level ?? "exact");
    }
  });

  it.each(["", "ALL", "exact,all", "none"])("rejects the unknown level %j with 22023", async (level) => {
    await actAs(client, uSame);
    await expectSqlError(client, "select public.medicine_check($1::bigint, $2::text)", [sortis.id, level], "22023");
  });

  it("rejects a NULL level with 22023", async () => {
    await actAs(client, uSame);
    await expectSqlError(client, "select public.medicine_check($1::bigint, null::text)", [sortis.id], "22023");
  });
});
