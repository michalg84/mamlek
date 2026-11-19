import { useId, useState, type ReactNode } from "react";
import { useMatchLevel } from "@/components/hooks/useMatchLevel";
import { useRegistryListWorker } from "@/components/hooks/useRegistryListWorker";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MedicineCheckResult } from "@/components/registry/MedicineCheckResult";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import { WithdrawnVariantNote } from "@/components/registry/WithdrawnVariantNote";
import { isMatchLevel, MATCH_LEVEL_TEXTS, MATCH_LEVELS } from "@/lib/match-level";
import type { MatchLevel, MedicineCheckResponse, RegistryVariant } from "@/types";

interface Props {
  version: number;
}

type SearchedMedicine = MedicineCheckResponse["searched"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function VariantCard({ variant, withdrawn }: { variant: SearchedMedicine; withdrawn: boolean }) {
  return (
    <Card role="region" aria-label="Wybrany lek" className="min-w-0 gap-0 p-4">
      <h2 className="text-foreground text-lg font-semibold break-words">{variant.name}</h2>
      {withdrawn && <WithdrawnVariantNote as="p" />}
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

/** The match level of the check: one group of three radios, stacked (the card is too narrow for a tidy row). */
function MatchLevelSwitch({ level, onChange }: { level: MatchLevel; onChange: (level: MatchLevel) => void }) {
  const legendId = useId();
  const idPrefix = useId();
  return (
    <div className="min-w-0 space-y-2">
      <p id={legendId} className="text-foreground text-sm font-medium">
        Dopasowanie składu
      </p>
      <RadioGroup
        aria-labelledby={legendId}
        value={level}
        onValueChange={(value) => {
          if (isMatchLevel(value)) {
            onChange(value);
          }
        }}
        className="gap-2"
      >
        {MATCH_LEVELS.map((value) => (
          <div key={value} className="flex min-w-0 items-center gap-2">
            <RadioGroupItem id={`${idPrefix}-${value}`} value={value} />
            <Label htmlFor={`${idPrefix}-${value}`} className="font-normal break-words">
              {MATCH_LEVEL_TEXTS[value].label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

export default function RegistrySearch({ version }: Props) {
  // The picked suggestion; its `withdrawn` flag stays the card's source, because the check does not return it.
  const [selected, setSelected] = useState<RegistryVariant | null>(null);
  // Full data of the checked medicine (e.g. the full strength); until the check answers the card shows the suggestion.
  const [searched, setSearched] = useState<SearchedMedicine | null>(null);
  const shown = selected && searched?.id === selected.id ? searched : selected;
  const [level, setLevel] = useMatchLevel();
  const list = useRegistryListWorker(version);

  return (
    <div className="min-w-0 space-y-6">
      {/* Editing the text drops the pick: the card and the verdict must never sit under a different name. */}
      <MedicineSuggest
        list={list}
        onSelect={setSelected}
        onEdit={() => {
          setSelected(null);
        }}
      />
      <MatchLevelSwitch level={level} onChange={setLevel} />
      {/* Only the name is announced; the card itself is read when the user moves to it. The verdict is announced by
          MedicineCheckResult once the check answers. */}
      <p role="status" aria-live="polite" className="sr-only">
        {selected ? `Wybrano: ${selected.name}` : ""}
      </p>
      {selected && shown && (
        <div className="min-w-0 space-y-4">
          <VariantCard variant={shown} withdrawn={selected.withdrawn} />
          <MedicineCheckResult key={selected.id} productId={selected.id} level={level} onSearched={setSearched} />
        </div>
      )}
    </div>
  );
}
