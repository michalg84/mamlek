import { useCallback, useEffect, useRef, useState } from "react";
import { isQueryLongEnough } from "@/lib/registry-search";
import type { RegistrySearchWorkerRequest, RegistrySearchWorkerResponse, RegistryVariant } from "@/types";

export type RegistrySearchStatus = "loading" | "ready" | "unauthorized" | "error";

interface LoadResult {
  /** Identifies the request (version + attempt) this result belongs to. */
  key: string;
  status: Exclude<RegistrySearchStatus, "loading">;
}

interface Answer {
  /** Identifies the request (version + attempt) whose worker produced this answer. */
  key: string;
  query: string;
  results: RegistryVariant[];
  total: number;
}

const NO_RESULTS: RegistryVariant[] = [];

/**
 * Downloads the registry search list once after mount, hands the bytes to a Web Worker that builds the search index,
 * and answers queries through it. The download stays on the main thread so it reuses the page's preload of the same URL.
 * `version` only addresses the HTTP cache entry; the payload is used as returned, even when the server sends a newer list.
 * 401 means the session is gone; anything else that goes wrong (including 404, which may also be an RLS-rejected session,
 * and a failing worker) is a generic error with retry.
 * `results` and `total` belong to `resultsQuery`; until the worker answers a new query they keep the previous answer.
 */
export function useRegistrySearch(version: number, query: string) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadResult | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  /** Id of the last query sent to the worker; answers with any other id are stale. */
  const lastIdRef = useRef(0);
  const key = `${version}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${version}:${attempt}`;
    let worker: Worker | null = null;
    const finish = (status: LoadResult["status"]) => {
      if (!controller.signal.aborted) {
        setLoaded({ key: requestKey, status });
      }
    };

    async function load() {
      try {
        // A retry bypasses the HTTP cache, so a broken response stored as immutable cannot be served again.
        const response = await fetch(`/api/registry/search-list?v=${version}`, {
          signal: controller.signal,
          cache: attempt > 0 ? "reload" : "default",
        });
        if (response.status === 401) {
          finish("unauthorized");
          return;
        }
        if (!response.ok) {
          finish("error");
          return;
        }
        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted) {
          return;
        }

        const created = new Worker(new URL("../../lib/registry-search.worker.ts", import.meta.url), { type: "module" });
        worker = created;
        workerRef.current = created;
        created.onmessage = (event: MessageEvent<RegistrySearchWorkerResponse>) => {
          const message = event.data;
          if (message.type === "ready") {
            // Marks the moment suggestions start working; `npm run perf` reads it as "list ready".
            if (!controller.signal.aborted) {
              performance.mark("mamlek:search-list-ready");
            }
            finish("ready");
          } else if (message.type === "error") {
            finish("error");
          } else if (message.id === lastIdRef.current && !controller.signal.aborted) {
            setAnswer({ key: requestKey, query: message.query, results: message.results, total: message.total });
          }
        };
        created.onerror = () => {
          finish("error");
        };
        const request: RegistrySearchWorkerRequest = { type: "load", buffer };
        created.postMessage(request, [buffer]);
      } catch {
        // Aborted on unmount (ignored in `finish`), network failure or a worker that could not start.
        finish("error");
      }
    }

    void load();
    return () => {
      controller.abort();
      worker?.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, [version, attempt]);

  const current = loaded?.key === key ? loaded : null;
  const status: RegistrySearchStatus = current?.status ?? "loading";
  const longEnough = isQueryLongEnough(query);

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
  }, [status, longEnough, query, key]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

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
