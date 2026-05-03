import http from "node:http";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("OPENAI_API_KEY is required");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const UPSTREAM = "https://api.openai.com";

// Parse JSON body from incoming request
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

  // OpenAI-compatible chat completions proxy
  // POST /v1/chat/completions -> api.openai.com/v1/chat/completions
  // Also pass through other /v1/* endpoints (models, etc.)
  if (req.method === "POST" || req.method === "GET") {
    // Accept any /v1/* path
    if (req.url.startsWith("/v1/")) {
      const upstreamUrl = `${UPSTREAM}${req.url}`;
      try {
        const headers = {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        };

        const opts = {
          method: req.method,
          headers,
        };

        if (req.method === "POST") {
          const body = await readBody(req);
          opts.body = JSON.stringify(body);
        }

        const upstream = await fetch(upstreamUrl, opts);
        const data = await upstream.json();

        // Forward upstream headers that matter
        const respHeaders = { "Content-Type": "application/json" };
        if (upstream.headers.get("x-ratelimit-remaining")) {
          respHeaders["x-ratelimit-remaining"] = upstream.headers.get("x-ratelimit-remaining");
        }
        if (upstream.headers.get("x-ratelimit-reset")) {
          respHeaders["x-ratelimit-reset"] = upstream.headers.get("x-ratelimit-reset");
        }

        res.writeHead(upstream.status, respHeaders);
        res.end(JSON.stringify(data));
      } catch (err) {
        console.error(`proxy ${req.method} ${req.url}:`, err);
        json(res, 502, { ok: false, error: "upstream_unreachable" });
      }
      return;
    }
  }

  json(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, () => console.log(`openai-proxy :${PORT}`));
