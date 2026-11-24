# Follow-ups from impl-review (phase 1)

- **F3 (Fix B)**: in the impl-review of phases 2 and 3, check that no file in `src/components/` or `src/lib/` (outside `src/lib/services/`) imports `password-check` or `password-blocklist`; the list is ~200 kB and belongs in the worker bundle only. Consider measuring the island bundle after phase 3.
- **F4**: the `password_common` message also covers a password equal to the e-mail address ("albo przypomina Twój adres e-mail"). The plan describes only popularity. Decision: keep one code; revisit a separate `password_is_email` code only if phase 2 or 3 needs to tell the cases apart.
- **F1**: `npm run roadmap:sync` still has to be run by the author from a real terminal (needs `gh` with the `project` scope) after the roadmap status flip to `in-progress`.
