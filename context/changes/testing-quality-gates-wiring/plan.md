# Faza 4 wdrażania testów — podpięcie bramek jakości: plan implementacji

## Overview

Zestawy testów z Faz 1–3 stają się bramkami, które naprawdę blokują: unit + component lokalnie (hook Stop, pre-commit, `/ci-check`) i w CI (job `ci`, od którego zależy deploy); testy apteczki (`test:db`, `test:api`, job `smoke`) — przez wymagany status check. Agent dostaje lint edytowanego pliku zaraz po edycji. Żeby „wymagana” znaczyło blokadę, a nie dyscyplinę, repo staje się publiczne i dostaje ruleset na `main` z wymaganymi checkami `ci` i `smoke`. Na koniec PR z celowo zepsutymi testami dowodzi całego łańcucha (czerwony check → zablokowany merge), co wymaga `change.md`.

## Current State Analysis

- **Unit + component nie uruchamia żadna bramka**: brak kroku w jobie `ci` (`.github/workflows/ci.yml:18-26`), w `lint-staged` (`package.json`, tylko ESLint, `ui-scan`, Prettier), w hooku Stop (`.claude/hooks/end-of-turn.mjs:6` — świadomie odłożone do tej fazy) i w `/ci-check` (`.claude/skills/ci-check/SKILL.md:6-11`).
- **`test:db` i `test:api` już dają czerwony check `smoke`** (`ci.yml:55`, `ci.yml:69`; job tylko na PR, `ci.yml:31`), ale nic nie blokuje merge'a.
- **Repo jest prywatne na darmowym planie**: API branch protection i rulesets zwraca 403 (research, Summary pkt 3). Skill `ship` oferuje „Zmerguj teraz” bez czekania na CI (`.claude/skills/ship/SKILL.md:143`).
- **Hook po edycji to tylko Prettier** (`.claude/hooks/format.mjs:49-58`); błąd kończy się kodem 1, którego agent nie widzi (`format.mjs:3`).
- **Deploy zależy tylko od `ci`** (`ci.yml:74-75`), więc krok Vitest w `ci` zablokuje też wdrożenie.
- **Pomiary z planowania (2026-10-20, ciepły cache)**: `npx vitest run --project unit --project component` — 116 testów, ok. 3,2 s (23 s z researchu to zimny start); `vitest related` dla jednego pliku z `src/lib` — ok. 3 s; ESLint jednego pliku (lint z typami) — 5–8 s.
- **Historia commitów**: 133 ze 163 commitów ma autora z prywatnym gmailem; decyzja autora — od teraz noreply, historia bez przepisywania.

## Desired End State

- PR z czerwonym testem unit/component albo `test:db`/`test:api` ma czerwony check i GitHub odmawia merge'a (ruleset na `main`, bez obejść); push wprost na `main` jest odrzucany.
- Push na `main` z czerwonym testem unit/component nie wdraża się (job `ci` czerwony → `deploy` pominięty).
- Agent: po edycji pliku `.ts/.tsx/.js/.mjs/.cjs/.astro` dostaje błędy ESLint tego pliku od razu (kod 2 + stderr); na końcu tury hook Stop uruchamia też cały zestaw unit + component i odsyła agenta raz przy czerwonym teście.
- `git commit` zmian w `.ts/.tsx/.astro` odrzuca commit, gdy powiązany test unit/component jest czerwony.
- `/ci-check` odzwierciedla job `ci` razem z krokiem Vitest.
- §5 test-planu: unit + component i kit integration `required (wired)`, post-edit hook `recommended (wired)`, z zapisanym znaczeniem „required” (ruleset).

Weryfikacja: Phase 5 (PR-dowód) plus `npm test` (projekt `hooks` z nowymi przypadkami).

### Key Discoveries:

- Hooki Claude Code z tym samym matcherem działają równolegle — lint po edycji musi być w tym samym skrypcie co Prettier, po nim, inaczej ESLint czyta plik przed formatowaniem.
- `vitest related` bez `--passWithNoTests` kończy się błędem, gdy dla plików w stage nie ma testów (np. sam plik `.astro` albo skrypt) — commit byłby odrzucany bez powodu.
- Vitest 5 sam włącza reporter `github-actions` przy `GITHUB_ACTIONS=true` — błędy pojawią się jako adnotacje w PR bez konfiguracji (research).
- Job `smoke` działa tylko na `pull_request`; wymagany check `smoke` w rulesecie jest więc spełniany w PR, a push na `main` i tak blokuje reguła „wymagany PR”.
- Wzorzec dowodu hooków: `tests/hooks/agent-hooks.test.ts` — zaślepki narzędzi w `STUBS` z markerami błędów (`LINT_ERROR`, `TYPE_ERROR`, `UI_HIT`), prawdziwe skrypty i git w tymczasowym repo; kontrola, że każde polecenie z `settings.json` działa i ma limit ≤ 120 (sekundy).
- `infrastructure.md:73`: w publicznym repo GitHub wyłącza zaplanowane workflowy po 60 dniach bez aktywności — dotyczy dziennego importu rejestru.

## What We're NOT Doing

- Przepisywanie historii (`git filter-repo`) — gmail zostaje w starych commitach (decyzja autora 2026-10-20).
- GitHub Pro.
- Testy po edycji (`vitest related` w hooku PostToolUse) — agent widzi testy na końcu tury; decyzja autora.
- Hook git pre-push.
- Projekt Vitest `hooks` w CI — zostaje lokalny (`test-plan.md:80`).
- Zmiana gałęzi `smoke` tak, żeby blokowała deploy po pushu (dziś pomijana przy pushu; z rulesetem kod trafia na `main` tylko po zielonym `smoke` w PR).
- Lista obejść (bypass) w rulesecie — w awarii CI autor wyłącza ruleset na chwilę w ustawieniach repo.
- Zabezpieczenie przed wyłączeniem harmonogramu importu po 60 dniach (keepalive) — ryzyko zapisane jako przyjęte (Phase 5, §7 test-planu).
- Nowe testy produktu (lekcja 2) i zmiany definicji bramek w §5 poza statusami (lekcja 1).
- Licencja repo.

## Implementation Approach

Najpierw bramki, które nie zależą od GitHub (Phase 1–2: CI, pre-commit, `/ci-check`, hooki agenta — z dowodem w `agent-hooks.test.ts`). Potem przygotowanie do upublicznienia w tym samym PR, jeszcze w repo prywatnym (Phase 3: skan sekretów, e-mail, plik rulesetu, `ship`, dokumenty). Zmianę widoczności robi autor (krok nieodwracalny — publiczną treść można sklonować); agent zakłada ruleset z wersjonowanego pliku (Phase 4). Na końcu dowód na żywym PR i zamknięcie statusów w test-planie osobnym PR, który już przechodzi przez ruleset (Phase 5).

Fazy idą po kolei: Phase 1 i 2 zmieniają ten sam plik (`tests/hooks/agent-hooks.test.ts`), Phase 3–5 zależą od wyniku poprzednich.

## Critical Implementation Details

- **Kolejność w `post-edit.mjs`**: Prettier `--write`, dopiero potem ESLint `--quiet` (bez `--fix` — kolejny Edit agenta trafiłby na „file modified since read”). Błąd składni Prettiera (kod ≠ 0 przy istniejącym Prettierze) i błąd ESLint → stderr + kod 2; brak narzędzia w `node_modules` → kod 1 (problem środowiska, widzi go użytkownik). Wyjście Prettiera trzeba przechwycić (dziś `stdio: inherit`), żeby trafiło na stderr.
- **Limit czasu**: ESLint z typami na zimno może przekroczyć 30 s; w `settings.json` limit PostToolUse rośnie do 60 s, a skrypt ma własny budżet ok. 50 s i przy przekroczeniu wypisuje komunikat zamiast zostać zabitym po cichu (wzorzec `BUDGET_MS` z `end-of-turn.mjs:17-20`).
- **Kolejność Phase 3 → 4**: PR z Phase 1–3 merguje się, zanim repo stanie się publiczne — skan sekretów i e-mail muszą być rozstrzygnięte przed zmianą widoczności, a ruleset da się założyć dopiero po niej. Znalezisko `gitleaks` w historii, które jest prawdziwym sekretem, oznacza rotację tego sekretu przed upublicznieniem (historii nie przepisujemy).

## Phase 1: Unit + component w CI i lokalnie

### Overview

Zestaw unit + component działa w jobie `ci`, w `/ci-check`, w pre-commicie (testy powiązane z plikami w stage) i w hooku Stop (cały zestaw), z dowodem hooka w `agent-hooks.test.ts`.

### Changes Required:

#### 1. Job `ci`

**File**: `.github/workflows/ci.yml`

**Intent**: Dodać krok Vitest do joba `ci`, żeby czerwony test dawał czerwony check w PR i blokował deploy po pushu na `main`.

**Contract**: Nowy krok `npx vitest run --project unit --project component` po `npx astro check`, przed `npm run build`; bez `continue-on-error`.

#### 2. `/ci-check`

**File**: `.claude/skills/ci-check/SKILL.md`

**Intent**: Skill „mirrors the CI `ci` job”, więc dostaje ten sam krok w tym samym miejscu.

**Contract**: Nowy krok między `npx astro check` a `npm run build`; opis we frontmatter wymienia testy unit + component.

#### 3. Pre-commit

**File**: `package.json` (blok `lint-staged`)

**Intent**: Commit zmian źródłowych odrzucony, gdy powiązany test unit/component jest czerwony — łapie też edycje bez agenta.

**Contract**: Dla `*.ts` i `*.{astro,tsx}` dodatkowe polecenie `vitest related --run --passWithNoTests --project unit --project component` (po ESLint i `ui-scan`). lint-staged dokleja ścieżki plików w stage na końcu polecenia.

#### 4. Hook Stop

**File**: `.claude/hooks/end-of-turn.mjs`

**Intent**: Po lincie, `ui:scan` i `astro check` uruchomić cały zestaw unit + component (ok. 3 s), gdy tura zmieniła kod źródłowy lub konfigurację testów; czerwony test → wpis w raporcie, kod 2.

**Contract**: Warunek uruchomienia: zmieniony plik z `LINTED` albo pasujący do `TYPE_INPUTS`, albo `vitest.config.ts` / `tests/setup-component.ts` / `tests/fixtures/**` / `tests/helpers/**`. Uruchomienie przez istniejącą funkcję `run()` z wejściem `node_modules/vitest/vitest.mjs` i argumentami `run --project unit --project component` (brak Vitest = błąd, jak przy innych narzędziach). Komentarz nagłówka (`:1-6`) mówi, że testy są częścią bramki. Komunikat w raporcie zaczyna się od `Unit/component tests fail`.

#### 5. Dowód hooka Stop

**File**: `tests/hooks/agent-hooks.test.ts`

**Intent**: Udowodnić, że czerwony test odsyła agenta, a tura bez zmian w kodzie testów nie uruchamia.

**Contract**: Nowa zaślepka `node_modules/vitest/vitest.mjs` w `STUBS` (loguje wywołanie do `STUB_LOG`, kończy się kodem 1 z linią w stylu `FAIL src/x.test.ts`, gdy któryś plik w `src/` zawiera marker `TEST_FAIL`). Nowe przypadki w `describe("end-of-turn.mjs (Stop)")`: (a) zmieniony `src/*.ts` z `TEST_FAIL` → kod 2, stderr zawiera „Unit/component tests fail” i nazwę testu; (b) zielona zmiana w `src/` → kod 0, log zawiera wywołanie `vitest run --project unit --project component`; (c) zmiana tylko w `README.md` → vitest nie wywołany; (d) brak `vitest.mjs` → kod 2 z „not found … run npm install”. Istniejące przypadki, które liczą wywołania narzędzi, uzupełnić o vitest tam, gdzie zmieniają `src/`.

#### 6. Opis w dokumentach

**File**: `AGENTS.md`, `README.md`

**Intent**: Usunąć „not run in CI yet”, opisać nowe miejsca uruchamiania testów.

**Contract**: `AGENTS.md` linia `npm test` — „CI runs the `unit` and `component` projects in the `ci` job; the `hooks` project stays local”; opis hooka Stop wymienia testy; linia podsumowania „Automated tests:” bez „not run in CI”. `README.md` — job `ci` w sekcji CI wymienia krok Vitest; zdanie o husky/lint-staged wymienia `vitest related`.

### Success Criteria:

#### Automated Verification:

- Cały zestaw lokalnie zielony: `npm test` (unit, component, hooks — z nowymi przypadkami Stop)
- Lint czysty: `npm run lint`
- Typy czyste: `npx astro check`
- Celowo zepsuty test unit (np. odwrócona asercja w `src/lib/registry-search.test.ts`, zaraz cofnięta) daje exit ≠ 0 z `npx vitest run --project unit --project component`
- Commit z celowo zepsutym testem w stage zostaje odrzucony przez pre-commit (zmiana cofnięta, commit nie powstaje)
- Commit samego pliku `.astro` bez powiązanych testów przechodzi przez pre-commit (`--passWithNoTests`)

#### Manual Verification:

- Na żywej sesji Claude Code: agent zmienia kod tak, że test jest czerwony, i na końcu tury dostaje komunikat „Unit/component tests fail”, poprawia i kończy turę (jedna ponowna próba)

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie testu ręcznego (lub zlecenie go agentowi) przed Phase 2.

---

## Phase 2: Lint po edycji

### Overview

`format.mjs` staje się `post-edit.mjs`: Prettier, potem ESLint `--quiet` edytowanego pliku; błąd dociera do agenta kodem 2 i stderr.

### Changes Required:

#### 1. Skrypt hooka

**File**: `.claude/hooks/format.mjs` → `.claude/hooks/post-edit.mjs` (`git mv`)

**Intent**: Po formatowaniu sprawdzić edytowany plik ESLintem i odesłać agentowi błędy od razu; zgłaszać też agentowi błąd składni z Prettiera.

**Contract**: Zachowane: odczyt `tool_input.file_path` / `tool_response.filePath`, pomijanie innych repo i nieobsługiwanych typów, rejestracja checkoutu w `$TMPDIR/claude-hooks/<sid>.roots`. Nowe: wyjście Prettiera przechwycone; Prettier ≠ 0 → stderr `Prettier could not format <file>:` + wyjście, kod 2. Dla rozszerzeń z zestawu lintowanego (jak `LINTED` w `end-of-turn.mjs`) `node_modules/eslint/bin/eslint.js --quiet -- <file>`; ≠ 0 → stderr `ESLint errors in <file> — fix them:` + wyjście, kod 2. Brak Prettiera lub ESLinta → kod 1 z komunikatem „not found … run npm install”. Budżet czasu ok. 50 s z komunikatem przy przekroczeniu. Komentarz nagłówka opisuje nowe zachowanie i kanał sygnału.

#### 2. Konfiguracja

**File**: `.claude/settings.json`

**Intent**: Wskazać nowy skrypt i dać limit czasu na ESLint z typami.

**Contract**: PostToolUse `Write|Edit` → `post-edit.mjs` (ten sam wzorzec ścieżki przez `git rev-parse --show-toplevel`), `timeout: 60`, `statusMessage` „Formatting and linting the edited file...”.

#### 3. Dowód

**File**: `tests/hooks/agent-hooks.test.ts`

**Intent**: Udowodnić sygnał do agenta przy błędzie lintu i błędzie Prettiera, przy zachowaniu dotychczasowych przypadków.

**Contract**: `runHook` przyjmuje `"post-edit.mjs"`; `describe` przemianowany na `post-edit.mjs (PostToolUse Write|Edit)`. Zaślepka Prettiera kończy się kodem 2 z komunikatem `SyntaxError`, gdy plik zawiera marker `SYNTAX_ERROR`. Nowe przypadki: (a) plik z `LINT_ERROR` → kod 2, stderr zawiera nazwę pliku i regułę; log pokazuje Prettier przed ESLint; (b) plik z `SYNTAX_ERROR` → kod 2, stderr „Prettier could not format”; (c) `.md` / `.json` → tylko Prettier, bez ESLint; (d) brak ESLinta → kod 1 „not found”. Przypadek „fails visibly when Prettier is not installed” zostaje (kod 1).

#### 4. Odwołania

**File**: `AGENTS.md`, `tests/hooks/agent-hooks.test.ts` (komentarz nagłówka), `.claude/hooks/end-of-turn.mjs` (komentarz o rejestrze checkoutów)

**Intent**: Zastąpić nazwę `format.mjs` nową i opisać lint po edycji.

**Contract**: W `AGENTS.md` opis hooków: „PostToolUse: `post-edit.mjs`, Prettier then ESLint on the edited file, exit 2 sends the errors to the agent”. Po zmianie `grep -rn "format.mjs" .claude AGENTS.md README.md tests` nie znajduje nic poza historią w `context/`.

### Success Criteria:

#### Automated Verification:

- `npm test` zielony (z nowymi przypadkami `post-edit.mjs` i kontrolą poleceń z `settings.json`, w tym limitu ≤ 120 s)
- Lint czysty: `npm run lint`
- Prawdziwy skrypt na przykładowym payloadzie: plik z celowym błędem ESLint w `src/` → kod 2 i błąd na stderr; ten sam plik po cofnięciu → kod 0 (plik przywrócony `git checkout --`)
- `grep -rn "format.mjs" .claude AGENTS.md README.md tests` — brak trafień

#### Manual Verification:

- Na żywej sesji Claude Code: agent robi edycję z nieużywaną zmienną i od razu, przed końcem tury, dostaje błąd ESLint i go poprawia

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie testu ręcznego przed Phase 3.

---

## Phase 3: Przygotowanie do upublicznienia

### Overview

Wszystko, co musi być rozstrzygnięte przed zmianą widoczności: e-mail w nowych commitach, skan historii pod sekrety, wersjonowana definicja rulesetu, `ship` bez merge'a z pominięciem CI, opisy. Kończy się PR z Phase 1–3 zmergowanym przy zielonym `ci` i `smoke` (repo jeszcze prywatne).

### Changes Required:

#### 1. E-mail autora

**File**: konfiguracja repo (`git config` lokalnie, nie plik w repo)

**Intent**: Nowe commity bez prywatnego adresu.

**Contract**: `git config user.email 36934071+michalg84@users.noreply.github.com` (repo-local, przed pierwszym commitem tej zmiany). Kontrola: `git log -1 --format=%ae` na commicie tej zmiany zwraca adres noreply.

#### 2. Skan historii pod sekrety

**File**: `context/changes/testing-quality-gates-wiring/secrets-scan.md` (nowy), opcjonalnie `.gitleaksignore`

**Intent**: Upewnić się, że historia, która stanie się publiczna, nie zawiera sekretów.

**Contract**: `gitleaks` przez Docker na całej historii (`docker run --rm -v <repo>:/repo zricethezav/gitleaks:<przypięta wersja> git /repo --redact`; wersję obrazu sprawdzić w dniu skanu). Raport: wersja narzędzia, data, liczba commitów, każde trafienie z rozstrzygnięciem — fałszywy alarm (np. publiczny demo-klucz lokalnego Supabase; odcisk do `.gitleaksignore` z uzasadnieniem) albo prawdziwy sekret → rotacja u dostawcy przed Phase 4 i wpis „zrotowano <data>”. Faza nie kończy się z nierozstrzygniętym trafieniem. Dodatkowo przegląd ręczny drzewa `HEAD` pod dane osobowe (e-maile, telefony): `git grep -nE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}"` z rozstrzygnięciem w tym samym raporcie.

#### 3. Definicja rulesetu

**File**: `.github/rulesets/main.json` (nowy)

**Intent**: Wersjonowana, odtwarzalna definicja tego, co znaczy „wymagana bramka”; zakładana w Phase 4 przez `gh api`.

**Contract**: Body dla `POST /repos/{owner}/{repo}/rulesets` (zweryfikować pola z dokumentacją GitHub REST w dniu wdrożenia):

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "ci" }, { "context": "smoke" }]
      }
    }
  ]
}
```

Nazwy `ci` i `smoke` to nazwy jobów z `ci.yml` — zmiana nazwy joba wymaga zmiany rulesetu (zapisać w komentarzu przy jobach w `ci.yml`).

#### 4. Skill `ship`

**File**: `.claude/skills/ship/SKILL.md`

**Intent**: Agent nie proponuje merge'a z pominięciem CI; ruleset i tak by go odrzucił.

**Contract**: Sekcja „6. Ask how to merge”: zostają dwie opcje — „Poczekaj na CI i zmerguj” (pierwsza, zalecana) i „Zmerguję sam”; usunięte „Zmerguj teraz” i jego polecenie. Notka: `main` ma ruleset (`.github/rulesets/main.json`) — merge wymaga zielonych `ci` i `smoke`; odrzucony merge to sygnał, nie błąd do obejścia. Zdanie „If the PR has no checks at all, say so and merge” zastąpione: brak checków = coś jest nie tak z workflow, nie merguj, zgłoś.

#### 5. Dokumenty

**File**: `AGENTS.md`, `README.md`, `context/foundation/infrastructure.md`

**Intent**: Zapisać, co znaczy „wymagana bramka” i jakie skutki ma publiczne repo, zanim ono nastąpi.

**Contract**: `AGENTS.md` — nowy krótki punkt w „Command tripwires” albo „Key conventions”: `main` is protected by the ruleset in `.github/rulesets/main.json` (PR required, checks `ci` and `smoke` required, no bypass); never push to `main` directly; renaming a CI job requires updating the ruleset. `README.md` — sekcja CI: oba joby to wymagane checki; zdanie o harmonogramie importu: w publicznym repo GitHub wyłącza go po 60 dniach bez commitów, sygnał to data stanu na `/szukaj`, ponowne włączenie: Actions → Registry import → Enable workflow. `infrastructure.md:73` — dopisek z datą wdrożenia, że repo jest publiczne (Phase 4) i ryzyko przyjęte.

### Success Criteria:

#### Automated Verification:

- `secrets-scan.md` istnieje, ma wynik skanu i rozstrzygnięcie każdego trafienia (zero nierozstrzygniętych)
- `.github/rulesets/main.json` to poprawny JSON: `node -e "JSON.parse(require('fs').readFileSync('.github/rulesets/main.json','utf8'))"`
- `git log -1 --format=%ae` na commicie tej zmiany = adres noreply
- Lint i typy czyste: `npm run lint`, `npx astro check`
- PR z Phase 1–3 ma zielone checki `ci` i `smoke` (`gh pr checks`) — w tym nowy krok Vitest widoczny w logu joba `ci`

#### Manual Verification:

- Autor przegląda `secrets-scan.md` i akceptuje rozstrzygnięcia (w szczególności każdą rotację)
- Autor merguje PR z Phase 1–3 (repo jeszcze prywatne)

**Implementation Note**: Zatrzymaj się po merge'u — Phase 4 zaczyna się od decyzji autora o zmianie widoczności.

---

## Phase 4: Upublicznienie i ruleset

### Overview

Autor zmienia widoczność repo; agent zakłada ruleset z pliku i włącza darmowe dla publicznych repo skanowanie sekretów. Sprawdza, że ruleset jest aktywny.

### Changes Required:

#### 1. Zmiana widoczności (autor)

**File**: — (ustawienia GitHub)

**Intent**: Odblokować rulesety na darmowym planie. Krok nieodwracalny w skutkach — agent go nie wykonuje bez wyraźnego zlecenia.

**Contract**: Settings → General → Danger Zone → Change visibility → Public (albo na wyraźne zlecenie: `gh repo edit michalg84/mamlek --visibility public --accept-visibility-change-consequences`). Opcjonalnie (autor): GitHub → Settings → Emails → „Block command line pushes that expose my email”.

#### 2. Ruleset i skanowanie sekretów (agent)

**File**: `.github/rulesets/main.json` (tylko odczyt)

**Intent**: Założyć ruleset z wersjonowanej definicji i włączyć ochronę przed wypchnięciem sekretu.

**Contract**: `gh api -X POST repos/michalg84/mamlek/rulesets --input .github/rulesets/main.json`; przy ponownym uruchomieniu (ruleset już istnieje) — `PUT repos/michalg84/mamlek/rulesets/<id>`. `gh api -X PATCH repos/michalg84/mamlek -f "security_and_analysis[secret_scanning][status]=enabled" -f "security_and_analysis[secret_scanning_push_protection][status]=enabled"` (zweryfikować nazwy pól z dokumentacją w dniu wdrożenia).

### Success Criteria:

#### Automated Verification:

- `gh repo view --json visibility` → `PUBLIC`
- `gh api repos/michalg84/mamlek/rulesets` zwraca ruleset `main` z `enforcement: active`
- `gh api repos/michalg84/mamlek/rules/branches/main` zawiera reguły `pull_request`, `required_status_checks` (z `ci` i `smoke`), `non_fast_forward`, `deletion`
- Push pustego commita wprost na `main` (`git push origin HEAD:main` z jednorazowej gałęzi lokalnej) zostaje odrzucony przez GitHub z komunikatem o rulesecie; gałąź lokalna usunięta po próbie

#### Manual Verification:

- Autor potwierdza, że repo jest publiczne i widzi ruleset w Settings → Rules → Rulesets

**Implementation Note**: Próbę pushu na `main` wykonać tylko za zgodą autora (push jest w `ask`).

---

## Phase 5: Dowód blokady i zamknięcie bramek

### Overview

PR z celowo zepsutymi testami pokazuje czerwone `ci` i `smoke` oraz zablokowany merge; potem PR zamknięty. Statusy bramek i notatki Fazy 4 w test-planie trafiają na `main` osobnym PR, który przechodzi przez ruleset.

### Changes Required:

#### 1. PR-dowód (gałąź jednorazowa)

**File**: `src/lib/registry-search.test.ts`, `tests/db/kit-access.test.ts` (tylko na gałęzi `proof/red-gates`, nigdy na `main`)

**Intent**: Dowieść całego łańcucha: test → krok CI → status check → blokada rulesetu, dla obu bramek.

**Contract**: Na gałęzi `proof/red-gates` jedna odwrócona asercja w teście unit i jedna w `test:db`; commit z `--no-verify` (pre-commit odrzuciłby zepsuty test unit — to osobny dowód Phase 1). PR (nie draft) z tytułem „DO NOT MERGE — dowód bramek Fazy 4”. Po zakończeniu CI zapisać: `gh pr checks` (czerwone `ci` i `smoke`, nazwa testu w logu każdego), `gh pr view --json mergeStateStatus` → `BLOCKED`, próba `gh pr merge --merge` odrzucona. Potem `gh pr close --delete-branch`.

#### 2. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Zamknąć Fazę 4 w test-planie zgodnie z tym, co faktycznie zostało wdrożone i udowodnione.

**Contract**: §5 — `unit + component` i `kit access and input integration` → `required (wired)`; `post-edit hook` → `recommended (wired)`; pod tabelą jedno zdanie: „required” = check wymagany przez ruleset na `main` (`.github/rulesets/main.json`), od <data>. §3 — status Fazy 4 aktualizuje orkiestrator (`/10x-test-plan`) po archiwizacji; tu bez zmiany poza tym, co robi `/10x-plan` i `/10x-implement`. §6.6 — wpis „Faza 4 — Quality-gates wiring” (dostarczone, numer PR-dowodu i wynik, pomiary czasu, decyzje autora: publiczne repo bez przepisywania historii, testy bez hooka po edycji, pre-commit z `related`). §7 — wpis „Harmonogram odświeżania rejestru” zaktualizowany: repo publiczne od <data>, ryzyko wyłączenia po 60 dniach przyjęte, sygnał = data stanu na `/szukaj`. „Ostatnia aktualizacja” i §8 z datą.

#### 3. PR z test-planem

**File**: —

**Intent**: Pierwsza zmiana, która przechodzi przez ruleset w zwykły sposób.

**Contract**: PR przez `ship` (opcja „Poczekaj na CI i zmerguj”); merge po zielonych `ci` i `smoke`.

### Success Criteria:

#### Automated Verification:

- PR-dowód: `gh pr checks` pokazuje `ci` = fail i `smoke` = fail; log `ci` zawiera nazwę zepsutego testu unit, log `smoke` nazwę zepsutego testu `test:db`
- PR-dowód: `gh pr view --json mergeStateStatus` = `BLOCKED`, `gh pr merge --merge` kończy się błędem
- PR-dowód zamknięty, gałąź usunięta (`gh pr view <nr> --json state` = `CLOSED`)
- PR z test-planem: zielone `ci` i `smoke`, zmergowany
- `git grep -n "required after §3 Phase 4" context/foundation/test-plan.md` — brak trafień

#### Manual Verification:

- Autor widzi na stronie PR-dowodu czerwone checki i wyszarzony przycisk merge z komunikatem o wymaganych checkach

**Implementation Note**: PR-dowód zamyka się zawsze, także gdy któryś check wyjdzie zielony — wtedy to defekt bramki do naprawy przed zamknięciem fazy, nie powód do merge'a.

---

## Testing Strategy

### Unit Tests:

- Dowód hooków w `tests/hooks/agent-hooks.test.ts` (projekt `hooks`, lokalnie): Stop z testami (czerwony, zielony, brak zmian w kodzie, brak Vitest), `post-edit.mjs` (błąd ESLint, błąd składni Prettiera, pliki bez lintu, brak ESLinta), polecenia z `settings.json` z limitem ≤ 120 s.

### Integration Tests:

- Łańcuch w GitHub: PR-dowód (Phase 5) — czerwone checki i zablokowany merge; odrzucony push na `main` (Phase 4).
- Pre-commit: commit z zepsutym testem odrzucony, commit `.astro` bez testów przechodzi (Phase 1).

### Manual Testing Steps:

1. Sesja Claude Code: edycja z nieużywaną zmienną → błąd ESLint od razu po edycji (Phase 2).
2. Sesja Claude Code: zmiana łamiąca test → komunikat „Unit/component tests fail” na końcu tury, jedna ponowna próba (Phase 1).
3. Strona PR-dowodu: czerwone checki, zablokowany przycisk merge (Phase 5).

## Performance Considerations

- Hook po edycji: Prettier + ESLint z typami 5–8 s na edycję (na zimno więcej; limit 60 s, budżet skryptu ok. 50 s).
- Hook Stop: dochodzi ok. 3 s (ciepły cache; zimny start do ok. 23 s) w budżecie 100 s.
- Pre-commit: ok. 3 s, tylko gdy w stage są pliki `.ts/.tsx/.astro`.
- CI: krok Vitest w `ci` przy każdym PR i pushu na `main`; publiczne repo nie ma limitu minut Actions na runnerach standardowych.

## Migration Notes

- Rollback rulesetu: `gh api -X DELETE repos/michalg84/mamlek/rulesets/<id>` albo wyłączenie w Settings → Rules (tymczasowo w awarii CI).
- Zmiana widoczności z powrotem na prywatną jest możliwa, ale nie cofa tego, co zostało w tym czasie sklonowane lub zarchiwizowane; rulesety przestają wtedy działać (darmowy plan).
- Lokalne klony bez zmian (historia nieprzepisywana).

## References

- Research: `context/changes/testing-quality-gates-wiring/research.md`
- Test plan: `context/foundation/test-plan.md` §3 (Faza 4, uwagi), §5 (Quality Gates), §7
- Wzorzec hooka Stop: `.claude/hooks/end-of-turn.mjs:17-20` (budżet), `:61-75` (`run()`), `:106-109` (kod 2)
- Wzorzec dowodu hooków: `tests/hooks/agent-hooks.test.ts:14-45` (zaślepki), `:91-115` (sandbox), `:391-420` (polecenia z `settings.json`)
- Zasady hooków: `.claude/skills/10x-configure-hook/SKILL.md`, `references/anthropic.md:52-62`, `:90`
- Ryzyko harmonogramu w publicznym repo: `context/foundation/infrastructure.md:73`
- Poprzednia faza: `context/archive/2026-10-17-testing-kit-access-and-input-boundaries/plan.md:64`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unit + component w CI i lokalnie

#### Automated

- [x] 1.1 Cały zestaw lokalnie zielony: `npm test` (unit, component, hooks — z nowymi przypadkami Stop) — 10f3033
- [x] 1.2 Lint czysty: `npm run lint` — 10f3033
- [x] 1.3 Typy czyste: `npx astro check` — 10f3033
- [x] 1.4 Celowo zepsuty test unit daje exit ≠ 0 z `npx vitest run --project unit --project component` — 10f3033
- [x] 1.5 Commit z celowo zepsutym testem w stage zostaje odrzucony przez pre-commit — 10f3033
- [x] 1.6 Commit samego pliku `.astro` bez powiązanych testów przechodzi przez pre-commit — 10f3033

#### Manual

- [x] 1.7 Agent na żywej sesji dostaje „Unit/component tests fail” na końcu tury i poprawia test — 10f3033

### Phase 2: Lint po edycji

#### Automated

- [x] 2.1 `npm test` zielony (przypadki `post-edit.mjs` i kontrola poleceń z `settings.json`) — 5633ef8
- [x] 2.2 Lint czysty: `npm run lint` — 5633ef8
- [x] 2.3 Prawdziwy skrypt na przykładowym payloadzie: błąd ESLint → kod 2, po cofnięciu → kod 0 — 5633ef8
- [x] 2.4 `grep -rn "format.mjs" .claude AGENTS.md README.md tests` — brak trafień — 5633ef8

#### Manual

- [x] 2.5 Agent na żywej sesji dostaje błąd ESLint zaraz po edycji i go poprawia — 5633ef8

### Phase 3: Przygotowanie do upublicznienia

#### Automated

- [x] 3.1 `secrets-scan.md` z wynikiem skanu i rozstrzygnięciem każdego trafienia — 8759a60
- [x] 3.2 `.github/rulesets/main.json` to poprawny JSON — 8759a60
- [x] 3.3 `git log -1 --format=%ae` na commicie tej zmiany = adres noreply — 8759a60
- [x] 3.4 Lint i typy czyste: `npm run lint`, `npx astro check` — 8759a60
- [x] 3.5 PR z Phase 1–3 ma zielone checki `ci` i `smoke`, krok Vitest widoczny w logu `ci` — 347f0d2

#### Manual

- [x] 3.6 Autor akceptuje rozstrzygnięcia w `secrets-scan.md` — 347f0d2
- [x] 3.7 Autor merguje PR z Phase 1–3 (repo jeszcze prywatne) — 347f0d2

### Phase 4: Upublicznienie i ruleset

#### Automated

- [x] 4.1 `gh repo view --json visibility` → `PUBLIC`
- [x] 4.2 `gh api repos/michalg84/mamlek/rulesets` zwraca ruleset `main` z `enforcement: active`
- [x] 4.3 `rules/branches/main` zawiera `pull_request`, `required_status_checks` (`ci`, `smoke`), `non_fast_forward`, `deletion`
- [x] 4.4 Push pustego commita wprost na `main` odrzucony przez ruleset

#### Manual

- [x] 4.5 Autor potwierdza publiczne repo i ruleset w ustawieniach

### Phase 5: Dowód blokady i zamknięcie bramek

#### Automated

- [x] 5.1 PR-dowód: `ci` i `smoke` czerwone, w logach nazwy zepsutych testów
- [x] 5.2 PR-dowód: `mergeStateStatus` = `BLOCKED`, `gh pr merge` odrzucony
- [x] 5.3 PR-dowód zamknięty, gałąź usunięta
- [ ] 5.4 PR z test-planem: zielone `ci` i `smoke`, zmergowany
- [x] 5.5 Brak „required after §3 Phase 4” w test-planie

#### Manual

- [x] 5.6 Autor widzi czerwone checki i zablokowany merge na stronie PR-dowodu
