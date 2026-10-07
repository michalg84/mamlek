# `/szukaj` state matrix

Screenshots: `.ui-shots/phase4/<state>-<width>.png` at 1280 and 390 px (local, gitignored; regenerate with `npm run ui:shots -- --label phase4`).

| State         | What the user sees                                                                                 | Screenshots                                                        | Tokens                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| default       | Light page, white card, empty field with the "Wpisz co najmniej…" hint, Topbar above               | `default-1280`, `default-390`                                      | `background`, `card`, `foreground`, `muted-foreground`, `input` |
| hover         | Hovered suggestion row gets the teal tint; Topbar links underline on hover                         | `hover-option-1280`, `hover-option-390`                            | `accent`, `accent-foreground`                                   |
| focus-visible | Teal focus ring on the field (Tab) and on the first Topbar link; the active suggestion is tinted   | `focus-input-*`, `focus-topbar-*`, `suggestions-*` (1280 and 390)  | `ring`, `accent`, `accent-foreground`                           |
| disabled      | N/A: the field stays usable while the list loads (S-09 "typing during loading")                    | N/A                                                                | N/A                                                             |
| error         | Red `CircleAlert` icon + medium-weight text "Nie udało się wczytać listy leków…" with retry button | `error-1280`, `error-390`, `unauthorized-1280`, `unauthorized-390` | `destructive`, `border`, `background` (outline button)          |
| empty         | Too-short hint (`hint-short`), "Brak leku o takiej nazwie" (`no-match`), server "not loaded" muted | `hint-short-*`, `no-match-*` (1280 and 390); server message manual | `muted-foreground`                                              |
| loading       | Spinning `LoaderCircle` before "Wczytywanie listy leków…"; the field is usable                     | `loading-1280`, `loading-390`                                      | `muted-foreground`                                              |

Also captured: `result-*` (result card: `card`, `foreground`, `muted-foreground`, `border`).

The server-rendered page states ("Rejestr leków nie jest jeszcze wczytany", muted; "Nie udało się wczytać rejestru leków…", destructive with icon) cannot be forced from the browser and are checked by hand.
