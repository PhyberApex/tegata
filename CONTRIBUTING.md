# Contributing to Tegata

Bug reports, ideas and pull requests are welcome.

## Getting started

- Open an issue for bugs, ideas or questions.
- Fork, branch, and submit a pull request.
- `pnpm install`, then `pnpm dev` runs the backend, the frontend with HMR and a watch
  on the shared package. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` are
  what CI runs, plus `pnpm boot-check` against the built backend and a `docker build`.
- The domain vocabulary — Authelia Users Database, Enabled-Count Guard, Out-of-Band Edit,
  Break-Glass Fence and the rest — is defined in `backend/CONTEXT.md` and
  `frontend/CONTEXT.md`. Use those words in code, comments and issues; add a term there
  when you introduce a concept.
- Decisions that are not obvious from the code have a record under `docs/adr/`. A change
  that reverses one gets a new record rather than an edit to the old one.

## Guidelines

- Tegata is the sole writer of `users_database.yml` and must never write Authelia's main
  configuration. Every write to the users database goes through `UsersService` and its
  atomic swap, and every write path that can lock an admin out goes through the
  Enabled-Count Guard.
- A wire shape both sides read lives in `shared/`; a type only one side reads stays in its
  module.
- Prefer self-documenting code; a comment explains why, never what, and never describes a
  change or a history.
- Run the checks before submitting a PR; CI runs them on every pull request.
- **We use [release-please](https://github.com/googleapis/release-please).** Write
  [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …)
  so versions and the changelog derive from the history. A `fix:` or `feat:` publishes a new
  image; a `chore:` or `docs:` does not.

## AI policy

AI coding tools are used in this project, steered by the maintainer, and nothing is merged
without a human having reviewed it. Contributions written with such tools are welcome under
the same rule: you are responsible for what you submit, so understand it and make sure it
works.
