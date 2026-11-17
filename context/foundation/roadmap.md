---
project: MamLek
version: 1
status: draft
created: 2026-09-29
updated: 2026-11-17
prd_version: 3
main_goal: market-feedback
top_blocker: time
milestone_id: first-pharmacy-check
milestone_seq: 1
milestone_status: open
---

# Roadmap: MamLek

> Wyprowadzone z `context/foundation/prd.md` (v2) + automatycznie zbadanego stanu wyjściowego kodu. Zsynchronizowane z PRD v3 i decyzjami audytu zgodności z 2026-11-16 (`context/audits/prd-conformance/2026-11-16.md`).
> Edytuj w miejscu; archiwizuj, gdy zostanie zastąpione.
> Wycinki poniżej są ułożone w kolejności zależności. Tabela "At a glance" jest spisem treści.

## Milestone

**M-1: Pierwsze sprawdzenie leku w aptece** — Status: open

- **Intent:** Domowa apteczka jest odwzorowana w aplikacji (ręcznie albo z CSV), a przy okienku w aptece lub w gabinecie użytkownik w kilka sekund dowiaduje się, czy ma dany lek albo lek z tą samą substancją czynną — na danych rejestru nie starszych niż 7 dni.
- **Source materials:** `context/foundation/prd.md` (v3)
- **Done when:** every F-NN and S-NN below is `done`, except S-16 (keepalive importu) and S-17 (przejścia substancja ↔ lek), which are planned after M-1.
- **Scope anchors:** US-01, US-02; FR-001, FR-002, FR-003, FR-005, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-016. FR-015 (nice-to-have) is Parked.

## Vision recap

Domowa apteczka w gospodarstwie z trójką dzieci jest szufladą, której zawartości nie da się sprawdzić z gabinetu ani z apteki — w efekcie kupowane są drugie opakowania leków, które już leżą w domu, i część z nich się przeterminowuje. MamLek odróżnia od istniejących aplikacji to, że porównuje leki po substancji czynnej na podstawie Rejestru Produktów Leczniczych, traktuje apteczkę jako wspólny zasób domu i pozwala wprowadzić ją masowo zamiast pozycja po pozycji.

## North star

**S-03: Użytkownik sprawdza lek przeciwko apteczce** — to wprost główne kryterium sukcesu z PRD („nie kupię leku, który mam w domu”), więc przy celu „jak najszybciej do prawdziwego użycia” musi działać na prawdziwej apteczce jak najwcześniej.

> „North star” (gwiazda przewodnia) oznacza tu najmniejszy pełny przepływ, którego udane dowiezienie udowadnia główną hipotezę produktu — dlatego stoi tak wcześnie, jak pozwalają zależności: wszystko inne ma znaczenie tylko wtedy, gdy to działa.

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                                                                                       | Prerequisites    | PRD refs                             | Status      |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------ | ----------- |
| F-01 | registry-copy-load            | (foundation) kopia Rejestru Produktów Leczniczych jest wczytana do bazy powtarzalnym importem                              | —                | FR-001, NFR (świeżość danych)        | done        |
| S-01 | registry-search-suggestions   | znaleźć lek w rejestrze po pierwszych literach, z nazwą, mocą i postacią w podpowiedzi                                     | F-01             | FR-002, US-01, NFR (czas odpowiedzi) | done        |
| S-02 | add-medicine-to-kit           | dodać lek z rejestru do apteczki domu, z opcjonalną datą ważności i ilością                                                | S-01             | FR-003, FR-013, US-01, NFR (dostęp)  | done        |
| S-03 | medicine-check                | sprawdzić lek przeciwko apteczce i zobaczyć: masz / masz lek z tą samą substancją / nie masz                               | S-01, S-02       | FR-010, FR-011, FR-012, US-01        | done        |
| S-04 | csv-kit-import                | wprowadzić apteczkę z CSV przez ekran zatwierdzenia, na którym każdy wiersz ma rekord rejestru                             | S-01, S-02       | FR-007, FR-008, FR-009, US-02        | done        |
| S-05 | kit-browse-edit               | przeglądać apteczkę, zmieniać i usuwać pozycje, poprawiać ilość wprost na liście                                           | S-02             | FR-005                               | done        |
| S-06 | substance-match-level         | wybrać poziom dopasowania substancji czynnych dla leków złożonych i widzieć go przy wyszukiwaniu                           | S-03, S-13, S-14 | FR-016, US-01                        | proposed    |
| S-07 | daily-registry-refresh        | zobaczyć na `/szukaj` datę stanu rejestru, który odświeża się sam codziennie                                               | F-01             | FR-001, NFR (świeżość danych)        | done        |
| S-08 | expiry-warning                | zobaczyć ostrzeżenie o zbliżającym się końcu ważności na liście apteczki i przy wyniku sprawdzenia                         | S-03, S-05       | FR-014                               | proposed    |
| S-09 | registry-search-performance   | zacząć wyszukiwać lek na słabym telefonie bez długiego czekania i bez zacinania przy pisaniu                               | S-01             | FR-002, NFR (czas odpowiedzi)        | done        |
| S-10 | kit-add-form-reset-on-edit    | poprawić wpisaną nazwę w formularzu dodawania bez ryzyka dodania poprzednio wybranego leku                                 | S-02             | FR-003                               | done        |
| S-11 | search-numeric-strength-order | widzieć warianty tej samej nazwy w podpowiedziach w kolejności mocy liczbowej (500 mg przed 1000 mg)                       | S-01             | FR-002                               | done        |
| S-12 | kit-quantity-semantics        | podać ilość w tabletkach także dla opakowań z liczbą jednostek (butelka, blister) i widzieć ją jednoznacznie               | S-02, S-04       | FR-003, FR-005, FR-007               | in-progress |
| S-13 | withdrawn-medicine-in-kit     | znaleźć w podpowiedziach lek wycofany z rejestru, dodać go do apteczki, zaimportować i sprawdzić, z oznaczeniem „wycofany” | S-02, S-03, S-04 | FR-001, FR-002, FR-003, FR-009       | done        |
| S-14 | variant-key-btrim             | dostać „Masz ten lek” także wtedy, gdy rejestr zapisał moc lub postać tego samego leku ze spacją na końcu                  | S-03, S-04       | FR-010, FR-011                       | done        |
| S-15 | auth-screens-ui               | zalogować się i założyć konto na ekranach po polsku, w tym samym wyglądzie co reszta aplikacji                             | —                | NFR (dostęp), Access Control         | proposed    |
| S-16 | registry-import-keepalive     | (po M-1) polegać na tym, że dzienny import rejestru nie zatrzyma się po cichu po 60 dniach bez aktywności w repozytorium   | S-07             | FR-001, NFR (świeżość danych)        | proposed    |
| S-17 | substance-medicine-links      | (po M-1) kliknąć substancję czynną, zobaczyć leki z nią, przejść do leku i dodać go do apteczki                            | S-03, S-05, S-06 | FR-002, FR-003, FR-005, FR-011       | proposed    |

## Streams

Pomoc w nawigacji — grupuje pozycje, które dzielą łańcuch Prerequisites. Wiążąca kolejność nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Theme               | Chain                                                        | Note                                                                                                                                                                                                          |
| ------ | ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Sprawdzenie leku    | `F-01` → `S-01` → `S-02` → `S-03` → `S-13` → `S-14` → `S-06` | Najkrótsza droga do pierwszego sprawdzenia w aptece — to jest cel kamienia milowego. `S-13` i `S-14` (z audytu 2026-11-16) idą przed `S-06`: `S-14` zmienia `medicine_check` jak `S-06`, więc nie równolegle. |
| B      | Masowe wprowadzenie | `S-04`                                                       | Dołącza do Stream A przy `S-02`; może iść równolegle z `S-03`.                                                                                                                                                |
| C      | Utrzymanie apteczki | `S-05` → `S-08`                                              | Dołącza do Stream A przy `S-02`; `S-08` czeka dodatkowo na `S-03`.                                                                                                                                            |
| D      | Świeżość rejestru   | `S-07` → `S-16`                                              | Dołącza do Stream A przy `F-01`; niezależny od reszty. `S-16` (keepalive) dopiero po M-1.                                                                                                                     |
| E      | Wydajność           | `S-09`                                                       | Dołącza do Stream A przy `S-01`; usprawnia komponent podpowiedzi używany przez S-02–S-04.                                                                                                                     |
| F      | Poprawki            | `S-10`, `S-11`                                               | Małe, niezależne poprawki z testów: `S-10` dołącza przy `S-02`, `S-11` przy `S-01`.                                                                                                                           |
| G      | Ilość w apteczce    | `S-12`                                                       | Dotyka formularza, importu, listy i panelu edycji apteczki; `S-08` też zmienia listę (`KitList.tsx`), więc nie równolegle z nim.                                                                              |
| H      | Ekrany konta        | `S-15`                                                       | Przez `/10x-ui`; nie dotyka plików innych wycinków, więc może iść równolegle z czymkolwiek.                                                                                                                   |
| I      | Substancja ↔ lek    | `S-17`                                                       | Dołącza do Stream A przy `S-06` (ekran wyszukiwania i wynik sprawdzenia) i do Stream C przy `S-05`; po M-1, jako pierwszy po zamknięciu kamienia milowego.                                                    |

## Baseline

Co już jest w kodzie na dzień `2026-09-29` (zbadane automatycznie + potwierdzone przez użytkownika).
Foundations poniżej zakładają, że to istnieje, i NIE tworzą tego ponownie.

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
- **Unknowns:** — (próg czasu na słabym telefonie rozstrzygnął i zmierzył S-09; `npm run perf`).
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

- **Outcome:** użytkownik wpisuje nazwę jednego leku, wybiera pozycję z podpowiedzi i widzi jedną z odpowiedzi — masz ten lek / masz lek z tą samą substancją czynną / nie masz — z substancjami czynnymi, mocą i postacią po obu stronach porównania, ilością i datą ważności posiadanych pozycji oraz zastrzeżeniem o konsultacji z farmaceutą lub lekarzem przy wyniku z tą samą substancją.
- **Change ID:** medicine-check
- **PRD refs:** FR-010, FR-011, FR-012, US-01
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:**
  - Jak porównywane są leki złożone, zanim dojdzie wybór poziomu dopasowania (S-06) — rozstrzygnięte w kodzie i opisane w PRD v3 (Business Logic): jeden stały poziom, ten sam zbiór substancji albo ta sama nazwa powszechna; ogólniki nigdy nie pasują. — Owner: autor. Block: no.
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
  - Czy wyszukiwanie zmieści się w progu wydajności, jeśli import doda pracy liście lub workerowi — zapas na profilu Slow 4G + CPU 6x to tylko ok. 350 ms (4651 ms wobec celu 5 s, najgorszy przebieg 5652 ms); po zmianach w liście lub workerze uruchomić `npm run perf`. Źródło: S-09. Pomiar S-13 (2026-11-16, lokalnie na `wrangler dev`, inna konfiguracja niż liczby wyżej, więc nie porównywać ich wprost): lista gotowa 2336 ms bez zmian i 2479 ms z 1000 dodatkowych wycofanych wariantów (+6,9% payloadu); szczegóły w S-13. — Owner: autor. Block: no.
- **Risk:** Bez masowego wejścia próg startu zabija aplikację w pierwszym tygodniu (Wizja), więc idzie zaraz obok S-03; ekran zatwierdzenia jest granicą odpowiedzialności z FR-009 — żaden wiersz nie może zostać pominięty po cichu.
- **Status:** done

### S-05: Przegląd i edycja apteczki

- **Outcome:** użytkownik przegląda całą apteczkę na jednym ekranie, zmienia i usuwa pozycje oraz poprawia pozostałą ilość bezpośrednio na liście — ten sam ekran służy przeglądowi apteczki przed wizytą u lekarza.
- **Change ID:** kit-browse-edit
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** — (rozstrzygnięte w S-05: lista oznacza przeterminowane przez `isExpired`, lista zostaje bez limitu, `kit_items.updated_at` ma trigger; archiwum `context/archive/2026-11-04-kit-browse-edit/`).
- **Risk:** Nie jest na ścieżce do pierwszego sprawdzenia, więc stoi za S-03 i S-04; bez niego jednak pomyłek z importu i zużytych opakowań nie da się poprawić, a wynik sprawdzenia z czasem przestaje odpowiadać szufladzie.
- **Status:** done

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
  - Czy ścieżka po nazwie powszechnej należy do poziomu „precyzyjnego” — dziś liczy się do jedynego poziomu (PRD v3, Business Logic). Pomiar z 2026-11-16 znalazł 351 nazw powszechnych, pod którymi są produkty o rozłącznych zbiorach substancji (9 236 par); przejrzane przykłady to ta sama substancja zapisana inaczej (naproxenum / naproxenum natricum, fluorouracilum / 5-fluorouracilum, Pradaxa bez substancji), ale próbkę trzeba przejrzeć przed planem S-06 (pytania 8 i 10). Źródło: audyt `context/audits/prd-conformance/2026-11-16.md`, F6. — Owner: autor. Block: no.
  - Czy wynik ma rozróżniać „ta sama substancja czynna” i „ta sama nazwa powszechna” — baza zwraca już pole `matchedBy`, ekran go nie pokazuje. Pomysł autora z 2026-10-13 (plan `testing-check-verdict-correctness`). — Owner: autor. Block: no.
  - Czy czytnik ekranu ogłasza werdykt raz i w całości — po zmianach z S-03 (widoczny blok bez `role="status"`, komunikat `sr-only` w `MedicineCheckResult`) nie sprawdzono tego prawdziwym czytnikiem. S-06 zmienia komunikaty przy wyniku, więc to dobry moment na ręczne sprawdzenie. Źródło: impl-review `medicine-check`, F2/F6. — Owner: autor. Block: no.
- **Risk:** Rozszerza regułę z S-03 na leki złożone bez dorabiania wyjątków; wydzielony, bo dla leków jednoskładnikowych wszystkie poziomy dają ten sam wynik, więc pierwsze sprawdzenia w aptece nie muszą na niego czekać.
- **Status:** proposed

### S-07: Codzienne odświeżanie rejestru z widoczną datą

- **Outcome:** użytkownik widzi na `/szukaj` datę stanu rejestru (z eksportu RPL), a rejestr odświeża się sam codziennie; nieudany przebieg importu jest zgłaszany autorowi mailem z GitHuba, zamiast przejść po cichu. Wyłączony harmonogram nie daje sygnału — to zakres S-16.
- **Change ID:** daily-registry-refresh
- **PRD refs:** FR-001, NFR (świeżość danych)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** — (sygnał o nieudanym przebiegu to mail GitHuba o nieudanym workflow; ryzyko wyłączonego harmonogramu przeszło do S-16).
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
  - Co mówi werdykt „Masz ten lek”, gdy pasujące opakowanie jest puste (ilość 0) — rozstrzygnięte w S-12: puste opakowanie nie liczy się do werdyktu (ilość nieznana się liczy), więc same puste pasujące opakowania dają „Nie masz tego leku”; pod wynikiem jest sekcja „Puste opakowania”, a czytnik ekranu ogłasza ich liczbę. Do S-08 zostaje przypadek „wszystkie pasujące opakowania przeterminowane” — reguła S-12 nie przesądza, czy przeterminowane traktować tak samo. Źródło: audyt 2026-11-16, F10. — Owner: autor. Block: no.
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
- **Unknowns:** — (profile, cele i pomiar w czystej przeglądarce ustalone w S-09; powtarzalny pomiar to `npm run perf`, wyniki w archiwum `context/archive/2026-10-06-registry-search-performance/`).
- **Approach (do potwierdzenia w planie):** najpierw powtarzalny pomiar — znacznik `performance.mark` po zbudowaniu indeksu i skrypt (Playwright/Lighthouse: czysta przeglądarka, logowanie, czas do gotowości listy, INP przy wpisywaniu `ibu 400`); potem kolejno: `<link rel="preload">` listy w `szukaj.astro` (pobieranie równolegle z JS strony), parsowanie i budowa indeksu w Web Workerze, szybsza budowa indeksu i lżejsze renderowanie wyników, analiza rozmiaru JavaScriptu strony. Po każdym kroku pomiar tym samym skryptem.
- **Risk:** Komponent podpowiedzi obsłuży S-02, S-03 i S-04, więc jego opóźnienia przejdą na trzy ekrany; zmiany w hooku i indeksie muszą zachować regułę dopasowania z S-01 (w czasie S-09 bez testów jednostkowych — dlatego najpierw skrypt pomiarowy, a reguła sprawdzana na przykładach z planu S-01; dziś regułę pilnują `src/lib/registry-search.test.ts` i `npm run search:check`).
- **Status:** done

### S-10: Formularz dodawania zapomina wybór po zmianie nazwy

- **Outcome:** gdy użytkownik zmieni wpisaną nazwę w formularzu dodawania na `/apteczka`, formularz opakowania poprzednio wybranego leku znika i nie da się dodać leku, którego nie ma już w polu — do apteczki trafia tylko lek wybrany z podpowiedzi dla bieżącego tekstu.
- **Change ID:** kit-add-form-reset-on-edit
- **PRD refs:** FR-003
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Defekt znaleziony w Fazie 2 wdrażania testów (decyzja autora 2026-10-16, `test-plan.md` §6.6): `KitAddForm` (`src/components/kit/KitAddForm.tsx:350`) nie przekazuje `onEdit` do `MedicineSuggest`, więc po edycji tekstu bez nowego wyboru zostaje formularz wcześniejszego leku i można go dodać, myśląc, że to lek z pola. Poprawka jak w `RegistrySearch` (`onEdit` zeruje wybór) plus test komponentu według wzorca nieaktualnego stanu z `test-plan.md` §6.3. Mała i niezależna, więc może iść równolegle z każdym otwartym wycinkiem.
- **Status:** done

### S-11: Liczbowa kolejność mocy w podpowiedziach

- **Outcome:** użytkownik widzi warianty leku o tej samej nazwie w podpowiedziach w kolejności rosnącej mocy liczbowej — „500 mg” przed „1000 mg” — a nie w kolejności tekstowej.
- **Change ID:** search-numeric-strength-order
- **PRD refs:** FR-002
- **Prerequisites:** S-01
- **Parallel with:** S-04, S-05, S-06, S-08, S-10
- **Blockers:** —
- **Unknowns:**
  - Jak porządkować moce, których nie da się sprowadzić do jednej liczby i jednostki — złożone („500 mg + 65 mg”), w innych jednostkach („mg/ml”, „j.m.”), z przecinkiem dziesiętnym („0,5 mg/ml”) albo bez mocy. Domyślnie: liczbowo tylko porównywalne, reszta po dotychczasowej kolejności tekstowej. — Owner: autor. Block: no.
- **Risk:** Decyzja autora 2026-10-16 (Open Roadmap Question 9). Reguła S-01 porównuje moc jako tekst w `src/lib/registry-search.ts`, więc dla tej samej nazwy „1000 mg” stoi przed „500 mg”. Zmiana sortowania to zmiana reguły dopasowania: test reguły (`src/lib/registry-search.test.ts`) dostaje przypadki mocy o różnej liczbie cyfr, a plik wzorcowy `search:check` trzeba zapisać ponownie po świadomym przeglądzie różnic. Sortowanie działa w workerze na całej liście, więc po zmianie `npm run perf` (zapas ok. 350 ms, zob. S-04).
- **Status:** done

### S-12: Jednoznaczna ilość w apteczce (jednostki opakowania czy tabletki)

- **Outcome:** użytkownik podaje ilość leku tak, jak ją widzi — w tabletkach (sztukach) — także dla opakowań, które rejestr opisuje liczbą jednostek („1 butelka po 90 tabl.”, „2 blistry po 10 tabl.”), a aplikacja pokazuje tę ilość jednoznacznie, bez mieszania „butelek” z „tabletkami”.
- **Change ID:** kit-quantity-semantics
- **PRD refs:** FR-003, FR-005, FR-007
- **Prerequisites:** S-02, S-04
- **Parallel with:** S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Co znaczy `quantity` w bazie — rozstrzygnięte w S-12 regułą bez nowej kolumny: gdy jedyny wpis opakowania ma `capacity_unit` liczoną w sztukach (tabl., kaps., plastry…), ilość to sztuki, a wielkość opakowania to `count × capacity` („1 butelka 90 tabl.” → 90); w pozostałych opakowaniach ilość to jednostki opakowania. Zmienił się tylko komentarz kolumny (`20261117120200_kit_quantity_comment.sql`); dane produkcyjne sprawdzone przed zmianą (bramka 1.7 w `context/changes/kit-quantity-semantics/`). — Owner: autor. Block: no.
  - Czy ilość ponad pojemność opakowania jest dozwolona z ostrzeżeniem — rozstrzygnięte w S-12: tak, zapis przechodzi z ostrzeżeniem „Więcej niż w opakowaniu (…)”; API ogranicza ilość tylko do 100000. Przy dodawaniu (formularz, import) ilość to co najmniej 1; 0 daje tylko zmiana ilości pozycji w apteczce, po której aplikacja pyta o usunięcie. — Owner: autor. Block: no.
- **Risk:** Zgłoszone w ręcznym teście S-04 (2026-11-03). `packQuantity` (`src/lib/kit-format.ts`) ustawia górną granicę jako `count` jedynego wpisu opakowania, a `capacity` ignoruje: Oxbryta („1 butelka po 90 tabl.”) przyjmuje najwyżej 1. Opakowania bez `count` (np. Apap „12 tabl.”) nie mają limitu, więc tam ilość jest w tabletkach — ta sama kolumna znaczy więc co innego zależnie od leku. Prompt dla czatu w imporcie świadomie zostaje przy „ile sztuk zostało”, więc czat poda 90 tabletek zamiast 1 butelki, a ekran importu zablokuje wiersz, dopóki użytkownik nie poprawi ilości. Na S-04 złagodzono to polem ilości zawsze edytowalnym.
- **Status:** in-progress

### S-13: Lek wycofany z rejestru w podpowiedziach i w apteczce

- **Outcome:** użytkownik znajduje w podpowiedziach także lek wycofany z rejestru — z oznaczeniem „wycofany z rejestru” i niżej w kolejności niż leki aktualne — i może go dodać do apteczki, zaimportować z CSV oraz sprawdzić przeciwko apteczce; lek kupiony przed wycofaniem da się więc wprowadzić i utrzymywać.
- **Change ID:** withdrawn-medicine-in-kit
- **PRD refs:** FR-001, FR-002, FR-003, FR-009
- **Prerequisites:** S-02, S-03, S-04
- **Parallel with:** S-15, S-16
- **Blockers:** —
- **Unknowns:**
  - Czy pokazywać wszystkie wycofane warianty, czy tylko wycofane od pierwszego importu — rozstrzygnięte w S-13: lista pokazuje wszystkie wycofane warianty, które są w bazie, z oznaczeniem; leków wycofanych przed pierwszym importem (październik 2026) w bazie nie ma, więc nie ma ich też w podpowiedziach. Limit wieku wycofania można dodać później jedną migracją. — Owner: autor. Block: no.
  - Czy wycofane warianty zmieszczą się w progu wydajności — rozstrzygnięte w S-13 pomiarem z 2026-11-16 (lokalnie, pełny rejestr, `npm run build` + `wrangler dev`, `npm run perf -- --profile slow`, 5 przebiegów, mediany): bez zmian 16 280 wariantów, payload 2 049 569 B (bez kompresji), lista gotowa 2336 ms (najgorszy 2555), szacowana gotowość listy przy dławionym workerze ok. 3005 ms, wpisywanie w trakcie ładowania 56 ms (najgorsze 112), po załadowaniu 48 ms (72); z 1000 sztucznych wycofanych wariantów 17 280 wariantów, payload 2 190 890 B (+141 321 B, +6,9%), lista gotowa 2479 ms (2645), przy dławionym workerze ok. 3082 ms, wpisywanie 80 ms (200) i 64 ms (88). Mieści się w progach (lista gotowa ≤ 5000 ms, mediana interakcji < 200 ms); krok pomiaru opisuje `test-plan.md` §6.1. Golden `search:check` zapisany na nowej migracji, bez różnic po zmianie sortowania. — Owner: autor. Block: no.
- **Risk:** Decyzja autora z audytu 2026-11-16 (F15): ktoś mógł kupić lek trzy miesiące temu, a dwa miesiące temu rejestr go wycofał. Dziś import nigdy nie kasuje produktów (`removed_at`), a pozycja już w apteczce zostaje z etykietą „wycofany z rejestru”, ale lista podpowiedzi bierze tylko `removed_at is null` (`registry_search_list_version.sql:54`), funkcja opakowań wariantu `registry_variant_packages` zwraca tylko aktywne opakowania (`kit_items.sql:118-119`), a `kit.ts` odrzuca wycofane przy dodaniu i imporcie. Poprawka (plan S-13): polityki RLS `kit_items` niczego tu nie blokują — sprawdzają tylko `user_id = auth.uid()`, a baza już przyjmowała wycofane opakowanie; cytowane linie 118–119 to filtr funkcji opakowań, nie polityka. Wycinek zmienia więc listę i funkcję opakowań (jedna migracja, `20261116120000_withdrawn_medicine_in_kit.sql`) oraz serwis i endpointy, bez zmian w RLS; stoi przed S-06, żeby S-06 planował na ustalonej liście. Wdrożenie: najpierw merge PR-a (kod działa na starej i nowej bazie), potem ręczny `npx supabase db push`. Rozstrzyga Open Roadmap Question 5.
- **Status:** done

### S-14: Obcinanie spacji w kluczu wariantu leku

- **Outcome:** użytkownik dostaje „Masz ten lek” także wtedy, gdy rejestr zapisał moc lub postać tego samego leku z dodatkową spacją na początku lub końcu (np. `dermovate 0,5 mg/ml` i `dermovate 0,5 mg/ml `), a podpowiedzi i import traktują je jako jeden wariant.
- **Change ID:** variant-key-btrim
- **PRD refs:** FR-010, FR-011
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-15, S-16 (nie z S-06 — oba zmieniają `medicine_check`)
- **Blockers:** —
- **Unknowns:**
  - Jaki jest dziś skutek dla użytkownika — pytanie 7 mówi „Nie masz”, ale pozycja przechodzi też przez porównanie zbiorów, więc wynik to raczej „ta sama substancja” z zastrzeżeniem; potwierdzić testem na danych przed zmianą. — Owner: autor. Block: no.
- **Risk:** Decyzja autora z pytania 7, wpisana do roadmapy po audycie 2026-11-16 (F4). Klucz wariantu bez `btrim` siedzi w czterech miejscach, które muszą zmienić się razem: `supabase/migrations/20261010120000_medicine_check.sql:165-167`, `20261002130000_registry_search_list_version.sql:49`, `20261007120000_kit_items.sql:112-114` i `src/lib/kit-import.ts:113-115`. Nowa migracja wymaga ręcznego `db push` na produkcji, przeliczenia listy i ponownego zapisu `search:check`; test „spacja na końcu to ten sam lek” w `npm run test:db`.
- **Status:** done

### S-15: Ekrany logowania i rejestracji po polsku

- **Outcome:** użytkownik loguje się i zakłada konto na ekranach po polsku, w jasnym motywie i na tokenach reszty aplikacji; błędy Supabase widzi po polsku, karta przeglądarki ma tytuł aplikacji, a baner braku konfiguracji nie odsyła do repozytorium startera.
- **Change ID:** auth-screens-ui
- **PRD refs:** NFR (dostęp), Access Control
- **Prerequisites:** —
- **Parallel with:** każdy wycinek
- **Blockers:** —
- **Unknowns:**
- **Risk:** Praca zapowiedziana w `context/archive/2026-10-07-search-view-tokens/plan.md` („the auth pages get their own follow-up 10x-ui change”), która nie trafiła do roadmapy (audyt 2026-11-16, F9). Dotyczy `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/*.tsx`, tytułu w `src/layouts/Layout.astro`, `src/lib/config-status.ts` i `src/components/Banner.astro`: angielskie teksty, `bg-cosmic` i klasy palety. Przez `/10x-ui`; na końcu pliki trafiają do `GUARDED` w `scripts/ui-scan.mjs`. Nie dotyka plików innych wycinków.
- **Status:** proposed

### S-16: Keepalive dziennego importu rejestru (po M-1)

- **Outcome:** autor może polegać na tym, że dzienny import rejestru nie zatrzyma się po cichu, gdy GitHub wyłączy harmonogram po 60 dniach bez aktywności w publicznym repozytorium.
- **Change ID:** registry-import-keepalive
- **PRD refs:** FR-001, NFR (świeżość danych)
- **Prerequisites:** S-07
- **Parallel with:** każdy wycinek
- **Blockers:** —
- **Unknowns:**
  - Którą opcję wybrać: krok keepalive wołający API workflowu (np. `gautamkrishnar/keepalive-workflow` w trybie API — sprawdzić, czy zeruje licznik), zewnętrzny cron na Cloudflare czy tylko ostrzeżenie przy dacie stanu starszej niż 7 dni (opóźnienia publikacji RPL mogą dawać fałszywe alarmy). — Owner: autor. Block: no.
- **Risk:** Zastępuje Open Roadmap Question 12 (decyzja autora z audytu 2026-11-16, F7). Przebiegi 13–15.11 zakończone sukcesem, więc dziś nic nie płonie; PRD v3 opisuje NFR świeżości jako cel operacyjny, a ten wycinek jest jego zabezpieczeniem. Poza M-1 — planowany po zamknięciu kamienia milowego. `npm run roadmap:sync` przypisuje wszystkie pozycje do jednego kamienia milowego na GitHubie, więc na tablicy S-16 będzie stał w M-1.
- **Status:** proposed

### S-17: Przejścia substancja ↔ lek i dodanie leku z wyszukiwania (po M-1)

- **Outcome:** użytkownik klika substancję czynną leku — w karcie wybranego leku na `/szukaj`, na liście apteczki i przy wyniku sprawdzenia — i od razu widzi na `/szukaj` leki z tą substancją; z tej listy wybiera lek, widzi jego kartę i wynik sprawdzenia, a przyciskiem „Dodaj do apteczki” przechodzi do formularza dodawania z tym lekiem już wybranym.
- **Change ID:** substance-medicine-links
- **PRD refs:** FR-002, FR-003, FR-005, FR-011
- **Prerequisites:** S-03, S-05, S-06
- **Parallel with:** S-08, S-12, S-15, S-16 (nie z S-06 ani S-11 — te same pliki ekranu wyszukiwania)
- **Blockers:** —
- **Unknowns:**
  - Jak pokazać popularną substancję, pod którą są setki wariantów (paracetamol, ibuprofen) — dziś lista podpowiedzi ma limit 20 i prosi o dopisanie słowa. Dłuższa lista, dopisanie mocy czy zostawić limit. — Owner: autor. Block: no.
  - Czy wpisywać nazwę substancji tak, jak podaje ją rejestr (łacina, „Ibuprofenum”), i czy przy leku złożonym kliknięcie jednej substancji ma szukać tylko jej. — Owner: autor. Block: no.
  - Czy kliknięcie substancji na `/szukaj` zostawia ślad w historii przeglądarki (przycisk „wstecz” wraca do poprzedniego leku), czy tylko podmienia zapytanie. — Owner: autor. Block: no.
- **Risk:** Pomysł autora z 2026-11-16 (quality of life, poza MVP, ale pierwszy po zamknięciu M-1). PRD już obejmuje szukanie po substancji (FR-002), dodanie leku z rejestru (FR-003), listę apteczki (FR-005) i substancje przy wyniku (FR-011); wycinek łączy te ekrany przejściami, bez nowej reguły dopasowania. Decyzja autora: „Dodaj do apteczki” przenosi na ekran apteczki z wybranym lekiem zamiast formularza na `/szukaj`, a substancje są klikalne domyślnie na obu ekranach. Stoi po S-06, bo S-06 zmienia ten sam ekran wyszukiwania i wynik sprawdzenia; po S-13, bo wycofane leki zmieniają, co da się dodać z podpowiedzi.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                                     |
| ---------- | ----------------------------- | ------------------------------------------------------------ | --------------------- | --------------------------------------------------------- |
| F-01       | registry-copy-load            | Wczytanie kopii Rejestru Produktów Leczniczych do bazy       | —                     | FR-001, NFR (świeżość danych)                             |
| S-01       | registry-search-suggestions   | Podpowiedzi leków z rejestru (nazwa + moc + postać)          | —                     | FR-002, US-01, NFR (czas odpowiedzi)                      |
| S-02       | add-medicine-to-kit           | Dodanie leku z rejestru do apteczki domu                     | —                     | FR-003, FR-013, US-01, NFR (dostęp)                       |
| S-03       | medicine-check                | Sprawdzenie leku przeciwko apteczce (gwiazda przewodnia)     | —                     | FR-010, FR-011, FR-012, US-01                             |
| S-04       | csv-kit-import                | Import apteczki z CSV z ekranem zatwierdzenia                | —                     | FR-007, FR-008, FR-009, US-02                             |
| S-05       | kit-browse-edit               | Przegląd i edycja apteczki                                   | —                     | FR-005                                                    |
| S-06       | substance-match-level         | Wybór poziomu dopasowania substancji czynnych                | no                    | FR-016, US-01; po S-13 i S-14                             |
| S-07       | daily-registry-refresh        | Codzienne odświeżanie rejestru i widoczna data aktualizacji  | —                     | FR-001, NFR (świeżość danych)                             |
| S-08       | expiry-warning                | Ostrzeżenie o kończącej się dacie ważności                   | no                    | FR-014                                                    |
| S-09       | registry-search-performance   | Wydajność wyszukiwania leków na słabym telefonie             | —                     | FR-002, NFR (czas odpowiedzi)                             |
| S-10       | kit-add-form-reset-on-edit    | Formularz dodawania zapomina wybór po zmianie nazwy          | —                     | FR-003; defekt z test-plan §6.6                           |
| S-11       | search-numeric-strength-order | Liczbowa kolejność mocy w podpowiedziach                     | yes                   | FR-002; Open Roadmap Question 9                           |
| S-12       | kit-quantity-semantics        | Jednoznaczna ilość w apteczce (opakowania czy tabletki)      | no                    | FR-003, FR-005, FR-007                                    |
| S-13       | withdrawn-medicine-in-kit     | Lek wycofany z rejestru w podpowiedziach i w apteczce        | yes                   | FR-001, FR-002, FR-003, FR-009; audyt F15, pytanie 5      |
| S-14       | variant-key-btrim             | Obcinanie spacji w kluczu wariantu leku                      | yes                   | FR-010, FR-011; audyt F4, pytanie 7                       |
| S-15       | auth-screens-ui               | Ekrany logowania i rejestracji po polsku, na tokenach        | yes                   | Access Control; audyt F9; przez /10x-ui                   |
| S-16       | registry-import-keepalive     | Keepalive dziennego importu rejestru (po M-1)                | no                    | FR-001, NFR (świeżość danych); audyt F7, dawne pytanie 12 |
| S-17       | substance-medicine-links      | Przejścia substancja ↔ lek i dodanie z wyszukiwania (po M-1) | no                    | FR-002, FR-003, FR-005, FR-011; pomysł autora 2026-11-16  |

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
13. **Co dołożyć, zanim aplikacja trafi szerzej do innych użytkowników?** — rejestracja jest otwarta (PRD v3, Access Control). Na potem (autor, 2026-11-16): własny serwer SMTP (wbudowana poczta Supabase wysyła kilka e-maili na godzinę), sprawdzenie, że produkcja wymaga potwierdzenia e-maila, informacja o prywatności i usunięcie konta (lista leków to dane o zdrowiu, RODO) razem z resetem hasła bez udziału autora, ochrona przed botami (CAPTCHA), gdyby pojawiły się masowe rejestracje. Każdy punkt może stać się wycinkiem przy następnym `/10x-roadmap`. Źródło: PRD Open Question 6. Owner: autor. Block: — (nie blokuje).

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
- **Pozycje spoza rejestru (dawne FR-004: suplementy, wyroby medyczne, leki z zagranicy)** — Why parked: PRD §Non-Goals — żaden lek nie wchodzi do apteczki jako tekst. Autor chce wrócić do tematu po MVP (2026-11-16). Za: cała apteczka w jednym miejscu (suplementy, witaminy, opatrunki) i mniej wierszy CSV zablokowanych przez brak dopasowania. Przeciw: taka pozycja nie ma substancji czynnych ani klucza wariantu, więc albo nie bierze udziału w sprawdzeniu, albo daje wyniki wbrew bezpiecznikowi „fałszywe wskazanie gorsze niż brak odpowiedzi”; do tego literówki i osobna ścieżka w formularzu, imporcie, liście i regule. Kierunki: (a) pozycja tekstowa tylko w inwentarzu, oznaczona i wyłączona ze sprawdzenia; (b) druga baza (np. rejestr suplementów) z własnym kluczem; (c) substancje wpisane ręcznie przez użytkownika — najbardziej ryzykowne. Do rozważenia przy następnym `/10x-roadmap`.
- **Koszyk do konsultacji** — Why parked: PRD §Non-Goals; pokrywa się częściowo z FR-015.
- **Tryb offline** — Why parked: PRD §Non-Goals.
- **Układ na duży ekran** — Why parked: PRD §Non-Goals — MVP na przeglądarkę mobilną.
- **Build na Androida** — Why parked: PRD §Non-Goals.
- **Autorski przegląd test-plan §6.5/§6.6 (Faza 5)** — Why parked: autor przyjął je bez przeglądu przy zamykaniu `testing-registry-import-scripts` (2026-10-23); kiedyś, bez terminu, do ewentualnej poprawy.
- **Zapis apteczki tylko przez aplikację (twarda granica w bazie)** — Why parked: opcjonalne zadanie po MVP; dziś limit ilości i zakres daty sprawdza tylko API (reguła „opakowanie nie jest wycofane" zniknęła w S-13: wycofane opakowanie jest dozwolone), więc zalogowany użytkownik mógłby własnym tokenem zapisać nieprawidłowe wartości we własnej apteczce (cudze dane są chronione RLS). Po S-05 doszły: reguła „to samo opakowanie w obrębie wariantu” też tylko w API, a dwa równoległe `PATCH` mogą zapisać ilość ponad rozmiar opakowania (audyt 2026-11-16). Opcje: odebrać roli `authenticated` INSERT/UPDATE/DELETE na `kit_items` i pisać przez funkcję w bazie albo klucz serwisowy; albo dołożyć CHECK-i w bazie. Źródło: impl-review `add-medicine-to-kit`, F2.
- **Pomiar ekranu importu z otwartym polem wyszukiwania** — Why parked: każde pole podpowiedzi tworzy własnego workera z własnym indeksem listy (ok. 2 MB), a na `/apteczka/import` działa obok workera dopasowań; nie ma pomiaru, czy to problem (w trybie ręcznego szukania jest zwykle jeden wiersz naraz). Najpierw zmierzyć ekran importu z otwartym polem (ręcznie albo rozszerzonym `npm run perf`), a współdzielenie workera rozważać dopiero, gdy pomiar pokaże problem. Źródło: audyt 2026-11-16, F13.

## Milestone History

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
