# Skan historii pod sekrety przed upublicznieniem repo

Data: 2026-10-20. Gałąź: `chore/testing-quality-gates-wiring` (commit `5633ef8`, wszystkie refy).

## gitleaks

- Narzędzie: `zricethezav/gitleaks:v8.30.1` (najnowsze wydanie, 2026-03-21), obraz `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`.
- Polecenie: `docker run --rm -v <repo>:/repo:ro -v <scratchpad>:/out zricethezav/gitleaks:v8.30.1 git /repo --redact --report-format json --report-path /out/report.json -v` (domyślne reguły, bez `.gitleaksignore`).
- Zakres: 133 commity, ok. 2,26 MB. Historia ma 165 commitów, wszystkie refy; pozostałe 32 to merge'e PR bez rozwiązywania konfliktów, czyli bez własnego diffu (`git rev-list --all --no-merges --count` = 133).
- Wynik: **no leaks found**, zero trafień, nic do rozstrzygnięcia. `.gitleaksignore` niepotrzebny.

## Dane osobowe w drzewie `HEAD`

Polecenie: `git grep -nE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" HEAD` (bez `package-lock.json`, który nie ma trafień), do tego wzorzec polskiego numeru telefonu.

| Trafienie                                     | Miejsce                                         | Rozstrzygnięcie                         |
| --------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `you@example.com`                             | `SignInForm.tsx:53`, `SignUpForm.tsx:76`        | placeholder pola formularza, zostaje    |
| `admin@email.com`                             | `supabase/config.toml:106`, `:226`              | zakomentowany szablon Supabase, zostaje |
| `smoke-<czas>-b@example.com`                  | `scripts/smoke.mjs:75`                          | konto testowe smoke, zostaje            |
| `hooks@test.invalid`                          | `tests/hooks/agent-hooks.test.ts`               | autor commitów w repo testowym, zostaje |
| `36934071+michalg84@users.noreply.github.com` | `context/changes/testing-quality-gates-wiring/` | publiczny adres noreply autora, zostaje |

Numery telefonów: brak trafień.

## Poza zakresem skanu (decyzja autora 2026-10-20)

Prywatny adres gmail autora jest w metadanych 133 starszych commitów (autor/committer). Historii nie przepisujemy. Od tej zmiany commity mają adres noreply (`git config user.email`, repo-local).
