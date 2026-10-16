import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RegistrySearch from "@/components/registry/RegistrySearch";
import { registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { stubRoutedFetch } from "../../../tests/helpers/fetch";

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
});
