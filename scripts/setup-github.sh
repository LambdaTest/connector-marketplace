#!/bin/sh
# One-time setup for the public marketplace repo. Run after the first push to main.
# Usage: scripts/setup-github.sh <org>/<repo>     (needs gh, logged in as a repo admin)
# Safe to run again: every step updates instead of duplicating.
set -eu

REPO="${1:?usage: scripts/setup-github.sh <org>/<repo>}"

echo "Labels"
label() { gh label create "$1" --color "$2" --description "$3" --force -R "$REPO" >/dev/null; echo "  $1"; }
label ready-for-review 0e8a16 "All listing checks pass; waiting for a maintainer"
label needs-changes    d93f0b "A listing check failed; see the bot comment"
label listing-health   b60205 "A listed connector has failed health checks for about a day"
label review           c5def5 "Rate a connector (ratings)"
label review-invalid   fbca04 "Rating can't be counted yet"
label review-hidden    5319e7 "Rating hidden by a maintainer"

echo "GitHub Pages (source: GitHub Actions)"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 ||
  gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null

echo "Private vulnerability reporting"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null

echo "Ratings off (RATINGS_ENABLED=false)"
gh variable set RATINGS_ENABLED --body false -R "$REPO"

echo "Branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Schema, logos, secrets", "Links and health"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "require_code_owner_reviews": true, "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

cat <<EOF

Done. Still to do by hand:
  1. Create the team named in .github/CODEOWNERS and give it write access.
  2. Settings → Actions → General → Fork pull request workflows: require approval for first-time contributors.
  3. Open a test PR from a fork (one valid listing, one broken) and check the bot comment and labels.
EOF
