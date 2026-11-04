import { useState, useSyncExternalStore } from "react";
import { KitItemDetails } from "@/components/kit/KitItemDetails";
import { todayIso } from "@/lib/kit-format";
import type { KitItem } from "@/types";

interface KitListProps {
  items: KitItem[];
  /** Today in Poland as computed by the server; the island replaces it with the browser's date once mounted. */
  today: string;
}

// The date is read on demand; nothing pushes updates.
function subscribeNever() {
  return () => undefined;
}

/** The kit list, rendered on the server and hydrated as an island. */
export default function KitList({ items: initialItems, today: serverToday }: KitListProps) {
  const [items] = useState(initialItems);
  // Hydration renders the server's `today`, so the markup matches the HTML; right after it (and on every later
  // render) the browser's own date takes over. `todayIso()` returns a string, so the snapshot is stable.
  const today = useSyncExternalStore(
    subscribeNever,
    () => todayIso(),
    () => serverToday,
  );

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Apteczka jest pusta</p>;
  }

  return (
    <ul className="divide-border min-w-0 divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="min-w-0 px-3 py-3">
          <KitItemDetails item={item} today={today} />
        </li>
      ))}
    </ul>
  );
}
