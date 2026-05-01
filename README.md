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
        └── telegram/        # Telegram Bot API proxy
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


