import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";

let stopWatching: (() => void) | null = null;

afterEach(() => {
  stopWatching?.();
  stopWatching = null;
});

/**
 * Records `defaultPrevented` of the submit event after React handled it (the listener sits on `document`, above
 * the React root), then prevents it itself so jsdom does not navigate (the real form is a native POST).
 */
function watchSubmit() {
  const seen = { defaultPrevented: false };
  const listener = (event: Event) => {
    seen.defaultPrevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("submit", listener);
  stopWatching = () => {
    document.removeEventListener("submit", listener);
  };
  return seen;
}

/** Text of the element a field points at with aria-describedby. */
function describedText(field: HTMLElement) {
  return document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent;
}

function getForm(): HTMLFormElement {
  const form = document.querySelector("form");
  if (!form) throw new Error("No form rendered");
  return form;
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid() {
  type("Obecne hasło", "stare slabe haslo");
  type("Nowe hasło", "kot pije mleko");
  type("Powtórz nowe hasło", "kot pije mleko");
}

describe("ChangePasswordForm", () => {
  it("blocks an empty submit and ties each message to its field", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const current = screen.getByLabelText("Obecne hasło");
    const password = screen.getByLabelText("Nowe hasło");
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(current.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(current)).toBe("Podaj obecne hasło");
    expect(describedText(password)).toBe("Podaj nowe hasło");
    expect(describedText(confirm)).toBe("Powtórz nowe hasło");
  });

  it("posts the three fields the endpoint reads, with autocomplete tokens for a password manager", () => {
    render(<ChangePasswordForm />);

    const form = getForm();
    expect(form.getAttribute("action")).toBe("/api/auth/password");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    const current = screen.getByLabelText("Obecne hasło");
    const password = screen.getByLabelText("Nowe hasło");
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(current.getAttribute("name")).toBe("current");
    expect(password.getAttribute("name")).toBe("password");
    expect(confirm.getAttribute("name")).toBe("confirm");
    expect(current.getAttribute("autocomplete")).toBe("current-password");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(confirm.getAttribute("autocomplete")).toBe("new-password");
    expect(current.getAttribute("type")).toBe("password");
    expect(password.getAttribute("type")).toBe("password");
    expect(confirm.getAttribute("type")).toBe("password");
  });

  it("rejects a new password of 11 characters with the reason, and lets 12 through", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();
    fillValid();
    type("Nowe hasło", "kot pije ml"); // 11 characters
    type("Powtórz nowe hasło", "kot pije ml");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const password = screen.getByLabelText("Nowe hasło");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(password)).toBe("Hasło musi mieć co najmniej 12 znaków. Może to być kilka słów ze spacjami.");

    type("Nowe hasło", "kot pije mlek"); // 13 characters
    type("Powtórz nowe hasło", "kot pije mlek");
    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Nowe hasło").getAttribute("aria-invalid")).toBeNull();
  });

  it("rejects a new password above 72 bytes, where a Polish letter takes two", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();
    fillValid();
    type("Nowe hasło", "ą".repeat(37)); // 74 bytes
    type("Powtórz nowe hasło", "ą".repeat(37));

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    expect(describedText(screen.getByLabelText("Nowe hasło"))).toBe(
      "Hasło jest za długie (limit 72 bajtów; polskie litery zajmują po 2). Skróć je.",
    );

    type("Nowe hasło", "ą".repeat(36)); // 72 bytes
    type("Powtórz nowe hasło", "ą".repeat(36));
    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
  });

  it("reports a repeat that differs with the message of the mismatch code", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();
    fillValid();
    type("Powtórz nowe hasło", "kot pije herbatę");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(confirm)).toBe("Hasła nie są takie same.");
  });

  it("refuses a new password equal to the current one before it leaves the page", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();
    fillValid();
    type("Obecne hasło", "kot pije mleko");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    expect(describedText(screen.getByLabelText("Nowe hasło"))).toBe("Nowe hasło musi się różnić od obecnego.");
  });

  it.each([
    ["kot pije ml", "Jeszcze 1 znak"], // 11 characters
    ["kot pije", "Jeszcze 4 znaki"], // 8 characters
    ["s", "Jeszcze 11 znaków"],
    ["😀".repeat(10), "Jeszcze 2 znaki"], // 10 code points, 20 UTF-16 units
  ])("hints the missing characters for the new password %j", (value, hint) => {
    render(<ChangePasswordForm />);

    type("Nowe hasło", value);

    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.getByLabelText("Nowe hasło").getAttribute("aria-describedby")).toBe("password-hint");
  });

  it("shows the example phrase, and no counter once the new password has 12 characters", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByText(/Najłatwiej zapamiętać kilka słów, np\. „zielony rower pod oknem”/)).toBeTruthy();

    type("Nowe hasło", "kot pije mlek");

    expect(screen.queryByText(/Jeszcze/)).toBeNull();
    expect(screen.getByText(/zielony rower pod oknem/)).toBeTruthy();
  });

  it("does not cap the fields with maxLength, which counts UTF-16 units and not bytes", () => {
    render(<ChangePasswordForm />);

    expect(screen.getByLabelText("Nowe hasło").hasAttribute("maxlength")).toBe(false);
  });

  it("disables the button with the pending text after a valid submit, and enables it from the back/forward cache", () => {
    render(<ChangePasswordForm />);
    const seen = watchSubmit();
    fillValid();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zmienianie hasła…" }).disabled).toBe(true);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zmień hasło" }).disabled).toBe(false);
  });

  it("shows the server error as an alert, whatever the screen was opened for", () => {
    render(<ChangePasswordForm serverError="Obecne hasło jest nieprawidłowe." />);

    expect(screen.getByRole("alert").textContent).toBe("Obecne hasło jest nieprawidłowe.");
  });

  it("toggles the visibility of each password field on its own", () => {
    render(<ChangePasswordForm />);

    const [first] = screen.getAllByRole("button", { name: "Pokaż hasło" });
    fireEvent.click(first);

    expect(screen.getAllByRole("button", { name: "Ukryj hasło" })).toHaveLength(1);
    expect(screen.getByLabelText("Obecne hasło").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Nowe hasło").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Powtórz nowe hasło").getAttribute("type")).toBe("password");
  });
});
