# Keepalive dziennego importu rejestru (S-16) — Plan Brief

> Full plan: `context/changes/registry-import-keepalive/plan.md`
> Research: `context/changes/registry-import-keepalive/research.md`

## What & Why

GitHub wyłącza harmonogram workflowu w publicznym repozytorium po 60 dniach bez aktywności, więc dzienny import rejestru może po cichu stanąć, a dane na `/szukaj` i w sprawdzeniu leku przestaną być świeże (NFR: nie starsze niż 7 dni). Plan dodaje zabezpieczenie (keepalive) i niezależny sygnał w aplikacji na wypadek, gdyby zabezpieczenie nie zadziałało.

## Starting Point

`registry-import.yml` ma jeden job `import` z harmonogramem `17 4 * * *`; repo jest publiczne, a `main` chroniony (bez commitów botów). Na `/szukaj` jest szara linia „Stan rejestru na …”, bez porównania z dzisiejszą datą; `/apteczka` daty nie pokazuje.

## Desired End State

Każdy przebieg importu z `main` ma job `keepalive`, który przez API GitHuba włącza ten workflow, zanim GitHub zdąży go wyłączyć. Gdy mimo to dane mają więcej niż 7 dni, `/szukaj` i `/apteczka` pokazują wyróżnione „Stan rejestru na D.MM.RRRR — dane mogą być nieaktualne”.

## Key Decisions Made

| Decision               | Choice                                                                  | Why (1 sentence)                                                                                     | Source   |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Opcja                  | A (keepalive przez API) + D (ostrzeżenie po 7 dniach)                   | A jest tanie i bez sekretów, ale niepotwierdzone przez GitHuba, więc D daje niezależny sygnał        | Plan     |
| Mechanizm keepalive    | Własny krok `gh api -X PUT …/enable`, bez zewnętrznej akcji             | `keepalive-workflow` zablokowany przez GitHuba, liskin to ten sam jeden wywołanie; commit niemożliwy | Research |
| Uprawnienia            | Osobny job `keepalive` z `actions: write`, niezależny od wyniku importu | Job z sekretem produkcyjnym nie dostaje dodatkowych praw; keepalive działa też, gdy import padnie    | Plan     |
| Próg ostrzeżenia       | Starsze niż 7 dni (8. dzień), dzień w strefie Europe/Warsaw             | Próg wprost z NFR; RPL stempluje eksport datą pobrania, więc fałszywe alarmy są mało prawdopodobne   | Plan     |
| Miejsce ostrzeżenia    | `/szukaj` i `/apteczka`, ta sama linia daty stanu                       | Większa szansa, że autor zobaczy; bez plików S-08/S-15 (KitList, Layout, baner)                      | Plan     |
| Weryfikacja po merge'u | Najbliższy przebieg z harmonogramu, bez ręcznego uruchomienia           | Bez dodatkowego importu produkcyjnego                                                                | Plan     |
| Cron na Cloudflare     | Odrzucony                                                               | Token GitHub poza GitHubem i drugi system do utrzymania                                              | Plan     |

## Scope

**In scope:**

- job `keepalive` w `.github/workflows/registry-import.yml`;
- `isRegistryStale` w `src/lib/registry-date.ts` z testami;
- komponent `RegistryStateDate.astro` na `/szukaj` i `/apteczka`, wpis w `ui:scan`;
- README, AGENTS.md, PRD, infrastructure, test-plan, deploy-plan.

**Out of scope:**

- cron zewnętrzny, dummy commity, zewnętrzne akcje keepalive;
- ostrzeżenie przy wyniku sprawdzenia, w `KitList`, w `Layout`/banerze;
- zmiany importu, parsera, bazy; ręczne uruchomienie workflowu.

## Architecture / Approach

GitHub Actions: drugi job w tym samym workflowie, równoległy do `import`, z tokenem `GITHUB_TOKEN` o prawie `actions: write`. Aplikacja: strona `.astro` liczy na serwerze `today` (Europe/Warsaw), czysta funkcja porównuje go z `snapshotDate` z `registry_search_list`, komponent wybiera wygląd linii.

## Phases at a Glance

| Phase                                                  | What it delivers                                  | Key risk                                                             |
| ------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Job keepalive (równolegle z 2)                      | Enable workflowu przy każdym przebiegu z `main`   | GitHub może nie liczyć `enable` jako aktywności — wiemy po 60 dniach |
| 2. Ostrzeżenie na /szukaj i /apteczka (równolegle z 1) | Linia daty stanu, wyróżniona po 7 dniach          | Konflikt z S-08 w `apteczka.astro` i z S-15 w `ui-scan.mjs` (drobny) |
| 3. Dokumentacja                                        | Ryzyko opisane jako zabezpieczone, nie „przyjęte” | Konflikty w README/AGENTS z innymi wycinkami                         |

**Prerequisites:** S-07 (done); zgoda koordynatora na pliki wspólne (jest, 2026-11-18); lokalna baza tylko do testu ręcznego, za zgodą koordynatora.
**Estimated effort:** ~1 sesja, 3 małe fazy.

## Open Risks & Assumptions

- Skuteczność `enable` na włączonym workflowie potwierdzają tylko anegdoty; pełne potwierdzenie dopiero po > 60 dniach bez commitów. Ostrzeżenie D to siatka bezpieczeństwa.
- Ostrzeżenie widzi tylko ten, kto otworzy `/szukaj` lub `/apteczka`.
- Jeśli GitHub kiedyś uzna takie wywołania za obejście reguły, job zacznie się kończyć błędem — przyjdzie mail o nieudanym przebiegu.

## Success Criteria (Summary)

- Po merge'u przebieg z harmonogramu ma zielony job `keepalive`, a workflow ma stan `active`.
- Przy danych starszych niż 7 dni obie strony wyraźnie mówią, że rejestr może być nieaktualny; przy świeżych nic się nie zmienia.
