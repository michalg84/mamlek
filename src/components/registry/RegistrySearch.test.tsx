import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RegistrySearch from "@/components/registry/RegistrySearch";
import { ID, registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { stubRoutedFetch } from "../../../tests/helpers/fetch";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

// The texts below are pinned on purpose, like in MedicineCheckResult.test.tsx.
const A_VERDICT = "Masz ten lek · 1 opakowanie";
const B_VERDICT = "Nie masz tego leku";
const LOADING = "Sprawdzam apteczkę…";
const NO_MATCH = "Brak leku o takiej nazwie w rejestrze";
// The live regions repeat the name and the verdict for screen readers, so visible text is looked up outside of them.
const VISIBLE = { ignore: "[role=status]" };

// Medicine A: Ibuprom 400 mg, the kit holds it. Medicine B: Ibuprom Max 400 mg, the kit does not. Both come from the
// same query, so B is picked right after A without editing the text (the check component stays mounted).
const A_OPTION = "Ibuprom400 mg · tabletki powlekane";
const B_OPTION = "Ibuprom Max400 mg · tabletki powlekane";
const A_ID = ID.ibuprom400;
const B_ID = ID.ibupromMax400;

const A_ANSWER: MedicineCheckResponse = {
  searched: {
    id: A_ID,
    name: "Ibuprom",
    strength: "400 mg",
    form: "tabletki powlekane",
    commonName: "Ibuprofenum",
    substances: ["Ibuprofenum"],
  },
  comparable: true,
  items: [checkItem()],
};
const B_ANSWER: MedicineCheckResponse = {
  searched: {
    id: B_ID,
    name: "Ibuprom Max",
    strength: "400 mg",
    form: "tabletki powlekane",
    commonName: "Ibuprofenum",
    substances: ["Ibuprofenum"],
  },
  comparable: true,
  items: [],
};

function checkItem(): MedicineCheckItem {
  return {
    id: 1,
    packageId: 1001,
    match: "variant",
    matchedBy: null,
    name: "Ibuprom",
    strength: "400 mg",
    form: "tabletki powlekane",
    holder: null,
    commonName: "Ibuprofenum",
    substances: ["Ibuprofenum"],
    units: [],
    quantity: null,
    expiresOn: null,
    expiryPrecision: null,
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
  };
}

/** Renders the screen and waits until the search list is loaded and the (fake) worker has built its index. */
async function openSearch() {
  const checks = stubRoutedFetch(registrySearchList);
  const Worker = stubSearchWorker();
  render(<RegistrySearch version={registrySearchList.version} />);
  await screen.findByText("Wpisz co najmniej 3 litery");
  const created = Worker.last;
  if (!created) {
    throw new Error("The search worker was not created");
  }
  const worker = created;
  const input = screen.getByRole("combobox");

  /** Edits the field like the user does. */
  function type(value: string) {
    fireEvent.change(input, { target: { value } });
  }

  /** The worker answers the query with this exact text now. */
  async function deliver(query: string) {
    await act(async () => {
      worker.deliver(query);
      await Promise.resolve();
    });
  }

  /** Types `value` and lets the worker answer it at once. */
  async function search(value: string) {
    type(value);
    await deliver(value);
  }

  /** Clicks the option with this text (name directly followed by "moc · postać"). */
  function pick(optionText: string) {
    const option = screen.getAllByRole("option").find((candidate) => candidate.textContent === optionText);
    if (!option) {
      throw new Error(`No option "${optionText}" (shown: ${optionTexts().join(" | ")})`);
    }
    fireEvent.click(option);
  }

  /**
   * Picks another option of the query the field already shows (the previous pick put its name there), without
   * editing the text: the worker answers that query, ArrowDown reopens the list, the click selects.
   */
  async function pickOther(optionText: string) {
    await deliver(input.getAttribute("value") ?? "");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    pick(optionText);
  }

  /**
   * The check endpoint answers `productId` now. No timers: the pending work (reading the body, state updates) is
   * drained with microtask turns inside `act`, so everything the answer can cause has happened when this returns.
   */
  async function answerCheck(productId: number, body: MedicineCheckResponse) {
    await act(async () => {
      checks.resolveCheck(productId, body);
      for (let turn = 0; turn < 50; turn++) {
        await Promise.resolve();
      }
    });
  }

  return { checks, worker, input, type, deliver, search, pick, pickOther, answerCheck };
}

function optionTexts() {
  return screen.queryAllByRole("option").map((option) => option.textContent);
}

function card() {
  return screen.queryByRole("region", { name: "Wybrany lek" });
}

/** Name in the „Wybrany lek” card; fails when there is no card. */
function cardName() {
  const region = card();
  if (!region) {
    throw new Error("No „Wybrany lek” card on the screen");
  }
  return within(region).getByRole("heading").textContent;
}

function verdictsOnScreen() {
  return [A_VERDICT, B_VERDICT].filter((text) => screen.queryByText(text, VISIBLE) !== null);
}

describe("RegistrySearch", () => {
  it("shows the options of the list for a typed query once the worker answers", async () => {
    stubRoutedFetch(registrySearchList);
    const Worker = stubSearchWorker();
    render(<RegistrySearch version={registrySearchList.version} />);

    const input = screen.getByRole("combobox");
    await screen.findByText("Wpisz co najmniej 3 litery");
    fireEvent.change(input, { target: { value: "ibuprom" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    await Promise.resolve();
    Worker.last?.deliverAll();

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Ibuprom200 mg · tabletki powlekane",
      "Ibuprom400 mg · tabletki powlekane",
      "Ibuprom Max400 mg · tabletki powlekane",
    ]);
  });

  describe("after the text is edited", () => {
    it("drops the card and the verdict when the text is edited after the verdict appeared", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      expect(cardName()).toBe("Ibuprom");
      expect(screen.getByText(A_VERDICT, VISIBLE)).toBeTruthy();

      screenUnderTest.type("Ibuprom 4");

      expect(card()).toBeNull();
      expect(verdictsOnScreen()).toEqual([]);
      expect(screen.queryByText(LOADING)).toBeNull();
    });

    it("drops the card and the verdict when the field is cleared after the verdict appeared", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      expect(screen.getByText(A_VERDICT, VISIBLE)).toBeTruthy();

      screenUnderTest.type("");

      expect(card()).toBeNull();
      expect(verdictsOnScreen()).toEqual([]);
      expect(screen.queryByText(LOADING)).toBeNull();
    });

    it("shows no card and no verdict when the answer arrives late, after the text was edited during the check", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      expect(screen.getByText(LOADING)).toBeTruthy();
      expect(screenUnderTest.checks.pendingChecks(A_ID)).toBe(1);

      screenUnderTest.type("Ibuprom 4");
      expect(card()).toBeNull();

      // The request was abandoned, but its answer still arrives.
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);

      expect(screenUnderTest.checks.pendingChecks(A_ID)).toBe(0);
      expect(card()).toBeNull();
      expect(verdictsOnScreen()).toEqual([]);
      expect(screen.queryByText(LOADING)).toBeNull();
    });

    it("shows the card and the verdict again when the same medicine is picked again after an edit", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      screenUnderTest.type("Ibuprom 4");
      expect(card()).toBeNull();

      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      expect(cardName()).toBe("Ibuprom");
      // Whether the second pick asks again is not part of the rule; only what is on the screen is.
      if (screenUnderTest.checks.pendingChecks(A_ID) > 0) {
        await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      }

      expect(cardName()).toBe("Ibuprom");
      expect(screen.getByText(A_VERDICT, VISIBLE)).toBeTruthy();
      expect(screen.queryByText(LOADING)).toBeNull();
    });
  });

  describe("when the answers of two medicines arrive out of order", () => {
    it("keeps the card and the verdict of the second pick when the first answer arrives late, after the second", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.pickOther(B_OPTION);

      await screenUnderTest.answerCheck(B_ID, B_ANSWER);
      expect(cardName()).toBe("Ibuprom Max");
      expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();

      await screenUnderTest.answerCheck(A_ID, A_ANSWER);

      expect(cardName()).toBe("Ibuprom Max");
      expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();
      expect(screen.queryByText(A_VERDICT, VISIBLE)).toBeNull();
    });

    it("shows loading for the second pick, not the verdict of the first, when the first answer arrives while the second is on its way", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.pickOther(B_OPTION);

      await screenUnderTest.answerCheck(A_ID, A_ANSWER);

      expect(cardName()).toBe("Ibuprom Max");
      expect(screen.getByText(LOADING)).toBeTruthy();
      expect(verdictsOnScreen()).toEqual([]);

      await screenUnderTest.answerCheck(B_ID, B_ANSWER);

      expect(cardName()).toBe("Ibuprom Max");
      expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();
      expect(screen.queryByText(A_VERDICT, VISIBLE)).toBeNull();
      expect(screen.queryByText(LOADING)).toBeNull();
    });
  });

  describe("suggestions follow the current text", () => {
    it("shows no option of a query that was cleared, also when its answer arrives late", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibu");
      expect(optionTexts().some((text) => text.startsWith("Ibuprom"))).toBe(true);

      // "ibup" is on its way when the field is cleared and "par" typed; neither has been answered yet.
      screenUnderTest.type("ibup");
      screenUnderTest.type("");
      screenUnderTest.type("par");
      expect(optionTexts()).toEqual([]);

      await screenUnderTest.deliver("ibup");
      expect(optionTexts()).toEqual([]);
      expect(screen.queryByText(NO_MATCH)).toBeNull();

      await screenUnderTest.deliver("par");
      const texts = optionTexts();
      expect(texts.some((text) => text.startsWith("Paracetamol Hasco"))).toBe(true);
      expect(texts.some((text) => text.startsWith("Ibuprom"))).toBe(false);
    });

    it("says there is no such medicine only after the answer to the current query, not while the previous results are shown", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      expect(optionTexts()).toHaveLength(3);

      screenUnderTest.type("zzz");
      // The previous results stay until the new answer arrives; the message must not describe the old query.
      expect(screen.queryByText(NO_MATCH)).toBeNull();

      await screenUnderTest.deliver("zzz");

      expect(screen.getByText(NO_MATCH)).toBeTruthy();
      expect(optionTexts()).toEqual([]);
    });
  });

  describe("options", () => {
    it("shows strength and form under every name, so variants with the same name can be told apart", async () => {
      const screenUnderTest = await openSearch();

      await screenUnderTest.search("ibuprom");
      const ibuprom = screen.getAllByRole("option");
      expect(within(ibuprom[0]).getByText("200 mg · tabletki powlekane")).toBeTruthy();
      expect(within(ibuprom[1]).getByText("400 mg · tabletki powlekane")).toBeTruthy();
      expect(within(ibuprom[2]).getByText("400 mg · tabletki powlekane")).toBeTruthy();

      // Same name and strength, different form.
      await screenUnderTest.search("no spa");
      const noSpa = screen.getAllByRole("option");
      expect(noSpa).toHaveLength(2);
      expect(within(noSpa[0]).getByText("No-Spa")).toBeTruthy();
      expect(within(noSpa[1]).getByText("No-Spa")).toBeTruthy();
      expect(noSpa.map((option) => option.textContent)).toEqual([
        "No-Spa40 mg · roztwór do wstrzykiwań",
        "No-Spa40 mg · tabletki",
      ]);
    });
  });
});
