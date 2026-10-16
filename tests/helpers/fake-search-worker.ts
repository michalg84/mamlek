import { vi } from "vitest";
import { buildSearchIndex, MAX_RESULTS, searchVariants, type RegistrySearchIndex } from "@/lib/registry-search";
import type { RegistrySearchListPayload, RegistrySearchWorkerRequest, RegistrySearchWorkerResponse } from "@/types";

type ResultsMessage = Extract<RegistrySearchWorkerResponse, { type: "results" }>;

/**
 * Stand-in for the search Web Worker (`src/lib/registry-search.worker.ts`), same protocol (`src/types.ts`) and the real
 * `buildSearchIndex` / `searchVariants`. It never answers inside `postMessage`, like the real worker: `ready` arrives
 * in a microtask, and answers to `search` are queued until the test delivers them (or at once, in a microtask, with
 * `autoDeliver`). Deliver inside `await act(async () => { ... })` so React sees the state change.
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
  private queue: ResultsMessage[] = [];

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
    const { results, total } = searchVariants(this.index, message.query, MAX_RESULTS);
    this.queue.push({ type: "results", id: message.id, query: message.query, results, total });
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
    return this.queue.map((message) => message.query);
  }

  /**
   * Delivers the oldest queued answer to the query with this exact text, and every older answer before it: the real
   * worker answers in order, so a newer answer can never overtake an older one. Throws when none is queued.
   */
  deliver(query: string) {
    const position = this.queue.findIndex((message) => message.query === query);
    if (position < 0) {
      throw new Error(`No queued worker answer for query "${query}" (queued: ${this.pendingQueries().join(", ")})`);
    }
    for (const message of this.queue.splice(0, position + 1)) {
      this.emit(message);
    }
  }

  /** Delivers every queued answer, oldest first. */
  deliverAll() {
    const messages = this.queue;
    this.queue = [];
    for (const message of messages) {
      this.emit(message);
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
