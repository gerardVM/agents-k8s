import http from "node:http";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY environment variable is required");
  process.exit(1);
}

const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const PORT = parseInt(process.env.PORT || "8080", 10);

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

async function proxyToDeepSeek(method, path, bodyRaw) {
  const url = `${DEEPSEEK_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    "Content-Type": "application/json",
  };

  const opts = { method, headers };
  if (bodyRaw && !["GET", "HEAD"].includes(method)) {
    opts.body = bodyRaw;
  }

  const resp = await fetch(url, opts);
  const contentType = resp.headers.get("content-type") || "";

  // For streaming (chat completions with stream: true), pipe through
  if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson")) {
    return { status: resp.status, stream: true, body: resp.body };
  }

  const data = await resp.json();
  return { status: resp.status, stream: false, body: JSON.stringify(data) };
}

http.createServer(async (req, res) => {
  try {
    // Health checks
    if (req.url === "/healthz" || req.url === "/readyz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Only accept POST — matches OpenAI-compatible API style
    if (req.method !== "POST") {
      return json(res, 405, { error: "method not allowed" });
    }

    const body = await readBody(req);

    // Proxy to DeepSeek, preserving the path
    const result = await proxyToDeepSeek("POST", req.url, body);

    if (result.stream) {
      // Pass through streaming response
      res.writeHead(result.status, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      for await (const chunk of result.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(result.body);
    }
  } catch (err) {
    console.error("request error:", err);
    json(res, 502, { error: err.message });
  }
}).listen(PORT, () => console.log(`deepseek-api-proxy :${PORT}`));
