const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  openDatabase,
  openMemoryDatabase,
  listClients,
  requireClient,
  createClient,
  updateClient,
  deleteClient,
  createQuote,
  updateQuote,
  deleteQuote,
} = require("./lib/db");

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
const CSP =
  "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
}

function readPublicFile(name) {
  if (name === "index.html") return fs.readFileSync(path.join(__dirname, "public", "index.html"));
  if (name === "styles.css") return fs.readFileSync(path.join(__dirname, "public", "styles.css"));
  if (name === "app.js") return fs.readFileSync(path.join(__dirname, "public", "app.js"));
  return null;
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

async function readWebBody(request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65_536) throw httpError(413, "Os dados enviados são grandes demais.");
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw httpError(400, "Envie um objeto JSON.");
    }
    return parsed;
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, "Não entendi o JSON enviado.");
  }
}

function parseId(value) {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function jsonResult(status, json) {
  return { type: "json", status, json };
}

async function dispatch(db, method, url, readBody) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/favicon.ico") return { type: "empty", status: 204 };

  const staticName = STATIC_FILES.get(pathname);
  if (method === "GET" && staticName) {
    const body = readPublicFile(staticName);
    if (!body) return jsonResult(404, { error: "Não encontrado." });
    return {
      type: "file",
      status: 200,
      body,
      contentType: CONTENT_TYPES[path.extname(staticName)] || "application/octet-stream",
    };
  }

  if (pathname === "/api/health" && method === "GET") {
    return jsonResult(200, { ok: true, storage: db.storage() });
  }

  if (pathname === "/api/clients" && method === "GET") {
    return jsonResult(200, await listClients(db, url.searchParams.get("q") || ""));
  }

  if (pathname === "/api/clients" && method === "POST") {
    return jsonResult(201, await createClient(db, await readBody()));
  }

  const clientMatch = pathname.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch) {
    const id = parseId(clientMatch[1]);
    if (!id) throw httpError(404, "Cliente não encontrado.");
    if (method === "GET") return jsonResult(200, await requireClient(db, id));
    if (method === "PATCH") {
      const updated = await updateClient(db, id, await readBody());
      if (!updated) throw httpError(404, "Cliente não encontrado.");
      return jsonResult(200, updated);
    }
    if (method === "DELETE") {
      if (!(await deleteClient(db, id))) throw httpError(404, "Cliente não encontrado.");
      return jsonResult(200, { ok: true });
    }
  }

  const quoteCreateMatch = pathname.match(/^\/api\/clients\/(\d+)\/quotes$/);
  if (quoteCreateMatch && method === "POST") {
    const id = parseId(quoteCreateMatch[1]);
    if (!id) throw httpError(404, "Cliente não encontrado.");
    const quote = await createQuote(db, id, await readBody());
    if (!quote) throw httpError(404, "Cliente não encontrado.");
    return jsonResult(201, quote);
  }

  const quoteMatch = pathname.match(/^\/api\/quotes\/(\d+)$/);
  if (quoteMatch) {
    const id = parseId(quoteMatch[1]);
    if (!id) throw httpError(404, "Orçamento não encontrado.");
    if (method === "PATCH") {
      const quote = await updateQuote(db, id, await readBody());
      if (!quote) throw httpError(404, "Orçamento não encontrado.");
      return jsonResult(200, quote);
    }
    if (method === "DELETE") {
      if (!(await deleteQuote(db, id))) throw httpError(404, "Orçamento não encontrado.");
      return jsonResult(200, { ok: true });
    }
  }

  throw httpError(404, "Não encontrado.");
}

function sendResult(res, result) {
  if (result.type === "empty") {
    res.writeHead(result.status, securityHeaders());
    res.end();
    return;
  }
  if (result.type === "file") {
    res.writeHead(result.status, {
      "Content-Type": result.contentType,
      "Content-Length": result.body.length,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": CSP,
      ...securityHeaders(),
    });
    res.end(result.body);
    return;
  }
  const payload = JSON.stringify(result.json);
  res.writeHead(result.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...securityHeaders(),
  });
  res.end(payload);
}

function resultToResponse(result) {
  if (result.type === "empty") {
    return new Response(null, { status: result.status, headers: securityHeaders() });
  }
  if (result.type === "file") {
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-cache",
        "Content-Security-Policy": CSP,
        ...securityHeaders(),
      },
    });
  }
  return new Response(JSON.stringify(result.json), {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
    },
  });
}

function errorResponse(error) {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  const message = status === 500 ? "Algo deu errado. Tente de novo." : error.message;
  return jsonResult(status, { error: message });
}

async function handleRequest(request, db) {
  const url = new URL(request.url);
  try {
    const result = await dispatch(db, request.method, url, () => readWebBody(request));
    return resultToResponse(result);
  } catch (error) {
    return resultToResponse(errorResponse(error));
  }
}

// The host imports this file and calls the web handlers. It has no durable
// SQLite file, and loading experimental node:sqlite crashes the function.
// `npm start` still opens crm/data/taldo.sqlite below.
let hostDb;
function hostDatabase() {
  if (!hostDb) hostDb = openMemoryDatabase();
  return hostDb;
}

function hostHandler(request) {
  return handleRequest(request, hostDatabase());
}

function startServer({
  dbPath = DEFAULT_DB,
  host = "127.0.0.1",
  port = Number(process.env.PORT || 4173),
  memory = false,
} = {}) {
  const db = memory ? openMemoryDatabase() : openDatabase(dbPath);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    dispatch(db, req.method, url, () => readJson(req))
      .then((result) => {
        if (res.headersSent || res.destroyed) return;
        sendResult(res, result);
      })
      .catch((error) => {
        if (res.headersSent || res.destroyed) return;
        sendResult(res, errorResponse(error));
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

module.exports = {
  startServer,
  handleRequest,
  GET: hostHandler,
  POST: hostHandler,
  PATCH: hostHandler,
  DELETE: hostHandler,
  fetch: hostHandler,
};
