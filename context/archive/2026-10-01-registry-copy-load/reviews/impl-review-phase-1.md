<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Kopia Rejestru Produktów Leczniczych w bazie

- **Plan**: context/changes/registry-copy-load/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

Przegląd zrobiony w głównym kontekście, bez podagentów. Diff fazy 1 (`7ab0180..982fabf`) zawiera jeden plik z kodem (migracja, 186 linii), który był już w całości przeczytany. Pozostałe 3 pliki to dokumenty procesu.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Plan adherence

`supabase/migrations/20261001120000_registry_tables.sql` jest zgodny z kontraktem fazy 1 (MATCH):

- 4 tabele z kolumnami zgodnymi z kontraktem;
- `created_at`/`updated_at timestamptz not null default now()`;
- liczniki `int not null`;
- tekst bez limitów długości;
- PK `(product_id, position)`;
- indeks `registry_packages_product_id_idx`;
- `COMMENT ON` z nazwą pola XML dla każdej tabeli i kolumny;
- RLS na 4 tabelach i po jednej polityce `SELECT TO authenticated USING (true)`;
- jawny `grant select … to authenticated`.

Pliki spoza planu w diffie: `change.md`, `plan.md` (Progress) i `roadmap.md`. To zmiany statusów wymagane przez `/10x-implement`, a nie rozszerzenie zakresu.

Decyzje podagenta, których plan nie przesądzał i które są spójne z kontraktem:

- `text[]` i `jsonb` mają `not null default '{}'`/`'[]'`;
- `ON DELETE CASCADE` dla opakowań;
- `finished_at default clock_timestamp()`.

## Success criteria

| Kryterium                                  | Wynik                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1.1 `npx supabase db reset`                | PASS — migracja zastosowana                                                                              |
| 1.2 `npx supabase db lint --fail-on error` | PASS — „No schema errors found”, kod 0                                                                   |
| 1.3 `npm run lint`                         | PASS                                                                                                     |
| 1.4 `npx astro check`                      | PASS — 0 errors, 0 warnings                                                                              |
| 1.5 Studio (manual)                        | `[x]` — potwierdzone przez użytkownika na podstawie wyniku SQL (Studio było wyłączone flagą `-x studio`) |
| 1.6 SQL `pg_class`/`pg_policies` (manual)  | `[x]` — `relrowsecurity = t` ×4, 1 polityka SELECT/`{authenticated}` na tabelę                           |

## Findings

### F1 — Domyślne uprawnienia Supabase dają anon/authenticated zapis i TRUNCATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_registry_tables.sql:176
- **Detail**: Domyślne uprawnienia schematu `public` w Supabase dały rolom `anon` i `authenticated` na `registry_products` uprawnienia `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` (sprawdzone w `information_schema.role_table_grants` na lokalnej bazie). Brak polityk zapisu blokuje INSERT, UPDATE i DELETE przez RLS, ale RLS nie obejmuje `TRUNCATE`. Dziś PostgREST nie wykonuje TRUNCATE, więc nie da się tego zrobić przez API. Zakaz zapisu przez API opiera się jednak na dwóch domysłach: że PostgREST nie udostępnia TRUNCATE i że nie powstanie funkcja SECURITY INVOKER, która go wykona. Plan po przeglądzie (F1) celowo przestał polegać na domyślnych grantach przy odczycie; przy zapisie nadal na nich polega.
- **Fix**: Dopisać na końcu migracji `revoke insert, update, delete, truncate, references, trigger on <4 tabele> from anon, authenticated;`. SELECT zostaje dla obu ról: `anon` nadal dostaje 0 wierszy przez RLS, a sprawdzenie z fazy 3 (`count(*) = 0`) działa bez zmian. Migracji nie zastosowano jeszcze nigdzie poza lokalną bazą, a gałąź nie jest wypchnięta, więc wystarczy edycja na miejscu i `db reset`.
- **Decision**: FIXED (revoke dopisany w migracji; po `db reset` anon i authenticated mają tylko SELECT, TRUNCATE i INSERT kończą się `permission denied`, SELECT dla anon zwraca 0 wierszy)

### F2 — Komentarz `leaflet_url` nie odpowiada decyzji o ulotce z importu równoległego

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20261001120000_registry_tables.sql:55
- **Detail**: Komentarz mówi `(XML ulotka)`. Po fazie 1 użytkownik zdecydował, że `leaflet_url` = `ulotka`, a gdy jest pusta, `ulotkaImportRownolegly`. W zrzucie 2026-09-23 3 235 z 20 258 produktów ludzkich ma ulotkę tylko w tym drugim polu, a żaden z 4 351 produktów IR nie ma `ulotka`. Plan (kontrakt fazy 1 i 2) też nie zapisuje tej decyzji, więc parser z fazy 2 mógłby jej nie uwzględnić.
- **Fix**: Zmienić komentarz na `'Patient leaflet URL (XML ulotka; for parallel imports, where ulotka is empty, XML ulotkaImportRownolegly).'` i dopisać fallback do kontraktu parsera w fazie 2 planu.
- **Decision**: FIXED (komentarz w migracji + punkt o fallbacku w kontrakcie parsera, faza 2 planu)
