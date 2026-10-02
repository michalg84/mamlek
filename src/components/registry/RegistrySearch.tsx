import { useState, type ReactNode } from "react";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import type { RegistryVariant } from "@/types";

interface Props {
  version: number;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-blue-100/60 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-white">{children}</dd>
    </div>
  );
}

function VariantCard({ variant }: { variant: RegistryVariant }) {
  return (
    <section aria-label="Wybrany lek" className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-lg font-semibold break-words text-white">{variant.name}</h2>
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
    </section>
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
