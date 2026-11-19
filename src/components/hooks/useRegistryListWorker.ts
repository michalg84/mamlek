import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RegistrySearchWorkerRequest, RegistrySearchWorkerResponse } from "@/types";

export type RegistryListStatus = "loading" | "ready" | "unauthorized" | "error";

/** A worker answer to a request (`search`, `match`, `substance`, `lookup`); load outcomes are handled here. */
export type RegistryWorkerAnswer = Extract<
  RegistrySearchWorkerResponse,
  { type: "results" | "matches" | "substanceResults" | "lookupResult" }
>;

/** What the hooks that talk to the list worker share: one load, one worker. */
export interface RegistryListHandle {
  status: RegistryListStatus;
  /** Names the current load (version + attempt). */
  key: string;
  retry: () => void;
  /** Sends a request to the current worker; a no-op unless status is "ready". */
  post: (request: RegistrySearchWorkerRequest) => void;
  /** Every answer of the current load goes to every listener; returns the unsubscribe function. */
  subscribe: (listener: (message: RegistryWorkerAnswer, key: string) => void) => () => void;
}

type RegistryAnswerListener = Parameters<RegistryListHandle["subscribe"]>[0];

interface LoadResult {
  /** Identifies the request (version + attempt) this result belongs to. */
  key: string;
  status: Exclude<RegistryListStatus, "loading">;
}

let lastRequestId = 0;

/** Module-wide request id, so consumers sharing one worker never collide. */
export function nextRegistryRequestId(): number {
  return ++lastRequestId;
}

/**
 * Downloads the registry search list once after mount and hands the bytes to a Web Worker that builds the search index.
 * The download stays on the main thread so it reuses the page's preload of the same URL. `version` only addresses the
 * HTTP cache entry; the payload is used as returned, even when the server sends a newer list. 401 means the session is
 * gone; anything else that goes wrong (including 404, which may also be an RLS-rejected session, and a failing worker)
 * is a generic error with retry.
 *
 * The returned handle is shared by every hook that needs the list on one page (suggestions, lookup, substance filter,
 * import matching), so the page downloads and indexes the list once. `key` names the current load (version + attempt);
 * `subscribe` gets every answer of the current worker with the key of the load that created it, so a consumer can drop
 * answers from an earlier load; `post` sends a request once `status` is "ready". The handle keeps its identity until
 * `status` or `key` changes.
 */
export function useRegistryListWorker(version: number): RegistryListHandle {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const listenersRef = useRef(new Set<RegistryAnswerListener>());
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
            // Marks the moment suggestions start working; `npm run perf` reads it as "list ready" and uses `buildMs`
            // to estimate the slow-profile time when CPU throttling does not reach the worker.
            if (!controller.signal.aborted) {
              performance.mark("mamlek:search-list-ready", { detail: { buildMs: message.buildMs } });
            }
            finish("ready");
          } else if (message.type === "error") {
            finish("error");
          } else if (!controller.signal.aborted) {
            for (const listener of listenersRef.current) {
              listener(message, requestKey);
            }
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
  const status: RegistryListStatus = current?.status ?? "loading";

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const post = useCallback(
    (request: RegistrySearchWorkerRequest) => {
      if (status === "ready") {
        workerRef.current?.postMessage(request);
      }
    },
    [status],
  );

  const subscribe = useCallback((listener: RegistryAnswerListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return useMemo(() => ({ status, key, retry, post, subscribe }), [status, key, retry, post, subscribe]);
}
