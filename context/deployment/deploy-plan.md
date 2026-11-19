---
deployed_at: 2026-09-27
platform_decision: context/foundation/infrastructure.md
worker_url: https://mamlek.mig-app.workers.dev
cloudflare_account: konto autora
workers_dev_subdomain: mig-app
---

# Pierwsze wdrożenie produkcyjne

Pierwsze ręczne wdrożenie wygenerowanego szkieletu (logowanie przez Supabase +
chroniona strona startowa szkieletu, jeszcze bez funkcji produktu) na Cloudflare Workers,
zgodnie z decyzją o platformie w `context/foundation/infrastructure.md`. Strony
szkieletu już nie ma: chronione są dziś `/szukaj` i `/apteczka` (`PROTECTED_ROUTES`
w `src/middleware.ts`), a stan na 2026-11-16 opisuje README (sekcje CI i Deployment).

## Co zostało zrobione

1. Potwierdzone konto Cloudflare, przejście na plan Workers Paid.
2. `npx wrangler login` — uwierzytelnienie na koncie Cloudflare autora.
3. Nowy projekt Supabase w chmurze w regionie **Frankfurt (eu-central-1)**,
   potwierdzanie e-maila zostawione **włączone** (surowiej niż domyślnie w
   lokalnym stosie deweloperskim).
4. Sekrety Workera ustawione przez `wrangler secret put` (wartości wpisane w
   interaktywnym prompcie, nigdy nie wklejone do pliku ani czatu):
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (klucz nowego typu `sb_publishable_...`, nie dawny klucz anon JWT)
5. `npm run build`, potem `npx wrangler deploy`.
   - Adapter przy pierwszym wdrożeniu sam utworzył przestrzeń KV `SESSION`
     (`mamlek-session`) i powiązanie `IMAGES` — to rozwiązuje „nieznaną
     niewiadomą” z rejestru ryzyk w `infrastructure.md`; ręczne tworzenie
     przestrzeni nie jest potrzebne.
   - Pierwsze wdrożenie kończyło się błędem, dopóki konto nie miało
     zarejestrowanej subdomeny `workers.dev` (jednorazowa czynność tylko w
     panelu — `wrangler` nie ma do tego polecenia).
   - Przed dalszymi krokami domyślna subdomena `workers.dev` konta zmieniona na
     `mig-app` przez **Workers & Pages → Overview → Your subdomain → Change**.
6. Sprawdzone od początku do końca:
   - `GET /` → 200
   - `GET` chronionej strony szkieletu (bez logowania) → 302 na `/auth/signin`
   - Prawdziwa rejestracja → potwierdzenie e-maila → logowanie → wejście na
     chronioną stronę szkieletu, co dowodzi, że wdrożony Worker łączy się z projektem
     Supabase w chmurze.
   - `wrangler deployments list` pokazuje oba zapisane wdrożenia (cofnięcie
     możliwe przez `wrangler rollback <VERSION_ID>`).

## Sekrety (wartości nie są tu zapisane)

| Sekret         | Gdzie jest                           |
| -------------- | ------------------------------------ |
| `SUPABASE_URL` | Sekret Workera Cloudflare (`mamlek`) |
| `SUPABASE_KEY` | Sekret Workera Cloudflare (`mamlek`) |

## Dalszy krok: automatyczne wdrożenie po merge'u w CI

`ci.yml` ma teraz job `deploy` (uruchamiany przy każdym pushu do `main` po
przejściu joba `ci`; `smoke` działa tylko na PR, a kod trafia do `main` wyłącznie
przez PR, który go już przeszedł), który wykonuje `npm run build`, a potem
`cloudflare/wrangler-action@v4` z ograniczonym sekretem repozytorium
`CLOUDFLARE_API_TOKEN`. Ręczne `wrangler deploy` z lokalnej maszyny zostaje
jako wyjście awaryjne.

## Dalszy krok: aktualizacja wranglera

`wrangler` podbity z `4.131.1` do `4.142.0` (`package.json` + lockfile), żeby
odblokować Worker Previews. Po podbiciu lint, `astro check` i build przechodzą;
test smoke nie był powtórzony (lokalny Supabase/Docker nie był uruchomiony, a
zmiana nie dotyka kodu logowania, middleware ani Supabase).

## Świadomie pominięte w tym przebiegu

- Codzienny job GitHub Actions importujący rejestr (PRD FR-001) — wtedy nie
  było jeszcze kodu produktu. Dziś istnieje: `.github/workflows/registry-import.yml`
  (codziennie 04:17 UTC, opis w README, sekcja CI); keepalive harmonogramu
  wdrożony 2026-11-18 w wycinku S-16 (job `keepalive` w tym workflowie,
  ostrzeżenie przy dacie stanu po 7 dniach).
