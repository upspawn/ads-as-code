# Contributing

## Prerequisites

- [Bun](https://bun.sh) >= 1.0

## Setup

```bash
git clone https://github.com/upspawn/ads-as-code.git
cd ads-as-code
bun install
bun test
```

## Development Workflow

1. **Write tests first.** Every module in `src/` has a corresponding test file in `test/unit/`. Add tests before writing implementation code.
2. **Run tests:** `bun test`
3. **Run typecheck:** `bunx tsc --noEmit` (strict mode is on — no implicit any, no unchecked indexed access).
4. **Run the CLI locally:** `bun cli/index.ts <command>` (e.g., `bun cli/index.ts plan`).

## Testing

**Unit tests** (`test/unit/`): Cover the core engine (diff, flatten, cache, codegen, discovery) and provider modules (fetch, apply, builder). Run with `bun test`.

**Integration tests** (`test/integration/`): Hit the real Google Ads API. Require credentials in `~/.ads/credentials.json`. Not run in CI.

**Fixtures** (`test/fixtures/`):
- `campaigns/` — campaign definition files for discovery tests
- `api-responses/` — mock Google Ads API responses for fetch tests

**Patterns:**
- Mock `GoogleAdsClient` by passing a plain object with `query` and `mutate` functions.
- Use `:memory:` for SQLite cache in tests: `new Cache(':memory:')`.
- Codegen tests use Bun's snapshot testing (`expect(output).toMatchSnapshot()`).

## Code Style

- **TypeScript strict mode.** `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noImplicitOverride` are all enabled.
- **No classes** (except `Cache` which wraps bun:sqlite and `AdsEnrichedError`). Prefer plain objects + functions. The campaign builder is a plain object with methods defined via `Object.defineProperty`, not a class.
- **Branded types** for validated strings: `Headline` (max 30 chars), `Description` (max 90 chars), `CalloutText` (max 25 chars). Helper functions validate on construction.
- **Readonly types.** All exported types use `readonly` properties.
- **Imports use `.ts` extensions.** Bun resolves them directly — no build step.
- **No default exports** in library code (except campaign files, which use default exports by convention for discovery).

## Project Structure

```
src/core/       Provider-agnostic: types, diff, flatten, cache, codegen, discovery, config, errors
src/google/     Google Ads: api client, fetch (API → Resources), apply (Changeset → mutations), builder
src/helpers/    SDK DSL functions: keywords, budget, targeting, ads, extensions, negatives, url
cli/            CLI commands: init, auth, plan, apply, import, pull, status, validate, history, doctor, cache
test/unit/      Unit tests (one per module)
test/fixtures/  Campaign files and mock API responses
test/integration/ API integration tests (need credentials)
example/        Working example project with real campaign definitions
```

## PR Process

1. Fork the repo and create a feature branch.
2. Write tests. Run `bun test` and `bunx tsc --noEmit`.
3. Keep commits focused — one logical change per commit.
4. Open a PR against `main`.
