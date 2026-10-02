import { useCallback, useEffect, useState } from "react";
import { buildSearchIndex, type RegistrySearchIndex } from "@/lib/registry-search";
import type { RegistrySearchListPayload } from "@/types";

export type RegistrySearchListStatus = "loading" | "ready" | "unauthorized" | "error";

interface LoadResult {
  /** Identifies the request (version + attempt) this result belongs to. */
  key: string;
  status: Exclude<RegistrySearchListStatus, "loading">;
  index: RegistrySearchIndex | null;
}

function isPayload(data: unknown): data is RegistrySearchListPayload {
  return typeof data === "object" && data !== null && Array.isArray((data as { variants?: unknown }).variants);
}

/**
 * Downloads the registry search list once after mount and builds the search index from it.
 * `version` only addresses the HTTP cache entry; the payload is used as returned, even when the server sends a newer list.
 * 401 means the session is gone; anything else that goes wrong (including 404, which may also be an RLS-rejected session)
 * is a generic error with retry.
 */
export function useRegistrySearchList(version: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const key = `${version}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${version}:${attempt}`;
    const finish = (status: LoadResult["status"], index: RegistrySearchIndex | null) => {
      if (!controller.signal.aborted) {
        setResult({ key: requestKey, status, index });
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
          finish("unauthorized", null);
          return;
        }
        if (!response.ok) {
          finish("error", null);
          return;
        }
        const data: unknown = await response.json();
        if (!isPayload(data)) {
          finish("error", null);
          return;
        }
        finish("ready", buildSearchIndex(data));
      } catch {
        // Aborted on unmount (ignored in `finish`), network failure, malformed JSON or malformed tuples.
        finish("error", null);
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [version, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const current = result?.key === key ? result : null;
  const status: RegistrySearchListStatus = current?.status ?? "loading";
  return { status, index: current?.index ?? null, retry };
}
