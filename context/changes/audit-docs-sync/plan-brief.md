# Audit docs sync — Plan Brief

> Full plan: `context/changes/audit-docs-sync/plan.md`

## What & Why

Audyt zgodności z 2026-11-16 pokazał, że dokumenty rozjechały się z aplikacją: PRD nie opisuje reguł egzekwowanych w kodzie, a roadmapa i README opisują stan sprzed miesiąca. Autor podjął decyzje w triage. Ta zmiana przenosi je do dokumentów, zanim ruszą zmiany w kodzie (`import-match-safety`, `audit-code-cleanup`) i równoległe wycinki S-06/S-11/S-12.

## Starting Point

- PRD v2 (draft) i roadmapa v1 (`prd_version: 2`).
- Raport `context/audits/prd-conformance/2026-11-16.md` z decyzjami przy każdym ustaleniu (0 PENDING).

## Desired End State

- PRD v3 opisuje faktyczne reguły:
  - wyszukiwanie, warianty i limity importu;
  - „ta sama substancja”;
  - świeżość rejestru;
  - logowanie e-mail + hasło.
- Roadmapa:
  - ma cztery nowe wycinki (S-13…S-16);
  - S-02 jest w Done;
  - ma aktualne Unknowns, pytania i Parked.
- README, test-plan, deploy-plan i infrastructure.md nie zawierają nieaktualnych zdań.

## Key Decisions Made

| Decision                         | Choice                                                                    | Why (1 sentence)                                                              | Source |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Reguła „ta sama substancja” (F6) | PRD opisuje regułę z kodu (zbiór substancji LUB nazwa powszechna)         | RPL zapisuje tę samą substancję różnie; pomiar 351 nazw potwierdził przykłady | Audyt  |
| Świeżość rejestru (F7)           | Cel pilnowany datą stanu na `/szukaj`; keepalive jako wycinek poza MVP    | Przebiegi 13–15.11 udane; ryzyko 60 dni dotyczy publicznego repo              | Audyt  |
| Logowanie (F8)                   | E-mail + hasło, rejestracja wyłączona na produkcji, reset hasła Non-Goal  | Aplikacja dla jednego domu; wyłączenie to ustawienie Supabase, nie kod        | Audyt  |
| Wycofane leki (F15)              | Nowy wycinek S-13 w M-1 przed S-06                                        | Lek kupiony przed wycofaniem ma dać się dodać i utrzymać                      | Audyt  |
| btrim klucza (F4)                | Nowy wycinek S-14, nie równolegle z S-06                                  | Oba zmieniają `medicine_check`                                                | Audyt  |
| Ekrany logowania (F9)            | Nowy wycinek S-15 przez `/10x-ui`                                         | Angielskie teksty i klasy spoza tokenów; nie koliduje z innymi wycinkami      | Audyt  |
| Pozycje spoza rejestru           | Wpis Parked i Non-Goal z argumentami za i przeciw, do przemyślenia po MVP | Autor chce wrócić do suplementów, ale to łamie zasadę „nigdy nie zgadujemy”   | Audyt  |
| bootstrap-verification           | Przeniesienie do archiwum z `change.md` (archived)                        | Folder bez `change.md` łamie strukturę `context/changes/`                     | Plan   |
| Podział na fazy                  | 3 fazy, 3 commity (PRD, roadmapa, dokumenty operacyjne)                   | Diff PRD i roadmapy czyta się osobno                                          | Plan   |

## Scope

**In scope:**

- `context/foundation/prd.md`
- `context/foundation/roadmap.md`
- `README.md`
- `context/foundation/test-plan.md`
- `context/deployment/deploy-plan.md`
- `context/foundation/infrastructure.md`
- przeniesienie `context/changes/bootstrap-verification/`

**Out of scope:**

- kod, migracje, testy i workflowy (F1/F2/F3 → `import-match-safety`, F5/F11 → `audit-code-cleanup`);
- wyłączenie rejestracji w Supabase (robi autor);
- prawdziwy `roadmap:sync` przed merge.

## Architecture / Approach

Teksty decyzji pochodzą z pól `Decyzja` raportu audytu; wartości reguł są potwierdzone w kodzie (`file:line` w raporcie). Kolejność: PRD (v3) → roadmapa (odwołuje się do `prd_version: 3`) → dokumenty operacyjne (odwołują się do PRD i do S-16).

## Phases at a Glance

| Phase                   | What it delivers                                         | Key risk                                          |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| 1. PRD v3               | Faktyczne reguły, F6, F7, F8, pozycje spoza rejestru     | Opis reguły zbyt techniczny dla PRD               |
| 2. Roadmapa             | S-13…S-16, S-02 w Done, Unknowns, pytania, Parked        | Kolizja ID lub zależności z S-06 opisane niejasno |
| 3. Dokumenty operacyjne | README, test-plan, deploy-plan, infrastructure, archiwum | Pominięte nieaktualne zdanie spoza listy audytu   |

**Prerequisites:** gałąź `docs/audit-docs-sync`; `gh` z zakresem `project` do `roadmap:sync -- --dry-run`.
**Estimated effort:** jedna sesja, 3 fazy.

## Open Risks & Assumptions

- ID S-13…S-16 są wolne w roadmapie; sprawdzamy to przed zapisem.
- Skutek F4 („Nie masz” vs „ta sama substancja”) potwierdzi dopiero S-14; pytanie 7 zapisuje to jako przypuszczenie.

## Success Criteria (Summary)

- Autor czyta PRD v3 i widzi w nim aplikację, którą ma, a nie tę z września.
- Po merge i `roadmap:sync` tablica „MamLek Roadmap” pokazuje S-13…S-16 z poprawnymi zależnościami.
- `grep` nie znajduje zdań, które audyt wskazał jako nieaktualne.
