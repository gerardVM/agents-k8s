# Agents

Kubernetes-native agent deployments powered by [OpenClaw](https://github.com/openclaw/openclaw).

## Structure

```
k8s/
├── agents/
│   ├── base/                # Shared OpenClaw deployment & config
│   │   ├── deployment.yaml  # Gateway pod spec
│   │   ├── kustomization.yaml
│   │   ├── openclaw.json    # Model config, channels, tools
│   │   └── pvc.yaml         # 2Gi persistent volume
│   └── overlays/
│       ├── coder/           # Coder agent — writes code & opens PRs
│       └── reviewer/        # Reviewer agent — analyzes & explains PRs
└── tools/
    ├── base/                # Shared tool deployment
    │   ├── deployment.yaml
    │   ├── kustomization.yaml
    │   └── service.yaml
    └── overlays/
        ├── telegram/        # Telegram Bot API proxy
        └── github/          # GitHub API proxy (app auth, no tokens in agent env)
```

## Adding an agent

1. Create a new overlay under `k8s/agents/overlays/<name>/`
2. Add a `namespace.yaml` and `kustomization.yaml` pointing to `../../base`
3. Add a `workspace/` directory with the 7 ConfigMap files:
   - `AGENTS.md` — agent purpose
   - `IDENTITY.md` — name and personality
   - `SOUL.md` — workflow rules and boundaries
   - `TOOLS.md` — tool-specific notes
   - `USER.md` — human context
   - `HEARTBEAT.md` — heartbeat placeholder
   - `LEARNINGS.md` — cross-session memory

## Adding a tool

1. Create a new overlay under `k8s/tools/overlays/<name>/`
2. Create a `kustomization.yaml` pointing to `../../base`
3. Wire any env vars or patches needed

## Tools

### telegram-api-service

A thin proxy that injects the Telegram bot token from a Kubernetes secret and forwards requests to `api.telegram.org`. The agent calls this service instead of holding the token directly.

### github-api-service

Holds GitHub App credentials (app ID, installation ID, private key) and proxies all GitHub API calls internally.

- **`POST /{METHOD}/{path}`** — proxy any GitHub API call
  - `METHOD`: GET, POST, PUT, PATCH, DELETE
  - `path`: the GitHub API path (e.g., `/repos/gerardVM/agents/pulls`)
  - Body (for POST/PUT/PATCH): JSON to forward as the request body
  - The service generates a JWT, exchanges it for a short-lived installation token, and makes the request — all internally. The agent never sees or stores a token.
