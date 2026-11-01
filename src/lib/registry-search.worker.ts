import { matchRow } from "@/lib/kit-import";
import { buildSearchIndex, MAX_RESULTS, searchVariants, type RegistrySearchIndex } from "@/lib/registry-search";
import type {
  RegistrySearchListPayload,
  RegistrySearchWorkerRequest,
  RegistrySearchWorkerResponse,
  RowMatch,
} from "@/types";

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
  if (!index) {
    return;
  }
  const built = index;
  if (message.type === "match") {
    const matches = message.rows.map((queries, row): RowMatch => {
      try {
        return matchRow(built, queries);
      } catch (error) {
        // One failing row must not fail the whole import: it is shown as "no match" and the user searches by hand.
        // eslint-disable-next-line no-console -- the only trace of the failure; the row stays usable
        console.error(`Matching import row ${row} failed`, error);
        return { kind: "none" };
      }
    });
    reply({ type: "matches", id: message.id, matches });
    return;
  }
  try {
    const { results, total } = searchVariants(built, message.query, MAX_RESULTS);
    reply({ type: "results", id: message.id, query: message.query, results, total });
  } catch {
    // One failing query must not turn into "the list did not load": the index is still good for the next one.
    reply({ type: "results", id: message.id, query: message.query, results: [], total: 0 });
  }
});
