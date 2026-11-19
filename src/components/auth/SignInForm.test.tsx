import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SignInForm from "@/components/auth/SignInForm";

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

function fillValid() {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ty@przyklad.pl" } });
  fireEvent.change(screen.getByLabelText("Hasło"), { target: { value: "sekret123" } });
}

describe("SignInForm", () => {
  it("blocks an empty submit and ties each message to its field", () => {
    render(<SignInForm />);
    const seen = watchSubmit();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    const password = screen.getByLabelText("Hasło");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj adres e-mail");
    expect(describedText(password)).toBe("Podaj hasło");
  });

  it("disables the button with the pending text after a valid submit", () => {
    render(<SignInForm />);
    const seen = watchSubmit();
    fillValid();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Logowanie…" }).disabled).toBe(true);
  });

  it("enables the button again when the page is restored from the back/forward cache", () => {
    render(<SignInForm />);
    watchSubmit();
    fillValid();
    fireEvent.submit(getForm());
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Logowanie…" }).disabled).toBe(true);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zaloguj się" }).disabled).toBe(false);
  });

  it("keeps the button disabled on a pageshow that is not from the cache", () => {
    render(<SignInForm />);
    watchSubmit();
    fillValid();
    fireEvent.submit(getForm());

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Logowanie…" }).disabled).toBe(true);
  });

  it("shows the server error as an alert", () => {
    render(<SignInForm serverError="Nieprawidłowy e-mail lub hasło" />);

    expect(screen.getByRole("alert").textContent).toBe("Nieprawidłowy e-mail lub hasło");
  });

  it("rejects a malformed e-mail address with a message tied to the field", () => {
    render(<SignInForm />);
    const seen = watchSubmit();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ty@przyklad" } });
    fireEvent.change(screen.getByLabelText("Hasło"), { target: { value: "sekret123" } });

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj poprawny adres e-mail");
  });

  it("names the fields the sign-in endpoint reads", () => {
    render(<SignInForm />);

    expect(screen.getByLabelText("E-mail").getAttribute("name")).toBe("email");
    expect(screen.getByLabelText("Hasło").getAttribute("name")).toBe("password");
  });

  it("toggles the password visibility label", () => {
    render(<SignInForm />);

    fireEvent.click(screen.getByRole("button", { name: "Pokaż hasło" }));

    expect(screen.getByRole("button", { name: "Ukryj hasło" })).toBeTruthy();
    expect(screen.getByLabelText("Hasło").getAttribute("type")).toBe("text");
  });
});
