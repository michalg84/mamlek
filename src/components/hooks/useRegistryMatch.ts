import { useEffect, useRef, useState } from "react";
import { nextRegistryRequestId, type RegistryListHandle } from "@/components/hooks/useRegistryListWorker";
import type { RowMatch, RowMatchRequest } from "@/types";

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
  rows: RowMatchRequest[];
  matches: RowMatch[];
}

/**
 * Matches kit-import rows against the registry list in the search Web Worker, in one request per set of rows. Each row
 * is its match request (`rowMatchRequest`: queries and, for a complete row, its name); `matches` hold one `RowMatch` per row, in row order. The list is loaded by
 * `useRegistryListWorker`, whose handle `list` is passed in.
 *
 * `rows` is compared by identity: pass a memoized array, a new array is a new set of rows. Until the worker answers
 * the current set, `status` is "loading" and `matches` null; an answer to an earlier set is dropped. With `rows` null
 * nothing is sent and `matches` stay null; `status` then only tells whether the list is ready. An expired session is
 * "unauthorized" (a retry cannot help); any other failure to load the list is "error"; `retry` loads it again and matches the current rows.
 */
export function useRegistryMatch(list: RegistryListHandle, rows: RowMatchRequest[] | null): RegistryMatch {
  const { status: listStatus, key, post, subscribe, retry } = list;
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The last match request sent to the worker; answers with any other id are stale. */
  const sentRef = useRef<{ id: number; rows: RowMatchRequest[] | null }>({ id: 0, rows: null });

  useEffect(
    () =>
      subscribe((message, requestKey) => {
        const sent = sentRef.current;
        if (message.type === "matches" && message.id === sent.id && sent.rows !== null) {
          setAnswer({ key: requestKey, rows: sent.rows, matches: message.matches });
        }
      }),
    [subscribe],
  );

  // Sends the current rows as soon as the index is ready and again for every new set of rows.
  useEffect(() => {
    if (listStatus !== "ready") {
      return;
    }
    // Taken even without a send, so an answer still in flight for an earlier set is dropped.
    const id = nextRegistryRequestId();
    sentRef.current = { id, rows };
    if (rows !== null) {
      post({ type: "match", id, rows });
    }
  }, [listStatus, rows, key, post]);

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
