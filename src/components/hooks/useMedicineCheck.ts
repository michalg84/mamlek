import { useCallback, useEffect, useState } from "react";
import { parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MedicineCheckResponse } from "@/types";

export type MedicineCheckStatus = "loading" | "ready" | "unauthorized" | "error";

interface Loaded {
  /** Identifies the request (product + attempt) this result belongs to. */
  key: string;
  status: Exclude<MedicineCheckStatus, "loading">;
  result: MedicineCheckResponse | null;
}

/**
 * Checks the picked medicine against the kit (`GET /api/kit/check`). Changing `productId` aborts the previous request
 * and starts a new one; until it answers the status is "loading". 401 means the session is gone; anything else that
 * goes wrong (404 and an answer the screen cannot read included) is a generic error with retry.
 */
export function useMedicineCheck(productId: number) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${productId}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${productId}:${attempt}`;
    const finish = (status: Loaded["status"], result: MedicineCheckResponse | null = null) => {
      if (!controller.signal.aborted) {
        setLoaded({ key: requestKey, status, result });
      }
    };

    async function load() {
      try {
        const response = await fetch(`/api/kit/check?product=${productId}`, { signal: controller.signal });
        if (response.status === 401) {
          finish("unauthorized");
          return;
        }
        if (!response.ok) {
          finish("error");
          return;
        }
        const result = parseMedicineCheck(await response.json());
        if (!result) {
          finish("error");
          return;
        }
        finish("ready", result);
      } catch {
        // Aborted on unmount or product change (ignored in `finish`), network failure or an unreadable body.
        finish("error");
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [productId, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const current = loaded?.key === key ? loaded : null;
  return {
    status: current?.status ?? ("loading" as MedicineCheckStatus),
    result: current?.result ?? null,
    retry,
  };
}
