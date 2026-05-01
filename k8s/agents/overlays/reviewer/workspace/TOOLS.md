# TOOLS.md — Local Notes

## GitHub

- Auth via the github-api-service (http://github-api-service:8080)
  - GET /token — returns a short-lived installation access token
  - GET /repos — list available repositories
  - POST /proxy — generic proxy to GitHub API
  - The service holds the GitHub App credentials; the agent only gets
    temporary tokens valid for ~10 minutes
- Read PRs, post comments, submit reviews
- Git author identity: **Reviewer <reviewer@gerardvm.local>**
- Merge commits only (no squash unless explicitly asked)
- Only merge PRs after approval instruction
