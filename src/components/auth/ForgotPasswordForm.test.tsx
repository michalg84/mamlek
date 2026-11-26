import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

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

function typeEmail(value: string) {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value } });
}

describe("ForgotPasswordForm", () => {
  it("blocks an empty submit and ties the message to the field", () => {
    render(<ForgotPasswordForm />);
    const seen = watchSubmit();

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj adres e-mail");
  });

  it("rejects a malformed e-mail address, and drops the message once the address is edited", () => {
    render(<ForgotPasswordForm />);
    const seen = watchSubmit();
    typeEmail("ty@przyklad");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(true);
    const email = screen.getByLabelText("E-mail");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(email)).toBe("Podaj poprawny adres e-mail");

    typeEmail("ty@przyklad.pl");

    expect(email.getAttribute("aria-invalid")).toBeNull();
    expect(email.getAttribute("aria-describedby")).toBeNull();
  });

  it("posts the field the endpoint reads", () => {
    render(<ForgotPasswordForm />);

    const form = getForm();
    expect(form.getAttribute("action")).toBe("/api/auth/forgot-password");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(screen.getByLabelText("E-mail").getAttribute("name")).toBe("email");
  });

  it("disables the button with the pending text after a valid submit, and enables it from the back/forward cache", () => {
    render(<ForgotPasswordForm />);
    const seen = watchSubmit();
    typeEmail("ty@przyklad.pl");

    fireEvent.submit(getForm());

    expect(seen.defaultPrevented).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Wysyłanie…" }).disabled).toBe(true);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Wyślij link" }).disabled).toBe(false);
  });

  it("keeps the button disabled on a pageshow that is not from the cache", () => {
    render(<ForgotPasswordForm />);
    watchSubmit();
    typeEmail("ty@przyklad.pl");
    fireEvent.submit(getForm());

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Wysyłanie…" }).disabled).toBe(true);
  });

  it("shows the server error as an alert", () => {
    render(<ForgotPasswordForm serverError="Za dużo prób. Spróbuj ponownie za kilka minut." />);

    expect(screen.getByRole("alert").textContent).toBe("Za dużo prób. Spróbuj ponownie za kilka minut.");
  });
});
