# J7Website Short URL Service

Phase 1 module of the J7Website platform: a standalone, production-ready
serverless Short URL service. Creates short codes, stores mappings in an
external MongoDB deployment, and redirects visitors to the original
destination. This is the **only** scope of this service - no SMS,
campaigns, analytics, auth, or multi-tenancy live here; those are later
platform modules.

For the full rationale behind every non-obvious architectural choice below,
see [`../../docs/architecture.md`](../../docs/architecture.md). To actually
get running - local dev or a fresh AWS deployment, including the gotchas
hit along the way - see [`SETUP.md`](SETUP.md). To contribute code, see
[`DEVELOPER.md`](DEVELOPER.md). To promote to staging/prod, see
[`PROMOTION.md`](PROMOTION.md).

## Tech stack

| Concern        | Choice                                                    |
| -------------- | ---------------------------------------------------------- |
| Runtime        | Node.js 22, TypeScript                                      |
| Framework      | NestJS (`@nestjs/platform-express`)                         |
| Lambda adapter | `@codegenie/serverless-express`                              |
| ORM            | Prisma (MongoDB connector)                                    |
| Validation     | Zod (custom `ZodValidationPipe`, not `class-validator`)       |
| Logging        | Pino via `nestjs-pino`, JSON output                          |
| Testing        | Jest + `ts-jest`                                              |
| Infra          | AWS SAM (API Gateway, Lambda, IAM, CloudWatch, Secrets Manager) |

## API

An OpenAPI 3.0 spec covering all four routes (with examples and both a
local and deployed-dev server preconfigured) is at `openapi.yaml`. This
service also serves both files live from itself (`src/docs/`), so sharing
the API with someone else - a frontend team, Postman's "Link" import - is
just a URL, not a file to pass around:

- **Interactive Swagger UI, hosted, zero setup**: https://s.jseven.ai/swagger-ui.html
- **Raw spec, hosted**: https://s.jseven.ai/openapi.yaml - point Postman's
  "Link" import or `openapi-typescript` directly at this instead of a local
  file.
- **Postman, from a local checkout**: File -> Import -> `openapi.yaml`.
- **Interactive Swagger UI, locally**: `npx serve .` from this directory,
  then open `/swagger-ui.html`.
- **Static HTML reference** (non-interactive, just for reading):
  `npx @redocly/cli build-docs openapi.yaml`.

### `POST /short-url`

Request:

```json
{ "destination": "https://google.com/review?id=123" }
```

Response `201`:

```json
{ "id": "3a9c...uuid", "code": "Ab12Cd", "shortUrl": "https://api.example.com/r/Ab12Cd" }
```

### `POST /short-url/bulk`

Optimized batch creation - e.g. one short URL per row from an external
patient table for a campaign. One DB round trip to check code uniqueness and
one to insert the whole batch, regardless of size, instead of one `create()`
call per item. Each item's `destination` is used as-is - this endpoint does
not template or derive destinations, and this service has no notion of
"patient" or "campaign" itself (see `docs/architecture.md`). Consumed by
[`services/campaign-sms`](../campaign-sms) for scheduled SMS campaigns -
that service owns everything patient/campaign/SMS-related, calling this
endpoint over HTTP rather than duplicating its collision-safe code
generation.

Request:

```json
{
  "items": [
    { "destination": "https://example.com/review?patient=1", "createdBy": "patient:1" },
    { "destination": "https://example.com/review?patient=2", "createdBy": "patient:2" }
  ]
}
```

- `createdBy` is optional per item - a caller-supplied tag (patient ID,
  campaign name, whatever) stored verbatim on that row's `created_by` column,
  so the batch can also be found again later with a direct DB query (e.g.
  `db.short_urls.find({created_by: /^patient:/})`).
- Capped at 2000 items per request (`MAX_BULK_ITEMS`), well under the
  Lambda synchronous-invocation payload ceiling (6 MB) - chunk larger
  campaigns client-side across multiple requests.

Response `201` - `results` is positionally correlated with the request's
`items` (built from what this endpoint already generated in memory before
inserting, not a second DB read - `createMany` returns no rows back for
MongoDB):

```json
{
  "created": 2,
  "results": [
    { "destination": "https://example.com/review?patient=1", "code": "Ab12Cd", "shortUrl": "https://api.example.com/r/Ab12Cd", "createdBy": "patient:1" },
    { "destination": "https://example.com/review?patient=2", "code": "Ef34Gh", "shortUrl": "https://api.example.com/r/Ef34Gh", "createdBy": "patient:2" }
  ]
}
```

### `GET /short-url/{code}`

Short URL details plus its click history - `clickCount`/`lastAccessedAt`
(aggregate) and `clicks` (the most recent individual click-log rows, newest
first, capped at 50).

Response `200`:

```json
{
  "id": "3a9c...uuid",
  "code": "Ab12Cd",
  "destination": "https://example.com/some/long/path?utm_source=sms",
  "shortUrl": "https://api.example.com/r/Ab12Cd",
  "clickCount": 5,
  "createdAt": "2026-07-15T10:00:00.000Z",
  "lastAccessedAt": "2026-07-18T11:56:51.000Z",
  "expiresAt": null,
  "status": "ACTIVE",
  "clicks": [
    {
      "clickedAt": "2026-07-18T11:56:51.000Z",
      "ipAddress": "203.0.113.5",
      "userAgent": "Mozilla/5.0 ...",
      "referer": "",
      "country": "IN",
      "region": "Tamil Nadu",
      "city": "Chennai",
      "deviceType": "desktop",
      "browser": "Chrome",
      "operatingSystem": "Windows",
      "isBot": false,
      "responseStatus": 302,
      "redirectUrl": "https://example.com/some/long/path?utm_source=sms"
    }
  ]
}
```

`404` if the code doesn't exist.

### `GET /short-url/{code}/clicks`

Dedicated click-detail listing for a short URL - same `ClickLogEntry` shape
as above, but as the sole point of the response rather than embedded/capped
at 50. Defaults to and caps at 1000 rows; narrow it with `?limit=N`.

Response `200`:

```json
{
  "code": "Ab12Cd",
  "clickCount": 5,
  "clicks": [
    {
      "clickedAt": "2026-07-18T11:56:51.000Z",
      "ipAddress": "203.0.113.5",
      "userAgent": "Mozilla/5.0 ...",
      "referer": "",
      "country": "IN",
      "region": "Tamil Nadu",
      "city": "Chennai",
      "deviceType": "desktop",
      "browser": "Chrome",
      "operatingSystem": "Windows",
      "isBot": false,
      "responseStatus": 302,
      "redirectUrl": "https://example.com/some/long/path?utm_source=sms"
    }
  ]
}
```

`404` if the code doesn't exist.

### `GET /r/{code}`

- `302` redirect to the stored destination; increments `click_count`,
  updates `last_accessed_at`, and inserts one immutable row into the
  `short_url_click_logs` audit trail - all in a single DB transaction. See
  `docs/architecture.md` ("Click tracking and the audit trail") for why this
  is now a real multi-document transaction rather than the single atomic
  update used before auditing existed.
- `404` if the code doesn't exist. No click log is written for a 404 - only
  successful redirects are audited.

### `GET /health`

```json
{ "status": "ok" }
```

## Project layout

```
src/
  common/          # cross-cutting: Zod pipe, global exception filter, domain error classes, request-context extraction
  config/          # env validation, ConfigService, SecretsService (Secrets Manager <-> DATABASE_URL)
  infrastructure/  # Prisma client provider, Pino logger wiring
  health/          # GET /health
  docs/            # serves openapi.yaml/swagger-ui.html live (GET /openapi.yaml, GET /swagger-ui.html)
  short-url/       # controller, service, repository interface + Prisma implementation, code generator, click metadata (UA/bot parsing)
  main.ts          # local dev bootstrap (Express) - never runs in Lambda
  lambda.ts         # Lambda entrypoint - never runs locally
tests/unit/        # mirrors src/, one spec per unit; no live infra required
prisma/            # schema.prisma (no migrations/ - Prisma Migrate is SQL-only; see "Deployment")
template.yaml       # AWS SAM template
Makefile            # `sam build` packaging (see "Packaging" below)
```

`ShortUrlService` depends only on the `ShortUrlRepository` interface (DI
token `SHORT_URL_REPOSITORY`), never on Prisma directly - that's what makes
it fully unit-testable with a plain mock (see
`tests/unit/short-url/short-url.service.spec.ts`).

## Environment variables

| Variable       | Required | Notes |
| -------------- | -------- | ----- |
| `NODE_ENV`     | no (default `development`) | `development` \| `test` \| `production` |
| `BASE_URL`     | yes | Root URL of this API, **no trailing `/r`** (e.g. `https://api.example.com`). Used to build `shortUrl` as `${BASE_URL}/r/{code}`. |
| `DATABASE_URL` | one of `DATABASE_URL`/`SECRET_NAME` | Local dev only - MongoDB connection string. Ignored in AWS when `SECRET_NAME` is set. |
| `SECRET_NAME`  | one of `DATABASE_URL`/`SECRET_NAME` | Name of the Secrets Manager secret holding MongoDB credentials. Takes precedence over `DATABASE_URL` when set. |
| `LOG_LEVEL`    | no | Pino level; defaults to `debug` outside production, `info` in production. |

`AWS_REGION` is **not** one of this service's env vars - it's a
Lambda-reserved variable injected automatically by the runtime, and
CloudFormation rejects attempts to set it explicitly under a function's
`Environment.Variables`.

## Local development

```bash
cp .env.example .env               # adjust BASE_URL/DATABASE_URL if needed
docker-compose up -d                 # local MongoDB (single-node replica set) on :27017
npm install
npx prisma db push                    # syncs the schema's indexes onto the local DB
npm run start:dev                    # Express app on http://localhost:3000
```

`docker-compose up -d` alone is enough - the `mongodb` service's healthcheck
initiates the required single-node replica set on first run (see
`docker-compose.yml`). Prisma's MongoDB connector needs a replica set (even
a single-node one) for every write, not just transactions/nested writes.

Try it:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/short-url -H 'Content-Type: application/json' \
  -d '{"destination":"https://google.com/review?id=123"}'
curl -i http://localhost:3000/r/<code>       # expect a 302
```

Run tests: `npm test` (or `npm run test:watch`). Everything under
`tests/unit` is fully mocked - no database is required to run the suite.

## Packaging for Lambda

`sam build` invokes `Makefile`'s `build-ShortUrlFunction` target (via
`Metadata.BuildMethod: makefile` in `template.yaml`), which:

1. `npm ci` - full install (needed for the build tools below).
2. `npx prisma generate` - generates the Prisma client, including its native
   query engine binary, **before** pruning devDependencies (the `prisma` CLI
   is a devDependency, so this must happen first).
3. `npm run build` - compiles `src/` to `dist/` via `tsc`.
4. `npm prune --omit=dev` - removes devDependencies. Deliberately `npm
   prune`, not a second `npm ci`: a second `npm ci` would do a clean
   reinstall and wipe the engine binary generated in step 2.
5. Copies `dist/`, `node_modules/`, and `package.json` into the artifact
   directory SAM expects.

This ships the Prisma engine binary unbundled rather than trying to run it
through esbuild, which avoids a well-known esbuild+Prisma packaging footgun
at the cost of a larger (but simpler and more robust) deployment artifact.

**Architecture pairing:** the Lambda is deployed on **arm64**
(`Architectures: [arm64]` in `template.yaml`, ~20% better cost/perf on Node
workloads), which is paired with `binaryTargets = ["native",
"linux-arm64-openssl-3.0.x"]` in `prisma/schema.prisma`. If you ever change
one, you must change the other - a mismatch fails at Lambda runtime with a
missing/incompatible engine binary, not at build time.

**Runtime risk:** this template targets `Runtime: nodejs22.x`. Verify this
runtime is available in your target region/SAM CLI version before deploying
(`sam --version`, `aws lambda list-runtimes`). If not yet available, the
one-line fallback is `Runtime: nodejs20.x` in `template.yaml` - no code
changes required.

## Deployment

This stack does **not** create the database - it assumes an existing,
externally hosted MongoDB deployment (e.g. MongoDB Atlas) and connects to it
via Secrets Manager (or `DATABASE_URL` for local dev only). You need, ahead
of time:

- An existing MongoDB deployment, running as a replica set (Atlas clusters
  always are; a self-hosted deployment must be configured as one too -
  Prisma's MongoDB connector requires it for every write).
- A database user + connection string/credentials for it.
- A Secrets Manager secret (friendly name, not full ARN) containing either
  `{"connectionString": "mongodb+srv://..."}` (required for SRV-style hosts
  like Atlas) or `{"host", "username", "password", "dbname", "port"
  (optional)}`.
- **Only if** your MongoDB is reachable solely from inside a VPC (not the
  common case for a managed provider like Atlas): the VPC's subnet IDs and a
  security group for the Lambda's ENIs. Leave `VpcSubnetIds`/
  `VpcSecurityGroupIds` unset otherwise - the template defaults to no VPC
  attachment at all, which is both simpler and avoids VPC ENI cold-start
  overhead.

Then:

```bash
sam build
sam deploy --guided          # first time only, to populate samconfig.toml
# or, once samconfig.toml has real values for an environment:
sam deploy --config-env dev
```

Fill in every `CHANGE_ME` in `samconfig.toml` (`SecretName`, `BaseUrl`)
before deploying - neither has a template default, since both are
environment/account-specific.

Before (or after) the stack deploys, sync the schema's indexes onto the
target database:

```bash
DATABASE_URL="<connection string for the target DB>" npx prisma db push
```

Prisma's MongoDB connector has no schema migrations (`prisma migrate` is
SQL-only) - `db push` is the equivalent for Mongo, syncing the `@unique`/
`@@index` declarations in `prisma/schema.prisma` onto the database's
indexes. See `.github/workflows/deploy-short-url.yml` in the platform root
for the automated version of this step.

Verify: hit the `ApiBaseUrl` CloudFormation output's `/health`, `/short-url`,
`/short-url/{code}`, `/short-url/{code}/clicks`, and `/r/{code}` routes.

## CI/CD

`.github/workflows/deploy-short-url.yml` (platform root) runs on push to
`main` (path-filtered to this service) or manual dispatch: lint + typecheck +
Jest -> `prisma db push` -> OIDC AWS auth -> `sam build`/`sam deploy`.
Requires these GitHub Environment (`dev`/`prod`) variables/secrets:

- `vars.AWS_DEPLOY_ROLE_ARN` - IAM role ARN the workflow assumes via OIDC.
- `vars.AWS_REGION`
- `secrets.DATABASE_URL` - used only for the `db push` step; keep in sync
  with the credentials in the Secrets Manager secret the Lambda itself reads
  at runtime.

OIDC (not static AWS access keys) is used throughout, per current best
practice for CI -> AWS deploys.
