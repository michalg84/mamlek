# Password policy — Plan Brief

> Full plan: `context/changes/password-policy/plan.md`

## What & Why

Hasło o długości 6 znaków to za mało. Autor chciał reguły zgodnej z obecnym standardem; sprawdzenie NIST SP 800-63B-4 i OWASP ASVS 5.0 pokazało, że standardem nie są już klasy znaków (wielka litera, cyfra, znak specjalny), tylko długość plus odrzucanie popularnych haseł. Reguła obejmuje nowe konta, zmianę hasła i istniejące konta, a przy okazji sesje dostają limit czasu, którego dziś nie mają.

## Starting Point

Minimum 6 znaków w formularzu rejestracji, w `supabase/config.toml` i w panelu produkcji; brak zmiany hasła w aplikacji (PRD Non-Goals); sesja bez limitu (refresh token bez wygaśnięcia, cookie na 400 dni).

## Desired End State

Rejestracja i zmiana hasła przyjmują tylko hasła o co najmniej 12 znakach, spoza listy popularnych haseł i różne od adresu e-mail, a odrzucenie mówi po polsku, dlaczego. Konto ze starym słabym hasłem po zalogowaniu trafia na ekran zmiany hasła i nie wejdzie dalej, dopóki go nie zmieni; każdy może zmienić hasło z linku w górnym pasku. Nieużywana sesja wygasa po 30 dniach, każda po 90 dniach od zalogowania.

## Key Decisions Made

| Decision           | Choice                                                                                                                         | Why (1 sentence)                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Reguła             | ≥ 12 znaków, bez wymogów składu                                                                                                | NIST 800-63B-4 zabrania reguł składu, ASVS 6.2.1 zaleca 15, 12 to kompromis dla wpisywania na telefonie                 |
| Lista haseł        | 10 000 najczęstszych haseł ≥ 12 znaków z SecLists, w repo, tylko na serwerze                                                   | HIBP w Supabase wymaga planu Pro; lista offline spełnia ASVS 6.2.4 bez nowej zależności sieciowej                       |
| Porównanie z listą | Bez wielkości liter, plus e-mail i jego część przed „@”                                                                        | „Qwerty123456” to to samo hasło co „qwerty123456” dla atakującego                                                       |
| Liczenie długości  | Code pointy (min) i bajty UTF-8 (max 72)                                                                                       | Tak liczy Supabase; JS `.length` dałby inne wyniki dla emoji i polskich liter                                           |
| Istniejące konta   | Sprawdzenie hasła przy logowaniu, znacznik w `user_metadata`, bramka w middleware (strony → `/konto/haslo`, `/api/kit*` → 403) | Hasło jest znane tylko w chwili logowania                                                                               |
| Zmiana hasła       | Wymuszona i dobrowolna, zawsze z obecnym hasłem                                                                                | ASVS 6.2.2 i 6.2.3                                                                                                      |
| Stare sesje        | Bez wymuszonego wylogowania; łapie je limit 90 dni                                                                             | Limit liczony od czasu zalogowania w tokenie obejmuje też sesje sprzed wdrożenia                                        |
| Limity sesji       | 30 dni bezczynności (cookie) + 90 dni od logowania (middleware)                                                                | Porzucone urządzenie wylogowuje się po miesiącu, hasło sprawdzane co najmniej raz na kwartał; limity Supabase są płatne |

## Scope

**In scope:**

- reguła i lista (generator, dane, sprawdzenie serwerowe), komunikaty po polsku;
- rejestracja (formularz, endpoint z zod, `config.toml`);
- logowanie ze znacznikiem, bramka w middleware, ekran i endpoint zmiany hasła, link w `Topbar`;
- limity sesji;
- testy jednostkowe, komponentów i API; PRD, roadmapa, AGENTS.md, README.

**Out of scope:**

- reset zapomnianego hasła;
- reguły składu i miernik siły;
- HIBP;
- okresowa wymiana hasła;
- unieważnianie innych sesji po zmianie hasła;
- limity `[auth.sessions]` w Supabase.

## Architecture / Approach

`src/lib/password-policy.ts` (czysta reguła długości, używana też w wyspach) → `src/lib/services/password-check.ts` (lista i e-mail, tylko serwer) → trasy `signup.ts`, `signin.ts`, `password.ts`. Logowanie zapisuje wynik w `user_metadata.password_change_required`, middleware czyta go z `locals.user` i blokuje resztę aplikacji. Limity sesji: `maxAge` cookie w `src/lib/supabase.ts` i czas zalogowania z claimu `amr` w middleware (`src/lib/session-age.ts`).

## Phases at a Glance

| Phase                        | What it delivers                                                                     | Key risk                                             |
| ---------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1. Reguła hasła i lista      | Reguła, lista z generatorem, sprawdzenie serwerowe, kody błędów                      | Lista z hasłami, które powinny przejść               |
| 2. Rejestracja               | Formularz i endpoint z nową regułą, `config.toml` (równolegle z 3)                   | Rozjazd liczenia długości klient/serwer/Supabase     |
| 3. Zmiana hasła i wymuszenie | Znacznik przy logowaniu, bramka, `/konto/haslo`, endpoint, `Topbar` (równolegle z 2) | Pętla przekierowań lub luka w bramce dla API         |
| 4. Limity sesji              | Cookie 30 dni, wylogowanie po 90 dniach                                              | Inny kształt `amr` niż zakładany (krok 4.1 sprawdza) |
| 5. Dokumenty i wdrożenie     | PRD, roadmapa, AGENTS.md, README, kolejność w panelu                                 | Zapomniane ustawienie panelu produkcji               |

**Prerequisites:** S-15 (ekrany auth) zamknięty; lokalny Supabase z importem rejestru (v1, v1, v2) dla `test:api` i `smoke`.
**Estimated effort:** ~3–4 sesje w 5 fazach (2 i 3 równolegle).

## Open Risks & Assumptions

- `user_metadata` może zmienić sam użytkownik przez API Supabase, ale aplikacja nie udostępnia klucza Supabase w przeglądarce, więc zdjęcie znacznika wymaga wiedzy spoza aplikacji; świadomie akceptowane.
- Sesja otwarta przed wdrożeniem ze słabym hasłem może działać do 90 dni od zalogowania.
- Każdy przebieg `test:api` zużywa więcej z lokalnego limitu logowań (~1–2 przebiegi na 5 minut zamiast ~3).
- Produkcja: ustawienie `secure_password_change` nieznane; ponowne logowanie przy zmianie hasła powinno je pokryć, do sprawdzenia po wdrożeniu.
- Konto E2E i konta testowe autora ze słabym hasłem trafią na wymuszoną zmianę — krok ręczny przy wdrożeniu.

## Success Criteria (Summary)

- Nie da się założyć konta ani ustawić hasła krótszego niż 12 znaków, popularnego lub równego adresowi e-mail, a komunikat mówi dlaczego.
- Konto ze starym słabym hasłem nie wejdzie do apteczki, dopóki nie zmieni hasła; zmiana działa też dobrowolnie.
- Sesja nie żyje dłużej niż 90 dni od zalogowania ani 30 dni bez użycia.
