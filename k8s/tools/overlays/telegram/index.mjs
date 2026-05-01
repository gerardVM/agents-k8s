import http from "node:http";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const UPSTREAM = `https://api.telegram.org/bot${TOKEN}`;

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

  // Proxy: POST /bot<token>/<method> -> api.telegram.org/bot<TOKEN>/<method>
  if (req.method === "POST" && req.url.startsWith("/bot")) {
    const rest = req.url.slice(4);  // remove "/bot"
    if (!rest) return json(res, 400, { ok: false, error: "missing method" });

    const method = rest.includes("/") ? rest.split("/").slice(1).join("/") : rest;

    try {
      const body = await readBody(req);
      const upstream = await fetch(`${UPSTREAM}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await upstream.json();
      json(res, upstream.status, data);
    } catch (err) {
      console.error(`proxy /bot/${method}:`, err);
      json(res, 502, { ok: false, error: "upstream_unreachable" });
    }
    return;
  }

  json(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, () => console.log(`telegram proxy :${PORT}`));
