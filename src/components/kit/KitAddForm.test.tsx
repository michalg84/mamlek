import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KitAddForm from "@/components/kit/KitAddForm";
import { ID, registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { reply, stubRoutedFetch, type RoutedFetch, type RoutedFetchOptions } from "../../../tests/helpers/fetch";
import type { RegistrySearchListPayload, RegistryVariantPackage } from "@/types";

// The texts below are pinned on purpose, like in RegistrySearch.test.tsx.
const ADD_BUTTON = "Dodaj do apteczki";
const QUANTITY_LABEL = "Ilość w opakowaniu (opcjonalnie)";

// Medicine A: Ibuprom 400 mg. Medicine B: Ibuprom Max 400 mg. Both come from the query "ibuprom".
// An option shows the name, the strength and the form, each on its own line.
const A_OPTION = "Ibuprom400 mgtabletki powlekane";
const B_OPTION = "Ibuprom Max400 mgtabletki powlekane";
const A_CHOSEN = "Wybrano: Ibuprom · 400 mg · tabletki powlekane";
const B_CHOSEN = "Wybrano: Ibuprom Max · 400 mg · tabletki powlekane";

// One pack per medicine by default: the form chooses a single pack itself, so quantity and expiry show up at once.
function pack(
  packageId: number,
  productId: number,
  { count = "30", withdrawn = false }: { count?: string; withdrawn?: boolean } = {},
): RegistryVariantPackage {
  return {
    packageId,
    productId,
    gtin: null,
    availabilityCategory: null,
    units: [{ count, kind: "tabletki", capacity: null, capacity_unit: null, info: null }],
    holder: null,
    withdrawn,
  };
}

/** Renders the form and waits until the search list is loaded and the (fake) worker has built its index. */
async function openForm({
  packages = {
    [ID.ibuprom400]: [pack(1001, ID.ibuprom400)],
    [ID.ibupromMax400]: [pack(1002, ID.ibupromMax400)],
  },
  list = registrySearchList,
  ...options
}: RoutedFetchOptions & {
  packages?: Partial<Record<number, RegistryVariantPackage[]>>;
  list?: RegistrySearchListPayload;
} = {}) {
  const routed = stubRoutedFetch(list, packages, options);
  const Worker = stubSearchWorker();
  render(<KitAddForm version={list.version} />);
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

  /** Types `value` and lets the worker answer it at once. */
  async function search(value: string) {
    type(value);
    await act(async () => {
      worker.deliver(value);
      await Promise.resolve();
    });
  }

  /** Clicks the option with this text (name, strength and form, each on its own line). */
  function pick(optionText: string) {
    const option = screen.getAllByRole("option").find((candidate) => candidate.textContent === optionText);
    if (!option) {
      throw new Error(`No option "${optionText}"`);
    }
    fireEvent.click(option);
  }

  /** Searches "ibuprom", picks the option and waits until the packs are listed (a pack may still be unchosen). */
  async function chooseMedicine(optionText: string) {
    await search("ibuprom");
    pick(optionText);
    await screen.findByText("Wybrano:");
    await waitFor(() => {
      expect(screen.queryByText("Wczytywanie opakowań…")).toBeNull();
    });
  }

  /** Searches "ibuprom", picks the option and waits until the pack form is ready for input. */
  async function choose(optionText: string) {
    await search("ibuprom");
    pick(optionText);
    await screen.findByLabelText(QUANTITY_LABEL);
  }

  return { routed, input, type, search, pick, choose, chooseMedicine };
}

/** Text of the „Wybrano: …” line of the pack form; null when there is no pack form. */
function chosen() {
  return screen.queryByText("Wybrano:")?.textContent ?? null;
}

function addButton() {
  return screen.queryByRole("button", { name: ADD_BUTTON });
}

function quantityField() {
  return screen.getByLabelText<HTMLInputElement>(QUANTITY_LABEL);
}

/** Bodies of the `POST /api/kit` requests made so far (the routed fetch refuses them, but records the call). */
function addRequests(routed: RoutedFetch): unknown[] {
  return routed.fetchMock.mock.calls
    .filter(([input, init]) => input === "/api/kit" && init?.method === "POST")
    .map(([, init]) => JSON.parse(init?.body as string) as unknown);
}

function addPosts(routed: { fetchMock: { mock: { calls: Parameters<typeof fetch>[] } } }) {
  return routed.fetchMock.mock.calls.filter(([input, init]) => input === "/api/kit" && init?.method === "POST");
}

describe("KitAddForm", () => {
  it("shows the pack form of the picked medicine with the add button", async () => {
    const form = await openForm();

    await form.choose(A_OPTION);

    expect(chosen()).toBe(A_CHOSEN);
    expect(addButton()).not.toBeNull();
  });

  describe("after the text is edited", () => {
    it("drops the pack form and the add button when the text becomes another name", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);

      form.type("Paracetamol");

      expect(chosen()).toBeNull();
      expect(addButton()).toBeNull();
    });

    it("drops the pack form when the field is cleared", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);

      form.type("");

      expect(chosen()).toBeNull();
      expect(addButton()).toBeNull();
    });

    it("drops the pack form when one letter is deleted, and typing the name back does not restore it", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);

      form.type("Ibupro");
      expect(chosen()).toBeNull();
      expect(addButton()).toBeNull();

      form.type("Ibuprom");
      expect(chosen()).toBeNull();
      expect(addButton()).toBeNull();
    });

    it("adds nothing to the kit", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);

      form.type("Paracetamol");
      // The user presses the button if it is still there; with the button gone nothing can be sent.
      const button = addButton();
      if (button) {
        await act(async () => {
          fireEvent.click(button);
          await Promise.resolve();
        });
      }

      expect(addPosts(form.routed)).toEqual([]);
    });

    it("shows the pack form of the medicine picked afterwards, also of another variant than before", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);
      form.type("Paracetamol");

      await form.choose(B_OPTION);

      expect(chosen()).toBe(B_CHOSEN);
      expect(addButton()).not.toBeNull();
      // The pack form shows the packs of the medicine picked last, not of the first one.
      expect(form.routed.packageRequests()).toEqual([ID.ibuprom400, ID.ibupromMax400]);
    });

    it("shows the pack form of the same medicine picked again, with empty quantity and expiry", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);
      fireEvent.change(quantityField(), { target: { value: "12" } });
      fireEvent.change(screen.getByLabelText("Miesiąc"), { target: { value: "6" } });
      fireEvent.change(screen.getByLabelText("Rok"), { target: { value: String(new Date().getFullYear() + 1) } });
      expect(quantityField().value).toBe("12");

      form.type("Ibupro");
      await form.choose(A_OPTION);

      expect(chosen()).toBe(A_CHOSEN);
      expect(quantityField().value).toBe("");
      expect(screen.getByLabelText<HTMLSelectElement>("Miesiąc").value).toBe("");
      expect(screen.getByLabelText<HTMLSelectElement>("Rok").value).toBe("");
    });
  });
  describe("withdrawn packs", () => {
    const WITHDRAWN_LABEL = /^50 tabletki\s*· wycofane$/;

    it("lists an active and a withdrawn pack, marks the withdrawn one, chooses none itself and saves the one picked", async () => {
      const form = await openForm({
        packages: {
          [ID.ibuprom400]: [pack(1001, ID.ibuprom400), pack(1003, ID.ibuprom400, { count: "50", withdrawn: true })],
        },
      });

      await form.chooseMedicine(A_OPTION);

      const radios = screen.getAllByRole("radio");
      expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false"]);
      // The active pack has no mark; the withdrawn one has.
      expect(screen.getByRole("radio", { name: "30 tabletki" })).toBe(radios[0]);
      expect(screen.getByRole("radio", { name: WITHDRAWN_LABEL })).toBe(radios[1]);
      expect(screen.queryByLabelText(QUANTITY_LABEL)).toBeNull();
      expect(addButton()?.hasAttribute("disabled")).toBe(true);

      fireEvent.click(radios[1]);
      expect(screen.getByRole("radio", { name: WITHDRAWN_LABEL }).getAttribute("aria-checked")).toBe("true");
      const button = addButton();
      if (!button) {
        throw new Error("No add button");
      }
      fireEvent.click(button);

      await waitFor(() => {
        expect(addRequests(form.routed)).toEqual([{ packageId: 1003, quantity: null, expiry: null }]);
      });
    });

    it("chooses a single withdrawn pack itself and marks it", async () => {
      const form = await openForm({
        packages: { [ID.ibuprom400]: [pack(1003, ID.ibuprom400, { count: "50", withdrawn: true })] },
      });

      await form.choose(A_OPTION);

      const radio = screen.getByRole("radio", { name: WITHDRAWN_LABEL });
      expect(radio.getAttribute("aria-checked")).toBe("true");
      expect(addButton()?.hasAttribute("disabled")).toBe(false);
    });

    // A withdrawn GTIN of the same product and label as an active one is no real choice: `uniquePacks` keeps only
    // the active pack (it comes first), so the variant counts as having one pack and that pack is chosen itself.
    it("hides a withdrawn twin of an active pack and chooses the active one itself", async () => {
      const form = await openForm({
        packages: { [ID.ibuprom400]: [pack(1001, ID.ibuprom400), pack(1004, ID.ibuprom400, { withdrawn: true })] },
      });

      await form.choose(A_OPTION);

      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(1);
      expect(screen.getByRole("radio", { name: "30 tabletki" }).getAttribute("aria-checked")).toBe("true");
      const button = addButton();
      if (!button) {
        throw new Error("No add button");
      }
      fireEvent.click(button);

      await waitFor(() => {
        expect(addRequests(form.routed)).toEqual([{ packageId: 1001, quantity: null, expiry: null }]);
      });
    });

    it("says „wycofany z rejestru” under the picked medicine when the whole medicine is withdrawn", async () => {
      // Ibuprom 400 mg withdrawn as a whole: its tuple gets the 7th element.
      const list: RegistrySearchListPayload = {
        ...registrySearchList,
        variants: registrySearchList.variants.map((tuple) =>
          tuple[0] === ID.ibuprom400 ? [...tuple.slice(0, 6), true] : tuple,
        ) as RegistrySearchListPayload["variants"],
      };
      const form = await openForm({
        list,
        packages: { [ID.ibuprom400]: [pack(1003, ID.ibuprom400, { withdrawn: true })] },
      });

      await form.choose(A_OPTION + "wycofany z rejestru");

      expect(chosen()).toBe(A_CHOSEN + "wycofany z rejestru");
    });

    it("says there are no packs of the medicine in the registry when the list is empty", async () => {
      const form = await openForm({ packages: { [ID.ibuprom400]: [] } });

      await form.chooseMedicine(A_OPTION);

      expect(screen.getByText("Brak opakowań tego leku w rejestrze")).not.toBeNull();
      expect(screen.queryAllByRole("radio")).toEqual([]);
      expect(addButton()?.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("errors", () => {
    it("does not read an unreadable quantity as an unknown one and sends nothing", async () => {
      const form = await openForm({ addKit: () => reply({ id: 1 }, 201) });
      await form.choose(A_OPTION);

      // What the browser reports for "-" or "1e": an empty value with `validity.badInput`. The field was empty already, so
      // the value does not change and React fires no change event: the form must read the flag from the field.
      Object.defineProperty(quantityField(), "validity", { value: { badInput: true } });
      fireEvent.click(screen.getByRole("button", { name: ADD_BUTTON }));

      expect(screen.getByText("Podaj liczbę całkowitą, 0 lub większą")).toBeTruthy();
      expect(addPosts(form.routed)).toEqual([]);
    });

    it("shows a Polish message for a rejected add, never the text of the server, and logs the answer", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const form = await openForm({ addKit: () => reply({ error: "Invalid package" }, 400) });
      await form.choose(A_OPTION);

      fireEvent.click(screen.getByRole("button", { name: ADD_BUTTON }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("Nie udało się dodać leku — sprawdź dane albo wybierz lek ponownie");
      expect(screen.queryByText(/Invalid package/)).toBeNull();
      expect(log).toHaveBeenCalledWith("Adding a kit item failed", 400, { error: "Invalid package" });
    });

    it("shows the retry message for a server failure and logs the cause of a network failure", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      let answer = () => reply({ error: "Kit storage unavailable" }, 503);
      const form = await openForm({ addKit: () => answer() });
      await form.choose(A_OPTION);

      fireEvent.click(screen.getByRole("button", { name: ADD_BUTTON }));
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Nie udało się dodać leku do apteczki, spróbuj ponownie",
      );
      expect(log).toHaveBeenCalledWith("Adding a kit item failed", 503, { error: "Kit storage unavailable" });

      const cause = new TypeError("Failed to fetch");
      answer = () => Promise.reject(cause);
      fireEvent.click(screen.getByRole("button", { name: ADD_BUTTON }));
      await screen.findByText("Nie udało się połączyć z serwerem, spróbuj ponownie");
      expect(log).toHaveBeenCalledWith(cause);
    });
  });
});
