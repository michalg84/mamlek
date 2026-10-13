---
project: MamLek
version: 1
status: draft
created: 2026-09-29
updated: 2026-10-13
prd_version: 2
main_goal: market-feedback
top_blocker: time
milestone_id: first-pharmacy-check
milestone_seq: 1
milestone_status: open
---

# Roadmap: MamLek

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwsze sprawdzenie leku w aptece** — Status: open

- **Intent:** Domowa apteczka jest odwzorowana w aplikacji (ręcznie albo z CSV), a przy okienku w aptece lub w gabinecie użytkownik w kilka sekund dowiaduje się, czy ma dany lek albo lek z tą samą substancją czynną — na danych rejestru nie starszych niż 7 dni.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** US-01, US-02; FR-001, FR-002, FR-003, FR-005, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-016. FR-015 (nice-to-have) is Parked.

## Vision recap

Domowa apteczka w gospodarstwie z trójką dzieci jest szufladą, której zawartości nie da się sprawdzić z gabinetu ani z apteki — w efekcie kupowane są drugie opakowania leków, które już leżą w domu, i część z nich się przeterminowuje. MamLek odróżnia od istniejących aplikacji to, że porównuje leki po substancji czynnej na podstawie Rejestru Produktów Leczniczych, traktuje apteczkę jako wspólny zasób domu i pozwala wprowadzić ją masowo zamiast pozycja po pozycji.

## North star

**S-03: Użytkownik sprawdza lek przeciwko apteczce** — to wprost główne kryterium sukcesu z PRD („nie kupię leku, który mam w domu”), więc przy celu „jak najszybciej do prawdziwego użycia” musi działać na prawdziwej apteczce jak najwcześniej.

> „North star” (gwiazda przewodnia) oznacza tu najmniejszy pełny przepływ, którego udane dowiezienie udowadnia główną hipotezę produktu — dlatego stoi tak wcześnie, jak pozwalają zależności: wszystko inne ma znaczenie tylko wtedy, gdy to działa.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                               | Prerequisites | PRD refs                             | Status   |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------ | -------- |
| F-01 | registry-copy-load          | (foundation) kopia Rejestru Produktów Leczniczych jest wczytana do bazy powtarzalnym importem      | —             | FR-001, NFR (świeżość danych)        | done     |
| S-01 | registry-search-suggestions | znaleźć lek w rejestrze po pierwszych literach, z nazwą, mocą i postacią w podpowiedzi             | F-01          | FR-002, US-01, NFR (czas odpowiedzi) | done     |
| S-02 | add-medicine-to-kit         | dodać lek z rejestru do apteczki domu, z opcjonalną datą ważności i ilością                        | S-01          | FR-003, FR-013, US-01, NFR (dostęp)  | done     |
| S-03 | medicine-check              | sprawdzić lek przeciwko apteczce i zobaczyć: masz / masz lek z tą samą substancją / nie masz       | S-01, S-02    | FR-010, FR-011, FR-012, US-01        | done     |
| S-04 | csv-kit-import              | wprowadzić apteczkę z CSV przez ekran zatwierdzenia, na którym każdy wiersz ma rekord rejestru     | S-01, S-02    | FR-007, FR-008, FR-009, US-02        | proposed |
| S-05 | kit-browse-edit             | przeglądać apteczkę, zmieniać i usuwać pozycje, poprawiać ilość wprost na liście                   | S-02          | FR-005                               | proposed |
| S-06 | substance-match-level       | wybrać poziom dopasowania substancji czynnych dla leków złożonych i widzieć go przy wyszukiwaniu   | S-03          | FR-016, US-01                        | proposed |
| S-07 | daily-registry-refresh      | zobaczyć datę ostatniej aktualizacji rejestru, który odświeża się sam codziennie                   | F-01          | FR-001, NFR (świeżość danych)        | done     |
| S-08 | expiry-warning              | zobaczyć ostrzeżenie o zbliżającym się końcu ważności na liście apteczki i przy wyniku sprawdzenia | S-03, S-05    | FR-014                               | proposed |
| S-09 | registry-search-performance | zacząć wyszukiwać lek na słabym telefonie bez długiego czekania i bez zacinania przy pisaniu       | S-01          | FR-002, NFR (czas odpowiedzi)        | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                                      | Note                                                                                          |
| ------ | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A      | Sprawdzenie leku    | `F-01` → `S-01` → `S-02` → `S-03` → `S-06` | Najkrótsza droga do pierwszego sprawdzenia w aptece — to jest cel kamienia milowego.          |
| B      | Masowe wprowadzenie | `S-04`                                     | Dołącza do Stream A przy `S-02`; może iść równolegle z `S-03`.                                |
| C      | Utrzymanie apteczki | `S-05` → `S-08`                            | Dołącza do Stream A przy `S-02`; `S-08` czeka dodatkowo na `S-03`.                            |
| D      | Świeżość rejestru   | `S-07`                                     | Dołącza do Stream A przy `F-01`; niezależny od reszty, dobry kandydat na równoległy przebieg. |
| E      | Wydajność           | `S-09`                                     | Dołącza do Stream A przy `S-01`; usprawnia komponent podpowiedzi używany przez S-02–S-04.     |

## Baseline

What's already in place in the codebase as of `2026-09-29` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR z wyspami React 19, Tailwind 4, shadcn/ui (na razie tylko przycisk); układ mobilny jeszcze nieweryfikowany (`src/layouts/Layout.astro`, `src/components/`).
- **Backend / API:** partial — tylko endpointy logowania (`src/pages/api/auth/*`); brak endpointów domenowych i warstwy serwisów.
- **Data:** partial — klient Supabase i lokalna konfiguracja (`src/lib/supabase.ts`, `supabase/config.toml`); brak migracji, tabel domenowych i danych rejestru.
- **Auth:** present — Supabase e-mail + hasło, rejestracja/logowanie/wylogowanie, middleware z `PROTECTED_ROUTES` (`src/middleware.ts:4`), zweryfikowane na produkcji.
- **Deploy / infra:** present (aplikacja) / absent (import rejestru) — Cloudflare Workers + CI z lint/check/build/smoke i automatycznym wdrożeniem po merge'u (`.github/workflows/ci.yml`); brak cyklicznego zadania importu rejestru (`context/deployment/deploy-plan.md`, „Explicitly not done”).
- **Observability:** partial — włączone observability Workers (`wrangler.jsonc`); brak śledzenia błędów; nigdzie nie widać daty ostatniego importu rejestru.

## Foundations

### F-01: Kopia rejestru leków w bazie

- **Outcome:** (foundation) kopia Rejestru Produktów Leczniczych — produkty z nazwą, nazwą powszechnie stosowaną, mocą, postacią i listą substancji czynnych — jest wczytana do bazy importem, który można uruchomić ponownie bez ręcznego sprzątania, a podmiana danych jest atomowa.
- **Change ID:** registry-copy-load
- **PRD refs:** FR-001, NFR (świeżość danych)
- **Unlocks:** S-01 (podpowiedzi potrzebują danych rejestru), S-07 (codzienne odświeżanie uruchamia ten sam import cyklicznie)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Które pola rekordu rejestru tworzą indeks wyszukiwania — do rozstrzygnięcia na realnym pliku (shape-notes, Forward: technical-roadmap). — Owner: autor. Block: no.
  - Czy produkty wycofane (pole statusu w rekordzie) wchodzą do kopii — patrz Open Roadmap Question 5. — Owner: autor. Block: no.
- **Risk:** Stoi pierwsza, bo bez własnej kopii rejestru nie ma substancji czynnych, a bez nich żadnego wyniku sprawdzenia; zakres celowo tylko jednorazowy, powtarzalny import — harmonogram i widoczność daty dochodzą w S-07. Parser powstaje od zera (repozytorium referencyjne bez licencji służy tylko do wglądu).
- **Status:** done

## Slices

### S-01: Wyszukiwanie leku w rejestrze z podpowiedziami

- **Outcome:** użytkownik po zalogowaniu wpisuje pierwsze litery i widzi podpowiedzi z rejestru — nazwa produktu razem z mocą i postacią — z pierwszeństwem nazwy produktu przed nazwą powszechnie stosowaną i substancjami czynnymi.
- **Change ID:** registry-search-suggestions
- **PRD refs:** FR-002, US-01, NFR (czas odpowiedzi)
- **Prerequisites:** F-01
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Czy podpowiedzi mieszczą się w progu 3 sekund na telefonie przy pełnym rejestrze i nadal są używalne na ośmioletnim telefonie. — Owner: autor. Block: no.
- **Risk:** Ten sam mechanizm podpowiedzi obsługuje trzy ekrany (formularz ręczny, zatwierdzenie importu, sprawdzenie), więc błąd w kolejności wyników lub rozróżnianiu „Ibuprom Max 400” od „Ibuprom 400” rozleje się na S-02, S-03 i S-04 — dlatego jest osobnym, wczesnym wycinkiem.
- **Status:** done

### S-02: Dodanie leku do apteczki domu

- **Outcome:** użytkownik dodaje do apteczki domu lek wskazany z podpowiedzi rejestru, opcjonalnie z datą ważności i pozostałą ilością, a brak którejś z nich widzi wprost jako „nieznane”; apteczka jest widoczna wyłącznie po zalogowaniu na konto domu.
- **Change ID:** add-medicine-to-kit
- **PRD refs:** FR-003, FR-013, US-01, NFR (dostęp)
- **Prerequisites:** S-01
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wprowadza apteczkę jako dane domu i jej izolację między kontami — robione tu, przy pierwszym ekranie, który zapisuje apteczkę, a nie jako osobna warstwa z góry. Logowanie już działa (Baseline), więc wycinek tylko wiąże apteczkę z kontem.
- **Status:** done

### S-03: Sprawdzenie leku przeciwko apteczce

- **Outcome:** użytkownik wpisuje nazwę jednego leku, wybiera pozycję z podpowiedzi i widzi jedną z odpowiedzi — masz ten lek / masz lek z tą samą substancją czynną / nie masz — z substancjami czynnymi, mocą, postacią, ilością i datą ważności po obu stronach porównania oraz zastrzeżeniem o konsultacji z farmaceutą lub lekarzem przy wyniku z tą samą substancją.
- **Change ID:** medicine-check
- **PRD refs:** FR-010, FR-011, FR-012, US-01
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:**
  - Jak porównywane są leki złożone, zanim dojdzie wybór poziomu dopasowania (S-06) — domyślnie precyzyjny, zgodnie z bezpiecznikiem „fałszywe wskazanie gorsze niż brak odpowiedzi”; patrz Open Roadmap Question 4. — Owner: autor. Block: no.
- **Risk:** Tu po raz pierwszy wychodzi na jaw najbardziej ryzykowne założenie produktu — czyli to, bez którego produkt traci sens: że porównanie po substancji czynnej na danych rejestru daje poprawną i czytelną odpowiedź. Wycinek obejmuje jedną akcję (sprawdzenie jednego leku); wybór poziomu dopasowania jest wydzielony do S-06, żeby gwiazda przewodnia była jak najmniejsza.
- **Status:** done

### S-04: Import apteczki z CSV z ekranem zatwierdzenia

- **Outcome:** użytkownik widzi oczekiwany format CSV i gotowy prompt do zewnętrznego czatu AI, wgrywa plik albo wkleja jego zawartość, a na ekranie zatwierdzenia każdy wiersz ma przypisany rekord rejestru lub propozycje do wyboru; wiersz bez dopasowania blokuje przejście dalej, wiersz z lekiem już posiadanym jest oznaczony „już masz”, a leki trafiają do apteczki dopiero po zatwierdzeniu.
- **Change ID:** csv-kit-import
- **PRD refs:** FR-007, FR-008, FR-009, US-02
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-03, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Jak proponować rekordy rejestru dla nazw z CSV, nie zgadując leku — bezpiecznik PRD wymaga pytania zamiast strzelania przy braku pewnego wskazania. — Owner: autor. Block: no.
- **Risk:** Bez masowego wejścia próg startu zabija aplikację w pierwszym tygodniu (Wizja), więc idzie zaraz obok S-03; ekran zatwierdzenia jest granicą odpowiedzialności z FR-009 — żaden wiersz nie może zostać pominięty po cichu.
- **Status:** proposed

### S-05: Przegląd i edycja apteczki

- **Outcome:** użytkownik przegląda całą apteczkę na jednym ekranie, zmienia i usuwa pozycje oraz poprawia pozostałą ilość bezpośrednio na liście — ten sam ekran służy przeglądowi apteczki przed wizytą u lekarza.
- **Change ID:** kit-browse-edit
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Lista apteczki nie oznacza przeterminowanych opakowań, a wynik sprawdzenia (S-03) już tak — użyć `isExpired` z `src/lib/kit-format.ts`, żeby to samo opakowanie wyglądało tak samo w obu widokach. Źródło: impl-review `medicine-check`, F10. — Owner: autor. Block: no.
- **Risk:** Nie jest na ścieżce do pierwszego sprawdzenia, więc stoi za S-03 i S-04; bez niego jednak pomyłek z importu i zużytych opakowań nie da się poprawić, a wynik sprawdzenia z czasem przestaje odpowiadać szufladzie.
- **Status:** proposed

### S-06: Wybór poziomu dopasowania substancji czynnych

- **Outcome:** użytkownik wybiera poziom dopasowania — precyzyjny, zawiera wszystkie, zawiera jeden — widzi go przy wyszukiwaniu, a wynik sprawdzenia leku złożonego zmienia się zgodnie z wybranym poziomem.
- **Change ID:** substance-match-level
- **PRD refs:** FR-016, US-01
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Który poziom jest domyślny — patrz Open Roadmap Question 4. — Owner: autor. Block: no.
  - Czy trzy poziomy są czytelne dla kogoś, kto nie myśli kategoriami zbiorów (uwaga Socratesa przy FR-016). — Owner: autor. Block: no.
  - Czy treść zastrzeżenia o konsultacji z farmaceutą lub lekarzem spełnia wymagania prawne — patrz Open Roadmap Question 6. S-06 zmienia komunikaty przy wyniku, więc to dobry moment na ustalenie ostatecznej treści. — Owner: autor. Block: no.
  - Czy wynik ma rozróżniać „ta sama substancja czynna” i „ta sama nazwa powszechna” — baza zwraca już pole `matchedBy`, ekran go nie pokazuje. Pomysł autora z 2026-10-13 (plan `testing-check-verdict-correctness`). — Owner: autor. Block: no.
- **Risk:** Rozszerza regułę z S-03 na leki złożone bez dorabiania wyjątków; wydzielony, bo dla leków jednoskładnikowych wszystkie poziomy dają ten sam wynik, więc pierwsze sprawdzenia w aptece nie muszą na niego czekać.
- **Status:** proposed

### S-07: Codzienne odświeżanie rejestru z widoczną datą

- **Outcome:** użytkownik widzi w aplikacji datę ostatniej aktualizacji rejestru, a rejestr odświeża się sam codziennie; nieudane odświeżenie jest zgłaszane autorowi, zamiast przejść po cichu.
- **Change ID:** daily-registry-refresh
- **PRD refs:** FR-001, NFR (świeżość danych)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Gdzie i jak autor dostaje sygnał o nieudanym odświeżeniu (rejestr ryzyk w `infrastructure.md`: import może przestać działać po cichu). — Owner: autor. Block: no.
- **Risk:** Zadanie w tle działa bez nadzoru poza aplikacją (per tech-stack.md), a `infrastructure.md` opisuje scenariusz, w którym wyłączony harmonogram niezauważenie postarza rejestr — dlatego data aktualizacji jest częścią tego wycinka, a nie dodatkiem. Niezależny od reszty, więc może iść równolegle od zaraz po F-01.
- **Status:** done

### S-08: Ostrzeżenie o kończącej się dacie ważności

- **Outcome:** użytkownik widzi ostrzeżenie o zbliżającym się końcu ważności leku — razem z datą — na liście apteczki i przy wyniku sprawdzenia, gdy ma dany lek lub lek z tą samą substancją czynną.
- **Change ID:** expiry-warning
- **PRD refs:** FR-014
- **Prerequisites:** S-03, S-05
- **Parallel with:** S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Ile dni przed końcem ważności aplikacja ostrzega — patrz Open Roadmap Question 3. — Owner: autor. Block: no.
  - Co mówi werdykt „Masz ten lek”, gdy wszystkie pasujące opakowania są przeterminowane — dziś (S-03) jest zielony, a „przeterminowany” widać tylko w wierszu pozycji i nie słyszy go czytnik ekranu; przypadek mieszany (część opakowań po terminie) też do rozstrzygnięcia. Źródło: impl-review `medicine-check`, F4. — Owner: autor. Block: no.
- **Risk:** Wymaganie „miłe do posiadania” i drugorzędne kryterium sukcesu — stoi na końcu i przy braku czasu jako pierwsze przechodzi do kolejnego kamienia milowego; korzysta tylko z danych, które S-02–S-05 już zapisują.
- **Status:** proposed

### S-09: Wydajność wyszukiwania leków na słabym telefonie

- **Outcome:** na słabym telefonie użytkownik może zacząć wyszukiwać lek na `/szukaj` bez długiego czekania na wczytanie listy, a wpisywanie nazwy nie zacina się — także wtedy, gdy zacznie pisać, zanim lista się wczyta.
- **Change ID:** registry-search-performance
- **PRD refs:** FR-002, NFR (czas odpowiedzi)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Baseline (2026-10-02, produkcja, Brave z wtyczkami, Slow 4G + CPU 6x):** od wejścia do działających podpowiedzi 11,11 s; w tym pobranie listy 2,46 s (337 kB zstd z 2,0 MB), parsowanie JSON + budowa indeksu 2,47 s jednym blokiem na głównym wątku, reszta ok. 6 s (HTML, JS, start Reacta, wtyczki). Reakcja na znak (INP) po pełnym załadowaniu 250–312 ms; przy pisaniu w trakcie budowy indeksu ok. 1,36 s. Źródło: F5 w `context/archive/2026-10-02-registry-search-suggestions/reviews/impl-review.md` i Progress 2.6/3.8 tamtego planu.
- **Unknowns:**
  - Na jakim profilu obowiązuje próg 3 s z S-01 (Slow 4G + CPU 6x jako słaby telefon czy np. Fast 4G + CPU 4x jako zwykły telefon) i jaki cel przyjąć dla INP (domyślnie < 200 ms). — Owner: autor. Block: no.
  - Ile z ok. 6 s „reszty” to wtyczki przeglądarki — pomiar trzeba powtórzyć w czystym środowisku (okno prywatne albo pusty profil, bez wtyczek; w Brave wyłączone Shields; Chrome jako przeglądarka referencyjna). — Owner: autor. Block: no.
- **Approach (do potwierdzenia w planie):** najpierw powtarzalny pomiar — znacznik `performance.mark` po zbudowaniu indeksu i skrypt (Playwright/Lighthouse: czysta przeglądarka, logowanie, czas do gotowości listy, INP przy wpisywaniu `ibu 400`); potem kolejno: `<link rel="preload">` listy w `szukaj.astro` (pobieranie równolegle z JS strony), parsowanie i budowa indeksu w Web Workerze, szybsza budowa indeksu i lżejsze renderowanie wyników, analiza rozmiaru JavaScriptu strony. Po każdym kroku pomiar tym samym skryptem.
- **Risk:** Komponent podpowiedzi obsłuży S-02, S-03 i S-04, więc jego opóźnienia przejdą na trzy ekrany; zmiany w hooku i indeksie muszą zachować regułę dopasowania z S-01 (brak testów jednostkowych — dlatego najpierw skrypt pomiarowy, a reguła sprawdzana na przykładach z planu S-01).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                |
| ---------- | --------------------------- | ----------------------------------------------------------- | --------------------- | ------------------------------------ |
| F-01       | registry-copy-load          | Wczytanie kopii Rejestru Produktów Leczniczych do bazy      | yes                   | FR-001, NFR (świeżość danych)        |
| S-01       | registry-search-suggestions | Podpowiedzi leków z rejestru (nazwa + moc + postać)         | no                    | FR-002, US-01, NFR (czas odpowiedzi) |
| S-02       | add-medicine-to-kit         | Dodanie leku z rejestru do apteczki domu                    | no                    | FR-003, FR-013, US-01, NFR (dostęp)  |
| S-03       | medicine-check              | Sprawdzenie leku przeciwko apteczce (gwiazda przewodnia)    | no                    | FR-010, FR-011, FR-012, US-01        |
| S-04       | csv-kit-import              | Import apteczki z CSV z ekranem zatwierdzenia               | no                    | FR-007, FR-008, FR-009, US-02        |
| S-05       | kit-browse-edit             | Przegląd i edycja apteczki                                  | no                    | FR-005                               |
| S-06       | substance-match-level       | Wybór poziomu dopasowania substancji czynnych               | no                    | FR-016, US-01                        |
| S-07       | daily-registry-refresh      | Codzienne odświeżanie rejestru i widoczna data aktualizacji | no                    | FR-001, NFR (świeżość danych)        |
| S-08       | expiry-warning              | Ostrzeżenie o kończącej się dacie ważności                  | no                    | FR-014                               |
| S-09       | registry-search-performance | Wydajność wyszukiwania leków na słabym telefonie            | yes                   | FR-002, NFR (czas odpowiedzi)        |

## Open Roadmap Questions

1. **Jak działają istniejące aplikacje do apteczki i czy któraś oferuje wyszukiwanie zamiennika?** — konkurencja nie została sprawdzona. Owner: autor. Block: roadmap-wide (nie blokuje planowania).
2. **Jaką metodą loguje się użytkownik do konta domu?** — hasło, link na e-mail albo konto zewnętrzne; nierozstrzygnięte w PRD. Baseline ma już działające logowanie e-mail + hasło, więc brak decyzji nie blokuje żadnego wycinka. Owner: autor. Block: — (nie blokuje).
3. **Ile dni przed końcem ważności aplikacja ostrzega?** — okres do ustalenia. Owner: autor. Block: S-08 (nie blokuje planowania).
4. **Który poziom dopasowania substancji czynnych jest domyślny?** — bezpiecznik „fałszywe wskazanie gorsze niż brak odpowiedzi” przemawia za startem od poziomu precyzyjnego i świadomym rozluźnianiem przez użytkownika. Ryzyko przeciwne: przy pierwszym użyciu aplikacja częściej odpowie „nie masz” i może wyjść na bezużyteczną. Owner: autor. Block: S-03, S-06 (nie blokuje planowania).
5. **Czy produkty wycofane z obrotu zostają w kopii rejestru i w podpowiedziach?** — rejestr zawiera produkty wycofane (kontrargument przy FR-001); stary lek w szufladzie może być wycofany, a nadal trzeba go rozpoznać przy imporcie. Owner: autor. Block: F-01, S-01, S-04 (nie blokuje planowania).
6. **Czy zastrzeżenie przy wyniku „ta sama substancja czynna” spełnia wymagania prawne?** — FR-012 wymaga zastrzeżenia o konsultacji z farmaceutą lub lekarzem, ale jego treści nikt nie sprawdził pod kątem prawnym: czy potrzebna jest inna formuła, zastrzeżenie o braku porady medycznej i czy samo wskazanie leku z tą samą substancją nie jest traktowane jako porada albo reklama produktu leczniczego. Tekst na ekranie różni się od sformułowania w PRD; weryfikacja ma wskazać jedną wersję (PRD Open Question 5). Owner: autor. Block: S-06 (nie blokuje planowania).
7. **Czy obcinać spacje na początku i końcu w kluczu wariantu leku?** — pomiar na pełnym rejestrze (2026-10-08) znalazł 6 par produktów (49 produktów), których klucz różni się tylko końcową lub podwójną spacją w mocy (np. `dermovate 0,5 mg/ml` i `dermovate 0,5 mg/ml `); reguła traktuje je jako dwa leki, więc apteczka z jednym z nich odpowiada „Nie masz” dla drugiego. Autor zdecydował, że jedyną zmianą będzie obcinanie spacji na początku i końcu (osobna mała zmiana: migracja `medicine_check`, spójność z kluczem wariantu listy wyszukiwania, test). Źródło: `context/changes/testing-check-verdict-correctness/placeholder-measurement.md`. Owner: autor. Block: — (nie blokuje).
8. **Czy któraś z 309 nazw powszechnych łączących leki o rozłącznym składzie jest ogólnikiem?** — ten sam pomiar wypisał nazwy powszechne (spoza listy ogólników), pod którymi są produkty o zupełnie różnych zbiorach substancji; reguła uznaje je za „tę samą substancję”. Lista nie została oceniona (autor odłożył ocenę). Do rozstrzygnięcia, czy któraś to prawdziwy ogólnik do dodania do listy w regule, czy ta sama substancja w innej soli lub nazwie; pomiar powtarza się poleceniem z `placeholder-measurement.sql`. Źródło: j.w. Owner: autor. Block: S-06 (nie blokuje planowania).

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
- **Pozycje spoza rejestru (dawne FR-004)** — Why parked: PRD §Non-Goals — żaden lek nie wchodzi do apteczki jako tekst.
- **Koszyk do konsultacji** — Why parked: PRD §Non-Goals; pokrywa się częściowo z FR-015.
- **Tryb offline** — Why parked: PRD §Non-Goals.
- **Układ na duży ekran** — Why parked: PRD §Non-Goals — MVP na przeglądarkę mobilną.
- **Build na Androida** — Why parked: PRD §Non-Goals.
- **Zapis apteczki tylko przez aplikację (twarda granica w bazie)** — Why parked: opcjonalne zadanie po MVP; dziś limit ilości, zakres daty i regułę „opakowanie nie jest wycofane" sprawdza tylko API, więc zalogowany użytkownik mógłby własnym tokenem zapisać nieprawidłowe wartości we własnej apteczce (cudze dane są chronione RLS). Opcje: odebrać roli `authenticated` INSERT/UPDATE/DELETE na `kit_items` i pisać przez funkcję w bazie albo klucz serwisowy; albo dołożyć CHECK-i w bazie. Źródło: impl-review `add-medicine-to-kit`, F2.

## Milestone History

## Done

- **F-01: (foundation) kopia Rejestru Produktów Leczniczych — produkty z nazwą, nazwą powszechnie stosowaną, mocą, postacią i listą substancji czynnych — jest wczytana do bazy importem, który można uruchomić ponownie bez ręcznego sprzątania, a podmiana danych jest atomowa.** — Archived 2026-10-01 → `context/archive/2026-10-01-registry-copy-load/`. Lesson: —.
- **S-01: użytkownik po zalogowaniu wpisuje pierwsze litery i widzi podpowiedzi z rejestru — nazwa produktu razem z mocą i postacią — z pierwszeństwem nazwy produktu przed nazwą powszechnie stosowaną i substancjami czynnymi.** — Archived 2026-10-02 → `context/archive/2026-10-02-registry-search-suggestions/`. Lesson: —.
- **S-09: na słabym telefonie użytkownik może zacząć wyszukiwać lek na `/szukaj` bez długiego czekania na wczytanie listy, a wpisywanie nazwy nie zacina się — także wtedy, gdy zacznie pisać, zanim lista się wczyta.** — Archived 2026-10-07 → `context/archive/2026-10-06-registry-search-performance/`. Lesson: —.
- **S-07: użytkownik widzi w aplikacji datę ostatniej aktualizacji rejestru, a rejestr odświeża się sam codziennie; nieudane odświeżenie jest zgłaszane autorowi, zamiast przejść po cichu.** — Archived 2026-10-09 → `context/archive/2026-10-07-daily-registry-refresh/`. Lesson: —.
- **S-03: użytkownik wpisuje nazwę jednego leku, wybiera pozycję z podpowiedzi i widzi jedną z odpowiedzi — masz ten lek / masz lek z tą samą substancją czynną / nie masz — z substancjami czynnymi, mocą, postacią, ilością i datą ważności po obu stronach porównania oraz zastrzeżeniem o konsultacji z farmaceutą lub lekarzem przy wyniku z tą samą substancją.** — Archived 2026-10-10 → `context/archive/2026-10-09-medicine-check/`. Lesson: —.
