<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Przegląd i edycja apteczki (S-05)

- **Plan**: context/changes/kit-browse-edit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Bramki uruchomione przy przeglądzie (HEAD `e0b0f3c`):

- `npx vitest run --project unit --project component --project registry`: 589/589;
- `npm run lint`, `npm run ui:scan`, `npx astro check`, `npm run build`: przechodzą;
- `npm run test:db`: 90/90;
- `npm run smoke`: przechodzi.

`npm run test:api` nie przeszedł, bo zatrzymał się w `beforeAll`. Lokalna baza ma pełny rejestr zamiast fixture'ów v1, v1, v2, a `db reset` nie był dozwolony w tej sesji. Kontrole ręczne (2.5–2.6, 3.4–3.7, 4.5–4.8) czekają na człowieka.

## Findings

### F1 — Niepoprawny wpis w polu ilości czyści zapisaną ilość

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitList.tsx:54-67, src/components/kit/KitItemEdit.tsx:106-110
- **Detail**:
  - Pole to `<input type="number">`. Przy wpisie typu `-`, `1e` albo `.` przeglądarka daje `value === ""` i ustawia `validity.badInput`.
  - `parseQuantityInput("")` zwraca `{ value: null }`, więc „Zapisz” albo Enter wysyła `PATCH { quantity: null }` i kasuje zapisaną ilość bez ostrzeżenia. Panel „Edytuj” robi to samo.
  - Testy jednostkowe sprawdzają tylko czystą funkcję, nie zachowanie pola w przeglądarce.
- **Fix**: przy `validity.badInput` pokazać „Podaj liczbę całkowitą, 0 lub większą” zamiast traktować pole jako puste, w obu miejscach. Dodać test komponentu z `badInput`.
- **Decision**: PENDING

### F2 — „Edytuj” w trakcie zapisu ilości może cofnąć świeży zapis

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitList.tsx:144,213; src/components/kit/KitItemEdit.tsx:73-76,91-95
- **Detail**:
  - Stan `saving` należy do pola ilości, więc „Edytuj” jest aktywny, dopóki trwa PATCH.
  - Panel otwarty w tym czasie startuje ze starą ilością. Po odpowiedzi serwera `item` się zmienia i panel uznaje starą ilość za zmianę.
  - Jeśli użytkownik zmieni potem tylko datę i zapisze, panel wyśle też starą ilość i nadpisze nią właśnie zapisaną.
- **Fix A ⭐ Recommended**: przenieść stan „zapis w toku” do `KitRow` i blokować „Edytuj” i „Usuń”, dopóki trwa zapis ilości.
  - Strength: usuwa wyścig u źródła, a wiersz ma jeden stan zapisu.
  - Tradeoff: trochę więcej stanu w wierszu i drobna zmiana testów.
  - Confidence: HIGH — mała zmiana w jednym pliku.
  - Blind spot: fokus po zablokowaniu przycisku (do sprawdzenia w 3.6).
- **Fix B**: dać panelowi `key` z `quantity`, `expiresOn` i `packageId`, żeby po podmianie pozycji zamontował się od nowa.
  - Strength: jedna linia.
  - Tradeoff: kasuje to, co użytkownik zdążył wpisać w panelu.
  - Confidence: MED — zachowanie poprawne, ale zaskakujące dla użytkownika.
  - Blind spot: fokus po ponownym montażu.
- **Decision**: PENDING

### F3 — `useKitItemActions` nie loguje przyczyn błędów

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useKitItemActions.ts:39,43-45,48,59
- **Detail**:
  - Dwa `catch {}` dla błędu sieci i `response.json().catch(() => null)` nie logują przyczyny. Odpowiedź `!response.ok` też nie zostawia śladu.
  - To narusza twardą regułę z CLAUDE.md: „Never hide the evidence”.
  - Wzorzec skopiowano ze starszego `KitAddForm.tsx`. Najnowszy sąsiad, `KitImport.tsx:89-91,332-349`, loguje `console.error(cause)` oraz status i payload.
- **Fix**: przejąć wzorzec `KitImport` we wszystkich czterech miejscach.
- **Decision**: PENDING

### F4 — Pozycja wycofana może nie dostać opcji „obecne”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/kit/KitItemEdit.tsx:53-64
- **Detail**:
  - Regułę bliźniaka (opcja przejmuje `packageId` pozycji) plan opisał tylko dla GTIN schowanego przez `uniquePacks`.
  - Kod stosuje ją też dla pozycji `withdrawn`. Gdy produkt ma aktywne opakowanie o tej samej etykiecie, „obecne” się nie pokazuje, a wybór tej opcji niczego nie wysyła. Pozycja po cichu zostaje na wycofanym GTIN.
  - Fixture'y CI tego przypadku nie mają, więc nie wyłapie tego ani test, ani kontrola 4.7.
- **Fix**: przy `item.withdrawn` zawsze przypinać „obecne” i stosować regułę bliźniaka tylko dla aktywnych pozycji. Dodać test z wycofanym opakowaniem i aktywnym bliźniakiem.
- **Decision**: PENDING

### F5 — Pakiet zbiorczy `radix-ui` obok `@radix-ui/react-*`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:45, src/components/ui/alert-dialog.tsx:3
- **Detail**:
  - `shadcn add alert-dialog` dodał pakiet zbiorczy `radix-ui`: 42 nowe wpisy w lockfile i podbite wersje radio-group, slot, label i primitive.
  - Pozostałe komponenty `ui/` importują z pojedynczych `@radix-ui/react-*`.
  - Duplikatów dziś nie ma, ale przy przyszłych aktualizacjach mogą się rozjechać wersje.
- **Fix**: zależność `@radix-ui/react-alert-dialog` zamiast `radix-ui` i import `* as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"`.
- **Decision**: PENDING

### F6 — 404 przy usuwaniu zostawia wiersz na liście

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitList.tsx:~168-174
- **Detail**: pozycja usunięta w innej karcie zostaje na liście z komunikatem „odśwież stronę”, choć już wiadomo, że jej nie ma.
- **Fix**: po 404 z DELETE usunąć wiersz przez `onRemoved(item.id)`, z tym samym przeniesieniem fokusu.
- **Decision**: PENDING

### F7 — „Sesja wygasła” przy zapisie bez linku do logowania

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useKitItemActions.ts:17-19
- **Detail**: 401 przy wczytywaniu opakowań w panelu pokazuje link „Zaloguj się” (`KitItemEdit.tsx:166`, jak `KitAddForm`). 401 przy zapisie lub usuwaniu pokazuje tylko sam tekst.
- **Fix**: zwracać `kind: "session"` (jak `KitImport`) i pokazywać link do `/auth/signin`.
- **Decision**: PENDING

### F8 — Luki w pokryciu testami i dokumentacji

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/kit/KitList.test.tsx:146, tests/api/helpers.ts:204-222, AGENTS.md (opis `test:api`)
- **Detail**:
  - Hydratacji `today` (`useSyncExternalStore`) nie sprawdza żaden test, bo testy używają `render()`, nie `hydrateRoot`.
  - `siblings` w testach API to opakowania jednego produktu, więc przeniesienie na import równoległy nie jest pokryte. Zawężenie jest opisane w test-plan.md.
  - AGENTS.md nie wymienia nowych przypadków PATCH i DELETE w `kit-access.test.ts` (404 dla cudzego wiersza, 403 dla obcego `Origin`).
- **Fix**: dopisać do AGENTS.md jedno zdanie o PATCH i DELETE. Hydratację zostawić kontroli ręcznej 2.5 albo dodać test z `hydrateRoot`.
- **Decision**: PENDING

### F9 — Limit ilości sprawdzany przed zapisem, bez blokady

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kit/[id].ts:53,92
- **Detail**: dwa równoległe PATCH tego samego konta (zmiana opakowania i zmiana ilości) mogą zapisać ilość większą niż nowe opakowanie. W bazie nie ma ograniczenia, które by temu zapobiegło. Dotyczy to tylko własnych danych użytkownika.
- **Fix**: przyjąć jako znaną lukę i dopisać ją do planu albo lessons.
- **Decision**: PENDING
