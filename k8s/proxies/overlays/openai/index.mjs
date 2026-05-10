import http from "node:http";
import { Buffer } from "node:buffer";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("API_KEY environment variable is required");
  process.exit(1);
}

const UPSTREAM_BASE = process.env.UPSTREAM_BASE_URL || "https://api.openai.com";
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

/**
 * Parse a multipart/form-data body into fields and file parts.
 */
function parseMultipart(contentType, body) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundary) return null;
  const b = boundary[1] || boundary[2];
  const parts = body.split(`--${b}`);
  const result = {};
  for (const part of parts) {
    if (!part.trim() || part.trim() === "--") continue;
    const headerEnd = part.indexOf("

");
    if (headerEnd === -1) continue;
    const headersRaw = part.slice(0, headerEnd);
    const value = part.slice(headerEnd + 4);
    const nameMatch = headersRaw.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headersRaw.match(/filename="([^"]+)"/);
    if (filenameMatch) {
      result[name] = {
        value: value.replace(/
?
$/, ""),
        filename: filenameMatch[1],
        contentType: headersRaw.match(/Content-Type:\s*(\S+)/i)?.[1] || "application/octet-stream",
      };
    } else {
      result[name] = { value: value.replace(/
?
$/, "").trim() };
    }
  }
  return result;
}

/**
 * Encode a multipart body to forward to the upstream API.
 */
function buildMultipartBody(fields) {
  const boundary = "FormBoundary" + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [key, val] of Object.entries(fields)) {
    if (val.filename) {
      parts.push(
        `--${boundary}
` +
        `Content-Disposition: form-data; name="${key}"; filename="${val.filename}"
` +
        `Content-Type: ${val.contentType}

` +
        val.value
      );
    } else {
      parts.push(
        `--${boundary}
` +
        `Content-Disposition: form-data; name="${key}"

` +
        val.value
      );
    }
  }
  parts.push(`--${boundary}--`);
  return {
    body: parts.join("
"),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function proxyToUpstream(method, path, bodyRaw, contentType) {
  const url = `${UPSTREAM_BASE}${path}`;

  // For audio transcriptions, forward as multipart
  if (path.endsWith("/audio/transcriptions") && contentType?.startsWith("multipart/form-data")) {
    const parsed = parseMultipart(contentType, bodyRaw);
    if (!parsed) {
      return { status: 400, stream: false, body: JSON.stringify({ error: "invalid multipart" }) };
    }

    // Re-build the multipart body with the real API key for upstream
    const upstreamFields = {};
    for (const [key, val] of Object.entries(parsed)) {
      upstreamFields[key] = val;
    }

    const encoded = buildMultipartBody(upstreamFields);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": encoded.contentType,
      },
      body: encoded.body,
    });

    const contentType_resp = resp.headers.get("content-type") || "";
    if (contentType_resp.includes("text/event-stream") || contentType_resp.includes("application/x-ndjson")) {
      return { status: resp.status, stream: true, body: resp.body };
    }

    const data = await resp.text();
    return { status: resp.status, stream: false, body: data };
  }

  // Standard JSON proxy
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const opts = { method, headers };
  if (bodyRaw && !["GET", "HEAD"].includes(method)) {
    opts.body = bodyRaw;
  }

  const resp = await fetch(url, opts);
  const contentType_resp = resp.headers.get("content-type") || "";

  if (contentType_resp.includes("text/event-stream") || contentType_resp.includes("application/x-ndjson")) {
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

    const contentType = req.headers["content-type"] || "";
    const body = await readBody(req);

    // Proxy to upstream, preserving the path
    const result = await proxyToUpstream("POST", req.url, body, contentType);

    if (result.stream) {
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
      const respContentType = contentType.startsWith("multipart/form-data") && req.url.endsWith("/audio/transcriptions")
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      res.writeHead(result.status, respContentType);
      res.end(result.body);
    }
  } catch (err) {
    console.error("request error:", err);
    json(res, 502, { error: err.message });
  }
}).listen(PORT, () => console.log(`api-proxy :${PORT}`));
