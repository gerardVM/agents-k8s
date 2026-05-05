# Agents

Kubernetes-native agent deployments powered by [OpenClaw](https://github.com/openclaw/openclaw).

## Structure

```
k8s/
├── agents/
│   ├── base/                       # Shared OpenClaw deployment & config
│   │   ├── deployment.yaml
│   │   ├── kustomization.yaml
│   │   ├── openclaw.json
│   │   └── pvc.yaml
│   └── overlays/
│       ├── coder/                  # Coder agent
│       ├── reviewer/               # Reviewer agent
│       └── security/               # Security auditor
├── proxies/
│   ├── base/                       # Shared API proxy deployment & service
│   │   ├── deployment.yaml
│   │   ├── kustomization.yaml
│   │   └── service.yaml
│   └── overlays/
│       ├── deepseek/               # DeepSeek API proxy
│       └── openai/                 # OpenAI API proxy
└── tools/
    ├── base/                       # Shared tool deployment
    │   ├── deployment.yaml
    │   ├── kustomization.yaml
    │   └── service.yaml
    └── overlays/
        ├── telegram/               # Telegram Bot API proxy
        ├── github/                 # GitHub API proxy
        └── message-bus/            # Per-agent message bus & config store
```

All components follow the same kustomize pattern: an overlay points to a shared base, patches in provider-specific values (env vars, namespace), and generates a ConfigMap from overlay-local files.

---

## Agents

### coder (`coder-agent` namespace)
Writes code, reviews repositories, and opens pull requests. Default model is DeepSeek; can switch to GPT-Mini on request.

### reviewer (`reviewer-agent` namespace)
Reviews open pull requests, explains changes, and approves only when instructed.

### security (`security-agent` namespace)
On-demand security auditor. Inspects its own pod environment — checks service account tokens, env var exposure, writable paths, network reachability, and container runtime security posture. Does not scan other pods or namespaces.

---

## Proxies

Thin forwards that keep API keys server-side. Each proxy runs in its own namespace and forwards OpenAI-compatible requests to the upstream provider.

### deepseek-proxy (`deepseek-proxy` namespace)

- **Service URL:** `proxy.deepseek-proxy.svc.cluster.local:8080`
- **Secret key:** `DEEPSEEK_API_KEY` in `openclaw-secrets`
- **Upstream:** `https://api.deepseek.com`

### openai-proxy (`openai-proxy` namespace)

- **Service URL:** `proxy.openai-proxy.svc.cluster.local:8080`
- **Secret key:** `OPENAI_API_KEY` in `openclaw-secrets`
- **Upstream:** `https://api.openai.com`

---

## Tools

Infrastructure services that agents call internally instead of holding credentials directly.

### telegram-api-service

A thin proxy that injects the Telegram bot token from a Kubernetes secret and forwards requests to `api.telegram.org`.

### github-api-service

Holds GitHub App credentials (app ID, installation ID, private key) and proxies all GitHub API calls internally.

- **`POST /{METHOD}/{path}`** — proxy any GitHub API call
  - `METHOD`: GET, POST, PUT, PATCH, DELETE
  - `path`: the GitHub API path (e.g., `/repos/gerardVM/agents/pulls`)
  - Body (for POST/PUT/PATCH): JSON to forward as the request body
  - Internally generates a JWT, exchanges it for a short-lived installation token, and signs the request. The agent never sees or stores a token.

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

---

## Adding a component

All three component types (agents, proxies, tools) follow the same pattern:

1. Create a new overlay under `k8s/<type>/overlays/<name>/`
2. Add a `kustomization.yaml` pointing to `../../base` (or `../../base` for proxies)
3. Add a `namespace.yaml`
4. Wire overlay-specific files and patches

**For agents**, add a `workspace/` directory with 7 ConfigMap files:
- `AGENTS.md` — agent purpose
- `IDENTITY.md` — name and personality
- `SOUL.md` — workflow rules and boundaries
- `TOOLS.md` — tool-specific notes
- `USER.md` — human context
- `HEARTBEAT.md` — heartbeat placeholder
- `LEARNINGS.md` — cross-session memory

**For proxies**, add `index.mjs` and `package.json` using the generic `API_KEY` / `UPSTREAM_BASE_URL` convention, then patch the deployment to inject the correct env vars.

**For tools**, wire any env vars or patches needed, and reference the tool's overlay in the agent `kustomization.yaml`.
