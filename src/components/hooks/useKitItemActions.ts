import { useCallback } from "react";
import type { KitItem, UpdateKitItemRequest, UpdateKitItemResponse } from "@/types";

/**
 * A failed request: the Polish message to show and what the screen may do about it. `session` offers signing in,
 * `gone` is an item that no longer exists (a delete treats it as done), `failed` is everything else.
 */
export interface KitItemActionFailure {
  error: string;
  kind: "session" | "gone" | "failed";
}

export type SaveKitItemResult = { item: KitItem } | KitItemActionFailure;
export type RemoveKitItemResult = { ok: true } | KitItemActionFailure;

type Verb = "zapisać" | "usunąć";

/**
 * Polish message for a failed request, by status only: the server's `error` is English and meant for developers.
 * `null` is a request that never got an answer (network failure).
 */
function failure(status: number | null, verb: Verb): KitItemActionFailure {
  if (status === null) {
    return { error: "Nie udało się połączyć z serwerem, spróbuj ponownie", kind: "failed" };
  }
  if (status === 401) {
    return { error: "Sesja wygasła — zaloguj się ponownie", kind: "session" };
  }
  if (status === 404) {
    return { error: "Tej pozycji nie ma już w apteczce — odśwież stronę", kind: "gone" };
  }
  if (status === 400) {
    return { error: `Nie udało się ${verb} tej wartości`, kind: "failed" };
  }
  return { error: `Nie udało się ${verb}, spróbuj później`, kind: "failed" };
}

/** The only trace of a failure: the screen shows a generic message, the console keeps the cause or the answer. */
function logFailure(...details: unknown[]) {
  // eslint-disable-next-line no-console -- the screen shows a generic Polish message, this is the evidence
  console.error(...details);
}

/** The JSON body of an answer, or null (and a logged cause) when it is missing or unreadable. */
async function readBody(response: Response): Promise<unknown> {
  return response.json().catch((cause: unknown) => {
    logFailure(cause);
    return null;
  });
}

/** Changes and deletes one kit item (`PATCH` / `DELETE /api/kit/[id]`), answering with the message to show. */
export function useKitItemActions() {
  const save = useCallback(async (id: number, changes: UpdateKitItemRequest): Promise<SaveKitItemResult> => {
    let response: Response;
    try {
      response = await fetch(`/api/kit/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
    } catch (cause) {
      // The request never got an answer (offline, server unreachable): the message says so.
      logFailure(cause);
      return failure(null, "zapisać");
    }
    if (!response.ok) {
      logFailure("Saving a kit item failed", response.status, await readBody(response));
      return failure(response.status, "zapisać");
    }
    // Without the stored item the list cannot show what was saved, so it is not reported as a success; a 2xx status
    // falls through to the generic message.
    const body = (await readBody(response)) as UpdateKitItemResponse | null;
    if (!body?.item) {
      logFailure("Saving a kit item got an answer without the item", response.status, body);
      return failure(response.status, "zapisać");
    }
    return { item: body.item };
  }, []);

  const remove = useCallback(async (id: number): Promise<RemoveKitItemResult> => {
    let response: Response;
    try {
      response = await fetch(`/api/kit/${id}`, { method: "DELETE" });
    } catch (cause) {
      // See `save`.
      logFailure(cause);
      return failure(null, "usunąć");
    }
    if (!response.ok) {
      logFailure("Deleting a kit item failed", response.status, await readBody(response));
      return failure(response.status, "usunąć");
    }
    return { ok: true };
  }, []);

  return { save, remove };
}
