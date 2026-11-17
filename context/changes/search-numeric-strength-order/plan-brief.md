# Liczbowa kolejność mocy w podpowiedziach — Plan Brief

> Full plan: `context/changes/search-numeric-strength-order/plan.md`

## What & Why

Użytkownik widzi warianty leku o tej samej nazwie w podpowiedziach w kolejności rosnącej mocy — „500 mg” przed „1000 mg” — a nie tekstowej (roadmapa S-11, FR-002). Dziś Abrix pokazuje 10, 15, 20, 5 mg, a Duomox „1 g” przed „250 mg”.

## Starting Point

`compareEntries` (`src/lib/registry-search.ts:80-88`) porównuje moc jako tekst; sortowanie dzieje się raz na całej liście w `buildSearchIndex`, w workerze, przed obcięciem do 20 podpowiedzi. W pełnym rejestrze 3 165 nazw ma kilka mocy; ok. 61% mocy to „liczba jednostka”, 18% stężenia, 14% złożone, reszta nieparsowalna.

## Desired End State

W obrębie tej samej nazwy: najpierw moce parsowalne, pogrupowane po jednostkach, w grupie rosnąco liczbowo; na końcu nieparsowalne. Duomox: 250 mg … 750 mg, 1 g. Abilify: 5–30 mg, potem 1 mg/ml, 7,5 mg/ml. Acebis: 2,5 mg + 1,25 mg … 10 mg + 10 mg. Poziomy, kolejność nazw i flaga wycofania bez zmian.

## Key Decisions Made

| Decision                | Choice                                 | Why (1 sentence)                                                                     |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| Jednostki masy          | Przeliczać g / mg / mcg (µg) na mg     | 25 nazw (antybiotyki 500 mg, 1 g, 2 g) dostaje naturalną kolejność.                  |
| Różne kształty mocy     | Najpierw grupa jednostki, potem liczby | Nie miesza dawki tabletki ze stężeniem roztworu; jeden spójny klucz.                 |
| Stężenia z mianownikiem | Licznik, potem mianownik               | Odpowiada liczbom widocznym w podpowiedzi (dawka w strzykawce).                      |
| Moce złożone            | Składnik po składniku                  | 2,5+1,25 < 5+2,5 < 10+5 < 10+10 — naturalne dla szukających po pierwszej substancji. |
| Nieparsowalne i puste   | Na końcu nazwy, między sobą tekstowo   | Konkretne dawki, których się szuka, są na górze.                                     |
| Miejsce zmiany          | Klucz liczony raz w `buildSearchIndex` | Komparator bez regexów; zapas wydajności ok. 350 ms; poprawny porządek całkowity.    |

## Scope

**In scope:**

- Klucz mocy i nowy krok w `compareEntries` (`src/lib/registry-search.ts`).
- Testy regresji w `src/lib/registry-search.test.ts` (własna lista, oczekiwania wyprowadzone ręcznie).
- `search:check` przed/po z przeglądem różnic, `perf`, ręczne sprawdzenie `/szukaj`.

**Out of scope:**

- Migracje, API, UI, import i formularz apteczki.
- Przeliczanie j.m. ↔ IU i stężeń na jednostkę; parsowanie list („5 mg; 10 mg”), zakresów, homeopatii.

## Architecture / Approach

Czysta funkcja zamienia tekst mocy w `{ signature, values }` albo `null`; wynik trafia do `RegistrySearchEntry` przy budowie indeksu. `compareEntries`: wycofany → długość nazwy → nazwa → parsowalna przed `null` → sygnatura jednostek → liczby → tekst mocy → id. Parser rozumie spację tysięcy („10 000”), przecinek dziesiętny, mianownik („/0,5 ml”), składniki „+” i wspólny mianownik („(… + …)/5 ml”), ignoruje końcowy nawias z równoważnikiem.

## Phases at a Glance

| Phase                              | What it delivers                                                               | Key risk                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1. Reguła i testy                  | Wzorzec `search:check` przed zmianą, czerwone → zielone testy, nowy komparator | Wzorzec musi powstać przed edycją, na wspólnej bazie (zgoda koordynatora) |
| 2. Weryfikacja na pełnym rejestrze | Przejrzany diff `search:check`, nowy wzorzec, `perf`, ręczne `/szukaj`         | Zmiana `version` listy przez inne sesje unieważnia porównanie             |

**Prerequisites:** zgoda koordynatora (w1:p1) na `search:check`, serwer na porcie 4332 i `perf`; ta sama `version` listy w obu przebiegach `search:check`.
**Estimated effort:** ok. 1 sesja, 2 fazy.

## Open Risks & Assumptions

- Przy nazwach z ponad 20 wariantami w poziomie zmienia się też zestaw widocznych podpowiedzi, nie tylko kolejność — oczekiwane w przeglądzie diffu.
- Kolejność grup jednostek jest umowna (tekstowa po sygnaturze, np. „mg” przed „mg/ml”).
- Lokalna lista ma 0 wycofanych wariantów mimo S-13 — zgłoszone koordynatorowi; nie wpływa na regułę.

## Success Criteria (Summary)

- „1000 mg” nie stoi już przed „500 mg” w podpowiedziach tej samej nazwy; g i mg ułożone według dawki.
- Testy regresji i istniejące testy zielone; diff `search:check` zawiera tylko zmiany kolejności mocy.
- Czas gotowości listy w `perf` bez pogorszenia.
