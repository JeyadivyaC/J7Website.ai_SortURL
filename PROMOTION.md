# Promoting to Staging / Production

The procedure for standing up a new environment (`staging` or `prod`) and
for deploying to one that already exists. For the very first environment
(`dev`) bootstrap from a completely fresh AWS account, see
[`SETUP.md`](SETUP.md) - this doc assumes that groundwork (the GitHub OIDC
deploy role, `infra/aws-bootstrap/`) already exists and is being reused.

## What's shared across environments vs. what's per-environment

**Shared, set up once, reused by every environment:**
- The GitHub Actions OIDC deploy role (`devaJ-j7website-short-url-github-deploy`)
  and its permissions policy. It's scoped with wildcards
  (`j7website-short-url-*`, `devaJ-j7website-short-url-*`) that already cover
  any environment name - promoting to a new environment does **not** need a
  new IAM role or a new admin permissions ask, *unless* the new environment
  is also the first to use a genuinely new AWS service (e.g. dev added
  CloudFront - if prod reuses the same template, it inherits that
  permission need too, but it's already been requested by the time dev
  works).
- The GitHub OIDC identity provider itself (one per AWS account).
- The application code and `template.yaml` (same template, parameterized
  per environment - not a fork).

**Per-environment, must be created for each new one:**
- A CloudFormation stack (`j7website-short-url-<env>`), with its own Lambda,
  API Gateway, IAM execution role, log group, and (if using it)
  CloudFront distribution.
- A Secrets Manager secret with that environment's own DB credentials.
- A `[<env>.deploy.parameters]` stanza in `samconfig.toml`.
- A GitHub Environment (Settings -> Environments) holding that
  environment's `AWS_DEPLOY_ROLE_ARN`/`AWS_REGION`/`DATABASE_URL`.
- Strongly recommended: **a separate MongoDB database, ideally a separate
  Atlas cluster/project**, not a database sharing dev's cluster - keeps a
  dev testing mistake from ever touching real data, and keeps dev traffic
  from affecting prod cluster performance.

## `staging` doesn't exist as a deployable environment yet

`template.yaml`'s `Environment` parameter allows `dev`/`staging`/`prod`, but
today only `dev` and `prod` have a `samconfig.toml` stanza, and the
workflow's manual-dispatch dropdown (`.github/workflows/deploy-short-url.yml`,
`inputs.environment.options`) only lists `[dev, prod]`. To actually add
`staging`, first:

1. Add a `[staging.deploy.parameters]` stanza to `samconfig.toml` (copy the
   `prod` stanza as a starting point - same shape, different `stack_name`/
   `SecretName`/`BaseUrl`/`FunctionRoleName`).
2. Add `staging` to `options: [dev, prod]` in the workflow's
   `workflow_dispatch.inputs.environment`.

Everything below then applies to `staging` the same way it does to `prod`.

## One-time setup for a new environment (e.g. `prod`)

1. **Database.** Create the MongoDB database (and, ideally, cluster) for
   this environment. Get its connection string.

2. **Secrets Manager secret**, same shape as dev's (see `SETUP.md` for the
   exact gotcha about the JSON key needing to be `connectionString`):
   ```bash
   aws secretsmanager create-secret \
     --name j7website/short-url/prod/db \
     --secret-string '{"connectionString":"mongodb+srv://..."}' \
     --region ap-southeast-2 --profile <profile>
   ```

3. **Fill in `samconfig.toml`'s `[prod.deploy.parameters]`.** Right now it
   has real `FunctionRoleName`/`PermissionsBoundaryArn` values already (they
   don't change per environment beyond the role name itself, which follows
   the same `devaJ-j7website-short-url-<env>-role` pattern the deploy role's
   policy already permits) - only `SecretName` and `BaseUrl` still say
   `CHANGE_ME`:
   - `SecretName=j7website/short-url/prod/db` (from step 2)
   - `BaseUrl`: still circular on a brand-new stack - see "First deploy"
     below.

4. **Create the GitHub Environment.** Settings -> Environments -> New
   environment -> name it `prod` (must match `--config-env`/the
   `workflow_dispatch` choice exactly):
   - **Environment variables**: `AWS_DEPLOY_ROLE_ARN` (same role ARN as
     dev - it's shared, see above), `AWS_REGION`
   - **Environment secret**: `DATABASE_URL` - the same raw connection
     string as step 2, used only by CI's `prisma db push` step
   - **Strongly recommended for `prod` specifically**: add required
     reviewers under this environment's protection rules, so a prod deploy
     needs explicit approval before it runs. Note: for a **private** repo,
     required reviewers need a GitHub Team/Enterprise plan - on Free,
     enforce this as process discipline instead (PR review before merging
     to `main`, and only ever dispatch `prod` deploys deliberately, never
     via the automatic push trigger).

5. **Sync the schema once**, ahead of or alongside the first deploy:
   ```bash
   DATABASE_URL="<prod connection string>" npx prisma db push
   ```

## Triggering a deploy

The push-to-`main` trigger **always deploys `dev`** (`inputs.environment ||
'dev'` - there's no `environment` input on a plain push, only on manual
dispatch). Staging/prod are **manual only**:

1. GitHub repo -> **Actions** tab -> "Deploy Short URL Service" -> **Run workflow**
2. Choose the environment (`dev` or `prod` today; `staging` once added per
   above)
3. Confirm the branch is `main`
4. Run - the same `test` job (lint/typecheck/Jest) runs first regardless of
   environment, then `deploy` targets the chosen environment's
   `samconfig.toml` stanza and GitHub Environment secrets/vars.

## First deploy to a new environment: the `BaseUrl` chicken-and-egg

Same two-pass pattern as dev's first deploy (`SETUP.md`):
1. Deploy once with a placeholder `BaseUrl`
   (`https://placeholder.execute-api.ap-southeast-2.amazonaws.com/prod`, or
   `https://placeholder.cloudfront.net` if this environment fronts with
   CloudFront from the start).
2. Grab the real `ApiBaseUrl` (direct API Gateway) or `CloudFrontUrl` (if
   applicable) from the stack outputs.
3. Update `samconfig.toml`'s `BaseUrl` for that environment to the real
   value, redeploy.

## Verifying a promoted environment

Same checklist as `SETUP.md`'s "Verify a deployment", run against the new
environment's real URL:
```bash
BASE="<the real URL from step above>"
curl -i "$BASE/health"
curl -i -X POST "$BASE/short-url" -H 'Content-Type: application/json' -d '{"destination":"https://example.com/verify"}'
curl -i "$BASE/r/<code>"        # expect 302
curl -i "$BASE/r/doesnotexist"  # expect 404, and confirm no click log was written for it
```

## Rollback

CloudFormation doesn't give SAM deploys a one-command "revert to the
previous stack version." A **failed** deploy already auto-rolls-back its
own changeset (see `SETUP.md`'s stuck-rollback gotchas for what can go
wrong there) - that's not what this section is about. This is about "the
deploy *succeeded*, but the new code has a bug in prod":

1. `git revert` the problematic commit(s) (or check out the last known-good
   commit) and push/redeploy through the same pipeline - there is no
   faster path than a normal redeploy with reverted code.
2. `prod`'s `disable_rollback = true` in `samconfig.toml` is deliberate: on
   a failed deploy, CloudFormation leaves the partially-updated stack in
   place for post-incident investigation instead of automatically tearing
   changes down. This means a failed prod deploy needs the **same manual
   `continue-update-rollback` handling** documented in `SETUP.md`'s
   troubleshooting section, not an automatic revert - budget time for that
   if a prod deploy fails.

## Environment-specific differences already baked in

| | dev | prod |
|---|---|---|
| `disable_rollback` | `false` (auto-rollback on failure) | `true` (preserved for investigation) |
| `LogRetentionDays` | 14 | 90 |
| Auto-deploys on push to `main`? | Yes | No - manual dispatch only |

Consider before a real prod launch (not yet done for this service): a
custom domain (Route 53 + ACM, see the CloudFront section of
`docs/architecture.md` for the CDN layer it'd sit in front of), and
whichever GitHub Environment protection rules your plan supports.
