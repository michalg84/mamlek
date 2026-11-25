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
  type("Hasło", "kot pije mleko");
  type("Powtórz hasło", "kot pije mleko");
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
    ["kot pije ml", "Jeszcze 1 znak"], // 11 characters
    ["kot pije", "Jeszcze 4 znaki"], // 8 characters
    ["s", "Jeszcze 11 znaków"],
    ["😀".repeat(10), "Jeszcze 2 znaki"], // 10 code points, 20 UTF-16 units
    ["ą".repeat(7), "Jeszcze 5 znaków"],
  ])("hints the missing characters for the password %j", (value, hint) => {
    render(<SignUpForm />);

    type("Hasło", value);

    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.getByLabelText("Hasło").getAttribute("aria-describedby")).toBe("password-hint");
  });

  it("shows no counter once the password has 12 characters, but keeps the example", () => {
    render(<SignUpForm />);

    type("Hasło", "kot pije mlek"); // 13 characters

    expect(screen.queryByText(/Jeszcze/)).toBeNull();
    expect(screen.getByText(/zielony rower pod oknem/)).toBeTruthy();
  });

  it("suggests a few words with the example before anything is typed", () => {
    render(<SignUpForm />);

    expect(screen.getByText(/Najłatwiej zapamiętać kilka słów, np\. „zielony rower pod oknem”/)).toBeTruthy();
    expect(screen.getByLabelText("Hasło").getAttribute("placeholder")).toBe("Co najmniej 12 znaków");
    expect(screen.getByLabelText("Hasło").getAttribute("aria-describedby")).toBe("password-hint");
  });

  it("does not cap the field with maxLength, which counts UTF-16 units and not bytes", () => {
    render(<SignUpForm />);

    expect(screen.getByLabelText("Hasło").hasAttribute("maxlength")).toBe(false);
  });

  it("reports passwords that differ", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    type("E-mail", "ty@przyklad.pl");
    type("Hasło", "kot pije mleko");
    type("Powtórz hasło", "kot pije herbatę");

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

  it("rejects a password of 11 characters with the reason, and lets 12 through", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();
    type("Hasło", "kot pije ml"); // 11 characters
    type("Powtórz hasło", "kot pije ml");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const password = screen.getByLabelText("Hasło");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(password)).toBe("Hasło musi mieć co najmniej 12 znaków. Może to być kilka słów ze spacjami.");

    type("Hasło", "kot pije mlek"); // 12 characters + 1
    type("Powtórz hasło", "kot pije mlek");
    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Hasło").getAttribute("aria-invalid")).toBeNull();
  });

  it("counts Polish letters and emoji as one character each at the lower bound", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();
    type("Hasło", "😀".repeat(11));
    type("Powtórz hasło", "😀".repeat(11));
    fireEvent.submit(getForm());
    expect(seen.defaultPrevented).toBe(true);

    type("Hasło", "ą".repeat(12));
    type("Powtórz hasło", "ą".repeat(12));
    fireEvent.submit(getForm());
    expect(seen.defaultPrevented).toBe(false);
  });

  it("rejects a password above 72 bytes, where a Polish letter takes two", () => {
    render(<SignUpForm />);
    const seen = watchSubmit();
    fillValid();
    type("Hasło", "ą".repeat(37)); // 37 characters, 74 bytes
    type("Powtórz hasło", "ą".repeat(37));

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    expect(describedText(screen.getByLabelText("Hasło"))).toBe(
      "Hasło jest za długie (limit 72 bajtów; polskie litery zajmują po 2). Skróć je.",
    );

    type("Hasło", "ą".repeat(36)); // 72 bytes
    type("Powtórz hasło", "ą".repeat(36));
    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
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
