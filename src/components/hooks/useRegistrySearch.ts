import { useEffect, useRef, useState } from "react";
import {
  nextRegistryRequestId,
  type RegistryListHandle,
  type RegistryListStatus,
} from "@/components/hooks/useRegistryListWorker";
import { isQueryLongEnough } from "@/lib/registry-search";
import type { RegistryVariant } from "@/types";

export type RegistrySearchStatus = RegistryListStatus;

interface Answer {
  /** Identifies the request (version + attempt) whose worker produced this answer. */
  key: string;
  query: string;
  results: RegistryVariant[];
  total: number;
}

const NO_RESULTS: RegistryVariant[] = [];

/**
 * Answers queries through the registry search list worker of `list` (`useRegistryListWorker`).
 * `results` and `total` belong to `resultsQuery`; until the worker answers a new query they keep the previous answer.
 */
export function useRegistrySearch(list: RegistryListHandle, query: string) {
  const { status, key, post, subscribe, retry } = list;
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Id of the last query sent to the worker; answers with any other id are stale. */
  const lastIdRef = useRef(0);

  useEffect(
    () =>
      subscribe((message, requestKey) => {
        if (message.type === "results" && message.id === lastIdRef.current) {
          setAnswer({ key: requestKey, query: message.query, results: message.results, total: message.total });
        }
      }),
    [subscribe],
  );

  const longEnough = isQueryLongEnough(query);
  // A too-short query ends the previous search: its answer must not come back while the next query is on its way.
  if (!longEnough && answer !== null) {
    setAnswer(null);
  }

  // Sends the current query as soon as the index is ready (text typed while loading) and on every change after that.
  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    // Taken even without a send, so an answer still in flight for an earlier query is dropped.
    const id = nextRegistryRequestId();
    lastIdRef.current = id;
    if (longEnough) {
      post({ type: "search", id, query });
    }
  }, [status, longEnough, query, key, post]);

  if (status !== "ready") {
    return { status, results: NO_RESULTS, total: 0, resultsQuery: null, retry };
  }
  // Too short a query needs no worker round trip: empty at once.
  if (!longEnough) {
    return { status, results: NO_RESULTS, total: 0, resultsQuery: query, retry };
  }
  const visible = answer?.key === key ? answer : null;
  return {
    status,
    results: visible?.results ?? NO_RESULTS,
    total: visible?.total ?? 0,
    resultsQuery: visible?.query ?? null,
    retry,
  };
}
