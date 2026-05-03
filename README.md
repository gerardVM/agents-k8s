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
│       ├── reviewer/        # Reviewer agent — analyzes & explains PRs
│       └── security/        # Security auditor — inspects pod security posture
└── tools/
    ├── base/                # Shared tool deployment
    │   ├── deployment.yaml
    │   ├── kustomization.yaml
    │   └── service.yaml
    └── overlays/
        ├── telegram/        # Telegram Bot API proxy
        ├── github/          # GitHub API proxy (app auth, no tokens in agent env)
        └── message-bus/     # Per-agent message bus & config store
```

## Agents

### coder (coder-agent namespace)
Writes code, reviews repositories, and opens pull requests. Default model is DeepSeek; can switch to GPT-Mini on request.

### reviewer (reviewer-agent namespace)
Reviews open pull requests, explains changes, and approves only when instructed.

### security (security-agent namespace)
On-demand security auditor. Inspects its own pod environment — checks service account tokens, env var exposure, writable paths, network reachability, and container runtime security posture. Does not scan other pods or namespaces.

## Adding an agent

1. Create a new overlay under `k8s/agents/overlays/<name>/`
2. Add a `namespace.yaml` and `kustomization.yaml` pointing to `../../base`
3. Wire tool overlays as needed (telegram, github, message-bus, openai-proxy, deepseek-proxy)
4. Add a `workspace/` directory with the 7 ConfigMap files:
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

### deepseek-proxy

A reverse proxy that holds the `DEEPSEEK_API_KEY` secret and forwards `/v1/*` requests to `api.deepseek.com`. Agents call this service instead of holding the key directly. Configured as the DeepSeek provider `baseUrl` in `openclaw.json`.

### openai-proxy

A reverse proxy that holds the `OPENAI_API_KEY` secret and forwards `/v1/*` requests to `api.openai.com`. Agents call this service instead of holding the key directly. Configured as the OpenAI provider `baseUrl` in `openclaw.json`.

### agent-message-bus

A lightweight HTTP service deployed alongside each agent in its own namespace. Handles agent-to-agent messaging and persistent config storage.

Deployed via the `message-bus` tool overlay. One instance per agent namespace — no agentId routing needed.

**Messaging:**
- **`POST /send`** — receive a message into this agent's inbox
  ```json
  {"from": "sender-id", "subject": "optional", "body": "any"}
  ```
- **`GET /inbox`** — poll for pending messages
- **`GET /inbox?ack=<msgId>`** — acknowledge a processed message

**Config storage:**
- **`GET /config`** — retrieve stored config for this agent
- **`POST /config`** — store or merge config for this agent

Messages default to 60-minute TTL and are automatically pruned. File-level locking prevents race conditions. Storage is ephemeral (emptyDir), so state resets on pod restart.

