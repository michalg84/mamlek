import { vi } from "vitest";
import type { RegistrySearchListPayload } from "@/types";

export function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Replaces `fetch`; each call to the check endpoint takes the next reply, the last one repeats. */
export function stubFetch(...replies: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  replies.forEach((respond, index) => {
    if (index < replies.length - 1) {
      fetchMock.mockImplementationOnce(respond);
    } else {
      fetchMock.mockImplementation(respond);
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const SEARCH_LIST_PATH = "/api/registry/search-list";
const CHECK_PATH = "/api/kit/check";

interface PendingCheck {
  resolve: (response: Response) => void;
}

export interface RoutedFetch {
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  /** Answers the oldest unanswered check request for `productId`; throws when none is waiting. */
  resolveCheck: (productId: number, body: unknown, status?: number) => void;
  /** Number of check requests for `productId` that nobody has answered yet. */
  pendingChecks: (productId: number) => number;
  /** Every check request made so far, by product id, in call order (answered or not). */
  checkRequests: () => number[];
}

/**
 * Replaces `fetch` with a router: the search list is answered at once with `list`; every check request
 * (`/api/kit/check?product=<id>`) stays pending until the test answers it with `resolveCheck`, in any order.
 * A pending request is never rejected on abort: like a response already on its way, it can still arrive late,
 * which is the stronger case for the stale-answer guards.
 */
export function stubRoutedFetch(list: RegistrySearchListPayload): RoutedFetch {
  const pending = new Map<number, PendingCheck[]>();
  const requested: number[] = [];

  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      "http://localhost",
    );
    if (url.pathname === SEARCH_LIST_PATH) {
      return reply(list);
    }
    if (url.pathname === CHECK_PATH) {
      const productId = Number(url.searchParams.get("product"));
      requested.push(productId);
      return new Promise<Response>((resolve) => {
        pending.set(productId, [...(pending.get(productId) ?? []), { resolve }]);
      });
    }
    return Promise.reject(new TypeError(`Unexpected fetch: ${url.pathname}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    resolveCheck(productId, body, status = 200) {
      const waiting = pending.get(productId) ?? [];
      const next = waiting.shift();
      if (!next) {
        throw new Error(`No pending check request for product ${productId}`);
      }
      next.resolve(new Response(JSON.stringify(body), { status }));
    },
    pendingChecks: (productId) => pending.get(productId)?.length ?? 0,
    checkRequests: () => [...requested],
  };
}
