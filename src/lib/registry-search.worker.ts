import { buildSearchIndex, MAX_RESULTS, searchVariants, type RegistrySearchIndex } from "@/lib/registry-search";
import type { RegistrySearchListPayload, RegistrySearchWorkerRequest, RegistrySearchWorkerResponse } from "@/types";

let index: RegistrySearchIndex | null = null;

function isPayload(data: unknown): data is RegistrySearchListPayload {
  return typeof data === "object" && data !== null && Array.isArray((data as { variants?: unknown }).variants);
}

function reply(message: RegistrySearchWorkerResponse) {
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<RegistrySearchWorkerRequest>) => {
  const message = event.data;
  if (message.type === "load") {
    try {
      const started = performance.now();
      const data: unknown = JSON.parse(new TextDecoder().decode(message.buffer));
      if (!isPayload(data)) {
        reply({ type: "error" });
        return;
      }
      index = buildSearchIndex(data);
      reply({ type: "ready", variantCount: index.entries.length, buildMs: performance.now() - started });
    } catch {
      // Malformed JSON or malformed tuples.
      index = null;
      reply({ type: "error" });
    }
    return;
  }
  // A query that arrives before the index is built has nothing to answer; the page only sends queries once ready.
  if (index) {
    try {
      const { results, total } = searchVariants(index, message.query, MAX_RESULTS);
      reply({ type: "results", id: message.id, query: message.query, results, total });
    } catch {
      // One failing query must not turn into "the list did not load": the index is still good for the next one.
      reply({ type: "results", id: message.id, query: message.query, results: [], total: 0 });
    }
  }
});
