# S-03 Sprawdzenie leku przeciwko apteczce — Plan Brief

> Full plan: `context/changes/medicine-check/plan.md`
> Research: `context/changes/medicine-check/research.md`

## What & Why

Użytkownik w aptece wybiera lek z podpowiedzi na `/szukaj` i od razu widzi jeden z werdyktów: „masz ten lek”, „masz lek z tą samą substancją czynną” albo „nie masz”. Werdyktowi towarzyszą szczegóły po obu stronach. To gwiazda przewodnia roadmapy: główne kryterium sukcesu z PRD brzmi „nie kupię leku, który mam w domu” (FR-010, FR-011, FR-012, US-01).

## Starting Point

Istnieją podpowiedzi (S-01), apteczka z datą i ilością (S-02) oraz RPC liczące „ten sam lek” po kluczu wariantu. To RPC pomija jednak wycofane opakowania. Odczyt apteczki nie niesie substancji ani NPS, a moc w liście podpowiedzi jest ucięta, więc porównanie musi się odbyć w bazie. Po zalogowaniu użytkownik wciąż trafia na ekran startera.

## Desired End State

**Werdykt.** Po wyborze leku na `/szukaj` pojawia się werdykt w kolorze: zielony dla „masz”, żółty dla „ta sama substancja”, neutralny dla „nie masz”.

**Szczegóły wyniku:**

- Pozycje apteczki są posortowane po najbliższej dacie ważności, z ilością i oznaczeniami „przeterminowany” i „wycofany z rejestru”.
- Przy „masz ten lek” druga sekcja pokazuje leki z tą samą substancją.
- Przy każdym dopasowaniu po substancji jest zastrzeżenie o konsultacji.
- Gdy rejestr nie podaje porównywalnego składu, przy „nie masz” pojawia się uwaga.

**Wejście.** `/szukaj` jest stroną startową, a `/dashboard` i ekran startera znikają.

## Key Decisions Made

| Decision                       | Choice                                                                                             | Why (1 sentence)                                                             | Source        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| „Ta sama substancja”           | Równy zestaw części NPS **albo** równy zestaw substancji; ogólniki i pusty zestaw nigdy nie pasują | Każde z pól osobno gubi sole tej samej substancji (pomiar na pełnym zrzucie) | Research (D1) |
| Import równoległy              | „Masz ten lek” (klucz wariantu)                                                                    | Zgodnie z definicją wariantu z S-01                                          | Research (D2) |
| Wycofane opakowanie w apteczce | Liczy się, z etykietą                                                                              | Lek w szufladzie nie znika przez decyzję rejestru                            | Research (D3) |
| Ekran                          | Rozbudowa `/szukaj`, która staje się stroną startową                                               | Jedno miejsce wyszukiwania i sprawdzenia                                     | Research (D4) |
| Kilka kategorii naraz          | Werdykt najwyższej kategorii + sekcja „Także z tą samą substancją czynną”                          | Widać zamiennik, gdy własny lek się kończy lub jest przeterminowany          | Plan          |
| Kolejność pozycji              | Najbliższa data ważności, bez daty na końcu, potem najnowsze                                       | Podpowiada, co zużyć najpierw; grunt pod S-08                                | Plan          |
| Lek bez porównywalnego składu  | „Nie masz” + uwaga o braku danych                                                                  | Nie sugeruje, że zamiennika na pewno nie ma                                  | Plan          |
| Wygląd werdyktu                | Nowe tokeny `success` / `warning` (wariant B z makiety)                                            | Werdykt rozpoznawalny od rzutu oka przy okienku                              | Plan          |
| Placeholder w substancjach     | Zestaw z ogólnikiem (np. „Preparat złożony”) traktowany jak pusty                                  | Inaczej różne preparaty złożone dawałyby fałszywe dopasowanie                | Plan          |
| Miejsce reguły                 | Jedno RPC `medicine_check` (security invoker) zwracające JSON                                      | Jedna podróż do bazy, RLS apteczki działa, pełna moc                         | Plan          |
| Strona startowa                | `/` przekierowuje (zalogowany → `/szukaj`, inaczej logowanie); `/dashboard` i `Welcome` usunięte   | Znika martwy kod startera                                                    | Plan          |

## Scope

**In scope:**

- Migracja z RPC i funkcjami normalizującymi.
- `medicine-check-check.mjs` w CI.
- `GET /api/kit/check`, hook i komponent wyniku.
- Tokeny `success` / `warning`.
- `ui:scan`, `ui:shots` i smoke.
- Przekierowania, usunięcie startera, aktualizacja `AGENTS.md` i `README.md`.

**Out of scope:**

- Poziomy dopasowania (S-06).
- Ostrzeżenie o ważności (S-08).
- Kilka leków naraz (FR-015).
- Głębsza normalizacja pisowni.
- Zmiany listy wyszukiwania.
- Przebudowa `/apteczka`.
- Strona powitalna.
- Pomiar fałszywych wskazań w całym rejestrze.

## Architecture / Approach

Przepływ: `RegistrySearch` (wybór) → `MedicineCheckResult` → `useMedicineCheck` → `GET /api/kit/check?product=<id>` → `getMedicineCheck` → RPC `medicine_check(p_product_id)`.

RPC zwraca jeden obiekt JSON:

- szukany lek z pełną mocą i substancjami,
- `comparable`,
- posortowane `items` z polami `match: variant | substance` i `matchedBy`.

Normalizacja (trim, lowercase, zwinięcie spacji, NPS po „+”, lista ogólników) siedzi w osobnych funkcjach SQL, żeby S-06 i FR-015 mogły jej użyć ponownie.

## Phases at a Glance

| Phase                 | What it delivers                                          | Key risk                                                     |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Reguła w bazie     | RPC `medicine_check` + skrypt przypadków D1–D3 w CI       | Fałszywe dopasowania na danych spoza sprawdzonych przykładów |
| 2. Wynik na `/szukaj` | Endpoint, hook, komponent, tokeny, `ui:shots`, smoke      | Kontrast nowych tokenów; długość wyniku na telefonie         |
| 3. Strona startowa    | Przekierowania, usunięcie `/dashboard` i `Welcome`, smoke | Zachowanie `/` bez `index.astro` w Astro i Cloudflare        |

**Prerequisites:** S-01 i S-02 zamknięte (done); lokalny Supabase z fixture'ami; pełny rejestr lokalnie do ręcznych sprawdzeń.
**Estimated effort:** ok. 3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Odsetek fałszywych wskazań D1 w całym rejestrze jest niezmierzony. Ograniczają go ogólniki i zastrzeżenie, a sprawdzone są przykłady z researchu.
- Lista ogólników NPS jest z pomiaru, nie zamknięta. Nowy ogólnik w rejestrze może dać fałszywe dopasowanie po NPS.
- Przy zmianie nazwy, mocy lub postaci w RPL klucz wariantu się zmienia, więc lek w apteczce może spaść z „masz ten lek” do „ta sama substancja”.
- Wartości tokenów z makiety mogą wymagać korekty kontrastu.

## Success Criteria (Summary)

- W aptece po wyborze leku widać poprawny werdykt z porównaniem pól i zastrzeżeniem przy tej samej substancji, bez odczuwalnego czekania.
- Reguła D1–D3 jest sprawdzana automatycznie przy każdym PR (`medicine-check-check.mjs`, smoke).
- Po zalogowaniu użytkownik trafia prosto na `/szukaj`.
