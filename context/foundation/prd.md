---
project: "MamLek"
version: 3
status: active
created: 2026-09-24
updated: 2026-11-16 # v3: reguły z audytu zgodności (context/audits/prd-conformance/2026-11-16.md); v2 w archive/2026-11-16-prd.md; tego samego dnia autor zmienił decyzję o rejestracji: zostaje otwarta
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small # apteczka jest mała; osobno pełna kopia rejestru ~70 MB
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD: MamLek

## Vision & Problem Statement

Domowa apteczka w gospodarstwie z trójką dzieci jest fizyczną szufladą, której
zawartości nie da się sprawdzić z zewnątrz. Wychodząc z gabinetu z listą leków albo
stojąc przy okienku w aptece, osoba ogarniająca apteczkę nie wie, czy dany lek już
leży w domu, ani czy leży tam zamiennik o tej samej substancji czynnej. Obecny sposób
sprawdzenia to telefon do domu — kończy się niepewną odpowiedzią, bo przy tej liczbie
opakowań trudno utrzymać porządek i znaleźć lek na szybko. W efekcie kupowane jest
drugie opakowanie, które zostaje „na kiedyś" i bywa, że się przeterminowuje.
Pojedyncze leki kosztują kilkadziesiąt złotych i to właśnie stracone pieniądze są
głównym powodem powstania aplikacji.

Aplikacje pokazujące zawartość apteczki istnieją — autor je widział, choć nie
sprawdzał, jak działają. Nie widział natomiast wyszukiwania zamiennika, a to
zamiennik przekłada się bezpośrednio na niewydane pieniądze. Trzy rzeczy mają tu
działać inaczej: porównanie po substancji czynnej oparte o Rejestr Produktów
Leczniczych zamiast ręcznie utrzymywanej listy nazw; apteczka jako wspólny zasób
domu, a nie osobisty harmonogram leków jednej osoby; masowe wprowadzenie apteczki
zamiast wpisywania pozycji po jednej, bo ręczne wklepanie kilkudziesięciu leków
zabija taką aplikację w pierwszym tygodniu.

## User & Persona

Osoba ogarniająca wspólną domową apteczkę — w praktyce autor i jego żona,
gospodarstwo z trójką dzieci. Jedna fizyczna apteczka, w której leki wszystkich
domowników leżą razem.

Sięga po produkt w dwóch momentach:

- **W gabinecie**, gdy lekarz wypisuje lek: chce sprawdzić nazwę i powiedzieć „mam
  taki lek, czy może być". Odpowiedź musi przyjść w kilka sekund, bo ktoś czeka.
- **W aptece po drodze do domu**, z listą leków w ręku: chce wiedzieć, których
  pozycji nie kupować, bo leżą w domu albo ma lek z tą samą substancją czynną.

Oba momenty to ta sama akcja — sprawdzenie nazwy leku przeciwko zawartości apteczki
— w dwóch miejscach. Nie są osobnymi funkcjami.

## Success Criteria

### Primary

- „Przy którejś kolejnej wizycie u lekarza czy w aptece nie kupię leku, który mam
  w domu — nieistotne, czy jest to zamiennik, czy konkretnie wypisany na recepcie."
  (sformułowanie autora). Kryterium jest zdarzeniem, nie okresem — miesiąc uznany
  za zbyt krótki okres obserwacji.

### Secondary

- Aplikacja ostrzega o kończącej się dacie ważności, zanim lek się przeterminuje.
  Miłe, ale samo w sobie nie świadczy o sukcesie.

### Guardrails

- Aplikacja nigdy nie zgaduje leku. Lek wchodzi do apteczki tylko jako wskazany
  rekord rejestru; przy braku pewnego wskazania aplikacja pyta zamiast strzelać.
  Fałszywe wskazanie leku o tej samej substancji jest gorsze niż brak odpowiedzi.
- Przy każdym wskazaniu leku o tej samej substancji czynnej widoczne wprost
  zastrzeżenie: decyzję konsultuj z farmaceutą lub lekarzem. Przy wyniku, nie w stopce.
- Dane apteczki nie wychodzą poza konto domu i nie są widoczne dla nikogo z zewnątrz.
- Sprawdzenie leku trwa sekundy, nie minuty — przy okienku w aptece wolna odpowiedź
  jest równoważna brakowi odpowiedzi.

## User Stories

### US-01: Sprawdzenie leku przed zakupem

- **Given** zalogowane konto domu z apteczką odwzorowaną w aplikacji
- **When** użytkownik wpisuje nazwę leku z recepty i wybiera pozycję z podpowiedzi
- **Then** widzi jedną z odpowiedzi: masz ten lek / masz lek z tą samą substancją
  czynną / nie masz — wraz z substancjami czynnymi, mocą i postacią po obu stronach
  porównania oraz zastrzeżeniem o konsultacji z farmaceutą lub lekarzem

Pierwszy pełny przepływ, na którym opiera się ta historia:

```
1. logowanie na konto domu
2. wprowadzenie apteczki: formularz z podpowiadaniem z rejestru
   albo wklejenie / wgranie CSV
3. ekran zatwierdzenia: każdy wiersz przypisany do rekordu z rejestru
   (propozycje + wybór z listy), użytkownik zatwierdza
4. w aptece lub u lekarza: wpisanie nazwy leku z podpowiadaniem z rejestru
5. odpowiedź: masz ten lek / masz lek z tą samą substancją czynną / nie masz
```

Plik CSV użytkownik generuje sobie sam poza aplikacją — robi zdjęcie leków
i prosi dowolny darmowy czat AI o wypisanie nazw, dawek i dat ważności. Aplikacja
podaje oczekiwany format. Kamera, OCR i integracja z modelem AI są poza MVP.

Podpowiadanie z rejestru obsługuje trzy miejsca tym samym mechanizmem: formularz
ręczny, ekran zatwierdzenia importu i sprawdzenie leku. Lista podpowiedzi pokazuje
nazwę razem z mocą i postacią — sama nazwa nie wystarcza do rozróżnienia
(„Ibuprom Max 400" kontra „Ibuprom 400").

### US-02: Wprowadzenie apteczki z pliku CSV

- **Given** zalogowane konto domu i plik CSV przygotowany przez użytkownika poza
  aplikacją, według formatu i promptu podanego przez aplikację
- **When** użytkownik wgrywa plik albo wkleja jego zawartość
- **Then** widzi ekran zatwierdzenia, na którym każdy wiersz ma przypisany rekord
  rejestru albo propozycje do wyboru (nazwa z mocą i postacią), może poprawić
  przypisanie, a leki trafiają do apteczki dopiero po zatwierdzeniu

#### Acceptance Criteria

- Wiersz bez dopasowania jest pokazany na ekranie i blokuje przejście dalej,
  dopóki użytkownik go nie poprawi albo nie usunie.
- Żaden wiersz nie jest pomijany po cichu.
- Niezatwierdzony import nie zmienia zawartości apteczki.
- Wiersz z lekiem, który już jest w apteczce, jest oznaczony „już masz”;
  użytkownik decyduje, czy dodać go jako osobne opakowanie, czy usunąć z importu.
- Wiersz bez daty ważności lub ilości przechodzi; brak jest pokazany jako „nieznane”.

## Functional Requirements

W numeracji są luki: FR-004 zostało wycięte, a FR-006 wchłonięte przez FR-005
w rundzie wyzwań. Numery pozostałych wymagań nie były przesuwane, żeby uzasadnienia
odnosiły się do tych samych identyfikatorów.

### Rejestr leków

- FR-001: System korzysta z pełnego Rejestru Produktów Leczniczych i odświeża go okresowo. Priority: must-have
  > Socrates: Rozważone kontrargumenty — rejestr zawiera produkty wycofane, odświeżanie to zadanie w tle bez nadzoru, pełny rejestr to nadmiar wobec kilkuset leków realnie przewijających się przez dom. Rozstrzygnięcie: zostaje bez zmian — bez własnej kopii rejestru nie ma substancji czynnych, a bez nich nie ma zamienników.
  > Doprecyzowanie (v3): „pełny rejestr” to produkty lecznicze stosowane u ludzi, bez opakowań usuniętych z rejestru. Produkt lub opakowanie, które zniknie z eksportu RPL, zostaje w bazie jako wycofane (nie jest kasowane); leków wycofanych przed pierwszym importem (październik 2026) nie ma w bazie wcale. Odświeżanie: codzienny import (patrz Non-Functional Requirements).
  > Doprecyzowanie (withdrawn-medicine-in-kit, 2026-11-16): każdy lek wycofany, który jest w bazie, da się znaleźć w podpowiedziach, dodać do apteczki, zaimportować z CSV i sprawdzić — bez limitu wieku wycofania. Lek wycofany przed pierwszym importem nadal nie istnieje w bazie, więc nie da się go wskazać.
- FR-002: Użytkownik może znaleźć lek w rejestrze, wpisując pierwsze litery; wyszukiwanie obejmuje nazwę produktu, nazwę powszechnie stosowaną i substancje czynne, z pierwszeństwem nazwy produktu. Podpowiedzi pokazują nazwę wraz z mocą i postacią. Priority: must-have
  > Socrates: Kontrargument „recepta często ma nazwę międzynarodową, nie handlową" — unieważniony przez dane: rekord rejestru niesie nazwę powszechnie stosowaną (np. „Paracetamolum") obok nazwy produktu. Rozstrzygnięcie: wymaganie rozszerzone o wyszukiwanie po kilku polach nazwy z ustaloną kolejnością.
  > Doprecyzowanie (v3): podpowiedzi pojawiają się od 3 wpisanych znaków, lista ma najwyżej 20 pozycji. Pozycją podpowiedzi jest wariant leku — nazwa + moc + postać — a nie pojedynczy produkt z rejestru: produkty o tym samym wariancie (np. ten sam lek od kilku importerów równoległych) są jedną pozycją.
  > Doprecyzowanie (withdrawn-medicine-in-kit, 2026-11-16): podpowiedzi obejmują też leki wycofane z rejestru. Wariant jest wycofany, gdy wycofane są wszystkie produkty o tej samej nazwie, mocy i postaci; jeśli choć jeden jest aktywny, wariant jest aktywny. Wycofany wariant ma pod nazwą oznaczenie „wycofany z rejestru” i w obrębie tego samego poziomu dopasowania stoi za aktywnymi, ale przed słabszymi poziomami. Przy wyborze opakowania (dodanie, import, edycja) wycofane opakowania są na liście z oznaczeniem „wycofane”, za aktywnymi; opakowanie wybiera się samo tylko wtedy, gdy lek ma jedno opakowanie w ogóle, licząc wycofane.

### Apteczka

- FR-003: Użytkownik może dodać lek do apteczki, wskazując rekord z rejestru i opcjonalnie podając datę ważności oraz pozostałą ilość; jednostka i wielkość opakowania pochodzą z rekordu rejestru. Brak daty lub ilości aplikacja pokazuje wprost jako „nieznane”. Priority: must-have
  > Socrates: Rozważone kontrargumenty — ten sam lek bywa w kilku opakowaniach o różnych datach ważności; data bywa nieczytelna na opakowaniu; świeżo kupione opakowanie jest zawsze pełne, więc pole ilości wydłuża formularz. Rozstrzygnięcie: zostaje bez zmian. Obsługa daty ważności trafiła do pytań otwartych.
  > Socrates (rewizja 2026-09-24): data i ilość stały się opcjonalne — zamyka to pytanie otwarte o datę ważności. Kontrargument „brak daty to też informacja” — przyjęty: aplikacja pokazuje brak wprost jako „nieznane”, inaczej użytkownik uzna go za „ważny”.
  > Doprecyzowanie (v3): data ważności ma dokładność do miesiąca (miesiąc i rok, jak na opakowaniu). Ilość 0 jest dozwolona (puste opakowanie zostaje na liście); górny limit to wielkość opakowania z rejestru, a gdy rejestr jej nie podaje — 100000. Zdanie o ilości zastępuje doprecyzowanie z kit-quantity-semantics poniżej.
  > Doprecyzowanie (kit-quantity-semantics, 2026-11-17): ilość jest w sztukach, gdy opakowanie liczy się w sztukach (tabletki, kapsułki, plastry…): „1 butelka 90 tabl.” to 90, „2 blistry po 10 tabl.” to 20; w pozostałych opakowaniach ilość jest w jednostkach opakowania („4 fiol. 5 ml” to 4). Wielkość opakowania nie jest limitem, tylko ostrzeżeniem „Więcej niż w opakowaniu (…)”: blister na 12 może mieć 14 luźnych tabletek. Jedyny górny limit to 100000. Przy dodawaniu (formularz i import) ilość to co najmniej 1 albo „nieznane”: pustego opakowania się nie dodaje, a wiersz importu z 0 blokuje zapis strony („Puste opakowanie — pomiń wiersz”). 0 daje tylko zmiana ilości pozycji, która już jest w apteczce; po zapisie 0 aplikacja pyta „Usunąć z apteczki?”, a „Anuluj” zostawia pozycję z napisem „Opakowanie puste”.
- FR-005: Użytkownik może przeglądać apteczkę oraz zmieniać i usuwać jej pozycje, w tym edytować pozostałą ilość bezpośrednio na liście — ten sam ekran służy przeglądowi apteczki przed wizytą u lekarza. Priority: must-have
  > Socrates: Brak kontrargumentu wobec samego przeglądania i edycji. Po rundzie wchłonęło dawne FR-006 (osobny tryb przeglądu), bo przyjęty kontrargument brzmiał: to ten sam ekran, dwa ekrany robiłyby to samo.
  > Doprecyzowanie (v3): edycja pozycji zmienia opakowanie (wielkość opakowania w obrębie tego samego wariantu), datę ważności i ilość, ale nie lek. Inny lek to usunięcie pozycji i dodanie nowej.

### Import listy leków

- FR-007: Użytkownik może wgrać plik CSV albo wkleić jego zawartość. Priority: must-have
  > Socrates: Rozważone kontrargumenty — dwie drogi wejścia to podwójna robota, CSV z czatu bywa połamany, import to ścieżka używana raz w życiu konta. Rozstrzygnięcie: zostaje bez zmian — bez masowego wejścia próg wejścia zabija aplikację w pierwszym tygodniu.
- FR-008: Aplikacja pokazuje oczekiwany format CSV i gotowy prompt do użycia w zewnętrznym czacie AI. Priority: must-have
  > Socrates: Rozważone kontrargumenty — prompt zestarzeje się szybciej niż aplikacja, wystarczyłby sam opis kolumn, aplikacja firmuje jakość cudzego narzędzia. Rozstrzygnięcie: zostaje bez zmian — bez podanego formatu i promptu użytkownik nie wie, czego od czatu chcieć.
- FR-009: Użytkownik zatwierdza wynik importu, przypisując każdy wiersz do rekordu rejestru lub poprawiając przypisanie; niezatwierdzony import nie trafia do apteczki. Wiersz bez dopasowania jest pokazany na ekranie potwierdzenia — użytkownik musi go poprawić albo usunąć, zanim przejdzie dalej. Nic nie jest pomijane po cichu. Wiersz z lekiem, który już jest w apteczce, jest oznaczony „już masz” — użytkownik decyduje, czy dodać go jako osobne opakowanie, czy usunąć z importu. Priority: must-have
  > Socrates: Kontrargument „nie wiadomo, co z wierszem bez dopasowania" — przyjęty i rozstrzygnięty w treści wymagania: wiersz jest pokazany, użytkownik go poprawia albo usuwa przed przejściem dalej. Ten ekran jest granicą odpowiedzialności: to moment, w którym użytkownik potwierdza dane i przejmuje za nie odpowiedzialność. Dlatego błędny odczyt z zewnętrznego czatu nie obciąża aplikacji.
  > Socrates (rewizja 2026-09-24): dopisane oznaczenie „już masz” dla leku, który już jest w apteczce. Brak kontrargumentu — zostaje.
  > Doprecyzowanie (v3): plik ma najwyżej 200 wierszy i 256 kB. Zatwierdzanie idzie stronami po 30 wierszy: każda strona zapisuje się w całości albo wcale, więc import przerwany w połowie zostawia w apteczce strony już zatwierdzone (import częściowy, pokazany wprost na ekranie). „Już masz” oznacza ten sam wariant leku, który jest w apteczce.
  > Doprecyzowanie (import-match-safety, 2026-11-16): lek jest przypisany bez kliknięcia tylko wierszowi z nazwą, mocą i postacią, gdy najdokładniejsze wyszukiwanie daje jeden wariant o tej samej nazwie (wielkość liter, polskie znaki i separatory nie mają znaczenia; „Nospa” to nie „No-Spa”) i tej samej mocy (każda liczba i jednostka z wiersza jest całym słowem mocy wariantu: „4 mg” to nie „40 mg”). W każdym innym przypadku użytkownik wybiera z podpowiedzi. Wiersz z otwartą zmianą leku blokuje zapis strony, dopóki użytkownik nie wybierze nowego leku albo nie anuluje zmiany; w trakcie zmiany widać lek, który jest przypisany teraz.

### Sprawdzenie leku

- FR-010: Użytkownik może wpisać nazwę jednego leku i sprawdzić go przeciwko zawartości apteczki. Priority: must-have
  > Socrates: Kontrargument „kilka nazw naraz to inny ekran" — przyjęty. Rozstrzygnięcie: wymaganie zawężone do jednego leku, tryb wielu nazw wydzielony jako FR-015 z priorytetem nice-to-have. Uzasadnienie autora z fazy 3: to pętla po tej samej logice, więc da się dołożyć bez przebudowy.
- FR-011: Aplikacja pokazuje dla sprawdzanej pozycji jeden z wyników: masz ten lek / masz lek z tą samą substancją czynną (w zakresie wynikającym z wybranego poziomu dopasowania) / nie masz, wraz ze szczegółem tego, co jest w domu — substancje czynne, moc, postać, pozostała ilość i data ważności. Te same pola są pokazane dla leku szukanego, żeby użytkownik mógł je porównać. Priority: must-have
  > Doprecyzowanie (kit-quantity-semantics, 2026-11-17): puste opakowanie (ilość 0) nie daje wyniku „masz ten lek” ani „masz lek z tą samą substancją czynną”; ilość nieznana liczy się jak posiadana. Puste pasujące opakowania są pokazane pod wynikiem w osobnej sekcji „Puste opakowania”, a czytnik ekranu ogłasza ich liczbę. Przypadek „wszystkie pasujące opakowania przeterminowane” rozstrzyga S-08.
  > Socrates: Kontrargument „sam werdykt nie wystarczy" — przyjęty. Rozstrzygnięcie: wymaganie rozszerzone o szczegół posiadanego leku. Przy okazji zdejmuje to część zarzutu o zbyt małą liczbę stanów — „zostały dwie tabletki" i „przeterminowany" widać w szczególe, zamiast mnożyć werdykty.
- FR-012: Przy wyniku wskazującym lek o tej samej substancji czynnej aplikacja pokazuje zastrzeżenie o konsultacji z farmaceutą lub lekarzem. Priority: must-have
  > Socrates: Rozważone kontrargumenty — zastrzeżenie powinno być przy każdym wyniku, spowszednieje, albo jest elementem interfejsu, a nie zdolnością. Rozstrzygnięcie autora: zostaje bez zmian. Zastrzeżenie dotyczy tego, że użytkownik nie powinien sam zamieniać leków, a nie tego, że aplikacja mogła się pomylić — dane wejściowe potwierdził użytkownik na ekranie z FR-009.
- FR-016: Użytkownik może wybrać poziom dopasowania substancji czynnych — precyzyjny (dokładna zgodność zestawu), zawiera wszystkie, zawiera jeden — i widzi go przy wyszukiwaniu. Priority: must-have
  > Socrates: Wymaganie dopisane po rundzie wyzwań, jako rozstrzygnięcie pytania o leki złożone, więc nie przechodziło osobnego wyzwania. Rozważyć przy implementacji: czy trzy poziomy są czytelne dla kogoś, kto nie myśli kategoriami zbiorów, i czy domyślny poziom nie sprawia, że pierwsze użycie kończy się odpowiedzią „nie masz".
- FR-015: Użytkownik może sprawdzić kilka nazw leków za jednym razem. Priority: nice-to-have
  > Socrates: Wymaganie powstało w rundzie wyzwań przez wydzielenie z FR-010, więc nie przechodziło osobnego wyzwania. Uwaga do fazy 6: pokrywa się częściowo z pomysłem „koszyka do konsultacji" (lista sprawdzonych leków do pokazania farmaceucie), który autor odłożył poza MVP.

### Konto

- FR-013: Użytkownik może zalogować się na konto domu. Priority: must-have
  > Socrates: Rozważone kontrargumenty — logowanie to próg przy okienku w aptece, dzielone hasło jest kłopotliwe, dla dwóch osób ekran logowania jest zbędny. Rozstrzygnięcie autora: zostaje bez zmian. Osobne konta przy jednej apteczce wymagałyby mechanizmu parowania kont — podzielenie się hasłem jest prostsze. Kto nie używa menedżera haseł, ten i tak nie użyje tej aplikacji. Sesję zaczyna się przed wejściem do gabinetu albo w drodze do apteki, więc logowanie nie koliduje z bezpiecznikiem „odpowiedź w sekundy".

### Poza przepływem głównym

- FR-014: Aplikacja ostrzega o zbliżającej się dacie ważności leku. Ostrzeżenie i sama data są widoczne na liście posiadanych leków oraz przy wyniku sprawdzenia, gdy użytkownik ma dany lek lub jego zamiennik. Priority: nice-to-have
  > Socrates: Rozważone kontrargumenty — brak powiadomień oznacza brak miejsca, w którym ostrzeżenie zastanie użytkownika; część pozycji wejdzie bez daty; ostrzeżenie bez akcji nic nie daje. Rozstrzygnięcie autora: zostaje, z doprecyzowanym miejscem wyświetlania — lista apteczki i wynik sprawdzenia. Okres przed końcem ważności do ustalenia (patrz Open Questions).

## Non-Functional Requirements

- Wynik sprawdzenia leku pojawia się w mniej niż 3 sekundy od zatwierdzenia nazwy
  na telefonie obsługującym aktualne wersje wymienionych niżej przeglądarek.
- Dane rejestru, na których opiera się odpowiedź, nie są starsze niż 7 dni. To cel
  operacyjny, nie gwarancja wymuszana przez aplikację: rejestr jest importowany
  codziennie, a jego świeżość widać po dacie „Stan rejestru na …” (data stanu
  z eksportu RPL) na ekranach `/szukaj` i `/apteczka`. Od 2026-11-18 (S-16)
  aplikacja porównuje tę datę z dzisiejszą (czas polski) i gdy jest starsza niż
  7 dni, wyróżnia ją jako ostrzeżenie „dane mogą być nieaktualne”.
  Nieudany przebieg importu jest zgłaszany autorowi mailem z GitHuba. Przed
  wyłączeniem harmonogramu przez GitHuba po 60 dniach bez aktywności chroni job
  `keepalive` w workflowie, który przy każdym przebiegu ponownie włącza workflow
  przez API; GitHub nie dokumentuje, że to zeruje licznik, więc sygnałem
  pozostaje ostrzeżenie przy dacie.
- Zawartość apteczki jest dostępna wyłącznie po zalogowaniu na konto domu i nie
  jest widoczna dla nikogo spoza tego konta.
- Aplikacja jest używalna na ekranie telefonu bez powiększania i bez poziomego
  przewijania; treść dłuższa niż ekran jest przewijana pionowo.
- Produkt działa w aktualnych wersjach Chrome, Edge, przeglądarek opartych
  na Chromium oraz Firefoksa.
- Produkt pozostaje używalny na telefonie do ośmiu lat starym. Próg 3 sekund nie
  obowiązuje na takim sprzęcie — wymagana jest używalność, nie czas odpowiedzi.

## Business Logic

Dla wskazanego leku aplikacja pokazuje wszystkie posiadane leki zawierające tę samą substancję czynną i wyświetla przy nich substancje czynne, moc i postać, a decyzję o zamianie podejmuje użytkownik, nie aplikacja.

Reguła przyjmuje dwa wejścia: lek wskazany przez użytkownika (wybrany z rejestru,
nie wpisany jako tekst) oraz zawartość apteczki, której każda pozycja jest powiązana
z rekordem rejestru. Wynikiem jest podział posiadanych leków na ten sam lek, leki
z tą samą substancją czynną i brak dopasowania — wraz z polami, które te przypadki
różnicują.

Aplikacja nie orzeka o równoważności leków. Różna moc i różna postać nie wykluczają
pokazania pozycji — użytkownik ma je zobaczyć i sam zdecydować, bo to on zna kontekst
(dla kogo jest lek, czy dziecko połknie tabletkę, ile jest wart czas i pieniądze).
Przeliczanie dawek, na przykład dwóch tabletek po 250 mg zamiast jednej 500 mg,
pozostaje po stronie użytkownika. Stąd sformułowanie wyniku mówi „masz lek z tą samą
substancją czynną", a nie „masz zamiennik" — to drugie obiecywałoby rozstrzygnięcie,
którego produkt nie jest w stanie unieść.

### Ten sam lek i ta sama substancja (v3)

Reguła działa na wariantach leku, nie na pojedynczych rekordach rejestru:

- **Ten sam lek** — posiadana pozycja ma ten sam wariant co lek szukany: tę samą
  nazwę, moc i postać. Wariant łączy produkty z importu równoległego (ten sam lek
  sprowadzany przez kilku importerów) i obejmuje opakowania już wycofane z rejestru,
  które leżą w apteczce (pokazane z oznaczeniem „wycofany z rejestru”). Lekiem
  szukanym też może być lek wycofany: karta wybranego leku pokazuje wtedy to samo
  oznaczenie, a reguła porównania się nie zmienia.
- **Ta sama substancja** — posiadana pozycja nie jest tym samym lekiem, ale ma ten
  sam zbiór substancji czynnych co lek szukany **albo** tę samą nazwę powszechnie
  stosowaną (porównywaną jako zbiór jej części, np. „Paracetamolum + Coffeinum”).
  Druga ścieżka jest potrzebna, bo RPL zapisuje tę samą substancję na różne sposoby:
  raz jako sól, raz bez niej (naproxenum / naproxenum natricum), z przedrostkiem lub
  bez (fluorouracilum / 5-fluorouracilum), a niektóre produkty nie mają w rejestrze
  substancji wcale (Pradaxa). Bez niej aplikacja odpowiadałaby „nie masz” o leku,
  który leży w domu.
- **Ogólniki nigdy nie pasują** — nazwa powszechna będąca ogólnikiem (np. „produkt
  złożony”) albo brak danych daje pusty zbiór, a pusty zbiór nie pasuje do niczego.
  Zgodnie z bezpiecznikiem: lepiej „nie masz” niż fałszywe wskazanie.
- Zbiory leku szukanego pochodzą z reprezentanta jego wariantu.

Znane ryzyko ścieżki po nazwie powszechnej: pomiar z 2026-11-16 znalazł 351 nazw
powszechnych, pod którymi są produkty o rozłącznych zbiorach substancji (9 236 par).
Przejrzane przykłady to ta sama substancja zapisana inaczej, ale próbka nie jest
pełna — przegląd jest częścią S-06. Wiersz apteczki nie pokazuje nazwy powszechnej,
więc przy takim dopasowaniu użytkownik widzi dwie różne listy substancji pod wynikiem
„ta sama substancja czynna”.

Leki złożone, z kilkoma substancjami czynnymi, obsługuje wybierany przez użytkownika
poziom dopasowania — trzy stopnie, od najostrzejszego do najluźniejszego:

- **Ten sam skład** (precyzyjny, domyślny) — dokładna zgodność zestawu substancji
  czynnych albo zestawu części nazwy powszechnej.
- **Zawiera wszystkie składniki** — posiadany lek zawiera wszystkie substancje czynne
  szukanego leku (albo wszystkie części jego nazwy powszechnej), ewentualnie także
  dodatkowe.
- **Zawiera którykolwiek składnik** — posiadany lek ma przynajmniej jedną wspólną
  substancję czynną (albo część nazwy powszechnej) z lekiem szukanym.

Obie ścieżki (zbiór substancji i zbiór części nazwy powszechnej) działają na każdym
poziomie tym samym operatorem, więc wynik jest monotoniczny: wszystko, co pasuje
przy „Ten sam skład”, pasuje przy „Zawiera wszystkie składniki”, a to — przy
„Zawiera którykolwiek składnik”. Ogólniki (także nazwa powszechna „-”) nie pasują na
żadnym poziomie. Pozycje są uporządkowane od najmocniejszego dopasowania: ten sam
lek, równy zestaw, posiadany lek z dodatkowymi składnikami, wspólna część.

Poziom jest widoczny przy wyszukiwaniu i użytkownik zmienia go sam, zamiast
aplikacji zgadującej, jak bardzo chce być pobłażliwa; wybór zostaje zapamiętany na
urządzeniu. Domyślny jest „Ten sam skład”, bo „Zawiera wszystkie składniki” zmienia
wynik także dla 36% leków jednoskładnikowych (np. ibuprofen → lek złożony
z ibuprofenem). Na poziomach luźnych wynik mówi „Masz lek zawierający składniki tego
leku” albo „Masz lek ze wspólnym składnikiem” i ostrzega, że te leki mogą mieć inny
skład (S-06).

## Access Control

Jedno konto na gospodarstwo domowe, dzielone przez domowników. Jedna fizyczna
apteczka odpowiada jednemu kontu — nie ma osobnych profili dla męża i żony, nie ma
zapraszania użytkowników ani współdzielenia apteczki między kontami.

Model płaski: każdy, kto zalogował się na konto domu, może dodać lek, zmienić stan,
usunąć pozycję i wyszukiwać zamienniki. Brak ról, brak podziału na podgląd i edycję.

Metoda logowania (v3): e-mail + hasło, jedno konto Supabase na dom. Rejestracja
jest otwarta (decyzja autora 2026-11-16): każdy dom zakłada konto sam, na własny
adres e-mail, i dostaje własną, pustą apteczkę; dane innych kont chroni RLS.
Aplikacja nie jest docelowo tylko dla domu autora. Produkcja służy też autorowi
do testów, więc są na niej jego konta testowe; osobnego środowiska deweloperskiego
nie ma. Jeśli nadużycia (np. masowe rejestracje botów) zaczną szkodzić aplikacji,
rejestrację da się wyłączyć ustawieniem projektu Supabase, bez zmiany kodu. Lokalny
Supabase ma otwartą rejestrację, bo `npm run smoke` i `npm run test:api` zakładają
konta testowe. Zmiany ani resetu hasła w aplikacji nie ma (patrz Non-Goals). Co
trzeba dołożyć przed szerszym udostępnieniem innym — Open Question 6.

## Non-Goals

- Ostrzeganie o interakcjach leków i przeciwwskazaniach. Aplikacja nie wchodzi
  w rolę doradcy medycznego — to ta sama granica, którą wyznacza zastrzeżenie
  o konsultacji z farmaceutą lub lekarzem.
- Ceny leków i liczenie zaoszczędzonych pieniędzy — mimo że oszczędność jest
  powodem powstania aplikacji. Rejestr nie niesie cen, więc wymagałoby to
  osobnego źródła danych.
- Dzielenie apteczki między gospodarstwami, zapraszanie użytkowników, apteczki
  wielu domów obok siebie. Wymaga mechanizmu parowania kont, odrzuconego na rzecz
  jednego konta na dom.
- Integracja z e-receptą lub Internetowym Kontem Pacjenta. Osobna ścieżka dostępu
  i uprawnień.
- Kamera i OCR wewnątrz aplikacji — użytkownik robi zdjęcie i przetwarza je sam
  w zewnętrznym czacie AI, aplikacja przyjmuje wynik jako CSV.
- Skanowanie grupowe opakowań, przechowywanie i parsowanie ulotek, analiza e-recepty.
- Odejmowanie pojedynczych dawek i śledzenie zażyć — zakłada nawyk, którego brak
  jest źródłem problemu.
- Plan leczenia według recepty i zaleceń lekarza.
- Powiadomienia o porach przyjmowania leków.
- Historia importów i historia stanów apteczki.
- Eksport apteczki do pliku — kandydat na pierwsze zadanie po MVP.
- Pozycje spoza rejestru (suplementy, maści z zagranicy, leki recepturowe) — było
  FR-004, wycięte w rundzie wyzwań. Powód: własny wpis to furtka na wolny tekst,
  a bezpiecznik mówi, że żaden lek nie wchodzi do apteczki jako tekst. Apteczka
  zawiera wyłącznie leki z rejestru. Do przemyślenia po MVP (autor, 2026-11-16):
  - Za: apteczka pokazywałaby całą prawdę (witamina D, magnez, leki z zagranicy);
    import listy z czatu nie gubiłby takich pozycji; własne wpisy byłyby prywatnym
    rejestrem domu.
  - Przeciw: łamie bezpiecznik „aplikacja nigdy nie zgaduje”; bez ustrukturyzowanych
    substancji „ta sama substancja” jest niemożliwa albo działa tylko po nazwie;
    literówki i duplikaty; niejasne zachowanie przy sprawdzeniu leku.
  - Kierunki: osobna kategoria „spoza rejestru” z wyraźnym oznaczeniem, która nigdy
    nie daje zielonego „Masz ten lek”; rejestr suplementów GIS (sprawdzić, czy dane
    są dostępne do pobrania).
- Zmiana i reset hasła w aplikacji (v3). Dziś zapomniane hasło resetuje autor
  w panelu Supabase; przy otwartej rejestracji wraca to jako Open Question 6.
- Koszyk do konsultacji — zapamiętanie sprawdzonych leków jako lista lub raport
  do pokazania farmaceucie, zamiast wyszukiwania każdego osobno przy okienku.
  Pomysł autora z rundy wyzwań; pokrywa się częściowo z FR-015.
- Tryb offline — aplikacja zakłada zasięg.
- Układ na duży ekran — MVP jest przeznaczone na przeglądarkę mobilną. Wersja
  desktopowa jest celem docelowym, ale nie wchodzi do MVP.
- Build na Androida.

## Open Questions

1. **Jak działają istniejące aplikacje do apteczki i czy któraś oferuje wyszukiwanie
   zamiennika?** — konkurencja nie została sprawdzona. Owner: autor. Blokuje: nie.
2. ~~**Jaką metodą loguje się użytkownik do konta domu?**~~ — rozstrzygnięte w v3
   (2026-11-16): e-mail + hasło, rejestracja otwarta (każdy dom zakłada konto
   sam), reset hasła poza zakresem — patrz Access Control i Non-Goals.
3. **Ile dni przed końcem ważności aplikacja ostrzega?** — okres do ustalenia.
   Owner: autor. Blokuje: nie.
4. **Który poziom dopasowania substancji czynnych jest domyślny?** — bezpiecznik
   „fałszywe wskazanie gorsze niż brak odpowiedzi" przemawia za startem od poziomu
   precyzyjnego i świadomym rozluźnianiem przez użytkownika. Ryzyko przeciwne:
   przy pierwszym użyciu aplikacja częściej odpowie „nie masz" i może wyjść
   na bezużyteczną. Owner: autor. Blokuje: nie.
5. **Czy zastrzeżenie przy wyniku „ta sama substancja czynna" spełnia wymagania
   prawne?** — FR-012 wymaga zastrzeżenia o konsultacji z farmaceutą lub lekarzem,
   ale jego treści nikt nie sprawdził pod kątem prawnym. Do sprawdzenia: czy potrzebna
   jest inna formuła, czy trzeba dodać zastrzeżenie o braku porady medycznej i czy
   samo wskazanie leku z tą samą substancją nie jest traktowane jako porada albo
   reklama produktu leczniczego. Tekst na ekranie („Ten sam skład czynny nie oznacza,
   że leki można zamieniać. Zapytaj farmaceutę lub lekarza.") różni się od
   sformułowania w Guardrails („decyzję konsultuj z farmaceutą lub lekarzem");
   weryfikacja ma objąć obie wersje i wskazać jedną. Owner: autor. Blokuje: nie.
6. **Co dołożyć, zanim aplikacja trafi szerzej do innych użytkowników?** — rejestracja
   jest otwarta (Access Control), ale do rozważenia później, przy szerszym
   udostępnieniu (autor, 2026-11-16):
   - własny serwer SMTP — wbudowana poczta Supabase wysyła tylko kilka e-maili na
     godzinę, więc przy kilku rejestracjach naraz część osób nie dostanie linku
     potwierdzającego;
   - potwierdzanie adresu e-mail na produkcji (w projekcie w chmurze domyślnie
     włączone; sprawdzić);
   - lista leków w domu to dane o zdrowiu (RODO): informacja o prywatności
     i usunięcie konta przez użytkownika; do tego reset hasła bez udziału autora;
   - ochrona przed botami (np. CAPTCHA w Supabase Auth), gdyby pojawiły się masowe
     rejestracje.
     Owner: autor. Blokuje: nie.
