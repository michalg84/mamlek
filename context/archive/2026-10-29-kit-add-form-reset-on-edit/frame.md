# Frame Brief: Formularz dodawania zostaje po zmianie nazwy

> Krok ramowania przed /10x-plan. Oddziela to, co widać, od tego, co zakładano.

## Reported Observation

Na `/apteczka`, po wyborze leku A z podpowiedzi i zmianie tekstu w polu bez nowego wyboru, pod polem zostaje formularz leku A („Wybrano: A”, opakowania, przycisk „Dodaj do apteczki”). Autor odtworzył to na żywo (2026-10-29) trzema sposobami: wpisanie innej nazwy, wyczyszczenie pola, dopisanie lub skasowanie liter. Kliknięcie przycisku dodaje lek A, choć w polu jest inny tekst.

## Initial Framing (preserved)

- **User's stated cause or approach**: `KitAddForm` nie przekazuje `onEdit` do `MedicineSuggest` (roadmapa S-10, test-plan §6.6).
- **User's proposed direction**: poprawka jak w `RegistrySearch` (`onEdit` zeruje wybór) plus test komponentu według wzorca z test-plan §6.3.
- **Pre-dispatch narrowing**: obawa dwuczęściowa, „oba tak samo”: da się dodać zły lek, a ekran przeczy sam sobie (pole i formularz pokazują dwa różne leki).

## Dimension Map

1. **Wejście: `MedicineSuggest` nie zgłasza edycji** — `onEdit` jest opcjonalny (`MedicineSuggest.tsx:15`), wywoływany w `handleChange` (`:63`).
2. **Stan wyboru w rodzicu: `KitAddForm` go nie zeruje** — `variant` żyje w `KitAddForm` (`:346`), nic go nie czyści ← początkowe ujęcie.
3. **Kształt kontraktu: opcjonalny `onEdit`** — kompilator nie wymusza obsługi edycji, więc każdy nowy użytkownik komponentu może pominąć ten krok.
4. **Wysłanie: `POST /api/kit` ufa `packageId`** — serwer nie wie, co jest w polu, więc strażnikiem może być tylko UI.

## Hypothesis Investigation

| Hypothesis                                 | Evidence                                                                                                                                         | Verdict                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1. `MedicineSuggest` nie wywołuje `onEdit` | `MedicineSuggest.tsx:63` wywołuje `onEdit?.()` przy każdej zmianie tekstu; `RegistrySearch` na tym działa (`RegistrySearch.tsx:54`, fix 3c974ae) | NONE                                       |
| 2. `KitAddForm` nie zeruje wyboru          | `KitAddForm.tsx:350` przekazuje tylko `onSelect`; `:352` renderuje `PackForm`, gdy `variant` jest ustawiony; odtworzone na żywo 3 sposobami      | STRONG                                     |
| 3. Opcjonalny `onEdit` ułatwia pominięcie  | komentarz `:14` tłumaczy cel, ale typ pozwala go pominąć; ten sam błąd miał `RegistrySearch` do 2026-10-09                                       | WEAK (przyczyna sprzyjająca, nie sprawcza) |
| 4. Serwer powinien chronić                 | w polu nie ma nic, co serwer mógłby porównać; `packageId` jest tym, co użytkownik świadomie wybrał                                               | NONE                                       |

## Narrowing Signals

- Odtworzone na żywo: zmiana nazwy, wyczyszczenie pola i skasowanie liter dają ten sam skutek, więc nie chodzi o jeden szczególny przypadek.
- `select()` w `MedicineSuggest` ustawia tekst, ale nie woła `onEdit` (`:52-57`), więc zerowanie przy edycji nie skasuje świeżo wybranego leku.
- `PackForm` ma `key={variant.id}` (`KitAddForm.tsx:352`), więc wybór innego leku z podpowiedzi już działa; brakuje tylko ścieżki edycji tekstu.

## Cross-System Convention

`RegistrySearch` rozwiązuje ten sam problem tym samym kontraktem (`onEdit` zeruje wybór, komentarz „the card and the verdict must never sit under a different name”). `KitAddForm` jest jedynym drugim użytkownikiem `MedicineSuggest` i jedynym bez tego.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: początkowe ujęcie było poprawne. `KitAddForm` trzyma wybór leku, który po edycji tekstu przestaje odpowiadać polu, a przycisk „Dodaj do apteczki” działa na tym nieaktualnym wyborze.

Przyczyna, objaw i miejsce poprawki zgadzają się z zapisem w roadmapie. Nie ma podstaw do przeramowania. Jedyna uwaga: obawa autora ma dwie części (zły lek w apteczce, sprzeczny ekran), więc test powinien sprawdzać obie, a nie tylko znikanie formularza.

## Confidence

**HIGH**: strong evidence w kodzie, błąd odtworzony na żywo trzema sposobami, a wzorzec naprawy istnieje w `RegistrySearch`.

## What Changes for /10x-plan

Niczego. Plan ma zacząć od testu komponentu, który najpierw jest czerwony. Powinien pokryć zmianę nazwy, wyczyszczenie pola i fakt, że wybór leku z podpowiedzi nadal pokazuje formularz. Zadanie ma też sprawdzić, że do `POST /api/kit` nie idzie `packageId` poprzedniego leku po edycji. Zgodnie z pułapką z test-plan §6.3 scenariusz „edycja po wyborze” musi faktycznie wpisywać tekst.

## References

- `src/components/kit/KitAddForm.tsx:345-355`
- `src/components/registry/MedicineSuggest.tsx:15,52-64`
- `src/components/registry/RegistrySearch.tsx:51-57`
- Commit 3c974ae (to samo naprawione w `RegistrySearch`)
- `context/foundation/test-plan.md` §6.3, §6.6; roadmapa S-10; issue #38
- Zadania śledztwa: brak (dowody jednoznaczne po lekturze kodu i odtworzeniu na żywo, pominięto równoległych agentów)
