import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import type { RegistryVariant } from "@/types";

interface Props {
  version: number;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function VariantCard({ variant }: { variant: RegistryVariant }) {
  return (
    <Card role="region" aria-label="Wybrany lek" className="min-w-0 gap-0 p-4">
      <h2 className="text-foreground text-lg font-semibold break-words">{variant.name}</h2>
      <dl className="mt-3 space-y-3">
        {variant.strength && <Field label="Moc">{variant.strength}</Field>}
        {variant.form && <Field label="Postać">{variant.form}</Field>}
        {variant.commonName && <Field label="Nazwa powszechnie stosowana">{variant.commonName}</Field>}
        {variant.substances.length > 0 && (
          <Field label="Substancje czynne">
            <ul className="list-disc space-y-0.5 pl-5">
              {variant.substances.map((substance, position) => (
                <li key={`${position}-${substance}`}>{substance}</li>
              ))}
            </ul>
          </Field>
        )}
      </dl>
    </Card>
  );
}

export default function RegistrySearch({ version }: Props) {
  const [selected, setSelected] = useState<RegistryVariant | null>(null);

  return (
    <div className="min-w-0 space-y-6">
      <MedicineSuggest version={version} onSelect={setSelected} />
      {/* Only the name is announced; the card itself is read when the user moves to it. */}
      <p role="status" aria-live="polite" className="sr-only">
        {selected ? `Wybrano: ${selected.name}` : ""}
      </p>
      {selected && <VariantCard variant={selected} />}
    </div>
  );
}
