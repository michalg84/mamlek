import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SignUpForm from "@/components/auth/SignUpForm";

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
  type("E-mail", "ty@przyklad.pl");
  type("Hasło", "sekret123");
  type("Powtórz hasło", "sekret123");
}

describe("SignUpForm", () => {
  it("blocks an empty submit and ties each message to its field", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    const password = screen.getByLabelText("Hasło");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj adres e-mail");
    expect(describedText(password)).toBe("Podaj hasło");
    const confirm = screen.getByLabelText("Powtórz hasło");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(confirm)).toBe("Powtórz hasło");
  });

  it("disables the button with the pending text after a valid submit", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zakładanie konta…" }).disabled).toBe(true);
  });

  it("enables the button again when the page is restored from the back/forward cache", () => {
    render(<SignUpForm />);
    watchSubmit();
    fillValid();
    fireEvent.submit(getForm());
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zakładanie konta…" }).disabled).toBe(true);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Załóż konto" }).disabled).toBe(false);
  });

  it("shows the server error as an alert", () => {
    render(<SignUpForm serverError="Nie udało się założyć konta" />);

    expect(screen.getByRole("alert").textContent).toBe("Nie udało się założyć konta");
  });

  it.each([
    ["sekre", "Jeszcze 1 znak"],
    ["sek", "Jeszcze 3 znaki"],
    ["s", "Jeszcze 5 znaków"],
  ])("hints the missing characters for the password %j", (value, hint) => {
    render(<SignUpForm />);

    type("Hasło", value);

    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.getByLabelText("Hasło").getAttribute("aria-describedby")).toBe("password-hint");
  });

  it("reports passwords that differ", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    type("E-mail", "ty@przyklad.pl");
    type("Hasło", "sekret123");
    type("Powtórz hasło", "inne12345");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const confirm = screen.getByLabelText("Powtórz hasło");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(confirm)).toBe("Hasła się różnią");
  });

  it("rejects a malformed e-mail address with a message tied to the field", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();
    type("E-mail", "ty@przyklad");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj poprawny adres e-mail");
  });

  it("rejects a password shorter than the minimum", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();
    type("Hasło", "12345");
    type("Powtórz hasło", "12345");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const password = screen.getByLabelText("Hasło");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(password)).toBe("Hasło musi mieć co najmniej 6 znaków");
  });

  it("names the fields the sign-up endpoint reads", () => {
    render(<SignUpForm />);

    expect(screen.getByLabelText("E-mail").getAttribute("name")).toBe("email");
    expect(screen.getByLabelText("Hasło").getAttribute("name")).toBe("password");
  });

  it("toggles the password visibility label", () => {
    render(<SignUpForm />);

    const [first] = screen.getAllByRole("button", { name: "Pokaż hasło" });
    fireEvent.click(first);

    expect(screen.getAllByRole("button", { name: "Ukryj hasło" })).toHaveLength(1);
    expect(screen.getByLabelText("Hasło").getAttribute("type")).toBe("text");
  });
});
