import http from "node:http";
import crypto from "node:crypto";

const APP_ID = process.env.GITHUB_APP_ID;
const INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
const PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

if (!APP_ID || !INSTALLATION_ID || !PRIVATE_KEY) {
  console.error("GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY are required");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "8080", 10);

// Generate a JWT signed by the GitHub App private key
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: parseInt(APP_ID, 10), iat: now, exp: now + 60 };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64url")
      .replace(/=+$/, "");

  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), PRIVATE_KEY);
  return `${signingInput}.${sig.toString("base64url").replace(/=+$/, "")}`;
}

// Exchange JWT for a short-lived installation access token
let cachedToken = null;
let cachedExpiry = 0;
async function getToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 30000) return cachedToken; // 30s buffer

  const jwt = generateJWT();
  const resp = await fetch(
    `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || "failed to get token");

  cachedToken = data.token;
  cachedExpiry = new Date(data.expires_at).getTime();
  return cachedToken;
}

// Proxy a request to the GitHub API
async function proxyGitHub(method, path, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "github-api-service",
    },
  };
  // Only send body for methods that support it
  if (body && !["GET", "HEAD", "DELETE"].includes(method)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(`https://api.github.com${path}`, opts);
  const data = await resp.json();
  return { status: resp.status, data, headers: resp.headers };
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

http.createServer(async (req, res) => {
  try {
    // Health checks
    if (req.url === "/healthz" || req.url === "/readyz") {
      return json(res, 200, { ok: true });
    }

    // POST /<method>/<path> — proxy to GitHub API
    // Examples:
    //   POST /GET/repos/gerardVM/agents
    //   POST /POST/repos/gerardVM/agents/pulls
    //   POST /GET/repos/gerardVM/agents/pulls/10
    if (req.method === "POST") {
      const parts = req.url.slice(1).split("/");
      const method = parts.shift().toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        return json(res, 400, { ok: false, error: `unsupported method: ${method}` });
      }
      const path = "/" + parts.join("/");
      const body = await readBody(req);
      const result = await proxyGitHub(method, path, body);
      return json(res, result.status, result.data);
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    console.error("request error:", err);
    json(res, 502, { ok: false, error: err.message });
  }
}).listen(PORT, () => console.log(`github-api-service :${PORT}`));
