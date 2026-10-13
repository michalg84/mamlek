import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MedicineCheckResult } from "@/components/registry/MedicineCheckResult";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

// The texts below are pinned on purpose: the legal wording of the caution is still an open question (PRD Open
// Question 5), and a change to it should be a conscious edit of this one constant.
const CAUTION = "Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.";
const UNCOMPARABLE =
  "Rejestr nie podaje substancji czynnych tego leku, więc nie dało się sprawdzić leków z tą samą substancją.";
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

function response(items: MedicineCheckItem[], comparable = true): MedicineCheckResponse {
  return {
    searched: {
      id: 1,
      name: "Sortis",
      strength: "20 mg",
      form: "tabletki powlekane",
      commonName: "Atorvastatinum",
      substances: ["Atorvastatinum calcicum"],
    },
    comparable,
    items,
  };
}

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Replaces `fetch`; each call to the check endpoint takes the next reply, the last one repeats. */
function stubFetch(...replies: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  replies.forEach((respond, index) => {
    if (index < replies.length - 1) {
      fetchMock.mockImplementationOnce(respond);
    } else {
      fetchMock.mockImplementation(respond);
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MedicineCheckResult", () => {
  it("shows the caution next to a same-substance verdict, on screen and for screen readers", async () => {
    stubFetch(() => reply(response([item("substance")])));
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText("Masz lek z tą samą substancją czynną", VISIBLE)).toBeTruthy();
    expect(screen.getByText(CAUTION, VISIBLE)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(CAUTION);
  });

  it("shows the caution under „Także z tą samą substancją czynną” when the medicine itself is in the kit too", async () => {
    stubFetch(() => reply(response([item("variant"), item("substance")])));
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    const section = screen.getByRole("region", { name: "Także z tą samą substancją czynną" });
    expect(within(section).getByText(CAUTION)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(CAUTION);
  });

  it("shows no caution when the kit holds only the medicine itself", async () => {
    stubFetch(() => reply(response([item("variant")])));
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    expect(screen.queryByText(CAUTION, VISIBLE)).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain(CAUTION);
  });

  it("says nothing about the substance when the registry lists none for the medicine", async () => {
    stubFetch(() => reply(response([], false)));
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText(NOT_OWNED, VISIBLE)).toBeTruthy();
    expect(screen.getByText(UNCOMPARABLE, VISIBLE)).toBeTruthy();
    expect(screen.queryByText("Ani leku z tą samą substancją czynną", VISIBLE)).toBeNull();
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
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText(ERROR, VISIBLE)).toBeTruthy();
    expect(screen.getByRole("button", { name: RETRY })).toBeTruthy();
    expect(screen.queryByText(NOT_OWNED)).toBeNull();
  });

  it("asks to sign in again on a 401 answer, never saying „Nie masz”", async () => {
    stubFetch(() => reply({ error: "unauthorized" }, 401));
    render(<MedicineCheckResult productId={1} />);

    expect(await screen.findByText("Sesja wygasła — zaloguj się ponownie", VISIBLE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/auth/signin");
    expect(screen.queryByText(NOT_OWNED)).toBeNull();
  });

  it("asks again after an error and shows the verdict of the second answer", async () => {
    const fetchMock = stubFetch(
      () => reply({ error: "boom" }, 500),
      () => reply(response([item("variant")])),
    );
    render(<MedicineCheckResult productId={1} />);

    fireEvent.click(await screen.findByRole("button", { name: RETRY }));

    expect(await screen.findByText("Masz ten lek · 1 opakowanie", VISIBLE)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(ERROR)).toBeNull();
  });
});
