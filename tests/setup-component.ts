import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout, so it lacks scrollIntoView (MedicineSuggest calls it on keyboard navigation).
// `performance.mark` with `detail` works in jsdom as is, so it needs no patch.
Element.prototype.scrollIntoView = () => undefined;

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
