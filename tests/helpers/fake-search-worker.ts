import { vi } from "vitest";
import { matchRow } from "@/lib/kit-import";
import { buildSearchIndex, MAX_RESULTS, searchVariants, type RegistrySearchIndex } from "@/lib/registry-search";
import type { RegistrySearchListPayload, RegistrySearchWorkerRequest, RegistrySearchWorkerResponse } from "@/types";

type ResultsMessage = Extract<RegistrySearchWorkerResponse, { type: "results" }>;
type MatchesMessage = Extract<RegistrySearchWorkerResponse, { type: "matches" }>;

interface QueuedMatches {
  message: MatchesMessage;
  /** The rows of the request this answer is for. */
  rows: string[][];
}

type Queued = ResultsMessage | QueuedMatches;

function isResults(entry: Queued): entry is ResultsMessage {
  return "type" in entry;
}

function isMatches(entry: Queued): entry is QueuedMatches {
  return !isResults(entry);
}

function messageOf(entry: Queued): RegistrySearchWorkerResponse {
  return isResults(entry) ? entry : entry.message;
}

/**
 * Stand-in for the search Web Worker (`src/lib/registry-search.worker.ts`), same protocol (`src/types.ts`) and the real
 * `buildSearchIndex` / `searchVariants` / `matchRow`. It never answers inside `postMessage`, like the real worker:
 * `ready` arrives in a microtask, and answers to `search` and `match` are queued until the test delivers them (or at
 * once, in a microtask, with `autoDeliver`). Deliver inside `await act(async () => { ... })` so React sees the state
 * change.
 */
export class FakeSearchWorker {
  /** The most recently created instance (the hook creates one per list load). */
  static last: FakeSearchWorker | null = null;

  /** When true, answers are delivered in a microtask after the request instead of waiting for the test. */
  static autoDeliver = false;

  onmessage: ((event: MessageEvent<RegistrySearchWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  private index: RegistrySearchIndex | null = null;
  private queue: Queued[] = [];

  constructor(_url?: URL | string, _options?: WorkerOptions) {
    FakeSearchWorker.last = this;
  }

  postMessage(message: RegistrySearchWorkerRequest, _transfer?: Transferable[]) {
    if (this.terminated) {
      return;
    }
    if (message.type === "load") {
      const payload = JSON.parse(new TextDecoder().decode(message.buffer)) as RegistrySearchListPayload;
      this.index = buildSearchIndex(payload);
      const variantCount = this.index.entries.length;
      queueMicrotask(() => {
        this.emit({ type: "ready", variantCount, buildMs: 0 });
      });
      return;
    }
    if (!this.index) {
      return;
    }
    const index = this.index;
    if (message.type === "match") {
      const matches = message.rows.map((queries) => matchRow(index, queries));
      this.queue.push({ message: { type: "matches", id: message.id, matches }, rows: message.rows });
    } else {
      const { results, total } = searchVariants(index, message.query, MAX_RESULTS);
      this.queue.push({ type: "results", id: message.id, query: message.query, results, total });
    }
    if (FakeSearchWorker.autoDeliver) {
      queueMicrotask(() => {
        this.deliverAll();
      });
    }
  }

  terminate() {
    this.terminated = true;
    this.queue = [];
  }

  /** Query texts whose answers are waiting, oldest first. */
  pendingQueries(): string[] {
    return this.queue.filter(isResults).map((message) => message.query);
  }

  /** Rows of the match requests whose answers are waiting, oldest first. */
  pendingMatches(): string[][][] {
    return this.queue.filter(isMatches).map((entry) => entry.rows);
  }

  /**
   * Delivers the oldest queued answer to the query with this exact text, and every older answer before it: the real
   * worker answers in order, so a newer answer can never overtake an older one. Throws when none is queued.
   */
  deliver(query: string) {
    const position = this.queue.findIndex((entry) => isResults(entry) && entry.query === query);
    if (position < 0) {
      throw new Error(`No queued worker answer for query "${query}" (queued: ${this.pendingQueries().join(", ")})`);
    }
    this.deliverThrough(position);
  }

  /** Delivers the oldest queued answer to a match request, and every older answer before it. Throws when none is queued. */
  deliverMatch() {
    const position = this.queue.findIndex(isMatches);
    if (position < 0) {
      throw new Error("No queued worker answer for a match request");
    }
    this.deliverThrough(position);
  }

  /** Delivers every queued answer, oldest first. */
  deliverAll() {
    this.deliverThrough(this.queue.length - 1);
  }

  private deliverThrough(position: number) {
    for (const entry of this.queue.splice(0, position + 1)) {
      this.emit(messageOf(entry));
    }
  }

  private emit(message: RegistrySearchWorkerResponse) {
    // A terminated worker delivers nothing, like the real one.
    if (!this.terminated) {
      this.onmessage?.({ data: message } as MessageEvent<RegistrySearchWorkerResponse>);
    }
  }
}

/** Puts `FakeSearchWorker` in place of `Worker` for one test (`tests/setup-component.ts` unstubs it afterwards). */
export function stubSearchWorker({ autoDeliver = false }: { autoDeliver?: boolean } = {}) {
  FakeSearchWorker.last = null;
  FakeSearchWorker.autoDeliver = autoDeliver;
  vi.stubGlobal("Worker", FakeSearchWorker);
  return FakeSearchWorker;
}
