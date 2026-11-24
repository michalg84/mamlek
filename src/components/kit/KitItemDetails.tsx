import { Fragment, type ReactNode } from "react";
import { SubstanceLink } from "@/components/registry/SubstanceLink";
import { WithdrawnVariantNote } from "@/components/registry/WithdrawnVariantNote";
import { expiryStatus, formatExpiry, formatQuantity, packLabel } from "@/lib/kit-format";
import type { KitItem } from "@/types";

/** The fields of a kit item that both `KitItem` (the list) and `MedicineCheckItem` (the check result) carry. */
export type KitItemDetailsItem = Pick<
  KitItem,
  "name" | "strength" | "form" | "units" | "quantity" | "expiresOn" | "expiryPrecision" | "withdrawn"
>;

interface KitItemDetailsProps {
  item: KitItemDetailsItem;
  /** Today as YYYY-MM-DD in the user's time zone; an expiry before it, or within the next month, is marked. */
  today: string;
  /** Active substances, shown under the strength and form when the caller has them. */
  substances?: string[];
  /** Replaces the "Ilość: …" line (the list puts an editable field there). */
  quantitySlot?: ReactNode;
}

/** One description of a pack in the kit, shared by the kit list and the medicine check so both read the same. */
export function KitItemDetails({ item, today, substances, quantitySlot }: KitItemDetailsProps) {
  const details = [item.strength, item.form].filter(Boolean).join(" · ");
  const status = expiryStatus(item.expiresOn, today);
  const empty = item.quantity === 0;
  return (
    <>
      <p className="text-foreground font-bold break-words">{item.name}</p>
      {details && <p className="text-muted-foreground text-sm break-words">{details}</p>}
      {substances && substances.length > 0 && (
        <p className="text-muted-foreground text-sm break-words">
          {substances.map((substance, position) => (
            <Fragment key={`${position}-${substance}`}>
              {position > 0 && ", "}
              <SubstanceLink substance={substance} />
            </Fragment>
          ))}
        </p>
      )}
      <p className="text-foreground mt-1 text-sm break-words">{packLabel(item.units)}</p>
      {quantitySlot ?? (
        <p className="text-foreground text-sm break-words">
          Ilość: {formatQuantity(item.quantity, item.units)}
          {empty && <span className="text-muted-foreground font-medium"> · puste</span>}
        </p>
      )}
      <p className="text-foreground text-sm break-words">
        Ważny do: {formatExpiry(item.expiresOn, item.expiryPrecision)}
        {status === "expired" && <span className="text-destructive font-medium"> · przeterminowany</span>}
        {status === "expiring" && <span className="text-warning-foreground font-medium"> · kończy się ważność</span>}
      </p>
      {item.withdrawn && <WithdrawnVariantNote as="p" />}
    </>
  );
}
