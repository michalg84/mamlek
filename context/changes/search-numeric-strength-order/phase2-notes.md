# Faza 2 — notatki (2026-11-17)

## 2.1 search:check (zrobione)

- Wzorzec przed zmianą: lista `version` 1794911068, 31 zapytań; drugi przebieg na tej samej wersji: 12 zapytań z różnicami (exit 1).
- Każda różnica to zmiana kolejności mocy w obrębie tej samej nazwy: sekwencja nazw identyczna we wszystkich 12 zapytaniach, `total` bez zmian.
- Zestaw widocznych 20 zmienił się tylko w „metformin” (Metformin hydrochloride Biofarm ma teraz na 20. miejscu 500 mg zamiast 1000 mg) — oczekiwane.
- Przykłady: Paracetamol Aristo 500 → 1000 mg; IBUM / Nurofen dla dzieci 60 → 125 mg; Paracetamol Hasco 80 mg przed 120 mg/5 ml; Apenal 50, 80, 250 mg, potem 100 mg/ml; Clopidogrel/ASA Viatris 75+75 przed 75+100; Maxitrol grupuje `/g` przed `/ml` i scala „j.m” z „j.m.”.
- Nowy wzorzec zapisany (`.perf/search-golden.json`).

## 2.2 perf (zrobione)

Te same ustawienia, `npm run build` (czysty `dist/`) + `wrangler dev` na 4332, `--profile both --runs 5`, pomiary jeden po drugim (najpierw kod z `main` 2e99481, potem HEAD):

| metryka (mediana / max, ms)       | main        | HEAD        |
| --------------------------------- | ----------- | ----------- |
| fast: list ready                  | 1207 / 1219 | 1101 / 1191 |
| fast: worker build, bez dławienia | 137 / 183   | 155 / 205   |
| slow: list ready                  | 2188 / 2485 | 2550 / 2636 |
| slow: worker build, bez dławienia | 129 / 229   | 165 / 177   |
| slow: early typing longest task   | 0 / 67      | 0 / 104     |

- Budowa indeksu w workerze dłuższa o ok. 20–35 ms (mediana); wszystkie progi spełnione w obu profilach.
- Różnica list ready w profilu slow (+362 ms) nie wynika z workera (+36 ms), tylko z rozrzutu sieci; w profilu fast HEAD wypadł szybciej.
- Wcześniejszy pierwszy przebieg HEAD (zimny start po buildzie) miał early typing longest task max 351 ms; w powtórce na ciepło 104 ms (≤ 200).

## 2.3 ręczne /szukaj (zrobione przez agenta na prośbę użytkownika)

Build HEAD + `wrangler dev` na 4332, jednorazowe konto, Playwright wpisuje zapytanie w pole wyszukiwania i odczytuje podpowiedzi (serwer zatrzymany po teście):

- duomox: 250 mg, 375 mg, 500 mg, 750 mg, 1 g — zgodnie z oczekiwaniem.
- abilify: 5, 10, 10 (ODT), 15, 15 (ODT), 30, 30 (ODT) mg, potem 1 mg/ml, 7,5 mg/ml; Abilify Maintena 300, 400, 720, 960 mg osobno (dłuższa nazwa) — zgodnie z oczekiwaniem.
- acebis: 2,5+1,25, 2,5+2,5, 5+2,5, 5+5, 10+5, 10+10 mg — zgodnie z oczekiwaniem.
