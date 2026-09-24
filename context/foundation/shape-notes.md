---
project: "MamLek"
context_type: greenfield
created: 2026-09-23
updated: 2026-09-24
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small          # apteczka jest mała; osobno pełna kopia rejestru ~70 MB
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "rodzaj bólu"
      decision: "dane uwięzione w fizycznej apteczce, brakująca wiedza o zamiennikach, decyzja pod presją czasu; nadrzędnie — stracone pieniądze na zdublowanych i przeterminowanych lekach"
    - topic: "insight"
      decision: "zamiennik po substancji czynnej jako oszczędność pieniędzy (nie widziany w innych apkach); apteczka wspólna dla domu, nie osobista; niski próg wejścia przy wprowadzaniu apteczki; konkurencja niesprawdzona"
    - topic: "zakres persony"
      decision: "jedno gospodarstwo domowe — autor i żona"
    - topic: "model dostępu"
      decision: "jedno konto na gospodarstwo domowe, dzielone przez domowników; jedna apteczka = jedno konto"
    - topic: "role"
      decision: "płaski model — brak ról, każdy zalogowany może wszystko"
    - topic: "wprowadzanie leków do apteczki"
      decision: "MVP bez kamery i OCR w aplikacji — formularz ręczny albo import CSV, który użytkownik generuje sobie sam w dowolnym zewnętrznym czacie AI; obowiązkowy ekran zatwierdzenia z możliwością poprawek"
    - topic: "powiązanie leku z rejestrem"
      decision: "lek wchodzi do apteczki wyłącznie jako wybrany rekord rejestru (podpowiadanie od pierwszych liter, wybór z listy); wolny tekst nie trafia do apteczki jako lek"
    - topic: "pozycje spoza rejestru"
      decision: "wycięte z MVP w rundzie wyzwań — apteczka zawiera wyłącznie leki z rejestru, bo własny wpis byłby furtką na wolny tekst"
    - topic: "reguła zamiennika"
      decision: "aplikacja nie orzeka o równoważności: pokazuje posiadane leki z tą samą substancją czynną wraz z substancjami, mocą i postacią, a decyzję podejmuje użytkownik. Różna moc i postać nie wykluczają pokazania. Leki złożone nierozstrzygnięte"
    - topic: "zasięg i urządzenia"
      decision: "zakładamy zasięg, brak trybu offline; MVP na przeglądarkę mobilną, desktop poza MVP; Chrome, Edge, Chromium, Firefox; telefony do ośmiu lat, przy czym próg 3 sekund obowiązuje tylko na sprzęcie z aktualnymi przeglądarkami"
    - topic: "leki złożone"
      decision: "wybierany przez użytkownika poziom dopasowania substancji czynnych: precyzyjny (dokładna zgodność zestawu), zawiera wszystkie, zawiera jeden. Poziom widoczny przy wyszukiwaniu"
    - topic: "budżet czasu"
      decision: "2–3 tygodnie pracy po godzinach na pierwszy pełny przepływ"
    - topic: "stan leku w apteczce"
      decision: "liczba wpisywana ręcznie; jednostka i wielkość opakowania pochodzą z rekordu rejestru, więc nie powstaje własny model jednostek. Bez odejmowania pojedynczych dawek"
    - topic: "eksport apteczki"
      decision: "poza MVP — plik eksportowy szybko się dezaktualizuje, więc jako kopia bezpieczeństwa ma krótką przydatność. Kandydat na pierwsze zadanie po MVP"
    - topic: "data ważności i ilość"
      decision: "pola opcjonalne — w formularzu ręcznym i w imporcie; brak pokazany wprost jako „nieznane”, żeby nie został uznany za „ważny”"
    - topic: "duplikat w imporcie"
      decision: "wiersz z lekiem, który już jest w apteczce, oznaczony na ekranie zatwierdzenia jako „już masz”; użytkownik decyduje: osobne opakowanie albo usunięcie z importu"
    - topic: "dodatkowe user stories"
      decision: "dopisana US-02 (import CSV), bo tam kryteria akceptacji są nieoczywiste; pozostałe FR bez osobnych stories"
  frs_drafted: 14
  quality_check_status: accepted
---

# Shape notes: MamLek

Seed (dosłownie, z wywołania skilla):

> MamLek — webowa aplikacja do zarządzania domową apteczką, projektowana mobile-first
> (główny scenariusz: telefon w aptece lub u lekarza). Problem: po wizycie u lekarza
> nie wiem, czy dany lek już mam w domu i czy mam zamiennik o tej samej substancji czynnej.
>
> Zakres: import bazy RPL (dzienny zrzut XML/CSV), apteczka (lek, dawka, data ważności,
> pozostała ilość), sprawdzanie listy leków z recepty pod kątem posiadanych leków
> i zamienników po substancji czynnej, dodawanie leku zdjęciem opakowania z kamery
> telefonu w przeglądarce. Wyraźne zastrzeżenie w UI: decyzję o zamienniku konsultuj
> z farmaceutą lub lekarzem.
>
> Poza zakresem MVP: skanowanie grupowe, przechowywanie i parsowanie ulotek, analiza
> e-recepty, powiadomienia o porach przyjmowania leków, build na Androida.

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
- FR-002: Użytkownik może znaleźć lek w rejestrze, wpisując pierwsze litery; wyszukiwanie obejmuje nazwę produktu, nazwę powszechnie stosowaną i substancje czynne, z pierwszeństwem nazwy produktu. Podpowiedzi pokazują nazwę wraz z mocą i postacią. Priority: must-have
  > Socrates: Kontrargument „recepta często ma nazwę międzynarodową, nie handlową" — unieważniony przez dane: rekord rejestru niesie nazwę powszechnie stosowaną (np. „Paracetamolum") obok nazwy produktu. Rozstrzygnięcie: wymaganie rozszerzone o wyszukiwanie po kilku polach nazwy z ustaloną kolejnością.

### Apteczka

- FR-003: Użytkownik może dodać lek do apteczki, wskazując rekord z rejestru i opcjonalnie podając datę ważności oraz pozostałą ilość; jednostka i wielkość opakowania pochodzą z rekordu rejestru. Brak daty lub ilości aplikacja pokazuje wprost jako „nieznane”. Priority: must-have
  > Socrates: Rozważone kontrargumenty — ten sam lek bywa w kilku opakowaniach o różnych datach ważności; data bywa nieczytelna na opakowaniu; świeżo kupione opakowanie jest zawsze pełne, więc pole ilości wydłuża formularz. Rozstrzygnięcie: zostaje bez zmian. Obsługa daty ważności trafiła do pytań otwartych.
  > Socrates (rewizja 2026-09-24): data i ilość stały się opcjonalne — zamyka to pytanie otwarte o datę ważności. Kontrargument „brak daty to też informacja” — przyjęty: aplikacja pokazuje brak wprost jako „nieznane”, inaczej użytkownik uzna go za „ważny”.
- FR-005: Użytkownik może przeglądać apteczkę oraz zmieniać i usuwać jej pozycje, w tym edytować pozostałą ilość bezpośrednio na liście — ten sam ekran służy przeglądowi apteczki przed wizytą u lekarza. Priority: must-have
  > Socrates: Brak kontrargumentu wobec samego przeglądania i edycji. Po rundzie wchłonęło dawne FR-006 (osobny tryb przeglądu), bo przyjęty kontrargument brzmiał: to ten sam ekran, dwa ekrany robiłyby to samo.

### Import listy leków

- FR-007: Użytkownik może wgrać plik CSV albo wkleić jego zawartość. Priority: must-have
  > Socrates: Rozważone kontrargumenty — dwie drogi wejścia to podwójna robota, CSV z czatu bywa połamany, import to ścieżka używana raz w życiu konta. Rozstrzygnięcie: zostaje bez zmian — bez masowego wejścia próg wejścia zabija aplikację w pierwszym tygodniu.
- FR-008: Aplikacja pokazuje oczekiwany format CSV i gotowy prompt do użycia w zewnętrznym czacie AI. Priority: must-have
  > Socrates: Rozważone kontrargumenty — prompt zestarzeje się szybciej niż aplikacja, wystarczyłby sam opis kolumn, aplikacja firmuje jakość cudzego narzędzia. Rozstrzygnięcie: zostaje bez zmian — bez podanego formatu i promptu użytkownik nie wie, czego od czatu chcieć.
- FR-009: Użytkownik zatwierdza wynik importu, przypisując każdy wiersz do rekordu rejestru lub poprawiając przypisanie; niezatwierdzony import nie trafia do apteczki. Wiersz bez dopasowania jest pokazany na ekranie potwierdzenia — użytkownik musi go poprawić albo usunąć, zanim przejdzie dalej. Nic nie jest pomijane po cichu. Wiersz z lekiem, który już jest w apteczce, jest oznaczony „już masz” — użytkownik decyduje, czy dodać go jako osobne opakowanie, czy usunąć z importu. Priority: must-have
  > Socrates: Kontrargument „nie wiadomo, co z wierszem bez dopasowania" — przyjęty i rozstrzygnięty w treści wymagania: wiersz jest pokazany, użytkownik go poprawia albo usuwa przed przejściem dalej. Ten ekran jest granicą odpowiedzialności: to moment, w którym użytkownik potwierdza dane i przejmuje za nie odpowiedzialność. Dlatego błędny odczyt z zewnętrznego czatu nie obciąża aplikacji.
  > Socrates (rewizja 2026-09-24): dopisane oznaczenie „już masz” dla leku, który już jest w apteczce. Brak kontrargumentu — zostaje.

### Sprawdzenie leku

- FR-010: Użytkownik może wpisać nazwę jednego leku i sprawdzić go przeciwko zawartości apteczki. Priority: must-have
  > Socrates: Kontrargument „kilka nazw naraz to inny ekran" — przyjęty. Rozstrzygnięcie: wymaganie zawężone do jednego leku, tryb wielu nazw wydzielony jako FR-015 z priorytetem nice-to-have. Uzasadnienie autora z fazy 3: to pętla po tej samej logice, więc da się dołożyć bez przebudowy.
- FR-011: Aplikacja pokazuje dla sprawdzanej pozycji jeden z wyników: masz ten lek / masz lek z tą samą substancją czynną (w zakresie wynikającym z wybranego poziomu dopasowania) / nie masz, wraz ze szczegółem tego, co jest w domu — substancje czynne, moc, postać, pozostała ilość i data ważności. Te same pola są pokazane dla leku szukanego, żeby użytkownik mógł je porównać. Priority: must-have
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
- Dane rejestru, na których opiera się odpowiedź, nie są starsze niż 7 dni.
- Zawartość apteczki jest dostępna wyłącznie po zalogowaniu na konto domu i nie
  jest widoczna dla nikogo spoza tego konta.
- Aplikacja jest używalna na ekranie telefonu bez powiększania i bez poziomego
  przewijania; treść dłuższa niż ekran jest przewijana pionowo.
- Produkt działa w aktualnych wersjach Chrome, Edge, przeglądarek opartych
  na Chromium oraz Firefoksa.
- Produkt pozostaje używalny na telefonie do ośmiu lat starym. Próg 3 sekund nie
  obowiązuje na takim sprzęcie — wymagana jest używalność, nie czas odpowiedzi.

## Business Logic

Dla wskazanego leku aplikacja pokazuje wszystkie posiadane leki zawierające tę samą
substancję czynną i wyświetla przy nich substancje czynne, moc i postać, a decyzję
o zamianie podejmuje użytkownik, nie aplikacja.

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

Leki złożone, z kilkoma substancjami czynnymi, obsługuje wybierany przez użytkownika
poziom dopasowania — trzy stopnie, od najostrzejszego do najluźniejszego:

- **Precyzyjny** — dokładna zgodność zestawu substancji czynnych.
- **Zawiera wszystkie** — posiadany lek zawiera wszystkie substancje czynne
  szukanego leku, ewentualnie także dodatkowe.
- **Zawiera jeden** — posiadany lek zawiera przynajmniej jedną z substancji
  czynnych szukanego leku.

Poziom jest widoczny przy wyszukiwaniu i użytkownik zmienia go sam, zamiast
aplikacji zgadującej, jak bardzo chce być pobłażliwa. Dzięki temu reguła obsługuje
zarówno lek jednoskładnikowy, jak i złożony, bez dorabiania wyjątków. Który poziom
jest domyślny — patrz Open Questions.

## Access Control

Jedno konto na gospodarstwo domowe, dzielone przez domowników. Jedna fizyczna
apteczka odpowiada jednemu kontu — nie ma osobnych profili dla męża i żony, nie ma
zapraszania użytkowników ani współdzielenia apteczki między kontami.

Model płaski: każdy, kto zalogował się na konto domu, może dodać lek, zmienić stan,
usunąć pozycję i wyszukiwać zamienniki. Brak ról, brak podziału na podgląd i edycję.

Konkretna metoda logowania (hasło, link na e-mail, konto zewnętrzne) nie została
rozstrzygnięta — patrz Open Questions.

## Forward: tech-stack

Notatki dla kroku wyboru stacku (nie wchodzą do PRD):

- Docelowo aplikacja ma działać na Androidzie; UI od początku używane na telefonie
  w przeglądarce. Wybrany stack powinien zostawiać drogę na mobile (instalowalny
  pakiet lub wspólna warstwa logiki). Mobilnego builda nie budujemy w MVP.
- Dane leków: dzienny pełny zrzut RPL w XML/XLSX/CSV, importowany do własnej bazy.
  Brak oficjalnego REST API do wyszukiwania w locie. Rząd wielkości pliku: ~70 MB,
  co wyklucza trzymanie kopii rejestru po stronie przeglądarki.
- Docelowo również wersja desktopowa (web) obok mobilnej. Poza MVP, ale wybrane
  technologie mają ze sobą współpracować, żeby dołożenie desktopu nie oznaczało
  drugiej aplikacji.
- Przeglądarki: Chrome, Edge, przeglądarki oparte na Chromium, Firefox.
- Backend pozostaje po stronie serwera — wynika z rozmiaru rejestru.

## Forward: technical-roadmap

Notatki dla etapu implementacji (nie wchodzą do PRD):

- Które pola rekordu RPL tworzą indeks wyszukiwania — świadomie odłożone na etap
  implementacji, do rozstrzygnięcia na realnym pliku z rejestru. Kandydaci widoczni
  w rekordzie: `nazwaProduktu`, `nazwaPowszechnieStosowana`, `nazwaPoprzedniaProduktu`,
  `moc`, `nazwaPostaciFarmaceutycznej`, `podmiotOdpowiedzialny`, oraz substancje
  czynne, których może być kilka. Rekord niesie też link do ulotki.

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
  zawiera wyłącznie leki z rejestru.
- Koszyk do konsultacji — zapamiętanie sprawdzonych leków jako lista lub raport
  do pokazania farmaceucie, zamiast wyszukiwania każdego osobno przy okienku.
  Pomysł autora z rundy wyzwań; pokrywa się częściowo z FR-015.
- Tryb offline — aplikacja zakłada zasięg.
- Układ na duży ekran — MVP jest przeznaczone na przeglądarkę mobilną. Wersja
  desktopowa jest celem docelowym, ale nie wchodzi do MVP.
- Build na Androida.

## Quality cross-check

Sprawdzenie zamykające, przeprowadzone po fazie 6. Brak luk.

- Kontrola dostępu: obecna — jedno konto na dom, model płaski.
- Logika biznesowa: obecna — reguła zapisana jednym zdaniem oznajmującym.
- Artefakty projektu: obecne — ten plik z pełnym checkpointem.
- Budżet czasu: obecny — 3 tygodnie, mieści się w progu, brak twardego terminu.
- Lista wykluczeń: obecna — 14 pozycji z uzasadnieniami.

Do świadomego odnotowania, mimo braku luk: cztery pytania otwarte, żadne nie jest
blokujące. Wcześniejsze pytania o strukturę danych RPL i o leki złożone zostały
zdjęte z listy — pierwsze przeniesione na etap implementacji, drugie rozstrzygnięte
wybieranym poziomem dopasowania (FR-016). Pytanie o obsługę daty ważności zamknięte
2026-09-24 — data i ilość są opcjonalne (FR-003).

## Open Questions

1. **Jak działają istniejące aplikacje do apteczki i czy któraś oferuje wyszukiwanie
   zamiennika?** — konkurencja nie została sprawdzona. Owner: autor. Blokuje: nie.
2. **Jaką metodą loguje się użytkownik do konta domu?** — hasło, link na e-mail albo
   konto zewnętrzne; nierozstrzygnięte. Owner: autor. Blokuje: nie.
3. **Ile dni przed końcem ważności aplikacja ostrzega?** — okres do ustalenia.
   Owner: autor. Blokuje: nie.
4. **Który poziom dopasowania substancji czynnych jest domyślny?** — bezpiecznik
   „fałszywe wskazanie gorsze niż brak odpowiedzi" przemawia za startem od poziomu
   precyzyjnego i świadomym rozluźnianiem przez użytkownika. Ryzyko przeciwne:
   przy pierwszym użyciu aplikacja częściej odpowie „nie masz" i może wyjść
   na bezużyteczną. Owner: autor. Blokuje: nie.
