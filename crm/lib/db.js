const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  STATUS_LABELS,
  fail,
  cleanName,
  cleanNote,
  cleanTitle,
  cleanStatus,
  normalizeWhatsapp,
  displayWhatsapp,
  whatsappUrl,
  parseMoney,
  formatCentsLabel,
  formatCentsInput,
  fold,
} = require("./validate");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  value_cents INTEGER NOT NULL CHECK (value_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'recusado')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_whatsapp ON clients(whatsapp);
`;

function openDatabase(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 3000");
  if (dbPath !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

function mapQuote(row) {
  const valueCents = Number(row.value_cents);
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    title: row.title,
    valueCents,
    valueLabel: formatCentsLabel(valueCents),
    valueInput: formatCentsInput(valueCents),
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClient(row, quotes, siblings) {
  return {
    id: Number(row.id),
    name: row.name,
    whatsapp: row.whatsapp,
    whatsappDisplay: displayWhatsapp(row.whatsapp),
    whatsappUrl: whatsappUrl(row.whatsapp, row.name, row.note),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sharedWith: siblings
      .filter((other) => Number(other.id) !== Number(row.id) && other.whatsapp === row.whatsapp)
      .map((other) => ({ id: Number(other.id), name: other.name })),
    quotes: quotes.map(mapQuote),
  };
}

function summarize(clients) {
  let quotes = 0;
  let openQuotes = 0;
  let approvedCents = 0;
  for (const client of clients) {
    for (const quote of client.quotes) {
      quotes += 1;
      if (quote.status === "rascunho" || quote.status === "enviado") openQuotes += 1;
      if (quote.status === "aprovado") approvedCents += quote.valueCents;
    }
  }
  return {
    clients: clients.length,
    quotes,
    openQuotes,
    approvedValueLabel: formatCentsLabel(approvedCents),
  };
}

function matches(client, query) {
  const needle = fold(query.trim());
  if (!needle) return true;
  const haystack = fold(
    [
      client.name,
      client.whatsapp,
      client.whatsappDisplay,
      client.note,
      ...client.quotes.flatMap((quote) => [quote.title, quote.status, quote.statusLabel, quote.valueLabel]),
    ].join("\n"),
  );
  return haystack.includes(needle);
}

function allClients(db) {
  const rows = db.prepare("SELECT * FROM clients ORDER BY updated_at DESC, id DESC").all();
  const quotes = db.prepare("SELECT * FROM quotes ORDER BY created_at DESC, id DESC").all();
  const byClient = new Map();
  for (const quote of quotes) {
    const key = Number(quote.client_id);
    const list = byClient.get(key);
    if (list) list.push(quote);
    else byClient.set(key, [quote]);
  }
  return rows.map((row) => mapClient(row, byClient.get(Number(row.id)) || [], rows));
}

function listClients(db, query = "") {
  const clients = allClients(db);
  return {
    summary: summarize(clients),
    clients: query.trim() ? clients.filter((client) => matches(client, query)) : clients,
  };
}

function getClient(db, id) {
  const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!row) return null;
  const quotes = db.prepare(
    "SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC, id DESC",
  ).all(id);
  const siblings = db.prepare("SELECT id, name, whatsapp FROM clients WHERE whatsapp = ?").all(row.whatsapp);
  return mapClient(row, quotes, siblings);
}

function requireClient(db, id) {
  const client = getClient(db, id);
  if (!client) {
    const error = new Error("Cliente não encontrado.");
    error.status = 404;
    throw error;
  }
  return client;
}

function createClient(db, input) {
  const name = cleanName(input.name);
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  const note = cleanNote(input.note);
  const timestamp = new Date().toISOString();
  const info = db.prepare(
    "INSERT INTO clients (name, whatsapp, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(name, whatsapp, note, timestamp, timestamp);
  return getClient(db, Number(info.lastInsertRowid));
}

function updateClient(db, id, input) {
  const current = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!current) return null;
  const hasName = Object.prototype.hasOwnProperty.call(input, "name");
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(input, "whatsapp");
  const hasNote = Object.prototype.hasOwnProperty.call(input, "note");
  if (!hasName && !hasWhatsapp && !hasNote) throw fail("Nada para atualizar.");

  const name = hasName ? cleanName(input.name) : current.name;
  const whatsapp = hasWhatsapp ? normalizeWhatsapp(input.whatsapp) : current.whatsapp;
  const note = hasNote ? cleanNote(input.note) : current.note;
  const timestamp = new Date().toISOString();
  db.prepare("UPDATE clients SET name = ?, whatsapp = ?, note = ?, updated_at = ? WHERE id = ?").run(
    name,
    whatsapp,
    note,
    timestamp,
    id,
  );
  return getClient(db, id);
}

function deleteClient(db, id) {
  const info = db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  return info.changes > 0;
}

function getQuote(db, id) {
  const row = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id);
  return row ? mapQuote(row) : null;
}

function createQuote(db, clientId, input) {
  if (!db.prepare("SELECT id FROM clients WHERE id = ?").get(clientId)) return null;
  const title = cleanTitle(input.title);
  const valueCents = parseMoney(input.value);
  const status = input.status == null || input.status === "" ? "rascunho" : cleanStatus(input.status);
  const timestamp = new Date().toISOString();
  db.exec("BEGIN");
  try {
    const info = db.prepare(
      `INSERT INTO quotes (client_id, title, value_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(clientId, title, valueCents, status, timestamp, timestamp);
    db.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").run(timestamp, clientId);
    db.exec("COMMIT");
    return getQuote(db, Number(info.lastInsertRowid));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function updateQuote(db, id, input) {
  const current = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id);
  if (!current) return null;
  const hasTitle = Object.prototype.hasOwnProperty.call(input, "title");
  const hasValue = Object.prototype.hasOwnProperty.call(input, "value");
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");
  if (!hasTitle && !hasValue && !hasStatus) throw fail("Nada para atualizar.");

  const title = hasTitle ? cleanTitle(input.title) : current.title;
  const valueCents = hasValue ? parseMoney(input.value) : Number(current.value_cents);
  const status = hasStatus ? cleanStatus(input.status) : current.status;
  const timestamp = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE quotes SET title = ?, value_cents = ?, status = ?, updated_at = ? WHERE id = ?",
    ).run(title, valueCents, status, timestamp, id);
    db.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").run(timestamp, current.client_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getQuote(db, id);
}

function deleteQuote(db, id) {
  const current = db.prepare("SELECT client_id FROM quotes WHERE id = ?").get(id);
  if (!current) return false;
  const timestamp = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
    db.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").run(timestamp, current.client_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}

module.exports = {
  openDatabase,
  listClients,
  getClient,
  requireClient,
  createClient,
  updateClient,
  deleteClient,
  createQuote,
  updateQuote,
  deleteQuote,
};
