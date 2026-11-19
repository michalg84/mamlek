import { useEffect, useState } from "react";

/**
 * Tracks a native form POST in flight. The page leaves on submit, so the flag only needs resetting when the browser
 * restores it from the back/forward cache (`pageshow` with `persisted`), where the form would stay disabled.
 */
export function useSubmitting() {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return [submitting, setSubmitting] as const;
}
