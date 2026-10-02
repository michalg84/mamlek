---
date: 2026-10-02T12:44:09+02:00
researcher: michalg84 (z Claude Code)
git_commit: 8b378ecb6456938aea6ab311feaa6b85923b57ae
branch: main
repository: mamlek
topic: "S-01 — jak zbudować podpowiedzi z rejestru: dane, schemat, ścieżka zapytania, ryzyka"
tags: [research, registry, search, autocomplete, s-01]
status: partial
last_updated: 2026-10-02
last_updated_note: dodano pomiar rozmiaru listy nazw do cache'owania w przeglądarce
last_updated_by: michalg84 (z Claude Code)
---

# Research: S-01 — podpowiedzi z rejestru leków

**Date**: 2026-10-02T12:44:09+02:00
**Git Commit**: 8b378ec (main, czyste drzewo)

## Research Question

Co trzeba wiedzieć o danych rejestru, schemacie bazy i ścieżce zapytania, żeby zaplanować FR-002 (wpisanie pierwszych liter → podpowiedzi: nazwa + moc + postać; pierwszeństwo nazwy produktu przed nazwą powszechną i substancjami) w progu 3 s? W szczególności: które pola tworzą indeks (otwarta niewiadoma z F-01).

## Summary

- **Dane**: w zrzucie z 2026-10-02 (`stanNaDzien="2026-10-02"`, pobrany z publicznego adresu eksportu, 73 906 770 B) jest 22 892 produktów, z czego 20 246 ludzkich (to ta część trafia do bazy — `supabase/migrations/20261001120000_registry_tables.sql:42`). Rząd wielkości jest mały: indeks na ~20 tys. wierszy nie wymaga zewnętrznego silnika wyszukiwania.
- **Schemat jest gotowy do czytania, ale bez żadnego indeksu wyszukiwania.** Migracja F-01 tworzy tylko klucze główne i `registry_packages_product_id_idx` (`…registry_tables.sql:103`); nie ma indeksu na `name`, `common_name` ani substancjach, nie ma rozszerzeń `pg_trgm`/`unaccent` (grep w `supabase`, `scripts`, `src` — brak trafień). S-01 musi dodać nową migrację.
- **Pola indeksu (rekomendacja do planu)**: `registry_products.name` (priorytet 1), `common_name` (2), `registry_product_substances.name` (3). `previous_name`, `moc`, producent — nie szukać po nich w S-01 (patrz niżej).
- **Największe ryzyko UX, którego PRD nie przewidział**: 5 131 z 20 246 produktów ludzkich (25%) należy do grup o identycznym zestawie nazwa+moc+postać (porównanie bez rozróżniania wielkości liter). 1 050 takich grup, największa ma 28 produktów. To głównie import równoległy (`typProcedury=IR`: 4 336 produktów). Lista podpowiedzi „nazwa + moc + postać" pokaże więc wielokrotnie ten sam wiersz (np. „Sortis 20 · 20 mg · tabletki powlekane" ×11 w rejestrze). Wymaga decyzji w planie.
- **Nie zmierzono** czasu odpowiedzi ani działania `pg_trgm`/`unaccent` na Supabase: Docker nie działa w tej sesji (`docker ps` — błąd połączenia z pipe), więc lokalna baza z danymi nie była dostępna. Próg 3 s (NFR) pozostaje niesprawdzony.

## Detailed Findings

### Dane rejestru (pomiar na zrzucie 2026-10-02, ludzkie produkty)

Skrypt jednorazowy poza repo (regex po atrybutach elementów `produktLeczniczy`, z dekodowaniem encji). Wszystkie liczby dotyczą 20 246 produktów z `rodzajPreparatu="ludzki"` w tym zrzucie.

- Unikalne `nazwaProduktu`: 9 595 (po sprowadzeniu do małych liter: 9 531). Średnia długość nazwy 12,2 znaku, maksimum 77. Czyli ta sama nazwa handlowa występuje średnio ~2 razy.
- Nazwy z polskimi znakami diakrytycznymi: 471; nazwy powszechne z diakrytykami: 587. Użytkownik na telefonie może wpisać „drazowane"/„zel" bez ogonków — normalizacja (`unaccent`) ma znaczenie dla `moc`/postaci w podpowiedzi, mniej dla samych nazw, ale ~2,3% nazw jest dotkniętych.
- Pusta `nazwaPowszechnieStosowana`: 5 produktów (więc praktycznie zawsze jest pole do szukania po nazwie międzynarodowej).
- Nazwy zaczynające się od nie-litery: 9 (np. „10% Dekstran 40 000 Fresenius", „5-Fluorouracil-Ebewe", „99mTc - Tektrotyd"). Wyszukiwanie prefiksowe musi je poprawnie obsłużyć (cyfry), ale to margines.
- Wielkość wyników prefiksu po nazwie produktu: „pa" 244, „par" 72, „para" 55, „ib" 159, „ibu" 127, „apap" 19, „a" 2 100, „am" 215, „amo" 41. Podobny rząd dla „zawiera": „pa" 866, „ibu" 142. Wniosek: lista musi być obcięta (LIMIT) i uporządkowana; przy 1–2 znakach wynik jest bezużyteczny, więc minimalna długość zapytania (np. 2–3 znaki) jest decyzją planu.
- „Ibuprom*": 20 produktów; w pierwszych 14 każda para nazwa+moc+postać jest unikalna — czyli przykład z PRD („Ibuprom Max 400" vs „Ibuprom 400") rozróżnia się samą nazwą + mocą + postacią, o ile pokażemy wszystkie trzy pola. Uwaga: w rejestrze nazwa to „Ibuprom Max", a „400" jest w polu `moc` (`400 mg`), nie w nazwie.
- Długie `moc`: 276 produktów ma `moc` dłuższą niż 80 znaków (research F-01 podaje maksimum 1 831 znaków — `context/archive/2026-10-01-registry-copy-load/research.md`, sekcja danych). Podpowiedź musi to przycinać.
- Substancje czynne: 4 258 unikalnych nazw na 17 781 produktów z jedną substancją itd. (liczby z researchu F-01, zrzut 2026-09-23, nie zmierzone ponownie).

### Duplikaty w podpowiedziach (import równoległy)

- Grupy po (nazwa, moc, postać) bez rozróżniania wielkości liter: 16 165 różnych kluczy; 1 050 kluczy ma więcej niż jeden produkt; maksimum 28. Produktów w takich grupach: 5 131.
- Przykłady: „Sortis 20" 11 produktów — 2× MRP (Viatris, Upjohn), 9× IR (Delfarma ×4, InPharm ×3, Accord, Medezin); „Imovane" 9 produktów — 1× NAR (Sanofi) + 8× IR.
- Produkty różnią się `podmiotOdpowiedzialny`, `typProcedury`, `numerPozwolenia` (te pola są w tabeli: `…registry_tables.sql:33-37`), ale nie nazwą/mocą/postacią.
- Konsekwencja dla S-01: samo „nazwa + moc + postać" nie identyfikuje wiersza jednoznacznie. Opcje (do decyzji w planie, nie ustalone): (a) dopisać podmiot odpowiedzialny/typ procedury do wiersza podpowiedzi, (b) zwijać grupy do jednej podpowiedzi i wybierać reprezentanta, (c) preferować oryginał (NAR/MRP/DCP/CEN) przed IR w kolejności. Wpływa to na S-02 (do którego `registry_products.id` przypisany jest lek w apteczce) i S-03 („ten sam lek" vs „ta sama substancja" — czy import równoległy to „ten sam lek"?).

### Schemat i dostęp (stan repo)

- `registry_products` ma `name`, `common_name`, `previous_name`, `strength`, `pharmaceutical_form`, `removed_at` (`…registry_tables.sql:21-39`). Substancje: `registry_product_substances (product_id, position, name, …)` z kluczem `(product_id, position)` (`…:65-74`) — brak indeksu po `name`.
- RLS: SELECT tylko dla `authenticated` (`…:152-175`). Anon nie widzi wierszy. Czyli endpoint podpowiedzi musi działać na kliencie z sesją użytkownika (cookie), nie na kluczu anonimowym, i wymaga zalogowania — spójne z FR-013.
- `removed_at IS NULL` oznacza produkt aktywny; wycofane produkty zostają w tabeli (komentarz do tabeli w migracji). Podpowiedzi powinny filtrować po `removed_at IS NULL` (decyzja do potwierdzenia — otwarte pytanie roadmapy nr 5).
- Zrzut zawiera 2 307 ludzkich produktów, których `waznoscPozwolenia` jest datą wcześniejszą niż 2026-10-02 (porównanie napisów ISO), więc „pozwolenie nieaktualne" nie jest tym samym co `removed_at`. Czy ukrywać takie produkty w podpowiedziach — nierozstrzygnięte; domyślnie je zostawić (apteczka może zawierać stare opakowania z jeszcze ważną datą).

### Ścieżka zapytania w aplikacji

- Middleware ustawia `locals.user` z `supabase.auth.getUser()` na każdym żądaniu (`src/middleware.ts:7-17`); chronione są tylko trasy z `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`). Nowa strona/endpoint musi albo dołączyć do tej listy, albo sam sprawdzać `locals.user`.
- `createClient(headers, cookies)` zwraca `null`, gdy brak zmiennych środowiskowych (`src/lib/supabase.ts:5-7`) — endpoint musi obsłużyć `null` (AGENTS.md, sekcja Auth flow).
- Brak endpointów domenowych: w `src/pages/api/` jest tylko `auth/` (signin/signout/signup). Brak katalogów `src/lib/services/`, `src/components/hooks/`, brak `src/types.ts` (AGENTS.md potwierdza, że trzeba je utworzyć).
- Konwencje do zachowania: endpoint `GET` z walidacją zod z `astro/zod`; usługa w `src/lib/services/`; typy DTO w `src/types.ts`; React bez dyrektyw Next; hook w `src/components/hooks/`; `cn()` do klas (AGENTS.md, Key conventions).
- Runtime: Cloudflare Workers z `nodejs_compat` (`wrangler.jsonc:5-6`), adapter `@astrojs/cloudflare` (`astro.config.mjs:16`). Zapytanie do bazy idzie przez `@supabase/supabase-js` (PostgREST); złożone zapytanie (ranking po polach, `unaccent`, agregacja substancji) wygodniej schować w funkcji SQL wywoływanej przez `supabase.rpc(...)` niż składać w PostgREST. To rekomendacja projektowa, nie zmierzona.

### Opcja do rozważenia w planie: cache listy nazw pobieranej do przeglądarki

Alternatywa dla zapytania do bazy przy każdym naciśnięciu klawisza: statyczny, zbudowany z rejestru plik z listą nazw, pobierany raz do przeglądarki (może asynchronicznie, po załadowaniu strony) i przeszukiwany lokalnie. Pomiar rozmiaru na zrzucie 2026-10-02, tylko produkty ludzkie (skrypt jednorazowy poza repo; JSON jako tablica napisów lub krotek; gzip i brotli z modułu `zlib` Node):

| Zawartość listy                                                       | Pozycji | Surowo   | gzip   | brotli |
| --------------------------------------------------------------------- | ------- | -------- | ------ | ------ |
| unikalne `nazwaProduktu`                                              | 9 595   | 155 KB   | 61 KB  | 53 KB  |
| nazwa + moc (przycięta do 40 znaków) + postać, zwinięte duplikaty     | 16 165  | 907 KB   | 165 KB | 117 KB |
| id + nazwa + moc (40) + postać, wszystkie produkty                    | 20 246  | 1 340 KB | 275 KB | 179 KB |
| unikalne nazwy substancji czynnych (tabela zawiera też weterynaryjne) | —       | 121 KB   | 40 KB  | 34 KB  |
| unikalne `nazwaPowszechnieStosowana`                                  | —       | 90 KB    | 25 KB  | 22 KB  |

Liczby dotyczą wyłącznie tego zrzutu i tego kształtu JSON; nie uwzględniają indeksu wyszukiwania po stronie klienta ani nagłówków HTTP. Nie mierzono czasu pobrania ani parsowania na telefonie.

Co z tego wynika dla planu (wnioski, nie pomiary):

- Pełna lista z id (ok. 180–275 KB po kompresji) jest rzędu jednego większego obrazka, więc rozmiar sam w sobie nie wyklucza opcji; sama lista nazw to 53–61 KB. Czas pobrania na łączu mobilnym i parsowanie na ośmioletnim telefonie wymagają pomiaru (NFR: tam wymagana jest używalność, nie 3 s).
- Lokalne przeszukiwanie omija sieć i Worker przy każdym znaku, więc zdejmuje ryzyko progu 3 s dla samego wpisywania. Zostaje jedno żądanie na wybór pozycji (np. szczegóły produktu i substancje do porównania w S-03).
- Wymaga decyzji: lista tylko nazw (zapytanie do bazy po wybraniu nazwy zwraca warianty moc/postać) czy lista wariantów z id (rozwiązuje też problem duplikatów IR po stronie budowania listy). Substancje czynne (poziom 3 rankingu) to osobna, mała lista (34–40 KB) albo kolumna w krotce.
- Świeżość: lista musi odpowiadać aktualnemu importowi (NFR: dane nie starsze niż 7 dni). Wersjonowanie przez `registry_imports.snapshot_date` lub id importu w adresie pliku/ETag pozwala cache'ować długo i unieważniać po imporcie.
- Gdzie budować: (a) w ramach importu RPL (`scripts/registry-import.mjs`, w tej samej transakcji lub tuż po niej) — np. jako wiersz/kolumna w bazie (tabela z gotowym JSON-em lub widok materializowany) odświeżane razem z danymi; (b) osobny krok w CI po imporcie, publikujący plik statyczny (np. do zasobów Workera lub magazynu); (c) generowanie leniwe przez endpoint z cache'em w nagłówkach HTTP. Import jest dziś jedynym zapisem do tabel rejestru (komentarz w migracji `…registry_tables.sql:5-7`), więc opcja (a) nie dodaje drugiego pisarza; (b) wymaga uzgodnienia z S-07 (harmonogram w GitHub Actions). Nie rozstrzygnięto.
- Uwaga prawna/dostępowa: lista z nazwami rejestru byłaby dostępna po zalogowaniu (RLS) tylko jeśli endpoint ją serwuje z sesją; plik statyczny w zasobach Workera byłby publiczny. Dane RPL są publiczne, ale kontrola dostępu do endpointu to decyzja planu.

### Pytania, na które nie ma jeszcze dowodów

- Dostępność `pg_trgm` i `unaccent` w Postgres 17 Supabase (lokalnie `major_version = 17`, `supabase/config.toml:36`; `extra_search_path = ["public", "extensions"]`, `config.toml:15`) — wiedza ogólna Supabase, nie zweryfikowana w tej sesji (brak działającego Dockera). Do sprawdzenia na początku implementacji: `create extension if not exists pg_trgm with schema extensions;`.
- Czas odpowiedzi end-to-end (telefon → Worker → Supabase) przy 20 tys. produktów: niezmierzony.
- Zachowanie na ośmioletnim telefonie (debounce, rozmiar JS wyspy React): niezmierzone.

## Code References

- `supabase/migrations/20261001120000_registry_tables.sql:21-39` — `registry_products` (kolumny przeznaczone do podpowiedzi)
- `supabase/migrations/20261001120000_registry_tables.sql:65-74` — `registry_product_substances`
- `supabase/migrations/20261001120000_registry_tables.sql:152-175` — polityki RLS SELECT dla `authenticated`
- `src/middleware.ts:4` — `PROTECTED_ROUTES`
- `src/middleware.ts:7-17` — rozwiązanie użytkownika na każde żądanie
- `src/lib/supabase.ts:5-7` — `null` bez konfiguracji
- `wrangler.jsonc:5-6` — `nodejs_compat`
- `astro.config.mjs:16` — adapter Cloudflare
- `context/foundation/prd.md:142` — FR-002
- `context/foundation/prd.md:188-198` — NFR 3 s, 8-letni telefon
- `context/foundation/shape-notes.md:334-344` — kandydaci na pola indeksu

## Architecture Insights

- Mechanizm podpowiedzi obsługuje trzy ekrany (PRD, US-01 uwagi; roadmapa S-01 Risk), więc powinien być jednym serwisem + jednym endpointem + jednym komponentem React wielokrotnego użytku, a nie logiką w stronie.
- Dane rejestru są „tylko do odczytu" dla API; indeksy i funkcje SQL dodaje się migracją, nie importem (import działa jako właściciel tabel — komentarz w migracji). Nowe obiekty muszą przeżyć podmianę danych przez import: import nie usuwa wierszy produktów (`removed_at`), więc indeksy są stabilne.
- Wyszukiwanie po substancjach (poziom 3) wymaga złączenia z `registry_product_substances`; koszt rośnie, więc warto rozważyć kolumnę/widok z zagregowaną listą substancji lub zapytanie podrzędne osobno dla każdego poziomu rankingu.

## Historical Context (from prior changes)

- `context/archive/2026-10-01-registry-copy-load/research.md` — struktura danych RPL; punkt 4 „Pola indeksu wyszukiwania": kandydaci potwierdzeni w realnym pliku to `nazwaProduktu`, `nazwaPowszechnieStosowana`, `substancjaCzynna@nazwaSubstancji`; „wybór należy do S-01, ale F-01 musi te pola zachować" (wspiera: ten research zawęża wybór do tych trzech pól).
- Ten sam dokument podaje 22 909 produktów w zrzucie 2026-09-23; zrzut z 2026-10-02 ma 22 892 — różnica 17 produktów (liczby z różnych dni, brak analizy co zniknęło).
- Roadmapa S-01 Unknowns: „czy podpowiedzi mieszczą się w 3 s na telefonie przy pełnym rejestrze" — nadal otwarte (nie zmierzono).

## Related Research

`context/archive/2026-10-01-registry-copy-load/research.md` (jak wyżej).

## Open Questions

1. **Duplikaty IR** (decyzja produktowa): jak pokazać 25% produktów w grupach identycznych — dopisać podmiot, zwinąć, czy sortować oryginał przed importem równoległym? Wpływa na S-02/S-03.
2. **Minimalna długość zapytania i LIMIT** (np. 2–3 znaki, 10–20 wyników) — kompromis między użytecznością a rozmiarem odpowiedzi.
3. **Kolejność rankingu**: dokładnie jak realizować „pierwszeństwo nazwy produktu" — prefiks po `name` > prefiks po `common_name` > prefiks po substancji > dopasowanie wewnątrz słowa? Czy dopasowanie „w środku nazwy" (np. „max" → „Ibuprom Max") w ogóle jest w zakresie?
4. **Diakrytyki**: czy normalizować (`unaccent`) — rekomendacja tak, do potwierdzenia po sprawdzeniu rozszerzenia.
5. **Produkty `removed_at` i z wygasłym pozwoleniem**: ukrywać w podpowiedziach? (Open Roadmap Question 5.)
6. **Gdzie żyje UI w S-01**: roadmapa nie wskazuje ekranu; S-02 dodaje formularz, S-03 ekran sprawdzenia. Czy S-01 dostarcza samodzielną stronę (np. `/search`) tylko do weryfikacji mechanizmu, czy komponent + endpoint bez nowej strony? Do rozstrzygnięcia w planie.
7. **Cache listy nazw w przeglądarce** (sekcja wyżej): zakres listy (nazwy vs warianty z id), miejsce budowania (import / CI / endpoint), wersjonowanie i dostęp. Zmienia też odpowiedź na pytanie 2 (minimalna długość zapytania) i część pytania 1.
8. **Pomiar czasu 3 s**: wymaga działającej lokalnej bazy z pełnym importem (Docker) — do wykonania przy implementacji, nie w researchu.
