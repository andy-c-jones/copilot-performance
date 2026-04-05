# Copilot instructions for this repository

When making or validating code changes in this repository, run these npm commands as part of each validation check:

1. `npm run lint`
2. `npm run format:check`
3. `npm run coverage`

Do not mark work complete if these checks are failing.

Use Conventional Commits for all commit messages (for example: `feat: add PR language gate` or `fix: correct review line targeting`).

For this repository, always build and push updated action artifacts (`dist/`) when action code changes.

Prefer encapsulated behavior and keep methods/classes small. Refactor large methods or classes into focused units instead of growing monoliths.
