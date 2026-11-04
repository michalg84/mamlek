import { useCallback, useEffect, useRef, useState } from "react";
import { useRegistryListWorker, type RegistryWorkerAnswer } from "@/components/hooks/useRegistryListWorker";
import type { RegistrySearchWorkerRequest, RowMatch } from "@/types";

export type RegistryMatchStatus = "loading" | "ready" | "unauthorized" | "error";

export interface RegistryMatch {
  status: RegistryMatchStatus;
  matches: RowMatch[] | null;
  retry: () => void;
}

interface Answer {
  /** Identifies the list load (version + attempt) whose worker produced this answer. */
  key: string;
  /** The rows this answer belongs to (by identity). */
  rows: string[][];
  matches: RowMatch[];
}

/**
 * Matches kit-import rows against the registry list in the search Web Worker, in one request per set of rows. Each row
 * is its search queries (`rowQueries`); `matches` hold one `RowMatch` per row, in row order. The list is loaded the
 * same way as for suggestions (`useRegistryListWorker`).
 *
 * `rows` is compared by identity: pass a memoized array, a new array is a new set of rows. Until the worker answers
 * the current set, `status` is "loading" and `matches` null; an answer to an earlier set is dropped. With `rows` null
 * nothing is sent and `matches` stay null; `status` then only tells whether the list is ready. An expired session is
 * "unauthorized" (a retry cannot help); any other failure to load the list is "error"; `retry` loads it again and matches the current rows.
 */
export function useRegistryMatch(version: number, rows: string[][] | null): RegistryMatch {
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The last match request sent to the worker; answers with any other id are stale. */
  const sentRef = useRef<{ id: number; rows: string[][] | null }>({ id: 0, rows: null });
  const onAnswer = useCallback((message: RegistryWorkerAnswer, requestKey: string) => {
    const sent = sentRef.current;
    if (message.type === "matches" && message.id === sent.id && sent.rows !== null) {
      setAnswer({ key: requestKey, rows: sent.rows, matches: message.matches });
    }
  }, []);
  const { status: listStatus, key, workerRef, retry } = useRegistryListWorker(version, onAnswer);

  // Sends the current rows as soon as the index is ready and again for every new set of rows.
  useEffect(() => {
    const worker = workerRef.current;
    if (listStatus !== "ready" || !worker) {
      return;
    }
    // Bumped even without a send, so an answer still in flight for an earlier set is dropped.
    const id = sentRef.current.id + 1;
    sentRef.current = { id, rows };
    if (rows !== null) {
      const request: RegistrySearchWorkerRequest = { type: "match", id, rows };
      worker.postMessage(request);
    }
  }, [listStatus, rows, key, workerRef]);

  if (listStatus === "loading") {
    return { status: "loading", matches: null, retry };
  }
  if (listStatus === "unauthorized") {
    return { status: "unauthorized", matches: null, retry };
  }
  if (listStatus !== "ready") {
    return { status: "error", matches: null, retry };
  }
  if (rows === null) {
    return { status: "ready", matches: null, retry };
  }
  const visible = answer?.key === key && answer.rows === rows ? answer : null;
  if (!visible) {
    return { status: "loading", matches: null, retry };
  }
  return { status: "ready", matches: visible.matches, retry };
}
