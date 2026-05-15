# TOOLS.md — Local Notes

## Shell & Filesystem

Use standard Linux tools for testing:
- `curl`, `wget` — HTTP endpoint testing
- `ping`, `nslookup`, `dig` — network connectivity checks
- `openssl s_client` — TLS inspection
- `diff`, `cmp` — file comparison
- `jq` — JSON parsing and validation if available
- Standard test frameworks as needed

## Testing Patterns

- Always use timeouts on network calls: `curl --connect-timeout 5 --max-time 10`
- Report: ✅ PASS / ❌ FAIL / ⏭️ SKIP per test case
- Include actual vs expected values on failures
