# Reset zapomnianego hasła — Plan Brief

> Full plan: `context/changes/password-reset/plan.md`

## What & Why

Użytkownik, który zapomniał hasła, sam odzyskuje konto przez link w e-mailu (S-19, pierwszy wycinek kamienia M-2). Rejestracja jest otwarta, po S-18 hasła są dłuższe, a zablokowana osoba może dziś tylko pisać do autora.

## Starting Point

Aplikacja ma logowanie, rejestrację i zmianę hasła wymagającą obecnego hasła. Nie ma resetu, własnych szablonów e-maili ani własnego SMTP; PRD wymienia reset w Non-Goals.

## Desired End State

Z ekranu logowania można poprosić o link (odpowiedź zawsze taka sama), otworzyć go na dowolnym urządzeniu, ustawić nowe hasło i od razu trafić do `/szukaj`. Inne sesje konta się kończą, a na skrzynkę przychodzi powiadomienie o zmianie.

## Key Decisions Made

| Decision                        | Choice                                                                    | Why (1 sentence)                                                           |
| ------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Poczta                          | Własny SMTP w tym wycinku (kod i instrukcja; konfiguracja przy wdrożeniu) | Wbudowana poczta wysyła tylko do zespołu projektu, kilka maili na godzinę. |
| Link                            | `token_hash` z własnym polskim szablonem, weryfikacja na serwerze         | Działa też na innym urządzeniu niż to, z którego wyszła prośba.            |
| Otwarcie linku                  | GET tylko pokazuje formularz; logowanie dopiero po zapisaniu hasła        | Skanery poczty nie zużyją linku, a sam link nie wpuszcza do apteczki.      |
| Nieudany zapis po zużyciu linku | Sesja w osobnym cookie `mamlek-recovery` na 15 minut                      | Można spróbować drugi raz bez nowego maila i bez dostępu do danych.        |
| Odpowiedź na prośbę             | Neutralna także przy limicie i błędzie wysyłki, przyczyna w logu          | Inna odpowiedź zdradzałaby, które adresy mają konto.                       |
| Inne sesje                      | Wylogowanie po resecie                                                    | Reset bywa reakcją na przejęte hasło.                                      |
| Powiadomienie                   | Wbudowane w Supabase, po polsku, bez kodu aplikacji                       | Właściciel dowiaduje się o zmianie przy najmniejszym koszcie.              |

## Scope

**In scope:**

- dwie strony i dwa endpointy, link na ekranie logowania
- dwa polskie szablony e-maili, konfiguracja lokalna, Mailpit w CI
- testy jednostkowe, komponentów i całego przepływu przez HTTP
- PRD, README, AGENTS.md, test-plan i konfiguracja produkcji

**Out of scope:**

- wyrównywanie czasu odpowiedzi, CAPTCHA, ochrona limitu e-maili
- zmiana komunikatu rejestracji o istniejącym koncie
- ochrona przed login CSRF i ukrywanie tokenu w logach Cloudflare
- wybór dostawcy SMTP w kodzie, link do resetu na `/konto/haslo`
- usuwanie konta (S-20), migracje bazy

## Architecture / Approach

```
signin → /auth/forgot-password → POST (bezstanowy klient) → „Sprawdź skrzynkę”
mail → /auth/reset-password?token_hash=… → POST: sprawdź hasło → zużyj token
     → cookie mamlek-recovery → zapisz hasło → wyloguj inne sesje
     → przenieś sesję do zwykłego cookie → /szukaj
```

## Phases at a Glance

| Phase                       | What it delivers                                  | Key risk                                                               |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Poczta i konfiguracja    | Polskie maile z właściwym linkiem lokalnie i w CI | CI bierze najnowsze CLI, lokalne to 2.117 (dlatego `email_sent = 100`) |
| 2. Serwer                   | Endpointy, cookie odzyskiwania, test przepływu    | Zła kolejność przy przenoszeniu sesji unieważnia logowanie             |
| 3. Widoki                   | Dwie strony, formularze, link na logowaniu        | Stan strony mylący przy zużytym linku lub awarii                       |
| 4. Dokumentacja i wdrożenie | Dokumenty i działający reset na produkcji         | Merge przed konfiguracją panelu wysyłałby niedziałające linki          |

**Prerequisites:** Docker i lokalny Supabase; do fazy 4 dostawca SMTP (zwykle z własną domeną) i dostęp do panelu Supabase.
**Estimated effort:** ok. 2–3 sesje, 4 fazy (dokumentację można pisać równolegle z fazą 3).

## Open Risks & Assumptions

- Bez własnego SMTP reset na produkcji w praktyce nie zadziała dla zwykłych użytkowników; dostawca i domena nie są jeszcze wybrane.
- `/ship-pr` włącza auto-merge, więc PR trzeba otworzyć bez niego albo dopiero po konfiguracji panelu.
- Przyjęte luki: token widoczny w logach Cloudflare, możliwość podsunięcia komuś linku do własnego konta, różnice w czasie odpowiedzi.
- Cookie odzyskiwania to ograniczenie na poziomie aplikacji, nie granica bezpieczeństwa: w środku jest zwykła sesja Supabase.

## Success Criteria (Summary)

- Osoba bez hasła odzyskuje konto sama, na telefonie, bez pisania do autora.
- Nie da się z ekranu resetu dowiedzieć, czy adres ma konto (poza przyjętą różnicą czasu).
- Link działa raz, a przed zapisaniem nowego hasła nie daje dostępu do apteczki.
