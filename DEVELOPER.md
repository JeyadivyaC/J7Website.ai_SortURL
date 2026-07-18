# Developer Guide

A tour of the codebase for anyone adding to it, plus the conventions worth
following so new code stays consistent with the rest. For environment
setup, see [`SETUP.md`](SETUP.md). For *why* the architecture looks the way
it does, see [`../../docs/architecture.md`](../../docs/architecture.md) -
this doc assumes that context and won't re-explain it.

## Scope reminder

This service does exactly one thing: create short codes, redirect, and
audit clicks. No SMS, campaigns, analytics, auth, or multi-tenancy - those
are later platform modules. If a change doesn't fit that scope, it probably
belongs in a different service.

## Layering

```
Controller  ->  Service  ->  Repository interface  ->  Prisma implementation
(HTTP/DTOs)     (business      (DI token,               (the only place
                 logic)         Prisma-agnostic)          Prisma-specific
                                                           error codes are
                                                           known)
```

- **Controllers** (`*.controller.ts`) only know about Zod-validated DTOs and
  call services. No business logic, no direct repository/Prisma access.
- **Services** (`*.service.ts`) hold business logic and depend only on
  repository *interfaces* (e.g. `ShortUrlRepository`, DI token
  `SHORT_URL_REPOSITORY` in `short-url.repository.ts`) - never on Prisma
  directly. This is what makes `ShortUrlService` fully unit-testable with a
  plain mock, zero Prisma involved.
- **Repositories** (`prisma-*.repository.ts`) are the only place
  Prisma-specific error codes (`P2002`, `P2025`, ...) are known; they
  translate them into domain errors (`ShortCodeCollisionError`,
  `ShortUrlNotFoundError`, `src/common/errors/`) before anything reaches the
  service layer.
- **`src/common/`** holds cross-cutting concerns: `ZodValidationPipe`
  (NestJS ships no first-party Zod integration), the global exception
  filter, domain error base classes, and `http/request-context.ts` (pulls
  IP/UA/referer/request-id off the raw Express request).
- **`src/infrastructure/`** isolates the Prisma client provider and Pino
  logger wiring - nothing outside this folder should construct a
  `PrismaClient` or configure `pino-http` directly.

When adding logic, ask which layer it belongs to before writing it. A common
mistake: putting DB-shape-aware logic in the service (breaks the
Prisma-agnostic contract) or putting business rules in the controller
(untestable without spinning up HTTP).

## Conventions worth knowing before you write code

- **Validation is Zod, not `class-validator`.** Define a schema
  (`dto/*.schema.ts`), infer the DTO type from it (`z.infer<...>`), and wire
  it up with `@UsePipes(new ZodValidationPipe(YourSchema))` on the
  controller method. See `create-short-url.schema.ts` for the pattern.
- **Domain errors, not raw Prisma errors, cross the repository boundary.**
  Add a new error class under `src/common/errors/` extending `AppError`,
  throw it from the repository, and add a branch in
  `GlobalExceptionFilter.mapException` (`src/common/filters/global-exception.filter.ts`)
  mapping it to an HTTP status. Never let a `Prisma.PrismaClientKnownRequestError`
  escape the repository layer.
- **Pure functions for anything that doesn't need DI.** `click-metadata.ts`
  (UA/bot parsing) and `common/http/request-context.ts` (request field
  extraction) are plain functions, not injectable services - they're
  trivially unit-tested without mocks and don't need NestJS's DI container
  involved. Reach for this pattern before reaching for a new `@Injectable()`.
- **Repository methods do one full operation, not a menu of primitives.**
  `recordClick` does the find + increment + audit-log-insert as a single
  transactional unit, rather than exposing separate `increment()`/`log()`
  methods a service would have to sequence itself - keeps the transaction
  boundary in the one place that understands it (see architecture doc,
  "Click tracking and the audit trail").
- **Every thrown-away detail in a Prisma-MongoDB migration needs a backfill
  note.** `@default(...)` in `schema.prisma` only applies to new `create()`
  calls - it does not retroactively appear on documents already in a
  MongoDB collection (unlike a SQL `ALTER TABLE ... DEFAULT`). If you add a
  new required-with-default field, document the one-time `mongosh` backfill
  needed for existing environments (see the `status` field's note in
  `docs/architecture.md`).

## Adding a new endpoint - the shape to follow

1. **Schema + DTO**: `dto/your-thing.schema.ts` (Zod schema) and
   `dto/your-thing.dto.ts` (`z.infer` type export).
2. **Repository interface method**: add to `short-url.repository.ts` (or a
   new repository interface, if it's a different aggregate) with a doc
   comment on what it throws.
3. **Prisma implementation**: implement it in `prisma-short-url.repository.ts`,
   translating any Prisma error codes you care about into domain errors.
4. **Service method**: business logic, calling only the repository
   interface.
5. **Controller route**: HTTP wiring, `ZodValidationPipe` for the request
   body/params, delegates to the service.
6. **Tests**: one spec per unit, mirroring the `src/` path under
   `tests/unit/` (see below).
7. **Docs**: update `openapi.yaml` (new path/schema/example) and, if the
   change is architecturally non-obvious, `docs/architecture.md`.

## Testing

- `tests/unit/` mirrors `src/` 1:1 - one spec file per unit. Look at the
  existing spec next to the file you're changing for the expected shape
  before writing a new one.
- Everything is mocked - **no live database or AWS access is needed to run
  the suite.** Repository tests mock the Prisma client (see
  `createPrismaMock` in `prisma-short-url.repository.spec.ts` for the
  pattern, including how the `$transaction` mock just invokes the callback
  with the same mocked collections). Service tests mock the repository
  interface (`createRepository` in `short-url.service.spec.ts`).
- Run: `npm test` (or `npm run test:watch`). Also run `npm run typecheck`
  and `npm run lint` before committing - both are part of CI and will fail
  the build otherwise.
- If a diagnostics tool flags `Cannot find namespace 'jest'` or similar in
  a spec file, that's a stale IDE-level checker using a different tsconfig
  than the project's real one - trust `npm run typecheck`/`npm test`
  instead, not that diagnostic.

## Verifying a change end-to-end (not just tests passing)

Tests verify units in isolation; they don't prove the app actually boots or
that a redirect actually redirects. Before considering a change done:

```bash
npm run start:dev
curl http://localhost:<port>/health
curl -X POST http://localhost:<port>/short-url -H 'Content-Type: application/json' -d '{"destination":"..."}'
curl -i http://localhost:<port>/r/<code>
```

If the change touches the deployed Lambda's behavior (env vars, IAM,
template.yaml, Prisma schema), a local-only check isn't enough - deploy to
`dev` and repeat the same curls against the real `ApiBaseUrl`, and check
CloudWatch Logs (`/aws/lambda/j7website-short-url-dev`) for the actual
`GlobalExceptionFilter`-logged stack trace if anything 500s. The client
response body is deliberately sanitized (`{"error": "InternalError",
"message": "An unexpected error occurred"}}`) - the real exception only ever
reaches the logs, never the HTTP response.

## API documentation

`openapi.yaml` is the source of truth for the API surface - keep it in sync
with controller changes. It's usable three ways: import into Postman,
serve as interactive Swagger UI (`npx serve .` then open
`/swagger-ui.html`), or build a static reference doc
(`npx @redocly/cli build-docs openapi.yaml` -> `redoc-static.html`, gitignored,
regenerate on demand rather than committing it).

## Keeping docs in sync

`docs/architecture.md` explains *why* non-obvious decisions were made;
`README.md`/`SETUP.md` explain *what to run*; this file explains *how to
work in the codebase*. When a change has a non-obvious rationale (a
trade-off, a workaround for a specific bug, a constraint from the deploy
environment), add a note to `docs/architecture.md` rather than leaving it
only in a commit message - commit history isn't the first place the next
person will look.
