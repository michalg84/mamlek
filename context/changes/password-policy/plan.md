# Password policy Implementation Plan

## Overview

Wycinek S-18: hasło zgodne z obecnymi standardami (NIST SP 800-63B-4, OWASP ASVS 5.0 V6.2) przy rejestracji, przy zmianie hasła i na istniejących kontach. Reguła: **co najmniej 12 znaków, bez wymogów składu, bez listy popularnych haseł i bez adresu e-mail jako hasła**. Konto, którego hasło nie spełnia reguły, po zalogowaniu musi je zmienić, zanim wejdzie do aplikacji; każdy zalogowany może też zmienić hasło dobrowolnie. Do tego limity sesji: 30 dni bezczynności i 90 dni od zalogowania.

Pierwotna propozycja autora (wielka litera, cyfra, znak specjalny; w roadmapie „10 znaków + 4 klasy”) została świadomie zastąpiona: NIST 800-63B-4 mówi, że weryfikator „SHALL NOT impose other composition rules”, a ASVS 6.2.5 wymaga, by nie było reguł składu. Autor wybrał 12 znaków + listę (ASVS 6.2.1 dopuszcza minimum 8, zaleca 15; 12 to kompromis dla hasła wpisywanego na telefonie przy okienku w aptece).

## Current State Analysis

- Minimum 6 znaków w trzech miejscach: `src/components/auth/SignUpForm.tsx:9` (`MIN_PASSWORD_LENGTH = 6`, placeholder „Co najmniej 6 znaków”, licznik „Jeszcze N znaków”), `supabase/config.toml:175` (`minimum_password_length = 6`, `password_requirements = ""`) i panel projektu Supabase na produkcji.
- `src/pages/api/auth/signup.ts` i `signin.ts` czytają `form.get(...) as string` bez walidacji (AGENTS.md: trasy auth są sprzed reguły zod). Błąd Supabase → `console.error` + przekierowanie z `?error=${authErrorCode(error)}`.
- `src/lib/auth-errors.ts` ma mapę kodów → komunikatów po polsku; `weak_password` mówi tylko „Użyj dłuższego hasła”.
- `src/middleware.ts` chroni strony z `PROTECTED_ROUTES = ["/szukaj", "/apteczka"]`; trasy `/api/kit*` same sprawdzają `locals.user` i zwracają 401.
- Zmiany i resetu hasła w aplikacji nie ma (PRD Non-Goals). Supabase nie trzyma hasła jawnie, więc słabe hasło istniejącego konta da się wykryć tylko w chwili logowania, na haśle z formularza.
- Sesja nie ma limitu: refresh token bez wygaśnięcia (rotacja włączona, `config.toml:164`), cookie `@supabase/ssr` z `maxAge` 400 dni (`node_modules/@supabase/ssr/dist/module/utils/constants.js:7`). Limity `[auth.sessions]` (`timebox`, `inactivity_timeout`, `config.toml:255-259`) są w hostowanym Supabase płatne (Pro), tak jak ochrona przed wyciekłymi hasłami (HIBP).
- `secure_password_change = false` lokalnie (`config.toml:211`); ustawienia produkcji nie znamy.

## Desired End State

- Rejestracja z hasłem krótszym niż 12 znaków (code pointy), dłuższym niż 72 bajty UTF-8, z listy popularnych haseł (bez względu na wielkość liter) albo równym adresowi e-mail lub jego części przed „@” kończy się komunikatem po polsku, który podaje powód; konto nie powstaje.
- Logowanie hasłem niespełniającym reguły ustawia znacznik `password_change_required` i przenosi na `/konto/haslo`; do czasu zmiany każda inna chroniona strona przekierowuje tam, a `/api/kit*` zwraca 403. Wylogowanie działa.
- `/konto/haslo` (link „Zmień hasło” w `Topbar`) zmienia hasło po podaniu obecnego; nowe hasło przechodzi tę samą regułę, znacznik znika w tym samym wywołaniu.
- Sesja nieużywana 30 dni wygasa (cookie), sesja starsza niż 90 dni od zalogowania jest wylogowywana z komunikatem „Sesja wygasła”, także sesje otwarte przed wdrożeniem.
- Sprawdzenie: `npm test`, `npm run test:api`, `npm run smoke`, `/ci-check` zielone; ręczne przejście rejestracji, wymuszonej i dobrowolnej zmiany.

### Key Discoveries:

- Supabase liczy minimum w code pointach (Go `utf8.RuneCountInString`), a maksimum 72 w **bajtach** (bcrypt); JS `.length` liczy jednostki UTF-16, więc reguła liczy `[...password].length` i `new TextEncoder().encode(password).length`.
- `signInWithPassword` zwraca `data.weakPassword.reasons` tylko według ustawień Supabase (`length`, `characters`, `pwned`) — nie wie nic o liście w aplikacji, więc znacznik ustawia reguła aplikacji, nie Supabase.
- Czas zalogowania jest w tokenie dostępu: claim `amr` (`[{ method: "password", timestamp }]`, typ `AMREntry` w `@supabase/auth-js`), czytany z payloadu tokenu z `getSession()` (nie przez `getClaims()`, które przy kluczu symetrycznym woła `getUser()` drugi raz). `iat` zmienia się przy każdym odświeżeniu, więc się nie nadaje.
- `createServerClient(url, key, { cookieOptions: { maxAge } })` (`@supabase/ssr` `createServerClient.d.ts:9`) nadpisuje 400 dni; cookie jest wystawiane na nowo przy każdym odświeżeniu tokenu, więc `maxAge` działa jak limit bezczynności.
- Lista: SecLists `Passwords/xato-net-10-million-passwords-1000000.txt` jest posortowana według częstości; 46 296 wpisów ma ≥ 12 znaków (początek: `123qweasdzxc`, `1qaz2wsx3edc`, `qwerty123456`). ASVS 6.2.4 L1 wymaga co najmniej 3000 popularnych haseł zgodnych z polityką długości.
- `tests/api/helpers.ts:82` `signUpAndSignIn` oczekuje 302 na `/szukaj`; hasła testowe (`Api-Test-Passw0rd!`, `Smoke-Test-Passw0rd!`, `Perf-Test-Passw0rd!`) mają ≥ 12 znaków i nie są na liście.
- `scripts/ui-scan.mjs:19` `GUARDED` ma już widoki auth i `Topbar`; nowy widok i formularz trzeba dopisać.

## What We're NOT Doing

- „Zapomniałem hasła” (reset e-mailem) — zostaje w Non-Goals; reset robi autor w panelu Supabase.
- Reguły składu (wielka litera, cyfra, znak specjalny) i miernik siły hasła (zxcvbn).
- Sprawdzanie haseł wyciekłych (HIBP) — w Supabase płatne, a zewnętrzne API to nowa zależność sieciowa; lista popularnych haseł to wariant offline.
- Okresowa wymiana hasła (NIST: SHALL NOT).
- Unieważnianie innych sesji po zmianie hasła i natychmiastowe wylogowanie wszystkich przy wdrożeniu (stare sesje łapie limit 90 dni).
- Limity sesji w ustawieniach Supabase (`[auth.sessions]`, płatne) — limity są w aplikacji.
- Reguła dla hasła ustawionego ręcznie przez autora w panelu Supabase — takie konto złapie wymuszona zmiana przy następnym logowaniu.
- Informacja o prywatności i cookies (strona, link w stopce) — osobny wycinek z roadmapy (pytanie 13, PRD Open Question 6). Aplikacja ustawia tylko cookie sesji Supabase, ściśle niezbędne, więc zgoda ani baner nie są wymagane (art. 173 Prawa telekomunikacyjnego); informację wymaga RODO (art. 13, lista leków to dane o zdrowiu). Ta zmiana skraca życie cookie z 400 do 30 dni; przyszła informacja ma podać: cookie sesji, 30 dni od ostatniej aktywności, najwyżej 90 dni od logowania.

## Implementation Approach

Jedno źródło reguły w czystym module (`src/lib/password-policy.ts`, bez listy, bezpieczny w wyspie React) i sprawdzenie serwerowe z listą (`src/lib/services/password-check.ts`, nigdy importowane przez komponent). Formularze pokazują długość od razu; serwer jest ostateczną bramką i zawsze sprawdza całość przed wywołaniem Supabase. Ustawienie Supabase (`minimum_password_length = 12`) jest drugą linią obrony dla kogoś, kto ominie aplikację.

Znacznik w `user_metadata` ustawia logowanie, a pilnuje middleware — jedyne miejsce, które widzi każde żądanie. Zmiana hasła weryfikuje obecne hasło ponownym logowaniem i ustawia nowe hasło oraz zdejmuje znacznik jednym `updateUser`.

Limity sesji: krótsze cookie (bezczynność) w `src/lib/supabase.ts` i sprawdzenie czasu zalogowania z claimu `amr` w middleware (limit bezwzględny). Oba działają też na sesjach sprzed wdrożenia.

Kolejność i równoległość (lessons.md „Planuj i deleguj fazy równolegle”):

- Faza 1 jest pierwsza: reguła, lista i wszystkie nowe kody błędów (żeby fazy 2 i 3 nie edytowały `auth-errors.ts` jednocześnie).
- **Fazy 2 i 3 mogą iść równolegle** po fazie 1 — rozłączne pliki. Faza 2: `SignUpForm.tsx`, `signup.ts`, `config.toml`, `tests/api/auth-signup.test.ts`. Faza 3: `signin.ts`, `middleware.ts`, `/konto/haslo`, `/api/auth/password`, `Topbar.astro`, `ui-scan.mjs`, `tests/api/helpers.ts`, `tests/api/auth-password.test.ts`. Bramki, staging i commity po kolei.
- Faza 4 po fazie 3 (obie zmieniają `src/middleware.ts`).
- Faza 5 na końcu (opisuje stan po wszystkich fazach).

## Critical Implementation Details

**Pętle przekierowań w bramce.** Bramka znacznika musi przepuszczać `/konto/haslo` (z ukośnikiem na końcu, jak `formPath`), `POST /api/auth/password` i `/api/auth/signout`, inaczej użytkownik ze znacznikiem nie wyjdzie ze stanu wymuszenia. Strony `/auth/signin|signup` już przekierowują zalogowanego na `/szukaj`, a stamtąd bramka prowadzi na `/konto/haslo` — dwa skoki, bez pętli.

**Kolejność w `signin.ts`.** Sprawdzenie reguły idzie po udanym `signInWithPassword` (bez sesji nie da się zapisać metadanych), na haśle z formularza, z adresem z `data.user.email`. `updateUser({ data })` wołamy tylko wtedy, gdy wartość znacznika się zmienia (zwykle żadnego dodatkowego wywołania). Błąd zapisu znacznika przy słabym haśle nie może wpuścić do aplikacji: bramka czyta znacznik z `user_metadata`, więc bez zapisanego znacznika użytkownik przeszedłby dalej. Dlatego fail closed: log z przyczyną, `signOut({ scope: "local" })` i przekierowanie na `/auth/signin?error=password_check_failed`. Błąd zdjęcia znacznika przy dobrym haśle jest bezpieczny (bramka dalej prowadzi na `/konto/haslo`), więc wystarczy log.

**Czas zalogowania bez dodatkowego żądania.** Middleware działa na każdym żądaniu (także po listę wyszukiwania), a `getClaims()` przy kluczu symetrycznym woła `getUser()` drugi raz. Faza 4 czyta więc `amr` z tokenu dostępu z `getSession()`, dekodując jego payload, zawsze po udanym `getUser()`, które ten token właśnie zweryfikowało — bez drugiego wywołania sieciowego.

**Znacznik to zalecenie, nie twarda bramka (impl-review fazy 3, F1).** `user_metadata` jest zapisywalne przez użytkownika kluczem publishable (`supabase.auth.updateUser({ data })` z konsoli przeglądarki), a `app_metadata` nie da się ustawić z aplikacji bez klucza serwisowego. Zalogowany może więc zdjąć znacznik bez zmiany hasła. Ryzyko jest ograniczone: szkodzi tylko własnemu kontu, a następne logowanie słabym hasłem ustawia znacznik na nowo. Przyjęta luka; dokumenty (faza 5) opisują bramkę jako wymuszenie w aplikacji, nie jako gwarancję.

**Brak czasu zalogowania w tokenie.** Jeśli token nie ma `amr` z `timestamp` (inny format Supabase, błąd), middleware loguje błąd z przyczyną i traktuje sesję jako wygasłą (fail closed), zamiast po cichu pomijać limit. Pierwszy krok fazy 4 to sprawdzenie kształtu `amr` na lokalnym Supabase (`password`, po odświeżeniu tokenu `timestamp` się nie zmienia).

## Phase 1: Reguła hasła i lista popularnych haseł

### Overview

Czysta reguła długości, lista popularnych haseł generowana skryptem i sprawdzenie serwerowe, plus wszystkie nowe kody błędów. Nic jeszcze nie zmienia zachowania aplikacji.

### Changes Required:

#### 1. Reguła (wspólna dla klienta i serwera)

**File**: `src/lib/password-policy.ts` (nowy), `src/lib/password-policy.test.ts` (nowy)

**Intent**: Jedno źródło liczb i liczenia długości, które formularze i serwer liczą identycznie jak Supabase.

**Contract**: `MIN_PASSWORD_LENGTH = 12`, `MAX_PASSWORD_BYTES = 72`; `passwordLength(password): number` (code pointy, `[...password].length`); `passwordBytes(password): number` (UTF-8); `passwordLengthProblem(password): "password_too_short" | "password_too_long" | null`; `EXAMPLE_PASSPHRASE` — przykład hasła z kilku słów pokazywany w podpowiedziach (np. „zielony rower pod oknem”), który sam jest na liście, bo ludzie przepisują przykłady z ekranu. Bez przycinania spacji (spacja jest znakiem hasła). Moduł nie importuje listy.

#### 2. Generator listy i dane

**File**: `scripts/build-password-blocklist.mjs` (nowy), `src/lib/services/password-blocklist.json` (wygenerowany, w repo)

**Intent**: Powtarzalne zbudowanie listy 10 000 najczęstszych haseł o długości ≥ 12 z SecLists i zapisanie jej w repo, żeby build i testy nie pobierały niczego z sieci.

**Contract**: Skrypt pobiera `Passwords/xato-net-10-million-passwords-1000000.txt` z SecLists pod przypiętym commitem (stała w skrypcie; `-- --file <path>` dla lokalnej kopii), zachowuje kolejność częstości, zamienia na małe litery, usuwa duplikaty, odrzuca wpisy krótsze niż 12 code pointów i dłuższe niż 72 bajty, bierze pierwsze 10 000 i dopisuje słowa kontekstowe aplikacji o długości ≥ 12 (np. `mamlekmamlek`, `apteczka1234`, `mojaapteczka`; ASVS 6.2.11) oraz `EXAMPLE_PASSPHRASE` małymi literami (wpisany w skrypcie dosłownie; zgodność pilnuje test strażnik). Wynik: JSON `{ "source": "<url@commit>", "license": "MIT, SecLists (Daniel Miessler)", "entries": [...] }`. Exit 2 = błąd użycia, 1 = pobranie lub zapis się nie udał.

#### 3. Sprawdzenie serwerowe

**File**: `src/lib/services/password-check.ts` (nowy), `src/lib/services/password-check.test.ts` (nowy)

**Intent**: Pełna reguła na serwerze: długość, lista (bez względu na wielkość liter) i e-mail.

**Contract**: `passwordProblem(password: string, email: string): "password_too_short" | "password_too_long" | "password_common" | null`. Kolejność: długość, potem `password.toLowerCase()` w `Set` z listy (budowany leniwie przy pierwszym wywołaniu), potem równość (bez wielkości liter) z całym adresem lub częścią przed „@”. Plik nie może trafić do wyspy React (importują go tylko trasy w `src/pages/api/`).

#### 4. Kody błędów

**File**: `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`

**Intent**: Komunikaty po polsku, które podają powód odrzucenia (NIST: „SHALL provide the reason”) i podpowiadają hasło z kilku słów.

**Contract**: Nowe kody w `MESSAGES`: `password_too_short` („Hasło musi mieć co najmniej 12 znaków…”), `password_too_long` („Hasło jest za długie (limit 72 bajtów; polskie litery zajmują po 2)…”), `password_common` („To hasło jest zbyt popularne… Spróbuj kilku własnych słów…”, przykład z `EXAMPLE_PASSPHRASE`), `password_mismatch`, `current_password_invalid`, `same_password` (Supabase: nowe hasło takie samo jak stare), `session_expired` („Sesja wygasła, zaloguj się ponownie”), `password_change_required`, `password_check_failed` („Nie udało się sprawdzić hasła, zaloguj się ponownie”). `weak_password` przeredagowany zgodnie z nową regułą. Liczby w tekstach z `MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_BYTES`, nie wpisane ręcznie.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe reguły: granice 11/12 code pointów (także z polskimi znakami i emoji), 72/73 bajty (np. 36 × „ą” = 72 bajty przechodzi, 37 nie), spacje liczone i nieprzycinane
- Testy sprawdzenia serwerowego: trafienia na liście bez względu na wielkość liter (`Qwerty123456`), hasło równe e-mailowi i jego części przed „@”, hasło spoza listy przechodzi
- Test strażnik danych listy: co najmniej 3000 wpisów, wszystkie małymi literami, bez duplikatów, każdy ≥ 12 code pointów i ≤ 72 bajty, pole `source` z commitem, zawiera `EXAMPLE_PASSPHRASE` małymi literami
- Testy `auth-errors`: każdy nowy kod ma komunikat, nieznany kod daje `unknown`
- `npm test`, `npm run lint`, `npx astro check` zielone

#### Manual Verification:

- Przegląd kilkudziesięciu pierwszych wpisów listy i słów kontekstowych (czy nie ma śmieci ani haseł, które powinny przejść)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Rejestracja

### Overview

Formularz i endpoint rejestracji stosują nową regułę; lokalny Supabase dostaje minimum 12. Może iść równolegle z fazą 3 — ale tylko pisanie kodu i testy bez serwera. Restart lokalnego Supabase (krok 2.4), `smoke` i `test:api` dzielą z fazą 3 ten sam serwer i limit 30 logowań na 5 minut, więc idą wyłącznie w bramce po kolei, nigdy w równoległym subagencie.

### Changes Required:

#### 1. Formularz rejestracji

**File**: `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignUpForm.test.tsx`

**Intent**: Licznik i walidacja według reguły z `password-policy.ts`, podpowiedź hasła z kilku słów, komunikat o limicie bajtów.

**Contract**: Usunięta lokalna stała `MIN_PASSWORD_LENGTH = 6`; walidacja przez `passwordLengthProblem` z komunikatami z `authErrorMessage`. Licznik „Jeszcze N znaków” liczy code pointy. Placeholder „Co najmniej 12 znaków”. Krótka podpowiedź pod polem z `EXAMPLE_PASSPHRASE` („Najłatwiej zapamiętać kilka słów, np. …” — z dopiskiem, żeby wymyślić własne). Bez atrybutu `maxLength` (liczy jednostki UTF-16, nie bajty). Wklejanie i menedżery haseł dozwolone (bez `onPaste` blokującego). Formularz nie importuje `password-check.ts`.

#### 2. Endpoint rejestracji

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Walidacja wejścia i pełna reguła na serwerze przed wywołaniem Supabase.

**Contract**: Schemat zod (`astro/zod`) dla `email` i `password` (stringi; brak pola → `?error=validation_failed`). Potem `passwordProblem(password, email)`; problem → przekierowanie `/auth/signup?error=<kod>` bez wywołania `signUp`. Dalej bez zmian (`data.session` → `/szukaj` albo `/auth/confirm-email`).

#### 3. Ustawienie Supabase

**File**: `supabase/config.toml`

**Intent**: Druga linia obrony zgodna z regułą aplikacji.

**Contract**: `minimum_password_length = 12`, `password_requirements = ""` bez zmian. Komentarz, że produkcja ustawia to samo w panelu po merge'u (faza 5).

#### 4. Testy API rejestracji

**File**: `tests/api/auth-signup.test.ts` (nowy)

**Intent**: Dowód, że odrzucona rejestracja nie zakłada konta.

**Contract**: Dla hasła 11-znakowego, z listy (wielkie litery) i równego części adresu przed „@”: 302 na `/auth/signup?error=<kod>` i brak adresu w `auth.users` (odczyt przez `DATABASE_URL`). Hasło poprawne → 302 na `/szukaj`. Najwyżej 4 próby rejestracji (limit lokalny, patrz Testing Strategy).

### Success Criteria:

#### Automated Verification:

- Testy komponentu `SignUpForm`: 11 znaków → komunikat, 12 → brak błędu; licznik z polskimi znakami; 73 bajty → komunikat o limicie; `aria-invalid` / `aria-describedby` jak dotąd
- Testy API rejestracji: odrzucenia bez konta w `auth.users`, poprawne hasło przechodzi
- `npm run smoke` zielone (hasło smoke spełnia regułę)
- `npx supabase stop && npx supabase start` przyjmuje nowy `config.toml`; rejestracja 11-znakowym hasłem przez API Supabase z pominięciem aplikacji dostaje `weak_password`
- `npm test`, `npm run lint`, `npx astro check`, `npm run ui:scan` zielone

#### Manual Verification:

- Rejestracja na `http://localhost:4321/auth/signup`: licznik, komunikat dla hasła z listy, podpowiedź, wygląd na telefonie (390 px)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Zmiana hasła i wymuszenie

### Overview

Logowanie wykrywa słabe hasło i ustawia znacznik; middleware blokuje aplikację do czasu zmiany; ekran `/konto/haslo` pozwala zmienić hasło, gdy jest to wymagane i gdy użytkownik sam chce. Może iść równolegle z fazą 2 — z tym samym zastrzeżeniem: `smoke`, `test:api` i ręczne testy na lokalnym serwerze tylko w bramce po kolei.

### Changes Required:

#### 1. Logowanie

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Po udanym logowaniu ocenić hasło z formularza regułą aplikacji i zapisać wynik w znaczniku.

**Contract**: Schemat zod jak w `signup.ts`. Po sukcesie `passwordProblem(password, data.user.email)`; `required = problem !== null`. Gdy `user_metadata.password_change_required !== required` → `updateUser({ data: { password_change_required: required } })` (błąd przy `required = true` → `console.error`, `signOut({ scope: "local" })`, `/auth/signin?error=password_check_failed`; przy `required = false` → tylko `console.error`). `required` → przekierowanie `/konto/haslo?wymagana=1`, inaczej `/szukaj`. `weakPassword` z Supabase tylko w logu (nie steruje znacznikiem).

#### 2. Bramka w middleware

**File**: `src/middleware.ts`

**Intent**: Użytkownik ze znacznikiem nie wchodzi nigdzie poza ekran zmiany hasła i wylogowanie.

**Contract**: `/konto` dopisane do `PROTECTED_ROUTES`. Gdy `locals.user?.user_metadata?.password_change_required === true`: ścieżki `/konto/haslo`, `/api/auth/password`, `/api/auth/signout` przechodzą; `/api/kit*` (i inne `/api/*` poza auth) → 403 JSON `{ "error": "Password change required" }`; każda inna strona → przekierowanie `/konto/haslo?wymagana=1`. Strony publiczne (`/auth/*`) zachowują obecne przekierowania.

**Addendum (impl-review fazy 3, F2)**: przepuszczane jest całe `/api/auth/*` (także `signin` i `signup`), nie tylko trzy ścieżki z listy, żeby sesję dało się wymienić przez logowanie na inne konto.

#### 3. Ekran zmiany hasła

**File**: `src/pages/konto/haslo.astro` (nowy), `src/components/auth/ChangePasswordForm.tsx` (nowy), `src/components/auth/ChangePasswordForm.test.tsx` (nowy)

**Intent**: Formularz „obecne hasło, nowe hasło, powtórz nowe” w wyglądzie ekranów auth, z wersją wymuszoną i dobrowolną.

**Contract**: Strona na `Layout` + `AuthShell` (jak `src/pages/auth/signup.astro`), z `Topbar` tylko gdy zmiana jest dobrowolna (przy wymuszeniu linki i tak prowadzą z powrotem). `?wymagana=1` → nagłówek z wyjaśnieniem („Twoje hasło nie spełnia nowych zasad…”); `?zmieniono=1` → komunikat sukcesu i link „Wróć do wyszukiwania”; `?error=<kod>` → `serverError`. Formularz: trzy pola `type="password"` z `autocomplete` `current-password` / `new-password`, licznik i walidacja nowego hasła jak w `SignUpForm` (wspólne elementy z `FormField` / `FieldError`), niezgodne powtórzenie → `password_mismatch`; `noValidate`, POST na `/api/auth/password`, stan wysyłania jak w `SignUpForm`.

#### 4. Endpoint zmiany hasła

**File**: `src/pages/api/auth/password.ts` (nowy)

**Intent**: Zmiana hasła z weryfikacją obecnego, ta sama reguła co przy rejestracji.

**Contract**: `POST`; brak `locals.user` → przekierowanie `/auth/signin`. zod: `current`, `password`, `confirm`. Kolejność: `password !== confirm` → `password_mismatch`; `passwordProblem(password, user.email)`; `signInWithPassword({ email: user.email, password: current })`, błąd → `current_password_invalid` (nie `invalid_credentials` ze strony logowania); `updateUser({ password, data: { password_change_required: false } })`, błąd → `authErrorCode` (m.in. `same_password`, `weak_password`) z `console.error`. Każdy błąd → `/konto/haslo?error=<kod>` (z zachowanym `wymagana=1`, gdy znacznik jest ustawiony); sukces → `/konto/haslo?zmieniono=1`.

#### 5. Link i strażnik UI

**File**: `src/components/Topbar.astro`, `scripts/ui-scan.mjs`

**Intent**: Wejście do dobrowolnej zmiany i pilnowanie tokenów w nowych widokach.

**Contract**: Link „Zmień hasło” (`/konto/haslo`, `aria-current` jak pozostałe, ta sama `linkClass`). `GUARDED` += `src/pages/konto/haslo.astro`, `src/components/auth/ChangePasswordForm.tsx`.

#### 6. Testy API zmiany i wymuszenia

**File**: `tests/api/helpers.ts`, `tests/api/auth-password.test.ts` (nowy)

**Intent**: Dowód ścieżek wymuszonej i dobrowolnej zmiany na działającym serwerze.

**Contract**: Pomocnik `setWeakPassword(email, password)` ustawia `auth.users.encrypted_password = crypt($2, gen_salt('bf'))` przez `DATABASE_URL` (jedyny zapis w testach API; tylko konto założone przez ten test). Scenariusze: (a) konto ze słabym hasłem → logowanie 302 na `/konto/haslo?wymagana=1`, `GET /szukaj` → przekierowanie na `/konto/haslo`, `GET /api/kit/check` → 403, zmiana na poprawne hasło → 302 `?zmieniono=1`, potem `/szukaj` 200 i logowanie nowym hasłem → `/szukaj`; (b) błędne obecne hasło → `?error=current_password_invalid`, stare hasło nadal działa; (c) nowe hasło z listy → `?error=password_common`, hasło bez zmian; (d) wylogowanie ze znacznikiem działa. Najwyżej 2 nowe konta.

### Success Criteria:

#### Automated Verification:

- Testy komponentu `ChangePasswordForm`: walidacja nowego hasła, niezgodne powtórzenie, wersja wymuszona i sukces, stan wysyłania
- Testy API zmiany i wymuszenia (scenariusze a–d) zielone
- Istniejące `npm run test:api` i `npm run smoke` zielone (konta testowe mają silne hasła, więc nie trafiają w bramkę)
- `npm test`, `npm run lint`, `npx astro check`, `npm run ui:scan` zielone

#### Manual Verification:

- Wymuszona zmiana: konto ze słabym hasłem (ustawionym jak w pomocniku), logowanie na `http://localhost:4321/auth/signin`, próba wejścia na `/apteczka` wraca na `/konto/haslo`, zmiana, potem dostęp
- Dobrowolna zmiana z linku „Zmień hasło” w `Topbar`, także na telefonie (390 px)
- Wygląd i komunikaty po polsku na `http://localhost:4321/konto/haslo` w stanach: zwykły, wymuszony, błąd, sukces

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Limity sesji

### Overview

Sesja wygasa po 30 dniach bez użycia i po 90 dniach od zalogowania, także sesja otwarta przed wdrożeniem. Po fazie 3 (ten sam `middleware.ts`).

### Changes Required:

#### 1. Sprawdzenie kształtu tokenu

**File**: — (krok badawczy)

**Intent**: Potwierdzić na lokalnym Supabase, że token dostępu ma `amr` z `timestamp` logowania hasłem i że po odświeżeniu tokenu `timestamp` się nie zmienia.

**Contract**: Wynik zapisany w notatce fazy (`change.md` Notes). Jeśli kształt jest inny, faza wraca do autora przed zmianą kodu.

#### 2. Reguła wieku sesji

**File**: `src/lib/session-age.ts` (nowy), `src/lib/session-age.test.ts` (nowy)

**Intent**: Czyste funkcje, które da się przetestować bez serwera.

**Contract**: `SESSION_IDLE_DAYS = 30`, `SESSION_MAX_DAYS = 90`; `authTimeFromClaims(claims): number | null` (najwcześniejszy `timestamp` z `amr` w formacie `AMREntry[]`; `string[]` albo brak → `null`); `sessionExpired(authTime: number | null, now: number): boolean` (`null` → `true`, granica 90 dni co do sekundy).

#### 3. Cookie i middleware

**File**: `src/lib/supabase.ts`, `src/middleware.ts`

**Intent**: Bezczynność przez krótsze cookie, limit bezwzględny w middleware.

**Contract**: `createServerClient(..., { cookieOptions: { maxAge: SESSION_IDLE_DAYS * 86400 }, cookies })`. W middleware po udanym `getUser()`: `getSession()` → dekodowanie payloadu `access_token` (base64url, bez weryfikacji — `getUser()` właśnie zweryfikowało ten token; bez `getClaims()`, które przy kluczu symetrycznym woła `getUser()` drugi raz) → `authTimeFromClaims` → `sessionExpired`; gdy wygasła: `console.error` z powodem tylko dla `null` (brak czasu to anomalia), `signOut({ scope: "local" })`, `locals.user = null`, a strona chroniona przekierowuje na `/auth/signin?error=session_expired` (API dostaje zwykłe 401 z tras). Sprawdzenie przed bramką znacznika z fazy 3.

**Addendum (impl-review fazy 4, F1)**: `@supabase/ssr` ignoruje `cookieOptions.maxAge` (wymusza 400 dni), więc limit bezczynności jest nakładany w `setAll` w `src/lib/supabase.ts` przez `sessionCookieMaxAge` (`src/lib/session-age.ts`); sprawdzone: `Max-Age=2592000`. Opis w `change.md` Notes (Phase 4).

**Addendum (impl-review fazy 4, F2)**: ścieżka wygaśnięcia w middleware (dekodowanie, `signOut`, `session_expired`, pominięcie bramki hasła) ma dowód ręczny (4.7, stała obniżona do minuty), bez testu automatycznego: middleware importuje `astro:middleware`, więc test wymagałby osobnego szwu i zegara. Przyjęte. Lokalny `test:api` dawał 1–3 razy na przebieg 500 z `wrangler dev` w nieuwierzytelnionych przypadkach `kit-access`, tak samo bez zmian fazy 4 (3 przebiegi na schowanych zmianach); CI `smoke` zielone.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe `session-age`: granice 90 dni (−1 s / +1 s), `amr` w obu formatach, brak `amr`, kilka wpisów (najwcześniejszy)
- `npm run smoke` i `npm run test:api` zielone (świeże sesje nie wygasają)
- `npm run perf` przed i po zmianie middleware (ten sam serwer `wrangler dev`, ten sam profil): czas gotowości listy bez pogorszenia ponad szum pomiaru
- `npm test`, `npm run lint`, `npx astro check` zielone

#### Manual Verification:

- W DevTools cookie sesji ma wygaśnięcie za ~30 dni po zalogowaniu na `http://localhost:4321/auth/signin`
- Wylogowanie po przekroczeniu limitu: lokalnie z tymczasowo obniżonym `SESSION_MAX_DAYS` (np. 1 minuta, zmiana cofnięta przed commitem) — wejście na `/szukaj` kończy się na logowaniu z komunikatem „Sesja wygasła”

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Dokumenty i wdrożenie

### Overview

PRD, roadmapa i AGENTS.md opisują nowy stan; kolejność wdrożenia na produkcji jest zapisana.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Zmiana hasła wchodzi do zakresu, reset zostaje poza nim.

**Contract**: Access Control: reguła hasła (12 znaków, lista, bez składu), zmiana hasła w aplikacji, wymuszenie dla starych haseł, limity sesji. Non-Goals: tylko „Reset hasła (zapomniane hasło) w aplikacji”. Open Question 6 zaktualizowane.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Opis S-18 zgodny z planem (Outcome i Status zmienione już przy planowaniu).

**Contract**: Unknowns S-18 rozstrzygnięte (wymuszenie przez znacznik i middleware; zakres zmiany hasła; panel Supabase poza regułą), Risk bez „10 znaków + 4 klasy”. Potem `npm run roadmap:sync`.

#### 3. AGENTS.md i README

**File**: `AGENTS.md`, `README.md`

**Intent**: Następny agent zna regułę, bramkę, limity sesji, testy i kolejność wdrożenia.

**Contract**: AGENTS.md „Auth flow”: `password-policy.ts` / `password-check.ts` (lista tylko serwerowa, generator), znacznik `password_change_required` i bramka w middleware (wyjątki), `/konto/haslo` i `/api/auth/password`, limity sesji (`session-age.ts`, `maxAge`). „Command tripwires”: nowe pliki testów w opisie `npm test`, w `test:api` nowe pliki i wyjątek od „read-only” (`setWeakPassword`), liczba kont na przebieg. Notatka o kolejności w stylu notatek o migracjach: merge, potem panel Supabase (Authentication → Policies/Providers: minimum 12, wymagania puste; sprawdzić `secure_password_change`). Opis bramki zawiera lukę: znacznik w `user_metadata` użytkownik może zdjąć sam (patrz „Znacznik to zalecenie”). README: krok ręczny dla konta E2E (`E2E_PASSWORD` musi spełniać regułę, inaczej `auth.setup.ts` trafi na `/konto/haslo`).

### Success Criteria:

#### Automated Verification:

- `npm test` (w tym projekt `hooks`), `npm run lint`, `npx astro check`, `npm run build` zielone (`/ci-check`)
- `npm run roadmap:sync -- --dry-run` bez błędów

#### Manual Verification:

- Przegląd PRD, roadmapy i AGENTS.md przez autora
- Po merge'u: panel Supabase produkcji ustawiony (minimum 12, wymagania puste, `secure_password_change` sprawdzone), konto E2E i konta testowe autora z hasłem zgodnym z regułą

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `password-policy`: code pointy vs UTF-16 (emoji = 1 znak), bajty UTF-8 (polskie litery = 2 bajty), spacje.
- `password-check`: lista bez wielkości liter, e-mail i jego część przed „@”, kolejność kodów (długość przed listą).
- Strażnik danych listy (rozmiar, normalizacja, granice).
- `auth-errors`: nowe kody.
- `session-age`: granice i formaty `amr`.

Oczekiwane wartości w testach wpisane ręcznie (np. konkretne hasła z listy), nie wyliczone przez testowany kod.

### Integration Tests:

- `tests/api/auth-signup.test.ts` i `tests/api/auth-password.test.ts` na działającym serwerze z lokalnym Supabase. Limit lokalny: 30 rejestracji i logowań na 5 minut, obecny przebieg zużywa 8; nowe testy dodają najwyżej ~4 rejestracje i ~8 logowań (każda zmiana hasła to dodatkowe logowanie weryfikujące), więc mieszczą się w jednym przebiegu, ale liczba przebiegów na 5 minut spada z ~3 do ~1–2. AGENTS.md musi to odnotować.

### Manual Testing Steps:

1. Rejestracja na `http://localhost:4321/auth/signup` hasłem `qwerty123456` → komunikat o popularnym haśle; hasłem `kot pije mleko` → konto; przykład z podpowiedzi (`EXAMPLE_PASSPHRASE`) → komunikat o popularnym haśle.
2. Konto ze słabym hasłem → logowanie na `http://localhost:4321/auth/signin` → `/konto/haslo` z wyjaśnieniem; `/apteczka` wraca na zmianę; wylogowanie działa; zmiana → aplikacja dostępna.
3. Dobrowolna zmiana z `Topbar`, błędne obecne hasło, nowe hasło takie samo jak stare.
4. Cookie sesji ~30 dni; limit 90 dni z tymczasowo obniżoną stałą.

## Performance Considerations

- Lista (~10 000 wpisów, ~140 kB JSON) trafia tylko do bundla workera, nie do wysp; `Set` budowany leniwie raz na izolat. Bez wpływu na `/szukaj` (lista wyszukiwania i `npm run perf` bez zmian).
- Middleware: limit 90 dni nie dodaje żądania do Supabase (dekodowanie tokenu z sesji, nie `getClaims()`); margines `/szukaj` to ~350 ms, więc faza 4 mierzy `npm run perf` przed i po zmianie w tym samym ustawieniu.

## Migration Notes

- Bez migracji bazy. Znacznik żyje w `auth.users.raw_user_meta_data`.
- Produkcja, kolejność: merge (Cloudflare wdraża kod, który działa też przy starym ustawieniu panelu), potem panel Supabase: minimum 12, wymagania puste. Rollback: revert PR-a; panel można zostawić (12 znaków przy starym kodzie oznacza tylko komunikat `weak_password` od Supabase zamiast od formularza).
- Istniejący użytkownicy: słabe hasło → wymuszona zmiana przy następnym logowaniu; sesje sprzed wdrożenia wygasają najpóźniej 90 dni od zalogowania (starsze — przy pierwszym wejściu po wdrożeniu), cookie 400-dniowe dostaje limit 30 dni przy najbliższym odświeżeniu tokenu.
- Konto E2E (`E2E_PASSWORD`) i konta testowe autora na produkcji: ustawić hasła zgodne z regułą przed albo zaraz po wdrożeniu.

## References

- NIST SP 800-63B-4 (lipiec 2025), §3.1.1.2 Password Verifiers
- OWASP ASVS 5.0, V6.2 Password Security
- SecLists `Passwords/xato-net-10-million-passwords-1000000.txt` (MIT)
- Wzorzec formularza: `src/components/auth/SignUpForm.tsx`, strona: `src/pages/auth/signup.astro`
- Pomocnicy testów API: `tests/api/helpers.ts:82`
- Roadmapa: `context/foundation/roadmap.md` S-18

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła hasła i lista popularnych haseł

#### Automated

- [x] 1.1 Testy jednostkowe reguły długości (code pointy, bajty, spacje) — a96fd32
- [x] 1.2 Testy sprawdzenia serwerowego (lista bez wielkości liter, e-mail) — a96fd32
- [x] 1.3 Test strażnik danych listy (z przykładem z podpowiedzi) — a96fd32
- [x] 1.4 Testy nowych kodów w auth-errors — a96fd32
- [x] 1.5 npm test, lint i astro check zielone — a96fd32

#### Manual

- [x] 1.6 Przegląd początku listy i słów kontekstowych

### Phase 2: Rejestracja

#### Automated

- [x] 2.1 Testy komponentu SignUpForm z nową regułą — 5bd1772
- [x] 2.2 Testy API rejestracji (odrzucenia bez konta) — 5bd1772
- [x] 2.3 npm run smoke zielone — 5bd1772
- [x] 2.4 Lokalny Supabase odrzuca 11 znaków z pominięciem aplikacji — 5bd1772
- [x] 2.5 npm test, lint, astro check i ui:scan zielone — 5bd1772

#### Manual

- [x] 2.6 Rejestracja w przeglądarce (licznik, lista, podpowiedź, telefon)

### Phase 3: Zmiana hasła i wymuszenie

#### Automated

- [x] 3.1 Testy komponentu ChangePasswordForm — 355da11
- [x] 3.2 Testy API zmiany i wymuszenia (scenariusze a–d) — 355da11
- [x] 3.3 Istniejące test:api i smoke zielone — 355da11
- [x] 3.4 npm test, lint, astro check i ui:scan zielone — 355da11

#### Manual

- [x] 3.5 Wymuszona zmiana hasła w przeglądarce
- [x] 3.6 Dobrowolna zmiana z Topbar, także na telefonie
- [x] 3.7 Stany ekranu /konto/haslo

### Phase 4: Limity sesji

#### Automated

- [x] 4.1 Kształt amr potwierdzony na lokalnym Supabase
- [x] 4.2 Testy jednostkowe session-age
- [x] 4.3 smoke i test:api zielone
- [x] 4.4 npm run perf przed i po bez pogorszenia
- [x] 4.5 npm test, lint i astro check zielone

#### Manual

- [x] 4.6 Cookie sesji z wygaśnięciem ~30 dni — 943faa0
- [x] 4.7 Wylogowanie po limicie z obniżoną stałą — 943faa0

### Phase 5: Dokumenty i wdrożenie

#### Automated

- [x] 5.1 /ci-check zielone
- [x] 5.2 roadmap:sync dry-run bez błędów

#### Manual

- [x] 5.3 Przegląd PRD, roadmapy i AGENTS.md
- [x] 5.4 Panel Supabase produkcji i konta testowe po merge'u
