import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRegistryMatch } from "@/components/hooks/useRegistryMatch";
import { registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { reply, stubFetch, stubRoutedFetch } from "../../../tests/helpers/fetch";
import type { RegistryVariant, RowMatch } from "@/types";

// Expected variants copied by hand from tests/fixtures/registry-search-list.ts.
const NO_SPA_TABLET: RegistryVariant = {
  id: 8,
  name: "No-Spa",
  strength: "40 mg",
  form: "tabletki",
  commonName: "Drotaverini hydrochloridum",
  substances: ["Drotaverini hydrochloridum"],
};
const IBUPROM_400: RegistryVariant = {
  id: 10,
  name: "Ibuprom",
  strength: "400 mg",
  form: "tabletki powlekane",
  commonName: "Ibuprofenum",
  substances: ["Ibuprofenum"],
};
const IBUPROM_MAX_400: RegistryVariant = {
  id: 12,
  name: "Ibuprom Max",
  strength: "400 mg",
  form: "tabletki powlekane",
  commonName: "Ibuprofenum",
  substances: ["Ibuprofenum"],
};

// Only the tablet has "tabletki" among strength and form, so the first query hits once: assigned on its own.
const NO_SPA_ROW = ["No-Spa 40 mg tabletki", "No-Spa 40 mg", "No-Spa"];
// Nothing in the list starts with "xyzabc".
const UNKNOWN_ROW = ["Xyzabc"];
// Ibuprom 400 mg and Ibuprom Max 400 mg both match the first query (Ibuprom 200 mg lacks "400"); shorter name first.
const IBUPROM_ROW = ["Ibuprom 400 mg tabletki powlekane", "Ibuprom 400 mg", "Ibuprom"];

const NO_SPA_MATCH: RowMatch = { kind: "auto", variant: NO_SPA_TABLET };
const UNKNOWN_MATCH: RowMatch = { kind: "none" };
const IBUPROM_MATCH: RowMatch = { kind: "choices", variants: [IBUPROM_400, IBUPROM_MAX_400], total: 2 };

function createdWorker(Worker: ReturnType<typeof stubSearchWorker>) {
  const worker = Worker.last;
  if (!worker) {
    throw new Error("The search worker was not created");
  }
  return worker;
}

describe("useRegistryMatch", () => {
  it("returns one match per row, in row order", async () => {
    stubRoutedFetch(registrySearchList);
    stubSearchWorker({ autoDeliver: true });
    const rows = [NO_SPA_ROW, UNKNOWN_ROW, IBUPROM_ROW];

    const { result } = renderHook(() => useRegistryMatch(registrySearchList.version, rows));
    expect(result.current.status).toBe("loading");
    expect(result.current.matches).toBeNull();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.matches).toEqual([NO_SPA_MATCH, UNKNOWN_MATCH, IBUPROM_MATCH]);
  });

  it("ignores the answer for an earlier set of rows", async () => {
    stubRoutedFetch(registrySearchList);
    const Worker = stubSearchWorker();
    const first = [IBUPROM_ROW];
    const second = [UNKNOWN_ROW, NO_SPA_ROW];

    const { result, rerender } = renderHook(({ rows }) => useRegistryMatch(registrySearchList.version, rows), {
      initialProps: { rows: first },
    });
    await waitFor(() => {
      expect(createdWorker(Worker).pendingMatches()).toEqual([first]);
    });

    rerender({ rows: second });
    const worker = createdWorker(Worker);
    expect(worker.pendingMatches()).toEqual([first, second]);

    // The answer for the first set arrives after the rows changed: it must not show up as the second set's matches.
    await act(async () => {
      worker.deliverMatch();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.matches).toBeNull();

    await act(async () => {
      worker.deliverMatch();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.matches).toEqual([UNKNOWN_MATCH, NO_SPA_MATCH]);
  });

  it("reports a failed list load as an error and matches the rows after a retry", async () => {
    const fetchMock = stubFetch(
      () => reply({ error: "boom" }, 500),
      () => reply(registrySearchList),
    );
    const Worker = stubSearchWorker({ autoDeliver: true });
    const rows = [NO_SPA_ROW];

    const { result } = renderHook(() => useRegistryMatch(registrySearchList.version, rows));
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.matches).toBeNull();
    // The list never arrived, so no worker was started.
    expect(Worker.last).toBeNull();

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.matches).toEqual([NO_SPA_MATCH]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an expired session as an error", async () => {
    stubFetch(() => reply({ error: "unauthorized" }, 401));
    stubSearchWorker({ autoDeliver: true });
    const rows = [NO_SPA_ROW];

    const { result } = renderHook(() => useRegistryMatch(registrySearchList.version, rows));
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.matches).toBeNull();
  });
});
