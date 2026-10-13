# Faza 1 planu testów — poprawność werdyktu sprawdzenia — Plan Brief

> Full plan: `context/changes/testing-check-verdict-correctness/plan.md`
> Research: `context/changes/testing-check-verdict-correctness/research.md`

## What & Why

Dodajemy narzędzie do testów (Vitest) i testy, które pilnują dwóch najgroźniejszych pomyłek sprawdzenia leku: „nie masz” dla leku, który jest w apteczce, oraz „ta sama substancja” dla leku, który jej nie ma. Największa obawa autora to fałszywe „nie masz”, a PRD uznaje fałszywe wskazanie tej samej substancji za gorsze niż brak odpowiedzi.

## Starting Point

Reguła w bazie ma skrypt z 17 przypadkami, który działa w CI. Logika zamieniająca wynik reguły na werdykt siedzi w komponencie ekranu i nie ma żadnego testu, a nieznana odpowiedź z bazy po cichu pokazuje „Nie masz tego leku”. Projekt nie ma narzędzia do testów.

## Desired End State

Każdy przypadek reguły jest sprawdzany na prawdziwej bazie i przepuszczany przez tę samą logikę werdyktu, której używa ekran. Ekran ma test, który potwierdza zastrzeżenie o farmaceucie przy każdej tej samej substancji. Odpowiedź, której aplikacja nie rozumie, pokazuje błąd z przyciskiem „Spróbuj ponownie” zamiast „nie masz”. Autor ma listę nazw powszechnych z pełnego rejestru, które mogą łączyć różne leki, i decyzję dla każdej.

## Key Decisions Made

| Decision                                 | Choice                                                          | Why (1 sentence)                                                                            | Source   |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Narzędzie do testów                      | Vitest 5 ze zwykłym plikiem konfiguracji, bez `getViteConfig()` | Pliki pod testem nie używają modułów Astro, a wtyczka Cloudflare psuje start Vitest.        | Research |
| Dopasowanie po samej nazwie powszechnej  | Poprawny wynik (D1), test to potwierdza                         | To zapisana decyzja z ręcznie sprawdzonymi parami; sole tej samej substancji się odnajdują. | Plan     |
| Inna sól i inna nazwa powszechna         | Jeden test jako znane ograniczenie                              | Ograniczenie jest widoczne, a zmiana reguły w tym miejscu od razu da o sobie znać.          | Plan     |
| Ogólniki spoza listy                     | Jednorazowy pomiar na pełnym rejestrze, ocenia autor            | Główna droga do fałszywego „ta sama substancja” zostaje zbadana na danych.                  | Plan     |
| Test ujawnia prawdziwy błąd              | Stop i pytanie do autora                                        | Żadna zmiana reguły nie wchodzi w zmianie testowej bez decyzji autora.                      | Plan     |
| Gdzie mieszka logika werdyktu            | Czysta funkcja w `src/lib/`                                     | Tanie testy każdej kombinacji i użycie tej samej funkcji w testach bazy.                    | Plan     |
| Nieznana albo niepełna odpowiedź         | Stan błędu z ponowieniem zamiast „nie masz”                     | Migracje idą na produkcję ręcznie, więc baza i aplikacja mogą się chwilowo różnić.          | Plan     |
| Testy reguły w bazie                     | Przeniesione do Vitest, skrypt usunięty                         | Jedno narzędzie i jeden format; wybór autora mimo kosztu przepisania 17 przypadków.         | Plan     |
| Test zastrzeżenia o farmaceucie          | Test komponentu (jsdom + Testing Library)                       | Sprawdza to, co widzi użytkownik, a Faza 2 i tak potrzebuje tego środowiska.                | Plan     |
| Testy bez bazy w CI                      | Dopiero w Fazie 4                                               | Zgodne z zamrożonym planem testów.                                                          | Plan     |
| Testy mutacyjne                          | Stryker jednorazowo na pliku z logiką werdyktu                  | Sprawdza, czy testy chronią werdykt, a nie tylko wykonują kod.                              | Plan     |
| Osobne komunikaty dla substancji i nazwy | Osobna zmiana później; tutaj testy pola `matchedBy`             | To zmiana funkcji i PRD, a przyszły komunikat dostanie sprawdzoną podstawę.                 | Plan     |

## Scope

**In scope:**

- Vitest z dwoma uruchomieniami: bez bazy (`npm test`) i z bazą (`npm run test:db`)
- Logika werdyktu w osobnym pliku i jej testy
- Bezpiecznik odpowiedzi (zmiana zachowania produkcyjnego) i jego testy
- Test komponentu wyniku
- 17 przeniesionych i 16 nowych przypadków reguły; podmiana kroku w zadaniu `smoke`, sprawdzona na roboczym pull requeście po etapie 5
- Jednorazowy pomiar nazw powszechnych na pełnym rejestrze
- Jednorazowe uruchomienie Strykera; aktualizacja planu testów, `AGENTS.md` i `README.md`

**Out of scope:**

- Zmiany reguły w bazie i nowe migracje
- Osobne komunikaty „ta sama substancja czynna” i „ta sama nazwa powszechna”
- Ocena prawna treści zastrzeżenia o farmaceucie lub lekarzu (PRD Open Question 5)
- Łączenie soli tej samej substancji
- Testy bez bazy i Stryker w CI
- Ilość równa zero, uprawnienie `anon`, etykieta „przeterminowany”
- Walidacja odpowiedzi po stronie serwera

## Architecture / Approach

Dwie warstwy testów połączone jednym mostem. Testy bez bazy sprawdzają czystą funkcję (odpowiedź → werdykt) i komponent z podmienioną odpowiedzią sieci. Testy na lokalnym Supabase sprawdzają regułę na syntetycznych danych w wycofywanej transakcji, a każdy wynik przechodzi przez bezpiecznik i funkcję werdyktu. Ten most łapie rozjazd nazw pól między SQL a aplikacją. Oczekiwane wyniki pochodzą z PRD, decyzji D1–D3, ręcznie sprawdzonych par i decyzji autora, nigdy z bieżącego wyniku kodu.

## Phases at a Glance

| Phase                              | What it delivers                                                 | Key risk                                                             |
| ---------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Narzędzie do testów             | Vitest, dwa pliki konfiguracji, polecenia, zależności            | JSX albo alias `@/` nie działa bez dodatkowej wtyczki                |
| 2. Logika werdyktu w osobnym pliku | Czysta funkcja i testy; ekran bez zmian                          | Przeniesienie kodu zmienia wygląd albo komunikat dla czytnika ekranu |
| 3. Bezpiecznik odpowiedzi          | Nieznana odpowiedź kończy się błędem z ponowieniem               | Zbyt surowy bezpiecznik odrzuca prawdziwe odpowiedzi                 |
| 4. Test komponentu wyniku          | Zastrzeżenie i stany awarii sprawdzone na wyrenderowanym tekście | Test zależny od czasu albo od dnia uruchomienia                      |
| 5. Testy reguły w Vitest           | 17 + nowe przypadki, most do werdyktu, skrypt usunięty, CI       | Nowy przypadek ujawnia błąd reguły i etap czeka na decyzję autora    |
| 6. Pomiar na pełnym rejestrze      | Lista podejrzanych nazw, trzy liczniki, porównanie z produkcją   | Lista za długa do ręcznej oceny                                      |
| 7. Stryker i dokumentacja          | Raport mutacji, wzorce w planie testów, opis poleceń             | Stryker nie współpracuje z Vitest 5                                  |

**Prerequisites:** Docker i lokalny Supabase dla etapów 5 i 6 (`npx supabase start`); pełny import rejestru dla etapu 6; gałąź `test/check-verdict-correctness`.
**Estimated effort:** około 4–5 sesji na 7 etapów; etapy 2 i 3 w trybie `/10x-tdd`, pozostałe przez `/10x-implement`.

## Open Risks & Assumptions

- Etap 3 zmienia zachowanie produkcyjne w zmianie testowej. Autor to zatwierdził; wycofanie to cofnięcie jednego commita.
- Do Fazy 4 testy bez bazy działają tylko lokalnie, więc regresja w logice werdyktu nie zablokuje wdrożenia.
- Zachowanie `lower()` dla polskich wielkich liter zależy od ustawień bazy. Jeśli test z etapu 5 nie przejdzie, to błąd reguły i decyzja autora.
- Pomiar z etapu 6 może wskazać ogólniki, które już dziś dają fałszywe „ta sama substancja” na produkcji. Poprawka reguły to osobna zmiana.
- Założenie: lista nazw powszechnych bez żadnej wspólnej substancji (z 419 grup) da się ocenić ręcznie. Wspólne pierwsze słowo nazwy substancji jest tylko podpowiedzią do sortowania i niczego nie odsiewa.

## Success Criteria (Summary)

- Gdy lek albo lek z tą samą substancją jest w apteczce, żaden test nie dopuszcza werdyktu „nie masz”, od reguły w bazie do ekranu.
- Zastrzeżenie o farmaceucie jest sprawdzone przy każdym wskazaniu tej samej substancji, a częściowe pokrycie składu i ogólniki nie dają takiego wskazania.
- Awaria albo niezrozumiała odpowiedź nigdy nie wygląda na ekranie jak „Nie masz tego leku”.
