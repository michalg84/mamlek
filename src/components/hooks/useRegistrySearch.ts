import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRegistryListWorker,
  type RegistryListStatus,
  type RegistryWorkerAnswer,
} from "@/components/hooks/useRegistryListWorker";
import { isQueryLongEnough } from "@/lib/registry-search";
import type { RegistrySearchWorkerRequest, RegistryVariant } from "@/types";

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
 * Loads the registry search list into a Web Worker (`useRegistryListWorker`) and answers queries through it.
 * `results` and `total` belong to `resultsQuery`; until the worker answers a new query they keep the previous answer.
 */
export function useRegistrySearch(version: number, query: string) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Id of the last query sent to the worker; answers with any other id are stale. */
  const lastIdRef = useRef(0);
  const onAnswer = useCallback((message: RegistryWorkerAnswer, requestKey: string) => {
    if (message.type === "results" && message.id === lastIdRef.current) {
      setAnswer({ key: requestKey, query: message.query, results: message.results, total: message.total });
    }
  }, []);
  const { status, key, workerRef, retry } = useRegistryListWorker(version, onAnswer);

  const longEnough = isQueryLongEnough(query);
  // A too-short query ends the previous search: its answer must not come back while the next query is on its way.
  if (!longEnough && answer !== null) {
    setAnswer(null);
  }

  // Sends the current query as soon as the index is ready (text typed while loading) and on every change after that.
  useEffect(() => {
    const worker = workerRef.current;
    if (status !== "ready" || !worker) {
      return;
    }
    // Bumped even without a send, so an answer still in flight for an earlier query is dropped.
    const id = ++lastIdRef.current;
    if (longEnough) {
      const request: RegistrySearchWorkerRequest = { type: "search", id, query };
      worker.postMessage(request);
    }
  }, [status, longEnough, query, key, workerRef]);

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
