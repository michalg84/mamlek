---
starter_id: 10x-astro-starter
package_manager: npm
project_name: mamlek
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---

## Why this stack

MamLek to mobilna aplikacja webowa dla jednego gospodarstwa domowego, budowana solo po godzinach w 3 tygodnie przy małej skali, dlatego wybór padł na polecany starter dla aplikacji webowej w TypeScripcie: Astro, React, Supabase i Cloudflare. Przechodzi on wszystkie cztery kryteria przyjazności dla agenta AI i od razu daje Postgresa oraz logowanie na konto domu (FR-013). Autor jest doświadczonym programistą backendu w Javie; rozważał Spring Boot i świadomie wybrał TypeScript mimo słabszej bazy w tym języku, więc kod generowany przez agenta wymaga uważniejszego przeglądu. Jedyna funkcja, której starter nie zapewnia od razu, to zadanie w tle: okresowe odświeżanie pełnego Rejestru Produktów Leczniczych (około 70 MB, FR-001, dane nie starsze niż 7 dni) nie mieści się w limitach pamięci i czasu procesora Cloudflare, więc trafia do codziennego zadania cyklicznego w GitHub Actions, które wgrywa rejestr do tabeli tymczasowej i podmienia ją w jednej transakcji. Aplikacja jest wdrażana na Cloudflare Workers (Worker z zasobami statycznymi — `@astrojs/cloudflare` od wersji 13 nie obsługuje Pages), a CI w GitHub Actions wdraża ją automatycznie po merge'u do main. Logika wyszukiwania i porównywania substancji czynnych powinna żyć w warstwie serwisów i endpointach API, a nie w kodzie renderującym strony, żeby po MVP zostawić otwartą drogę na Androida.
