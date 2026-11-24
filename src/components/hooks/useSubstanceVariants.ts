import { useEffect, useRef, useState } from "react";
import {
  nextRegistryRequestId,
  type RegistryListHandle,
  type RegistryListStatus,
} from "@/components/hooks/useRegistryListWorker";
import type { RegistryVariant } from "@/types";

interface Answer {
  /** Identifies the list load (version + attempt) whose worker produced this answer. */
  key: string;
  substance: string;
  /** The `limit` the request asked for. */
  limit: number;
  results: RegistryVariant[];
  total: number;
}

export interface SubstanceVariants {
  /**
   * The list status; "ready" once the answer for the current substance is in (or when there is no substance and the
   * list is ready), "loading" while the list or that first answer is on its way.
   */
  status: RegistryListStatus;
  /** The first `limit` variants with the substance, in the worker's order (single-substance variants first). */
  results: RegistryVariant[];
  /** All variants with the substance. */
  total: number;
  retry: () => void;
}

const NO_RESULTS: RegistryVariant[] = [];

/**
 * The variants of the registry list that have `substance` among their substances, through the worker of `list`. A new
 * substance or a new `limit` sends a new request; until its answer arrives the previous answer for the same substance
 * stays (so "show more" does not blink), and an answer for another substance never shows. With `substance` null nothing
 * is sent and the results are empty, but the last answer is kept: "back" from a picked medicine to the same list at the
 * same `limit` shows it at once instead of an empty "loading". An answer for a larger `limit` than the asked one is
 * never shown (a fresh click on a substance starts from the first page).
 */
export function useSubstanceVariants(
  list: RegistryListHandle,
  substance: string | null,
  limit: number,
): SubstanceVariants {
  const { status: listStatus, key, post, subscribe, retry } = list;
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The last request sent to the worker; answers with any other id are stale. */
  const sentRef = useRef<{ id: number; substance: string | null; limit: number }>({
    id: 0,
    substance: null,
    limit,
  });

  useEffect(
    () =>
      subscribe((message, requestKey) => {
        const sent = sentRef.current;
        if (message.type === "substanceResults" && message.id === sent.id && sent.substance !== null) {
          setAnswer({
            key: requestKey,
            substance: sent.substance,
            limit: sent.limit,
            results: message.results,
            total: message.total,
          });
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    if (listStatus !== "ready") {
      return;
    }
    // Taken even without a send, so an answer still in flight for an earlier request is dropped.
    const id = nextRegistryRequestId();
    sentRef.current = { id, substance, limit };
    if (substance !== null) {
      post({ type: "substance", id, substance, limit });
    }
  }, [listStatus, substance, limit, key, post]);

  if (listStatus !== "ready") {
    return { status: listStatus, results: NO_RESULTS, total: 0, retry };
  }
  if (substance === null) {
    return { status: "ready", results: NO_RESULTS, total: 0, retry };
  }
  const visible = answer?.key === key && answer.substance === substance && answer.limit <= limit ? answer : null;
  if (!visible) {
    return { status: "loading", results: NO_RESULTS, total: 0, retry };
  }
  return { status: "ready", results: visible.results, total: visible.total, retry };
}
