const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { startServer, handleRequest } = require("../server");
const { openMemoryDatabase } = require("../lib/db");
const { parseMoney, normalizeWhatsapp } = require("../lib/validate");

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taldo-crm-"));
  const started = await startServer({ dbPath: path.join(dir, "test.sqlite"), port: 0 });
  try {
    await fn(started);
  } finally {
    await started.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function request(base, urlPath, options = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) body = response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  return { status: response.status, body };
}

test("telefone brasileiro e valores em reais", () => {
  assert.equal(normalizeWhatsapp("(11) 98888-7777"), "5511988887777");
  assert.equal(normalizeWhatsapp("+55 11 98888-7777"), "5511988887777");
  assert.equal(normalizeWhatsapp("011988887777"), "5511988887777");
  assert.equal(parseMoney("180,50"), 18050);
  assert.equal(parseMoney("1.234,56"), 123456);
  assert.equal(parseMoney("R$ 180"), 18000);
  assert.equal(parseMoney(12.5), 1250);
  assert.throws(() => parseMoney("abc"), /Valor inválido/);
  assert.throws(() => normalizeWhatsapp("123"), /não parece válido/);
});

test("a interface fala português", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /lang="pt-BR"/);
  assert.match(app, /Sobre a conversa/);
  assert.match(app, /Abrir WhatsApp/);
  assert.match(app, /Adicionar orçamento/);
  assert.match(app, /wa\.me/);
});

test("cadastra cliente, orçamento e mantém os dados depois de reiniciar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taldo-crm-"));
  const dbPath = path.join(dir, "persist.sqlite");
  const first = await startServer({ dbPath, port: 0 });
  const base = `http://127.0.0.1:${first.port}`;
  try {
    const missing = await request(base, "/api/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Ana", whatsapp: "11988887777", note: "   " }),
    });
    assert.equal(missing.status, 400);

    const created = await request(base, "/api/clients", {
      method: "POST",
      body: JSON.stringify({
        name: "  Marina Costa ",
        whatsapp: "11988887777",
        note: "Boneco do Thor, 18 cm, presente",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, "Marina Costa");
    assert.equal(created.body.whatsapp, "5511988887777");
    assert.match(created.body.whatsappUrl, /^https:\/\/wa\.me\/5511988887777\?text=/);
    assert.match(decodeURIComponent(created.body.whatsappUrl), /Boneco do Thor/);

    const quote = await request(base, `/api/clients/${created.body.id}/quotes`, {
      method: "POST",
      body: JSON.stringify({ title: "Thor 18 cm", value: "180,50", status: "enviado" }),
    });
    assert.equal(quote.status, 201);
    assert.equal(quote.body.valueLabel, "R$ 180,50");
    assert.equal(quote.body.status, "enviado");

    const approved = await request(base, `/api/quotes/${quote.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "aprovado" }),
    });
    assert.equal(approved.body.statusLabel, "Aprovado");
  } finally {
    await first.close();
  }

  const second = await startServer({ dbPath, port: 0 });
  try {
    const listed = await request(`http://127.0.0.1:${second.port}`, "/api/clients");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.clients.length, 1);
    assert.equal(listed.body.clients[0].note, "Boneco do Thor, 18 cm, presente");
    assert.equal(listed.body.clients[0].quotes[0].status, "aprovado");
    assert.equal(listed.body.summary.approvedValueLabel, "R$ 180,50");
    assert.equal(listed.body.summary.openQuotes, 0);
    assert.equal(listed.body.storage.persistent, true);
    assert.equal(listed.body.storage.mode, "sqlite");
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("busca, edição, orçamento inválido e exclusão em cascata", async () => {
  await withServer(async ({ port }) => {
    const base = `http://127.0.0.1:${port}`;
    const marina = await request(base, "/api/clients", {
      method: "POST",
      body: JSON.stringify({ name: "João Lima", whatsapp: "11911112222", note: "Chaveiro do estádio" }),
    });
    const paula = await request(base, "/api/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Paula Nunes", whatsapp: "21933334444", note: "Relógio personalizado" }),
    });
    await request(base, `/api/clients/${paula.body.id}/quotes`, {
      method: "POST",
      body: JSON.stringify({ title: "Relógio Ferrari", value: "90" }),
    });

    const search = await request(base, "/api/clients?q=" + encodeURIComponent("estádio"));
    assert.equal(search.body.clients.length, 1);
    assert.equal(search.body.clients[0].name, "João Lima");
    assert.equal(search.body.summary.clients, 2);

    const folded = await request(base, "/api/clients?q=joao");
    assert.equal(folded.body.clients[0].id, marina.body.id);

    const updated = await request(base, `/api/clients/${marina.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: "Chaveiro do Morumbi, 20 unidades" }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.note, "Chaveiro do Morumbi, 20 unidades");

    const badStatus = await request(base, `/api/clients/${marina.body.id}/quotes`, {
      method: "POST",
      body: JSON.stringify({ title: "Lote", value: "10", status: "pago" }),
    });
    assert.equal(badStatus.status, 400);

    const quote = await request(base, `/api/clients/${marina.body.id}/quotes`, {
      method: "POST",
      body: JSON.stringify({ title: "Lote de chaveiros", value: "1.200,00", status: "rascunho" }),
    });
    assert.equal(quote.body.valueCents, 120000);

    const removed = await request(base, `/api/clients/${marina.body.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const gone = await request(base, `/api/clients/${marina.body.id}`);
    assert.equal(gone.status, 404);
    const quoteGone = await request(base, `/api/quotes/${quote.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "aprovado" }),
    });
    assert.equal(quoteGone.status, 404);

    const page = await request(base, "/");
    assert.equal(page.status, 200);
    assert.match(page.body, /CRM de conversas/);
  });
});

test("sem arquivo sqlite o painel responde e avisa que não grava", async () => {
  const first = await startServer({ memory: true, port: 0 });
  const base = `http://127.0.0.1:${first.port}`;
  try {
    const created = await request(base, "/api/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Marina Costa", whatsapp: "11988887777", note: "Boneco do Thor" }),
    });
    assert.equal(created.status, 201);
    const quote = await request(base, `/api/clients/${created.body.id}/quotes`, {
      method: "POST",
      body: JSON.stringify({ title: "Thor 18 cm", value: "180,50", status: "enviado" }),
    });
    assert.equal(quote.status, 201);
    const listed = await request(base, "/api/clients");
    assert.equal(listed.body.clients.length, 1);
    assert.equal(listed.body.storage.persistent, false);
    assert.equal(listed.body.storage.mode, "memory");
    assert.match(listed.body.storage.message, /não guarda o SQLite/);
    const health = await request(base, "/api/health");
    assert.equal(health.body.ok, true);
    assert.equal(health.body.storage.persistent, false);
  } finally {
    await first.close();
  }

  const second = await startServer({ memory: true, port: 0 });
  try {
    const listed = await request(`http://127.0.0.1:${second.port}`, "/api/clients");
    assert.equal(listed.body.clients.length, 0);
  } finally {
    await second.close();
  }
});

test("a função web entrega o painel e grava na memória da instância", async () => {
  const db = openMemoryDatabase();
  const page = await handleRequest(new Request("http://127.0.0.1/"), db);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /CRM de conversas/);

  const created = await handleRequest(
    new Request("http://127.0.0.1/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Marina Costa", whatsapp: "11988887777", note: "Boneco do Thor" }),
    }),
    db,
  );
  assert.equal(created.status, 201);
  const client = await created.json();
  assert.equal(client.whatsapp, "5511988887777");

  const styles = await handleRequest(new Request("http://127.0.0.1/styles.css"), db);
  assert.equal(styles.status, 200);
  assert.match(await styles.text(), /--ink/);
  const script = await handleRequest(new Request("http://127.0.0.1/app.js"), db);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /Abrir WhatsApp/);
});

test("importar o servidor não escuta nem carrega node:sqlite", async () => {
  const { spawnSync } = require("node:child_process");
  const script = `
    const Module = require("node:module");
    const original = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === "node:sqlite") {
        const error = new Error("node:sqlite blocked");
        error.code = "ERR_UNKNOWN_BUILTIN_MODULE";
        throw error;
      }
      return original.apply(this, arguments);
    };
    const { GET, POST, PATCH, DELETE } = require("./server.js");
    if (typeof GET !== "function" || typeof POST !== "function" || typeof PATCH !== "function" || typeof DELETE !== "function") {
      process.exit(2);
    }
    const listening = process._getActiveHandles().filter((handle) => handle && handle.listening);
    if (listening.length) process.exit(3);
    (async () => {
      const page = await GET(new Request("http://127.0.0.1/"));
      const html = await page.text();
      if (page.status !== 200 || !html.includes("CRM de conversas") || !html.includes("lang=\\"pt-BR\\"")) process.exit(4);
      const created = await POST(new Request("http://127.0.0.1/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Marina", whatsapp: "11988887777", note: "Boneco do Thor" }),
      }));
      if (created.status !== 201) process.exit(5);
      const listed = await GET(new Request("http://127.0.0.1/api/clients"));
      const body = await listed.json();
      if (body.storage.persistent !== false || body.clients.length !== 1) process.exit(6);
      if (!String(body.storage.message).includes("não guarda o SQLite")) process.exit(7);
      const quote = await POST(new Request("http://127.0.0.1/api/clients/" + body.clients[0].id + "/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Thor", value: "10", status: "rascunho" }),
      }));
      if (quote.status !== 201) process.exit(8);
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
