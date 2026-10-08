import { useCallback, useEffect, useState } from "react";
import type { RegistryVariantPackage } from "@/types";

export type VariantPackagesStatus = "loading" | "ready" | "unauthorized" | "error";

interface Loaded {
  /** Identifies the request (product + attempt) this result belongs to. */
  key: string;
  status: Exclude<VariantPackagesStatus, "loading">;
  packages: RegistryVariantPackage[];
}

const NO_PACKAGES: RegistryVariantPackage[] = [];

/**
 * Loads the active packs of the variant behind a picked suggestion (`GET /api/registry/packages`).
 * Changing `productId` starts a new load; until it answers the status is "loading". 401 means the session is gone;
 * anything else that goes wrong is a generic error with retry.
 */
export function useVariantPackages(productId: number) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${productId}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${productId}:${attempt}`;
    const finish = (status: Loaded["status"], packages: RegistryVariantPackage[] = NO_PACKAGES) => {
      if (!controller.signal.aborted) {
        setLoaded({ key: requestKey, status, packages });
      }
    };

    async function load() {
      try {
        const response = await fetch(`/api/registry/packages?product=${productId}`, { signal: controller.signal });
        if (response.status === 401) {
          finish("unauthorized");
          return;
        }
        if (!response.ok) {
          finish("error");
          return;
        }
        const body = (await response.json()) as { packages?: RegistryVariantPackage[] };
        finish("ready", body.packages ?? NO_PACKAGES);
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
    status: current?.status ?? ("loading" as VariantPackagesStatus),
    packages: current?.packages ?? NO_PACKAGES,
    retry,
  };
}
