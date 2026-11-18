const STATUS = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

const main = document.querySelector("#main");
const statusNode = document.querySelector("#status");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search");

let dashboard = null;
let filter = "";
let searchSeq = 0;
let detailSeq = 0;
let searchTimer = 0;
let editingQuoteId = null;

function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function setStatus(message, isError) {
  statusNode.textContent = message || "";
  statusNode.classList.toggle("is-error", Boolean(isError));
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Não consegui falar com o CRM. Confira se ele está rodando.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function safeWhatsappUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "wa.me") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function nameLinks(people) {
  const nodes = [];
  people.forEach((person, index) => {
    if (index > 0) nodes.push(index === people.length - 1 ? " e " : ", ");
    nodes.push(h("a", { href: `#/cliente/${person.id}` }, person.name));
  });
  return nodes;
}

function sharedLine(client) {
  if (!client.sharedWith.length) return null;
  return h(
    "p",
    { class: "shared" },
    "Este WhatsApp também está na ficha de ",
    ...nameLinks(client.sharedWith),
    ".",
  );
}

function whatsappLink(client) {
  const href = safeWhatsappUrl(client.whatsappUrl);
  if (!href) return null;
  return h(
    "a",
    { class: "button button-whatsapp", href, target: "_blank", rel: "noopener noreferrer" },
    "Abrir WhatsApp",
  );
}

function renderStats(summary) {
  return h(
    "section",
    { class: "stats", "aria-label": "Resumo do estúdio" },
    h("article", { class: "stat" }, h("b", {}, String(summary.clients)), h("span", {}, "Clientes")),
    h("article", { class: "stat" }, h("b", {}, String(summary.openQuotes)), h("span", {}, "Orçamentos em aberto")),
    h("article", { class: "stat" }, h("b", {}, summary.approvedValueLabel), h("span", {}, "Valor aprovado")),
  );
}

function renderCard(client) {
  const quotes = client.quotes.length
    ? h(
        "ul",
        { class: "quote-list" },
        client.quotes.map((quote) =>
          h(
            "li",
            { class: "quote" },
            h("strong", {}, quote.title),
            h("span", { class: "money" }, quote.valueLabel),
            h("span", { class: `badge status-${quote.status}` }, quote.statusLabel),
          ),
        ),
      )
    : h("p", { class: "quiet" }, "Sem orçamento ainda.");

  return h(
    "article",
    { class: "client-card" },
    h(
      "div",
      { class: "card-top" },
      h(
        "div",
        {},
        h("h2", {}, h("a", { href: `#/cliente/${client.id}` }, client.name)),
        h("p", { class: "phone" }, client.whatsappDisplay),
      ),
      h("div", { class: "row-actions" }, whatsappLink(client), h("a", { class: "button button-ghost", href: `#/cliente/${client.id}` }, "Abrir ficha")),
    ),
    h("p", { class: "note" }, client.note),
    sharedLine(client),
    h("div", { class: "quote-block" }, h("h3", {}, "Orçamentos"), quotes),
    h("p", { class: "meta" }, `Atualizado em ${formatDate(client.updatedAt)}`),
  );
}

function renderDashboard() {
  main.replaceChildren();
  if (!dashboard || dashboard.summary.clients === 0) {
    main.append(
      h(
        "section",
        { class: "empty" },
        h("p", { class: "kicker" }, "Painel"),
        h("h2", {}, "Nenhum cliente ainda"),
        h(
          "p",
          {},
          "Cadastre o nome, o WhatsApp e uma frase sobre a conversa. Quando a pessoa chamar de novo, você sabe quem é e o que ficou combinado.",
        ),
        h("a", { class: "button button-primary", href: "#/novo" }, "Cadastrar o primeiro cliente"),
      ),
    );
    return;
  }

  const pieces = [renderStats(dashboard.summary)];
  if (filter.trim()) {
    pieces.push(
      h("p", { class: "filter-count" }, `Mostrando ${dashboard.clients.length} de ${dashboard.summary.clients} clientes.`),
    );
  }
  if (dashboard.clients.length === 0) {
    pieces.push(h("p", { class: "empty" }, "Nenhum cliente com essa busca."));
  } else {
    pieces.push(h("div", { class: "client-list" }, dashboard.clients.map(renderCard)));
  }
  main.append(...pieces);
}

function field(label, control, extra) {
  return h("label", { class: "field" }, h("span", { class: "field-head" }, label, extra || null), control);
}

function clientFields(client) {
  const name = h("input", {
    name: "name",
    required: "",
    maxlength: "80",
    autocomplete: "name",
    value: client?.name || "",
  });
  const whatsapp = h("input", {
    name: "whatsapp",
    required: "",
    maxlength: "32",
    inputmode: "tel",
    autocomplete: "tel",
    placeholder: "(11) 99999-9999",
    value: client?.whatsappDisplay || "",
  });
  const note = h("textarea", {
    name: "note",
    required: "",
    maxlength: "280",
    rows: "5",
  });
  note.placeholder = "Ex.: boneco do Thor, 18 cm, presente de aniversário";
  note.value = client?.note || "";
  const counter = h("span", { class: "counter" }, `${note.value.length}/280`);
  note.addEventListener("input", () => {
    counter.textContent = `${note.value.length}/280`;
  });
  return h(
    "div",
    { class: "stack" },
    field("Nome", name),
    field("WhatsApp", whatsapp),
    h("p", { class: "hint" }, "Pode digitar com DDD. O 55 do Brasil entra sozinho se faltar."),
    field("Sobre a conversa", note, counter),
  );
}

async function showNew() {
  document.body.dataset.view = "new";
  searchForm.hidden = true;
  document.title = "Novo cliente — CRM Taldo";
  setStatus("");
  const form = h("form", { class: "stack" });
  const button = h("button", { class: "button-primary", type: "submit" }, "Salvar cliente");
  form.append(clientFields(null), h("div", { class: "form-actions" }, button));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    const data = new FormData(form);
    try {
      const client = await api("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          whatsapp: data.get("whatsapp"),
          note: data.get("note"),
        }),
      });
      setStatus("Cliente salvo.");
      location.hash = `#/cliente/${client.id}`;
    } catch (error) {
      button.disabled = false;
      setStatus(error.message, true);
    }
  });
  main.replaceChildren(
    h(
      "section",
      { class: "panel" },
      h("p", { class: "kicker" }, "Novo cliente"),
      h("h2", {}, "Quem é essa pessoa?"),
      form,
    ),
  );
}

function statusSelect(quote, clientId) {
  const select = h("select", {
    class: `status-select status-${quote.status}`,
    "aria-label": `Situação de ${quote.title}`,
  });
  for (const [value, label] of Object.entries(STATUS)) {
    const option = h("option", { value }, label);
    if (value === quote.status) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", async () => {
    const previous = quote.status;
    select.disabled = true;
    select.className = `status-select status-${select.value}`;
    try {
      await api(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      setStatus("Situação atualizada.");
      await showDetail(clientId, { silent: true });
    } catch (error) {
      select.value = previous;
      select.className = `status-select status-${previous}`;
      select.disabled = false;
      setStatus(error.message, true);
    }
  });
  return select;
}

function renderQuote(quote, client) {
  if (editingQuoteId === quote.id) {
    const title = h("input", { value: quote.title, maxlength: "120", "aria-label": "Título do orçamento" });
    const value = h("input", {
      value: quote.valueInput,
      inputmode: "decimal",
      "aria-label": "Valor do orçamento",
    });
    const save = h("button", { type: "button", class: "button-primary" }, "Salvar");
    const cancel = h("button", { type: "button", class: "button-ghost" }, "Cancelar");
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api(`/api/quotes/${quote.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: title.value, value: value.value }),
        });
        editingQuoteId = null;
        setStatus("Orçamento atualizado.");
        await showDetail(client.id, { silent: true });
      } catch (error) {
        save.disabled = false;
        setStatus(error.message, true);
      }
    });
    cancel.addEventListener("click", () => {
      editingQuoteId = null;
      renderDetail(client);
    });
    return h(
      "li",
      { class: "quote quote-edit" },
      title,
      value,
      statusSelect(quote, client.id),
      h("div", { class: "row-actions" }, save, cancel),
    );
  }

  const edit = h("button", { type: "button", class: "button-ghost" }, "Editar");
  const remove = h("button", { type: "button", class: "button-danger" }, "Apagar");
  edit.addEventListener("click", () => {
    editingQuoteId = quote.id;
    renderDetail(client);
  });
  remove.addEventListener("click", async () => {
    if (remove.dataset.confirm !== "1") {
      remove.dataset.confirm = "1";
      remove.textContent = "Confirmar";
      return;
    }
    remove.disabled = true;
    try {
      await api(`/api/quotes/${quote.id}`, { method: "DELETE" });
      setStatus("Orçamento apagado.");
      await showDetail(client.id, { silent: true });
    } catch (error) {
      remove.disabled = false;
      setStatus(error.message, true);
    }
  });
  return h(
    "li",
    { class: "quote" },
    h("strong", {}, quote.title),
    h("span", { class: "money" }, quote.valueLabel),
    statusSelect(quote, client.id),
    h("div", { class: "row-actions" }, edit, remove),
  );
}

function renderDetail(client) {
  const form = h("form", { class: "stack" });
  const save = h("button", { class: "button-primary", type: "submit" }, "Salvar alterações");
  form.append(clientFields(client), h("div", { class: "form-actions" }, save, whatsappLink(client)));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    const data = new FormData(form);
    try {
      await api(`/api/clients/${client.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          whatsapp: data.get("whatsapp"),
          note: data.get("note"),
        }),
      });
      setStatus("Alterações salvas.");
      await showDetail(client.id, { silent: true });
    } catch (error) {
      save.disabled = false;
      setStatus(error.message, true);
    }
  });

  const confirmBox = h("div", { class: "confirm", hidden: "" });
  const ask = h("button", { type: "button", class: "button-danger" }, "Apagar cliente");
  const yes = h("button", { type: "button", class: "button-primary" }, "Apagar agora");
  const no = h("button", { type: "button", class: "button-ghost" }, "Cancelar");
  confirmBox.append(h("p", {}, "Apagar este cliente e todos os orçamentos dele?"), h("div", { class: "row-actions" }, yes, no));
  ask.addEventListener("click", () => {
    confirmBox.hidden = false;
  });
  no.addEventListener("click", () => {
    confirmBox.hidden = true;
  });
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE" });
      setStatus("Cliente apagado.");
      location.hash = "#/";
    } catch (error) {
      yes.disabled = false;
      setStatus(error.message, true);
    }
  });

  const quoteForm = h("form", { class: "stack quote-form" });
  const title = h("input", { name: "title", required: "", maxlength: "120", placeholder: "Ex.: Thor 18 cm" });
  const value = h("input", {
    name: "value",
    required: "",
    inputmode: "decimal",
    placeholder: "180,00",
  });
  const status = h("select", { name: "status", "aria-label": "Situação do novo orçamento" });
  for (const [key, label] of Object.entries(STATUS)) status.append(h("option", { value: key }, label));
  const add = h("button", { class: "button-primary", type: "submit" }, "Adicionar orçamento");
  quoteForm.append(
    field("Título", title),
    field("Valor", value),
    field("Situação", status),
    add,
  );
  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    add.disabled = true;
    const data = new FormData(quoteForm);
    try {
      await api(`/api/clients/${client.id}/quotes`, {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          value: data.get("value"),
          status: data.get("status"),
        }),
      });
      editingQuoteId = null;
      setStatus("Orçamento adicionado.");
      await showDetail(client.id, { silent: true });
    } catch (error) {
      add.disabled = false;
      setStatus(error.message, true);
    }
  });

  const quotes = client.quotes.length
    ? h("ul", { class: "quote-list" }, client.quotes.map((quote) => renderQuote(quote, client)))
    : h("p", { class: "quiet" }, "Nenhum orçamento ainda.");

  main.replaceChildren(
    h(
      "div",
      { class: "detail-grid" },
      h(
        "section",
        { class: "panel" },
        h("p", { class: "kicker" }, "Ficha do cliente"),
        h("h2", {}, client.name),
        h("p", { class: "phone" }, client.whatsappDisplay),
        sharedLine(client),
        form,
        h("div", { class: "danger-box" }, ask, confirmBox),
      ),
      h(
        "section",
        { class: "panel" },
        h("h2", {}, "Orçamentos"),
        h("p", { class: "hint" }, "Título, valor e situação ficam ligados a esta pessoa."),
        quoteForm,
        quotes,
      ),
    ),
  );
  document.title = `${client.name} — CRM Taldo`;
}

async function showDetail(id, options = {}) {
  document.body.dataset.view = "detail";
  searchForm.hidden = true;
  const seq = ++detailSeq;
  if (!options.silent) {
    editingQuoteId = null;
    setStatus("");
    main.replaceChildren(h("p", { class: "quiet" }, "Carregando ficha…"));
  }
  try {
    const client = await api(`/api/clients/${id}`);
    if (seq !== detailSeq || document.body.dataset.view !== "detail") return;
    renderDetail(client);
  } catch (error) {
    if (seq !== detailSeq || document.body.dataset.view !== "detail") return;
    document.title = "CRM Taldo";
    main.replaceChildren(h("section", { class: "empty" }, h("h2", {}, "Não encontrei esse cliente"), h("p", {}, error.message), h("a", { href: "#/" }, "Voltar ao painel")));
    setStatus(error.message, true);
  }
}

async function showDashboard(options = {}) {
  document.body.dataset.view = "dashboard";
  searchForm.hidden = false;
  editingQuoteId = null;
  if (!options.silent) setStatus("");
  const seq = ++searchSeq;
  try {
    const next = await api(`/api/clients?q=${encodeURIComponent(filter)}`);
    if (seq !== searchSeq || document.body.dataset.view !== "dashboard") return;
    dashboard = next;
    document.title = "Painel — CRM Taldo";
    renderDashboard();
  } catch (error) {
    if (seq !== searchSeq || document.body.dataset.view !== "dashboard") return;
    setStatus(error.message, true);
    main.replaceChildren(h("section", { class: "empty" }, h("h2", {}, "O painel não carregou"), h("p", {}, error.message)));
  }
}

function route() {
  clearTimeout(searchTimer);
  const hash = location.hash || "#/";
  if (hash === "#/" || hash === "#") return showDashboard();
  if (hash === "#/novo") return showNew();
  const match = /^#\/cliente\/(\d+)$/.exec(hash);
  if (match) return showDetail(Number(match[1]));
  location.hash = "#/";
}

searchForm.addEventListener("submit", (event) => event.preventDefault());
searchInput.addEventListener("input", () => {
  filter = searchInput.value;
  if (document.body.dataset.view !== "dashboard") return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (document.body.dataset.view === "dashboard") showDashboard({ silent: true });
  }, 160);
});
window.addEventListener("hashchange", route);
route();
