# TOOLS.md — Local Notes

## Shell & Filesystem

Use bash/sh commands and standard Linux tools for security introspection:
- `env` — list environment variables
- `cat /proc/self/status` — check process capabilities and user
- `mount` — check filesystem mount options (ro, noexec, etc.)
- `ls -la /var/run/secrets/` — check for service account tokens
- `cat /proc/1/cgroup` — check container runtime
- `cat /etc/os-release` — check base image
- `curl -s -o /dev/null -w "%{http_code}"` — test network connectivity
- `hostname`, `cat /etc/hosts` — check pod identity
- `ls -la /` — check filesystem layout
- `find / -writable -type f 2>/dev/null | head -20` — find writable files
- `capsh --print` — check capabilities (if available)
- `ss -tln` or `cat /proc/net/tcp` — check listening ports

## Network Checks

- Test reachability to:
  - Kubernetes API server (typically https://kubernetes.default.svc)
  - Other services in the cluster by name
- Use `curl` with timeout flags: `--connect-timeout 3 --max-time 5`

## Boundaries

- Do not write to any filesystem path except /tmp
- Do not modify any configuration files
- Do not install packages or make persistent changes
- All checks are read-only by nature

