import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KitAddForm from "@/components/kit/KitAddForm";
import { ID, registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { stubRoutedFetch } from "../../../tests/helpers/fetch";
import type { RegistryVariantPackage } from "@/types";

// The texts below are pinned on purpose, like in RegistrySearch.test.tsx.
const ADD_BUTTON = "Dodaj do apteczki";
const QUANTITY_LABEL = "Ilość w opakowaniu (opcjonalnie)";

// Medicine A: Ibuprom 400 mg. Medicine B: Ibuprom Max 400 mg. Both come from the query "ibuprom".
const A_OPTION = "Ibuprom400 mg · tabletki powlekane";
const B_OPTION = "Ibuprom Max400 mg · tabletki powlekane";
const A_CHOSEN = "Wybrano: Ibuprom · 400 mg · tabletki powlekane";
const B_CHOSEN = "Wybrano: Ibuprom Max · 400 mg · tabletki powlekane";

// One pack per medicine: the form chooses a single pack itself, so quantity and expiry show up at once.
function pack(packageId: number, productId: number): RegistryVariantPackage {
  return {
    packageId,
    productId,
    gtin: null,
    availabilityCategory: null,
    units: [{ count: "30", kind: "tabletki", capacity: null, capacity_unit: null, info: null }],
    holder: null,
  };
}

/** Renders the form and waits until the search list is loaded and the (fake) worker has built its index. */
async function openForm() {
  const routed = stubRoutedFetch(registrySearchList, {
    [ID.ibuprom400]: [pack(1001, ID.ibuprom400)],
    [ID.ibupromMax400]: [pack(1002, ID.ibupromMax400)],
  });
  const Worker = stubSearchWorker();
  render(<KitAddForm version={registrySearchList.version} />);
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

  /** Clicks the option with this text (name directly followed by "moc · postać"). */
  function pick(optionText: string) {
    const option = screen.getAllByRole("option").find((candidate) => candidate.textContent === optionText);
    if (!option) {
      throw new Error(`No option "${optionText}"`);
    }
    fireEvent.click(option);
  }

  /** Searches "ibuprom", picks the option and waits until the pack form is ready for input. */
  async function choose(optionText: string) {
    await search("ibuprom");
    pick(optionText);
    await screen.findByLabelText(QUANTITY_LABEL);
  }

  return { routed, input, type, search, pick, choose };
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

      const posts = form.routed.fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toEqual([]);
    });

    it("shows the pack form of the medicine picked afterwards, also of another variant than before", async () => {
      const form = await openForm();
      await form.choose(A_OPTION);
      form.type("Paracetamol");

      await form.choose(B_OPTION);

      expect(chosen()).toBe(B_CHOSEN);
      expect(addButton()).not.toBeNull();
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
});
