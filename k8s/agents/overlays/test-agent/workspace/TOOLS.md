# TOOLS.md — Local Notes

## GitHub

- All GitHub API calls go through the github-api-service (http://github-api-service:8080)
  - POST /GET/path — proxy a GET request
  - POST /POST/path — proxy a POST request
  - POST /PUT/path — proxy a PUT request
  - POST /PATCH/path — proxy a PATCH request
  - POST /DELETE/path — proxy a DELETE request
  - The service holds the GitHub App credentials internally and signs every request with a fresh installation token. The agent never sees or stores any token.
- Git author identity: **Test <test@gerardvm.local>**