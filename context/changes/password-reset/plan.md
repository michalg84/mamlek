# Reset zapomnianego hasła — Implementation Plan

## Overview

Wycinek S-19 z roadmapy (`password-reset`, PRD: MS-01, FR-013, Access Control, Open Question 6): użytkownik, który zapomniał hasła, prosi na ekranie logowania o link e-mail, ustawia nowe hasło zgodne z regułą z S-18 i od razu jest w aplikacji. Nie musi pisać do autora. Odpowiedź na prośbę o link jest taka sama dla adresu z kontem i bez konta.

## Current State Analysis

- Nie ma żadnej drogi odzyskania konta: w `src/pages/auth/` są tylko `signin`, `signup` i `confirm-email`, a w `src/pages/api/auth/` — `signin`, `signup`, `signout` i `password` (zmiana hasła wymaga obecnego hasła).
- Supabase jest używany wyłącznie po stronie serwera, z kluczem publishable i sesją w cookie (`src/lib/supabase.ts:6-25`). Nie ma klienta w przeglądarce ani katalogu `supabase/templates/`.
- Reguła hasła jest gotowa: `passwordProblem(password, email)` w `src/lib/services/password-check.ts` (serwer) i `src/lib/password-policy.ts` (formularze).
- Middleware kieruje użytkownika z wymuszoną zmianą hasła na `/konto/haslo`, poza trzema ścieżkami z `PASSWORD_CHANGE_PATHS` (`src/middleware.ts:11`).
- `supabase/config.toml`: `site_url = "http://127.0.0.1:3000"` (aplikacja działa na porcie 4321), `sign_in_sign_ups = 30`, `otp_expiry = 3600`, szablony e-maili zakomentowane.
- CI uruchamia lokalny Supabase bez Mailpit (`.github/workflows/ci.yml:48`), więc dziś nie da się tam odczytać wysłanego maila.
- PRD wymienia reset hasła w Non-Goals (`context/foundation/prd.md:363`).
- Produkcja korzysta z wbudowanej poczty Supabase: kilka wiadomości na godzinę, tylko do członków zespołu projektu, a nowe darmowe projekty (od 3 czerwca 2026) bez własnego SMTP nie mogą edytować szablonów.

## Desired End State

- Na `/auth/signin` jest link „Nie pamiętasz hasła?”. Po podaniu adresu na `/auth/forgot-password` użytkownik widzi zawsze to samo „Sprawdź skrzynkę”, a posiadacz konta dostaje polski mail z linkiem ważnym godzinę.
- Link działa na dowolnym urządzeniu. Samo otwarcie go nie zużywa. Po zapisaniu nowego hasła użytkownik jest zalogowany na `/szukaj`, pozostałe sesje konta są zakończone, a na skrzynkę przychodzi polskie powiadomienie o zmianie hasła.
- Hasło niezgodne z regułą nie zużywa linku, gdy da się to sprawdzić przed jego zużyciem. Jeśli zapis nie uda się już po zużyciu linku, użytkownik zostaje na formularzu i może spróbować ponownie przez 15 minut.
- Sesja odzyskiwania nie daje dostępu do apteczki ani wyszukiwarki, dopóki nowe hasło nie zostanie zapisane.
- Produkcja ma własny SMTP, polskie szablony i przeszła reset na koncie autora.

Weryfikacja: `npm test`, `npm run test:api` (cały przepływ na lokalnym Supabase z Mailpit), `npm run smoke`, kontrole ręczne lokalnie i na produkcji.

### Key Discoveries:

Sprawdzone doświadczalnie na lokalnym stosie 2026-11-26:

- `resetPasswordForEmail` dla istniejącego konta przy drugiej prośbie pod rząd zwraca 429 `over_email_send_rate_limit`, dla nieistniejącego — sukces. Przekazanie tego błędu użytkownikowi zdradzałoby, które adresy mają konto.
- `verifyOtp({ type: "recovery", token_hash })` działa na serwerze bez wcześniejszego stanu w przeglądarce. Token zużyty, starszy (po nowej prośbie) albo zmyślony daje 403 `otp_expired`.
- Prośba wysłana przez bezstanowego klienta `@supabase/supabase-js` (`persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`) nie ustawia cookie i daje token bez PKCE. Klient SSR wymusza PKCE i zapisałby cookie z code verifier.
- Klient SSR z `cookieOptions.name: "mamlek-recovery"` zapisuje sesję tylko w tym cookie (ok. 3085 znaków, blisko podziału na `.0` / `.1`); zwykły klient nie widzi wtedy użytkownika.
- Po nieudanym `updateUser` (422 `same_password`, `weak_password`) sesja odzyskiwania pozostaje ważna.
- Przeniesienie sesji działa: `updateUser` → `signOut({ scope: "others" })` → `getSession` na kliencie odzyskiwania → `setSession` na zwykłym kliencie. Następne żądanie ma użytkownika, `amr` zachowuje czas logowania (limit 90 dni w middleware działa), drugie urządzenie dostaje `refresh_token_not_found`.

Z kodu bibliotek i repozytorium:

- Magazyn serwerowy `@supabase/ssr` 0.12.7 czyta najpierw z pamięci to, co zapisał w tym samym żądaniu, więc `verifyOtp` i `updateUser` na jednym kliencie działają, choć nagłówek `Cookie` żądania jest stary.
- `@supabase/ssr` ignoruje `cookieOptions.maxAge`, więc czas życia cookie trzeba narzucić w `setAll` (tak jak w `src/lib/supabase.ts:16-21`).
- Astro ma domyślnie włączone `security.checkOrigin`; `Referrer-Policy: no-referrer` wysłałoby `Origin: null` przy POST z formularza.
- Ścieżki `content_path` dla szablonów i powiadomień w `config.toml` podane od katalogu projektu (`./supabase/templates/…`) działają dla obu sekcji.
- Pomocnik testów API: `send` nie udostępnia nagłówków odpowiedzi, a `storeCookies` usuwa cookie tylko przy `Max-Age=0` (`tests/api/helpers.ts:22-66`).

## What We're NOT Doing

- Wyrównywanie czasu odpowiedzi na prośbę o link (czas może zdradzać, czy mail został wysłany).
- CAPTCHA i dodatkowa ochrona limitu e-maili przed nadużyciem.
- Zmiana komunikatu rejestracji o istniejącym koncie (przy wyłączonym potwierdzaniu e-maili rejestracja i tak go ujawnia).
- Ochrona przed tym, że ktoś podsunie innej osobie link do własnego konta (login CSRF).
- Ukrywanie tokenu z URL w logach Cloudflare (jest jednorazowy i ważny godzinę).
- Link do resetu na `/konto/haslo`.
- Wybór dostawcy SMTP w kodzie — aplikacja nie zależy od dostawcy; konfiguruje się go w panelu Supabase.
- Usuwanie konta (S-20).
- Zmiany w bazie danych — brak migracji.

## Implementation Approach

Całość po stronie serwera, bez klienta Supabase w przeglądarce, w istniejącym wzorcu „formularz → endpoint → przekierowanie z `?error=` / `?…=1`”.

1. Prośba o link idzie przez bezstanowego klienta i zawsze kończy się neutralną odpowiedzią.
2. Mail prowadzi na `/auth/reset-password?token_hash=…`. GET tylko pokazuje formularz, więc skanery poczty nie zużyją linku.
3. POST sprawdza hasło, dopiero potem zużywa token. Sesja z tokenu trafia do osobnego, krótkiego cookie, którego middleware nie zna.
4. Po zapisaniu hasła sesja odzyskiwania staje się zwykłą sesją, a cookie odzyskiwania jest czyszczone.

Kolejność: fazy 1 → 2 → 3 po kolei. Dokumentację z fazy 4 można pisać równolegle z fazą 3 (rozłączne pliki); bramki, staging i commity zawsze po kolei.

## Critical Implementation Details

- **State sequencing** — po przeniesieniu sesji nigdy nie wywołuj `signOut` na kliencie odzyskiwania: unieważniłby sesję, która stała się zwykłą. Cookie odzyskiwania usuwa się przez wygaszenie (`maxAge: 0`) wszystkich jego nazw, także kawałków `.0` / `.1` i tych zapisanych w tej samej odpowiedzi.
- **Świadomy wyjątek od reguły „nie zamieniaj błędów w przekierowania”** — `forgot-password` odpowiada sukcesem także przy limicie e-maili i błędzie wysyłki, bo inaczej zdradza istnienie konta. Przyczyna zawsze trafia do `console.error`; komentarz w kodzie i AGENTS.md to opisują.
- **Debug & observability** — token i hasło nigdy nie trafiają do logów.

---

## Phase 1: Poczta i konfiguracja

### Overview

Lokalny Supabase wysyła polskie maile z właściwym linkiem, a CI potrafi je odczytać.

### Changes Required:

#### 1. Konfiguracja lokalnego Supabase

**File**: `supabase/config.toml`

**Intent**: Wskazać adres aplikacji w linkach, włączyć polski szablon resetu i powiadomienie o zmianie hasła, zrobić miejsce na nowe testy w limicie logowań.

**Contract**: `site_url = "http://localhost:4321"` i zgodne `additional_redirect_urls`; `[auth.rate_limit] sign_in_sign_ups = 60` i `email_sent = 100` (komentarz: tylko lokalnie i w CI, które instaluje najnowsze CLI — 2.117 tego limitu przy Mailpit nie liczy, nowsze może; produkcja ustawia limit w panelu); `[auth.email.template.recovery]` z polskim tematem i `content_path = "./supabase/templates/recovery.html"`; włączone `[auth.email.notification.password_changed]` z polskim tematem i `content_path = "./supabase/templates/password_changed_notification.html"`.

#### 2. Szablony e-maili

**File**: `supabase/templates/recovery.html`, `supabase/templates/password_changed_notification.html`

**Intent**: Krótkie polskie maile (nowy katalog). Pierwszy daje link do ustawienia hasła, mówi, że jest ważny godzinę i że można go zignorować, jeśli to nie ty. Drugi informuje o zmianie hasła i mówi, co zrobić, jeśli to nie ty.

**Contract**: Link w mailu resetu to `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}` (nie `{{ .ConfirmationURL }}`). Powiadomienie nie zawiera linków akcji. Zwykły HTML bez zewnętrznych zasobów. Aneks (uwaga z kontroli 1.5): oba maile mają wspólny układ — logo złożone z tekstu i tabel (bez obrazków), kolory aplikacji, karta z treścią i stopka z adresem `{{ .SiteURL }}` (link do strony głównej nie jest linkiem akcji); mail resetu ma przycisk i ten sam link jako tekst do skopiowania. Logo (krzyżyk i napis) jest tymczasowe i niezatwierdzone przez autora — finalne logo to osobna zmiana.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać Mailpit w jobie `smoke`, żeby test API mógł czytać maile.

**Contract**: Usunąć `mailpit` z listy `supabase start -x`. Nazwy jobów bez zmian (ruleset).

### Success Criteria:

#### Automated Verification:

- Lokalny stos startuje z nową konfiguracją po `npx supabase stop` i `npx supabase start` (dane zostają)
- Mail resetu w Mailpit (wywołany przez `POST /auth/v1/recover` lokalnego API) ma polski temat i link `http://localhost:4321/auth/reset-password?token_hash=…`
- Po zmianie hasła konta testowego Mailpit dostaje polskie powiadomienie
- `npm run smoke` i `npm run test:api` przechodzą na działającym serwerze

#### Manual Verification:

- Oba maile w Mailpit (http://127.0.0.1:54324) czytają się dobrze po polsku

**Implementation Note**: Jeśli któryś szablon nie jest użyty przez lokalne CLI, napraw konfigurację w tej fazie — fazy 2 i 3 na niej stoją. Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie kontroli ręcznych.

---

## Phase 2: Serwer

### Overview

Dwa endpointy, sesja odzyskiwania w osobnym cookie, kody błędów i wyjątek w middleware, z testami jednostkowymi i testem całego przepływu przez HTTP.

### Changes Required:

#### 1. Klienci Supabase

**File**: `src/lib/supabase.ts`

**Intent**: Obok zwykłego klienta dodać bezstanowego (prośba o link) i klienta sesji odzyskiwania z własnym cookie.

**Contract**:

- `createStatelessClient()` — `createClient` z `@supabase/supabase-js` z `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`; bez `redirectTo`; `null` bez zmiennych środowiskowych.
- `createRecoveryClient(request, cookies)` — `createServerClient` z `cookieOptions.name: "mamlek-recovery"`; zwraca klienta i funkcję wygaszającą cookie; `null` bez zmiennych środowiskowych. `setAll` narzuca: `maxAge` 900 s (usunięcie z `maxAge: 0` zostaje), `httpOnly: true`, `secure` przy żądaniu `https`, `path: "/"` (cookie potrzebne pod `/auth` i `/api/auth`), `sameSite: "lax"`.
- Funkcja wygaszająca obejmuje nazwy obecne w żądaniu i zapisane w tym żądaniu.
- Zwykły `createClient` bez zmian w zachowaniu.

#### 2. Czysta logika resetu

**File**: `src/lib/password-reset.ts`, `src/lib/password-reset.test.ts`

**Intent**: Wydzielić dwie decyzje, które łatwo zepsuć, i sprawdzić je testami bez sieci.

**Contract**:

- Wynik prośby o link: kod błędu tylko wtedy, gdy serwer auth jest nieosiągalny (`status` 0 albo brak → `unknown`) albo przekroczony limit żądań (`over_request_rate_limit`). Wszystko inne, w tym 429 limitu e-maili i 5xx, daje odpowiedź neutralną.
- Stan strony resetu z danych: parametr `error`, `token_hash`, wynik odczytu sesji odzyskiwania (użytkownik z e-mailem / brak / awaria). Reguły w tej kolejności: `error=otp_expired` → „link nieważny” (nawet przy ważnym cookie); jest token → formularz z tokenem; ważne cookie → formularz z e-mailem konta; awaria odczytu → „chwilowo niedostępne”, nigdy „link wygasł”; w pozostałych przypadkach „link nieważny”.

#### 3. Prośba o link

**File**: `src/pages/api/auth/forgot-password.ts`

**Intent**: Przyjąć adres i poprosić Supabase o mail, nie zdradzając, czy konto istnieje.

**Contract**: `POST`; `readForm` i zod (`astro/zod`) dla `email` → przy błędzie `?error=validation_failed`; brak konfiguracji → `?error=not_configured`; `resetPasswordForEmail` na bezstanowym kliencie; każdy błąd logowany z przyczyną. Przekierowanie na `/auth/forgot-password?wyslano=1` albo `?error=<kod>`.

#### 4. Ustawienie nowego hasła

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Sprawdzić hasło, zużyć link, zapisać hasło, zakończyć inne sesje i zalogować użytkownika.

**Contract**: `POST` z polami `token_hash` (opcjonalne), `password`, `confirm`. Kolejność:

1. Odczyt i zod; brak konfiguracji → `not_configured`.
2. `password_mismatch` i `passwordProblem(password, "")` — przed zużyciem tokenu.
3. Jeśli jest `token_hash`, liczy się tylko on: `verifyOtp` na kliencie odzyskiwania, bez zastępowania go cookie (wspólna przeglądarka). Bez tokenu: `getUser` z cookie odzyskiwania; brak lub odrzucona sesja → `otp_expired`, awaria (`sessionCheckFailure` = `outage`) → `unknown`.
4. `passwordProblem(password, user.email)`.
5. `updateUser({ password, data: { password_change_required: false } })`.
6. `signOut({ scope: "others" })` na kliencie odzyskiwania — porażka tylko logowana.
7. `getSession` na kliencie odzyskiwania → `setSession` na zwykłym kliencie → wygaszenie cookie odzyskiwania → `/szukaj`. Gdy przeniesienie się nie uda: wygaszenie cookie i `/auth/signin?error=password_changed_signin_failed`.

Przekierowania błędów na `/auth/reset-password`: przed zużyciem tokenu (oraz błędy `verifyOtp` inne niż `otp_expired`) URL zachowuje `token_hash`; `otp_expired` go usuwa; po zużyciu nigdy nie ma tokenu w URL (stan trzyma cookie). Wartości w query są kodowane.

Każdy błąd Supabase (`verifyOtp`, `getUser`, `updateUser`, `signOut`, `getSession`, `setSession`) trafia do `console.error` z kodem i przyczyną, zanim nastąpi przekierowanie z `?error=` (jak w `password.ts`); token i hasło nigdy nie trafiają do logu.

#### 5. Kody błędów

**File**: `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`

**Intent**: Dwa nowe komunikaty.

**Contract**: `otp_expired`: „Link do ustawienia hasła wygasł lub został już użyty. Poproś o nowy.”; `password_changed_signin_failed`: „Hasło zostało zmienione, ale nie udało się zalogować. Zaloguj się nowym hasłem.” Testy komunikatów i listy kodów uzupełnione.

#### 6. Middleware

**File**: `src/middleware.ts`

**Intent**: Użytkownik z wymuszoną zmianą hasła też może zresetować zapomniane hasło.

**Contract**: Dodać `/auth/forgot-password`, `/auth/reset-password`, `/api/auth/forgot-password`, `/api/auth/reset-password` do `PASSWORD_CHANGE_PATHS` i poprawić komentarz. Nowe ścieżki nie są chronione i nie przekierowują zalogowanych.

#### 7. Test przepływu przez HTTP

**File**: `tests/api/auth-reset.test.ts`, `tests/api/helpers.ts`

**Intent**: Sprawdzić cały przepływ czarnoskrzynkowo, z mailem odczytanym z Mailpit.

**Contract**:

- Pomocnik: `send` udostępnia nagłówki odpowiedzi (lub listę `Set-Cookie`); odczyt Mailpit przez `MAILPIT_URL` (domyślnie `http://127.0.0.1:54324`, tylko lokalny; `GET /api/v1/search?query=to:<adres>`, `GET /api/v1/message/<ID>`). Z linku w mailu używane są tylko ścieżka i query, na `API_BASE_URL`.
- Przypadki: identyczne przekierowanie dla konta (dwie prośby pod rząd) i adresu bez konta; prośba nie ustawia cookie sesji; niezgodne i słabe hasło nie zużywają tokenu; hasło równe e-mailowi po zużyciu → brak tokenu w przekierowaniu, cookie odzyskiwania `httpOnly` z `Max-Age` ≤ 900; samo cookie odzyskiwania nie otwiera `/szukaj`; ponowna próba tylko z cookie → `/szukaj`, zwykłe cookie sesji ustawione, wszystkie cookie odzyskiwania wygaszone; druga sesja zakończona; stare hasło nie działa, nowe działa; konto z wymuszoną zmianą (`setWeakPassword`) może zresetować hasło i traci znacznik; zużyty token → `otp_expired`; POST z obcym `Origin` → 403; przychodzi mail z powiadomieniem.
- Budżet: ok. 3 rejestracje i 5 logowań oraz ok. 5 maili resetu i 2 powiadomienia na przebieg (mieści się w `email_sent = 100`); między prośbami o mail dla tego samego konta więcej niż 1 s (`max_frequency`).

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi, w tym `password-reset.test.ts` i uzupełniony `auth-errors.test.ts`
- `npm run lint` i `npx astro check` bez błędów
- `npm run build` przechodzi
- `npm run test:api` przechodzi razem z `tests/api/auth-reset.test.ts`
- `npm run smoke` przechodzi

**Implementation Note**: Faza nie ma kontroli ręcznych — ekrany powstają w fazie 3.

---

## Phase 3: Widoki

### Overview

Dwie strony po polsku, dwa formularze i link na ekranie logowania.

### Changes Required:

#### 1. Prośba o link

**File**: `src/pages/auth/forgot-password.astro`, `src/components/auth/ForgotPasswordForm.tsx`, `src/components/auth/ForgotPasswordForm.test.tsx`

**Intent**: Formularz z adresem e-mail i neutralny stan po wysłaniu, zbudowany na `AuthShell` i wzorcu `SignInForm`.

**Contract**: Walidacja adresu i komunikaty jak w `SignInForm`; natywny `POST` na `/api/auth/forgot-password`. Przy `?wyslano=1` zamiast formularza: tytuł „Sprawdź skrzynkę” i tekst „Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny godzinę.” Link powrotny do logowania; baner braku konfiguracji jak na pozostałych stronach auth. Test: walidacja, `aria-invalid` / `aria-describedby`, stan wysyłania, `role="alert"` błędu z serwera.

#### 2. Nowe hasło

**File**: `src/pages/auth/reset-password.astro`, `src/components/auth/ResetPasswordForm.tsx`, `src/components/auth/ResetPasswordForm.test.tsx`

**Intent**: Pokazać formularz nowego hasła albo stan „link nieważny”, według funkcji stanu z fazy 2.

**Contract**:

- Strona czyta sesję odzyskiwania tylko wtedy, gdy w URL nie ma tokenu; GET nigdy nie wywołuje `verifyOtp`. Awaria odczytu jest logowana.
- Nagłówki: `Referrer-Policy: strict-origin`, `Cache-Control: no-store`.
- Formularz: pola „nowe hasło” i „powtórz”, `autocomplete="new-password"`, `NewPasswordHint`, `PasswordToggle`, reguła długości po stronie klienta jak w `ChangePasswordForm`; ukryte `token_hash` tylko, gdy token był w URL; przy sesji z cookie widać adres konta.
- „Link nieważny”: komunikat i przycisk-link do `/auth/forgot-password`.

#### 3. Link na logowaniu i strażnik UI

**File**: `src/pages/auth/signin.astro`, `scripts/ui-scan.mjs`

**Intent**: Dać drogę do resetu i objąć nowe widoki skanem tokenów.

**Contract**: Link „Nie pamiętasz hasła?” pod formularzem, w stylu `buttonVariants({ variant: "link" })`; cztery nowe pliki na liście `GUARDED`.

#### 4. Test API stron

**File**: `tests/api/auth-reset.test.ts`

**Intent**: Dopisać to, czego bez stron nie dało się sprawdzić.

**Contract**: GET z tokenem pokazuje formularz i nie zużywa tokenu (następny POST działa); nagłówki z punktu 2; `?error=otp_expired` pokazuje stan „link nieważny” z linkiem do `/auth/forgot-password`; użytkownik z wymuszoną zmianą hasła dostaje obie strony zamiast przekierowania.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi z testami obu nowych formularzy
- `npm run ui:scan` przechodzi z nowymi widokami na liście
- `npm run lint`, `npx astro check` i `npm run build` przechodzą
- `npm run test:api` przechodzi z przypadkami stron

#### Manual Verification:

- Z http://localhost:4321/auth/signin link prowadzi do formularza, a „Sprawdź skrzynkę” wygląda tak samo dla adresu z kontem i bez
- Link z maila (http://127.0.0.1:54324) otwiera formularz, a po zapisaniu hasła jesteś zalogowany na http://localhost:4321/szukaj
- Zużyty link po wysłaniu formularza pokazuje „link wygasł” i prowadzi do prośby o nowy
- Po błędzie po zużyciu linku (nowe hasło takie jak stare) zostajesz na formularzu i druga próba się udaje
- Nowe ekrany są czytelne przy szerokości 390 px i dają się obsłużyć klawiaturą

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie kontroli ręcznych.

---

## Phase 4: Dokumentacja i wdrożenie

### Overview

Dokumenty mówią prawdę o resecie, produkcja jest skonfigurowana przed merge, a reset sprawdzony na produkcji.

### Changes Required:

#### 1. PRD i plan testów

**File**: `context/foundation/prd.md`, `context/foundation/test-plan.md`

**Intent**: Zdjąć reset z Non-Goals i opisać go jako wymaganie; zaktualizować opis limitu logowań.

**Contract**: Usunięty punkt „Reset hasła” z Non-Goals; nowe FR-017 pod „Konto” (reset przez link e-mail, neutralna odpowiedź); Access Control uzupełnione; w Open Questions nota przy OQ2 oraz skreślone w OQ6 reset hasła i SMTP. W `test-plan.md` akapit o limicie logowań zgodny z nowym limitem i liczbą kont.

#### 2. README

**File**: `README.md`

**Intent**: Instrukcja konfiguracji produkcji i lokalnego odczytu maili (po angielsku).

**Contract**: Przy wdrożeniu: custom SMTP (zwykle wymaga własnej domeny), Site URL bez końcowego ukośnika, treść obu szablonów z `supabase/templates/` i włączenie powiadomienia, limity e-maili, Email OTP Expiration = 3600 s (tekst maila i strony obiecuje godzinę), sprawdzenie `secure_password_change` (sesja odzyskiwania jest świeża). Wyraźnie: **panel konfiguruje się przed merge**. Lokalnie: Mailpit i wymóg dla `test:api`.

#### 3. Reguły dla agentów

**File**: `AGENTS.md`

**Intent**: Opisać nowe ścieżki i pułapki, żeby następna zmiana ich nie zepsuła (po angielsku).

**Contract**: „Auth flow”: dwie strony, dwa endpointy, bezstanowy klient, cookie `mamlek-recovery` (ograniczenie na poziomie aplikacji, nie granica bezpieczeństwa), neutralna odpowiedź jako świadomy wyjątek, kolejność przeniesienia sesji, wyjątki w middleware. Nowy punkt rollout: konfiguracja panelu **przed** merge — odwrotnie niż w S-18, bo domyślny szablon z `{{ .ConfirmationURL }}` prowadzi na `/`, które gubi parametry. W „Command tripwires”: nowy test API, Mailpit, nowy budżet logowań i liczba kont.

#### 4. Wdrożenie

**File**: panel produkcyjnego projektu Supabase (ręcznie, bez zmian w repo)

**Intent**: Własny SMTP i szablony, potem merge i sprawdzenie na produkcji.

**Contract**: Kolejność: PR otwarty **bez auto-merge** (`/ship-pr` włącza je domyślnie — powiedz mu, że zmergujesz sam, albo uruchom go dopiero po konfiguracji panelu) → zielone `ci` i `smoke` → konfiguracja panelu według README → merge → reset na koncie autora. Dane logowania SMTP i hasła nie trafiają do repo ani do poleceń agenta. Rollback: revert merge i przywrócenie domyślnego szablonu resetu.

### Success Criteria:

#### Automated Verification:

- PRD nie ma resetu hasła w Non-Goals i ma FR-017
- README i AGENTS.md opisują konfigurację panelu przed merge; `npx prettier --check` dla zmienionych plików przechodzi
- Checki `ci` i `smoke` na PR są zielone

#### Manual Verification:

- Produkcyjny projekt Supabase skonfigurowany przed merge: SMTP, Site URL, oba szablony, powiadomienie, limity, ważność linku 3600 s, `secure_password_change`
- Na produkcji reset własnego konta na telefonie działa: mail dochodzi (nie do spamu), link loguje po zapisaniu hasła, przychodzi powiadomienie
- Na produkcji prośba dla adresu bez konta pokazuje ten sam ekran i nie wysyła maila

**Implementation Note**: Kontrole produkcyjne wykonuje autor.

---

## Testing Strategy

### Unit Tests:

- `password-reset.test.ts`: tabela błędów prośby o link (brak błędu, `status` 0, limit żądań, limit e-maili, 500) i wszystkie gałęzie stanu strony, w tym „`otp_expired` wygrywa z cookie” i „awaria to nie wygasły link”.
- `auth-errors.test.ts`: dwa nowe kody.
- Testy komponentów dwóch formularzy.

### Integration Tests:

- `tests/api/auth-reset.test.ts`: cały przepływ przez HTTP z mailem z Mailpit (lista w fazach 2 i 3).

### Manual Testing Steps:

1. http://localhost:4321/auth/signin → „Nie pamiętasz hasła?” → adres konta testowego → „Sprawdź skrzynkę”.
2. http://127.0.0.1:54324 → mail → link → słabe hasło (link dalej działa) → dobre hasło → http://localhost:4321/szukaj.
3. Ten sam link drugi raz → formularz (otwarcie nie sprawdza tokenu) → po wysłaniu „link wygasł”.
4. Druga przeglądarka zalogowana na to konto zostaje wylogowana po resecie.
5. Po wdrożeniu: to samo na produkcji, na telefonie, na koncie autora.

## Performance Considerations

Ustawienie hasła to kilka kolejnych wywołań serwera auth w jednym żądaniu; dzieje się rzadko i nie dotyka `/szukaj` ani apteczki. Odpowiedź na prośbę o link czeka na wysyłkę SMTP.

## Migration Notes

Brak migracji bazy i zmian w istniejących kontach. Zmienia się konfiguracja lokalna (`site_url`, limit logowań) — po pobraniu zmian potrzebne `npx supabase stop` i `npx supabase start`. Produkcja: konfiguracja panelu przed merge (faza 4).

## References

- Roadmapa: S-19 w `context/foundation/roadmap.md`
- PRD: FR-013, Access Control, Open Question 6 w `context/foundation/prd.md`
- Wzorzec endpointu: `src/pages/api/auth/password.ts:10-73`
- Wzorzec formularza: `src/components/auth/ChangePasswordForm.tsx`
- Klient SSR: `src/lib/supabase.ts:6-25`
- Poprzedni wycinek (reguła hasła): `context/archive/2026-11-24-password-policy/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Poczta i konfiguracja

#### Automated

- [x] 1.1 Lokalny stos startuje z nową konfiguracją po `npx supabase stop` i `npx supabase start` (dane zostają) — 19ae3e3
- [x] 1.2 Mail resetu w Mailpit (wywołany przez `POST /auth/v1/recover` lokalnego API) ma polski temat i link `http://localhost:4321/auth/reset-password?token_hash=…` — 19ae3e3
- [x] 1.3 Po zmianie hasła konta testowego Mailpit dostaje polskie powiadomienie — 19ae3e3
- [x] 1.4 `npm run smoke` i `npm run test:api` przechodzą na działającym serwerze — 19ae3e3

#### Manual

- [x] 1.5 Oba maile w Mailpit (http://127.0.0.1:54324) czytają się dobrze po polsku — 19ae3e3

### Phase 2: Serwer

#### Automated

- [x] 2.1 `npm test` przechodzi, w tym `password-reset.test.ts` i uzupełniony `auth-errors.test.ts` — 756198a
- [x] 2.2 `npm run lint` i `npx astro check` bez błędów — 756198a
- [x] 2.3 `npm run build` przechodzi — 756198a
- [x] 2.4 `npm run test:api` przechodzi razem z `tests/api/auth-reset.test.ts` — 756198a
- [x] 2.5 `npm run smoke` przechodzi — 756198a

### Phase 3: Widoki

#### Automated

- [x] 3.1 `npm test` przechodzi z testami obu nowych formularzy
- [x] 3.2 `npm run ui:scan` przechodzi z nowymi widokami na liście
- [x] 3.3 `npm run lint`, `npx astro check` i `npm run build` przechodzą
- [x] 3.4 `npm run test:api` przechodzi z przypadkami stron

#### Manual

- [x] 3.5 Z http://localhost:4321/auth/signin link prowadzi do formularza, a „Sprawdź skrzynkę” wygląda tak samo dla adresu z kontem i bez
- [x] 3.6 Link z maila (http://127.0.0.1:54324) otwiera formularz, a po zapisaniu hasła jesteś zalogowany na http://localhost:4321/szukaj
- [x] 3.7 Zużyty link po wysłaniu formularza pokazuje „link wygasł” i prowadzi do prośby o nowy
- [x] 3.8 Po błędzie po zużyciu linku (nowe hasło takie jak stare) zostajesz na formularzu i druga próba się udaje
- [x] 3.9 Nowe ekrany są czytelne przy szerokości 390 px i dają się obsłużyć klawiaturą

### Phase 4: Dokumentacja i wdrożenie

#### Automated

- [ ] 4.1 PRD nie ma resetu hasła w Non-Goals i ma FR-017
- [ ] 4.2 README i AGENTS.md opisują konfigurację panelu przed merge; `npx prettier --check` dla zmienionych plików przechodzi
- [ ] 4.3 Checki `ci` i `smoke` na PR są zielone

#### Manual

- [ ] 4.4 Produkcyjny projekt Supabase skonfigurowany przed merge: SMTP, Site URL, oba szablony, powiadomienie, limity, ważność linku 3600 s, `secure_password_change`
- [ ] 4.5 Na produkcji reset własnego konta na telefonie działa: mail dochodzi (nie do spamu), link loguje po zapisaniu hasła, przychodzi powiadomienie
- [ ] 4.6 Na produkcji prośba dla adresu bez konta pokazuje ten sam ekran i nie wysyła maila
