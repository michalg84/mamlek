import { cn } from "@/lib/utils";

/**
 * Says a medicine is withdrawn from the registry: in the search suggestions, on the search card, in the CSV import rows
 * and in the kit item details. One wording everywhere; the size may differ (the suggestions are denser).
 */
export function WithdrawnVariantNote({ as: Tag = "span", className }: { as?: "span" | "p"; className?: string }) {
  return <Tag className={cn("text-muted-foreground block text-sm", className)}>wycofany z rejestru</Tag>;
}
