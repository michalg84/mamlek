import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_MATCH_LEVEL, isMatchLevel } from "@/lib/match-level";
import type { MatchLevel } from "@/types";

export const MATCH_LEVEL_STORAGE_KEY = "mamlek:match-level";

// Writes of this tab; the `storage` event only reports writes of other tabs.
const listeners = new Set<() => void>();
// The level picked in this tab when saving it failed (private mode, full quota): it wins over storage, so the switch
// still works for the open page, even when reading storage works and returns the older value.
let pickedHere: MatchLevel | null = null;
let readFailureLogged = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStored(): MatchLevel {
  if (pickedHere !== null) {
    return pickedHere;
  }
  try {
    const stored = window.localStorage.getItem(MATCH_LEVEL_STORAGE_KEY);
    return isMatchLevel(stored) ? stored : DEFAULT_MATCH_LEVEL;
  } catch (error) {
    if (!readFailureLogged) {
      readFailureLogged = true;
      // eslint-disable-next-line no-console -- storage refused (private mode, blocked cookies): the level is not remembered
      console.warn("Could not read the match level from localStorage", error);
    }
    return DEFAULT_MATCH_LEVEL;
  }
}

/** Forgets the level kept in memory after a failed save; tests call it so that state does not leak between them. */
export function forgetUnsavedMatchLevel() {
  pickedHere = null;
  readFailureLogged = false;
}

function serverLevel(): MatchLevel {
  return DEFAULT_MATCH_LEVEL;
}

/**
 * The match level picked on the search screen, kept in `localStorage`. The server render and hydration use the
 * default level, then the stored one takes over, so the markup never differs. A stored value that is not a level, or
 * storage that throws (private mode, blocked cookies), gives the default level without breaking the screen; there the
 * switch still works for the open page.
 */
export function useMatchLevel(): [MatchLevel, (level: MatchLevel) => void] {
  const level = useSyncExternalStore(subscribe, readStored, serverLevel);

  const setLevel = useCallback((next: MatchLevel) => {
    try {
      window.localStorage.setItem(MATCH_LEVEL_STORAGE_KEY, next);
      pickedHere = null;
    } catch (error) {
      pickedHere = next;
      // eslint-disable-next-line no-console -- the level applies to this page only, it is not remembered
      console.warn("Could not save the match level to localStorage", error);
    }
    listeners.forEach((listener) => {
      listener();
    });
  }, []);

  return [level, setLevel];
}
