const fs = require("node:fs");
const path = require("node:path");
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

const EPHEMERAL_MESSAGE =
  "O servidor deste endereço não guarda o SQLite. O painel funciona, mas clientes e orçamentos somem quando ele reinicia.";

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

const SQL = {
  listClients: "SELECT * FROM clients ORDER BY updated_at DESC, id DESC",
  listQuotes: "SELECT * FROM quotes ORDER BY created_at DESC, id DESC",
  getClient: "SELECT * FROM clients WHERE id = ?",
  quotesForClient: "SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC, id DESC",
  siblings: "SELECT id, name, whatsapp FROM clients WHERE whatsapp = ?",
  insertClient:
    "INSERT INTO clients (name, whatsapp, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
  updateClient: "UPDATE clients SET name = ?, whatsapp = ?, note = ?, updated_at = ? WHERE id = ?",
  deleteClient: "DELETE FROM clients WHERE id = ?",
  deleteQuotesForClient: "DELETE FROM quotes WHERE client_id = ?",
  clientExists: "SELECT id FROM clients WHERE id = ?",
  insertQuote:
    "INSERT INTO quotes (client_id, title, value_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
  touchClient: "UPDATE clients SET updated_at = ? WHERE id = ?",
  getQuote: "SELECT * FROM quotes WHERE id = ?",
  updateQuote: "UPDATE quotes SET title = ?, value_cents = ?, status = ?, updated_at = ? WHERE id = ?",
  quoteClient: "SELECT client_id FROM quotes WHERE id = ?",
  deleteQuote: "DELETE FROM quotes WHERE id = ?",
};

function storageInfo(kind, persistent) {
  if (persistent) return { mode: kind, persistent: true };
  return { mode: kind, persistent: false, message: EPHEMERAL_MESSAGE };
}

function loadDatabaseSync() {
  // Keep this require out of module startup. A literal node:sqlite import
  // crashes the published function before it can answer.
  const builtin = ["node", "sqlite"].join(":");
  return require(builtin).DatabaseSync;
}

function openDatabase(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new (loadDatabaseSync())(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 3000");
  if (dbPath !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return wrapSqlite(db, dbPath !== ":memory:");
}

function wrapSqlite(db, persistent) {
  return {
    kind: "sqlite",
    storage() {
      return storageInfo("sqlite", persistent);
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },
    async run(sql, params = []) {
      const info = db.prepare(sql).run(...params);
      return { changes: Number(info.changes) };
    },
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        const result = await fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* the original error is the one to surface */
        }
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

function byUpdatedDesc(a, b) {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
  return b.id - a.id;
}

function byCreatedDesc(a, b) {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return b.id - a.id;
}

function openMemoryDatabase() {
  const clients = [];
  const quotes = [];
  let nextClientId = 1;
  let nextQuoteId = 1;

  function clone(row) {
    return { ...row };
  }

  const driver = {
    kind: "memory",
    storage() {
      return storageInfo("memory", false);
    },
    async all(sql, params = []) {
      if (sql === SQL.listClients) return clients.slice().sort(byUpdatedDesc).map(clone);
      if (sql === SQL.listQuotes) return quotes.slice().sort(byCreatedDesc).map(clone);
      if (sql === SQL.quotesForClient) {
        return quotes
          .filter((quote) => quote.client_id === Number(params[0]))
          .sort(byCreatedDesc)
          .map(clone);
      }
      if (sql === SQL.siblings) {
        return clients
          .filter((client) => client.whatsapp === params[0])
          .map((client) => ({ id: client.id, name: client.name, whatsapp: client.whatsapp }));
      }
      throw new Error("Consulta não suportada na memória.");
    },
    async get(sql, params = []) {
      if (sql === SQL.getClient || sql === SQL.clientExists) {
        const row = clients.find((client) => client.id === Number(params[0]));
        if (!row) return null;
        return sql === SQL.clientExists ? { id: row.id } : clone(row);
      }
      if (sql === SQL.getQuote || sql === SQL.quoteClient) {
        const row = quotes.find((quote) => quote.id === Number(params[0]));
        if (!row) return null;
        return sql === SQL.quoteClient ? { client_id: row.client_id } : clone(row);
      }
      if (sql === SQL.insertClient) {
        const row = {
          id: nextClientId++,
          name: params[0],
          whatsapp: params[1],
          note: params[2],
          created_at: params[3],
          updated_at: params[4],
        };
        clients.push(row);
        return clone(row);
      }
      if (sql === SQL.insertQuote) {
        const row = {
          id: nextQuoteId++,
          client_id: Number(params[0]),
          title: params[1],
          value_cents: Number(params[2]),
          status: params[3],
          created_at: params[4],
          updated_at: params[5],
        };
        quotes.push(row);
        return clone(row);
      }
      throw new Error("Consulta não suportada na memória.");
    },
    async run(sql, params = []) {
      if (sql === SQL.updateClient) {
        const row = clients.find((client) => client.id === Number(params[4]));
        if (!row) return { changes: 0 };
        row.name = params[0];
        row.whatsapp = params[1];
        row.note = params[2];
        row.updated_at = params[3];
        return { changes: 1 };
      }
      if (sql === SQL.touchClient) {
        const row = clients.find((client) => client.id === Number(params[1]));
        if (!row) return { changes: 0 };
        row.updated_at = params[0];
        return { changes: 1 };
      }
      if (sql === SQL.updateQuote) {
        const row = quotes.find((quote) => quote.id === Number(params[4]));
        if (!row) return { changes: 0 };
        row.title = params[0];
        row.value_cents = Number(params[1]);
        row.status = params[2];
        row.updated_at = params[3];
        return { changes: 1 };
      }
      if (sql === SQL.deleteQuotesForClient) {
        const before = quotes.length;
        for (let index = quotes.length - 1; index >= 0; index -= 1) {
          if (quotes[index].client_id === Number(params[0])) quotes.splice(index, 1);
        }
        return { changes: before - quotes.length };
      }
      if (sql === SQL.deleteClient) {
        const index = clients.findIndex((client) => client.id === Number(params[0]));
        if (index < 0) return { changes: 0 };
        clients.splice(index, 1);
        return { changes: 1 };
      }
      if (sql === SQL.deleteQuote) {
        const index = quotes.findIndex((quote) => quote.id === Number(params[0]));
        if (index < 0) return { changes: 0 };
        quotes.splice(index, 1);
        return { changes: 1 };
      }
      throw new Error("Consulta não suportada na memória.");
    },
    async transaction(fn) {
      const snapshot = {
        clients: structuredClone(clients),
        quotes: structuredClone(quotes),
        nextClientId,
        nextQuoteId,
      };
      try {
        return await fn();
      } catch (error) {
        clients.splice(0, clients.length, ...snapshot.clients);
        quotes.splice(0, quotes.length, ...snapshot.quotes);
        nextClientId = snapshot.nextClientId;
        nextQuoteId = snapshot.nextQuoteId;
        throw error;
      }
    },
    close() {},
  };
  return driver;
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

async function allClients(db) {
  const rows = await db.all(SQL.listClients);
  const quotes = await db.all(SQL.listQuotes);
  const byClient = new Map();
  for (const quote of quotes) {
    const key = Number(quote.client_id);
    const list = byClient.get(key);
    if (list) list.push(quote);
    else byClient.set(key, [quote]);
  }
  return rows.map((row) => mapClient(row, byClient.get(Number(row.id)) || [], rows));
}

async function listClients(db, query = "") {
  const clients = await allClients(db);
  return {
    summary: summarize(clients),
    storage: db.storage(),
    clients: query.trim() ? clients.filter((client) => matches(client, query)) : clients,
  };
}

async function getClient(db, id) {
  const row = await db.get(SQL.getClient, [id]);
  if (!row) return null;
  const quotes = await db.all(SQL.quotesForClient, [id]);
  const siblings = await db.all(SQL.siblings, [row.whatsapp]);
  return mapClient(row, quotes, siblings);
}

async function requireClient(db, id) {
  const client = await getClient(db, id);
  if (!client) {
    const error = new Error("Cliente não encontrado.");
    error.status = 404;
    throw error;
  }
  return client;
}

async function createClient(db, input) {
  const name = cleanName(input.name);
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  const note = cleanNote(input.note);
  const timestamp = new Date().toISOString();
  const row = await db.get(SQL.insertClient, [name, whatsapp, note, timestamp, timestamp]);
  return getClient(db, Number(row.id));
}

async function updateClient(db, id, input) {
  const current = await db.get(SQL.getClient, [id]);
  if (!current) return null;
  const hasName = Object.prototype.hasOwnProperty.call(input, "name");
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(input, "whatsapp");
  const hasNote = Object.prototype.hasOwnProperty.call(input, "note");
  if (!hasName && !hasWhatsapp && !hasNote) throw fail("Nada para atualizar.");

  const name = hasName ? cleanName(input.name) : current.name;
  const whatsapp = hasWhatsapp ? normalizeWhatsapp(input.whatsapp) : current.whatsapp;
  const note = hasNote ? cleanNote(input.note) : current.note;
  const timestamp = new Date().toISOString();
  await db.run(SQL.updateClient, [name, whatsapp, note, timestamp, id]);
  return getClient(db, id);
}

async function deleteClient(db, id) {
  return db.transaction(async () => {
    await db.run(SQL.deleteQuotesForClient, [id]);
    const info = await db.run(SQL.deleteClient, [id]);
    return info.changes > 0;
  });
}

async function getQuote(db, id) {
  const row = await db.get(SQL.getQuote, [id]);
  return row ? mapQuote(row) : null;
}

async function createQuote(db, clientId, input) {
  if (!(await db.get(SQL.clientExists, [clientId]))) return null;
  const title = cleanTitle(input.title);
  const valueCents = parseMoney(input.value);
  const status = input.status == null || input.status === "" ? "rascunho" : cleanStatus(input.status);
  const timestamp = new Date().toISOString();
  return db.transaction(async () => {
    const row = await db.get(SQL.insertQuote, [clientId, title, valueCents, status, timestamp, timestamp]);
    await db.run(SQL.touchClient, [timestamp, clientId]);
    return mapQuote(row);
  });
}

async function updateQuote(db, id, input) {
  const current = await db.get(SQL.getQuote, [id]);
  if (!current) return null;
  const hasTitle = Object.prototype.hasOwnProperty.call(input, "title");
  const hasValue = Object.prototype.hasOwnProperty.call(input, "value");
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");
  if (!hasTitle && !hasValue && !hasStatus) throw fail("Nada para atualizar.");

  const title = hasTitle ? cleanTitle(input.title) : current.title;
  const valueCents = hasValue ? parseMoney(input.value) : Number(current.value_cents);
  const status = hasStatus ? cleanStatus(input.status) : current.status;
  const timestamp = new Date().toISOString();
  return db.transaction(async () => {
    await db.run(SQL.updateQuote, [title, valueCents, status, timestamp, id]);
    await db.run(SQL.touchClient, [timestamp, current.client_id]);
    return getQuote(db, id);
  });
}

async function deleteQuote(db, id) {
  const current = await db.get(SQL.quoteClient, [id]);
  if (!current) return false;
  const timestamp = new Date().toISOString();
  return db.transaction(async () => {
    await db.run(SQL.deleteQuote, [id]);
    await db.run(SQL.touchClient, [timestamp, current.client_id]);
    return true;
  });
}

module.exports = {
  EPHEMERAL_MESSAGE,
  openDatabase,
  openMemoryDatabase,
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
