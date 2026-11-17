import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MedicineCheckResult } from "@/components/registry/MedicineCheckResult";
import { reply, stubFetch } from "../../../tests/helpers/fetch";
import type { MatchLevel, MedicineCheckItem, MedicineCheckResponse } from "@/types";

// The texts below are pinned on purpose: the legal wording of the caution is still an open question (PRD Open
// Question 5), and a change to it should be a conscious edit of this one constant.
const CAUTION = "Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.";
const UNCOMPARABLE =
  "Rejestr nie podaje substancji czynnych tego leku, więc nie dało się sprawdzić leków z tą samą substancją.";
// The caution of the loose levels: the matching medicines may differ in composition.
const LOOSE_CAUTION = "Te leki mogą mieć inny skład. Nie zamieniaj ich bez porady farmaceuty lub lekarza.";
const NOT_OWNED = "Nie masz tego leku";
const ERROR = "Nie udało się sprawdzić apteczki.";
const RETRY = "Spróbuj ponownie";
// The live region repeats the verdict for screen readers, so visible text is looked up outside of it.
const VISIBLE = { ignore: "[role=status]" };

let nextId = 1;

function item(match: MedicineCheckItem["match"], overrides: Partial<MedicineCheckItem> = {}): MedicineCheckItem {
  const id = nextId++;
  return {
    id,
    packageId: 1000 + id,
    match,
    matchedBy: match === "substance" ? "common_name" : null,
    name: match === "variant" ? "Sortis" : "Atoris",
    strength: "20 mg",
    form: "tabletki powlekane",
    holder: null,
    commonName: "Atorvastatinum",
    substances: ["Atorvastatinum calcicum"],
    units: [],
    quantity: null,
    expiresOn: null,
    expiryPrecision: null,
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function response(items: MedicineCheckItem[], comparable = true, level: MatchLevel = "exact"): MedicineCheckResponse {
  return {
    searched: {
      id: 1,
      name: "Sortis",
      strength: "20 mg",
      form: "tabletki powlekane",
      commonName: "Atorvastatinum",
      substances: ["Atorvastatinum calcicum"],
    },
    level,
    comparable,
    items,
  };
}

describe("MedicineCheckResult", () => {
  it("shows the caution next to a same-substance verdict, on screen and for screen readers", async () => {
    stubFetch(() => reply(response([item("substance")])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Masz lek z tą samą substancją czynną", VISIBLE)).toBeTruthy();
    expect(screen.getByText(CAUTION, VISIBLE)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(CAUTION);
  });

  it("shows the caution under „Także z tą samą substancją czynną” when the medicine itself is in the kit too", async () => {
    stubFetch(() => reply(response([item("variant"), item("substance")])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    const section = screen.getByRole("region", { name: "Także z tą samą substancją czynną" });
    expect(within(section).getByText(CAUTION)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(CAUTION);
  });

  it("shows no caution when the kit holds only the medicine itself", async () => {
    stubFetch(() => reply(response([item("variant")])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    expect(screen.queryByText(CAUTION, VISIBLE)).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain(CAUTION);
  });

  it("says nothing about the substance when the registry lists none for the medicine", async () => {
    stubFetch(() => reply(response([], false)));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText(NOT_OWNED, VISIBLE)).toBeTruthy();
    expect(screen.getByText(UNCOMPARABLE, VISIBLE)).toBeTruthy();
    expect(screen.queryByText("Ani leku z tą samą substancją czynną", VISIBLE)).toBeNull();
  });

  it("does not count an empty pack, lists it under „Puste opakowania” and announces it", async () => {
    stubFetch(() => reply(response([item("variant", { quantity: 0 }), item("variant", { quantity: 3 })])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    const empty = screen.getByRole("region", { name: "Puste opakowania" });
    expect(within(empty).getByText("Ilość: 0").textContent).toContain("puste");
    expect(within(empty).queryByText("Ilość: 3")).toBeNull();
    expect(screen.getByText("Ilość: 3", VISIBLE).textContent).not.toContain("puste");
    expect(screen.getByRole("status").textContent).toContain("Puste opakowania w apteczce: 1");
  });

  it("says „Nie masz tego leku” when every matching pack is empty, and still lists them", async () => {
    stubFetch(() => reply(response([item("variant", { quantity: 0 }), item("substance", { quantity: 0 })])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText(NOT_OWNED, VISIBLE)).toBeTruthy();
    expect(screen.queryByText(CAUTION, VISIBLE)).toBeNull();
    const empty = screen.getByRole("region", { name: "Puste opakowania" });
    expect(within(empty).getAllByText(/Ilość: 0/)).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("Puste opakowania w apteczce: 2");
  });

  it("shows no „Puste opakowania” section when no matching pack is empty", async () => {
    stubFetch(() => reply(response([item("variant", { quantity: 3 }), item("variant")])));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Masz ten lek · 2 opakowania", VISIBLE)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Puste opakowania" })).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain("Puste");
  });

  it.each([
    ["a 500 answer", () => reply({ error: "boom" }, 500)],
    ["a 404 answer", () => reply({ error: "not found" }, 404)],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a 200 answer with an unreadable body", () => Promise.resolve(new Response("<html>oops</html>", { status: 200 }))],
    [
      "a 200 answer with an unknown match type",
      () => reply({ ...response([]), items: [item("variant"), { ...item("substance"), match: "ingredient" }] }),
    ],
    ["a 200 answer without items", () => reply({ searched: response([]).searched, comparable: true })],
  ])("shows an error with a retry button, never „Nie masz”, on %s", async (_label, respond) => {
    stubFetch(respond);
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText(ERROR, VISIBLE)).toBeTruthy();
    expect(screen.getByRole("button", { name: RETRY })).toBeTruthy();
    expect(screen.queryByText(NOT_OWNED)).toBeNull();
  });

  it("asks to sign in again on a 401 answer, never saying „Nie masz”", async () => {
    stubFetch(() => reply({ error: "unauthorized" }, 401));
    render(<MedicineCheckResult productId={1} level="exact" />);

    expect(await screen.findByText("Sesja wygasła — zaloguj się ponownie", VISIBLE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/auth/signin");
    expect(screen.queryByText(NOT_OWNED)).toBeNull();
  });

  it("asks again after an error and shows the verdict of the second answer", async () => {
    const fetchMock = stubFetch(
      () => reply({ error: "boom" }, 500),
      () => reply(response([item("variant")])),
    );
    render(<MedicineCheckResult productId={1} level="exact" />);

    fireEvent.click(await screen.findByRole("button", { name: RETRY }));

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(ERROR)).toBeNull();
  });

  it("asks for the given level and shows the verdict of that level", async () => {
    const fetchMock = stubFetch(() => reply(response([item("substance")], true, "any")));
    render(<MedicineCheckResult productId={1} level="any" />);

    expect(await screen.findByText("Masz lek ze wspólnym składnikiem", VISIBLE)).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/kit/check?product=1&level=any");
  });

  it("shows an error, never a verdict, when the answer is for another level", async () => {
    stubFetch(() => reply(response([item("substance")], true, "exact")));
    render(<MedicineCheckResult productId={1} level="all" />);

    expect(await screen.findByText(ERROR, VISIBLE)).toBeTruthy();
    expect(screen.queryByText("Masz lek z tą samą substancją czynną", VISIBLE)).toBeNull();
  });
});

describe("MedicineCheckResult on each match level", () => {
  const levels: { level: MatchLevel; title: string; heading: string; none: string; caution: string }[] = [
    {
      level: "exact",
      title: "Masz lek z tą samą substancją czynną",
      heading: "Także z tą samą substancją czynną",
      none: "Ani leku z tą samą substancją czynną",
      caution: CAUTION,
    },
    {
      level: "all",
      title: "Masz lek zawierający składniki tego leku",
      heading: "Także leki zawierające jego składniki",
      none: "Ani leku zawierającego jego składniki",
      caution: LOOSE_CAUTION,
    },
    {
      level: "any",
      title: "Masz lek ze wspólnym składnikiem",
      heading: "Także leki ze wspólnym składnikiem",
      none: "Ani leku z żadnym z jego składników",
      caution: LOOSE_CAUTION,
    },
  ];

  it.each(levels)(
    "$level: the substance verdict carries the caution of the level, on screen and for screen readers",
    async ({ level, title, caution }) => {
      stubFetch(() => reply(response([item("substance")], true, level)));
      render(<MedicineCheckResult productId={1} level={level} />);

      expect(await screen.findByText(title, VISIBLE)).toBeTruthy();
      expect(screen.getByText(caution, VISIBLE)).toBeTruthy();
      const status = screen.getByRole("status").textContent;
      expect(status).toContain(title);
      expect(status).toContain(caution);
      // Announced once: the live region holds the caution a single time.
      expect(status.split(caution).length).toBe(2);
    },
  );

  it.each(levels)(
    "$level: the items listed under the medicine itself get the heading and caution of the level",
    async ({ level, heading, caution }) => {
      stubFetch(() => reply(response([item("variant"), item("substance")], true, level)));
      render(<MedicineCheckResult productId={1} level={level} />);

      const section = await screen.findByRole("region", { name: heading });
      expect(within(section).getByText(caution)).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain(caution);
    },
  );

  it.each(levels)(
    "$level: nothing found names what the level looked for and shows no caution",
    async ({ level, none, caution }) => {
      stubFetch(() => reply(response([], true, level)));
      render(<MedicineCheckResult productId={1} level={level} />);

      expect(await screen.findByText(NOT_OWNED, VISIBLE)).toBeTruthy();
      expect(screen.getByText(none, VISIBLE)).toBeTruthy();
      expect(screen.queryByText(caution, VISIBLE)).toBeNull();
    },
  );
});
