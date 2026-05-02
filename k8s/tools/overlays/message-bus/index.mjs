import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DATA_DIR = process.env.DATA_DIR || "/tmp/messages";
const PORT = parseInt(process.env.PORT || "8080", 10);

// Use the pod hostname as default agent identity (namespace-scoped)
const AGENT_ID = process.env.AGENT_ID || os.hostname().split("-")[0] || "agent";

fs.mkdirSync(DATA_DIR, { recursive: true });

function lockFile() {
  return path.join(DATA_DIR, `lock`);
}

function acquireLock(retries = 10, delay = 50) {
  const lf = lockFile();
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

function releaseLock() {
  try {
    fs.unlinkSync(lockFile());
  } catch {}
}

function readStore(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeStore(name, data) {
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
}

function readConfig() {
  const file = path.join(DATA_DIR, `config.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  const file = path.join(DATA_DIR, `config.json`);
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
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

    // POST /send — send a message to this agent's inbox
    if (req.method === "POST" && parts[0] === "send") {
      const msg = await readBody(req);
      if (!acquireLock()) {
        return json(res, 503, { ok: false, error: "busy" });
      }
      try {
        msgCounter++;
        const entry = {
          id: `${Date.now()}-${msgCounter}`,
          from: msg.from || "unknown",
          subject: msg.subject || "",
          body: msg.body || "",
          ttlMinutes: msg.ttlMinutes || 60,
          timestamp: new Date().toISOString(),
        };
        const inbox = readStore("inbox");
        inbox.push(entry);
        writeStore("inbox", inbox);
        return json(res, 200, { ok: true, id: entry.id });
      } finally {
        releaseLock();
      }
    }

    // GET /inbox — check this agent's inbox
    if (req.method === "GET" && parts[0] === "inbox" && !parts[1]) {
      if (!acquireLock()) {
        return json(res, 503, { ok: false, error: "busy" });
      }
      try {
        let inbox = readStore("inbox");
        const before = inbox.length;
        inbox = pruneExpired(inbox, 60 * 60 * 1000);
        if (inbox.length < before) writeStore("inbox", inbox);

        const ackId = url.searchParams.get("ack");
        if (ackId) {
          const remaining = inbox.filter((m) => m.id !== ackId);
          writeStore("inbox", remaining);
          return json(res, 200, {
            ok: true,
            acknowledged: ackId,
            remaining: remaining.length,
          });
        }

        return json(res, 200, { ok: true, messages: inbox });
      } finally {
        releaseLock();
      }
    }

    // GET /config — retrieve this agent's stored config
    if (req.method === "GET" && parts[0] === "config" && !parts[1]) {
      return json(res, 200, { ok: true, config: readConfig() });
    }

    // POST /config — store/merge config for this agent
    if (req.method === "POST" && parts[0] === "config" && !parts[1]) {
      if (!acquireLock()) {
        return json(res, 503, { ok: false, error: "busy" });
      }
      try {
        const update = await readBody(req);
        const config = readConfig();
        Object.assign(config, update);
        writeConfig(config);
        return json(res, 200, { ok: true, config });
      } finally {
        releaseLock();
      }
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    console.error("request error:", err);
    json(res, 500, { ok: false, error: err.message });
  }
}).listen(PORT, () => console.log(`agent-message-bus :${PORT} (agent: ${AGENT_ID})`));
