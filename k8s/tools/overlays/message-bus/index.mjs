import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "/tmp/messages";
const PORT = parseInt(process.env.PORT || "8080", 10);

fs.mkdirSync(DATA_DIR, { recursive: true });

function lockFile(agentId) {
  return path.join(DATA_DIR, `${agentId}.lock`);
}

function acquireLock(agentId, retries = 10, delay = 50) {
  const lf = lockFile(agentId);
  for (let i = 0; i < retries; i++) {
    try {
      const fd = fs.openSync(lf, "wx");
      fs.closeSync(fd);
      return true;
    } catch {
      if (i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {}
      }
    }
  }
  return false;
}

function releaseLock(agentId) {
  try {
    fs.unlinkSync(lockFile(agentId));
  } catch {}
}

function readInbox(agentId) {
  const file = path.join(DATA_DIR, `${agentId}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeInbox(agentId, messages) {
  const file = path.join(DATA_DIR, `${agentId}.json`);
  fs.writeFileSync(file, JSON.stringify(messages));
}

function pruneExpired(messages, ttlMs) {
  if (!ttlMs) return messages;
  const cutoff = Date.now() - ttlMs;
  return messages.filter((m) => new Date(m.timestamp).getTime() > cutoff);
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

let msgCounter = 0;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.url === "/healthz" || req.url === "/readyz") {
      return json(res, 200, { ok: true });
    }

    // POST /send
    if (req.method === "POST" && parts[0] === "send") {
      const msg = await readBody(req);
      if (!msg.to || !msg.from) {
        return json(res, 400, { ok: false, error: "to and from are required" });
      }
      if (!acquireLock(msg.to)) {
        return json(res, 503, { ok: false, error: "inbox busy" });
      }
      try {
        msgCounter++;
        const entry = {
          id: `${Date.now()}-${msgCounter}`,
          to: msg.to,
          from: msg.from,
          subject: msg.subject || "",
          body: msg.body || "",
          ttlMinutes: msg.ttlMinutes || 60,
          timestamp: new Date().toISOString(),
        };
        const inbox = readInbox(msg.to);
        inbox.push(entry);
        writeInbox(msg.to, inbox);
        return json(res, 200, { ok: true, id: entry.id });
      } finally {
        releaseLock(msg.to);
      }
    }

    // GET /config/<agentId> — retrieve agent config
    if (req.method === "GET" && parts[0] === "config" && parts[1]) {
      const agentId = parts[1];
      const file = path.join(DATA_DIR, `${agentId}-config.json`);
      try {
        const config = JSON.parse(fs.readFileSync(file, "utf8"));
        return json(res, 200, { ok: true, config });
      } catch {
        return json(res, 200, { ok: true, config: {} });
      }
    }

    // POST /config/<agentId> — store/merge agent config
    if (req.method === "POST" && parts[0] === "config" && parts[1]) {
      const agentId = parts[1];
      if (!acquireLock(agentId)) {
        return json(res, 503, { ok: false, error: "busy" });
      }
      try {
        const update = await readBody(req);
        const file = path.join(DATA_DIR, `${agentId}-config.json`);
        let config = {};
        try {
          config = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {}
        Object.assign(config, update);
        fs.writeFileSync(file, JSON.stringify(config, null, 2));
        return json(res, 200, { ok: true, config });
      } finally {
        releaseLock(agentId);
      }
    }

    // GET /inbox/<agentId>
    if (req.method === "GET" && parts[0] === "inbox" && parts[1]) {
      const agentId = parts[1];
      if (!acquireLock(agentId)) {
        return json(res, 503, { ok: false, error: "inbox busy" });
      }
      try {
        let inbox = readInbox(agentId);
        const before = inbox.length;
        inbox = pruneExpired(inbox, 60 * 60 * 1000);
        if (inbox.length < before) writeInbox(agentId, inbox);

        const ackId = url.searchParams.get("ack");
        if (ackId) {
          const remaining = inbox.filter((m) => m.id !== ackId);
          writeInbox(agentId, remaining);
          return json(res, 200, {
            ok: true,
            acknowledged: ackId,
            remaining: remaining.length,
          });
        }

        return json(res, 200, { ok: true, messages: inbox });
      } finally {
        releaseLock(agentId);
      }
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    console.error("request error:", err);
    json(res, 500, { ok: false, error: err.message });
  }
}).listen(PORT, () => console.log(`agent-message-bus :${PORT}`));
