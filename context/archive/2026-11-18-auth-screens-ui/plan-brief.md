# Ekrany auth po polsku na tokenach aplikacji — Plan Brief

> Full plan: `context/changes/auth-screens-ui/plan.md`
> Research: `context/changes/auth-screens-ui/research.md`

## What & Why

Ekrany logowania, rejestracji i potwierdzenia maila to pierwsze, co widzi nowy użytkownik MamLek, a wyglądają jak niezmieniony starter: ciemny gradient, fioletowe akcenty, angielskie teksty i tytuł „10x Astro Starter”. Do tego wejścia prowadzą w złe miejsca — zalogowany widzi formularz logowania, a rejestracja zawsze odsyła na „sprawdź skrzynkę”, nawet gdy konto ma już sesję. Slice S-15 to naprawia.

## Starting Point

Audyt (`research.md`, C1–C5): 3 strony i 6 komponentów `src/components/auth/` na klasach palety i `bg-cosmic`, własne pole formularza zamiast `ui/input`/`ui/label`, baner z kolorami hex, brak przekierowania zalogowanego w `middleware.ts`, `signup.ts` ignoruje `data.session`, a spinner przycisku nigdy się nie pokazuje (`useFormStatus` przy natywnym POST).

## Desired End State

Trzy ekrany w jasnym motywie aplikacji, po polsku, z nazwą „MamLek” nad kartą formularza, zbudowane z komponentów `src/components/ui/` i klas ról. Zalogowany trafia z `/auth/signin|signup` na `/szukaj`, rejestracja z sesją kończy się na `/szukaj`, karty przeglądarki mają tytuł „Widok · MamLek”. Wszystkie 7 stanów jest widocznych na zrzutach, a `ui:scan` pilnuje plików auth.

## Key Decisions Made

| Decision                                      | Choice                                                                               | Why (1 sentence)                                                                   | Source   |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| Tytuł karty przeglądarki                      | „Widok · MamLek” na wszystkich stronach, samo „MamLek” bez tytułu                    | Jedna zmiana w `Layout.astro` naprawia też widoki domenowe.                        | Plan     |
| Układ ekranów auth                            | Nazwa aplikacji + jedno zdanie nad `Card` z formularzem                              | Użytkownik od razu wie, gdzie jest, bez budowania nagłówka aplikacji.              | Plan     |
| Zalogowany na `/auth/signin` i `/auth/signup` | Przekierowanie na `/szukaj` w middleware                                             | Ten sam wzorzec co dzisiejsze `/` → `/szukaj`.                                     | Plan     |
| Cel po rejestracji                            | Endpoint decyduje po `data.session`: sesja → `/szukaj`, brak → `/auth/confirm-email` | Usuwa zgadywanie po `import.meta.env.DEV` i działa przy obu ustawieniach Supabase. | Plan     |
| Baner braku konfiguracji                      | Na tokenach, link do README MamLek `#getting-started`                                | Instrukcja ma prowadzić do tego repo, nie do startera.                             | Plan     |
| Bramka wizualna                               | Zrzuty ręczne 1280/390 px w raporcie fazy 4                                          | `ui:shots` wymaga bazy; ekrany auth da się pokazać bez niej.                       | Plan     |
| Własny `FieldError` w `components/auth`       | Wzorowany na `InlineError`, nie importowany                                          | `kit-fields.tsx` to obszar S-08.                                                   | Plan     |
| Bez ikon w polach                             | Usunięte                                                                             | Formularze apteczki ich nie mają; mniej literałów.                                 | Research |
| `AuthShell.astro`                             | Wspólny szkielet trzech stron                                                        | Jedno miejsce zamiast trzech kopii.                                                | Plan     |
| Tokeny                                        | Bez nowych wartości; `@utility bg-cosmic` usunięty                                   | Istniejące role pokrywają każdy literał.                                           | Research |

## Scope

**In scope:**

- Przekierowania w `middleware.ts` i `signup.ts` plus kontrakty w smoke, helperze test:api i `test-account.mjs`
- Tytuł w `Layout.astro`, `Banner.astro` na tokenach, link w `config-status.ts`
- Trzy strony auth i komponenty `src/components/auth/` na `ui/*`, polskie teksty, selektory E2E
- Stany (wysyłanie, fokus, błędy z ARIA), testy komponentów formularzy, zrzuty
- `GUARDED` w `ui-scan.mjs`, usunięcie `bg-cosmic`, `AGENTS.md`

**Out of scope:**

- Utrata znaków wpisanych przed hydratacją wyspy
- Tryb ciemny, kitchen-sink, stany auth w `ui:shots`
- Przekierowanie zalogowanego z `/auth/confirm-email`
- Zmiany w `auth-errors.ts`, reset hasła, długość hasła

## Architecture / Approach

Kolejność `/10x-ui`: wejścia i rama → widok → stany → strażnik (faza tokenów odpada). Formularze dalej wysyłają się natywnym POST na `/api/auth/*`; stan „wysyłanie” to lokalny `submitting` ustawiany po walidacji i zerowany na `pageshow` z bfcache. `id`/`name` pól `email` i `password` zostają, bo opierają się na nich endpointy i skrypty testowe.

## Phases at a Glance

| Phase                       | What it delivers                                                                       | Key risk                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Wejścia i przekierowania | Zalogowany → `/szukaj`; rejestracja z sesją → `/szukaj`; smoke/test:api zaktualizowane | smoke i test:api lokalnie wymagają bazy (Docker nie działa) — weryfikuje CI |
| 2. Rama aplikacji           | Tytuł „· MamLek”, baner na tokenach, link do README                                    | `Layout.astro` wspólny — zgłoszenie koordynatorowi                          |
| 3. Widoki auth              | `AuthShell`, `Input`/`Label`/`Button`, polskie teksty, selektory E2E                   | E2E nie jest w CI — selektory sprawdzone tylko ręcznie                      |
| 4. Stany i bramka wizualna  | 7 stanów, testy komponentów, zrzuty 1280/390                                           | Stan loading trudny do złapania bez wolnej odpowiedzi                       |
| 5. Strażnik                 | `GUARDED`, bez `bg-cosmic`, `AGENTS.md`                                                | Konflikty z S-16 (`GUARDED`) i S-08/S-16 (`AGENTS.md`)                      |

Fazy 1, 2 i 3 mogą iść równolegle; 4 po 3; 5 na końcu.

**Prerequisites:** zgoda koordynatora przed `Layout.astro`, `ui-scan.mjs`, `global.css`, `AGENTS.md` i przed użyciem lokalnej bazy.
**Estimated effort:** ~2–3 sesje na 5 faz.

## Open Risks & Assumptions

- Przy włączonym potwierdzaniu maili rejestracja na istniejący adres też pokazuje „Sprawdź skrzynkę” (ochrona Supabase przed wyliczaniem kont) — zamierzone.
- Zmiana kontraktu po rejestracji łamie smoke/test:api, jeśli lokalny Supabase ma włączone potwierdzanie — dziś wyłączone (`supabase/config.toml`).
- Wspólne pliki z S-08 i S-16 mogą wymagać rebase przed `/ship`.

## Success Criteria (Summary)

- Nowy użytkownik widzi polskie, spójne z aplikacją ekrany i po rejestracji (lokalnie) ląduje od razu w wyszukiwarce.
- Zalogowany nigdy nie widzi formularza logowania; fokus, błędy i wysyłanie są widoczne na zrzutach 1280 i 390 px.
- `npm run ui:scan` kończy się kodem 1, gdy ktoś wróci do literałów na ekranach auth.
