# Withdrawn medicine in kit — Plan Brief

> Full plan: `context/changes/withdrawn-medicine-in-kit/plan.md`
> Roadmap: S-13, OQ5 · Audit: `context/audits/prd-conformance/2026-11-16.md` (F15)

## What & Why

Lek kupiony przed wycofaniem z rejestru nie da się dziś wpisać do apteczki. Nie ma go w podpowiedziach, a API odrzuca jego opakowania. Domowa apteczka zawiera jednak takie leki przez lata. Pokazujemy je więc z oznaczeniem „wycofany z rejestru” i pozwalamy dodać, zaimportować i sprawdzić.

## Starting Point

Wycofane leki blokują trzy miejsca:

- lista podpowiedzi (`removed_at is null` w `registry_refresh_search_list`);
- funkcja `registry_variant_packages`, która zwraca tylko aktywne opakowania;
- `getPackage` i `getPackages` w `kit.ts` oraz `PATCH`.

Polityki RLS `kit_items` niczego nie blokują. Roadmapa i audyt wskazywały je błędnie. `medicine_check` już obsługuje wycofane leki.

## Desired End State

Podpowiedzi zawierają wycofane warianty z oznaczeniem, za aktywnymi w obrębie poziomu dopasowania. Wariant jest wycofany tylko wtedy, gdy wycofane są wszystkie jego produkty. Lista opakowań pokazuje też wycofane, oznaczone i na końcu. API przyjmuje wycofane opakowania przy dodaniu, imporcie i edycji. Karta sprawdzenia zachowuje oznaczenie.

## Key Decisions Made

| Decision                             | Choice                                                  | Why (1 sentence)                                                                        | Source     |
| ------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Kolejność w podpowiedziach           | Wycofany za aktywnymi w obrębie poziomu                 | Dokładna nazwa wycofanego leku zostaje wysoko, a wśród równych trafień wygrywa aktywny. | Użytkownik |
| Wycofane opakowania aktywnych leków  | Pokazywane z oznaczeniem, za aktywnymi                  | Można wpisać dokładnie to pudełko, które jest w domu.                                   | Użytkownik |
| Import CSV z wycofanym „bliźniakiem” | Wybór użytkownika (reguła `matchRow` bez zmian)         | Zgodne z import-match-safety: nigdy nie zgadujemy przy dwóch trafieniach.               | Użytkownik |
| Zakres                               | Wszystkie wycofane z bazy, bez limitu wieku             | Najprostsza reguła; limit można dodać jedną migracją.                                   | Użytkownik |
| Wydajność                            | Pomiar z ~1000 sztucznie dodanymi wycofanymi wariantami | Lokalnie nie ma żadnego wycofanego leku.                                                | Użytkownik |
| Znacznik w krotce                    | Opcjonalny 7. element `true` tylko dla wycofanych       | Payload aktywnych bez zmian; stary kod go ignoruje.                                     | Plan       |
| Samodzielny wybór opakowania         | Tylko gdy wariant ma jedno opakowanie w ogóle           | Ta sama zasada „nie zgaduj”, gdy obok jest wycofane.                                    | Plan       |
| Znacznik na karcie sprawdzenia       | Z wybranej podpowiedzi w stanie klienta                 | Bez zmiany `medicine_check`, którą zmienia S-14.                                        | Plan       |
| Kolejność wdrożenia                  | Kod, potem `db push`                                    | Nowy kod działa na starej bazie, odwrotnie nie.                                         | Plan       |

## Scope

**In scope:**

- Migracja `registry_refresh_search_list` i `registry_variant_packages`.
- `kit.ts`, trzy endpointy i typy.
- Sortowanie wyszukiwarki, etykiety w podpowiedziach, na karcie i w trzech formularzach.
- Testy db, api, unit i component, golden `search:check` i pomiar perf.
- PRD, roadmapa, audyt, test-plan, AGENTS.md.

**Out of scope:**

- Polityki RLS i `medicine_check`.
- Limit wieku wycofanych.
- Zmiana reguły `matchRow`.
- Pomiar na produkcji.

## Phases at a Glance

| Phase                  | What it delivers                                                      | Key risk                                                             |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Baza                | Lista z wycofanymi, opakowania z `withdrawn`, testy db i import-check | `drop function` przy zmianie kolumn; przedstawiciel musi być aktywny |
| 2. Serwer i API        | Typy, `kit.ts`, 3 endpointy, `test:api`                               | Zgodność ze starą bazą (brak kolumny, krotka 6-elementowa)           |
| 3. Podpowiedzi i karta | Kolejność, etykiety na `/szukaj`, `search:check`                      | Znacznik znika po `onSearched`                                       |
| 4. Formularze          | Wycofane opakowania w dodaniu, imporcie i edycji                      | Podwójne „obecne” opakowanie w edycji; samodzielny wybór             |
| 5. Perf i dokumentacja | Pomiar z 1000 wariantami, testy końcowe, dokumenty                    | Przełączanie bazy: fixture'y vs pełny rejestr                        |

**Prerequisites:** Docker i lokalny Supabase; pełny rejestr do perf i `search:check`.
**Estimated effort:** 2–3 sesje. Fazy 3 i 4 można robić równolegle.

## Open Risks & Assumptions

- Na produkcji wycofań jest mało (od października 2026), więc pomiar opiera się na sztucznych danych.
- Wariant z jednym aktywnym i jednym wycofanym opakowaniem nie wybiera już opakowania sam. To przyjęte, przypięte testem.
- Migracja wymaga ręcznego `db push` po merge'u.

## Success Criteria (Summary)

- Wycofany lek da się znaleźć, dodać, zaimportować i sprawdzić, a w każdym miejscu ma oznaczenie.
- Aktywne leki dalej stoją pierwsze w obrębie poziomu dopasowania, a `search:check` nie pokazuje różnic.
- Lista z 1000 dodatkowymi wycofanymi wariantami mieści się w progu 5 s na wolnym profilu.
