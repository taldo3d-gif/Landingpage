const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  openDatabase,
  listClients,
  requireClient,
  createClient,
  updateClient,
  deleteClient,
  createQuote,
  updateQuote,
  deleteQuote,
} = require("./lib/db");

const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_DB = path.join(__dirname, "data", "taldo.sqlite");
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const body = fs.readFileSync(filePath);
  const type = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > 65_536) {
        failed = true;
        reject(httpError(413, "Os dados enviados são grandes demais."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(httpError(400, "Envie um objeto JSON."));
          return;
        }
        resolve(parsed);
      } catch {
        reject(httpError(400, "Não entendi o JSON enviado."));
      }
    });
    req.on("error", () => {
      if (!failed) reject(httpError(400, "Falha ao ler os dados."));
    });
  });
}

function parseId(value) {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

async function handle(req, res, db) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  const staticName = STATIC_FILES.get(pathname);
  if (req.method === "GET" && staticName) {
    sendFile(res, path.join(PUBLIC_DIR, staticName));
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/clients" && req.method === "GET") {
    sendJson(res, 200, listClients(db, url.searchParams.get("q") || ""));
    return;
  }

  if (pathname === "/api/clients" && req.method === "POST") {
    sendJson(res, 201, createClient(db, await readJson(req)));
    return;
  }

  const clientMatch = pathname.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch) {
    const id = parseId(clientMatch[1]);
    if (!id) throw httpError(404, "Cliente não encontrado.");
    if (req.method === "GET") {
      sendJson(res, 200, requireClient(db, id));
      return;
    }
    if (req.method === "PATCH") {
      const updated = updateClient(db, id, await readJson(req));
      if (!updated) throw httpError(404, "Cliente não encontrado.");
      sendJson(res, 200, updated);
      return;
    }
    if (req.method === "DELETE") {
      if (!deleteClient(db, id)) throw httpError(404, "Cliente não encontrado.");
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  const quoteCreateMatch = pathname.match(/^\/api\/clients\/(\d+)\/quotes$/);
  if (quoteCreateMatch && req.method === "POST") {
    const id = parseId(quoteCreateMatch[1]);
    if (!id) throw httpError(404, "Cliente não encontrado.");
    const quote = createQuote(db, id, await readJson(req));
    if (!quote) throw httpError(404, "Cliente não encontrado.");
    sendJson(res, 201, quote);
    return;
  }

  const quoteMatch = pathname.match(/^\/api\/quotes\/(\d+)$/);
  if (quoteMatch) {
    const id = parseId(quoteMatch[1]);
    if (!id) throw httpError(404, "Orçamento não encontrado.");
    if (req.method === "PATCH") {
      const quote = updateQuote(db, id, await readJson(req));
      if (!quote) throw httpError(404, "Orçamento não encontrado.");
      sendJson(res, 200, quote);
      return;
    }
    if (req.method === "DELETE") {
      if (!deleteQuote(db, id)) throw httpError(404, "Orçamento não encontrado.");
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (pathname.startsWith("/api/")) throw httpError(404, "Não encontrado.");
  throw httpError(404, "Não encontrado.");
}

function startServer({ dbPath = DEFAULT_DB, host = "127.0.0.1", port = Number(process.env.PORT || 4173) } = {}) {
  const db = openDatabase(dbPath);
  const server = http.createServer((req, res) => {
    handle(req, res, db).catch((error) => {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      if (res.headersSent || res.destroyed) return;
      const message = status === 500 ? "Algo deu errado. Tente de novo." : error.message;
      sendJson(res, status, { error: message });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        db,
        host,
        port: address.port,
        close() {
          return new Promise((done, fail) => {
            server.close((error) => {
              try {
                db.close();
              } catch (closeError) {
                fail(closeError);
                return;
              }
              if (error) fail(error);
              else done();
            });
          });
        },
      });
    });
  });
}

if (require.main === module) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error(`O CRM precisa do Node.js 22.13 ou mais novo. Versão atual: ${process.versions.node}`);
    process.exit(1);
  }
  startServer()
    .then(({ host, port }) => {
      console.log(`CRM do Taldo Studio 3D em http://${host}:${port}`);
    })
    .catch((error) => {
      if (error.code === "EADDRINUSE") {
        console.error("Essa porta já está em uso. Feche o outro CRM ou rode PORT=4180 npm start");
      } else {
        console.error(error);
      }
      process.exit(1);
    });
}

module.exports = { startServer };
