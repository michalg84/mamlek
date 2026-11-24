import { buttonVariants } from "@/components/ui/button";
import { normalizeText } from "@/lib/registry-search";
import { substanceHref } from "@/lib/search-url";
import { cn } from "@/lib/utils";

/** Whether the name has any word the registry search can match (a placeholder such as "-" has none). */
function hasWords(substance: string): boolean {
  return /[a-z0-9]/.test(normalizeText(substance));
}

/**
 * A substance name that leads to the list of medicines with that substance. It is a plain link: on `/szukaj` the screen
 * catches the click (`data-substance-link`) and changes the view without a reload; elsewhere the browser follows it.
 * A name without words stays text.
 */
export function SubstanceLink({ substance }: { substance: string }) {
  if (!hasWords(substance)) {
    return <>{substance}</>;
  }
  return (
    <a
      href={substanceHref(substance)}
      data-substance-link={substance}
      className={cn(
        buttonVariants({ variant: "link" }),
        "inline h-auto p-0 text-left align-baseline font-normal whitespace-normal",
      )}
    >
      {substance}
    </a>
  );
}
