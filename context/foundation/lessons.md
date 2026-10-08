# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Create a PR after pushing a feature branch

- **Context**: any change finished on a feature branch
- **Problem**: the review fixes were pushed to docs/search-performance-phase4 but no PR was opened until you asked. We had to wait longer for Prod tests.
- **Rule**: Remember to create a PR after push on feature branches.
- **Applies to**: all

## Flag manual tests and let the user decide which they run

- **Context**: any plan phase with a Manual Verification step (`/10x-implement` gates, `/10x-impl-review`)
- **Problem**: manual checks get run or ticked by the agent without the user having chosen to delegate them, or the request to test is buried in a long report, so the user can't tell which tests are theirs.
- **Rule**: Always say explicitly when I'm asking the user to run a manual test, and offer to run it myself; the user decides which manual tests they do and which I do. Never run or tick a manual check until they've said so.
- **Applies to**: implement, impl-review
