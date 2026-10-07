# Palette: clinical teal (light)

Origin: palette A of three light clinical candidates (teal / hospital blue / pharmacy green), chosen by the user 2026-10-07.

Source of truth in code: `:root` in `src/styles/global.css`. Chart, sidebar, `--radius` and `.dark` are unchanged.

## Contrast targets

- Text pairs (foreground on background/card, role-foreground on its role colour): >= 4.5:1.
- `--input` (control border) and `--ring` (focus indicator) against `--card`: >= 3:1.

## Values

| Variable                 | Value                    | Role                        | Contrast target                        |
| ------------------------ | ------------------------ | --------------------------- | -------------------------------------- |
| `--background`           | `oklch(0.985 0.004 197)` | Page background             | with `--foreground` >= 4.5:1           |
| `--foreground`           | `oklch(0.21 0.02 230)`   | Body text                   | on background and card >= 4.5:1        |
| `--card`                 | `oklch(1 0 0)`           | Card / panel surface        | with `--card-foreground` >= 4.5:1      |
| `--card-foreground`      | `oklch(0.21 0.02 230)`   | Text on card                | on card >= 4.5:1                       |
| `--popover`              | `oklch(1 0 0)`           | Popover surface             | with `--popover-foreground` >= 4.5:1   |
| `--popover-foreground`   | `oklch(0.21 0.02 230)`   | Text on popover             | on popover >= 4.5:1                    |
| `--primary`              | `oklch(0.52 0.1 192)`    | Primary action              | with `--primary-foreground` >= 4.5:1   |
| `--primary-foreground`   | `oklch(0.99 0 0)`        | Text on primary             | on primary >= 4.5:1                    |
| `--secondary`            | `oklch(0.96 0.008 210)`  | Secondary surface           | with `--secondary-foreground` >= 4.5:1 |
| `--secondary-foreground` | `oklch(0.21 0.02 230)`   | Text on secondary           | on secondary >= 4.5:1                  |
| `--muted`                | `oklch(0.96 0.008 210)`  | Muted surface               | with `--muted-foreground` >= 4.5:1     |
| `--muted-foreground`     | `oklch(0.48 0.02 230)`   | Secondary text              | on background, card, muted >= 4.5:1    |
| `--accent`               | `oklch(0.94 0.035 192)`  | Hover / selected highlight  | with `--accent-foreground` >= 4.5:1    |
| `--accent-foreground`    | `oklch(0.3 0.06 200)`    | Text on accent              | on accent >= 4.5:1                     |
| `--destructive`          | `oklch(0.53 0.2 27)`     | Errors, destructive actions | text on card/background >= 4.5:1       |
| `--border`               | `oklch(0.9 0.01 210)`    | Decorative dividers         | none (decorative)                      |
| `--input`                | `oklch(0.68 0.02 220)`   | Control border              | against `--card` >= 3:1                |
| `--ring`                 | `oklch(0.52 0.1 192)`    | Focus indicator             | against `--card` >= 3:1                |

## Adjustments at the Phase 2 gate

None yet.
