# Setup Guide

Two independent setups live in this doc: **local development** (run the app
on your machine) and **AWS deployment** (get it live in an AWS account via
GitHub Actions). You only need the first to write and test code; the second
is for standing up a new environment/account from scratch. Both sections
include the real gotchas hit while first setting this service up - not just
the happy path.

For *why* things are built this way, see [`../../docs/architecture.md`](../../docs/architecture.md).
For a tour of the codebase and how to contribute, see [`DEVELOPER.md`](DEVELOPER.md).

## Prerequisites

- Node.js 22+, npm
- Docker (only if you want a local MongoDB instead of a remote Atlas cluster)
- AWS CLI v2 and AWS SAM CLI (only needed for the deployment section)
- Git, with push access to the repo already working

## Local development

```bash
cp .env.example .env
npm install
```

### Configure `.env`

- **`DATABASE_URL`**: either point it at a local Docker MongoDB (see below)
  or a real MongoDB Atlas connection string. Two gotchas if using Atlas:
  - The connection string **must include a database name** in the path
    (`.../<dbname>?retryWrites=...`) - a bare `mongodb+srv://user:pass@host/`
    fails with Prisma error `P1013` ("Database must be defined").
  - Add `retryWrites=true&w=majority` if not already present (standard
    Atlas params).
- **`SECRET_NAME`**: leave it **commented out entirely** for local dev - do
  not set it to `""`. The env schema (`src/config/env.schema.ts`) treats an
  empty string as an *invalid* value (fails `.min(1)`), not as "not set" -
  only a genuinely missing key is treated as unset. Setting it to `""` (a
  common mistake when copying `.env.example`) crashes the app on boot with
  "Invalid environment configuration."
- **`BASE_URL`** / **`PORT`**: default to `http://localhost:3000` / `3000`.
  If port 3000 is already taken by something else on your machine, set both
  to a free port (e.g. `3001`) - `src/main.ts` reads `PORT` and falls back
  to 3000 only if it's unset. Check what's holding the port first:
  ```bash
  lsof -i :3000        # or: ss -ltnp | grep :3000
  docker ps            # a completely unrelated container can easily be squatting on it
  ```

### Start local MongoDB (skip if using Atlas)

```bash
docker compose up -d    # note: `docker compose`, not the older `docker-compose`,
                         # unless your Docker install only has the standalone binary
```

The `mongodb` service's healthcheck initiates the required single-node
replica set on first run - Prisma's MongoDB connector needs a replica set
(even a single-node one) for every write, not just transactions.

### Sync the schema and run

```bash
npx prisma generate
npx prisma db push
npm run start:dev
```

### Verify

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/short-url -H 'Content-Type: application/json' \
  -d '{"destination":"https://example.com/test"}'
curl -i http://localhost:3000/r/<code>       # expect a 302
npm test                                      # fully mocked, no live DB needed
```

### API tooling for manual testing/demos

An OpenAPI 3.0 spec (`openapi.yaml`) covers all three routes with examples
and both a local and deployed server preconfigured:

- **Postman**: File -> Import -> `openapi.yaml`.
- **Interactive Swagger UI** ("Try it out" execution): `npx serve .` from
  this directory, then open `/swagger-ui.html`. Edit the server dropdown's
  local URL if your port isn't the spec's default.
- **Static HTML reference**: `npx @redocly/cli build-docs openapi.yaml`.

Note: `/r/{code}` is a redirect endpoint, not a JSON API - "Try it out" on it
will report a `Failed to fetch` / CORS error in the browser once it follows
the 302 to a destination that isn't CORS-aware itself. That's expected and
not a bug in this service - test that specific route by pasting the short
URL directly into a browser tab, or with `curl -i`.

## AWS deployment

This deploys via GitHub Actions (`.github/workflows/deploy-short-url.yml`)
using OIDC (no static AWS keys). Setting this up from scratch for a new
AWS account/environment means:

### 1. One-time AWS bootstrap: the GitHub OIDC deploy role

```bash
cd infra/aws-bootstrap
./apply.sh <your-aws-profile>
```

This creates (or confirms) the GitHub Actions OIDC identity provider and a
dedicated deploy role trusted only by this repo, with the permissions in
`j7website-short-url-deploy-policy.json` attached. Prints the resulting role
ARN - you'll need it for step 4.

**If your AWS user is permission-constrained** (e.g. can only create IAM
roles under a specific name pattern, with a mandatory permissions boundary
attached - a common privilege-escalation guardrail): the role's *effective*
permissions are the **intersection** of its own attached policy and its
boundary policy. This bit us repeatedly while setting this up - every one of
these needs to be allowed by **both** the role's policy (already handled in
`j7website-short-url-deploy-policy.json`) **and** the boundary policy your
account admin manages, or you get "no permissions boundary allows the
X action" errors that look identical to a missing identity-policy grant but
require a completely different fix:
- CloudFormation stack actions, `ListStacks`/`ValidateTemplate`
- `cloudformation:CreateChangeSet` on the `AWS::Serverless-2016-10-31`
  transform's own ARN (`arn:...:cloudformation:<region>:aws:transform/Serverless-2016-10-31`)
  - a separate resource from any stack ARN, easy to miss
- S3 actions on the `aws-sam-cli-managed-*` bucket (SAM's own bootstrap
  stack for artifact storage, separate from the app's stack)
- API Gateway, Lambda, CloudWatch Logs, Secrets Manager on this service's
  resources

If a deploy fails with `AccessDenied` mentioning "no permissions boundary
allows", the fix is on the boundary policy, not the role's own policy.

### 2. Create the database secret

The Lambda resolves its MongoDB connection at runtime from a Secrets
Manager secret (friendly name, not full ARN) - **not** from CloudFormation,
so this is a separate one-time step:

```bash
aws secretsmanager create-secret \
  --name j7website/short-url/<env>/db \
  --secret-string '{"connectionString":"mongodb+srv://user:pass@host/dbname?retryWrites=true&w=majority"}' \
  --region <region> --profile <profile>
```

**Gotcha**: the JSON payload's key must be exactly `connectionString` (for
an SRV-style host like Atlas) or the decomposed `host`/`username`/`password`/
`dbname`/`port` fields (`src/config/secrets.service.ts`). A secret created
via the AWS Console's "Other type of secret" -> plaintext tab, or with a key
like `DATABASE_URL`, will pass `JSON.parse` but fail `SecretsService`'s field
check, and the Lambda crashes with "Secret is missing required fields."
Check what key a secret actually has without printing its value:
```bash
aws secretsmanager get-secret-value --secret-id <name> --profile <profile> \
  --query SecretString --output text | node -e \
  'process.stdin.once("data", d => console.log(Object.keys(JSON.parse(d))))'
```

### 3. Fill in `samconfig.toml`

Every `CHANGE_ME` needs a real value before deploying - none have template
defaults, since they're all account/environment-specific. Two things easy to
get wrong:

- **`resolve_s3`/`s3_prefix` must be repeated in *every* `[<env>.deploy.parameters]`
  stanza.** SAM CLI's `--config-env <env>` reads only that environment's own
  section - it does **not** merge in `[default.deploy.parameters]`. Putting
  these only under `[default...]` means `sam deploy --config-env dev` has no
  S3 bucket to upload to and fails with "S3 Bucket not specified."
- **`BaseUrl` is circular on a brand-new stack**: the real API Gateway URL
  isn't known until after the first deploy creates it. Deploy once with a
  placeholder (e.g. `https://placeholder.execute-api.<region>.amazonaws.com/<env>`),
  grab the real `ApiBaseUrl` from the stack outputs, update `BaseUrl`, and
  redeploy.
- If your account requires the constrained-role setup from step 1, also set
  `FunctionRoleName` (matching your required naming pattern) and
  `PermissionsBoundaryArn` in `parameter_overrides` - `template.yaml` only
  applies these when explicitly set (defaults to unconstrained naming/no
  boundary otherwise).

### 4. Configure the GitHub repo

Settings -> Environments -> create one named to match `--config-env`
(e.g. `dev`):

- **Environment variables**: `AWS_DEPLOY_ROLE_ARN` (from step 1),
  `AWS_REGION`
- **Environment secret**: `DATABASE_URL` - the same raw connection string as
  step 2's secret (not JSON-wrapped), used only by the CI `prisma db push`
  step. Keep it in sync with the Secrets Manager secret manually; nothing
  automates that today.

### 5. Push and watch it deploy

Pushing to `main` or a manual
`workflow_dispatch` triggers `test` -> `prisma db push` -> OIDC AWS auth ->
`sam build`/`sam deploy`.

### Gotchas hit on a genuinely first deploy (already fixed in this repo, kept here for context)

- **A stuck SAM-managed bootstrap stack**: if an earlier attempt failed
  before the changeset ever executed, `aws-sam-cli-managed-default` can get
  stuck in `REVIEW_IN_PROGRESS` (or `ROLLBACK_COMPLETE` after a failed
  resource creation) without the Tags/Outputs SAM CLI expects, and it'll
  refuse to proceed ("stack was likely not created by the AWS SAM CLI").
  Confirm it's empty (`aws cloudformation describe-stack-resources` returns
  `[]`) and delete it - SAM recreates it cleanly on the next deploy.
- **`NODE_ENV` vocabulary mismatch**: `template.yaml`'s `Environment`
  parameter (`dev`/`staging`/`prod`, used for resource naming/API stage) is
  a different vocabulary than the app's own `NODE_ENV` enum
  (`development`/`test`/`production` - `src/config/env.schema.ts`). Passing
  `Environment` straight through crashes the Lambda on every cold start
  with a Zod validation error, surfacing to callers as a generic 502 - fixed
  via a `Mappings` translation in `template.yaml`, not an app code change.
- **Prisma's default interactive-transaction timeout (5000ms) is tight**
  against a cold Lambda + cross-region round trip to the DB - observed
  failing at ~5001ms in production (`P2028`, "Transaction already closed").
  `PrismaShortUrlRepository.recordClick` sets an explicit longer timeout.
- **CORS isn't on by default**: API Gateway doesn't enable it, and this app
  didn't call `enableCors()` either. Needed both `app.enableCors()`
  (`main.ts`/`lambda.ts`, for the actual response headers) **and** SAM's
  `Cors` property on `AWS::Serverless::Api` (for the `OPTIONS` preflight,
  which otherwise has no route to the Lambda at all).

### Verify a deployment

```bash
BASE="<ApiBaseUrl from the stack outputs>"
curl -i "$BASE/health"
curl -i -X POST "$BASE/short-url" -H 'Content-Type: application/json' -d '{"destination":"https://example.com/verify"}'
curl -i "$BASE/r/<code>"     # expect 302
curl -i "$BASE/r/doesnotexist"  # expect 404, and confirm no click log was written for it
```
