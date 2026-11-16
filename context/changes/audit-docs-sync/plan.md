# Audit docs sync Implementation Plan

## Overview

Przenosimy do dokumentów decyzje z audytu zgodności z PRD (`context/audits/prd-conformance/2026-11-16.md`): PRD dostaje wersję v3 z faktycznymi regułami aplikacji, roadmapa dostaje nowe wycinki i odświeżone pytania, a README, test-plan, deploy-plan i infrastructure.md przestają opisywać stan sprzed miesiąca. Zmieniamy tylko dokumentację, kodu nie ruszamy.

## Current State Analysis

- `context/foundation/prd.md` (version 2, status draft) nie opisuje wielu reguł, które kod egzekwuje:
  - minimum 3 znaki, limit 20 podpowiedzi, warianty (nazwa + moc + postać) zamiast produktów;
  - import w stronach po 30, limity 200 wierszy i 256 kB, częściowy import;
  - data ważności do miesiąca, ilość 0–100000, edycja zmienia tylko opakowanie.
- PRD w Business Logic opisuje „tę samą substancję” prościej niż reguła w `medicine_check` (zbiór substancji LUB nazwa powszechna) (F6).
- NFR „dane nie starsze niż 7 dni” nie mówi, kto i jak to pilnuje (F7).
- PRD nie rozstrzyga metody logowania (Open Question 2) ani rejestracji i resetu hasła (F8).
- `context/foundation/roadmap.md` (version 1, `prd_version: 2`):
  - brak S-02 w Done;
  - nieaktualne Unknowns w S-01, S-05, S-07 i S-09;
  - pytania 5, 7, 8/10, 11 i 12 nie odpowiadają stanowi kodu;
  - brak wycinków z decyzji F4, F9, F15 i keepalive;
  - wpis Parked „Pozycje spoza rejestru” bez argumentów;
  - Streams G i Backlog Handoff opisują stan sprzed zamknięcia S-05.
- `README.md`:
  - linia 14 mówi, że importu CSV nie ma, i nie wspomina edycji ani usuwania;
  - w tabeli skryptów brakuje `perf`, `ui:scan`, `ui:shots`, `search:check`;
  - opis CI i lint-staged pomija `ui:scan`.
- `context/foundation/test-plan.md`:
  - §2 „S-03 (w toku)”;
  - notka pod §3 o projektach CI bez `registry`;
  - §4 pomija Playwright E2E (`tests/e2e/`, `context/foundation/test-stack.md`);
  - §7 „Import CSV — jeszcze nie zbudowany”, „Logowanie” z odwołaniem do OQ2, harmonogram importu.
- `context/deployment/deploy-plan.md` opisuje `/dashboard`, deploy „po przejściu `ci` i `smoke`” i „świadomie pominięty import rejestru”.
- `context/foundation/infrastructure.md:73` nazywa ryzyko wyłączenia harmonogramu „przyjętym”, bez odesłania do keepalive.
- `context/changes/bootstrap-verification/` ma tylko `verification.md`, bez `change.md`.

## Desired End State

Każde ustalenie audytu ze statusem DOC, FIX, ACCEPTED lub DEFERRED, które dotyczy dokumentów, ma swój ślad w dokumencie docelowym:

- PRD v3 opisuje reguły, które kod faktycznie egzekwuje.
- Roadmapa ma nowe wycinki z ID S-13…S-16, zaktualizowane pytania i Parked oraz `prd_version: 3`.
- Dokumenty operacyjne nie zawierają już zdań, które audyt wskazał jako nieaktualne.

Weryfikacja: Prettier, `roadmap:sync --dry-run` i grep nieaktualnych fraz przechodzą; autor czyta diff każdej fazy.

### Key Discoveries:

- Wszystkie decyzje i ich miejsca w kodzie są w raporcie audytu, w polach `Decyzja` przy F4, F6, F7, F8, F9, F10, F12, F13 i F15.
- `roadmap.md` nie ma pozycji z Change ID `audit-docs-sync`, więc `/10x-plan` i `/10x-implement` nie zmieniają statusów w roadmapie.
- Nowe wycinki dostają kolejne wolne ID:
  - S-13: wycofane leki (F15), M-1, przed S-06;
  - S-14: btrim klucza wariantu (F4), M-1, nie równolegle z S-06;
  - S-15: ekrany logowania przez `/10x-ui` (F9), równolegle z czymkolwiek;
  - S-16: keepalive harmonogramu (F7), poza M-1, po zamknięciu M-1.
- Playwright E2E jest opisany tylko w `context/foundation/test-stack.md`; test-plan wystarczy do niego odesłać.
- `npx prettier --check` działa dziś na wszystkich edytowanych plikach `.md`, a hook po edycji formatuje je Prettierem.

## What We're NOT Doing

- Żadnych zmian w kodzie, migracjach, testach ani workflowach. F1/F2/F3 idą do `import-match-safety`, F5/F11 do `audit-code-cleanup`, a nowe wycinki są tylko wpisami w roadmapie.
- Nie wyłączamy rejestracji w projekcie Supabase. To robi autor w panelu (F8).
- Nie uruchamiamy `npm run roadmap:sync` bez `--dry-run` przed merge. Prawdziwa synchronizacja idzie po merge.
- Nie piszemy na nowo AGENTS.md. Jeśli jakaś linia jest nieaktualna, odnotowujemy ją jako follow-up, chyba że to jedno zdanie.
- Nie zmieniamy `context/foundation/archive/` ani zarchiwizowanych zmian. Wyjątek: przeniesienie `bootstrap-verification`.

## Implementation Approach

Trzy fazy, każda w osobnym commicie, żeby diff PRD i roadmapy czytało się osobno. PRD idzie pierwszy, bo roadmapa odwołuje się do jego v3 (`prd_version: 3`). Teksty decyzji bierzemy z pól `Decyzja` raportu audytu, nie piszemy ich od zera. Przy każdej regule z kodu podajemy wartość potwierdzoną w kodzie lub w raporcie.

## Phase 1: PRD v3

### Overview

PRD opisuje to, co aplikacja faktycznie robi, i zamyka pytanie o logowanie.

### Changes Required:

#### 1. Frontmatter i status

**File**: `context/foundation/prd.md`

**Intent**: oznaczyć wersję 3 z datą 2026-11-16 i krótką notką, co zmieniła (audyt zgodności).

**Contract**: frontmatter `version: 3`, `updated: 2026-11-16`; status draft → v3.

#### 2. Wymagania funkcjonalne i nieopisane reguły (F12)

**File**: `context/foundation/prd.md`

**Intent**: dopisać do FR reguły, które kod egzekwuje, żeby PRD przestał być ogólniejszy od aplikacji.

**Contract**:

- FR-001: tylko produkty dla ludzi, bez usuniętych opakowań.
- Wyszukiwanie: od 3 znaków, do 20 podpowiedzi, podpowiedzi to warianty (nazwa + moc + postać).
- Import CSV: strony po 30 pozycji, limity 200 wierszy i 256 kB, możliwy import częściowy.
- Data ważności z dokładnością do miesiąca, dozwolona ilość 0, limit ilości 100000.
- Edycja zmienia tylko opakowanie, nie lek.

#### 3. Business Logic: „ta sama substancja” (F6)

**File**: `context/foundation/prd.md`

**Intent**: opisać faktyczną regułę razem z uzasadnieniem z pomiaru.

**Contract**: sekcja Business Logic:

- „Ten sam lek” = klucz wariantu (nazwa + moc + postać), także z importu równoległego i z wycofanym opakowaniem.
- „Ta sama substancja” = ten sam zbiór substancji LUB ta sama nazwa powszechna.
- Uzasadnienie: RPL zapisuje tę samą substancję różnie (naproxenum / naproxenum natricum, fluorouracilum / 5-fluorouracilum, Pradaxa bez substancji).
- Ogólniki nigdy nie pasują.
- Zbiory szukanego leku bierzemy z reprezentanta wariantu.

#### 4. NFR świeżości (F7)

**File**: `context/foundation/prd.md`

**Intent**: doprecyzować, jak pilnujemy „≤ 7 dni”.

**Contract**:

- Cel pilnuje data stanu rejestru na `/szukaj` (RPL „stan rejestru”).
- Nieudany przebieg importu zgłasza GitHub mailem.
- Wyłączenie harmonogramu po 60 dniach jest znanym ryzykiem z osobnym wycinkiem poza MVP.

#### 5. Access Control, Non-Goals, Open Questions (F8 i pozycje spoza rejestru)

**File**: `context/foundation/prd.md`

**Intent**: zamknąć pytanie o metodę logowania i rozwinąć temat pozycji spoza rejestru.

**Contract**:

- Access Control:
  - logowanie e-mail + hasło;
  - rejestracja wyłączana w produkcyjnym projekcie Supabase po założeniu konta domu (ustawienie, nie kod; lokalny Supabase zostaje otwarty dla `smoke` i `test:api`).
- Non-Goals:
  - reset hasła (obejście przez panel Supabase);
  - wpis „Pozycje spoza rejestru (dawne FR-004)” z argumentami za, przeciw, kierunkami i oznaczeniem „do przemyślenia po MVP”.
- Open Question 2 oznaczone jako rozstrzygnięte.

### Success Criteria:

#### Automated Verification:

- Prettier akceptuje plik: `npx prettier --check context/foundation/prd.md`
- Frontmatter ma wersję 3: `grep -n "^version: 3" context/foundation/prd.md`

#### Manual Verification:

- Autor czyta diff PRD i potwierdza, że reguły i decyzje F6/F7/F8 są opisane zgodnie z jego intencją.

**Implementation Note**: po automatycznej weryfikacji zatrzymujemy się na potwierdzenie autora, zanim przejdziemy do fazy 2.

---

## Phase 2: Roadmapa

### Overview

Roadmapa pokazuje nowe wycinki z audytu, prawdziwy stan zamkniętych wycinków i aktualne pytania.

### Changes Required:

#### 1. Nowe wycinki (F15, F4, F9, F7)

**File**: `context/foundation/roadmap.md`

**Intent**: dodać cztery wycinki do tabeli „At a glance”, do sekcji wycinków i do Streams, z zależnościami z raportu.

**Contract**:

- **S-13 `withdrawn-medicine-in-kit`** (M-1, przed S-06):
  - wycofane warianty w podpowiedziach, z oznaczeniem i niżej w kolejności;
  - dodanie, import i sprawdzenie dozwolone;
  - poluzowanie reguł w `kit.ts` i polityki `kit_items` migracją.
- **S-14 `variant-key-btrim`** (M-1, nie równolegle z S-06):
  - cztery miejsca: `medicine_check.sql:165-167`, `registry_search_list_version.sql:49`, `kit_items.sql:112-114`, `kit-import.ts:113-115`.
- **S-15 `auth-screens-ui`** (przez `/10x-ui`, równolegle z czymkolwiek):
  - polskie teksty i błędy Supabase po polsku;
  - tokeny zamiast `bg-cosmic` i klas palety;
  - tytuł strony i link w `Banner.astro`;
  - pliki dopisane do `GUARDED`.
- **S-16 `registry-import-keepalive`** (poza M-1, po M-1): zastępuje pytanie 12.
- Wszystkie cztery: status `proposed`, Change ID w nawiasach.

#### 2. Done, Outcomes i Unknowns (F12, F6, F10)

**File**: `context/foundation/roadmap.md`

**Intent**: zsynchronizować opisy z tym, co już zbudowano i zmierzono.

**Contract**:

- S-02 w Done (archiwum `context/archive/2026-10-07-add-medicine-to-kit/`).
- S-03 Outcome: ilość i data tylko po stronie apteczki.
- S-07 Outcome: data to RPL „stan rejestru”, widoczna tylko na `/szukaj`.
- Usunięte nieaktualne Unknowns w S-01, S-05, S-07 i S-09.
- Nowe Unknown w S-06: przegląd próbki 351 nazw powszechnych z rozłącznymi zbiorami substancji (9 236 par).
- Nowe Unknown w S-08: puste opakowanie (ilość 0) nadal daje zielone „Masz ten lek”.

#### 3. Pytania, Parked, Streams, Handoff, frontmatter

**File**: `context/foundation/roadmap.md`

**Intent**: zamknąć lub zaktualizować pytania i Parked według decyzji.

**Contract**:

- Pytania:
  - 2 rozstrzygnięte (PRD v3);
  - 5 rozstrzygane przez S-13, z opisem dzisiejszego zachowania;
  - 7 z czterema miejscami i uwagą o prawdopodobnym skutku „ta sama substancja”;
  - 8 i 10 z liczbą 351 zamiast 309 (pomiar 2026-11-16);
  - 11: ekranu ulotki nie ma (`leaflet_url` nieużywane w `src/`);
  - 12 → S-16.
- Parked:
  - pomiar ekranu importu z otwartym polem wyszukiwania przed zmianą współdzielenia workera (F13);
  - wpis o twardym limicie uzupełniony o regułę „to samo opakowanie w wariancie” (tylko API) i o możliwą ilość ponad rozmiar opakowania przy równoległym PATCH;
  - „Pozycje spoza rejestru” z argumentami za i przeciw, z kierunkami.
- Streams G bez „S-12 najlepiej przed S-05”.
- Backlog Handoff bez „Ready=yes” przy zamkniętych pozycjach.
- Frontmatter: `prd_version: 3`, `updated: 2026-11-16`.

### Success Criteria:

#### Automated Verification:

- Prettier akceptuje plik: `npx prettier --check context/foundation/roadmap.md`
- Sync rozpoznaje nowe pozycje bez błędu: `npm run roadmap:sync -- --dry-run`
- Frontmatter wskazuje PRD v3: `grep -n "prd_version: 3" context/foundation/roadmap.md`

#### Manual Verification:

- Autor czyta diff roadmapy i potwierdza kolejność i zależności nowych wycinków.

**Implementation Note**: po automatycznej weryfikacji zatrzymujemy się na potwierdzenie autora, zanim przejdziemy do fazy 3.

---

## Phase 3: Dokumenty operacyjne

### Overview

README, test-plan, deploy-plan i infrastructure.md opisują dzisiejszy stan; `bootstrap-verification` trafia do archiwum.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: usunąć nieaktualny status i uzupełnić skrypty oraz CI.

**Contract**:

- Status: import CSV, edycja i usuwanie są zbudowane.
- Tabela skryptów z `perf`, `ui:scan`, `ui:shots`, `search:check`.
- Opis lint-staged i CI z `ui:scan`.

#### 2. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: zaktualizować sekcje wskazane w audycie.

**Contract**:

- §2: S-03 zamknięty.
- Notka pod §3: CI uruchamia też projekt `registry`.
- §4 Stack: Playwright E2E (`tests/e2e/`, poza CI) z odesłaniem do `context/foundation/test-stack.md`.
- §7:
  - Import CSV zbudowany (S-04);
  - Logowanie odsyła do PRD v3 (e-mail + hasło, rejestracja wyłączona na produkcji);
  - harmonogram odsyła do S-16.
- Data aktualizacji.

#### 3. Deploy plan i infrastruktura

**File**: `context/deployment/deploy-plan.md`, `context/foundation/infrastructure.md`

**Intent**: zgodność z README i z decyzją F7.

**Contract**:

- deploy-plan:
  - bez `/dashboard`;
  - deploy po `ci` na `main` (smoke na PR);
  - import rejestru istnieje (`registry-import.yml`).
- infrastructure.md:73 dopisuje odesłanie do S-16 i do NFR w PRD v3.

#### 4. bootstrap-verification

**File**: `context/changes/bootstrap-verification/` → `context/archive/2026-09-24-bootstrap-verification/`

**Intent**: folder bez `change.md` łamie strukturę `context/changes/`.

**Contract**:

- `git mv` do archiwum.
- Nowy `change.md` ze statusem `archived` i `archived_at: 2026-11-16`.
- Notka, że to log bootstrapu z 2026-09-24.

### Success Criteria:

#### Automated Verification:

- Prettier akceptuje pliki: `npx prettier --check README.md context/foundation/test-plan.md context/deployment/deploy-plan.md context/foundation/infrastructure.md`
- Nieaktualne frazy zniknęły: `grep -nE "not built yet|jeszcze nie zbudowany|S-03 \(w toku\)|/dashboard" README.md context/foundation/test-plan.md context/deployment/deploy-plan.md` nic nie zwraca
- `context/changes/` zawiera tylko foldery z `change.md`: `ls context/changes/*/change.md`

#### Manual Verification:

- Autor czyta diff dokumentów operacyjnych.

---

## Testing Strategy

### Manual Testing Steps:

1. Przeczytać diff PRD (faza 1) pod kątem zgodności z decyzjami F6, F7, F8.
2. Przeczytać diff roadmapy (faza 2) pod kątem nowych wycinków i zależności.
3. Po merge uruchomić `npm run roadmap:sync` i sprawdzić, że na tablicy „MamLek Roadmap” pojawiły się S-13…S-16.

## References

- Raport audytu: `context/audits/prd-conformance/2026-11-16.md`
- Notatka o kolejności po audycie: pamięć `parallel-slices-worktrees`
- Archiwum S-02: `context/archive/2026-10-07-add-medicine-to-kit/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD v3

#### Automated

- [x] 1.1 Prettier akceptuje plik: `npx prettier --check context/foundation/prd.md` — 2d3debd
- [x] 1.2 Frontmatter ma wersję 3: `grep -n "^version: 3" context/foundation/prd.md` — 2d3debd

#### Manual

- [ ] 1.3 Autor czyta diff PRD i potwierdza, że reguły i decyzje F6/F7/F8 są opisane zgodnie z jego intencją.

### Phase 2: Roadmapa

#### Automated

- [x] 2.1 Prettier akceptuje plik: `npx prettier --check context/foundation/roadmap.md`
- [x] 2.2 Sync rozpoznaje nowe pozycje bez błędu: `npm run roadmap:sync -- --dry-run`
- [x] 2.3 Frontmatter wskazuje PRD v3: `grep -n "prd_version: 3" context/foundation/roadmap.md`

#### Manual

- [ ] 2.4 Autor czyta diff roadmapy i potwierdza kolejność i zależności nowych wycinków.

### Phase 3: Dokumenty operacyjne

#### Automated

- [ ] 3.1 Prettier akceptuje pliki: `npx prettier --check README.md context/foundation/test-plan.md context/deployment/deploy-plan.md context/foundation/infrastructure.md`
- [ ] 3.2 Nieaktualne frazy zniknęły (grep nic nie zwraca)
- [ ] 3.3 `context/changes/` zawiera tylko foldery z `change.md`

#### Manual

- [ ] 3.4 Autor czyta diff dokumentów operacyjnych.
