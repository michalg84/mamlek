import { format } from "node:util";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout, so it lacks scrollIntoView (MedicineSuggest calls it on keyboard navigation).
// `performance.mark` with `detail` works in jsdom as is, so it needs no patch.
Element.prototype.scrollIntoView = () => undefined;

// jsdom has no ResizeObserver either; Radix (the pack radio group of KitAddForm) observes the size of its items.
// Nothing here depends on sizes, so a no-op observer is enough.
globalThis.ResizeObserver = class {
  observe() {
    // no layout in jsdom: there is nothing to report
  }
  unobserve() {
    // see observe
  }
  disconnect() {
    // see observe
  }
};

// Vitest runs without globals, so Testing Library cannot set this flag in its own beforeAll; without it React never
// warns about state updates outside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React reports that warning through console.error, which Vitest does not print for passing tests: fail instead.
// eslint-disable-next-line no-console -- kept to pass every other message through
const consoleError = console.error;
// eslint-disable-next-line no-console -- replaced on purpose, see above
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("not wrapped in act")) {
    throw new Error(format(...args));
  }
  consoleError(...args);
};

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
