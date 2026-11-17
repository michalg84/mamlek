<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Poziom dopasowania substancji czynnych (S-06)

- **Plan**: context/changes/substance-match-level/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Weryfikacja automatyczna (2026-11-17, ten przegląd): `astro sync`, `npm run lint`, `npx astro check` (0 błędów), `npm run ui:scan` (0 trafień w 14 plikach), unit + component + registry 744/744, `npm run test:db` 171/171 — zielone. `npm run test:api` nieuruchomione lokalnie (2.2, sprawdzi CI `smoke`).

Odstępstwa od planu (alias `match_strength`, `alsoHeading`, sekcja „Puste opakowania” bez zastrzeżenia, `useSyncExternalStore`, przełącznik zawsze pionowy) są opisane w Progress 1.1 i 3.4. Zmiana `roadmap.md` (status S-06, poprawione zdanie Risk) to zwykła aktualizacja roadmapy.

## Findings

### F1 — Przełącznik nie reaguje, gdy zawodzi tylko zapis do localStorage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLevel.ts:22-34, 49-56
- **Detail**: `pickedHere` jest czytane tylko w `catch` funkcji `readStored()`. Gdy `getItem` działa, a `setItem` rzuca (pełna pamięć `QuotaExceededError`, starsze Safari w trybie prywatnym z limitem 0), `setLevel` zapisuje `pickedHere` i powiadamia słuchaczy, ale `readStored()` znowu zwraca starą wartość z pamięci albo domyślną. Kliknięcie nic nie zmienia: radio wraca, nowe sprawdzenie nie idzie; ślad tylko w `console.warn`. Test `RegistrySearch.test.tsx:551` psuje oba wywołania naraz, więc tego przypadku nie łapie.
- **Fix**: W `readStored()` zwracać `pickedHere`, gdy jest ustawione (przed odczytem z pamięci), i dodać test, w którym rzuca tylko `setItem`.
- **Decision**: FIXED (zmiana zastana w drzewie od drugiej instancji S-06, zgodna z poprawką; przejrzana; test „full quota” dodany)

### F2 — Stan modułu `useMatchLevel` przecieka między testami

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLevel.ts:10-11
- **Detail**: `pickedHere` i `readFailureLogged` żyją w module; Vitest nie resetuje modułów między testami jednego pliku. Dziś test „storage refuses” jest ostatni, więc nic nie pęka, ale kolejny podobny test zacząłby od `any` i bez ostrzeżenia. Przy poprawce F1 `pickedHere` będzie czytane zawsze, więc przeciek zacząłby wpływać na każdy następny test w pliku.
- **Fix**: Wyeksportować reset do testów (albo `vi.resetModules()` w tym `describe`) i wołać go w `afterEach` obok `localStorage.clear()`.
- **Decision**: FIXED (`forgetUnsavedMatchLevel()` w `afterEach`)

### F3 — Okno między merge a `db push`: poziomy luźne dają 500

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/medicine-check.ts:17-18, AGENTS.md (Supabase migrations)
- **Detail**: Plan (Critical Implementation Details) to opisuje, ale AGENTS.md i nagłówek migracji mówią tylko, że kod działa na starej bazie „na poziomie domyślnym”. Po merge, przed `db push`, `all` / `any` wysyłają `p_level`, którego stara funkcja nie zna: API zwraca 500, ekran pokazuje błąd z ponowieniem. Błąd jest logowany, nic nie jest ukryte.
- **Fix**: Dopisać w AGENTS.md przy tej migracji, że do `db push` poziomy luźne kończą się błędem, więc push robić zaraz po merge.
- **Decision**: FIXED (AGENTS.md: poziomy `all` / `any` dają 500 do `db push`, push zaraz po merge)

### F4 — Tekst „nie dało się sprawdzić” nie zależy od poziomu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/registry/MedicineCheckResult.tsx:20-21
- **Detail**: `UNCOMPARABLE` („…nie dało się sprawdzić leków z tą samą substancją”) jest jedynym tekstem werdyktu, który nie zmienia się z poziomem. Na `all` / `any` brzmi lekko nieprecyzyjnie; plan go nie wymienia.
- **Fix**: Zostawić (sens jest ten sam: brak substancji uniemożliwia każde porównanie) albo przenieść do `MATCH_LEVEL_TEXTS` z wersją ogólną („…nie dało się porównać jego składu z apteczką”).
- **Decision**: FIXED (ogólny tekst: „…nie dało się sprawdzić leków o podobnym składzie.”)

### F5 — Progress 1.5 i 2.4 odhaczone, ale z dopiskiem „czeka na potwierdzenie użytkownika”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/substance-match-level/plan.md:307, 319
- **Detail**: Oba punkty mają `[x]` i wyniki sprawdzenia przez agenta (na prośbę użytkownika), ale zostały w nich stare słowa „czeka na potwierdzenie użytkownika”, sprzeczne ze stanem.
- **Fix**: Usunąć te słowa z obu punktów.
- **Decision**: FIXED (623db08: pickedHere wins over storage, cleared after a successful save; regression test with only setItem throwing)

### F6 — `test:api` (2.2) nie był uruchomiony

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/api/kit-input.test.ts
- **Detail**: Nowe testy API (400 dla złego poziomu, echo, brak = `exact`) nie przeszły jeszcze ani razu: lokalna baza ma pełny rejestr zamiast fixture'ów, więc pierwszy przebieg będzie w CI (`smoke`). Test „nadzbiór od `all`” z planu został w `test:db` (fixture'y nie mają pary nadzbioru), co jest opisane w 2.2.
- **Fix**: Po otwarciu PR-a sprawdzić job `smoke`; czerwony to sygnał do poprawki, nie do obejścia.
- **Decision**: FIXED (623db08: forgetUnsavedMatchLevel + vi.restoreAllMocks in afterEach)
