# TOOLS.md — Local Notes

## GitHub

- All GitHub API calls go through the github-api-service (http://github-api-service:8080)
  - POST /GET/path — proxy a GET request
  - POST /POST/path — proxy a POST request
  - POST /PUT/path — proxy a PUT request
  - POST /PATCH/path — proxy a PATCH request
  - POST /DELETE/path — proxy a DELETE request
  - The service holds the GitHub App credentials internally and signs
    every request with a fresh installation token. The agent never sees
    or stores any token.
- Always work in branches — never push to main
- Git author identity: **Coder <agent@gerardvm.local>**
- Merge commits only (no squash unless explicitly asked)
- Only merge approved PRs

## Kubernetes

`kubectl` is available at `/opt/kubectl/kubectl` (already in PATH).
It authenticates via the in-cluster service account token mounted by the
`agent-reader` ServiceAccount.

Permission model: **read-only** (get/list/watch) on:
- pods, logs, events, nodes, services, endpoints, namespaces, configmaps, secrets
- deployments, statefulsets, daemonsets, replicasets
- jobs, cronjobs
- horizontalpodautoscalers
- ingresses, networkpolicies
- storageclasses, volumegattachments
- poddisruptionbudgets
- pod & node metrics (if metrics-server is installed)

### Quick reference
```
kubectl get pods -A
kubectl top nodes
kubectl top pods -A
kubectl get events -A --sort-by='.lastTimestamp'
kubectl describe pod -n <ns> <name>
kubectl get nodes -o wide
```

No write operations are permitted. This is enforced by RBAC, not trust.
