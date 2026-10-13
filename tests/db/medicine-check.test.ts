// Tests of the public.medicine_check() rule on a real local database, on synthetic products and kits that are rolled
// back. Every answer also goes through the same guard and verdict function the screen uses, so a renamed field or an
// unexpected value between SQL and TypeScript fails here. The expected values come from the PRD (FR-011, FR-012),
// decisions D1-D3 of the medicine-check research and the author's decisions of 2026-10-13, not from running the code.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkVerdict, parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MedicineCheckResponse } from "@/types";
import { World, checkAs, connectLocal, type KitRef } from "./medicine-check-fixtures";

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
w.kitItem(uG14Subset, paracetamolOnly.packageId);
const uG14Superset = w.user();
w.kitItem(uG14Superset, paracetamolCaffeine.packageId);

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
async function answer(user: string, product: number): Promise<MedicineCheckResponse> {
  const raw = await checkAs(client, user, product);
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
