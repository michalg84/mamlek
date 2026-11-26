import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

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

function tokenField() {
  return getForm().querySelector<HTMLInputElement>('input[name="token_hash"]');
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid() {
  type("Nowe hasło", "kot pije mleko");
  type("Powtórz nowe hasło", "kot pije mleko");
}

describe("ResetPasswordForm", () => {
  it("blocks an empty submit and ties each message to its field", () => {
    render(<ResetPasswordForm />);
    const seen = watchSubmit();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const password = screen.getByLabelText("Nowe hasło");
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(password)).toBe("Podaj nowe hasło");
    expect(describedText(confirm)).toBe("Powtórz nowe hasło");
  });

  it("posts the two password fields the endpoint reads, with autocomplete tokens for a password manager", () => {
    render(<ResetPasswordForm />);

    const form = getForm();
    expect(form.getAttribute("action")).toBe("/api/auth/reset-password");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    const password = screen.getByLabelText("Nowe hasło");
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(password.getAttribute("name")).toBe("password");
    expect(confirm.getAttribute("name")).toBe("confirm");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(confirm.getAttribute("autocomplete")).toBe("new-password");
    expect(password.getAttribute("type")).toBe("password");
    expect(confirm.getAttribute("type")).toBe("password");
  });

  it("sends the token of the link in a hidden field", () => {
    render(<ResetPasswordForm tokenHash="abc123" />);

    expect(tokenField()?.type).toBe("hidden");
    expect(tokenField()?.value).toBe("abc123");
    expect(screen.queryByText(/dla konta/)).toBeNull();
  });

  it("names the account and sends no token field when the recovery session holds the state", () => {
    render(<ResetPasswordForm email="ty@przyklad.pl" />);

    expect(tokenField()).toBeNull();
    expect(screen.getByText("ty@przyklad.pl").parentElement?.textContent).toBe("Nowe hasło dla konta ty@przyklad.pl");
  });

  it("rejects a new password of 11 characters with the reason, and lets 12 through", () => {
    render(<ResetPasswordForm />);
    const seen = watchSubmit();
    type("Nowe hasło", "kot pije ml"); // 11 characters
    type("Powtórz nowe hasło", "kot pije ml");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const password = screen.getByLabelText("Nowe hasło");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(password)).toBe("Hasło musi mieć co najmniej 12 znaków. Może to być kilka słów ze spacjami.");

    type("Nowe hasło", "kot pije mle"); // 12 characters
    type("Powtórz nowe hasło", "kot pije mle");
    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Nowe hasło").getAttribute("aria-invalid")).toBeNull();
  });

  it("rejects a new password above 72 bytes, where a Polish letter takes two", () => {
    render(<ResetPasswordForm />);
    const seen = watchSubmit();
    type("Nowe hasło", "ą".repeat(37)); // 74 bytes
    type("Powtórz nowe hasło", "ą".repeat(37));

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    expect(describedText(screen.getByLabelText("Nowe hasło"))).toBe(
      "Hasło jest za długie (limit 72 bajtów; polskie litery zajmują po 2). Skróć je.",
    );
  });

  it("reports a repeat that differs with the message of the mismatch code", () => {
    render(<ResetPasswordForm />);
    const seen = watchSubmit();
    fillValid();
    type("Powtórz nowe hasło", "kot pije herbatę");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const confirm = screen.getByLabelText("Powtórz nowe hasło");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(confirm)).toBe("Hasła nie są takie same.");
  });

  it("hints the missing characters and the example phrase under the new password", () => {
    render(<ResetPasswordForm />);

    type("Nowe hasło", "kot pije"); // 8 characters

    expect(screen.getByText("Jeszcze 4 znaki")).toBeTruthy();
    expect(screen.getByText(/zielony rower pod oknem/)).toBeTruthy();
    expect(screen.getByLabelText("Nowe hasło").getAttribute("aria-describedby")).toBe("password-hint");
  });

  it("disables the button with the pending text after a valid submit, and enables it from the back/forward cache", () => {
    render(<ResetPasswordForm tokenHash="abc123" />);
    const seen = watchSubmit();
    fillValid();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zapisywanie hasła…" }).disabled).toBe(true);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zapisz hasło" }).disabled).toBe(false);
  });

  it("shows the server error as an alert", () => {
    render(<ResetPasswordForm serverError="Nowe hasło musi się różnić od obecnego." />);

    expect(screen.getByRole("alert").textContent).toBe("Nowe hasło musi się różnić od obecnego.");
  });

  it("toggles the visibility of each password field on its own", () => {
    render(<ResetPasswordForm />);

    const [first] = screen.getAllByRole("button", { name: "Pokaż hasło" });
    fireEvent.click(first);

    expect(screen.getAllByRole("button", { name: "Ukryj hasło" })).toHaveLength(1);
    expect(screen.getByLabelText("Nowe hasło").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Powtórz nowe hasło").getAttribute("type")).toBe("password");
  });
});
