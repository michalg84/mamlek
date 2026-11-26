---
project: MamLek
version: 1
status: draft
created: 2026-09-29
updated: 2026-11-26
prd_version: 3
main_goal: market-feedback
top_blocker: time
milestone_id: self-service-and-full-cabinet
milestone_seq: 2
milestone_status: open
---

# Roadmap: MamLek

> Wyprowadzone z `context/foundation/prd.md` (v3), jego Open Question 6 i opisów autora z 2026-11-25 i 2026-11-26. Pierwszy kamień milowy (M-1) jest zamknięty; jego pełny opis pozycji (F-01, S-01…S-18, z ryzykami i niewiadomymi) leży w `context/foundation/archive/2026-11-25-roadmap-first-pharmacy-check.md`, a streszczenia wyników w sekcji `## Done` poniżej.
> Edytuj w miejscu; kolejny kamień milowy kontynuuje ten plik.
> Wycinki poniżej są ułożone w kolejności zależności. Tabela "At a glance" jest spisem treści.

## Milestone

**M-2: Konto bez autora i cała szafka w apteczce** — Status: open

- **Intent:** Użytkownik, który zapomniał hasła albo chce odejść, załatwia to sam, bez pisania do autora, a w apteczce widzi całą zawartość szafki — także to, czego nie ma w rejestrze leków. Pierwsze jest warunkiem szerszego udostępnienia (rejestracja jest otwarta, a lista leków to dane o zdrowiu), drugie wyszło w teście importu ze zdjęć na telefonie.
- **Source materials:** `context/foundation/prd.md` (v3, Open Question 6 oraz Non-Goals: reset hasła i pozycje spoza rejestru) i opisy autora: 2026-11-25 („reset hasła i usunięcie konta”) oraz 2026-11-26 (pozycje spoza rejestru i podpowiedzi z raz dodanych pozycji, po teście importu ze zdjęć); kotwice poniżej.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: Użytkownik, który zapomniał hasła, odzyskuje dostęp do konta bez udziału autora (dziś resetuje je autor w panelu Supabase).
  - MS-02: Użytkownik sam usuwa swoje konto razem z apteczką (lista leków to dane o zdrowiu, RODO).
  - MS-03: Użytkownik trzyma w apteczce także rzeczy spoza rejestru (żele, kremy, suplementy, wyroby medyczne) jako wyraźnie oznaczone pozycje, które nie biorą udziału w porównaniu substancji.
  - MS-04: Raz wpisana pozycja spoza rejestru, razem z wielkością opakowania, wraca jako podpowiedź przy następnym dodawaniu; użytkownik wybiera ją albo wpisuje inną wielkość.

## Vision recap

Domowa apteczka w gospodarstwie z trójką dzieci jest szufladą, której zawartości nie da się sprawdzić z gabinetu ani z apteki — w efekcie kupowane są drugie opakowania leków, które już leżą w domu, i część z nich się przeterminowuje. MamLek odróżnia od istniejących aplikacji to, że porównuje leki po substancji czynnej na podstawie Rejestru Produktów Leczniczych, traktuje apteczkę jako wspólny zasób domu i pozwala wprowadzić ją masowo zamiast pozycja po pozycji.

## North star

**S-19: Użytkownik, który zapomniał hasła, sam odzyskuje konto** — przy celu „jak najszybciej do prawdziwego użycia” to ten wycinek jest dziś realnie odczuwalny: rejestracja jest otwarta, po S-18 hasła są dłuższe (łatwiej je zapomnieć), a zablokowany użytkownik nie ma żadnej drogi poza pisaniem do autora.

> „North star” (gwiazda przewodnia) oznacza tu najmniejszy pełny przepływ, którego udane dowiezienie udowadnia główną hipotezę kamienia milowego — dlatego stoi pierwszy: usuwanie konta ma sens dopiero wtedy, gdy konto da się odzyskać. Decyzja autora z 2026-11-26: reset przed pozycjami spoza rejestru; proponowana kolejność to S-19, S-21, S-22, S-20.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                                 | Prerequisites | PRD refs                                         | Status      |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ | ----------- |
| S-19 | password-reset           | odzyskać konto po zapomnieniu hasła przez link w e-mailu i ustawić nowe hasło zgodne z regułą z S-18 | —             | MS-01, FR-013, Access Control, Open Question 6   | in-progress |
| S-21 | off-registry-items       | dodać do apteczki rzecz spoza rejestru (ręcznie lub z CSV) i widzieć ją na liście z oznaczeniem      | —             | MS-03, FR-003, FR-005, FR-009, FR-011, Non-Goals | ready       |
| S-22 | off-registry-suggestions | dostać wcześniej wpisaną pozycję spoza rejestru jako podpowiedź, z wielkością opakowania             | S-21          | MS-04                                            | proposed    |
| S-20 | account-deletion         | usunąć swoje konto razem z apteczką po ponownym podaniu hasła                                        | —             | MS-02, Access Control, Open Question 6           | ready       |

## Streams

Pomoc w nawigacji — grupuje pozycje, które dzielą łańcuch Prerequisites. Wiążąca kolejność nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Theme                | Chain           | Note                                                                                                                                 |
| ------ | -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A      | Odzyskanie konta     | `S-19`          | Gwiazda przewodnia M-2, pierwsza w kolejności; zaczyna od wbudowanej poczty Supabase, wybór własnego SMTP to niewiadoma bez blokady. |
| C      | Cała szafka          | `S-21` → `S-22` | Po S-19 (decyzja autora o kolejności, nie zależność techniczna).                                                                     |
| B      | Odejście z aplikacji | `S-20`          | Niezależny technicznie od A i C; proponowany jako ostatni.                                                                           |

## Baseline

Co już jest w kodzie na dzień `2026-11-25` (sprawdzone w tej sesji grepem po repozytorium; poprzedni stan z `2026-09-29` w archiwum).
Foundations poniżej zakładają, że to istnieje, i NIE tworzą tego ponownie.

- **Frontend:** present — Astro 7 SSR z wyspami React 19, Tailwind 4, shadcn/ui; ekrany logowania i rejestracji po polsku (`src/components/auth/`, `src/pages/auth/`), ekran zmiany hasła `src/pages/konto/haslo.astro`. Brak ekranu „konto” poza zmianą hasła i brak linku „nie pamiętasz hasła” na logowaniu.
- **Backend / API:** present — `src/pages/api/auth/{signin,signup,signout,password}.ts` oraz API apteczki; middleware z bramką wymuszonej zmiany hasła i limitami sesji (S-18). Brak endpointu resetu i usunięcia konta.
- **Data:** present — `kit_items.user_id` ma `references auth.users (id) on delete cascade` (`supabase/migrations/20261007120000_kit_items.sql:17`), więc apteczka znika razem z kontem; RLS izoluje konta. Każda pozycja apteczki musi wskazywać opakowanie z rejestru (`package_id not null`), a odczyt apteczki i `medicine_check` łączą ją z rejestrem przez inner join. Żadna funkcja w `public` nie jest `security definer` (pilnuje tego `tests/db/kit-access.test.ts`).
- **Auth:** present / partial — e-mail + hasło, reguła 12 znaków (S-18), zmiana znanego hasła. Brak resetu zapomnianego hasła i brak samodzielnego usunięcia konta. W kodzie są tylko `SUPABASE_URL` i `SUPABASE_KEY` (klucz publiczny, `astro.config.mjs`); klucza serwisowego nie ma.
- **E-mail:** absent — własnego SMTP nie ma (`[auth.email.smtp]` w `supabase/config.toml` jest zakomentowane); produkcja używa wbudowanej poczty Supabase z niskim limitem wiadomości na godzinę. Czy produkcja wymaga potwierdzenia e-maila, nie jest sprawdzone (README: w chmurze domyślnie tak).
- **Deploy / infra:** present — Cloudflare Workers + CI (`ci`, `smoke`) i automatyczne wdrożenie po merge'u; dzienny import rejestru z keepalive.
- **Observability:** partial — włączone observability Workers; brak śledzenia błędów (bez zmian od 2026-09-29, nie sprawdzane ponownie).

## Foundations

Brak. Zmiana `kit_items` pod pozycje spoza rejestru należy do S-21. Własny SMTP potrzebny do resetu wchodzi do S-19 jako niewiadoma, a mechanizm usunięcia konta do S-20 — żaden z nich nie jest samodzielnym krokiem poprzedzającym wycinki (reguła stopniowego odsłaniania).

## Slices

### S-19: Reset zapomnianego hasła bez udziału autora

- **Outcome:** użytkownik, który zapomniał hasła, na ekranie logowania prosi o link na swój adres e-mail, z linku ustawia nowe hasło zgodne z regułą z S-18 (12 znaków, spoza listy popularnych, inne niż e-mail) i wchodzi do aplikacji; odpowiedź na prośbę jest taka sama dla adresu, który ma konto, i dla takiego, który go nie ma; wszystkie teksty po polsku.
- **Change ID:** password-reset
- **PRD refs:** MS-01, FR-013, Access Control, Open Question 6
- **Prerequisites:** — (S-15 ekrany logowania i S-18 reguła hasła oraz `/konto/haslo` są zrobione w M-1)
- **Parallel with:** S-20 (nie dotykają tych samych plików; wspólny tylko ekran konta)
- **Blockers:** —
- **Unknowns:**
  - Własny SMTP: wbudowana poczta Supabase wysyła tylko kilka e-maili na godzinę, więc przy kilku prośbach naraz część osób nie dostanie linku. Wycinek zaczyna od niej; wybór dostawcy, domeny nadawcy i konfiguracji DNS to osobna decyzja autora, ręczna w panelu jak `db push`. — Owner: autor. Block: no.
  - Zmiana PRD: zdjąć „Reset hasła” z Non-Goals, dopisać wymaganie (np. FR-017) i opis w Access Control, uzupełnić Open Question 6 — w fazie dokumentacji tego wycinka, jak w S-18. — Owner: autor. Block: no.
  - Jak reset współgra z regułą z S-18: link prowadzi do ekranu z tym samym sprawdzeniem hasła i znacznikiem `password_change_required`; czy reset kończy też inne sesje konta; jak wygląda limit prób (`[auth.rate_limit]`) i komunikat po polsku. — Owner: autor. Block: no.
  - Ustawienia produkcji ręcznie w panelu: `site_url`, adresy przekierowań, szablon e-maila po polsku. — Owner: autor. Block: no.
- **Risk:** Stoi pierwszy, bo odblokowuje użytkownika, a nie wymaga nowej infrastruktury poza ustawieniem poczty. Ryzyka: wyliczanie kont (odpowiedź musi być taka sama dla istniejącego i nieistniejącego adresu), nadużycie jako wysyłka spamu na cudzy adres (limity), link wielokrotnego użytku lub długo ważny (`otp_expiry`). Dotyka ekranów logowania i `/konto/haslo`, więc nie równolegle z innymi zmianami tych plików.
- **Status:** in-progress

### S-21: Pozycje spoza rejestru w apteczce

- **Outcome:** użytkownik dodaje do apteczki rzecz, której nie ma w rejestrze (np. syrop będący wyrobem medycznym, krem, suplement) — nazwa własna, opcjonalnie ilość i data ważności — ręcznie albo przy niedopasowanym wierszu importu CSV; widzi ją na liście z oznaczeniem „spoza rejestru”, może ją edytować i usunąć, a sprawdzenie leku nie bierze jej pod uwagę i mówi, ile takich pozycji nie jest sprawdzanych.
- **Change ID:** off-registry-items
- **PRD refs:** MS-03, FR-003, FR-005, FR-009, FR-011, Non-Goals
- **Prerequisites:** —
- **Parallel with:** — (zaczyna się po S-19: decyzja autora o kolejności)
- **Blockers:** —
- **Unknowns:**
  - Zmiana PRD: zdjąć „Pozycje spoza rejestru” z Non-Goals i przepisać bezpiecznik „żaden lek nie wchodzi do apteczki jako tekst” — pozycja tekstowa nie jest dla aplikacji lekiem i nigdy nie daje wyniku „masz”. — Owner: autor. Block: no.
  - Jakie pola ma pozycja poza nazwą (rodzaj, wielkość opakowania i jednostka g / ml / szt.) i jak ma się do nich dzisiejsza `quantity` w sztukach; pola wielkości warto zaplanować od razu pod S-22. — Owner: autor. Block: no.
  - Które niedopasowane wiersze z testu na zdjęciach to naprawdę produkty spoza rejestru, a które to zarejestrowane leki, których dopasowanie nie znalazło (np. przez literówkę czatu); przydadzą się prawdziwe CSV z testu. — Owner: autor. Block: no.
  - Czy sprawdzenie ma pokazywać pozycję spoza rejestru o podobnej nazwie; rekomendacja: nie w tym wycinku, tylko licznik niesprawdzanych. — Owner: autor. Block: no.
  - Czy zmienić prompt dla czatu (np. kolumny z rodzajem i wielkością opakowania). — Owner: autor. Block: no.
- **Risk:** Prawdziwy lek wpisany jako tekst (bo czat źle odczytał nazwę) dałby przy sprawdzeniu „Nie masz”. Dlatego propozycje z rejestru są pokazane pierwsze, a „spoza rejestru” to świadomy wybór dla każdego wiersza, nigdy automat ani akcja zbiorcza. Zmienia `kit_items` (migration, `db push` ręcznie), odczyt apteczki (inner join ukryłby takie pozycje), API, import, listę i edycję; `medicine_check` ma je pomijać i to trzeba przypiąć testem.
- **Status:** ready

### S-22: Podpowiedzi z raz dodanych pozycji spoza rejestru

- **Outcome:** użytkownik, który raz wpisał pozycję spoza rejestru z wielkością opakowania (np. żel w tubce 20 g), przy następnym dodawaniu i imporcie dostaje ją jako podpowiedź; wybiera zapamiętaną wielkość albo wpisuje inną (wartość i jednostka), która też zostaje zapamiętana.
- **Change ID:** off-registry-suggestions
- **PRD refs:** MS-04
- **Prerequisites:** S-21
- **Parallel with:** S-20 (inne dane i ekrany; uzgodnić kaskadę usuwania, jeśli powstanie nowa tabela)
- **Blockers:** —
- **Unknowns:**
  - Skąd biorą się podpowiedzi: z istniejących pozycji apteczki (znikają po usunięciu ostatniej) czy z osobnego, trwałego katalogu domu (nowa tabela z RLS); „raz dodany staje się proponowany” przemawia za katalogiem. — Owner: autor. Block: no.
  - Zakres: tylko własne podpowiedzi konta (rekomendacja) czy wspólne dla wszystkich — wspólne oznaczałyby cudzy tekst i dane o zdrowiu widoczne dla innych. — Owner: autor. Block: no.
  - Wielkość opakowania: lista wyboru, podpowiedź czy dowolne pole; zestaw jednostek; czy użytkownik może poprawić lub usunąć zapamiętaną pozycję. — Owner: autor. Block: no.
  - Jak własne podpowiedzi stoją obok podpowiedzi z rejestru (osobna grupa, zawsze niżej, z oznaczeniem). — Owner: autor. Block: no.
- **Risk:** Zapamiętana literówka wraca jako podpowiedź, a własne pozycje mogą przesłonić prawdziwy lek z rejestru w polu wyszukiwania. Dotyka formularza dodawania i importu, które zmienia S-21, więc dopiero po nim.
- **Status:** proposed

### S-20: Usunięcie konta razem z apteczką

- **Outcome:** zalogowany użytkownik na ekranie konta usuwa swoje konto po ponownym podaniu hasła i potwierdzeniu; razem z kontem znika jego apteczka, a po usunięciu nie da się zalogować starym hasłem ani wejść na chronione strony starą sesją; ekran jasno mówi, że operacja jest nieodwracalna.
- **Change ID:** account-deletion
- **PRD refs:** MS-02, Access Control, Open Question 6
- **Prerequisites:** — (S-15 i S-18 są zrobione w M-1)
- **Parallel with:** S-19 (nie dotykają tych samych plików; wspólny tylko ekran konta), S-22 (jeśli doda nową tabelę, ma ona kasować się razem z kontem)
- **Blockers:** —
- **Unknowns:**
  - Mechanizm usunięcia: użytkownik z kluczem publicznym nie może skasować siebie w Supabase. Opcje: klucz serwisowy jako sekret Workers używany tylko w jednym endpoincie, funkcja w bazie z `security definer` (dziś test pilnuje, że żadna nie jest, więc to świadomy wyjątek) albo Edge Function. Wybór decyduje o nowym sekrecie i o powierzchni ataku. — Owner: autor. Block: no.
  - Zakres danych: apteczka znika kaskadą z `auth.users`; do ustalenia, co jeszcze zostaje (kopie zapasowe Supabase, logi) i co o tym napisać. — Owner: autor. Block: no.
  - Informacja o prywatności (RODO) to osobny punkt pytania 13: dołożyć ją do tego wycinka, czy zostawić osobno. — Owner: autor. Block: no.
  - Czy usunięcie jest natychmiastowe i bezpowrotne, czy z okresem karencji; rekomendacja do planu: natychmiast, po ponownym podaniu hasła (jak zmiana hasła). — Owner: autor. Block: no.
  - Zmiana PRD: dopisać wymaganie (np. FR-018) i opis w Access Control. — Owner: autor. Block: no.
- **Risk:** Operacja nieodwracalna na danych o zdrowiu, więc błąd w sprawdzeniu właściciela lub w kaskadzie jest kosztowny: musi usuwać tylko konto z sesji (nigdy identyfikator z żądania), a test `kit-access` musi pozostać prawdziwy. Pierwsze miejsce w aplikacji, które wymaga uprawnień administracyjnych Supabase. Stoi po S-19, bo usunięcie konta ma sens dopiero wtedy, gdy konto da się odzyskać; nie blokuje go jednak formalnie.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                             | Ready for `/10x-plan` | Notes                                                         |
| ---------- | ------------------------ | ------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| S-19       | password-reset           | Reset zapomnianego hasła bez udziału autora       | yes                   | MS-01, FR-013; zdjąć z Non-Goals PRD; niewiadoma: własny SMTP |
| S-21       | off-registry-items       | Pozycje spoza rejestru w apteczce                 | yes                   | MS-03; po S-19; zdjąć z Non-Goals PRD                         |
| S-22       | off-registry-suggestions | Podpowiedzi z raz dodanych pozycji spoza rejestru | no                    | MS-04; czeka na S-21                                          |
| S-20       | account-deletion         | Usunięcie konta razem z apteczką                  | yes                   | MS-02; niewiadoma: mechanizm usunięcia (uprawnienia admina)   |

## Open Roadmap Questions

1. **Jak działają istniejące aplikacje do apteczki i czy któraś oferuje wyszukiwanie zamiennika?** — konkurencja nie została sprawdzona. Owner: autor. Block: roadmap-wide (nie blokuje planowania).
2. **Jaką metodą loguje się użytkownik do konta domu?** — **Rozstrzygnięte 2026-11-16 (PRD v3, Access Control):** e-mail i hasło, jak w Baseline; rejestracja jest otwarta i każdy dom zakłada konto sam, na własny e-mail (decyzja autora 2026-11-16, zmienia wcześniejsze „wyłączona”). Co dołożyć przed szerszym udostępnieniem — pytanie 13. Owner: autor. Block: — (nie blokuje).
3. **Ile dni przed końcem ważności aplikacja ostrzega?** — okres do ustalenia. Owner: autor. Block: S-08 (nie blokuje planowania).
4. **Który poziom dopasowania substancji czynnych jest domyślny?** — bezpiecznik „fałszywe wskazanie gorsze niż brak odpowiedzi” przemawia za startem od poziomu precyzyjnego i świadomym rozluźnianiem przez użytkownika. Ryzyko przeciwne: przy pierwszym użyciu aplikacja częściej odpowie „nie masz” i może wyjść na bezużyteczną. Owner: autor. Block: S-03, S-06 (nie blokuje planowania).
5. **Czy produkty wycofane z obrotu zostają w kopii rejestru i w podpowiedziach?** — w kopii zostają: import nigdy nie kasuje produktów, tylko ustawia `removed_at` (`scripts/registry-import.mjs:234-244`), a pozycja już w apteczce zostaje z etykietą „wycofany z rejestru”. W podpowiedziach i przy dodawaniu dziś nie: lista bierze tylko `removed_at is null`, a dodanie i import odrzucają wycofane opakowanie. Leków wycofanych przed pierwszym importem (październik 2026) w bazie nie ma wcale. **Rozstrzygnięte 2026-11-16 (audyt F15):** lek wycofany z rejestru ma dać się znaleźć, dodać, zaimportować i sprawdzić — wycinek S-13 (`withdrawn-medicine-in-kit`). **Rozwiązane w S-13 (2026-11-16):** podpowiedzi pokazują wszystkie wycofane warianty, które są w bazie, z oznaczeniem „wycofany z rejestru” i za aktywnymi w obrębie poziomu dopasowania; dodanie, import i zmiana opakowania przyjmują wycofane opakowanie. Leków wycofanych przed pierwszym importem w bazie nie ma, więc nie ma ich też w podpowiedziach. Owner: autor. Block: — (nie blokuje).
6. **Czy zastrzeżenie przy wyniku „ta sama substancja czynna” spełnia wymagania prawne?** — FR-012 wymaga zastrzeżenia o konsultacji z farmaceutą lub lekarzem, ale jego treści nikt nie sprawdził pod kątem prawnym: czy potrzebna jest inna formuła, zastrzeżenie o braku porady medycznej i czy samo wskazanie leku z tą samą substancją nie jest traktowane jako porada albo reklama produktu leczniczego. Tekst na ekranie różni się od sformułowania w PRD; weryfikacja ma wskazać jedną wersję (PRD Open Question 5). Owner: autor. Block: S-06 (nie blokuje planowania).
7. **Czy obcinać spacje na początku i końcu w kluczu wariantu leku?** — pomiar na pełnym rejestrze (2026-10-08) znalazł 6 par produktów (49 produktów), których klucz różni się tylko końcową lub podwójną spacją w mocy (np. `dermovate 0,5 mg/ml` i `dermovate 0,5 mg/ml `); reguła traktuje je jako dwa leki. Autor zdecydował, że jedyną zmianą będzie obcinanie spacji na początku i końcu — wycinek S-14 (`variant-key-btrim`, dopisany po audycie 2026-11-16, F4). Klucz bez `btrim` jest w czterech miejscach: `medicine_check.sql:165-167`, `registry_search_list_version.sql:49`, `kit_items.sql:112-114` i `src/lib/kit-import.ts:113-115`. Pozycja przechodzi też przez porównanie zbiorów substancji, więc dzisiejszy skutek to raczej „ta sama substancja” z zastrzeżeniem niż „Nie masz” — do potwierdzenia testem w S-14. Źródło: `context/changes/testing-check-verdict-correctness/placeholder-measurement.md`. **Rozwiązane w S-14 (2026-11-17):** klucz wariantu obcina spacje na początku i końcu każdej części (`btrim` w SQL, `trim` w kliencie), w pięciu miejscach naraz; po zmianie na lokalnej bazie 5 par łączy się w jeden wariant (16 278 → 16 273). Podwójne i twarde spacje zostają bez zmian. Owner: autor. Block: — (nie blokuje).
8. **Czy któraś z 351 nazw powszechnych łączących leki o rozłącznym składzie jest ogólnikiem?** — ten sam pomiar wypisał nazwy powszechne (spoza listy ogólników), pod którymi są produkty o zupełnie różnych zbiorach substancji; reguła uznaje je za „tę samą substancję”. Powtórzony 2026-11-16 (audyt F6) daje 351 nazw i 9 236 par (2026-10-08: 309 nazw). Przejrzane przykłady to ta sama substancja zapisana inaczej (naproxenum / naproxenum natricum, fluorouracilum / 5-fluorouracilum), ale całej listy nikt nie ocenił. Do rozstrzygnięcia, czy któraś to prawdziwy ogólnik do dodania do listy w regule, czy ta sama substancja w innej soli lub nazwie; pomiar powtarza się poleceniem z `placeholder-measurement.sql`. Źródło: j.w. Owner: autor. Block: S-06 (nie blokuje planowania).
9. **Czy podpowiedzi mają porządkować moce liczbowo?** — reguła S-01 porównuje moc jako tekst, więc dla tej samej nazwy „1000 mg” stoi przed „500 mg”. Test reguły (`src/lib/registry-search.test.ts`) celowo przypina tylko moce o tej samej liczbie cyfr, gdzie oba porządki są zgodne. Zmiana dotyka sortowania w `src/lib/registry-search.ts` i pliku wzorcowego `search:check`. Źródło: `test-plan.md` §6.6 (Faza 2, decyzja autora 2026-10-16). **Rozstrzygnięte 2026-10-16: tak** — wycinek S-11 (`search-numeric-strength-order`). Owner: autor. Block: — (nie blokuje).
10. **Czy reguła ogólników pomija nazwy powszechne innego kształtu?** — `medicine_check_is_generic` rozpoznaje listę i przedrostki „produkt ” / „preparat ”; nazwa w rodzaju „Species sedativae” (mieszanki ziołowe) zostaje dopasowywalna, więc dwa niezwiązane produkty z tą nazwą dałyby fałszywe „ta sama substancja”. To główna otwarta droga do takiego fałszywego wyniku; łączy się z pytaniem 8 (pomiar 2026-11-16: 351 nazw powszechnych z rozłącznymi zbiorami substancji). Powtórzyć pomiar, jeśli pojawi się zgłoszenie fałszywego „ta sama substancja”. Źródło: impl-review `medicine-check` (F1, blind spot), research `testing-check-verdict-correctness` (G17). Owner: autor. Block: S-06 (nie blokuje planowania).
11. **Czy odczytywać `etykietoUlotka` albo pokazać komunikat, gdy produkt nie ma linku do ulotki?** — 18 produktów ludzkich w migawce rejestru z 2026-10-21 ma w pliku tylko `etykietoUlotka` (bez `ulotka` i `ulotkaImportRownolegly`), więc parser zapisuje im pusty `leaflet_url`. Aplikacja dziś w ogóle nie pokazuje linku do ulotki (`leaflet_url` nie jest używane w `src/`), więc pytanie dotyczy dopiero przyszłego ekranu z ulotką. To brak funkcji, nie błąd integralności; zachowanie przypięte testem „pinned:” w `tests/registry/rpl-parser.test.ts`. Do rozstrzygnięcia: czy parser ma odczytywać `etykietoUlotka` jako zapasowe źródło, czy UI ma pokazywać komunikat „brak ulotki w rejestrze”. Źródło: `test-plan.md` §6.6 (Faza 5). Owner: autor. Block: — (nie blokuje).
12. **Czy zabezpieczyć dzienny import rejestru przed wyłączeniem harmonogramu po 60 dniach bez aktywności (keepalive)?** — **Rozstrzygnięte 2026-11-16 (audyt F7): tak, po M-1** — wycinek S-16 (`registry-import-keepalive`), tam opcje i ryzyko. Owner: autor. Block: — (nie blokuje).
13. **Co dołożyć, zanim aplikacja trafi szerzej do innych użytkowników?** — rejestracja jest otwarta (PRD v3, Access Control). Na potem (autor, 2026-11-16): własny serwer SMTP (wbudowana poczta Supabase wysyła kilka e-maili na godzinę), sprawdzenie, że produkcja wymaga potwierdzenia e-maila, informacja o prywatności i usunięcie konta (lista leków to dane o zdrowiu, RODO) razem z resetem hasła bez udziału autora, ochrona przed botami (CAPTCHA), gdyby pojawiły się masowe rejestracje. **Rozstrzygnięte częściowo 2026-11-25 (kamień milowy M-2):** reset hasła to wycinek S-19 (`password-reset`, własny SMTP jako jego niewiadoma), usunięcie konta to wycinek S-20 (`account-deletion`). Otwarte zostają: informacja o prywatności (do S-20 albo osobno), sprawdzenie potwierdzania e-maila na produkcji i CAPTCHA; każdy z nich może stać się wycinkiem przy następnym `/10x-roadmap`. Źródło: PRD Open Question 6. Owner: autor. Block: — (nie blokuje).

## Parked

- **FR-015: Sprawdzenie kilku nazw leków naraz** — Why parked: nice-to-have; pętla po logice z S-03, więc da się dołożyć bez przebudowy w kolejnym kamieniu milowym (główne ryzyko: czas).
- **Ostrzeganie o interakcjach i przeciwwskazaniach** — Why parked: PRD §Non-Goals — aplikacja nie jest doradcą medycznym.
- **Ceny leków i liczenie oszczędności** — Why parked: PRD §Non-Goals — rejestr nie niesie cen.
- **Dzielenie apteczki między gospodarstwami, zapraszanie użytkowników** — Why parked: PRD §Non-Goals — jedno konto na dom.
- **Integracja z e-receptą / Internetowym Kontem Pacjenta** — Why parked: PRD §Non-Goals.
- **Kamera i OCR w aplikacji** — Why parked: PRD §Non-Goals — zdjęcie przetwarza zewnętrzny czat AI, aplikacja przyjmuje CSV.
- **Skanowanie grupowe opakowań, ulotki, analiza e-recepty** — Why parked: PRD §Non-Goals.
- **Odejmowanie dawek i śledzenie zażyć** — Why parked: PRD §Non-Goals.
- **Plan leczenia i powiadomienia o porach przyjmowania** — Why parked: PRD §Non-Goals.
- **Historia importów i stanów apteczki** — Why parked: PRD §Non-Goals.
- **Eksport apteczki do pliku** — Why parked: PRD §Non-Goals — kandydat na pierwsze zadanie po MVP.
- **Rejestr suplementów (np. GIS) jako druga baza i substancje wpisywane ręcznie** — Why parked: pozycje spoza rejestru wchodzą jako tekst bez porównywania substancji (S-21); druga baza nie obejmuje wyrobów medycznych i wymaga sprawdzenia dostępności danych, a ręczne substancje łamią bezpiecznik „fałszywe wskazanie gorsze niż brak odpowiedzi”.
- **Koszyk do konsultacji** — Why parked: PRD §Non-Goals; pokrywa się częściowo z FR-015.
- **Tryb offline** — Why parked: PRD §Non-Goals.
- **Układ na duży ekran** — Why parked: PRD §Non-Goals — MVP na przeglądarkę mobilną.
- **Build na Androida** — Why parked: PRD §Non-Goals.
- **Autorski przegląd test-plan §6.5/§6.6 (Faza 5)** — Why parked: autor przyjął je bez przeglądu przy zamykaniu `testing-registry-import-scripts` (2026-10-23); kiedyś, bez terminu, do ewentualnej poprawy.
- **Zapis apteczki tylko przez aplikację (twarda granica w bazie)** — Why parked: opcjonalne zadanie po MVP; dziś limit ilości i zakres daty sprawdza tylko API (reguła „opakowanie nie jest wycofane" zniknęła w S-13: wycofane opakowanie jest dozwolone), więc zalogowany użytkownik mógłby własnym tokenem zapisać nieprawidłowe wartości we własnej apteczce (cudze dane są chronione RLS). Po S-05 doszły: reguła „to samo opakowanie w obrębie wariantu” też tylko w API, a dwa równoległe `PATCH` mogą zapisać ilość ponad rozmiar opakowania (audyt 2026-11-16). Opcje: odebrać roli `authenticated` INSERT/UPDATE/DELETE na `kit_items` i pisać przez funkcję w bazie albo klucz serwisowy; albo dołożyć CHECK-i w bazie. Źródło: impl-review `add-medicine-to-kit`, F2.
- **Pomiar ekranu importu z otwartym polem wyszukiwania** — Why parked: każde pole podpowiedzi tworzy własnego workera z własnym indeksem listy (ok. 2 MB), a na `/apteczka/import` działa obok workera dopasowań; nie ma pomiaru, czy to problem (w trybie ręcznego szukania jest zwykle jeden wiersz naraz). Najpierw zmierzyć ekran importu z otwartym polem (ręcznie albo rozszerzonym `npm run perf`), a współdzielenie workera rozważać dopiero, gdy pomiar pokaże problem. Źródło: audyt 2026-11-16, F13.
- **Drobne uwagi z przeglądu S-18 (`password-policy`)** — Why parked: świadomie niezałatane przy zamykaniu S-18 (2026-11-25), żadna nie blokuje działania: (1) middleware odpowiada na zablokowany formularz kodem 403 z JSON-em zamiast przekierowaniem na `/konto/haslo`; (2) błąd `signOut({ scope: "others" })` po zmianie hasła jest tylko logowany, bez komunikatu dla użytkownika; (3) jeśli zdjęcie znacznika `password_change_required` się nie powiedzie, konto trafia na tę samą stronę przy kolejnym logowaniu; (4) limit 90 dni sesji liczony z `amr` zaczyna się od nowa po zmianie hasła. Do podjęcia, gdy któraś zacznie przeszkadzać użytkownikom. Źródło: przegląd kodu S-18.
- **Logo i identyfikacja wizualna aplikacji** — Why parked: aplikacja nie ma jeszcze logo; maile resetu i zmiany hasła (S-19) używają tymczasowego, niezatwierdzonego: biały krzyżyk na zaokrąglonym kwadracie w kolorze `--primary` (`#007a78`) i napis „MamLek”, złożone z tabel HTML bez obrazków, w `supabase/templates/`. Przy pracy nad wyglądem strony i logo podmienić je też w obu szablonach i w panelu produkcyjnego projektu Supabase. Kiedyś, bez terminu.

## Milestone History

- **M-1: Pierwsze sprawdzenie leku w aptece** (`first-pharmacy-check`) — opened 2026-09-29, closed 2026-11-25. Wszystkie pozycje (F-01, S-01…S-18) są `done`; S-16, S-17 i S-18 powstały już po zaplanowaniu M-1 i zostały domknięte razem z nim. Wyniki: sekcja `## Done` poniżej; pełna roadmapa M-1 (grafy zależności, ryzyka i niewiadome każdej pozycji): `context/foundation/archive/2026-11-25-roadmap-first-pharmacy-check.md`.

## Done

- **F-01: (foundation) kopia Rejestru Produktów Leczniczych — produkty z nazwą, nazwą powszechnie stosowaną, mocą, postacią i listą substancji czynnych — jest wczytana do bazy importem, który można uruchomić ponownie bez ręcznego sprzątania, a podmiana danych jest atomowa.** — Archived 2026-10-01 → `context/archive/2026-10-01-registry-copy-load/`. Lesson: —.
- **S-01: użytkownik po zalogowaniu wpisuje pierwsze litery i widzi podpowiedzi z rejestru — nazwa produktu razem z mocą i postacią — z pierwszeństwem nazwy produktu przed nazwą powszechnie stosowaną i substancjami czynnymi.** — Archived 2026-10-02 → `context/archive/2026-10-02-registry-search-suggestions/`. Lesson: —.
- **S-09: na słabym telefonie użytkownik może zacząć wyszukiwać lek na `/szukaj` bez długiego czekania na wczytanie listy, a wpisywanie nazwy nie zacina się — także wtedy, gdy zacznie pisać, zanim lista się wczyta.** — Archived 2026-10-07 → `context/archive/2026-10-06-registry-search-performance/`. Lesson: —.
- **S-02: użytkownik dodaje do apteczki domu lek wskazany z podpowiedzi rejestru, opcjonalnie z datą ważności i pozostałą ilością, a brak którejś z nich widzi wprost jako „nieznane”; apteczka jest widoczna wyłącznie po zalogowaniu na konto domu.** — Archived 2026-10-08 → `context/archive/2026-10-07-add-medicine-to-kit/`. Lesson: —.
- **S-07: użytkownik widzi w aplikacji datę ostatniej aktualizacji rejestru, a rejestr odświeża się sam codziennie; nieudane odświeżenie jest zgłaszane autorowi, zamiast przejść po cichu.** — Archived 2026-10-09 → `context/archive/2026-10-07-daily-registry-refresh/`. Lesson: —.
- **S-03: użytkownik wpisuje nazwę jednego leku, wybiera pozycję z podpowiedzi i widzi jedną z odpowiedzi — masz ten lek / masz lek z tą samą substancją czynną / nie masz — z substancjami czynnymi, mocą i postacią po obu stronach porównania, ilością i datą ważności posiadanych pozycji oraz zastrzeżeniem o konsultacji z farmaceutą lub lekarzem przy wyniku z tą samą substancją.** — Archived 2026-10-10 → `context/archive/2026-10-09-medicine-check/`. Lesson: —.
- **S-10: gdy użytkownik zmieni wpisaną nazwę w formularzu dodawania na `/apteczka`, formularz opakowania poprzednio wybranego leku znika i nie da się dodać leku, którego nie ma już w polu — do apteczki trafia tylko lek wybrany z podpowiedzi dla bieżącego tekstu.** — Archived 2026-10-29 → `context/archive/2026-10-29-kit-add-form-reset-on-edit/`. Lesson: —.
- **S-04: wprowadzić apteczkę z CSV przez ekran zatwierdzenia, na którym każdy wiersz ma rekord rejestru lub propozycje do wyboru; wiersz bez dopasowania blokuje przejście dalej, wiersz z lekiem już posiadanym jest oznaczony „już masz”, a leki trafiają do apteczki dopiero po zatwierdzeniu.** — Archived 2026-11-04 → `context/archive/2026-11-01-csv-kit-import/`. Lesson: —.
- **S-05: użytkownik przegląda całą apteczkę na jednym ekranie, zmienia i usuwa pozycje oraz poprawia pozostałą ilość bezpośrednio na liście — ten sam ekran służy przeglądowi apteczki przed wizytą u lekarza.** — Archived 2026-11-14 → `context/archive/2026-11-04-kit-browse-edit/`. Lesson: —.
- **S-13: użytkownik znajduje w podpowiedziach także lek wycofany z rejestru — z oznaczeniem „wycofany z rejestru” i niżej w kolejności niż leki aktualne — i może go dodać do apteczki, zaimportować z CSV oraz sprawdzić przeciwko apteczce; lek kupiony przed wycofaniem da się więc wprowadzić i utrzymywać.** — Archived 2026-11-16 → `context/archive/2026-11-16-withdrawn-medicine-in-kit/`. Lesson: —.
- **S-14: użytkownik dostaje „Masz ten lek” także wtedy, gdy rejestr zapisał moc lub postać tego samego leku z dodatkową spacją na początku lub końcu (np. `dermovate 0,5 mg/ml` i `dermovate 0,5 mg/ml `), a podpowiedzi i import traktują je jako jeden wariant.** — Archived 2026-11-17 → `context/archive/2026-11-17-variant-key-btrim/`. Lesson: —.
- **S-11: użytkownik widzi warianty leku o tej samej nazwie w podpowiedziach w kolejności rosnącej mocy liczbowej — „500 mg” przed „1000 mg” — a nie w kolejności tekstowej.** — Archived 2026-11-17 → `context/archive/2026-11-17-search-numeric-strength-order/`. Lesson: —.
- **S-12: użytkownik podaje ilość leku tak, jak ją widzi — w tabletkach (sztukach) — także dla opakowań, które rejestr opisuje liczbą jednostek („1 butelka po 90 tabl.”, „2 blistry po 10 tabl.”), a aplikacja pokazuje tę ilość jednoznacznie, bez mieszania „butelek” z „tabletkami”.** — Archived 2026-11-17 → `context/archive/2026-11-17-kit-quantity-semantics/`. Lesson: —.
- **S-06: użytkownik wybiera poziom dopasowania — precyzyjny, zawiera wszystkie, zawiera jeden — widzi go przy wyszukiwaniu, a wynik sprawdzenia leku złożonego zmienia się zgodnie z wybranym poziomem.** — Archived 2026-11-17 → `context/archive/2026-11-17-substance-match-level/`. Lesson: —.
- **S-08: użytkownik widzi ostrzeżenie o zbliżającym się końcu ważności leku — razem z datą — na liście apteczki i przy wyniku sprawdzenia, gdy ma dany lek lub lek z tą samą substancją czynną.** — Archived 2026-11-18 → `context/archive/2026-11-18-expiry-warning/`. Lesson: —.
- **S-16: autor może polegać na tym, że dzienny import rejestru nie zatrzyma się po cichu, gdy GitHub wyłączy harmonogram po 60 dniach bez aktywności w publicznym repozytorium.** — Archived 2026-11-18 → `context/archive/2026-11-18-registry-import-keepalive/`. Lesson: —.
- **S-15: użytkownik loguje się i zakłada konto na ekranach po polsku, w jasnym motywie i na tokenach reszty aplikacji; błędy Supabase widzi po polsku, karta przeglądarki ma tytuł aplikacji, a baner braku konfiguracji nie odsyła do repozytorium startera.** — Archived 2026-11-19 → `context/archive/2026-11-18-auth-screens-ui/`. Lesson: —.
- **S-17: użytkownik klika substancję czynną leku — w karcie wybranego leku na `/szukaj`, na liście apteczki i przy wyniku sprawdzenia — i od razu widzi na `/szukaj` leki z tą substancją; z tej listy wybiera lek, widzi jego kartę i wynik sprawdzenia, a przyciskiem „Dodaj do apteczki” przechodzi do formularza dodawania z tym lekiem już wybranym.** — Archived 2026-11-24 → `context/archive/2026-11-19-substance-medicine-links/`. Lesson: —.
- **S-18: użytkownik zakłada konto z hasłem o co najmniej 12 znakach, spoza listy popularnych haseł i innym niż adres e-mail (bez wymogów składu, zgodnie z NIST SP 800-63B-4 i OWASP ASVS 5.0), a na istniejącym koncie z hasłem słabszym od tej reguły po zalogowaniu musi ustawić nowe hasło, zanim wejdzie do aplikacji; hasło może też zmienić sam, a sesja wygasa po 30 dniach bez użycia i 90 dniach od zalogowania; formularz po polsku mówi, dlaczego hasło odrzucono.** — Archived 2026-11-25 → `context/archive/2026-11-24-password-policy/`. Lesson: —.
