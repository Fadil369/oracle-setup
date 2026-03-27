# Required Checks and Protection Matrix

This repository should enforce branch protection on `main` with the following minimum requirements.

## Required Status Checks

- `dependency-review`
- `quality (20)`
- `quality (22)`
- `security`
- `codeql`

## Pull Request Rules

- Require at least 1 approval.
- Dismiss stale approvals on new commits.
- Require approval of the most recent push.
- Require all review conversations to be resolved.

## Push Safety

- Disallow force pushes.
- Disallow branch deletion.
- Enforce rules for administrators.

## Release and Deployment Notes

- Production deployments should only run from signed release tags.
- Keep `release.yml` and `container-deploy.yml` checks green before promotion.
