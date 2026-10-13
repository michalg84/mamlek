# Pomiar nazw powszechnych na pełnym rejestrze

Etap 6 planu `testing-check-verdict-correctness`. Zapytania: `placeholder-measurement.sql` (tylko odczyt, polecenie uruchomienia w nagłówku pliku). Zmierzone przez `medicine_check_common_name_set` i `medicine_check_substance_set`, czyli tak, jak widzi to reguła; produkty wycofane są wliczone.

## Stan rejestru (baza lokalna, pomiar 2026-10-13)

| Pole                                          | Wartość         |
| --------------------------------------------- | --------------- |
| Data stanu rejestru (`snapshot_date`)         | 2026-10-08      |
| Wersja listy (`registry_search_list.version`) | 1791578995      |
| Warianty na liście                            | 16 170          |
| Produkty (wszystkie / aktywne)                | 20 257 / 20 257 |
| Wiersze substancji                            | 25 529          |

## Cztery liczby

| #   | Co mierzymy                                                                                        | Wynik                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Nazwy powszechne (nie ogólniki) wspólne dla produktów o rozłącznych niepustych zbiorach substancji | **309** nazw, z tego **202** bez wspólnego pierwszego słowa                                   |
| 2   | Wartości ze spacją nierozdzielającą (nazwa / moc / postać / nazwa powszechna / nazwa substancji)   | **1**: moc produktu Fostex (id 100177310), `(100 mcg  + 6 mcg)/dawkę`; w pozostałych polach 0 |
| 3   | Nazwy powszechne z separatorem innym niż „+” (przecinek, średnik, ukośnik)                         | **118** różnych nazw, **210** produktów                                                       |
| 4   | Pary kluczy wariantu różniące się wyłącznie odstępami                                              | **6** par, **49** produktów                                                                   |

Przykłady do pozycji 3: `Estradiolum, Estradiolum + Dydrogesteronum` (26 produktów), `Amylmetacresolum + Alcohol 2,4-dichlorobenzylicus` (9), `Szczepionka przeciw COVID-19 (rekombinowana, z adiuwantem)` (8), `Simoctocogum alfa. Czynnik VIII krzepnięcia krwi ludzki, rekombinowany` (8). Dziesięć najczęstszych zwraca zapytanie 6.

Pozycja 4, wszystkie 6 par (różnią się końcową albo podwójną spacją w mocy):

- `citrafleet`, `(0,01 g + 3,50 g + 10,97 g)/saszetkę`: z końcową spacją i bez
- `citrafleet`, `(0,01 g + 3,5 g + 10,97 g)/sasz.`: z podwójną spacją i bez
- `cyclo 3 fort`, `150 mg + 150 mg + 100 mg`: z końcową spacją i bez
- `dermovate`, `0,5 mg/ml`: z końcową spacją i bez
- `hepa-merz 3000`, `3 g/5 g`: z końcową spacją i bez
- `tardyferon`, `80 mg fe2+`: z końcową spacją i bez

## Małe litery i spacja nierozdzielająca: lokalnie i na produkcji

Zapytanie (to samo na obu bazach):

```sql
select lower('ŻÓŁĆ') as lowered, 'a' || chr(160) || 'b' ~ '\s' as nbsp_is_whitespace;
```

| Baza                                                  | `lower('ŻÓŁĆ')` | spacja nierozdzielająca pasuje do `\s` |
| ----------------------------------------------------- | --------------- | -------------------------------------- |
| lokalna (Supabase CLI, kodowanie UTF8, `en_US.UTF-8`) | `żółć`          | `true`                                 |
| produkcja (wynik wpisany przez autora)                | `żółć`          | `true`                                 |

Wyniki są takie same: brak rozjazdu, którego test w CI by nie widział (`research.md`, pytanie otwarte 7). Lokalnie `[[:space:]]` też daje `true`.

## Lista podejrzanych nazw (pierwsze 50 z 309)

Kolejność z zapytania: najpierw nazwy bez wspólnego pierwszego słowa, potem malejąco po liczbie produktów. Kolumna „wspólne pierwsze słowo” to tylko podpowiedź do sortowania, niczego nie odsiewa. Pominięto 259 nazw (od 51. do 309.), w tym 152 bez wspólnego pierwszego słowa i 107 ze wspólnym. Pełną listę zwraca zapytanie 3 z pliku SQL.

W przykładach w nawiasach kwadratowych stoi cały zbiór substancji produktu; przykłady to po jednym produkcie z każdego z pierwszych trzech różnych zbiorów.

| #   | Nazwa powszechna                           | Produkty | Różne zbiory | Wspólne pierwsze słowo | Przykłady                                                                                                                                                                                      |
| --- | ------------------------------------------ | -------- | ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | olanzapinum                                | 149      | 2            | nie                    | Zyprexa 5 mg [olanzapinum] · Egolanza 10 mg [olanzapiny dichlorowodorek trójwodny]                                                                                                             |
| 2   | escitalopramum                             | 108      | 2            | nie                    | Escipram 5 mg [escitaloprami oxalas] · Lexapro 10 mg [escitalopramum]                                                                                                                          |
| 3   | metformini hydrochloridum                  | 107      | 2            | nie                    | Metformax 500 500 mg [metformini hydrochloridum] · Metformin hydrochloride Teva 500 mg [metforminum]                                                                                           |
| 4   | sildenafilum                               | 97       | 3            | nie                    | Viagra 100 mg [sildenafili citras] · Inventum 25 mg [sildenafili citras; sildenafilum] · Sildenafil Teva 25 mg [sildenafilum]                                                                  |
| 5   | quetiapinum                                | 96       | 2            | nie                    | Ketilept 100 mg 100 mg [quetiapini fumaras] · Ketipinor 200 mg [quetiapinum]                                                                                                                   |
| 6   | sitagliptinum                              | 90       | 2            | nie                    | Sigletic 25 mg [sitagliptini hydrochloridum monohydricum] · Januvia 50 mg [sitagliptinum]                                                                                                      |
| 7   | betahistini dihydrochloridum               | 82       | 2            | nie                    | Lavistina 16 mg [betahistini dihydrochloridum] · Betaserc 8 mg [betahistinum]                                                                                                                  |
| 8   | levothyroxinum natricum                    | 81       | 2            | nie                    | Eferox 100 mikrogramów [levothyroxine sodium] · Eltroxin 100 mcg [levothyroxinum natricum]                                                                                                     |
| 9   | amlodipinum                                | 80       | 3            | nie                    | Amlozek 10 mg [amlodipini besilas] · Tenox 5 mg [amlodipini maleas] · Cardilopin 2,5 mg [amlodipinum]                                                                                          |
| 10  | sunitinibum                                | 76       | 3            | nie                    | Sunitinib Pharmascience 12,5 mg [sunitinibi hydrochloridum] · Sunitinib Synthon 12,5 mg [sunitinibi maleas] · Sutent 12,5 mg [sunitinibum]                                                     |
| 11  | cholecalciferolum                          | 75       | 2            | nie                    | Vigantol 500 mcg/ml (20 000 IU/ml) [cholecalciferolum] · Vitamin D3 Krka 500 IU [cholecalciferolum, pulvis]                                                                                    |
| 12  | rivastigminum                              | 68       | 2            | nie                    | Rivastigmin Orion 1,5 mg [rivastigmini hydrogenotartras] · Exelon 6 mg [rivastigminum]                                                                                                         |
| 13  | insulinum humanum                          | 67       | 4            | nie                    | Polhumin MIX-4 100 j.m./ml [insulina ludzka biosyntetyczna wysokooczyszczona] · Gensulin M50 (50/50) 100 j.m./1 ml [insulina ludzka rekombinowana] · Humulin R 100 j.m./ml [insulinum humanum] |
| 14  | acidum acetylsalicylicum                   | 65       | 2            | nie                    | Acard 75 mg [acidum acetylsalicylicum] · Anopyrin 75 mg [kwas acetylosalicylowy]                                                                                                               |
| 15  | paliperidonum                              | 65       | 2            | nie                    | Egoropal 75 mg [paliperidoni pamitas] · Invega 3 mg [paliperidonum]                                                                                                                            |
| 16  | nicotinum                                  | 63       | 2            | nie                    | Niquitin 4 mg [nicotini resinas] · Nicorette Classic Gum 2 mg [nicotinum]                                                                                                                      |
| 17  | progesteronum                              | 53       | 2            | nie                    | Crinone 80 mg/g [progesterone] · Luteina 50 50 mg [progesteronum]                                                                                                                              |
| 18  | ropinirolum                                | 53       | 2            | nie                    | Requip 2 mg [ropiniroli hydrochloridum] · Adartrel 0,25 mg [ropinirolum]                                                                                                                       |
| 19  | venlafaxinum                               | 52       | 2            | nie                    | Efectin ER 75 75 mg [venlafaxini hydrochloridum] · Venlectine 75 mg [venlafaxinum]                                                                                                             |
| 20  | solifenacini succinas                      | 48       | 2            | nie                    | Solifenacin PMCS 5 mg [solifenacini succinas] · Vesicare 5 mg 5 mg [solifenacyny bursztynian]                                                                                                  |
| 21  | benzydamini hydrochloridum                 | 47       | 2            | nie                    | INALDIN Gardło Max 3 mg/ml [benzydamine hydrochloride] · Tantum Rosa 53,2 mg/g [benzydamini hydrochloridum]                                                                                    |
| 22  | duloxetinum                                | 43       | 3            | nie                    | Dutilox 30 mg [duloxetini hydrochloridum] · Dulxetenon 90 mg [duloxetini hydrochloridum; duloxetinum] · Yentreve 20 mg [duloxetinum]                                                           |
| 23  | fentanylum                                 | 43       | 2            | nie                    | Fentanyl WZF 50 mcg/ml [fentanyli citras] · Durogesic 25 mcg/h [fentanylum]                                                                                                                    |
| 24  | sumatriptanum                              | 42       | 2            | nie                    | Imigran 100 mg [sumatriptani succinas] · MIGTAN 50 mg [sumatriptanum]                                                                                                                          |
| 25  | tobramycinum                               | 42       | 2            | nie                    | Tobrex 3 mg/g [tobramycini sulfas] · Tobrosopt 0,3 % 3 mg/ml [tobramycinum]                                                                                                                    |
| 26  | epoetinum alfa                             | 39       | 4            | nie                    | Epoetin alfa Hexal 1000 j.m./0,5 ml [epoetinum alfa] · Binocrit 40 000 j.m./ml [epoetinum alpha] · Epoetin alfa Hexal 3000 j.m./0,3 ml [erythropoietinum alfa humanum recombinatum]            |
| 27  | ofloxacinum                                | 39       | 2            | nie                    | Ofloxamed 3 mg/ml [ofloxacin] · Tarivid 200 200 mg [ofloxacinum]                                                                                                                               |
| 28  | ivabradinum                                | 38       | 2            | nie                    | Bixebra 5 mg [ivabradini hydrochloridum] · Corlentor 5 mg [ivabradinum]                                                                                                                        |
| 29  | clindamycinum                              | 36       | 4            | nie                    | Dalacin C 75 mg [clindamycini hydrochloridum] · Dalacin C 75 mg/5 ml [clindamycini palmitas] · Dalacin C 150 mg/ml [clindamycini phosphas]                                                     |
| 30  | vortioxetinum                              | 36       | 2            | nie                    | Brintellix 5 mg [vortioxetini hydrobromidum] · Vortioxetine Stada 5 mg [vortioxetinum]                                                                                                         |
| 31  | doxazosinum                                | 34       | 2            | nie                    | Cardura 1 mg [doxazosini mesilas] · Cardura 2 mg [doxazosinum]                                                                                                                                 |
| 32  | midazolamum                                | 33       | 3            | nie                    | Midazolam Accord 1 mg/ml [midazolami hydrochloridum] · Dormicum 15 mg [midazolami maleas] · Midanium 1 mg/ml [midazolamum]                                                                     |
| 33  | sertralinum                                | 32       | 2            | nie                    | Zoloft 50 mg [sertralini hydrochloridum] · Asentra 50 mg [sertralinum]                                                                                                                         |
| 34  | oxycodoni hydrochloridum                   | 31       | 2            | nie                    | Oxycodone Kalceks 10 mg/ml [oxycodone hydrochloride] · OxyContin 5 mg [oxycodoni hydrochloridum]                                                                                               |
| 35  | fingolimodum                               | 30       | 3            | nie                    | Fingolimod Stada 0,5 mg [fingolimodi hydrochloridum] · Fingolimod Zentiva 0,5 mg [fingolimodi hydrochloridum; fingolimodum] · Gilenya 0,5 mg [fingolimodum]                                    |
| 36  | levofloxacinum                             | 29       | 2            | nie                    | Levofloxacin Genoptim 500 mg [levofloxacini hemihydras] · Tavanic 5 mg/ml [levofloxacinum]                                                                                                     |
| 37  | rupatadinum                                | 28       | 2            | nie                    | Rupafin 1 mg/ml [rupatadini fumaras] · Rupafin 10 mg 10 mg [rupatadinum]                                                                                                                       |
| 38  | tapentadolum                               | 28       | 5            | nie                    | Palexia retard 100 mg [tapentadoli hydrochloridum] · Adoben 50 mg [tapentadoli maleas hemihydricum] · Binatta 25 mg [tapentadoli phosphas]                                                     |
| 39  | atomoxetinum                               | 27       | 2            | nie                    | Auroxetyn 10 mg [atomoxetini hydrochloridum] · Atofab 10 mg [atomoxetinum]                                                                                                                     |
| 40  | bortezomibum                               | 27       | 2            | nie                    | Bortezomib Reddy 3,5 mg [bortezomib] · Velcade 3,5 mg [bortezomibum]                                                                                                                           |
| 41  | tizanidinum                                | 27       | 2            | nie                    | Tizanor 2 mg [tizanidini hydrochloridum] · Sirdalud MR 6 mg [tizanidinum]                                                                                                                      |
| 42  | dydrogesteronum + estradiolum, estradiolum | 26       | 2            | nie                    | Femoston mite 1 mg (biała), 1 mg + 10 mg (szara) [dydrogesteronum; estradiolum] · Femoston 2 mg (ceglastoczerwone), 2 mg + 10 mg (żółte) [estradiolum, estradiolum + dydrogesteronum]          |
| 43  | acidum ibandronicum                        | 25       | 2            | nie                    | Bondronat 2 mg [acidum ibandronicum] · Ibandronic Acid Sandoz 50 mg [natrii ibandronas monohydricum]                                                                                           |
| 44  | allopurinolum                              | 25       | 2            | nie                    | Allupol 300 mg [allopurinol] · Allupol 100 mg [allopurinolum]                                                                                                                                  |
| 45  | povidonum iodinatum                        | 25       | 3            | nie                    | Braunovidon 100 mg/g [polyvidonum iodinatum] · Betadine 100 mg/g [povidonum iodinatum] · Betadine 100 mg/ml [powidon jodowany]                                                                 |
| 46  | ferrosi sulfas                             | 24       | 2            | nie                    | Tardyferon 80 mg Fe2+ [ferrosi sulfas] · Tardyferon 80 mg [ferrum]                                                                                                                             |
| 47  | flurbiprofenum                             | 24       | 2            | nie                    | Strepsils Intensive Direct 8,75 mg/dawkę [flurbiprofen] · Strepsils Intensive 8,75 mg [flurbiprofenum]                                                                                         |
| 48  | citalopramum                               | 23       | 2            | nie                    | Cital 20 mg [citaloprami hydrobromidum] · Cipramil 20 mg [citalopramum]                                                                                                                        |
| 49  | moxifloxacinum                             | 23       | 2            | nie                    | Vigamox 5 mg/ml [moxifloxacini hydrochloridum] · Moxifloxacin Aurovitas 400 mg [moxifloxacinum]                                                                                                |
| 50  | simeticonum                                | 23       | 2            | nie                    | Simet 80 mg [simeticonum] · Espumisan 40 mg [symetykon]                                                                                                                                        |

## Decyzje autora

Wypełnia autor. Żaden oczekiwany wynik nie trafia do testów przed decyzją. Dla każdej pozycji: prawdziwy ogólnik albo ta sama substancja, i co dalej (test jako znane ograniczenie albo osobna zmiana reguły).

| Pozycja                                                    | Decyzja: ogólnik / ta sama substancja / inne | Co dalej: test znanego ograniczenia / zmiana reguły / nic | Uwagi                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista podejrzanych nazw (309): grupy albo pojedyncze nazwy | odłożone                                     | do ustalenia                                              | Autor 2026-10-13: nie ocenia listy teraz, wraca do niej później (wiersz 6.4 planu zostaje otwarty). Pomiar da się powtórzyć poleceniem z `placeholder-measurement.sql`.                                                     |
| Spacja nierozdzielająca (1 wartość)                        | bez zmiany                                   | nic                                                       | Autor 2026-10-13: poza obcinaniem spacji na początku i końcu niczego nie zmieniamy.                                                                                                                                         |
| Separatory inne niż „+” (118 nazw, 210 produktów)          | znane ograniczenie, bez zmiany               | nic                                                       | Autor 2026-10-13: nic nie robimy. Femoston: 26 produktów z „+” w nazwie substancji (18 to jeden wzorzec), 20 z 26 zgodnych po podziale po „+”; skutek to utrata podpowiedzi „ta sama substancja” między różnymi produktami. |
| Odstępy w kluczu wariantu (6 par, 49 produktów)            | ten sam lek w dwóch zapisach                 | zmiana reguły tylko dla spacji na początku i końcu        | Autor 2026-10-13: jedyna zmiana to obcinanie (btrim) spacji na początku i końcu; podwójne i nierozdzielające zostają bez zmiany.                                                                                            |
| Różnica lokalnie/produkcja w `lower` albo `s`              | brak różnicy                                 | nic                                                       | Oba wyniki: `żółć`, `true`.                                                                                                                                                                                                 |

## Co dalej poza tą zmianą

- **Obcinanie spacji na początku i końcu klucza wariantu:** osobna mała zmiana reguły (migracja `medicine_check` i klucz wariantu listy wyszukiwania muszą pozostać spójne), z testem „spacja na końcu to ten sam lek”. Zakres: 6 par, 49 produktów.
- **Ocena listy 309 nazw pod kątem ogólników:** odłożona (wiersz 6.4).
- **Spacje podwójne i nierozdzielające, separatory inne niż „+”, „+” w nazwie substancji:** bez zmian, decyzja autora.
