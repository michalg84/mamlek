import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegistrySearch from "@/components/registry/RegistrySearch";
import { ID, registrySearchList, substanceFilterList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { stubRoutedFetch } from "../../../tests/helpers/fetch";
import { forgetUnsavedMatchLevel, MATCH_LEVEL_STORAGE_KEY } from "@/components/hooks/useMatchLevel";
import type { MatchLevel, MedicineCheckItem, MedicineCheckResponse, RegistrySearchListPayload } from "@/types";

// The texts below are pinned on purpose, like in MedicineCheckResult.test.tsx.
const A_VERDICT = "Masz ten lek · 1 opakowanie";
const B_VERDICT = "Nie masz tego leku";
const LOADING = "Sprawdzam apteczkę…";
const NO_MATCH = "Brak leku o takiej nazwie w rejestrze";
// The live regions repeat the name and the verdict for screen readers, so visible text is looked up outside of them.
const VISIBLE = { ignore: "[role=status]" };

// Medicine A: Ibuprom 400 mg, the kit holds it. Medicine B: Ibuprom Max 400 mg, the kit does not. Both come from the
// same query, so B is picked right after A without editing the text (the check component stays mounted).
const A_OPTION = "Ibuprom400 mgtabletki powlekane";
const B_OPTION = "Ibuprom Max400 mgtabletki powlekane";
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
  level: "exact",
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
  level: "exact",
  comparable: true,
  items: [],
};

// A withdrawn variant (7th tuple element `true`) next to an active one of the same name. The medicine check does not
// return the flag (its `searched` has no `withdrawn`), like the real `medicine_check` RPC.
const WITHDRAWN = "wycofany z rejestru";
const CRESTOR_WITHDRAWN_ID = 900;
const CRESTOR_ACTIVE_ID = 901;
const CRESTOR_WITHDRAWN_OPTION = "Crestor10 mgtabletki powlekanewycofany z rejestru";
const CRESTOR_ACTIVE_OPTION = "Crestor20 mgtabletki powlekane";
const withdrawnList: RegistrySearchListPayload = {
  ...registrySearchList,
  variants: [
    ...registrySearchList.variants,
    [CRESTOR_WITHDRAWN_ID, "Crestor", "10 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"], true],
    [CRESTOR_ACTIVE_ID, "Crestor", "20 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"]],
  ],
};

function crestorAnswer(id: number, strength: string): MedicineCheckResponse {
  return {
    searched: {
      id,
      name: "Crestor",
      strength,
      form: "tabletki powlekane",
      commonName: "Rosuvastatinum",
      substances: ["Rosuvastatinum"],
    },
    level: "exact",
    comparable: true,
    items: [],
  };
}

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
async function openSearch(
  list: RegistrySearchListPayload = registrySearchList,
  props: Partial<ComponentProps<typeof RegistrySearch>> = {},
) {
  const checks = stubRoutedFetch(list);
  const Worker = stubSearchWorker();
  render(<RegistrySearch version={list.version} {...props} />);
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
    await deliver((input as HTMLInputElement).value);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    pick(optionText);
  }

  /**
   * The check endpoint answers `productId` now. No timers: the pending work (reading the body, state updates) is
   * drained with microtask turns inside `act`, so everything the answer can cause has happened when this returns.
   * 50 is a generous bound (reading the body and the updates take a few promise hops each); every "nothing changed"
   * assertion below is followed by an answer that must show, which proves the drain is long enough.
   */
  async function answerCheck(productId: number, body: MedicineCheckResponse) {
    await act(async () => {
      checks.resolveCheck(productId, body);
      for (let turn = 0; turn < 50; turn++) {
        await Promise.resolve();
      }
    });
  }

  return { checks, worker, workers: Worker, input, type, deliver, search, pick, pickOther, answerCheck };
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

    await act(async () => {
      Worker.last?.deliverAll();
      await Promise.resolve();
    });

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Ibuprom200 mgtabletki powlekane",
      "Ibuprom400 mgtabletki powlekane",
      "Ibuprom Max400 mgtabletki powlekane",
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

      // Only the abandoned request was made: the edit did not ask about A again.
      expect(screenUnderTest.checks.checkRequests()).toEqual([A_ID]);
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
      expect(optionTexts()).toHaveLength(3);
      expect(screen.queryByText(NO_MATCH)).toBeNull();

      await screenUnderTest.deliver("zzz");

      expect(screen.getByText(NO_MATCH)).toBeTruthy();
      expect(optionTexts()).toEqual([]);
    });
  });

  describe("options", () => {
    it("shows strength and form, each on its own line, under every name, so variants with the same name can be told apart", async () => {
      const screenUnderTest = await openSearch();

      await screenUnderTest.search("ibuprom");
      const ibuprom = screen.getAllByRole("option");
      // Strength and form are separate elements: a long strength can no longer cut the form off.
      expect(within(ibuprom[0]).getByText("200 mg")).toBeTruthy();
      expect(within(ibuprom[1]).getByText("400 mg")).toBeTruthy();
      expect(within(ibuprom[2]).getByText("400 mg")).toBeTruthy();
      for (const option of ibuprom) {
        expect(within(option).getByText("tabletki powlekane")).toBeTruthy();
      }

      // Same name and strength, different form.
      await screenUnderTest.search("no spa");
      const noSpa = screen.getAllByRole("option");
      expect(noSpa).toHaveLength(2);
      expect(within(noSpa[0]).getByText("No-Spa")).toBeTruthy();
      expect(within(noSpa[1]).getByText("No-Spa")).toBeTruthy();
      expect(noSpa.map((option) => option.textContent)).toEqual([
        "No-Spa40 mgroztwór do wstrzykiwań",
        "No-Spa40 mgtabletki",
      ]);
    });
  });

  describe("a variant withdrawn from the registry", () => {
    it("says „wycofany z rejestru” in the suggestion of a withdrawn variant only, as part of the option's name", async () => {
      const screenUnderTest = await openSearch(withdrawnList);

      await screenUnderTest.search("crestor");

      // The active variant leads although its strength sorts after the withdrawn one.
      expect(optionTexts()).toEqual([CRESTOR_ACTIVE_OPTION, CRESTOR_WITHDRAWN_OPTION]);
      const [active, withdrawn] = screen.getAllByRole("option");
      expect(within(withdrawn).getByText(WITHDRAWN)).toBeTruthy();
      expect(within(active).queryByText(WITHDRAWN)).toBeNull();
      // Screen readers read the label with the option.
      expect(screen.getByRole("option", { name: new RegExp(WITHDRAWN) })).toBe(withdrawn);
    });

    it("keeps „wycofany z rejestru” on the card after the medicine check answers without the flag", async () => {
      const screenUnderTest = await openSearch(withdrawnList);
      await screenUnderTest.search("crestor");
      screenUnderTest.pick(CRESTOR_WITHDRAWN_OPTION);

      const region = card();
      if (!region) {
        throw new Error("No „Wybrany lek” card on the screen");
      }
      expect(within(region).getByText(WITHDRAWN)).toBeTruthy();

      await screenUnderTest.answerCheck(CRESTOR_WITHDRAWN_ID, crestorAnswer(CRESTOR_WITHDRAWN_ID, "10 mg"));

      expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();
      const answered = card();
      if (!answered) {
        throw new Error("No „Wybrany lek” card on the screen");
      }
      expect(cardName()).toBe("Crestor");
      expect(within(answered).getByText(WITHDRAWN)).toBeTruthy();
    });

    it("shows no „wycofany z rejestru” on the card of an active variant", async () => {
      const screenUnderTest = await openSearch(withdrawnList);
      await screenUnderTest.search("crestor");
      screenUnderTest.pick(CRESTOR_ACTIVE_OPTION);

      await screenUnderTest.answerCheck(CRESTOR_ACTIVE_ID, crestorAnswer(CRESTOR_ACTIVE_ID, "20 mg"));

      expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();
      expect(cardName()).toBe("Crestor");
      expect(screen.queryByText(WITHDRAWN)).toBeNull();
    });
  });

  describe("match level", () => {
    const ANY_VERDICT = "Masz lek ze wspólnym składnikiem";

    afterEach(() => {
      vi.restoreAllMocks();
      forgetUnsavedMatchLevel();
      window.localStorage.clear();
    });

    /** The `level` parameter of every check request so far, in call order. */
    function checkLevels(checks: { fetchMock: { mock: { calls: Parameters<typeof fetch>[] } } }) {
      return checks.fetchMock.mock.calls
        .map(
          ([input]) =>
            new URL(
              typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
              "http://localhost",
            ),
        )
        .filter((url) => url.pathname === "/api/kit/check")
        .map((url) => url.searchParams.get("level"));
    }

    function levelRadio(name: string) {
      return within(screen.getByRole("radiogroup", { name: "Dopasowanie składu" })).getByRole("radio", { name });
    }

    /** A's answer on another level: a kit medicine sharing a substance, so the verdict differs from A_VERDICT. */
    function answerOn(level: MatchLevel): MedicineCheckResponse {
      return {
        ...A_ANSWER,
        level,
        items: [{ ...checkItem(), id: 2, match: "substance", matchedBy: "common_name", name: "Nurofen" }],
      };
    }

    it("checks on „Ten sam skład” (exact) by default", async () => {
      const screenUnderTest = await openSearch();
      expect(levelRadio("Ten sam skład").getAttribute("aria-checked")).toBe("true");

      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);

      expect(checkLevels(screenUnderTest.checks)).toEqual(["exact"]);
    });

    it("asks again on a new level and never shows the late answer of the previous one", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);

      fireEvent.click(levelRadio("Zawiera którykolwiek składnik"));
      expect(checkLevels(screenUnderTest.checks)).toEqual(["exact", "any"]);
      expect(screen.getByText(LOADING)).toBeTruthy();

      // The abandoned exact request still answers, before the new one.
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      expect(screen.queryByText(A_VERDICT, VISIBLE)).toBeNull();
      expect(screen.getByText(LOADING)).toBeTruthy();

      await screenUnderTest.answerCheck(A_ID, answerOn("any"));
      expect(screen.getByText(ANY_VERDICT, VISIBLE)).toBeTruthy();
      expect(screen.queryByText(A_VERDICT, VISIBLE)).toBeNull();
      expect(cardName()).toBe("Ibuprom");
    });

    it("replaces the verdict shown on the old level with loading, then with the verdict of the new level", async () => {
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      await screenUnderTest.answerCheck(A_ID, A_ANSWER);
      expect(screen.getByText(A_VERDICT, VISIBLE)).toBeTruthy();

      fireEvent.click(levelRadio("Zawiera wszystkie składniki"));

      expect(screen.queryByText(A_VERDICT, VISIBLE)).toBeNull();
      expect(screen.getByText(LOADING)).toBeTruthy();
      await screenUnderTest.answerCheck(A_ID, answerOn("all"));
      expect(screen.getByText("Masz lek zawierający składniki tego leku", VISIBLE)).toBeTruthy();
    });

    it("remembers the picked level and uses the stored one for the first check", async () => {
      window.localStorage.setItem(MATCH_LEVEL_STORAGE_KEY, "all");
      const screenUnderTest = await openSearch();
      expect(levelRadio("Zawiera wszystkie składniki").getAttribute("aria-checked")).toBe("true");

      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      expect(checkLevels(screenUnderTest.checks)).toEqual(["all"]);

      fireEvent.click(levelRadio("Zawiera którykolwiek składnik"));
      expect(window.localStorage.getItem(MATCH_LEVEL_STORAGE_KEY)).toBe("any");
    });

    it.each(["ALL", "", "strict"])(
      "falls back to exact for a stored value that is not a level (%j)",
      async (stored) => {
        window.localStorage.setItem(MATCH_LEVEL_STORAGE_KEY, stored);
        const screenUnderTest = await openSearch();
        await screenUnderTest.search("ibuprom");
        screenUnderTest.pick(A_OPTION);

        expect(levelRadio("Ten sam skład").getAttribute("aria-checked")).toBe("true");
        expect(checkLevels(screenUnderTest.checks)).toEqual(["exact"]);
      },
    );

    it("keeps working on the default level when storage refuses, and the switch still changes the level", async () => {
      const refused = new DOMException("The operation is insecure.", "SecurityError");
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw refused;
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw refused;
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);
      expect(checkLevels(screenUnderTest.checks)).toEqual(["exact"]);

      fireEvent.click(levelRadio("Zawiera którykolwiek składnik"));

      expect(levelRadio("Zawiera którykolwiek składnik").getAttribute("aria-checked")).toBe("true");
      expect(checkLevels(screenUnderTest.checks)).toEqual(["exact", "any"]);
      // The refusal is logged, not hidden.
      expect(warn).toHaveBeenCalled();
    });

    it("switches the level when saving fails but reading still works (full quota)", async () => {
      window.localStorage.setItem(MATCH_LEVEL_STORAGE_KEY, "exact");
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      });
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const screenUnderTest = await openSearch();
      await screenUnderTest.search("ibuprom");
      screenUnderTest.pick(A_OPTION);

      fireEvent.click(levelRadio("Zawiera którykolwiek składnik"));

      expect(levelRadio("Zawiera którykolwiek składnik").getAttribute("aria-checked")).toBe("true");
      expect(checkLevels(screenUnderTest.checks)).toEqual(["exact", "any"]);
    });
  });
});

describe("RegistrySearch: the address, substance links and the list of a substance", () => {
  const SUBSTANCE = "Ibuprofenum";
  const SUBSTANCE_PATH = "/szukaj?substancja=Ibuprofenum";
  const A_PATH = `/szukaj?lek=${A_ID}`;
  const KOMBI_OPTION = "Kombi Ibu A200 mgtabletki";

  /** Path, query and nothing else of the current address. */
  function address() {
    return `${window.location.pathname}${window.location.search}`;
  }

  beforeEach(() => {
    window.history.replaceState(null, "", "/szukaj");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    forgetUnsavedMatchLevel();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  /** The worker answers the oldest request for `substance` now. */
  async function answerSubstance(
    worker: { deliverSubstance: (substance: string) => void; pendingSubstances: () => string[] },
    substance = SUBSTANCE,
  ) {
    // The request is posted from an effect once the list is ready, so wait until it is queued.
    await waitFor(() => {
      expect(worker.pendingSubstances()).toContain(substance);
    });
    await act(async () => {
      worker.deliverSubstance(substance);
      await Promise.resolve();
    });
  }

  async function answerLookup(worker: { deliverLookup: () => void; pendingLookupCount: () => number }) {
    // The request is posted from an effect once the list is ready, so wait until it is queued.
    await waitFor(() => {
      expect(worker.pendingLookupCount()).toBeGreaterThan(0);
    });
    await act(async () => {
      worker.deliverLookup();
      await Promise.resolve();
    });
  }

  /** Goes one step back or forward in the history and waits for the `popstate` it causes. */
  async function travel(direction: "back" | "forward") {
    await act(async () => {
      const popped = new Promise<void>((resolve) => {
        window.addEventListener(
          "popstate",
          () => {
            resolve();
          },
          { once: true },
        );
      });
      if (direction === "back") {
        window.history.back();
      } else {
        window.history.forward();
      }
      await popped;
    });
  }

  function requireCard() {
    const region = card();
    if (!region) {
      throw new Error("No „Wybrany lek” card on the screen");
    }
    return region;
  }

  function substanceHeading(substance = SUBSTANCE) {
    return screen.getByRole("heading", { name: `Leki z substancją: ${substance}` });
  }

  /** Names of the medicines in the substance list. */
  function listedNames() {
    const section = substanceHeading().closest("section");
    if (!section) {
      throw new Error("The substance heading is not inside a section");
    }
    return within(section)
      .getAllByRole("listitem")
      .map((entry) => entry.querySelector("span")?.textContent);
  }

  it("links every active substance on the card to its list, and leaves a placeholder name as text", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("kombi");
    screenUnderTest.pick(KOMBI_OPTION);

    const region = requireCard();
    expect(within(region).getByRole("link", { name: "Ibuprofenum" }).getAttribute("href")).toBe(SUBSTANCE_PATH);
    expect(within(region).getByRole("link", { name: "Coffeinum" }).getAttribute("href")).toBe(
      "/szukaj?substancja=Coffeinum",
    );

    await screenUnderTest.search("placeholder");
    screenUnderTest.pick("Placeholder Med");
    const placeholder = requireCard();
    expect(within(placeholder).getByText("-")).toBeTruthy();
    expect(within(placeholder).queryByRole("link", { name: "-" })).toBeNull();
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("shows the add-to-kit link of the picked medicine, with the list id", async () => {
    const screenUnderTest = await openSearch();
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(B_OPTION);

    expect(screen.getByRole("link", { name: "Dodaj do apteczki" }).getAttribute("href")).toBe(
      `/apteczka?lek=${B_ID}#add-heading`,
    );
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("shows the add-to-kit link for a withdrawn medicine too", async () => {
    const screenUnderTest = await openSearch(withdrawnList);
    await screenUnderTest.search("crestor");
    screenUnderTest.pick(CRESTOR_WITHDRAWN_OPTION);

    expect(screen.getByRole("link", { name: "Dodaj do apteczki" }).getAttribute("href")).toBe(
      `/apteczka?lek=${CRESTOR_WITHDRAWN_ID}#add-heading`,
    );
  });

  it("opens the list of a substance from the card without a reload, then shows more on request", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    expect(address()).toBe(A_PATH);

    fireEvent.click(within(requireCard()).getByRole("link", { name: SUBSTANCE }));

    expect(address()).toBe(SUBSTANCE_PATH);
    expect(window.history.state).toEqual({ shown: 20 });
    expect(card()).toBeNull();
    await answerSubstance(screenUnderTest.worker);
    expect(screen.getByText("Pokazano 20 z 28", VISIBLE)).toBeTruthy();
    const firstPage = listedNames();
    expect(firstPage).toHaveLength(20);
    // The 2 combined medicines come after the 26 single-substance ones, so they are not on the first page.
    expect(firstPage.some((name) => name?.startsWith("Kombi"))).toBe(false);
    expect(screen.getAllByRole("status").map((region) => region.textContent)).toContain(
      `Leki z substancją ${SUBSTANCE}: 28`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pokaż więcej" }));
    expect(window.history.state).toEqual({ shown: 40 });
    expect(address()).toBe(SUBSTANCE_PATH);
    await answerSubstance(screenUnderTest.worker);

    expect(screen.getByText("Pokazano 28 z 28", VISIBLE)).toBeTruthy();
    const all = listedNames();
    expect(all).toHaveLength(28);
    expect(all.slice(-2)).toEqual(["Kombi Ibu A", "Kombi Ibu B"]);
    expect(screen.queryByRole("button", { name: "Pokaż więcej" })).toBeNull();
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("moves focus to the heading of the list after a substance click", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);

    fireEvent.click(within(requireCard()).getByRole("link", { name: SUBSTANCE }));
    await answerSubstance(screenUnderTest.worker);

    expect(document.activeElement).toBe(substanceHeading());
  });

  it("opens the list of a substance from a link in the check result", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    await screenUnderTest.answerCheck(A_ID, A_ANSWER);

    // One link in the card, one in the kit item of the check result (below the card).
    const links = screen.getAllByRole("link", { name: SUBSTANCE });
    expect(links).toHaveLength(2);
    fireEvent.click(links[1]);

    expect(address()).toBe(SUBSTANCE_PATH);
    await answerSubstance(screenUnderTest.worker);
    expect(screen.getByText("Pokazano 20 z 28", VISIBLE)).toBeTruthy();
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("leaves a %s-click on a substance link to the browser", async (_label, init) => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    // jsdom cannot navigate: this document listener stops that, after React has had its chance to prevent the default.
    const preventedByScreen: boolean[] = [];
    const seen = (event: Event) => {
      preventedByScreen.push(event.defaultPrevented);
      event.preventDefault();
    };
    document.addEventListener("click", seen);
    try {
      fireEvent.click(within(requireCard()).getByRole("link", { name: SUBSTANCE }), init);
    } finally {
      document.removeEventListener("click", seen);
    }

    expect(preventedByScreen).toEqual([false]);
    expect(address()).toBe(A_PATH);
    expect(screen.queryByRole("heading", { name: `Leki z substancją: ${SUBSTANCE}` })).toBeNull();
    expect(card()).not.toBeNull();
  });

  it("picks a medicine from the list, then goes back to the list with the same number of items", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    fireEvent.click(within(requireCard()).getByRole("link", { name: SUBSTANCE }));
    await answerSubstance(screenUnderTest.worker);
    fireEvent.click(screen.getByRole("button", { name: "Pokaż więcej" }));
    await answerSubstance(screenUnderTest.worker);
    expect(listedNames()).toHaveLength(28);

    const section = substanceHeading().closest("section");
    if (!section) {
      throw new Error("The substance heading is not inside a section");
    }
    const target = within(section)
      .getAllByRole("button")
      .find((button) => button.textContent === "Ibuprom Max400 mgtabletki powlekane");
    if (!target) {
      throw new Error("The medicine is not in the list");
    }
    fireEvent.click(target);

    expect(address()).toBe(`/szukaj?lek=${B_ID}`);
    expect(cardName()).toBe("Ibuprom Max");
    expect(screenUnderTest.checks.pendingChecks(B_ID)).toBe(1);
    expect((screenUnderTest.input as HTMLInputElement).value).toBe("Ibuprom Max");
    await screenUnderTest.answerCheck(B_ID, B_ANSWER);
    expect(screen.getByText(B_VERDICT, VISIBLE)).toBeTruthy();
    expect(document.activeElement).toBe(card());

    await travel("back");
    expect(address()).toBe(SUBSTANCE_PATH);
    expect(card()).toBeNull();
    await answerSubstance(screenUnderTest.worker);
    expect(screen.getByText("Pokazano 28 z 28", VISIBLE)).toBeTruthy();
    expect(listedNames()).toHaveLength(28);

    // One more step back: the medicine the list was opened from, known from its pick, so no lookup is needed.
    await travel("back");
    expect(address()).toBe(A_PATH);
    expect(cardName()).toBe("Ibuprom");

    await travel("forward");
    expect(address()).toBe(SUBSTANCE_PATH);
    await answerSubstance(screenUnderTest.worker);
    expect(screen.getByText("Pokazano 28 z 28", VISIBLE)).toBeTruthy();
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("shows the card and the name of the medicine of the address once the list is loaded", async () => {
    window.history.replaceState(null, "", A_PATH);
    const screenUnderTest = await openSearch(registrySearchList, { initialVariantId: A_ID });
    expect(card()).toBeNull();

    await answerLookup(screenUnderTest.worker);

    expect(cardName()).toBe("Ibuprom");
    expect((screenUnderTest.input as HTMLInputElement).value).toBe("Ibuprom");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screenUnderTest.checks.pendingChecks(A_ID)).toBe(1);
    expect(address()).toBe(A_PATH);
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("shows the plain search, with no message and the address kept, for a medicine id the list does not have", async () => {
    window.history.replaceState(null, "", "/szukaj?lek=999999");
    const screenUnderTest = await openSearch(registrySearchList, { initialVariantId: 999999 });

    await answerLookup(screenUnderTest.worker);

    expect(card()).toBeNull();
    expect((screenUnderTest.input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Wpisz co najmniej 3 litery")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(address()).toBe("/szukaj?lek=999999");
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("opens the list of the substance of the address once the list is loaded", async () => {
    window.history.replaceState(null, "", SUBSTANCE_PATH);
    const screenUnderTest = await openSearch(substanceFilterList, { initialSubstance: SUBSTANCE });
    expect(substanceHeading()).toBeTruthy();

    await answerSubstance(screenUnderTest.worker);

    expect(screen.getByText("Pokazano 20 z 28", VISIBLE)).toBeTruthy();
    expect(address()).toBe(SUBSTANCE_PATH);
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("restores the number of items of the list from the history entry after a reload", async () => {
    window.history.replaceState({ shown: 40 }, "", SUBSTANCE_PATH);
    const screenUnderTest = await openSearch(substanceFilterList, { initialSubstance: SUBSTANCE });

    // The request for 20 items may still be queued next to the one for 40; the newest answer decides.
    // Deliver again on every retry: the second request may only be queued after the first delivery.
    await waitFor(async () => {
      await act(async () => {
        screenUnderTest.worker.deliverAll();
        await Promise.resolve();
      });
      expect(screen.getByText("Pokazano 28 z 28", VISIBLE)).toBeTruthy();
    });
  });

  it("says there is no medicine with the substance of the address when the registry has none", async () => {
    window.history.replaceState(null, "", "/szukaj?substancja=Nieistniejaca");
    const screenUnderTest = await openSearch(registrySearchList, { initialSubstance: "Nieistniejaca" });

    await answerSubstance(screenUnderTest.worker, "Nieistniejaca");

    expect(screen.getByText("Brak leków z substancją „Nieistniejaca” w rejestrze", VISIBLE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pokaż więcej" })).toBeNull();
    expect(screenUnderTest.workers.created).toBe(1);
  });

  it("lets the medicine win when the page passes both", async () => {
    window.history.replaceState(null, "", `/szukaj?lek=${A_ID}&substancja=${SUBSTANCE}`);
    const screenUnderTest = await openSearch(registrySearchList, {
      initialVariantId: A_ID,
      initialSubstance: SUBSTANCE,
    });

    await answerLookup(screenUnderTest.worker);

    expect(cardName()).toBe("Ibuprom");
    expect(screen.queryByRole("heading", { name: `Leki z substancją: ${SUBSTANCE}` })).toBeNull();
  });

  it("replaces the address with the plain /szukaj when the text is edited after a pick", async () => {
    const screenUnderTest = await openSearch();
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    expect(address()).toBe(A_PATH);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");

    screenUnderTest.type("Ibuprom 4");

    expect(replaceState).toHaveBeenCalledWith(null, "", "/szukaj");
    expect(pushState).not.toHaveBeenCalled();
    expect(address()).toBe("/szukaj");
    expect(card()).toBeNull();
  });

  it("leaves the address alone when the text is edited and nothing was picked", async () => {
    const screenUnderTest = await openSearch();
    const replaceState = vi.spyOn(window.history, "replaceState");

    screenUnderTest.type("ibu");

    expect(replaceState).not.toHaveBeenCalled();
  });

  it("leaves the list of a substance when the text is edited", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("ibuprom");
    screenUnderTest.pick(A_OPTION);
    fireEvent.click(within(requireCard()).getByRole("link", { name: SUBSTANCE }));
    await answerSubstance(screenUnderTest.worker);

    screenUnderTest.type("Ibuprom 4");

    expect(screen.queryByRole("heading", { name: `Leki z substancją: ${SUBSTANCE}` })).toBeNull();
    expect(address()).toBe("/szukaj");
  });

  it("starts a click on another substance at 20 items", async () => {
    const screenUnderTest = await openSearch(substanceFilterList);
    await screenUnderTest.search("kombi");
    screenUnderTest.pick(KOMBI_OPTION);
    fireEvent.click(within(requireCard()).getByRole("link", { name: "Coffeinum" }));
    await answerSubstance(screenUnderTest.worker, "Coffeinum");

    expect(address()).toBe("/szukaj?substancja=Coffeinum");
    expect(screen.getByText("Pokazano 2 z 2", VISIBLE)).toBeTruthy();
    expect(window.history.state).toEqual({ shown: 20 });
  });
});
