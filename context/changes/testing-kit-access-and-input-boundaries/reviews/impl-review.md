<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Faza 3 wdrażania testów — dostęp do apteczki i granice danych wejściowych

- **Plan**: context/changes/testing-kit-access-and-input-boundaries/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Kryteria automatyczne: `npm run lint`, `npx astro check` i `vitest --project unit --project component` (4 pliki, 116 testów, bez `tests/api/`) przechodzą lokalnie 2026-10-17. `test:db` (`kit-access.test.ts`: 23 testy) i `test:api` (48 + 9 testów) przechodzą w jobie `smoke` na PR #41 (run 39061012530). Kontrole ręczne 1.4, 1.5, 2.5, 2.6 i 3.4 potwierdzone przez autora w trakcie implementacji.

Drobne odstępstwa od planu, uzasadnione i nie zgłaszane osobno: przypadek `?dodano` używa trzeciego konta C z pustą apteczką (komentarz w teście), `signUpAndSignIn(label)` zwraca `{email, jar}`, jedna para A/B na cały plik bazy zamiast pary na grupę (savepoint na test zapewnia niezależność). Dodatki nieobjęte planem (kontrola pozytywna 200 dla `GET /api/kit/check`, `hookTimeout`, backport do §2 planu testów) są nieszkodliwe.

## Findings

### F1 — `test:api` nie pilnuje, że serwer działa na lokalnej bazie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/api/helpers.ts:5-7, tests/api/kit-input.test.ts:31-33
- **Detail**: `BASE_URL` przyjmuje dowolny adres bezwzględny, bez sprawdzenia hosta jak w `connectLocal` (`LOCAL_HOSTS`). Ważniejsze: nawet `localhost:4321` może być serwerem podpiętym do chmurowego Supabase (README to opisuje), a nic nie wiąże bazy serwera z lokalnym `DATABASE_URL`, z którego czytają testy. Wtedy `kit-input` najpierw zakłada prawdziwe konto (rejestracja jest przed `loadBoundaryData`), zapisuje wiersze w chmurze, a `expectRejected` przechodzi pusto (liczba wierszy 0 → 0 w lokalnej bazie). Zestaw padnie dopiero na `expectStored`, po zapisach zdalnych. AGENTS.md dla `ui:shots` i `perf` deklaruje „local hosts only”.
- **Fix**: W `helpers.ts` odrzucać `BASE_URL` o hoście spoza `LOCAL_HOSTS`, a po `signUpAndSignIn` sprawdzić, że e-mail jest w lokalnym `auth.users` (inaczej błąd „serwer nie działa na lokalnym DATABASE_URL”); w `kit-input` wczytać dane graniczne przed rejestracją, jak w `kit-access`.
  - Strength: domyka tę samą regułę „tylko lokalnie”, którą ma `connectLocal` i pozostałe skrypty; drugie sprawdzenie łapie też lokalny serwer na chmurowej bazie.
  - Tradeoff: kilka linii w pomocniku i jedno zapytanie na konto.
  - Confidence: HIGH — wzorzec `LOCAL_HOSTS` już istnieje w `tests/db/medicine-check-fixtures.ts:9-24`.
  - Blind spot: nie sprawdzono, czy ktoś uruchamia `test:api` na adresie innym niż localhost (CI używa `localhost:4321`).
- **Decision**: FIXED — strażnik hosta `BASE_URL` (`LOCAL_HOSTS` wyeksportowane z fixture'ów), sprawdzenie konta w lokalnym `auth.users` po zalogowaniu, w `kit-input` dane graniczne przed rejestracją

### F2 — Wpis `test:api` w AGENTS.md jest nieścisły

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:39
- **Detail**: (a) „signs up 2–3 throwaway accounts” — w rzeczywistości 4 (`input`, `owner`, `other`, `viewer`), czyli 8 żądań do limitu 30 rejestracji i logowań na 5 min (ok. 3 przebiegi). (b) Lista „run it after changing” pomija `src/lib/kit-format.ts` (`MAX_QUANTITY`, `packQuantity` — dokładnie te granice) i `src/pages/apteczka.astro` (przypadek `?dodano`); plan wymieniał `kit-format`. (c) Zdanie o izolacji apteczki w `test:db` stoi na końcu wpisu `test:api`, a wpis `test:db` dalej opisuje tylko regułę `medicine_check`.
- **Fix**: Poprawić liczbę kont na 4, dopisać oba pliki do listy, przenieść zdanie o `kit-access.test.ts` do wpisu `test:db`.
- **Decision**: FIXED — 4 konta i limit, `kit-format.ts` i `apteczka.astro` na liście, zdanie o izolacji przeniesione do `test:db`; dopisana zasada „tylko serwery lokalne” z F1

### F3 — §6.2 i §6.4 planu testów opisują wzorzec nieściśle

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:159, :161, :186
- **Detail**: §6.2 mówi „dwa syntetyczne konta A i B na grupę przypadków” (jest jedna para na plik) i „do każdej grupy należy kontrola, że właściciel widzi swój wiersz” (jest jedna taka kontrola). §6.4 mówi „limit 30 rejestracji na 5 minut” (limit liczy rejestracje i logowania razem) i „błąd rejestracji mówi to wprost” (to wskazówka „zwykle przyczyną jest…”, tylko przy rejestracji, zob. F6). Autor potwierdził 3.4 na podstawie tych sekcji, więc przyszły test S-05 skopiuje te nieścisłości.
- **Fix**: Przeredagować te trzy zdania zgodnie z kodem (jedna para A/B na plik, savepoint na test; kontrola „właściciel widzi swój wiersz” co najmniej raz w pliku; limit 30 rejestracji i logowań, 4 konta na przebieg).
- **Decision**: FIXED — §6.2: jedna para na plik, kontrola właściciela co najmniej raz, doprecyzowane konto per przypadek w teście reguły; §6.4: limit 30 rejestracji i logowań, 4 konta, nowy punkt „tylko lokalnie” z F1

### F4 — „B nie może wskazać A jako właściciela” wysyła e-mail zamiast id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/api/kit-access.test.ts:54-61
- **Detail**: Test wysyła `userId: a.email`, nie uuid konta A. Dziś 400 daje `.strict()` niezależnie od wartości, więc test pokrywa się z przypadkiem nieznanego klucza w `kit-input`. Gdyby przyszły schemat przyjmował uuid w `userId` jako właściciela, ten test nadal dostałby 400 (bo e-mail nie jest uuid) i przeszedłby, choć luka byłaby otwarta.
- **Fix**: Odczytać uuid A z lokalnego `auth.users` (nowy pomocnik obok `kitRowCount`) i wysłać go w `userId`.
- **Decision**: FIXED — pomocnik `userIdOf`, przypadek wysyła prawdziwe uuid A w `userId` i `user_id` (`it.each`)

### F5 — Test „za duże ciało” nie sprawdza rozmiaru ani liczby wierszy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/api/kit-input.test.ts:73-78
- **Detail**: Dopełnienie siedzi w nieznanym kluczu `padding`, więc 400 daje `.strict()`, a nie limit rozmiaru (takiego limitu w trasie nie ma). Test przyjmuje dowolne 4xx i jako jedyny przypadek nieprawidłowy nie sprawdza `kitRowCount`, wbrew regule trzech asercji z §6.4. Dowodzi „brak 500 i brak wycieku”, nazwa obiecuje więcej.
- **Fix**: Użyć `expectRejected(400, …)` i zmienić nazwę na „an oversized body (100 kB in an unknown key) gets 400 and writes nothing”.
- **Decision**: FIXED — `expectRejected(400, …)` (status, liczba wierszy, brak wnętrza), uczciwa nazwa i komentarz, że trasa nie ma limitu rozmiaru

### F6 — Błąd logowania w pomocniku nie podpowiada przyczyny

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/api/helpers.ts:84-94
- **Detail**: Przy włączonym potwierdzaniu e-maili rejestracja i tak daje 302 na `/auth/confirm-email`, a odrzuca dopiero logowanie („Email not confirmed”). Wskazówka o potwierdzaniu i o limicie (który liczy też logowania) jest tylko w błędzie rejestracji. Komunikat Supabase widać w `location`, więc przyczyna nie ginie, ale wskazówka stoi w złej gałęzi.
- **Fix**: Przenieść wskazówkę o potwierdzaniu e-maili do błędu logowania i dodać do niego wskazówkę o limicie.
- **Decision**: FIXED — wskazówka o limicie w obu błędach, o potwierdzaniu e-maili w błędzie logowania; §6.4 zaktualizowane

### F7 — Przypadek `?dodano` bez kontroli pozytywnej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/api/kit-access.test.ts:74-87
- **Detail**: Asercje `not.toContain("Dodano:")` i brak nazwy leku przeszłyby, gdyby zmieniło się brzmienie potwierdzenia albo nazwa była w HTML zakodowana (`&`, `'`; smoke używa `escapeHtml`). „Apteczka jest pusta” częściowo to równoważy.
- **Fix**: W tym samym teście otworzyć `/apteczka?dodano=<id>` jako A i sprawdzić, że widać „Dodano:” i nazwę leku (zakodowaną jak w HTML); dopiero potem sprawdzić stronę konta C.
- **Decision**: FIXED — kontrola pozytywna jako A („Dodano:” i nazwa), nazwa kodowana `escapeHtml` (nowy pomocnik, ten sam co w smoke) w obu asercjach

### F8 — Wybór opakowania „bez rozmiaru” inaczej obcina spacje niż aplikacja

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/api/helpers.ts:119 (`SIZE_SHAPE`)
- **Detail**: SQL używa `btrim` (tylko spacje), a `packQuantity` w `src/lib/kit-format.ts:11` — JS `.trim()` (także tabulatory i NBSP; NBSP występuje w rejestrze, §6.6 Fazy 1). Opakowanie z `count` = `"10 "` SQL uzna za „bez rozmiaru”, a aplikacja za rozmiar 10, więc „100000 na opakowaniu bez rozmiaru” może paść na pełnym rejestrze. Na fixture'ach z CI nie występuje.
- **Fix**: Za „bez rozmiaru” brać tylko opakowania, których `count` nie zawiera żadnej cyfry (`!~ '[0-9]'`), zamiast negacji `SIZE_SHAPE`.
- **Decision**: FIXED (doprecyzowane) — `UNSIZED_SHAPE`: liczba wpisów różna od 1 albo `count` bez żadnej cyfry; to zgodne z `packQuantity` (więcej niż jeden wpis też daje brak rozmiaru)

### F9 — `medicine-check-fixtures.ts` jest teraz wspólnym pomocnikiem, a nagłówek mówi inaczej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/db/medicine-check-fixtures.ts:1
- **Detail**: Plik używają już `kit-access.test.ts` i `tests/api/helpers.ts`, a nagłówek dalej mówi „Fixtures for the medicine check rule tests”. Plan celowo zostawił nazwę pliku; nagłówek jest jednak mylący dla kolejnego agenta.
- **Fix**: Zaktualizować komentarz nagłówka (wspólne pomocniki testów bazy i API: połączenie lokalne, role, oczekiwane błędy, fixture'y reguły); nazwy pliku nie zmieniać.
- **Decision**: FIXED — nowy komentarz nagłówka (wspólne pomocniki testów bazy i API), nazwa pliku bez zmian
