---
date: 2026-10-01T13:24:23+02:00
researcher: michalg84 (z Claude Code)
git_commit: 279447f18ac56857129bf62ea70c1432e637c5d1
branch: main
repository: michalg84/mamlek
topic: "F-01: jaki plik RPL jest potrzebny do importu i jak wyglądają dane"
tags: [research, rpl, registry-import, xml, f-01]
status: complete
last_updated: 2026-10-01
last_updated_by: michalg84 (z Claude Code)
---

# Research: F-01 — jaki plik RPL jest potrzebny do importu i jak wyglądają dane

**Date**: 2026-10-01T13:24:23+02:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: 279447f18ac56857129bf62ea70c1432e637c5d1
**Branch**: main
**Repository**: michalg84/mamlek

## Research Question

Zaczynamy F-01 (`registry-copy-load`). Czy import potrzebuje pliku wsadowego z bazy RPL od użytkownika, a jeśli tak, w jakim formacie: CSV (16 MB), XML (70 MB) czy XLSX (6 MB)?

## Summary

- **Na produkcji import nie potrzebuje pliku od użytkownika.** Zaplanowany import działa w GitHub Actions (`context/foundation/tech-stack.md:24`) i sam pobiera zrzut z `https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml` (`context/foundation/shape-notes.md:327`). Sprawdzone 2026-10-01 zapytaniem `HEAD`: `HTTP 200`, `Content-Type: application/xml`, `Content-Length: 73885321`, `Content-Disposition` z nazwą `Rejestr_Produktow_Leczniczych_calosciowy_stan_na_dzien_20261001_6.0.0.xml`. Zrzut jest więc generowany na bieżący dzień.
- **Format: XML.** W XML-u substancje czynne i opakowania są osobnymi elementami z atrybutami. W CSV są sklejone w jedną komórkę tekstową, której nie da się jednoznacznie rozbić na listę. Do F-01 nie są potrzebne ani CSV, ani XLSX.
- Lokalna kopia zrzutu z 2026-09-23 (XML i dwa pliki XSD) leży poza repo w `C:\Users\MiG\Desktop\10xDevs docs\RPL\`. Służy do projektowania schematu i jako źródło małej próbki testowej. Do repo nie trafia.

## Detailed Findings

Wszystkie liczby w tej sekcji dotyczą lokalnego zrzutu `Rejestr_Produktow_Leczniczych_calosciowy_stan_na_dzien_20260923_6.0.0.xml` (dalej „zrzut 2026-09-23”), chyba że napisano inaczej. Policzono je jednorazowym skryptem Node poza repo, który wycina atrybuty wyrażeniami regularnymi i nie dekoduje encji XML. Dekodowanie nie zmienia liczności ani obecności pól.

### Struktura pliku (XSD)

Źródło: `schematXmlRejestr_Produktow_Leczniczych.xsd` (wersja 6.0.0, namespace `http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0`) oraz `commonTypes.xsd` (wersja 2.0.0). Oba pliki leżą w tym samym katalogu co zrzut.

- Korzeń to `<produktyLecznicze stanNaDzien="YYYY-MM-DD">`, w zrzucie 2026-09-23 `stanNaDzien="2026-09-23"` (XSD linia 216). Tę datę można wprost zapisać jako datę stanu rejestru na potrzeby S-07.
- `<produktLeczniczy>` przechowuje pola skalarne jako atrybuty (XSD linie 193–212): `nazwaProduktu`, `rodzajPreparatu`, `nazwaPowszechnieStosowana`, `nazwaPoprzedniaProduktu`, `moc`, `nazwaPostaciFarmaceutycznej`, `podmiotOdpowiedzialny`, `typProcedury`, `numerPozwolenia`, `waznoscPozwolenia`, `podstawaPrawna`, `zakazStosowaniaUZwierzat`, linki do ulotek i charakterystyki, `id` oraz `status`.
- Listy są elementami potomnymi: `kodyATC/kodATC` (linie 9–15), `drogiPodania/drogaPodania` z gatunkami i okresami karencji dla weterynarii (linie 16–54), `substancjeCzynne/substancjaCzynna` z atrybutami `nazwaSubstancji`, `iloscSubstancji`, `jednostkaMiaryIlosciSubstancji`, `iloscPreparatu`, `jednostkaMiaryIlosciPreparatu`, `innyOpisIlosci` (linie 55–74), `opakowania/opakowanie` z `kodGTIN`, `kategoriaDostepnosci`, `skasowane`, `id` i zagnieżdżonym `jednostkiOpakowania/jednostkaOpakowania` (`liczbaOpakowan`, `rodzajOpakowania`, `pojemnosc`, `jednostkaPojemnosci`) (linie 75–135). Do tego `daneOWytworcy` i `materialyEdukacyjne`.
- Typy z `commonTypes.xsd`: `booleanAsString` = `TAK|NIE|""`, `limitedString` ≤ 255 znaków, `bigIntAsString` ≤ 19 znaków, `changeTypeString` = `Nowy|Zmodyfikowany|Usuniety` (typ atrybutu `status`).

### Liczności w zrzucie 2026-09-23

- Produkty: 22 909. Unikalne `id`: 22 909, duplikaty: 0, więc w tym zrzucie `id` nadaje się na klucz produktu.
- `rodzajPreparatu`: `ludzki` 20 258, `weterynaryjny` 2 651.
- `typProcedury`: DCP 6 389, NAR 5 723, CEN 4 421, IR (import równoległy) 4 354, MRP 2 008, SRP 10, MRPh 4.
- Liczba substancji czynnych na produkt: 0 → 1 049, 1 → 17 781, 2 → 2 912, 3 lub więcej → 1 167 (maksimum 46). Unikalnych wartości `nazwaSubstancji`: 4 258.
- Opakowania: 88 411. `skasowane="NIE"` 82 670, `skasowane="TAK"` 5 741. Produkty bez opakowań: 4. Produkty, w których wszystkie opakowania są skasowane: 0.
- `kategoriaDostepnosci` opakowań: Rp 56 368, OTC 20 632, Rpz 8 243, Lz 1 916, Rpw 1 126, pusta 66, bRp 28, LzRp 25. W rozkładzie są 12 różnych wartości, tu wymieniono 8 najliczniejszych.
- Najdłuższe wartości: `nazwaProduktu` 124 znaki, `nazwaPowszechnieStosowana` 254, `nazwaPostaciFarmaceutycznej` 145, `moc` 1 831. Kolumna na `moc` nie może więc mieć limitu 255. Pustą `moc` ma 120 produktów, pustą `nazwaPowszechnieStosowana` 9.
- 940 produktów ma w atrybutach nagłówka encje XML (`&amp;`, `&quot;`, `&apos;` lub `&lt;`). Parser musi dekodować encje, a import nie może wycinać wartości samym tekstem.

### Produkty bez substancji czynnych

- W zrzucie 2026-09-23 jest 1 049 produktów z pustym `<substancjeCzynne/>`. Rozkład `typProcedury/rodzajPreparatu`: IR/ludzki 465, NAR/ludzki 264, CEN/ludzki 196, CEN/weterynaryjny 99, MRP/ludzki 10, DCP/ludzki 8, DCP/weterynaryjny 6, MRP/weterynaryjny 1.
- 1 042 z nich ma wypełnioną `nazwaPowszechnieStosowana`. Przykład: Smecta z importu równoległego (`id="100016564"`, `typProcedury="IR"`) ma pustą listę substancji i `nazwaPowszechnieStosowana="Diosmectitum"`.
- Wniosek dla S-03 (porównanie po substancji): bez fallbacku na NPS te produkty nie mają dopasowania.

### Niespójna pisownia substancji

- Ten sam lek występuje w różnych rekordach zrzutu 2026-09-23 z różną pisownią substancji. Rekordy Smecty mają `nazwaPowszechnieStosowana="Diosmectitum"` oraz `nazwaSubstancji="Diosmectitum"` w jednym rekordzie i `"Diosmectiteum"` w innych.
- Sprawdzono tylko ten przykład; skala zjawiska nie została zmierzona. Dotyczy dopasowania w S-03 i S-06, nie blokuje F-01.

### Status i wycofanie z obrotu

- Atrybut `status` (XSD linia 212, `Nowy|Zmodyfikowany|Usuniety`) nie występuje w żadnym z 22 909 produktów zrzutu 2026-09-23. Wnioskuję (bez potwierdzenia w dokumentacji), że służy raportom przyrostowym, nie całościowym.
- W zrzucie całościowym nie ma więc flagi „wycofany”. Są dwa sygnały pośrednie:
  - `waznoscPozwolenia`: `Bezterminowe` 10 404, data 8 252, pusta 4 234, `Pozwolenie zawieszone` 19. Dat wcześniejszych niż `stanNaDzien` (2026-09-23) jest 2 443: 2 310 ludzkich i 133 weterynaryjnych.
  - `opakowanie@skasowane="TAK"`: 5 741 opakowań. Żaden produkt nie ma wszystkich opakowań skasowanych.
- To dotyczy Open Roadmap Question 5 (`context/foundation/roadmap.md:219`).

### XML kontra CSV kontra XLSX

- CSV ze zrzutu 2026-09-23: 34 kolumny, 22 909 wierszy danych (tyle samo co produktów w XML), separator `;`, pola w cudzysłowach, niektóre wielowierszowe, bez BOM. Wszystkie wiersze mają 34 pola.
- Kolumna `Substancja czynna` w CSV to tekst, w którym substancje są sklejone przez `+`, z ilością w dowolnym zapisie. Przykłady:
  - `"Glucosamini sulfas 400 mg/2 ml + Lidocaini hydrochloridum 10 mg/2 ml"` (Arthryl Fast);
  - wielowierszowy opis z dawkami poszczególnych tabletek dla preparatu z `Ethinylestradiolum` i `Levonorgestrelum`.
    Odtworzenie listy substancji wymagałoby heurystycznego cięcia tekstu. XML daje tę listę wprost.
- Kolumna `Opakowanie` w CSV to tekst w formacie `GTIN ¦ kategoria ¦ id` plus linia z opisem (np. `1 fiol. 5 ml`). W XML te same dane są atrybutami.
- XLSX nie był analizowany. Zawiera ten sam raport w innym kontenerze i nie daje danych, których nie ma w XML.
- Znany adres pobierania to XML (`context/foundation/shape-notes.md:327`). Adresów pobierania CSV i XLSX nie sprawdzano, bo nie są potrzebne.

### Stan repozytorium (commit 279447f)

- Brak katalogu `supabase/migrations/` (jest tylko `supabase/config.toml` i `supabase/snippets/`), zgodnie z `AGENTS.md` („`supabase/migrations/` … don't exist yet”).
- `package.json` nie ma w `dependencies` ani `devDependencies` parsera XML. Biblioteka strumieniowa (74 MB) jest do wyboru w `/10x-plan`.
- `scripts/` zawiera `roadmap-sync.mjs` i `smoke.mjs`, a `.github/workflows/` zawiera tylko `ci.yml`. Nie ma żadnego kodu importu, zgodnie z Baseline (`context/foundation/roadmap.md:72`, `:74`).

## Code References

- `context/foundation/roadmap.md:79-92` — definicja F-01, Unknowns (pola indeksu, produkty wycofane).
- `context/foundation/roadmap.md:219` — Open Roadmap Question 5 (produkty wycofane).
- `context/foundation/tech-stack.md:24` — import w GitHub Actions do tabeli tymczasowej i podmiana w jednej transakcji.
- `context/foundation/shape-notes.md:326-328` — adres zrzutu XML.
- `context/foundation/shape-notes.md:334-344` — kandydaci na pola indeksu; RPL.API wyłącznie do wglądu (brak licencji, parser piszemy od zera).
- `context/foundation/infrastructure.md:73`, `:93` — ryzyko cichego zatrzymania importu w Actions (dotyczy S-07).
- `C:\Users\MiG\Desktop\10xDevs docs\RPL\schematXmlRejestr_Produktow_Leczniczych.xsd` — schemat zrzutu 6.0.0 (poza repo).
- `C:\Users\MiG\Desktop\10xDevs docs\RPL\commonTypes.xsd` — typy wspólne (poza repo).

## Architecture Insights

- Kontrakt danych dla importu to XSD 6.0.0. Wersja jest częścią adresu (`.../public-pl-report/6.0.0/overall.xml`), więc zmiana wersji schematu po stronie RPL to zmiana adresu, nie cicha zmiana formatu. Import powinien sprawdzać namespace korzenia i przerywać się, gdy się nie zgadza.
- Naturalny model danych to produkt (klucz `id`), lista substancji (0..n), opcjonalnie lista opakowań (GTIN, kategoria dostępności, wielkość opakowania). FR-003 wymaga, żeby „jednostka i wielkość opakowania pochodziły z rekordu rejestru” (`context/foundation/prd.md:147`), więc opakowania prawdopodobnie też trafiają do kopii. To decyzja dla `/10x-plan`.
- `stanNaDzien` z korzenia jest gotowym źródłem daty dla S-07.

## Historical Context (from prior changes)

- `context/archive/2026-09-29-roadmap-github-sync/` — synchronizacja roadmapy z GitHub, niezwiązana z danymi RPL. Wcześniejszych badań RPL w `context/changes/**` ani `context/archive/**` nie ma.
- Ustalenia z shape-notes (`context/foundation/shape-notes.md:310-312`, „~70 MB”, „XML/XLSX/CSV”) potwierdzone: zrzut 2026-09-23 w XML ma 73 965 604 bajty, a dzisiejszy według `Content-Length` 73 885 321. Wszystkie trzy formaty istnieją.

## Related Research

Nie dotyczy, to pierwszy research w obszarze rejestru.

## Open Questions

1. **Produkty weterynaryjne (2 651 w zrzucie 2026-09-23):** czy wchodzą do kopii? Apteczka domowa sugeruje, że nie. Owner: autor. Nie blokuje planowania.
2. **Produkty wycofane (Open Roadmap Question 5):** zrzut całościowy nie ma flagi. Czy wygasła `waznoscPozwolenia` (2 443 produkty), `Pozwolenie zawieszone` (19) albo skasowane opakowania mają wpływać na kopię lub podpowiedzi? Owner: autor.
3. **Produkty bez substancji (1 049):** czy wchodzą do kopii i czy S-03 ma używać `nazwaPowszechnieStosowana` jako fallbacku? Owner: autor, decyzja może poczekać do S-03.
4. **Pola indeksu wyszukiwania** (`context/foundation/roadmap.md:89`): kandydaci potwierdzeni w realnym pliku to `nazwaProduktu`, `nazwaPowszechnieStosowana`, `substancjaCzynna@nazwaSubstancji`. Wybór należy do S-01, ale F-01 musi te pola zachować.
5. **Normalizacja pisowni substancji** (np. „Diosmectitum” / „Diosmectiteum”): skala niezmierzona. Dotyczy S-03 i S-06.
