# Keepalive dziennego importu rejestru (S-16) — plan wdrożenia

## Overview

Dzienny import rejestru (`.github/workflows/registry-import.yml`) działa z harmonogramu GitHuba, który w publicznym repozytorium wyłącza się po 60 dniach bez aktywności. Plan dodaje dwa niezależne zabezpieczenia (decyzja autora 2026-11-18: opcja A + D):

- **A — keepalive**: osobny job w workflowie importu, który przy każdym przebiegu woła API GitHuba „Enable a workflow” na tym samym workflowie;
- **D — ostrzeżenie**: gdy data stanu rejestru jest starsza niż 7 dni, linia „Stan rejestru na …” na `/szukaj` i na `/apteczka` zmienia się w wyróżnione ostrzeżenie, że dane mogą być nieaktualne.

## Current State Analysis

- `.github/workflows/registry-import.yml:7-9` — harmonogram `17 4 * * *` + `workflow_dispatch`; `permissions: contents: read` (linie 16-17); jeden job `import` z guardem `github.ref == 'refs/heads/main'` (linia 21) i sekretem produkcyjnym `REGISTRY_DATABASE_URL`.
- Repozytorium jest publiczne (`gh repo view`), workflowy `CI` i `Registry import` mają stan `active`; ostatnie 8 przebiegów z harmonogramu (2026-11-10…17) zakończyło się sukcesem, startując ok. 11:30–13:30 UTC.
- `src/pages/szukaj.astro:54-57` — szara linia `Stan rejestru na {formatRegistryDate(list.snapshotDate)}`, tylko gdy lista jest wczytana; brak porównania z dzisiejszą datą.
- `src/pages/apteczka.astro` — ładuje już `list` (`getSearchListVersion`) i liczy `todayIso("Europe/Warsaw")` (`src/lib/kit-format.ts:211`) dla `KitList`, ale daty stanu rejestru nie pokazuje.
- `src/lib/registry-date.ts:4` — `formatRegistryDate` formatuje przez podział napisu, celowo bez `Date` (strefa czasowa).
- RPL stempluje eksport bieżącą datą (`context/archive/2026-10-07-daily-registry-refresh/plan.md:11`), więc data stanu to w praktyce dzień ostatniego udanego importu.
- Szczegóły opcji i źródeł: `context/changes/registry-import-keepalive/research.md`.

## Desired End State

- Każdy przebieg workflowu importu z `main` (z harmonogramu i ręczny) ma dodatkowy job `keepalive`, który woła `PUT /repos/{owner}/{repo}/actions/workflows/registry-import.yml/enable` i kończy się sukcesem niezależnie od wyniku importu; job `import` nie dostaje dodatkowych uprawnień.
- Na `/szukaj` i `/apteczka`, gdy lista rejestru jest wczytana: przy danych nie starszych niż 7 dni widać szarą linię „Stan rejestru na D.MM.RRRR” (na `/szukaj` bez zmian wyglądu); przy danych starszych niż 7 dni linia jest wyróżniona (kolor `warning`, ikona) z tekstem „Stan rejestru na D.MM.RRRR — dane mogą być nieaktualne”.
- Dokumentacja nie nazywa już ryzyka 60 dni „przyjętym”: opisuje keepalive, ostrzeżenie i ręczne włączenie jako awaryjną ścieżkę.

Weryfikacja: testy jednostkowe funkcji wieku danych, `ui:scan` czysty, ręczny podgląd obu stron w stanie świeżym i przeterminowanym, a po merge'u zielony job `keepalive` na najbliższym przebiegu z harmonogramu i stan workflowu `active`.

### Key Discoveries:

- Akcja `gautamkrishnar/keepalive-workflow` jest niedostępna (repozytorium wyłączone przez GitHub Staff), a `liskin/gh-workflow-keepalive` to jeden `gh api -X PUT …/enable` — piszemy ten krok sami, bez zależności zewnętrznej (`research.md`, Summary).
- Dummy commit jest niewykonalny: `main` wymaga PR bez obejścia (`AGENTS.md`, „Protected `main`”).
- Skuteczność `enable` na włączonym workflowie potwierdzają tylko anegdoty (za: community #184653, 2026-10-15; przeciw: `efrecon/gh-action-keepalive`), stąd niezależne ostrzeżenie D.
- Tokeny kolorów `warning` / `warning-foreground` już istnieją (`src/styles/global.css:27-28`, `108-109`) — używane przez werdykty sprawdzenia leku.

## What We're NOT Doing

- Bez zewnętrznego crona (Cloudflare) i bez tokenu GitHub poza GitHubem (opcja C odrzucona).
- Bez dummy commitów i bez zewnętrznej akcji keepalive.
- Bez ostrzeżenia na innych ekranach niż `/szukaj` i `/apteczka` (np. przy wyniku sprawdzenia, w `KitList.tsx`, `MedicineCheckResult.tsx`, `Layout.astro`, banerze) — te pliki zmieniają równolegle S-08 i S-15.
- Bez zmian importu, parsera, migracji i bazy.
- Bez ręcznego uruchamiania workflowu na GitHubie po merge'u (decyzja autora: czekamy na przebieg z harmonogramu).
- Bez naprawy opóźnień startu przebiegów z harmonogramu (7–9 h) — bez znaczenia dla celu 7 dni.

## Implementation Approach

Fazy 1 i 2 mają rozłączne pliki i nie zależą od siebie — można je wykonać równolegle (bramki i commity po kolei). Faza 3 (dokumentacja) idzie po nich, bo opisuje ostateczne nazwy jobu i komunikatu.

## Critical Implementation Details

- **Uprawnienia**: `actions: write` tylko na poziomie jobu `keepalive`; workflow-level zostaje `contents: read`, a job `import` (z sekretem produkcyjnym) nie dostaje nic więcej. Job `keepalive` ma ten sam guard `github.ref == 'refs/heads/main'` i nie używa sekretów.
- **Granica 7 dni**: „starsze niż 7 dni” = różnica dni kalendarzowych `today − snapshotDate > 7`, gdzie `today` to dzień w strefie `Europe/Warsaw` (jak `todayIso("Europe/Warsaw")` na `/apteczka`). Przykład: stan 2026-11-10, dziś 2026-11-17 → 7 dni, bez ostrzeżenia; dziś 2026-11-18 → 8 dni, ostrzeżenie. Data z przyszłości lub nieparsowalna → bez ostrzeżenia (wynik `false`, nie wyjątek). Liczyć na datach UTC zbudowanych z części napisu (`Date.UTC`), nie na `new Date(iso)` w strefie lokalnej.
- **Strona renderuje się na serwerze** (Cloudflare Workers): `today` liczony w `.astro` w czasie żądania; bez wyspy React.

## Phase 1: Job keepalive w workflowie importu

### Overview

Dodać do `registry-import.yml` drugi job, który przy każdym przebiegu z `main` zapobiegawczo włącza ten workflow przez API, zanim GitHub go wyłączy.

### Changes Required:

#### 1. Workflow importu

**File**: `.github/workflows/registry-import.yml`

**Intent**: Nowy job `keepalive` obok `import` (bez `needs`, więc działa także, gdy import się nie uda), który woła endpoint „Enable a workflow” dla tego pliku workflowu; komentarz w YAML wyjaśnia, po co (reguła 60 dni, dlaczego nie commit, dlaczego nie zewnętrzna akcja).

**Contract**:

- `jobs.keepalive`: `if: github.ref == 'refs/heads/main'`, `runs-on: ubuntu-latest`, `timeout-minutes` krótki (np. 5), `permissions: actions: write`, brak checkoutu i sekretów.
- Krok: `gh api -X PUT "repos/${{ github.repository }}/actions/workflows/registry-import.yml/enable"` z `GH_TOKEN: ${{ github.token }}`; błąd API kończy job na czerwono (wtedy przychodzi mail o nieudanym przebiegu — to pożądany sygnał).
- Workflow-level `permissions: contents: read` bez zmian; job `import` bez zmian.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid: it parses with the `yaml` package already in `node_modules` (`node -e` one-liner) and the parsed object has jobs `import` and `keepalive`, with `actions: write` only on `keepalive`
- Lint passes: `npm run lint`

#### Manual Verification:

- After merge, the next scheduled run of "Registry import" shows a green `keepalive` job and `gh api repos/michalg84/mamlek/actions/workflows/registry-import.yml --jq .state` returns `active`

**Implementation Note**: Weryfikacja ręczna jest możliwa dopiero po merge'u (harmonogram działa tylko z `main`); faza 1 jest gotowa do PR po zielonych bramkach automatycznych.

---

## Phase 2: Ostrzeżenie o nieaktualnym rejestrze na /szukaj i /apteczka

### Overview

Czysta funkcja wieku danych z testami, mały komponent `.astro` z linią daty stanu (zwykłą lub ostrzegawczą) i użycie go na obu stronach.

### Changes Required:

#### 1. Funkcja wieku danych

**File**: `src/lib/registry-date.ts`

**Intent**: Dodać funkcję, która mówi, czy data stanu rejestru jest starsza niż próg dni względem podanego „dziś”; obie daty jako napisy ISO `YYYY-MM-DD`, bez zależności od strefy czasowej środowiska.

**Contract**: `export const REGISTRY_MAX_AGE_DAYS = 7;` oraz `export function isRegistryStale(snapshotDate: string, today: string, maxAgeDays = REGISTRY_MAX_AGE_DAYS): boolean` — `true` tylko gdy obie daty parsują się regexem `ISO_DATE` i `today − snapshotDate > maxAgeDays` dni kalendarzowych.

#### 2. Testy jednostkowe

**File**: `src/lib/registry-date.test.ts` (nowy, projekt `unit`)

**Intent**: Granica po obu stronach (7 dni → `false`, 8 dni → `true`), przejście przez koniec miesiąca i roku, rok przestępny (29 lutego), ta sama data, data z przyszłości → `false`, nieparsowalne wejście → `false`; plus istniejące zachowanie `formatRegistryDate` (np. `2026-11-08` → `8.11.2026`), jeśli jeszcze nie ma testu. Oczekiwane wartości policzone ręcznie, nie przez funkcję.

#### 3. Komponent linii daty stanu

**File**: `src/components/RegistryStateDate.astro` (nowy)

**Intent**: Jedno miejsce na linię „Stan rejestru na …”, wspólne dla obu stron; przy danych przeterminowanych wyróżnienie rolami `warning`, ikona `TriangleAlert` (lub `CircleAlert`) z `lucide-react` z `aria-hidden`, tekst z dopiskiem „— dane mogą być nieaktualne”.

**Contract**: props `{ snapshotDate: string; today: string; class?: string }`; świeży stan renderuje dokładnie dotychczasowy znacznik z `szukaj.astro` (`text-muted-foreground mt-4 text-xs` — margines przez prop `class`/`cn()`), stan przeterminowany np. `bg-warning text-warning-foreground rounded-md px-3 py-2 text-xs font-medium` z flexem i ikoną (jak ostrzeżenia w `apteczka.astro`). Tylko klasy ról, `cn()` do łączenia.

#### 4. Użycie na stronach

**File**: `src/pages/szukaj.astro`

**Intent**: Zastąpić obecny `<p>` z datą komponentem, z `today = todayIso("Europe/Warsaw")`.

**File**: `src/pages/apteczka.astro`

**Intent**: Pod sekcją „W apteczce”, gdy `list` istnieje, dodać komponent z tą samą wartością `today` co dla `KitList` (jedna zmienna, liczona raz). Zmiana minimalna i lokalna (warunek koordynatora — S-08 zmienia sąsiednie pliki).

#### 5. Strażnik UI

**File**: `scripts/ui-scan.mjs`

**Intent**: Dopisać `src/components/RegistryStateDate.astro` do `GUARDED` (jedna linia; S-15 też edytuje tę tablicę).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run --project unit --project component --project registry`
- Lint passes: `npm run lint`
- Type check passes: `npx astro sync && npx astro check`
- UI scan is clean: `npm run ui:scan`
- Build passes: `npm run build`

#### Manual Verification:

- `/szukaj` with a fresh registry shows the grey line „Stan rejestru na …” unchanged; `/apteczka` shows the same line under the kit list
- With the local `registry_search_list.snapshot_date` set more than 7 days back (local DB, coordinator's go, reverted afterwards) both pages show the highlighted warning „… — dane mogą być nieaktualne”, readable at 390 px and 1280 px

**Implementation Note**: Po zielonych bramkach zatrzymaj się na teście ręcznym; użytkownik decyduje, czy test robi sam, czy agent (lekcja z `lessons.md`). Lokalna baza tylko za zgodą koordynatora.

---

## Phase 3: Dokumentacja

### Overview

Zaktualizować miejsca, które opisują ryzyko 60 dni jako przyjęte, i opisać keepalive oraz ostrzeżenie.

### Changes Required:

#### 1. README i AGENTS

**File**: `README.md` (sekcja CI, akapit o `registry-import.yml`, linia 93)

**Intent**: Zamienić „a keepalive is planned as roadmap slice S-16” na opis jobu `keepalive` (enable przez API przy każdym przebiegu, `actions: write` tylko w tym jobie) i ostrzeżenia na `/szukaj` i `/apteczka` po 7 dniach; ręczne „Enable workflow” zostaje jako ścieżka awaryjna.

**File**: `AGENTS.md` (punkt `npm run registry:import` w „Command tripwires”)

**Intent**: Dopisać krótko: workflow ma job `keepalive` (nie usuwać, nie dawać jobowi `import` `actions: write`), a sygnał świeżości to data stanu na `/szukaj` i `/apteczka`, wyróżniona po 7 dniach. Nowe zdanie, bez przepisywania punktu.

#### 2. Dokumenty fundamentów i wdrożenia

**Files**: `context/foundation/prd.md:205-208`, `context/foundation/infrastructure.md:73`, `context/foundation/test-plan.md:263`, `context/deployment/deploy-plan.md:74`

**Intent**: Po polsku, z datą 2026-11-18: zabezpieczenie wdrożone (S-16) — keepalive w workflowie i ostrzeżenie po 7 dniach; ryzyko szczątkowe: GitHub nie dokumentuje, że `enable` zeruje licznik. PRD: aplikacja porównuje teraz datę stanu z dzisiejszą (zmienia zdanie „Aplikacja nie porównuje tej daty z dzisiejszą”).

### Success Criteria:

#### Automated Verification:

- Formatting passes: `npx prettier --check README.md AGENTS.md context/foundation/prd.md context/foundation/infrastructure.md context/foundation/test-plan.md context/deployment/deploy-plan.md`

#### Manual Verification:

- Author reads the changed paragraphs and confirms they match the decisions (A + D, 7 days, both pages)

---

## Testing Strategy

### Unit Tests:

- `isRegistryStale`: granica 7/8 dni, przejścia miesiąca/roku, 29 lutego, ta sama data, przyszłość, złe wejście.

### Integration Tests:

- Brak testów workflowu — GitHub Actions nie da się uruchomić lokalnie; weryfikacja na pierwszym przebiegu po merge'u.

### Manual Testing Steps:

1. Lokalny serwer (port 4333), zalogowany użytkownik: `http://localhost:4333/szukaj` i `http://localhost:4333/apteczka` — szara linia daty.
2. Za zgodą koordynatora: `update registry_search_list set snapshot_date = current_date - 10` w lokalnej bazie, odświeżyć obie strony — ostrzeżenie; przywrócić poprzednią wartość.
3. Po merge'u: najbliższy przebieg „Registry import” z harmonogramu — job `keepalive` zielony, stan workflowu `active`.

## References

- Research: `context/changes/registry-import-keepalive/research.md`
- Roadmap: `context/foundation/roadmap.md` (S-16)
- Prior decision S-07: `context/archive/2026-10-07-daily-registry-refresh/plan.md`
- Audit F7: `context/audits/prd-conformance/2026-11-16.md:138-149`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Job keepalive w workflowie importu

#### Automated

- [x] 1.1 Workflow YAML is valid — 586a855
- [x] 1.2 Lint passes — 586a855

#### Manual

- [ ] 1.3 After merge, the next scheduled run shows a green keepalive job and the workflow state is active

### Phase 2: Ostrzeżenie o nieaktualnym rejestrze na /szukaj i /apteczka

#### Automated

- [x] 2.1 Unit tests pass
- [x] 2.2 Lint passes
- [x] 2.3 Type check passes
- [x] 2.4 UI scan is clean
- [x] 2.5 Build passes

#### Manual

- [x] 2.6 /szukaj and /apteczka show the grey state line with a fresh registry
- [x] 2.7 Both pages show the highlighted warning when the snapshot is older than 7 days

### Phase 3: Dokumentacja

#### Automated

- [ ] 3.1 Formatting passes

#### Manual

- [ ] 3.2 Author confirms the changed paragraphs match the decisions
