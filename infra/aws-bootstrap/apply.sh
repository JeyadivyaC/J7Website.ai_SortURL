#!/usr/bin/env bash
# One-time GitHub Actions OIDC deploy role bootstrap for the Short URL
# service. This account's IAM self-service grant only allows creating roles
# named "j7website-*" (or "JayaDivyaC-*"), and only with this account's
# permissions boundary attached (a privilege-escalation guardrail) - hence
# the role name and --permissions-boundary flag below. If your account has
# no such constraint, drop both and use any role name you like.
#
# Usage: ./apply.sh <aws-profile>
set -euo pipefail

PROFILE="${1:?Usage: ./apply.sh <aws-profile>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLE_NAME="j7website-short-url-github-deploy"
PERMISSIONS_BOUNDARY_ARN="arn:aws:iam::857475015624:policy/boundary-j7website-team"
OIDC_URL="https://token.actions.githubusercontent.com"

echo "==> This account's IAM grant doesn't include iam:*OpenIDConnectProvider* actions, so we"
echo "    can't check/create the OIDC provider from here. Assuming it already"
echo "    exists in this account (its ARN is deterministic from the URL) -"
echo "    if it doesn't, the next step fails with a clear error."

echo "==> Creating role $ROLE_NAME..."
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "file://$DIR/github-deploy-trust-policy.json" \
  --permissions-boundary "$PERMISSIONS_BOUNDARY_ARN" \
  --profile "$PROFILE"

echo "==> Attaching deploy permissions to $ROLE_NAME..."
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name j7website-short-url-deploy \
  --policy-document "file://$DIR/j7website-short-url-deploy-policy.json" \
  --profile "$PROFILE"

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --profile "$PROFILE" --query 'Role.Arn' --output text)
echo
echo "Done. GitHub Actions deploy role ARN:"
echo "  $ROLE_ARN"
echo "Set this as the AWS_DEPLOY_ROLE_ARN repo/environment variable in GitHub."
