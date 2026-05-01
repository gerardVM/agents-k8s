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
  const payload = { iss: parseInt(APP_ID, 10), iat: now, exp: now + 600 };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64url")
      .replace(/=+$/, "");

  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), PRIVATE_KEY);
  return `${signingInput}.${sig.toString("base64url").replace(/=+$/, "")}`;
}

// Exchange JWT for an installation access token
async function getInstallationToken() {
  const jwt = generateJWT();
  const url = `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.message || "failed to get token");
  }
  return data;
}

// Respond with JSON
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

http.createServer(async (req, res) => {
  // Health checks
  if (req.url === "/healthz" || req.url === "/readyz") {
    return json(res, 200, { ok: true });
  }

  // GET /token — return a short-lived installation access token
  if (req.method === "GET" && req.url === "/token") {
    try {
      const token = await getInstallationToken();
      return json(res, 200, {
        token: token.token,
        expires_at: token.expires_at,
        permissions: token.permissions,
      });
    } catch (err) {
      console.error("getInstallationToken:", err);
      return json(res, 502, { ok: false, error: "upstream_unreachable" });
    }
  }

  // GET /repos — list installation repos
  if (req.method === "GET" && req.url === "/repos") {
    try {
      const token = await getInstallationToken();
      const resp = await fetch("https://api.github.com/installation/repositories?per_page=100", {
        headers: {
          Authorization: `Bearer ${token.token}`,
          Accept: "application/vnd.github+json",
        },
      });
      const data = await resp.json();
      return json(res, resp.status, data);
    } catch (err) {
      console.error("list repos:", err);
      return json(res, 502, { ok: false, error: "upstream_unreachable" });
    }
  }

  // POST /proxy — generic proxy to GitHub API
  // Body: { method, url, body? }
  // e.g. { "method": "POST", "url": "/repos/gerardVM/agents/pulls", "body": { ... } }
  if (req.method === "POST" && req.url === "/proxy") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { method, url, body: reqBody } = JSON.parse(body || "{}");
        if (!method || !url) {
          return json(res, 400, { ok: false, error: "method and url required" });
        }

        const token = await getInstallationToken();
        const fetchOpts = {
          method: method.toUpperCase(),
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
        };
        if (reqBody) fetchOpts.body = JSON.stringify(reqBody);

        const upstream = await fetch(`https://api.github.com${url}`, fetchOpts);
        const data = await upstream.json();
        return json(res, upstream.status, data);
      } catch (err) {
        console.error("proxy:", err);
        return json(res, 502, { ok: false, error: "proxy_error" });
      }
    });
    return;
  }

  json(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, () => console.log(`github-api-service :${PORT}`));
