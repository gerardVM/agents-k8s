import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "/tmp/messages";
const PORT = parseInt(process.env.PORT || "8080", 10);

fs.mkdirSync(DATA_DIR, { recursive: true });

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

    // POST /send — send a message to an agent
    // Body: { to: "agentId", from: "agentId", subject: "string", body: "any" }
    if (req.method === "POST" && parts[0] === "send") {
      const msg = await readBody(req);
      if (!msg.to || !msg.from) {
        return json(res, 400, { ok: false, error: "to and from are required" });
      }
      msgCounter++;
      const entry = {
        id: `${Date.now()}-${msgCounter}`,
        to: msg.to,
        from: msg.from,
        subject: msg.subject || "",
        body: msg.body || "",
        timestamp: new Date().toISOString(),
      };
      const inbox = readInbox(msg.to);
      inbox.push(entry);
      writeInbox(msg.to, inbox);
      return json(res, 200, { ok: true, id: entry.id });
    }

    // GET /inbox/<agentId> — poll for messages
    if (req.method === "GET" && parts[0] === "inbox" && parts[1]) {
      const agentId = parts[1];
      const inbox = readInbox(agentId);

      // ?ack=id — acknowledge/dequeue a specific message
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
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    console.error("request error:", err);
    json(res, 500, { ok: false, error: err.message });
  }
}).listen(PORT, () => console.log(`agent-message-bus :${PORT}`));