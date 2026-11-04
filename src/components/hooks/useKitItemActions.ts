import { useCallback } from "react";
import type { KitItem, UpdateKitItemRequest, UpdateKitItemResponse } from "@/types";

export type SaveKitItemResult = { item: KitItem } | { error: string };
export type RemoveKitItemResult = { ok: true } | { error: string };

type Verb = "zapisać" | "usunąć";

/**
 * Polish message for a failed request, by status only: the server's `error` is English and meant for developers.
 * `null` is a request that never got an answer (network failure).
 */
function failureMessage(status: number | null, verb: Verb): string {
  if (status === null) {
    return "Nie udało się połączyć z serwerem, spróbuj ponownie";
  }
  if (status === 401) {
    return "Sesja wygasła — zaloguj się ponownie";
  }
  if (status === 404) {
    return "Tej pozycji nie ma już w apteczce — odśwież stronę";
  }
  if (status === 400) {
    return `Nie udało się ${verb} tej wartości`;
  }
  return `Nie udało się ${verb}, spróbuj później`;
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
    } catch {
      // The request never got an answer (offline, server unreachable): the message says so.
      return { error: failureMessage(null, "zapisać") };
    }
    if (!response.ok) {
      return { error: failureMessage(response.status, "zapisać") };
    }
    // Without the stored item the list cannot show what was saved, so it is not reported as a success; a 2xx status
    // falls through to the generic message.
    const body = (await response.json().catch(() => null)) as UpdateKitItemResponse | null;
    if (!body?.item) {
      return { error: failureMessage(response.status, "zapisać") };
    }
    return { item: body.item };
  }, []);

  const remove = useCallback(async (id: number): Promise<RemoveKitItemResult> => {
    let response: Response;
    try {
      response = await fetch(`/api/kit/${id}`, { method: "DELETE" });
    } catch {
      // See `save`.
      return { error: failureMessage(null, "usunąć") };
    }
    if (!response.ok) {
      return { error: failureMessage(response.status, "usunąć") };
    }
    return { ok: true };
  }, []);

  return { save, remove };
}
