---
deployed_at: 2026-09-27
platform_decision: context/foundation/infrastructure.md
worker_url: https://mamlek.mig-app.workers.dev
cloudflare_account: konto autora
workers_dev_subdomain: mig-app
---

# Pierwsze wdrożenie produkcyjne

Pierwsze ręczne wdrożenie wygenerowanego szkieletu (logowanie przez Supabase +
chroniony `/dashboard`, jeszcze bez funkcji produktu) na Cloudflare Workers,
zgodnie z decyzją o platformie w `context/foundation/infrastructure.md`.

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
   - `GET /dashboard` (bez logowania) → 302 na `/auth/signin`
   - Prawdziwa rejestracja → potwierdzenie e-maila → logowanie → wejście na
     `/dashboard`, co dowodzi, że wdrożony Worker łączy się z projektem
     Supabase w chmurze.
   - `wrangler deployments list` pokazuje oba zapisane wdrożenia (cofnięcie
     możliwe przez `wrangler rollback <VERSION_ID>`).

## Sekrety (wartości nie są tu zapisane)

| Sekret         | Gdzie jest                           |
| -------------- | ------------------------------------ |
| `SUPABASE_URL` | Sekret Workera Cloudflare (`mamlek`) |
| `SUPABASE_KEY` | Sekret Workera Cloudflare (`mamlek`) |

## Dalszy krok: automatyczne wdrożenie po merge'u w CI

`ci.yml` ma teraz job `deploy` (uruchamiany po przejściu `ci` i `smoke`, przy
każdym pushu do `main`), który wykonuje `npm run build`, a potem
`cloudflare/wrangler-action@v4` z ograniczonym sekretem repozytorium
`CLOUDFLARE_API_TOKEN`. Ręczne `wrangler deploy` z lokalnej maszyny zostaje
jako wyjście awaryjne.

## Dalszy krok: aktualizacja wranglera

`wrangler` podbity z `4.131.1` do `4.142.0` (`package.json` + lockfile), żeby
odblokować Worker Previews. Po podbiciu lint, `astro check` i build przechodzą;
test smoke nie był powtórzony (lokalny Supabase/Docker nie był uruchomiony, a
zmiana nie dotyka kodu logowania, middleware ani Supabase).

## Świadomie pominięte w tym przebiegu

- Codzienny job GitHub Actions importujący rejestr (PRD FR-001) — nie ma
  jeszcze dla niego kodu produktu.
