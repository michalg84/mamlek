# Ekrany auth po polsku na tokenach aplikacji — plan implementacji

## Overview

Ekrany `/auth/signin`, `/auth/signup` i `/auth/confirm-email` przechodzą z ciemnego motywu startera (`bg-cosmic`, klasy palety, angielskie teksty) na jasne tokeny i komponenty aplikacji, z polskimi tekstami. Każde wejście na te ekrany kończy się tam, gdzie powinno: zalogowany nie widzi formularza, a rejestracja z gotową sesją prowadzi od razu do wyszukiwania. Karta przeglądarki ma tytuł aplikacji, baner braku konfiguracji prowadzi do README MamLek, a na końcu widoki trafiają pod strażnika `ui:scan`. Slice roadmapy S-15, wariant kontraktu: istniejący system projektowy (tokeny w `global.css`, komponenty w `src/components/ui/`).

## Current State Analysis

Pełny audyt z odnośnikami: `research.md`, sekcja `## Charges` (C1–C5). W skrócie:

- **C1 brak tokenów**: trzy strony auth i sześć komponentów `src/components/auth/` używają `bg-cosmic`, `white/10`, gradientu `blue-200→purple-200`, `text-blue-100/x`, `text-purple-300`, `red-300/400`; `Banner.astro:27-41` ma kolory hex w `<style>`. Tokeny ról pokrywają każdy literał; nowe wartości nie są potrzebne.
- **C2 brak wspólnych komponentów**: `FormField.tsx` buduje własny input i label zamiast `ui/input` + `ui/label`, bez `aria-invalid` i `aria-describedby`; karta to `div`, `SubmitButton` przemalowuje `Button` na fiolet, linki bez `buttonVariants`.
- **C3 teksty i tożsamość startera**: wszystkie teksty formularzy po angielsku (błędy serwera z `src/lib/auth-errors.ts` są już po polsku), domyślny tytuł `Layout.astro:10` = „10x Astro Starter”, `config-status.ts:16` linkuje do repozytorium startera.
- **C4 złe wejścia**: `middleware.ts` nie przekierowuje zalogowanego z `/auth/*`; `signup.ts:14,23` ignoruje `data.session` i zawsze kieruje na `/auth/confirm-email`; `confirm-email.astro:4` wybiera treść po `import.meta.env.DEV`.
- **C5 stany**: `SubmitButton.tsx:12` używa `useFormStatus`, który przy `action="/api/auth/..."` (natywny POST) zawsze zwraca `pending: false` — spinner i blokada przycisku nigdy się nie pokazują; fokus fioletowy, `PasswordToggle` bez stylu fokusu; `ServerError` bez `role="alert"`.

## Desired End State

- Zalogowany użytkownik otwierający `/auth/signin` lub `/auth/signup` trafia na `/szukaj`.
- Rejestracja, po której Supabase od razu zakłada sesję (potwierdzanie maili wyłączone), kończy się na `/szukaj`; rejestracja bez sesji kończy się na `/auth/confirm-email` z jedną treścią „Sprawdź skrzynkę”.
- Trzy ekrany auth: nad kartą nazwa „MamLek” i jedno zdanie o aplikacji, pod nią `Card` z nagłówkiem widoku i formularzem na `Input`/`Label`/`Button`, wszystko po polsku, w jasnym motywie, tylko klasy ról.
- Tytuły kart: „Zaloguj się · MamLek”, „Załóż konto · MamLek”, „Sprawdź skrzynkę · MamLek”, „Szukaj leku · MamLek”, „Apteczka · MamLek”, „Import apteczki z CSV · MamLek”; strona bez tytułu: „MamLek”.
- Baner braku konfiguracji na tokenach `destructive`, link do `https://github.com/michalg84/mamlek#getting-started`.
- Macierz 7 stanów pokazana na zrzutach 1280 i 390 px (empty jako N/A z powodem).
- `npm run ui:scan` pilnuje plików auth i `Banner.astro`; `@utility bg-cosmic` usunięty z `global.css`.

Weryfikacja: bramki automatyczne każdej fazy, testy komponentów formularzy, krok smoke dla przekierowania zalogowanego i zrzuty z fazy 4.

### Key Discoveries:

- `src/middleware.ts:33-35` już kieruje `/` według sesji — ochrona `/auth/signin|signup` to ten sam wzorzec.
- Kontrakty przekierowania po rejestracji: `scripts/smoke.mjs:159,256` (prefiks), `tests/api/helpers.ts:97` (dokładne porównanie), `scripts/lib/test-account.mjs:23` (prefiks). Lokalnie `enable_confirmations = false` (`supabase/config.toml:209`), więc wszystkie dostaną `/szukaj`.
- Selektory, które muszą przetrwać: `#email`, `#password`, `button[type="submit"]`, `astro-island:has(#email)` (`scripts/lib/test-account.mjs:32-35`) i pola `name="email"` / `name="password"` (`src/pages/api/auth/signin.ts:7-8`, `signup.ts:7-8`).
- Testy E2E szukają angielskich nazw: `tests/e2e/auth.setup.ts:17-21` (`"Email"`, `"Password"` exact, przycisk `"Sign in"`) i `tests/e2e/seed.spec.ts:13` (nagłówek `"Sign in"`). Nie są w CI.
- `src/components/ui/input.tsx:12` już stylizuje `aria-invalid` tokenem `destructive`.
- Wzorce do skopiowania: `src/components/kit/kit-fields.tsx` (`FIELD_LABEL_CLASS`, `InlineError` z `id` i `role="alert"`) — obszar S-08, więc wzorzec kopiujemy, nie importujemy.
- `scripts/ui-scan.mjs:19-34` (`GUARDED`) — S-16 też dopisuje tam linię; `AGENTS.md` zmieniają też S-08 i S-16.

## What We're NOT Doing

- Utrata wpisanych znaków przed hydratacją wyspy (opisana w `tests/e2e/auth.setup.ts:13-15`) — osobny problem, poza zakresem.
- Zmiany w `src/lib/auth-errors.ts` — polskie komunikaty serwera już są.
- Reset hasła, logowanie przez dostawców, zmiana minimalnej długości hasła (`MIN_PASSWORD_LENGTH = 6` zostaje).
- Przekierowanie zalogowanego z `/auth/confirm-email` (zalogowany tam nie trafia po nowej logice rejestracji).
- Rozbudowa `scripts/ui-shots.mjs` o stany auth (bramka wizualna to zrzuty ręczne).
- Ikony w polach formularza (usuwane — formularze apteczki ich nie mają).
- Import `InlineError` z `src/components/kit/kit-fields.tsx` (obszar S-08).
- Tryb ciemny (aplikacja go nie używa).

## Implementation Approach

Kolejność z `/10x-ui`: wejścia i rama przed widokiem, widok przed stanami, strażnik na końcu. Faza tokenów odpada, bo istniejące role (`primary`, `muted-foreground`, `destructive`, `warning`, `ring`, `card`) pokrywają każdy literał. Wspólny szkielet trzech stron trafia do jednego komponentu `AuthShell.astro`, żeby nie powielać go trzy razy.

**Równoległość:** fazy 1, 2 i 3 mają rozłączne pliki i nie zależą od siebie — mogą iść równolegle (subagenci), bramki i commity po kolei. Faza 4 wymaga fazy 3, faza 5 wymaga wszystkich.

**Koordynacja (S-08, S-16):** przed fazą 2 (`Layout.astro`, `Banner.astro`) i fazą 5 (`ui-scan.mjs`, `global.css`, `AGENTS.md`) — `herdr agent prompt w1:p1 "S-15: ..."` plus linia w Status log `COORDINATION.md`. Lokalna baza (smoke, test:api, E2E) tylko za zgodą koordynatora.

## Critical Implementation Details

**Stan „wysyłanie” przy natywnym POST.** `useFormStatus` działa tylko z form Action; tu formularz wysyła natywnie na URL. Formularz ustawia własny stan `submitting` w `onSubmit` dopiero po udanej walidacji (bez `preventDefault`) i przekazuje go do przycisku. Zablokowanie przycisku po zdarzeniu `submit` nie przerywa wysyłki (dane formularza są już zebrane). Po powrocie przyciskiem Wstecz strona może wrócić z bfcache z `submitting = true` — formularz zeruje stan na `pageshow` z `event.persisted`.

**Sesja po rejestracji.** `supabase.auth.signUp` zwraca `data.session` tylko przy wyłączonym potwierdzaniu; wtedy klient SSR zapisał już ciasteczka sesji. Przy włączonym potwierdzaniu dla istniejącego, potwierdzonego adresu Supabase zwraca zaciemniony obiekt bez sesji (ochrona przed wyliczaniem kont) — taki użytkownik też zobaczy „Sprawdź skrzynkę”, i to jest zamierzone.

**Testy komponentów a wysyłka formularza w jsdom.** jsdom nie implementuje nawigacji po wysłaniu formularza i zgłasza „Not implemented” przez virtual console. Test stanu „wysyłanie” wywołuje `submit` na formularzu (`fireEvent.submit`) i sprawdza przycisk, bez polegania na nawigacji.

## Phase 1: Wejścia i przekierowania (C4)

### Overview

Zalogowany użytkownik nie widzi formularzy logowania i rejestracji, a rejestracja z gotową sesją kończy się na `/szukaj`. Skrypty i testy, które tworzą konta, przyjmują nowy adres. Może iść równolegle z fazami 2 i 3.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Przekierować zalogowanego użytkownika z `/auth/signin` i `/auth/signup` na `/szukaj`, tak jak dziś `/`. Przy awarii sprawdzania sesji `locals.user` jest `null`, więc formularz z komunikatem `session_check_failed` nadal się pokazuje.

**Contract**: dokładne ścieżki `/auth/signin` i `/auth/signup` (z dowolnym query), tylko gdy `context.locals.user` jest ustawiony → `302 /szukaj`. `/auth/confirm-email` i `/api/auth/*` bez zmian.

#### 2. Endpoint rejestracji

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Czytać `data.session` z `signUp`: jest sesja → `/szukaj`, brak sesji → `/auth/confirm-email`. Ścieżka błędu bez zmian.

**Contract**: `POST /api/auth/signup` → `302 /szukaj` (sesja założona) | `302 /auth/confirm-email` (bez sesji) | `302 /auth/signup?error=<kod>` (błąd, bez zmian).

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Kroki „signup creates account” i „second signup creates account” oczekują `/szukaj`. Nowy krok po zalogowaniu: `GET /auth/signin` z sesją → `302 /szukaj`.

**Contract**: lokalizacje w krokach `:159`, `:256`; nowy krok obok „home redirects signed-in user” (`:171`).

#### 4. Helper testów API

**File**: `tests/api/helpers.ts`

**Intent**: Rejestracja oczekuje `/szukaj`. Gdy dostanie `/auth/confirm-email`, komunikat błędu wskazuje włączone potwierdzanie maili jako przyczynę.

**Contract**: warunek w `:97` i jego komunikat; kolejne logowanie (`:103-104`) bez zmian.

#### 5. Konto testowe skryptów przeglądarkowych

**File**: `scripts/lib/test-account.mjs`

**Intent**: `signUpTestAccount` przyjmuje `/szukaj` jako udaną rejestrację (konto lokalne, potwierdzanie wyłączone); komentarz w nagłówku pliku to opisuje.

**Contract**: warunek w `:23`; `signIn` bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe i komponentów przechodzą: `npm test`
- Smoke przechodzi lokalnie, z nowym krokiem przekierowania zalogowanego: `npm run smoke` (wymaga zgody koordynatora na bazę i działającego Dockera; inaczej weryfikuje go CI w jobie `smoke`)
- Testy API przechodzą: `npm run test:api` (te same warunki co smoke; najwyżej ok. 3 przebiegi na 5 minut dla obu slice'ów)

#### Manual Verification:

- Zalogowany użytkownik wpisuje `http://localhost:4332/auth/signin` i `http://localhost:4332/auth/signup` → ląduje na `/szukaj` (wymaga lokalnej bazy)
- Rejestracja nowego konta na `http://localhost:4332/auth/signup` kończy się na `/szukaj` bez drugiego logowania (wymaga lokalnej bazy)
- Po deployu: rejestracja na produkcji (potwierdzanie maili włączone) kończy się na `/auth/confirm-email`

**Implementation Note**: Po bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka, zanim przejdziesz dalej.

---

## Phase 2: Rama aplikacji — tytuł, baner, link (C1/C3)

### Overview

Każda karta przeglądarki ma nazwę aplikacji, a baner braku konfiguracji jest na tokenach i prowadzi do instrukcji MamLek. Przed edycją `Layout.astro` i `Banner.astro` zgłoszenie koordynatorowi. Może iść równolegle z fazami 1 i 3.

### Changes Required:

#### 1. Tytuł w layoucie

**File**: `src/layouts/Layout.astro`

**Intent**: Doklejać „ · MamLek” do tytułu podanego przez stronę; bez tytułu samo „MamLek”. Strony domenowe nie wymagają edycji.

**Contract**: `Props.title?: string` bez zmian; `<title>` = `${title} · MamLek` albo `MamLek`.

#### 2. Baner na tokenach

**File**: `src/components/Banner.astro`

**Intent**: Zastąpić blok `<style>` z hex klasami ról. Wariant `error` na `destructive` (tło `bg-destructive/10`, tekst i obramowanie `destructive`), `warning` na `warning`/`warning-foreground`, `info` na `muted`/`foreground`. Link w banerze dziedziczy kolor, podkreślony, z widocznym fokusem (`ring`).

**Contract**: `Props.variant` i role `alert`/`status` bez zmian; klasy przez `class:list`.

#### 3. Link do instrukcji

**File**: `src/lib/config-status.ts`

**Intent**: `docsUrl` wskazuje na sekcję „Getting started” w README MamLek.

**Contract**: `docsUrl: "https://github.com/michalg84/mamlek#getting-started"`; `message` i `docsLabel` bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Skan `Banner.astro` nie zwraca trafień: `node scripts/ui-scan.mjs src/components/Banner.astro` po tymczasowym dopisaniu do `GUARDED` albo `grep` z wzorcem z `/10x-ui` (pusty wynik)

#### Manual Verification:

- Serwer bez `SUPABASE_URL`/`SUPABASE_KEY` na `http://localhost:4332/auth/signin`: baner czerwony na tokenach, link otwiera README MamLek w sekcji „Getting started”
- Karta przeglądarki na `http://localhost:4332/auth/signin` i `/szukaj` ma tytuł z „ · MamLek”

**Implementation Note**: Po bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka, zanim przejdziesz dalej.

---

## Phase 3: Widoki auth na tokenach i komponentach (C1/C2/C3)

### Overview

Trzy ekrany auth dostają szkielet „MamLek + karta”, pola na `Input`/`Label`, przycisk na `Button` bez nadpisań, linki przez `buttonVariants` i polskie teksty. Selektory testów E2E idą za nowymi nazwami. Może iść równolegle z fazami 1 i 2.

### Changes Required:

#### 1. Szkielet stron auth

**File**: `src/components/auth/AuthShell.astro` (nowy)

**Intent**: Jeden szkielet dla trzech stron: wyśrodkowana kolumna `max-w-sm`, nad kartą „MamLek” (`text-primary`, pogrubione) i jedno zdanie o aplikacji (`text-muted-foreground`), np. „Sprawdź, czy lek jest już w domowej apteczce.”, pod nimi `Card` z nagłówkiem widoku (`h1`, `text-foreground`) i slotem na treść.

**Contract**: props `title: string` (nagłówek `h1`), domyślny slot (formularz), nazwany slot `footer` (link pod formularzem). Nazwa aplikacji to zwykły tekst, nie nagłówek.

#### 2. Strony

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Strony korzystają z `AuthShell` i `Layout` z polskim tytułem. Linki pod formularzem przez `buttonVariants({ variant: "link" })`. `confirm-email` ma jedną treść bez emoji i bez gałęzi `import.meta.env.DEV`.

**Contract**:

- signin: tytuł i nagłówek „Zaloguj się”; stopka „Nie masz konta? Załóż konto” → `/auth/signup`.
- signup: tytuł i nagłówek „Załóż konto”; stopka „Masz już konto? Zaloguj się” → `/auth/signin`.
- confirm-email: tytuł i nagłówek „Sprawdź skrzynkę”; tekst „Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, żeby aktywować konto, a potem się zaloguj.”; link „Wróć do logowania” → `/auth/signin`.

#### 3. Pole formularza

**File**: `src/components/auth/FormField.tsx`

**Intent**: Pole złożone z `ui/label` i `ui/input` w układzie z `kit-fields.tsx` (etykieta `text-muted-foreground text-sm`), bez ikony z lewej; miejsce na przycisk z prawej (przełącznik hasła); podpowiedź i błąd pod polem.

**Contract**: props bez `icon`; `id`, `name` (domyślnie `id`), `type`, `value`, `onChange`, `placeholder`, `error`, `hint`, `endContent` zostają. `id`/`name` pól `email` i `password` bez zmian.

#### 4. Komunikaty i przycisk

**Files**: `src/components/auth/ServerError.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`

**Intent**: `ServerError` na `text-destructive` z tłem `bg-destructive/10`. `SubmitButton` to `Button` w domyślnym wariancie (`w-full`), bez klas palety. `PasswordToggle` na `text-muted-foreground` z hoverem `text-foreground`, polskie `aria-label` „Pokaż hasło” / „Ukryj hasło”.

**Contract**: API komponentów bez zmian w tej fazie (stany w fazie 4).

#### 5. Formularze

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Polskie etykiety, placeholdery, walidacja i przyciski; podpowiedź długości hasła z polską odmianą.

**Contract**:

- etykiety: „E-mail”, „Hasło”, „Powtórz hasło”;
- placeholdery: „ty@przyklad.pl”, „Twoje hasło” / „Co najmniej 6 znaków”, „Wpisz hasło jeszcze raz”;
- walidacja: „Podaj adres e-mail”, „Podaj poprawny adres e-mail”, „Podaj hasło”, „Hasło musi mieć co najmniej 6 znaków”, „Powtórz hasło”, „Hasła się różnią”;
- podpowiedź: „Jeszcze N znak/znaki/znaków” (1 znak, 2–4 znaki, 5 znaków);
- przyciski: „Zaloguj się”, „Załóż konto” (teksty stanu wysyłania w fazie 4).

#### 6. Testy E2E

**Files**: `tests/e2e/auth.setup.ts`, `tests/e2e/seed.spec.ts`

**Intent**: Selektory za nowymi nazwami: `getByLabel("E-mail")`, `getByLabel("Hasło", { exact: true })` (exact, bo „Pokaż hasło” też pasuje), przycisk „Zaloguj się”, nagłówek „Zaloguj się”.

**Contract**: tylko selektory; logika testów bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Skan plików auth nie zwraca trafień: `grep` z wzorcem `/10x-ui` na `src/pages/auth/*.astro src/components/auth/*` daje pusty wynik

#### Manual Verification:

- `http://localhost:4332/auth/signin`, `/auth/signup`, `/auth/confirm-email` w jasnym motywie, po polsku, z „MamLek” nad kartą (zrzut 1280 i 390 px)
- `http://localhost:4332/auth/signin?error=invalid_credentials` pokazuje polski błąd serwera na tokenach `destructive`
- Testy E2E przechodzą z nowymi selektorami: `npx playwright test` (wymaga lokalnej bazy, zgody koordynatora i `E2E_USERNAME`/`E2E_PASSWORD`; opcjonalne)

**Implementation Note**: Po bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka, zanim przejdziesz dalej.

---

## Phase 4: Stany i bramka wizualna (C5)

### Overview

Wszystkie 7 stanów formularzy działa i jest widocznych: przycisk pokazuje wysyłanie i się blokuje, fokus z klawiatury jest widoczny na każdej kontrolce, błędy są powiązane z polem dla czytników ekranu. Testy komponentów pilnują tych zachowań, a zrzuty 1280 i 390 px są bramką wizualną. Wymaga fazy 3.

### Changes Required:

#### 1. Wysyłanie i blokada

**Files**: `src/components/auth/SubmitButton.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Formularz ustawia `submitting` po udanej walidacji i przekazuje go do przycisku; przycisk jest wtedy `disabled`, pokazuje spinner (ikona `Loader2` z `animate-spin`) i tekst „Logowanie…” / „Zakładanie konta…”, bez skoku szerokości. Stan wraca do `false` na `pageshow` z `persisted`. `useFormStatus` znika.

**Contract**: `SubmitButton` props `pending: boolean`, `pendingText: string`, `children`; bez `icon` i bez `useFormStatus`.

#### 2. Błędy dostępne dla czytników

**Files**: `src/components/auth/FormField.tsx`, `src/components/auth/FieldError.tsx` (nowy), `src/components/auth/ServerError.tsx`

**Intent**: Błąd pola ma własne `id`, pole dostaje `aria-invalid` i `aria-describedby` wskazujące błąd (albo podpowiedź). `FieldError` to tekst `text-destructive` z ikoną, wzorowany na `InlineError` z `kit-fields.tsx`. `ServerError` ma `role="alert"`.

**Contract**: `FieldError({ id, children })`; id błędu pola = `${id}-error`, podpowiedzi = `${id}-hint`.

#### 3. Fokus

**Files**: `src/components/auth/PasswordToggle.tsx`, `src/components/auth/AuthShell.astro` (linki dostają fokus z `buttonVariants`)

**Intent**: Przełącznik hasła ma widoczny pierścień `focus-visible` na tokenie `ring`, jak `Button`; pola i przyciski biorą fokus z `ui/input` i `ui/button`. Kolejność Tab: e-mail → hasło → przełącznik → (powtórz hasło → przełącznik) → przycisk → link.

**Contract**: przełącznik bierze styl fokusu z `buttonVariants({ variant: "ghost", size: "icon" })` (ten sam pierścień `ring` co `ui/button`), bez własnych wartości arbitralnych w px w widoku.

#### 4. Testy komponentów

**Files**: `src/components/auth/SignInForm.test.tsx`, `src/components/auth/SignUpForm.test.tsx` (nowe, projekt `component`, jsdom)

**Intent**: Pilnują polskich komunikatów walidacji, powiązania błędu z polem, stanu wysyłania i jego zerowania z bfcache, `role="alert"` błędu serwera i odmiany podpowiedzi.

**Contract**: przypadki:

- pusty submit → „Podaj adres e-mail” i „Podaj hasło”, pola z `aria-invalid="true"` i `aria-describedby` wskazującym tekst błędu, submit przerwany (`defaultPrevented`);
- poprawny submit → przycisk `disabled` z tekstem „Logowanie…” / „Zakładanie konta…”;
- zdarzenie `pageshow` z `persisted: true` → przycisk znów aktywny;
- `serverError` → element `role="alert"` z tekstem;
- signup: hasło 5 znaków → „Jeszcze 1 znak”, 3 znaki → „Jeszcze 3 znaki”, 1 znak → „Jeszcze 5 znaków”; różne hasła → „Hasła się różnią”;
- przełącznik hasła zmienia `aria-label` z „Pokaż hasło” na „Ukryj hasło”.

#### 5. Bramka wizualna

**File**: brak zmian w kodzie; wynik w `## Progress` i raporcie fazy

**Intent**: Zrzuty 1280 i 390 px każdego stanu na `http://localhost:4332` bez bazy. Stany: default (signin, signup, confirm-email), hover (przycisk, link), focus-visible (Tab po polach, przełączniku, przycisku, linku), disabled + loading (po poprawnym submit; przy niedziałającym Supabase odpowiedź przychodzi z opóźnieniem, albo stan wymuszony w DevTools), error klienta (pusty submit), error serwera (`?error=invalid_credentials`), baner (bez `SUPABASE_*`), empty = N/A (formularz nie ma danych do wyświetlenia; najbliższy odpowiednik to `confirm-email` otwarte bez rejestracji, z neutralną treścią).

**Contract**: zrzuty w `.ui-shots/auth-screens-ui/<stan>-<szerokość>.png` (folder jak w `ui:shots`, poza repo).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą, w tym nowe `SignInForm.test.tsx` i `SignUpForm.test.tsx`: `npm test`
- Skan plików auth nie zwraca trafień: `grep` z wzorcem `/10x-ui` na `src/pages/auth/*.astro src/components/auth/*` daje pusty wynik

#### Manual Verification:

- Zrzuty 1280 i 390 px wszystkich stanów macierzy (default, hover, focus-visible, disabled, error, empty N/A, loading) obejrzane i opisane w raporcie fazy
- Fokus z klawiatury widoczny na każdej kontrolce, w tym na przełączniku hasła i linku pod formularzem
- Czytnik ekranu (albo drzewo dostępności w DevTools) odczytuje błąd pola razem z etykietą

**Implementation Note**: Po bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka, zanim przejdziesz dalej.

---

## Phase 5: Strażnik — reguła i kontrola

### Overview

Następny agent nie może wrócić do literałów na ekranach auth: pliki trafiają do `GUARDED`, martwe `bg-cosmic` znika, a `AGENTS.md` opisuje nowe zachowanie wejść i nowe testy. Przed edycją `ui-scan.mjs`, `global.css` i `AGENTS.md` zgłoszenie koordynatorowi (S-16 też dopisuje do `GUARDED`, S-08 i S-16 zmieniają `AGENTS.md`). Wymaga faz 1–4.

### Changes Required:

#### 1. Lista strażnika

**File**: `scripts/ui-scan.mjs`

**Intent**: Dopisać do `GUARDED` widoki oczyszczone tą zmianą.

**Contract**: nowe pozycje: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/components/auth/AuthShell.astro`, `src/components/auth/FormField.tsx`, `src/components/auth/FieldError.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/Banner.astro`, `src/layouts/Layout.astro`.

#### 2. Martwe narzędzie tła

**File**: `src/styles/global.css`

**Intent**: Usunąć `@utility bg-cosmic` (po fazie 3 nikt go nie używa; `ui-scan` i tak go zakazuje).

**Contract**: blok `@utility bg-cosmic { … }` (`global.css:128-130`) znika; tokeny bez zmian.

#### 3. Reguły dla agentów

**File**: `AGENTS.md`

**Intent**: Sekcja „Auth flow” opisuje przekierowanie zalogowanego z `/auth/signin|signup`, decyzję `signup.ts` po sesji i jedną treść `confirm-email`; opis `npm test` wymienia testy formularzy auth; opis `npm run smoke` / `test:api` nie mówi już o przekierowaniu na `confirm-email` po rejestracji, jeśli o nim wspomina.

**Contract**: tylko sekcje „Auth flow” i „Command tripwires” (`npm test`); po angielsku.

### Success Criteria:

#### Automated Verification:

- Strażnik przechodzi na całej liście: `npm run ui:scan` (kod wyjścia 0)
- Brak użyć `bg-cosmic` w `src/`: `grep -rn "bg-cosmic" src` zwraca pusty wynik
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Tymczasowe dopisanie `text-purple-300` do `src/components/auth/SignInForm.tsx` sprawia, że `npm run ui:scan` kończy się kodem 1 z trafieniem w tym pliku (potem cofnięte)

**Implementation Note**: Po bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka, zanim przejdziesz dalej.

---

## Testing Strategy

### Unit Tests:

- Komponenty formularzy (`SignInForm.test.tsx`, `SignUpForm.test.tsx`, projekt `component`): walidacja po polsku, `aria-invalid`/`aria-describedby`, stan wysyłania i jego zerowanie z bfcache, `role="alert"`, odmiana podpowiedzi, `aria-label` przełącznika.

### Integration Tests:

- `npm run smoke`: rejestracja → `/szukaj`, nowy krok `GET /auth/signin` z sesją → `/szukaj` (CI job `smoke`).
- `npm run test:api`: helper rejestracji z nowym adresem (CI job `smoke`).
- E2E (`tests/e2e/`, ręcznie): logowanie przez formularz z polskimi selektorami, anonimowy na `/szukaj` → nagłówek „Zaloguj się”.

### Manual Testing Steps:

1. Bez `.dev.vars`: `http://localhost:4332/auth/signin` — baner na tokenach, link do README MamLek.
2. Z `.dev.vars`: `http://localhost:4332/auth/signin`, `/auth/signup`, `/auth/confirm-email` — jasny motyw, polskie teksty, tytuły kart z „ · MamLek”.
3. Pusty submit na obu formularzach — polskie błędy przy polach; Tab po wszystkich kontrolkach — widoczny fokus.
4. `http://localhost:4332/auth/signin?error=invalid_credentials` — polski błąd serwera.
5. Z lokalną bazą (za zgodą koordynatora): rejestracja → `/szukaj`; zalogowany na `/auth/signin` → `/szukaj`.

## Performance Considerations

Brak istotnych: zmiany klas i tekstów, jedno porównanie ścieżki w middleware, które i tak już sprawdza sesję na każdym żądaniu.

## Migration Notes

Bez migracji bazy. Zmiana kontraktu przekierowania po rejestracji dotyczy tylko kont tworzonych z sesją (lokalnie i przy wyłączonym potwierdzaniu w chmurze). Wycofanie: revert commitów fazy 1 przywraca stałe `/auth/confirm-email`.

## References

- Research: `context/changes/auth-screens-ui/research.md`
- Roadmapa: `context/foundation/roadmap.md`, S-15
- Wzorzec widoku na tokenach: `src/pages/szukaj.astro`, `src/components/kit/kit-fields.tsx`
- Poprzednia zmiana tokenów: `context/archive/2026-10-07-search-view-tokens/plan.md:57-69`
- Koordynacja: `C:/Users/MiG/10xdevs/vsc_projects/mamlek/.claude/worktrees/COORDINATION.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wejścia i przekierowania (C4)

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Typy przechodzą: `npx astro check`
- [x] 1.3 Testy jednostkowe i komponentów przechodzą: `npm test`
- [x] 1.4 Smoke przechodzi lokalnie, z nowym krokiem przekierowania zalogowanego: `npm run smoke`
- [ ] 1.5 Testy API przechodzą: `npm run test:api`

#### Manual

- [x] 1.6 Zalogowany na `/auth/signin` i `/auth/signup` ląduje na `/szukaj`
- [x] 1.7 Rejestracja nowego konta kończy się na `/szukaj` bez drugiego logowania
- [ ] 1.8 Po deployu: rejestracja na produkcji kończy się na `/auth/confirm-email`

### Phase 2: Rama aplikacji — tytuł, baner, link (C1/C3)

#### Automated

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Typy przechodzą: `npx astro check`
- [ ] 2.3 Testy przechodzą: `npm test`
- [ ] 2.4 Skan `Banner.astro` nie zwraca trafień

#### Manual

- [ ] 2.5 Baner bez `SUPABASE_*` na tokenach, link otwiera README MamLek w sekcji „Getting started”
- [ ] 2.6 Karty przeglądarki na `/auth/signin` i `/szukaj` mają tytuł z „ · MamLek”

### Phase 3: Widoki auth na tokenach i komponentach (C1/C2/C3)

#### Automated

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Typy przechodzą: `npx astro check`
- [ ] 3.3 Testy przechodzą: `npm test`
- [ ] 3.4 Skan plików auth nie zwraca trafień

#### Manual

- [ ] 3.5 Trzy ekrany auth w jasnym motywie, po polsku, z „MamLek” nad kartą (zrzut 1280 i 390 px)
- [ ] 3.6 `?error=invalid_credentials` pokazuje polski błąd serwera na tokenach `destructive`
- [ ] 3.7 Testy E2E przechodzą z nowymi selektorami (opcjonalne)

### Phase 4: Stany i bramka wizualna (C5)

#### Automated

- [ ] 4.1 Lint przechodzi: `npm run lint`
- [ ] 4.2 Typy przechodzą: `npx astro check`
- [ ] 4.3 Testy przechodzą, w tym nowe `SignInForm.test.tsx` i `SignUpForm.test.tsx`: `npm test`
- [ ] 4.4 Skan plików auth nie zwraca trafień

#### Manual

- [ ] 4.5 Zrzuty 1280 i 390 px wszystkich stanów macierzy obejrzane i opisane w raporcie fazy
- [ ] 4.6 Fokus z klawiatury widoczny na każdej kontrolce, w tym na przełączniku hasła i linku
- [ ] 4.7 Czytnik ekranu (albo drzewo dostępności) odczytuje błąd pola razem z etykietą

### Phase 5: Strażnik — reguła i kontrola

#### Automated

- [ ] 5.1 Strażnik przechodzi na całej liście: `npm run ui:scan`
- [ ] 5.2 Brak użyć `bg-cosmic` w `src/`
- [ ] 5.3 Lint przechodzi: `npm run lint`
- [ ] 5.4 Typy przechodzą: `npx astro check`
- [ ] 5.5 Testy przechodzą: `npm test`
- [ ] 5.6 Build przechodzi: `npm run build`

#### Manual

- [ ] 5.7 Celowy literał palety w `SignInForm.tsx` sprawia, że `npm run ui:scan` kończy się kodem 1 (potem cofnięty)
