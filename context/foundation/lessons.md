# Lessons Learned

> Rejestr powtarzających się reguł i wzorców, tylko do dopisywania. Czytany na starcie przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Utwórz PR po wypchnięciu gałęzi z funkcją

- **Context**: każda zmiana skończona na gałęzi z funkcją
- **Problem**: poprawki z przeglądu zostały wypchnięte na docs/search-performance-phase4, ale PR nie powstał, dopóki o to nie poprosiłeś. Musieliśmy dłużej czekać na testy na produkcji.
- **Rule**: Pamiętaj, żeby utworzyć PR po wypchnięciu gałęzi z funkcją.
- **Applies to**: all

## Oznaczaj testy ręczne i pozwól użytkownikowi zdecydować, które wykonuje

- **Context**: każda faza planu z krokiem Manual Verification (bramki `/10x-implement`, `/10x-impl-review`)
- **Problem**: agent wykonuje albo odhacza kontrole ręczne, chociaż użytkownik nie zdecydował się ich oddać, albo prośba o test ginie w długim raporcie, więc użytkownik nie wie, które testy są jego.
- **Rule**: Zawsze mów wprost, kiedy proszę użytkownika o wykonanie testu ręcznego, i proponuj, że wykonam go sam; użytkownik decyduje, które testy ręczne robi on, a które ja. Nigdy nie wykonuj ani nie odhaczaj kontroli ręcznej, dopóki tego nie powie.
- **Applies to**: implement, impl-review

## Planuj i deleguj fazy równolegle, gdzie to bezpieczne

- **Context**: planowanie (/10x-plan) i wykonanie (/10x-implement) planów z wieloma fazami
- **Problem**: fazy o rozłącznych plikach i bez zależności od wyniku innej fazy były robione jedna po drugiej, co wydłuża pracę; z kolei sprawdzenia mutacyjne edytujące kod produkcyjny zafałszowałyby testy uruchamiane równolegle na tym kodzie.
- **Rule**: Przy planowaniu oznacz fazy, które można wykonać równolegle (rozłączne pliki, brak zależności od wyniku innej fazy), a przy implementacji deleguj je równolegle do subagentów; bramki, staging i commity zawsze po kolei. Nie uruchamiaj sprawdzeń mutacyjnych edytujących kod produkcyjny równolegle z pracą, która uruchamia testy na tym kodzie.
- **Applies to**: plan, plan-review, implement

## Bramki tylko do odczytu równolegle, mutacje pojedynczo i osobno

- **Context**: bramki /10x-implement po fazie z testami (lint, astro check, pełny vitest, sprawdzenia mutacyjne)
- **Problem**: wszystko w jednym długim poleceniu przekroczyło limit 300 s i przeszło w tło; zawieszony krok trzymał turę ponad godzinę (1 h 7 min), choć te same kroki uruchomione osobno kończą się w krótkim czasie. Mutacje edytują kod produkcyjny, więc równoległy lint, astro check lub vitest zobaczyłby zepsuty kod.
- **Rule**: Lint, astro check i pełny vitest (tylko odczyt) uruchamiaj równolegle jako osobne polecenia w tle, każde z własnym limitem czasu. Sprawdzenia mutacyjne wykonuj dopiero po ich zakończeniu, pojedynczo, każdą osobnym krótkim poleceniem z przywróceniem pliku (git checkout --) zaraz po niej. Nigdy nie łącz ich w jednym poleceniu i po pierwszym przekroczeniu limitu nie czekaj na zawieszone polecenie w tle, tylko uruchom kroki od nowa osobno.
- **Applies to**: implement, impl-review
