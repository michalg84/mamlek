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
