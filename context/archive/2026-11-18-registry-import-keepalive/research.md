---
date: 2026-11-18T11:19:17+01:00
researcher: Claude (Opus 5.5), worker S-16
git_commit: 48e3f760b9cc29113c6c61ff1925af22b4255dbe
branch: feat/registry-import-keepalive
repository: michalg84/mamlek
topic: "Jak zabezpieczyć dzienny import rejestru przed wyłączeniem harmonogramu przez GitHuba po 60 dniach bez aktywności"
tags: [research, github-actions, registry-import, keepalive, cloudflare]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (Opus 5.5), worker S-16
---

# Research: keepalive dziennego importu rejestru (S-16)

**Date**: 2026-11-18T11:19:17+01:00
**Researcher**: Claude (Opus 5.5), worker S-16
**Git Commit**: 48e3f760b9cc29113c6c61ff1925af22b4255dbe
**Branch**: feat/registry-import-keepalive
**Repository**: michalg84/mamlek

## Research Question

Którą opcję keepalive wybrać dla `.github/workflows/registry-import.yml` (roadmap S-16, `context/foundation/roadmap.md:319`): krok wołający API workflowu (np. `gautamkrishnar/keepalive-workflow` w trybie API — czy zeruje licznik), zewnętrzny cron na Cloudflare, czy tylko ostrzeżenie przy dacie stanu starszej niż 7 dni. Badanie zbiera fakty; wybór należy do autora.

## Summary

- Repozytorium jest publiczne (`gh repo view`: `visibility: PUBLIC`, ostatni push 2026-11-17), więc reguła GitHuba ma zastosowanie: „In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days” (docs.github.com, Disable and enable workflows). Dokumentacja nie mówi, co dokładnie liczy się jako aktywność, ani czy włączenie przez API zeruje licznik.
- **`gautamkrishnar/keepalive-workflow` odpada**: oryginalne repozytorium jest wyłączone przez GitHub Staff („Access to this repository has been disabled by GitHub Staff due to a violation of GitHub's terms of service”, stan na 2026-11-18), a indeks pakietów pokazuje wersję 2.0.10 jako usuniętą. Akcja `@v2` przestała być dostępna.
- **Tryb API w praktyce to jedno wywołanie** `PUT /repos/{owner}/{repo}/actions/workflows/{workflow}/enable` na już włączonym workflowie. Tak działa `liskin/gh-workflow-keepalive@v1` (cały `action.yml` to ten jeden `gh api -X PUT …/enable`, z `actions: write` na `GITHUB_TOKEN`), więc da się to zrobić bez zewnętrznej akcji, jednym krokiem `gh api` w naszym workflowie. Żadne źródło od GitHuba nie potwierdza, że to zeruje licznik 60 dni; twierdzą tak tylko autorzy narzędzi (`PhrozenByte/gh-workflow-immortality`: „so that the workflow's inactivity counter is reset”), bez dowodu. Potwierdzić to można tylko obserwacją po > 60 dniach bez commitów.
- **Dummy commit odpada**: `main` jest chroniony rulesetem (PR wymagany, bez obejścia — `AGENTS.md`, „Protected `main`”), więc bot nie wypchnie commita na `main`.
- **Zewnętrzny cron (Cloudflare) omija regułę całkowicie**, jeśli zastąpi `schedule:` wywołaniem `workflow_dispatch`: reguła dotyczy tylko workflowów z harmonogramem. Koszt: token GitHub (fine-grained PAT, `Actions: read and write` na tym repo) jako sekret w Cloudflare, rotacja tokenu, osobny mały Worker z `scheduled()` (aplikacja startuje z `@astrojs/cloudflare/entrypoints/server`, `wrangler.jsonc:4`, więc dołożenie handlera do niej wymaga własnego entrypointu) i nowa ścieżka wdrożenia.
- **Obserwacja przy okazji**: przebiegi z harmonogramu na `17 4 * * *` startują dziś między 11:27 a 13:24 UTC (8 ostatnich przebiegów, 2026-11-10…17, wszystkie `success`), czyli z opóźnieniem ok. 7–9 h. Import i tak się wykonuje codziennie; dla celu „nie starsze niż 7 dni” to bez znaczenia.
- **Ostrzeżenie o dacie > 7 dni** nie zapobiega wyłączeniu, tylko je pokazuje. Wcześniejsza decyzja S-07 brzmiała „data tylko informacyjna” (`context/archive/2026-10-07-daily-registry-refresh/plan.md`, „What We're NOT Doing”), a audyt 2026-11-16 (F7) wybrał opcję B: „ostrzeżenie przy dacie starszej niż 7 dni (i ewentualnie keepalive)” (`context/audits/prd-conformance/2026-11-16.md:144`). Można je łączyć z keepalive.

## Detailed Findings

### Obecny workflow importu

- `.github/workflows/registry-import.yml:7-9` — jedyny wyzwalacz harmonogramu: `cron: "17 4 * * *"`, plus `workflow_dispatch`.
- `.github/workflows/registry-import.yml:16-17` — `permissions: contents: read` na poziomie workflowu; keepalive przez API potrzebuje `actions: write` (najlepiej tylko w osobnym jobie).
- `.github/workflows/registry-import.yml:21` — job `import` ma `if: github.ref == 'refs/heads/main'` (sekret produkcyjny tylko z `main`).
- `.github/workflows/ci.yml` nie ma wyzwalacza `schedule` (grep `schedule` bez trafień), więc reguła 60 dni dotyczy w tym repo tylko workflowu importu (`gh api …/actions/workflows`: 2 workflowy, `CI` i `Registry import`, oba `active`).
- Uwaga: jeśli GitHub wyłączy workflow (stan `disabled_inactivity`), krok keepalive w tym samym workflowie też przestaje się wykonywać. Keepalive przez API musi więc działać zapobiegawczo, zanim minie 60 dni (liskin woła enable przy każdym przebiegu z harmonogramu; keepalive-workflow v2 domyślnie co 45 dni, `time_elapsed: 45`).

### Sygnał świeżości w aplikacji

- `src/pages/szukaj.astro:54-57` — „Stan rejestru na {formatRegistryDate(list.snapshotDate)}”, tylko w gałęzi „lista wczytana”; brak porównania z dzisiejszą datą.
- `src/lib/services/registry-search-list.ts:15` — `snapshotDate` pochodzi z `snapshot_date` wersji listy.
- `src/lib/registry-date.ts:4` — formatowanie przez podział napisu (bez `Date`), celowo bez strefy czasowej (decyzja S-07).
- `scripts/registry-import.mjs:217` — import odrzuca tylko eksport starszy niż ostatni (`snapshotDate < last_snapshot`); równa data importuje ponownie.
- Ostrzeżenie „> 7 dni” wymagałoby porównania z dzisiejszą datą po stronie serwera; dotknęłoby `szukaj.astro` (widok pilnowany przez `ui:scan`) — plik nie należy do S-08 ani S-15 według tablicy koordynacji, ale S-15 zmienia `Layout.astro`/`Banner.astro`, więc baner globalny trzeba by uzgodnić.

### Opcje keepalive — fakty

| Opcja                                                        | Zapobiega wyłączeniu?                                                                    | Co trzeba dodać                                                                                  | Ryzyka                                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Krok `gh api -X PUT …/enable` w `registry-import.yml`     | Prawdopodobnie (twierdzenie narzędzi, ~89 gwiazdek liskin), niepotwierdzone przez GitHub | Osobny job z `permissions: actions: write`, `if: github.event_name == 'schedule'`; zero sekretów | Jeśli GitHub nie liczy tego jako aktywności, nic nie wiemy aż do dnia 60; GitHub mógłby uznać to za obejście (precedens: wyłączone repo keepalive-workflow, powód nieznany) |
| A'. Akcja zewnętrzna (liskin `@v1` / keepalive-workflow)     | Jak A                                                                                    | `uses:` + przypięcie do SHA                                                                      | keepalive-workflow usunięty; liskin to ten sam jeden `gh api`, więc zależność bez zysku                                                                                     |
| B. Dummy commit                                              | Tak (commit to aktywność)                                                                | —                                                                                                | Niewykonalne: `main` wymaga PR, bez obejścia                                                                                                                                |
| C. Cron na Cloudflare → `workflow_dispatch`, bez `schedule:` | Tak, z definicji: workflow bez harmonogramu nie podlega regule                           | Osobny Worker z `scheduled()` + cron trigger, fine-grained PAT jako sekret Cloudflare, wdrożenie | Wygasanie/rotacja PAT (nieudany dispatch nie wysyła maila z GitHuba — trzeba innego sygnału), drugi system do utrzymania                                                    |
| C'. Cron na Cloudflare → `PUT …/enable` co tydzień           | Jak A (ta sama niepotwierdzona mechanika), ale działa też po wyłączeniu                  | Jak C                                                                                            | Jak C; dodatkowo naprawia stan `disabled_inactivity`, jeśli A jednak nie działa                                                                                             |
| D. Ostrzeżenie „dane starsze niż 7 dni” na `/szukaj`         | Nie, tylko sygnał                                                                        | Porównanie daty po stronie serwera + komunikat                                                   | Fałszywe alarmy przy opóźnieniach publikacji RPL; sygnał widzi tylko ten, kto wejdzie na `/szukaj`                                                                          |

### Notyfikacje GitHuba

- `fem-on-colab/warn-workflow-about-to-be-disabled-action` cytuje dokumentację: „Notifications for scheduled workflows are sent to the user who initially created the workflow”, oraz tekst ostrzeżenia GitHuba: „To prevent this, please temporarily manually disable the workflow and then immediately re-enable it.” Wskazuje też, że interfejs „sometimes offers a ‘Continue running’ button” przed terminem. Z tego wynika, że ręczne wyłączenie i włączenie jest przez GitHub zalecanym sposobem zapobiegania — co wspiera opcję A, ale nie dowodzi, że samo `enable` na włączonym workflowie wystarcza.
- Czy GitHub wysyła mail przed wyłączeniem albo po nim — źródła są sprzeczne (wynik wyszukiwania: jedno mówi o braku powiadomienia, inne o cichym wyłączeniu). Nieustalone.

## Code References

- `.github/workflows/registry-import.yml:7-9` — harmonogram `17 4 * * *` i `workflow_dispatch`
- `.github/workflows/registry-import.yml:16-17` — `permissions: contents: read`
- `.github/workflows/registry-import.yml:21` — guard `refs/heads/main`
- `src/pages/szukaj.astro:54-57` — data stanu rejestru
- `src/lib/registry-date.ts:4` — formatowanie daty
- `scripts/registry-import.mjs:217` — strażnik „nie starszy niż ostatni”
- `wrangler.jsonc:4` — entrypoint aplikacji z adaptera Astro
- `README.md:93` — opis harmonogramu i ręcznego włączenia (do aktualizacji przy każdej opcji)

## Architecture Insights

- Wszystko, co dotyczy importu, żyje dziś w GitHub Actions; Cloudflare obsługuje tylko aplikację. Opcja A nie dodaje sekretów ani systemów; opcja C dodaje token z prawem zapisu do Actions trzymany poza GitHubem.
- Ruleset `main` blokuje commity botów, więc każda forma „aktywności” musi pochodzić z API, nie z gita.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-daily-registry-refresh/plan.md` („What We're NOT Doing”) — S-07: bez ostrzeżenia o wieku danych, bez heartbeatu (healthchecks.io); ryzyko wyłączonego harmonogramu przyjęte. Stan: zastąpione decyzją audytu F7 w zakresie keepalive.
- `context/archive/2026-10-17-testing-quality-gates-wiring/plan.md:35,46` — upublicznienie repo 2026-10-20 uruchomiło ryzyko 60 dni; przyjęte, sygnał = data na `/szukaj`.
- `context/audits/prd-conformance/2026-11-16.md:138-149` — F7, decyzja B: wycinek keepalive po M-1, ewentualnie z ostrzeżeniem 7 dni.
- `context/foundation/infrastructure.md:73`, `context/foundation/test-plan.md:263`, `context/foundation/prd.md:205-208`, `context/deployment/deploy-plan.md:74`, `README.md:93` — miejsca opisujące ryzyko jako przyjęte i wskazujące S-16; do aktualizacji po wdrożeniu.

## Related Research

- `context/archive/2026-10-21-testing-registry-import-scripts/research.md:145` — harmonogram poza zakresem testów.

## Open Questions

- Którą opcję (A / C / C' / D lub połączenie) wybiera autor — decyzja w `/10x-plan`.
- Czy `PUT …/enable` na włączonym workflowie zeruje licznik: brak źródła od GitHuba. Weryfikacja możliwa tylko po > 60 dniach bez commitów (np. obserwacja stanu workflowu `gh api …/actions/workflows/registry-import.yml --jq .state`).
- Czy GitHub wysyła mail przed wyłączeniem harmonogramu — nieustalone.
- Opóźnienia publikacji RPL (ile dni bywa między kolejnymi `stanNaDzien`) — brak danych bez dostępu do produkcyjnej tabeli `registry_imports`; istotne tylko dla opcji D.

## Follow-up 2026-11-18 (druga sesja)

- Dowody za i przeciw opcji A są anegdotyczne i sprzeczne:
  - za: w dyskusji [community #184653](https://github.com/orgs/community/discussions/184653) użytkownik (wpis z 2026-10-15) podaje, że workflowy z zaplanowanym wywołaniem enable przez API wciąż działały 70 dni i dłużej po ostatnim commicie w dwóch repozytoriach, a w trzecim od 10 czerwca; to obserwacja jednej osoby, bez potwierdzenia GitHuba;
  - przeciw: `efrecon/gh-action-keepalive` pisze, że jego wcześniejsza wersja przełączała stan workflowów (disable + enable) i „turned out not being able to bypass GitHub's deadline”, dlatego przeszła na commity (u nas niewykonalne, ruleset `main`).
- Mail przed wyłączeniem: ten sam wątek (2026-01-19) i forum Julii cytują mail GitHuba „The "…" workflow in … will be disabled soon”, wysyłany kilka dni przed terminem (liczba dni nieustalona). Nie zastępuje to keepalive, ale znaczy, że wyłączenie nie musi być całkiem ciche.
- Wniosek dla planu: opcja A jest tania, ale jej skuteczność da się potwierdzić dopiero po > 60 dniach bez commitów; jeśli autor chce pewności, potrzebny jest niezależny sygnał (D albo C/C').

Sources: [GitHub community discussion #184653](https://github.com/orgs/community/discussions/184653), [efrecon/gh-action-keepalive](https://github.com/efrecon/gh-action-keepalive), [GitHub Docs: Disable and enable workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows), [liskin/gh-workflow-keepalive](https://github.com/liskin/gh-workflow-keepalive), [gautamkrishnar/keepalive-workflow (disabled)](https://github.com/gautamkrishnar/keepalive-workflow), [Gitea mirror of keepalive-workflow](https://gitea.com/sekedus/keepalive-workflow), [PhrozenByte/gh-workflow-immortality](https://github.com/PhrozenByte/gh-workflow-immortality), [fem-on-colab/warn-workflow-about-to-be-disabled-action](https://github.com/fem-on-colab/warn-workflow-about-to-be-disabled-action).
