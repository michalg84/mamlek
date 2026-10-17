# Faza 3 wdrażania testów — dostęp do apteczki i granice danych wejściowych — Plan Brief

> Full plan: `context/changes/testing-kit-access-and-input-boundaries/plan.md`
> Research: `context/changes/testing-kit-access-and-input-boundaries/research.md`

## What & Why

Dowodzimy, że jedno konto domowe nie odczyta ani nie zmieni apteczki innego konta i że bez sesji nie dostanie nic (ryzyko #4). Dowodzimy też, że endpointy apteczki odpowiadają na nieprawidłowe dane czystym 4xx, nic nie zapisują i nie ujawniają wnętrza serwera (ryzyko #6). To faza 3 z `context/foundation/test-plan.md` §3.

## Starting Point

Izolację trzymają polityki RLS per operacja i granty w bazie, a nie kod tras. Smoke sprawdza dziś anonima i to, że drugie konto nie widzi leku na ekranie i w sprawdzeniu. Brak testów bezpośrednich operacji jako inne konto, roli `anon` na tabeli i funkcjach oraz większości granic danych. Żadne znane dane nie dają dziś 500, więc testy chronią przed regresją.

## Desired End State

`npm run test:db` dowodzi izolacji i ograniczeń bazy na dwóch syntetycznych kontach i roli `anon`, przypina przyjętą lukę F2 i pilnuje, że żadna funkcja w `public` nie jest `security definer`. Nowy `npm run test:api` dowodzi przez HTTP na uruchomionym serwerze trzech rzeczy:

- każde nieprawidłowe żądanie dostaje 4xx bez zapisu i bez śladów wnętrza serwera;
- anonim dostaje 401 niezależnie od treści;
- drugie konto nie dotrze do cudzej apteczki.

Oba zestawy działają w jobie CI `smoke`.

## Key Decisions Made

| Decyzja                            | Wybór                                                         | Dlaczego                                                                        | Źródło   |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Gdzie testy API                    | Nowy projekt Vitest `test:api` w `tests/api/`                 | Nazwane przypadki i `it.each` na granice; smoke zostaje krótki i bez zależności | Plan     |
| Izolacja na poziomie danych        | Tylko uprząż SQL z przełączaniem roli                         | Te same polityki i granty co PostgREST, bez zmian w CI i bez kont do sprzątania | Plan     |
| Podpięcie do CI                    | Już teraz, w kroku smoke                                      | Ochrona od pierwszego PR, jak `test:db` w Fazie 1; Faza 4 tylko ją wymusza      | Plan     |
| `issues` zod w odpowiedzi 400      | Dopuszczalne                                                  | To szczegóły żądania; testy pilnują braku SQL, nazw tabel i stosu w treści      | Plan     |
| Luka F2 (niezmienniki tylko w API) | Przypięta nazwanymi testami `known gap (Parked, F2)`          | Zamknięcie lub poszerzenie luki wywróci test, zgodnie z §6.2                    | Plan     |
| Strażnik `security definer`        | Test w `pg_proc` dla `public`, pusta lista wyjątków           | Łapie przyszłe funkcje (S-05), których test zachowania nie obejmie              | Plan     |
| Źródło wartości granicznych        | Kolumny bazy, kontrakt S-04, F1; nie schemat zod              | Antywzorzec z test-plan #6: nie przepisywać schematu w teście                   | Research |
| Dane graniczne z rejestru          | Wybierane zapytaniem do lokalnej bazy, nie wpisane na sztywno | Działa na fixture'ach w CI i na pełnym rejestrze lokalnie                       | Plan     |
| „Nic nie zapisano”                 | Liczba wierszy `kit_items` konta przed i po żądaniu           | Sprawdzenie na danych, dokładne dla każdego przypadku                           | Plan     |

## Scope

**In scope:**

- `tests/db/kit-access.test.ts` i pomocniki ról w `tests/db/medicine-check-fixtures.ts`
- `vitest.api.config.ts`, skrypt `test:api`, `tests/api/{helpers,kit-input.test,kit-access.test}.ts`
- Krok CI, AGENTS.md, README, plan testów (§3, §6.2, §6.4, §6.6, §7, §8)

**Out of scope:**

- Test przez prawdziwe PostgREST z JWT
- Zamknięcie luki F2 w bazie
- Zmiana odpowiedzi 400
- Zmiany w `smoke.mjs`
- Trasy edycji i usuwania (S-05)
- Wymuszenie bramki (Faza 4)

## Architecture / Approach

Dwie warstwy dowodu:

- **Baza**: przypadki SQL w wycofywanej transakcji. Rola `authenticated` z `request.jwt.claims` konta B albo rola `anon`; każde oczekiwane odrzucenie we własnym savepoincie.
- **HTTP**: czarna skrzynka na działającym podglądzie. Sesja z ciasteczek po rejestracji przez trasy aplikacji, a lokalna baza tylko do odczytu, żeby wybrać rekordy graniczne i policzyć wiersze konta.

Granica ma zawsze obie strony: tuż za granicą 4xx, na granicy 201.

## Phases at a Glance

| Faza                                    | Co dostarcza                                                                           | Główne ryzyko                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Izolacja i ograniczenia w bazie      | `kit-access.test.ts` w `test:db`: drugie konto, `anon`, ograniczenia, F2, strażnik     | Przerwana transakcja po błędzie SQL, jeśli zabraknie savepointu        |
| 2. Granice i dostęp przez API aplikacji | `npm run test:api`: granice #6 bez zapisu i wycieku, 401 przed walidacją, cudzy wiersz | Limit logowań lokalnego Supabase przy częstych przebiegach             |
| 3. CI i dokumentacja                    | Krok w jobie `smoke`, AGENTS.md, README, książka kucharska §6.2/§6.4                   | Pierwszy przebieg w CI ujawni różnicę środowiska (preview vs lokalnie) |

Fazy 1 i 2 można wykonać równolegle (rozłączne pliki); Faza 3 po obu.

**Prerequisites:** lokalny Supabase z migracjami (`npx supabase db reset`), zaimportowane fixture'y v1, v1, v2, zbudowana aplikacja na `npm run preview`, potwierdzanie e-maili wyłączone.
**Estimated effort:** ~2 sesje: fazy 1 i 2 równolegle w jednej, Faza 3 i przebieg CI w drugiej.

## Open Risks & Assumptions

- Zakładamy, że przypadek SQL z ustawioną rolą i `request.jwt.claims` sprawdza tę samą politykę, którą sprawdziłoby żądanie PostgREST. Nie sprawdziliśmy tego w dokumentacji w tej sesji, a wykluczenie zapiszemy w §7.
- Strażnik `security definer` zakłada, że Supabase nie instaluje własnych funkcji `definer` w `public`. Na zresetowanej bazie migracje żadnej nie tworzą. Jeśli strażnik coś znajdzie, trzeba to zbadać, a nie dopisać do wyjątków bez decyzji.
- Konta z `test:api` zostają w bazie lokalnej i w efemerycznej bazie CI (jak w smoke).

## Success Criteria (Summary)

- Drugie konto i anonim nie odczytają ani nie zmienią cudzej apteczki żadną ścieżką: bezpośrednio na danych ani przez API aplikacji. Każdą taką regresję wywraca test w CI.
- Każde nieprawidłowe żądanie do endpointów apteczki dostaje 4xx, nic nie zapisuje i nie pokazuje wnętrza serwera; obie strony każdej granicy są przypięte.
- Książka kucharska pozwala dopisać testy dla tras S-05 tym samym wzorcem.
