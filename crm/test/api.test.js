const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { startServer } = require("../server");
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
