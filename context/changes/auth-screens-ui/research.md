---
date: 2026-11-18T11:21:15+01:00
researcher: Claude (sesja workera S-15)
git_commit: 48e3f76
branch: feat/auth-screens-ui
repository: mamlek
topic: "Audyt ekranów logowania i rejestracji (S-15 auth-screens-ui) pod kontrakt tokenów i komponentów"
tags: [research, ui, auth, tokens, shadcn, banner, 10x-ui]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (sesja workera S-15)
---

# Research: ekrany auth na tokenach i komponentach aplikacji (S-15)

**Date**: 2026-11-18T11:21:15+01:00
**Researcher**: Claude (sesja workera S-15)
**Git Commit**: 48e3f76 (gałąź bez własnych commitów; folder zmiany nieśledzony)
**Branch**: feat/auth-screens-ui
**Repository**: mamlek

## Research Question

Dwukierunkowy audyt `/10x-ui` widoku „ekrany konta” (`src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/*.tsx`) oraz tytułu w `src/layouts/Layout.astro` i banera konfiguracji (`src/lib/config-status.ts`, `src/components/Banner.astro`): które wartości i komponenty omijają kontrakt projektu (tokeny w `:root` pliku `src/styles/global.css`, komponenty w `src/components/ui/`), co widzi użytkownik, który trafia tu inną drogą (zalogowany, prosto z linku, po rejestracji), i co w testach/skryptach zależy od obecnego wyglądu i tekstów. Wynik: `## Charges` dla `/10x-plan`.

## Summary

- **Wariant kontraktu: istniejący system projektowy.** Tokeny i komponenty są gotowe i używane przez `/szukaj`, `/apteczka`, `/apteczka/import` (`src/pages/szukaj.astro:44-46` — `Card`, `CardContent`, `text-foreground`). Ekrany auth nie czytają z nich nic: skan z `/10x-ui` daje 34 trafienia w 11 plikach (strony auth po 5, `FormField.tsx` 5, `Banner.astro` 9, `SubmitButton.tsx` 2, `PasswordToggle.tsx` / `ServerError.tsx` / `SignUpForm.tsx` po 1), a z `src/components/ui/` importuje tylko `SubmitButton.tsx:3`, który i tak nadpisuje `Button` fioletem (`SubmitButton.tsx:18`).
- **`bg-cosmic` żyje już tylko na trzech stronach auth** (`signin.astro:11`, `signup.astro:11`, `confirm-email.astro:22`; wyszukiwanie `bg-cosmic` w `src/` poza `src/pages/auth` nie dało trafień). Po tej zmianie `@utility bg-cosmic` (`global.css:128-130`, hex) to martwy kod — usunięcie dotyka `global.css`, wspólnego z S-08 (zgłosić koordynatorowi).
- **Wszystkie teksty ekranów są po angielsku** poza komunikatami błędów serwera, które są już po polsku (`src/lib/auth-errors.ts:8-23`). Tytuły kart: „Sign in”, „Sign up”, „Registration successful”/„Check your email”; domyślny tytuł `Layout` to „10x Astro Starter” (`Layout.astro:10`). Baner braku konfiguracji jest po polsku, ale linkuje do repozytorium startera (`config-status.ts:16`).
- **Dwie ścieżki wejścia dają mylący ekran:** (1) zalogowany użytkownik na `/auth/signin` lub `/auth/signup` widzi formularz, bo middleware przekierowuje tylko `/` i trasy chronione (`middleware.ts:93-100`); (2) `confirm-email.astro:4` wybiera tekst po `import.meta.env.DEV`, a nie po tym, czy Supabase wymaga potwierdzenia. Według dokumentacji supabase-js przy wyłączonym „Confirm email” `signUp` zwraca i zapisuje sesję, a przy włączonym zwraca `session: null` — endpoint (`api/auth/signup.ts:14`) ignoruje `data`, więc tej informacji nie przekazuje.
- **Stan „loading” przycisku nigdy się nie pokazuje (wniosek z dokumentacji, nie z testu w przeglądarce):** `SubmitButton` czyta `useFormStatus().pending` (`SubmitButton.tsx:12`), a dokumentacja React mówi, że `pending` jest `true` tylko przy Action (funkcja w `action`) albo Transition z `onSubmit`. Formularze mają `action="/api/auth/..."` (URL) i natywny submit (`SignInForm.tsx:43`, `SignUpForm.tsx:66`), więc `pending` zostaje `false`: brak spinnera i brak blokady drugiego kliknięcia.
- **Testy i skrypty zależą od angielskich tekstów i od identyfikatorów pól** — polonizacja musi je zmienić w tym samym kroku (szczegóły w „Zależności poza widokiem”).
- **Bramka wizualna nie potrzebuje bazy:** strony auth renderują się bez Supabase (wtedy z banerem), a stan błędu serwera da się wywołać adresem `?error=<kod>` (`signin.astro:7`). `ui:shots` obejmuje tylko `/szukaj` (`scripts/ui-shots.mjs:245`) i wymaga zalogowania.

## Charges

Każdy zarzut: plik i linia, skutek dla użytkownika. Kategorie z `/10x-ui`.

### C1 — Brak tokenów: ciemny motyw startera z literałów (missing tokens)

- Strony: `signin.astro:11-13,17,19`, `signup.astro:11-13,17,19`, `confirm-email.astro:22-23,25,28-29` — `bg-cosmic`, `bg-white/10`, `border-white/10`, `text-white`, gradient `from-blue-200 to-purple-200` z `text-transparent`, `text-blue-100/60|80`, `text-purple-300`.
- Części formularza: `FormField.tsx:6,37,41,53,59` (`bg-white/10`, `text-white`, `placeholder-white/40`, `border-red-400/60`, `focus:ring-purple-400`, `text-red-300`), `PasswordToggle.tsx:13` (`text-white/40`, `hover:text-white/70`), `ServerError.tsx:11` (`border-red-500/30 bg-red-900/30 text-red-300`), `SignUpForm.tsx:59` (`text-blue-100/50`), `SubmitButton.tsx:18,22` (`bg-purple-600`, `hover:bg-purple-500`, `border-white/30 border-t-white`).
- Baner: `Banner.astro:27-41` — trzy warianty z kolorami hex (`#dbeafe`, `#fee2e2` …); `Layout.astro:24` używa wyłącznie wariantu `error`.
- Tokeny, które to pokrywają (`global.css:7-31`): `bg-background`/`bg-card`/`text-card-foreground` (tło i karta), `text-foreground` (nagłówek), `text-muted-foreground` (podpisy, podpowiedź hasła, ikony pól), `text-primary` / `buttonVariants({variant:"link"})` (linki), `text-destructive` (+ `bg-destructive/10` dla tła), `ring-ring` (focus), `bg-primary`/`text-primary-foreground` (przycisk). Baner `error` → `destructive`; `warning` ma własne tokeny (`--warning`, `--warning-foreground`), `info` → np. `accent`. Nowe wartości w `:root` nie są potrzebne.
- **Skutek:** po zalogowaniu użytkownik przechodzi z granatowo-fioletowego ekranu z białym tekstem na jasny teal reszty aplikacji — wygląda to jak dwie różne aplikacje; czerwony baner jest jedynym elementem w trzeciej palecie.

### C2 — Brak wspólnych komponentów: ręczny input, karta z `div`ów, nadpisany przycisk (missing shared component)

- `FormField.tsx:37-55` — własny `<label>` i `<input>` zamiast `Input` (`src/components/ui/input.tsx:4-17`) i `Label` (`ui/label.tsx:26-36`). Shadcn `Input` ma już focus (`focus-visible:ring-ring/50`), błąd (`aria-invalid:border-destructive`) i disabled; ręczny input ich nie ma i nie ustawia `aria-invalid` ani `aria-describedby` (komunikat błędu `FormField.tsx:58-62` nie jest powiązany z polem).
- Strony: karta to `div` z klasami (`signin.astro:12`, `signup.astro:12`, `confirm-email.astro:23`) zamiast `Card`/`CardContent` (`ui/card.tsx:43-51,84-86`), których używa `szukaj.astro:44-45`.
- `SubmitButton.tsx:15-19` — `Button` z nadpisanym kolorem, zaokrągleniem i paddingiem; wariant `default` (`ui/button.tsx:106`) daje już `bg-primary`.
- Linki „Sign up”/„Sign in” (`signin.astro:19`, `signup.astro:19`, `confirm-email.astro:29`) — ręczne klasy zamiast `buttonVariants({ variant: "link" })`, którego wymaga `AGENTS.md` (UI → Components) i używa `Topbar.astro:6`.
- `ServerError.tsx:10-14` i komunikat w `FormField.tsx:59-62` — trzecia i czwarta wersja komunikatu błędu; reszta aplikacji ma `InlineError` (`src/components/kit/kit-fields.tsx:30-41`: `text-destructive`, ikona `aria-hidden`, opcjonalnie `role="alert"`). `kit-fields.tsx` to plik z obszaru S-08 (lista apteczki) — import tylko do odczytu albo przeniesienie wymaga zgody koordynatora.
- **Skutek:** pola i przycisk wyglądają i zachowują się inaczej niż w formularzu dodawania leku; czytnik ekranu nie łączy błędu z polem, więc użytkownik niewidomy słyszy „pole edycji e-mail” bez informacji, że jest błędne.

### C3 — Przypadkowa architektura: teksty i tożsamość startera (accidental architecture)

- Angielskie teksty: nagłówki i linki stron (`signin.astro:10,14,18-20`, `signup.astro:10,14,18-20`, `confirm-email.astro:9-17`), etykiety i placeholdery (`SignInForm.tsx:47,53,60,67`, `SignUpForm.tsx:70,76,83,90,107,114`), walidacja klienta (`SignInForm.tsx:21,23,26`, `SignUpForm.tsx:26,28,32,34,38,40`), podpowiedź długości hasła z angielską liczbą mnogą (`SignUpForm.tsx:59-62`), przyciski i stany (`SignInForm.tsx:82-84`, `SignUpForm.tsx:129-131`), `aria-label` przełącznika hasła (`PasswordToggle.tsx:14`). Dokument ma `lang="pl"` (`Layout.astro:14`), więc czytnik ekranu czyta te teksty polską fonetyką.
- Tytuł karty: domyślny „10x Astro Starter” (`Layout.astro:10`) widać na każdej stronie bez `title`; strony domenowe podają tylko nazwę widoku („Szukaj leku”, `szukaj.astro:29`; „Apteczka”, `apteczka.astro:56`), bez nazwy aplikacji „MamLek” (`README.md:1`). Roadmapa żąda „tytułu aplikacji” na karcie (`roadmap.md:300`).
- Baner: `config-status.ts:16` — `docsUrl` na `github.com/przeprogramowani/10x-astro-starter#supabase-configuration`. Własna instrukcja konfiguracji jest w `README.md:28-56` („Getting started”, „Using a cloud Supabase project”), repozytorium `github.com/michalg84/mamlek`.
- `confirm-email.astro:8,14` — emoji jako jedyna grafika (✅/📧) bez tekstu alternatywnego.
- **Skutek:** polskojęzyczny użytkownik pierwszy ekran aplikacji widzi po angielsku, a komunikaty błędów serwera po polsku (`auth-errors.ts:9-22`) — mieszanka języków na jednym formularzu; zakładka przeglądarki pokazuje nazwę startera.

### C4 — Przypadkowa architektura: wejścia, które pokazują nieprawdziwy stan (accidental architecture)

- Zalogowany na `/auth/signin` / `/auth/signup`: `middleware.ts:93-100` przekierowuje tylko `/` i `PROTECTED_ROUTES` (`middleware.ts:65`). Zalogowany użytkownik, który otworzy zakładkę z logowaniem, widzi pusty formularz, jakby był wylogowany.
- `confirm-email.astro:4` — `isAutoConfirmed = import.meta.env.DEV`. Zachowanie Supabase (dokumentacja supabase-js, JSDoc `signUp` w `GoTrueClient.ts`): „Confirm email” włączone → `user` i `session: null`; wyłączone → `user` i `session`, a klient zapisuje sesję. `api/auth/signup.ts:14` nie czyta `data`, zawsze przekierowuje na `/auth/confirm-email` (`signup.ts:23`). Skutki:
  - lokalny `npm run dev` (`enable_confirmations = false`, `supabase/config.toml:209`): ekran mówi „możesz się teraz zalogować”, a użytkownik jest już zalogowany (sesja zapisana w ciasteczkach przez klienta SSR) — inferencja z dokumentacji, nie sprawdzona w przeglądarce;
  - build produkcyjny / `preview` (`DEV = false`): zawsze „sprawdź skrzynkę”, także gdy projekt ma potwierdzanie wyłączone (README.md:56 opisuje, że da się je wyłączyć);
  - ktoś, kto wejdzie na `/auth/confirm-email` bez rejestracji, dostaje komunikat o wysłanym mailu.
- Ograniczenie przy zmianie przekierowania: `tests/api/helpers.ts:97` porównuje `location` dokładnie z `/auth/confirm-email`; `scripts/smoke.mjs:159,256` i `scripts/lib/test-account.mjs:23` porównują prefiks (`smoke.mjs:305`, `startsWith`). Dodanie parametru zapytania wymaga zmiany `helpers.ts:97`; przekierowanie gdzie indziej (np. `/szukaj`) — zmiany wszystkich trzech.
- **Skutek:** użytkownik dostaje instrukcję, która nie pasuje do jego sytuacji (loguje się drugi raz albo czeka na maila, który nie przyjdzie).

### C5 — Stany: loading martwy, focus i błąd poza tokenami (7-state matrix)

- loading: `SubmitButton.tsx:12-24` — `useFormStatus` przy natywnym submit na URL (`SignInForm.tsx:43`, `SignUpForm.tsx:66`) nie przechodzi w `pending` (dokumentacja React `useFormStatus`: `pending` tylko przy Action albo Transition z `onSubmit`). Spinner i `disabled` nigdy się nie pokazują; nie sprawdzone w przeglądarce.
- disabled: jedyny stan disabled to ten sam `pending` — w praktyce nieosiągalny; `Input` shadcn ma styl disabled, ręczny input nie.
- focus-visible: `FormField.tsx:6,53` `focus:outline-none focus:ring-2 focus:ring-purple-400` (fiolet, także przy kliknięciu myszą); `PasswordToggle.tsx:10-18` nie ma żadnego stylu focus poza bazowym `outline-ring/50` z `global.css:134`.
- error: ikona + tekst (nie tylko kolor) — dobrze; kolor z palety (`text-red-300`), brak `aria-invalid`/`aria-describedby` (C2); błąd serwera bez `role="alert"` (`ServerError.tsx:11`), choć pojawia się po przeładowaniu strony, więc ogłoszenie jest mniej istotne niż przy błędzie klienta.
- empty: N/A — formularz nie ma danych do wyświetlenia; odpowiednik to `confirm-email` otwarte bez rejestracji (C4).
- hover: przycisk i link przełącznika hasła mają hover z palety (`SubmitButton.tsx:18`, `PasswordToggle.tsx:13`).
- Hydratacja: tekst wpisany przed hydratacją wyspy ginie (`tests/e2e/auth.setup.ts:13-15`, `scripts/lib/test-account.mjs:31`) — znane obejście w testach, nie zarzut tej zmiany (zachowanie React, nie wyglądu); odnotowane jako poza zakresem.
- **Skutek:** po kliknięciu „Zaloguj” przy wolnej sieci nic się nie dzieje na ekranie, więc użytkownik klika ponownie; fokus klawiatury jest fioletowy, a na przełączniku hasła ledwo widoczny.

## Detailed Findings

### Źródło → widoki (kontrakt)

- Tokeny: `global.css:7-45` (`:root`, jasny teal; źródło w komentarzu `global.css:6`), `.dark` `global.css:47-84` (aplikacja nie przełącza `.dark` — wyszukiwanie klasy `dark` w `Layout.astro` bez trafień), publikacja `@theme inline` `global.css:86-126`. Baza: `body` ma `bg-background text-foreground` (`global.css:136-138`), więc strony auth po zdjęciu `bg-cosmic` dostaną jasne tło bez dodatkowych klas.
- Komponenty w `src/components/ui/`: `button`, `card`, `input`, `label`, `textarea`, `radio-group`, `alert-dialog`, `LibBadge.astro`. Ekrany auth używają z nich tylko `Button` (`SubmitButton.tsx:3`).
- Wzorzec pola w aplikacji: `kit-fields.tsx` — `Input`, `Label`, `FIELD_LABEL_CLASS` (`kit-fields.tsx:15`), `InlineError` (`kit-fields.tsx:30-41`), wysokość dotyku `min-h-11` (`kit-fields.tsx:13`).
- Wzorzec strony: `szukaj.astro:40-46` — `min-h-screen p-4`, kontener `max-w-xl`, `Topbar`, `Card` > `CardContent`, `h1 text-foreground text-2xl font-bold`. `Topbar.astro:29-40` ma wariant dla niezalogowanego („Nie zalogowano”, „Zaloguj się”, „Załóż konto”).
- Strażnik: `scripts/ui-scan.mjs:19-34` (`GUARDED`, 14 plików, bez plików auth), wzorzec `ui-scan.mjs:36-42+` łapie hex, `rgb(`, `hsl(`, `oklch(`, `-[…px|rem]`, klasy palety i `bg-cosmic`. Hex w `<style>` `Banner.astro` jest przez niego wykrywany (linia z `#`).

### Widoki → źródło (literały)

Pełna lista literałów jest w C1; mapa na role w C1 „Tokeny, które to pokrywają”. `Banner.astro` jest stylowany w `<style>` — plan wybiera, czy przejść na klasy Tailwind, czy `var(--destructive)` w CSS (oba bez literałów).

### Zależności poza widokiem (do zmiany razem z tekstami)

- `tests/e2e/auth.setup.ts:17-21` — `getByLabel("Email")`, `getByLabel("Password", { exact: true })`, `getByRole("button", { name: "Sign in" })`.
- `tests/e2e/seed.spec.ts:13` — `getByRole("heading", { name: "Sign in" })`.
- E2E nie jest w CI (brak skryptu `e2e` w `package.json`, brak wpisu w `.github/workflows/`); uruchamia się ręcznie (`context/foundation/test-stack.md:9`, port 4321 z `preview`).
- `scripts/lib/test-account.mjs:32-35` (używane przez `ui:shots` i `perf`) — selektory `#email`, `#password`, `button[type="submit"]` i `astro-island:has(#email)`. Zachowanie `id="email"` i `id="password"` utrzymuje je bez zmian.
- Endpointy czytają pola `email` i `password` z `formData` (`api/auth/signin.ts:7-8`, `signup.ts:7-8`) — atrybuty `name` muszą zostać.
- `scripts/smoke.mjs`, `tests/api/*` — tylko przekierowania endpointów, nie treść stron (patrz C4 dla ograniczenia przy zmianie przekierowania).
- Testy jednostkowe: brak testów w `src/components/auth/` (lista plików katalogu: 6 plików `.tsx`, żaden `.test.tsx`); `src/lib/auth-errors.test.ts` dotyczy kodów błędów, nie widoku.

### Bramka wizualna

- `ui:shots` (`scripts/ui-shots.mjs:245+`, `STATES`) robi zrzuty tylko `/szukaj`, po zalogowaniu (wymaga bazy i rejestru). Ekrany auth: stan błędu serwera przez `?error=invalid_credentials` (`signin.astro:7` → `authErrorMessage`), błąd klienta przez wysłanie pustego formularza, focus przez Tab, baner przez uruchomienie bez `SUPABASE_URL`/`SUPABASE_KEY` (`config-status.ts:14`). Żaden z tych stanów nie wymaga lokalnej bazy; serwer z `.env` jest potrzebny tylko do stanu „bez banera”.
- Port tego wycinka: 4332 (`COORDINATION.md`).

## Code References

- `src/pages/auth/signin.astro:10-24`, `signup.astro:10-24` — strona = `bg-cosmic` + karta z `div` + nagłówek z gradientem + link.
- `src/pages/auth/confirm-email.astro:4-18` — wybór treści po `import.meta.env.DEV`.
- `src/components/auth/FormField.tsx:5-6,35-66` — ręczne pole z ikoną i błędem.
- `src/components/auth/SubmitButton.tsx:11-32` — `useFormStatus` + nadpisany `Button`.
- `src/components/auth/SignInForm.tsx:18-30`, `SignUpForm.tsx:22-45` — walidacja klienta z angielskimi komunikatami; `MIN_PASSWORD_LENGTH = 6` (`SignUpForm.tsx:8`).
- `src/layouts/Layout.astro:10,19,23-36` — domyślny tytuł i baner.
- `src/lib/config-status.ts:11-19` — wpis Supabase z linkiem startera.
- `src/components/Banner.astro:11-41` — warianty z hex.
- `src/middleware.ts:65,93-100` — przekierowania (bez `/auth/*`).
- `src/pages/api/auth/signup.ts:14,23` — `signUp` bez odczytu `data`, stałe przekierowanie.
- `src/lib/auth-errors.ts:8-23` — polskie komunikaty błędów serwera (już gotowe).
- `src/styles/global.css:128-130` — `@utility bg-cosmic`.
- `scripts/ui-scan.mjs:19-34` — `GUARDED`.

## Architecture Insights

- Ekrany auth to ostatnia część startera, której nie przeszedł żaden wycinek UI; reszta aplikacji ma już jednolity wzorzec (`Card` + `Topbar` + `kit-fields`), więc zmiana to przeniesienie istniejącego wzorca, nie projektowanie nowego.
- Komunikaty błędów serwera mają już bezpieczny kanał (`?error=<kod>` → polski tekst, `auth-errors.ts:3-7`); ta zmiana nie musi go ruszać.
- Formularze działają jako natywny POST + redirect (progressive enhancement); React służy tylko walidacji klienta. Stan loading trzeba zbudować w tej architekturze (np. lokalny stan ustawiany w `onSubmit` po udanej walidacji), a nie przez Actions.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-search-view-tokens/plan.md:57-69` — zapowiedź: inne strony z `bg-cosmic` (w tym `signin`, `signup`, `confirm-email`) i `SubmitButton.tsx` dostaną osobną zmianę 10x-ui; usunięcie `bg-cosmic` odłożone, bo używało go pięć stron. Dziś: supported co do zapowiedzi; liczba pięciu stron nieaktualna — zostały trzy (Welcome i dashboard nie istnieją, wyszukiwanie w `src/` bez trafień).
- `context/archive/2026-10-07-search-view-tokens/plan-brief.md:54-55` — strony auth, Banner, komponenty formularza, usunięcie `bg-cosmic` i shadcn `label` poza zakresem tamtej zmiany. `label` jest już w `src/components/ui/label.tsx`.
- `context/archive/2026-10-07-search-view-tokens/plan.md:238` — po tamtej zmianie strona logowania miała wyglądać „bez zmian poza kolorem pierścienia fokusu przycisku”; dziś przycisk ma `focus-visible:ring-ring/50` z `buttonVariants`, a pola nadal `focus:ring-purple-400`.
- `context/foundation/prd.md:292-310` — Access Control: e-mail + hasło, rejestracja otwarta, brak resetu hasła w aplikacji (więc ekran logowania nie potrzebuje linku „nie pamiętam hasła”).
- `context/foundation/roadmap.md:298-307` — opis S-15.

## Related Research

- `context/archive/2026-10-07-search-view-tokens/` — pierwsza zmiana `/10x-ui` (tokeny i `/szukaj`), źródło palety.

## Open Questions

Decyzje produktowe dla `/10x-plan` (nie fakty do zbadania):

1. Tytuł karty: format (np. „Zaloguj się · MamLek”) i czy zmieniać też tytuły `/szukaj`, `/apteczka`, `/apteczka/import` (wspólny `Layout.astro`, który S-08 może zmieniać — uzgodnić z koordynatorem).
2. Zalogowany na `/auth/signin` i `/auth/signup`: przekierować na `/szukaj` w middleware czy zostawić formularz.
3. `confirm-email`: przekazać z endpointu, czy `signUp` zwrócił sesję (parametr albo inne przekierowanie), czy tylko poprawić tekst na neutralny. Przekierowanie zalogowanego od razu na `/szukaj` wymaga zmiany `tests/api/helpers.ts:97`, `smoke.mjs:159,256` i `test-account.mjs:23`.
4. Baner: link do sekcji README repozytorium MamLek, czy bez linku (baner widzi użytkownik produkcji tylko przy błędnej konfiguracji serwera).
5. Układ strony auth: `Topbar` (wariant niezalogowany już ma linki logowania/rejestracji) czy sam nagłówek z nazwą aplikacji nad kartą; ikony w polach (`Mail`, `Lock`) zostają czy znikają, jak w formularzach apteczki.
6. `InlineError` z `kit-fields.tsx` (obszar S-08): importować, przenieść do wspólnego miejsca (zgoda koordynatora) czy zostawić osobny komunikat w `components/auth` na tokenach.
7. Usunięcie `@utility bg-cosmic` z `global.css` w tej zmianie (zgłoszenie do koordynatora przed edycją).
