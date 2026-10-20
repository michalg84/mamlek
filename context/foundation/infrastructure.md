---
project: mamlek
researched_at: 2026-09-27
recommended_platform: Cloudflare Workers (static assets)
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (SSR, output "server") + React 19
  runtime: Cloudflare workerd (@astrojs/cloudflare 14, wrangler 4)
---

## Recommendation

**Deploy on Cloudflare Workers (z zasobami statycznymi), plan Workers Paid.**

Cloudflare jako jedyna platforma dostała Pass we wszystkich pięciu kryteriach (10/10), a repozytorium już jest skonfigurowane pod Workers (`wrangler.jsonc` z `main` i `assets`), więc wdrożenie nie wymaga zmiany adaptera ani przebudowy. Przy jednym gospodarstwie domowym, jednym regionie i braku stałych połączeń koszt to stałe ok. 5 USD miesięcznie. Preferencja współlokowania usług nie jest spełniona (Supabase i GitHub Actions to osobni dostawcy) — to świadomie przyjęty koszt, opisany w rejestrze ryzyk.

Uwaga do `tech-stack.md`: dokument mówi o Cloudflare Pages, ale `@astrojs/cloudflare` od wersji 13 (marzec 2026) wdraża wyłącznie na Workers, a Pages jest w trybie utrzymania („Start new projects with Workers”). Celem wdrożenia jest Worker, nie projekt Pages.

## Platform Comparison

Kontekst wywiadu: brak stałych połączeń (żaden filtr twardy nie odpadł), koszt i wygoda pracy mniej więcej równorzędne, brak doświadczenia z jakąkolwiek platformą (pierwsze publiczne wdrożenie), jeden region, preferowane współlokowanie usług. Astro 7 działa na każdej platformie, ale każda poza Cloudflare wymaga wymiany adaptera — to koszt uwzględniony w ocenie, nie wykluczenie.

| Platform   | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
| ---------- | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ----- |
| Cloudflare | Pass      | Pass               | Pass                | Pass              | Pass              | 10    |
| Railway    | Pass      | Partial            | Pass                | Pass              | Pass              | 9     |
| Netlify    | Partial   | Pass               | Pass                | Pass              | Pass              | 9     |
| Render     | Partial   | Partial            | Pass                | Pass              | Pass              | 8     |
| Vercel     | Pass      | Partial            | Pass                | Pass              | Partial           | 8     |
| Fly.io     | Pass      | Partial            | Pass                | Pass              | Partial           | 8     |

(Pass = 2, Partial = 1, Fail = 0. Stan funkcji sprawdzony 2026-09-27.)

- **Cloudflare** — `wrangler` obsługuje wdrożenie, wersje, rollback (do 100 ostatnich wersji), `tail` i sekrety, wszystko GA. Dokumentacja jako `llms.txt` na produkt i markdown każdej strony. Oficjalne serwery MCP (docs, bindings, builds, observability), `cloudflare/wrangler-action@v4`, Workers Builds (GA), Worker Previews (GA od 2026-09-22, wymaga wrangler ≥ 4.135). Plan Free ma limit 10 ms CPU na żądanie — za mało na renderowanie SSR z Reactem, stąd plan Paid (5 USD, 10 mln żądań i 30 mln ms CPU w cenie). Limit rozmiaru paczki 3/10 MB zniesiony 2026-09-04. Smart Placement jest w **beta**.
- **Railway** — `railway up/logs/variable/redeploy`, ale rollback tylko w panelu lub przez GraphQL (obraz trzymany 72 h na Hobby). Serwis cron (GA) udźwignie import 70 MB, Postgres jako szablon kontenera z PITR. Region EU: Amsterdam, na każdym planie. Hobby 5 USD z 5 USD zużycia w cenie. Tryb uśpienia daje zimny start z możliwym 502. Config as Code **wycofywany** (twarde odcięcie 2026-12-01), zastępstwo IaC GA. Incydent 2026-05-19/20: ok. 8 h niedostępności we wszystkich regionach. Środowiska PR „focused” w **beta**.
- **Netlify** — `netlify deploy --prod`, `logs`, `env:set`; rollback tylko przez `netlify api` albo panel. `llms.txt` i markdown stron. Oficjalny MCP (bez oznaczenia beta). Background Functions (15 min, GA) udźwigną import. Funkcje domyślnie w Ohio — region EU wymaga planu Pro (20 USD, **region-limited**). Plan Free ma twardy limit kredytów, po którym witryna jest wstrzymywana.
- **Render** — CLI solidne, ale bez rollbacku; deploy hook tylko z panelu. Darmowa usługa usypia się po 15 min i wstaje ok. 1 min — sprzeczne z progiem 3 s, więc minimum Starter 7 USD. Cron Jobs GA (do 12 h). Frankfurt dostępny, ale regionu nie da się zmienić po utworzeniu. Pełne środowiska podglądu na PR wymagają planu Pro.
- **Vercel** — CLI kompletne (w tym `rollback`, `promote`). Hobby tylko do użytku niekomercyjnego, rollback na Hobby tylko do poprzedniego wdrożenia. Domyślny region `iad1` — trzeba ręcznie ustawić `fra1`. Vercel Postgres/KV wygaszone (przeniesione do Neon/Upstash). MCP w **beta**, WebSockety w **public beta**.
- **Fly.io** — `flyctl` pokrywa cały cykl, ale trzeba utrzymywać Dockerfile i `fly.toml`; rollback przez ponowne wdrożenie starego obrazu. Brak darmowego planu. Region Warszawa **wycofany** (konsolidacja 2025-09), zostają fra/ams. `fly mcp` jest **experimental** i bez wdrażania. Zaplanowane maszyny startują o „rozmytej” godzinie.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Najwyższy wynik we wszystkich kryteriach i zero migracji: repozytorium już buduje Workera, a `astro dev` od adaptera 13 uruchamia prawdziwy workerd. Pełna pętla operacyjna (wdrożenie, rollback, logi, sekrety) z jednego CLI, więc agent może ją przejść bez panelu. Region nie wymaga konfiguracji — Worker działa w punkcie najbliższym użytkownikowi.

#### 2. Railway

Najlepiej spełnia preferencję współlokowania: aplikacja, opcjonalny Postgres i serwis cron dla importu rejestru na jednej platformie, w regionie EU dostępnym na każdym planie, za stałe 5 USD. Przegrywa wymianą adaptera na `@astrojs/node`, rollbackiem tylko z panelu lub API, trwającą migracją konfiguracji (odcięcie 2026-12-01) i świeżym incydentem obejmującym wszystkie regiony.

#### 3. Netlify

Mocna dokumentacja, oficjalny MCP i Background Functions, które udźwigną import bez GitHub Actions. Przegrywa tym, że funkcje w regionie EU wymagają planu Pro (20 USD), a na planie Free każde zapytanie do Supabase w EU przechodzi przez Atlantyk; do tego twardy limit kredytów wstrzymuje witrynę i rollback nie ma polecenia CLI.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Plan Free prawdopodobnie zepsuje strony SSR: limit 10 ms CPU na żądanie jest często przekraczany przy renderowaniu Reacta, a błąd 1102 wygląda jak losowy błąd aplikacji. Plan Paid (5 USD) jest faktycznym minimum.
2. Współlokowanie nie jest spełnione: trzej dostawcy (Cloudflare — aplikacja, Supabase — baza i logowanie, GitHub Actions — import rejestru), trzy panele, trzy miejsca na sekrety. Nieudany import w Actions nie jest nigdzie widoczny w aplikacji.
3. Rollback cofa tylko kod: `wrangler rollback` przywraca wersję Workera, ale nie cofa migracji Supabase. Migracja niezgodna ze starym kodem nie cofa się jednym poleceniem.
4. Dokumentacja projektu opisuje inny produkt: `tech-stack.md` i README mówią o Pages, a wdrożenie to Worker. Poradniki dla Pages (`wrangler pages deploy`, Pages Functions) dadzą złe polecenia.
5. Umieszczenie Workera blisko bazy (Smart Placement) jest w beta. Worker działa blisko użytkownika (Warszawa), a Supabase tam, gdzie założono projekt; jeśli poza EU, każda strona robi kilka zapytań przez Atlantyk.

### Pre-Mortem — How This Could Fail

MamLek trafił na plan Free Cloudflare, bo „to jedno gospodarstwo”. W testach strony działały, ale na produkcji ekran sprawdzenia leku co jakiś czas zwracał błąd 1102 — renderowanie razem z logiką dopasowania substancji przekraczało 10 ms CPU. Autor przez dwa wieczory szukał błędu we własnym kodzie. Przejście na plan Paid rozwiązało problem, ale zaufanie domowników ucierpiało. Równolegle projekt Supabase został założony w domyślnym regionie w USA, więc każde sprawdzenie robiło cztery kolejne zapytania przez Atlantyk i obietnica „odpowiedź w 3 sekundy” działała tylko na Wi-Fi. Gorszy problem był cichy: dzienny import rejestru chodził w GitHub Actions i po zmianie repozytorium na publiczne oraz dwóch miesiącach wakacji bez commitów GitHub wyłączył zaplanowany workflow. Rejestr się zestarzał, a aplikacja nigdzie nie pokazywała daty ostatniej aktualizacji. Nikt tego nie zauważył, dopóki nowo zarejestrowanego leku nie dało się znaleźć przy okienku w aptece. Po sześciu miesiącach sama platforma działała poprawnie — zawiodło wszystko wokół niej, czego nikt nie pilnował.

### Unknown Unknowns

- GitHub wyłącza zaplanowane workflowy w **publicznych** repozytoriach po 60 dniach bez aktywności, a uruchomienia z harmonogramu bywają opóźniane lub pomijane przy obciążeniu. Repozytorium jest dziś prywatne (limit 2000 darmowych minut Actions miesięcznie), ale upublicznienie go uruchamia to ryzyko. Dotyczy wprost wymagania „dane rejestru nie starsze niż 7 dni”. **Decyzja 2026-10-20:** repo jest publiczne od 2026-10-20 — Faza 4 wdrażania testów (`testing-quality-gates-wiring`), ryzyko przyjęte. Sygnał: data `Stan rejestru na …` na `/szukaj`; ponowne włączenie harmonogramu: Actions → Registry import → Enable workflow.
- Polecenia Pages i Workers nie są wymienne: adapter Astro porzucił Pages w wersji 13, właściwe polecenia to `wrangler deploy` i `wrangler rollback`, nie `wrangler pages deploy`.
- Adres podglądu dla każdego PR (Worker Previews) wymaga wrangler ≥ 4.135, a repozytorium ma 4.131.
- Logi Workers na planie Free są trzymane 3 dni — incydent z weekendu może zniknąć do wtorku.
- Adapter oczekuje namespace'u KV o nazwie `SESSION` dla sesji Astro — sprawdzić, co pierwsze wdrożenie utworzy lub o co poprosi.

## Operational Story

- **Preview deploys**: Worker Previews (GA od 2026-09-22) dają osobny adres dla gałęzi lub PR po podniesieniu wrangler do ≥ 4.135; alternatywnie `wrangler versions upload` tworzy wersję z adresem podglądu bez przełączania ruchu produkcyjnego. Podglądy są publiczne — dane testowe, nie produkcyjne, albo ochrona przez Cloudflare Access.
- **Secrets**: `SUPABASE_URL` i `SUPABASE_KEY` jako sekrety Workera (`npx wrangler secret put SUPABASE_URL`), lokalnie w `.dev.vars` (w `.gitignore`). Token API Cloudflare i sekrety Supabase dla CI w GitHub Secrets. Rotacja: nowy klucz w Supabase → `wrangler secret put` → wdrożenie → unieważnienie starego klucza.
- **Rollback**: `npx wrangler deployments list` → `npx wrangler rollback <VERSION_ID>`; przełączenie w kilka sekund. Nie cofa migracji Supabase ani danych — migracje muszą być zgodne wstecz o jedną wersję kodu.
- **Approval**: człowiek zatwierdza wdrożenie produkcyjne (merge do `main` albo ręczne `wrangler deploy`), zakup planu Paid, rotację sekretów, migracje zmieniające lub usuwające dane w Supabase oraz każde usunięcie zasobu. Agent bez nadzoru może: budować, wgrywać wersje podglądowe (`wrangler versions upload`), czytać logi i listę wdrożeń.
- **Logs**: `npx wrangler tail --format pretty --status error` (na żywo), `npx wrangler deployments list` i `npx wrangler deployments status`; Workers Logs w panelu (3 dni na Free); serwer MCP Cloudflare observability do zapytań strukturalnych. Import rejestru: `gh run list --workflow <import>` i `gh run view --log-failed`.

## Risk Register

| Risk                                                                                 | Source           | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Błąd 1102 (limit 10 ms CPU) na planie Free przy renderowaniu SSR                     | Devil's advocate | H          | H      | Plan Workers Paid (5 USD) przed pierwszym produkcyjnym wdrożeniem; po wdrożeniu `wrangler tail --status error` pod kątem 1102.                                                                                                                                                                           |
| Projekt Supabase poza EU — zapytania przez Atlantyk łamią próg 3 s                   | Pre-mortem       | M          | H      | Utworzyć projekt Supabase w regionie Frankfurt (eu-central-1); zmierzyć czas sprawdzenia leku na telefonie po pierwszym wdrożeniu.                                                                                                                                                                       |
| Import rejestru przestaje działać po cichu (wyłączony harmonogram, opóźnienia, błąd) | Unknown unknowns | M          | H      | Data ostatniego importu widoczna w aplikacji; powiadomienie o nieudanym przebiegu workflow; `workflow_dispatch` do ręcznego uruchomienia; nie upubliczniać repo bez zmiany tego planu (zmienione decyzją 2026-10-20, zob. Unknown Unknowns: repo publiczne od Fazy 4 wdrażania testów, ryzyko przyjęte). |
| Rollback kodu przy niecofniętej migracji bazy                                        | Devil's advocate | M          | M      | Migracje wyłącznie addytywne i zgodne wstecz o jedną wersję; usuwanie kolumn w osobnym, późniejszym wydaniu.                                                                                                                                                                                             |
| Polecenia dla Pages zamiast Workers z nieaktualnej dokumentacji                      | Devil's advocate | M          | M      | Poprawić `tech-stack.md` i README na „Cloudflare Workers”; w planie wdrożenia tylko `wrangler deploy` / `wrangler rollback`.                                                                                                                                                                             |
| Trzech dostawców, trzy zestawy sekretów — rozjazd konfiguracji                       | Devil's advocate | M          | M      | Jedna lista sekretów w README (gdzie leży każdy); rotacja według Operational Story.                                                                                                                                                                                                                      |
| Smart Placement w beta — Worker daleko od bazy                                       | Research finding | L          | M      | Nie włączać w MVP; przy Supabase we Frankfurcie i użytkowniku w Polsce opóźnienie jest małe. Wrócić do tematu, jeśli pomiar przekroczy próg.                                                                                                                                                             |
| Worker Previews niedostępne na wrangler 4.131                                        | Unknown unknowns | H          | L      | Podnieść wrangler do ≥ 4.135 przed konfiguracją podglądów na PR.                                                                                                                                                                                                                                         |
| Krótka retencja logów (3 dni)                                                        | Unknown unknowns | M          | L      | Przy incydencie od razu zapisać wynik `wrangler tail`; rozważyć dłuższą retencję dopiero po MVP.                                                                                                                                                                                                         |
| Brak namespace'u KV `SESSION` przy pierwszym wdrożeniu                               | Unknown unknowns | L          | L      | Sprawdzić wynik pierwszego `wrangler deploy`; utworzyć namespace, jeśli adapter go wymaga.                                                                                                                                                                                                               |

## Getting Started

Zweryfikowane dla wersji z repozytorium: `@astrojs/cloudflare` 14.x (tylko Workers, bez Pages), `wrangler` 4.131, konfiguracja w `wrangler.jsonc`.

1. Załóż konto Cloudflare i wykup Workers Paid (5 USD/mies.) w panelu — to jedyny krok wymagający przeglądarki. Zaloguj CLI: `npx wrangler login`, sprawdź: `npx wrangler whoami`.
2. Utwórz projekt Supabase w regionie Frankfurt i ustaw sekrety Workera: `npx wrangler secret put SUPABASE_URL` oraz `npx wrangler secret put SUPABASE_KEY`.
3. Zbuduj i wdroż: `npm run build`, potem `npx wrangler deploy` (nie `wrangler pages deploy`). Sprawdź adres `*.workers.dev` z wyniku polecenia i przejdź ręcznie przepływ logowania.
4. Obserwuj błędy: `npx wrangler tail --format pretty --status error`; w razie problemu `npx wrangler deployments list` i `npx wrangler rollback <VERSION_ID>`.
5. Przed podglądami na PR podnieś wrangler: `npm install -D wrangler@latest` (≥ 4.135), a automatyczne wdrożenie po merge'u do `main` zaplanuj w trybie planowania jako osobny krok.

## Out of Scope

Tego nie oceniano w tym badaniu:

- konfiguracja obrazu Dockera
- konfiguracja potoku CI/CD
- architektura w skali produkcyjnej (wiele regionów, HA, DR)
