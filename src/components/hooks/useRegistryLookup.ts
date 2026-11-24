import { useEffect, useRef, useState } from "react";
import { nextRegistryRequestId, type RegistryListHandle } from "@/components/hooks/useRegistryListWorker";
import type { RegistryVariant } from "@/types";

/**
 * "idle": no id to look up. "loading": the list or the answer is on its way. "found" / "missing": the worker's answer
 * (`missing` = the id is not in the list). "unauthorized" / "error": the list could not be loaded.
 */
export type RegistryLookupStatus = "idle" | "loading" | "found" | "missing" | "error" | "unauthorized";

export interface RegistryLookup {
  status: RegistryLookupStatus;
  variant: RegistryVariant | null;
}

interface Answer {
  /** Identifies the list load (version + attempt) whose worker produced this answer. */
  key: string;
  variantId: number;
  variant: RegistryVariant | null;
}

/**
 * Finds a variant of the registry list by its list id through the worker of `list`. The request goes out once the list
 * is ready and again for every new id; an answer to an earlier id or load is dropped. With `variantId` null nothing is
 * sent and the status is "idle".
 */
export function useRegistryLookup(list: RegistryListHandle, variantId: number | null): RegistryLookup {
  const { status: listStatus, key, post, subscribe } = list;
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The last lookup sent to the worker; answers with any other id are stale. */
  const sentRef = useRef<{ id: number; variantId: number | null }>({ id: 0, variantId: null });

  useEffect(
    () =>
      subscribe((message, requestKey) => {
        const sent = sentRef.current;
        if (message.type === "lookupResult" && message.id === sent.id && sent.variantId !== null) {
          setAnswer({ key: requestKey, variantId: sent.variantId, variant: message.variant });
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    if (listStatus !== "ready") {
      return;
    }
    // Taken even without a send, so an answer still in flight for an earlier id is dropped.
    const id = nextRegistryRequestId();
    sentRef.current = { id, variantId };
    if (variantId !== null) {
      post({ type: "lookup", id, variantId });
    }
  }, [listStatus, variantId, key, post]);

  if (variantId === null) {
    return { status: "idle", variant: null };
  }
  if (listStatus === "unauthorized" || listStatus === "error") {
    return { status: listStatus, variant: null };
  }
  const visible = listStatus === "ready" && answer?.key === key && answer.variantId === variantId ? answer : null;
  if (!visible) {
    return { status: "loading", variant: null };
  }
  return visible.variant ? { status: "found", variant: visible.variant } : { status: "missing", variant: null };
}
