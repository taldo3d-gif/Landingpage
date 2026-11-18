const STATUS_LABELS = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw fail("Informe o nome do cliente.");
  if (name.length > 80) throw fail("O nome pode ter no máximo 80 caracteres.");
  return name;
}

function cleanNote(value) {
  const note = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  if (!note) throw fail("Escreva em poucas palavras sobre o que é a conversa.");
  if (note.length > 280) throw fail("A nota pode ter no máximo 280 caracteres.");
  return note;
}

function cleanTitle(value) {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!title) throw fail("Informe o título do orçamento.");
  if (title.length > 120) throw fail("O título pode ter no máximo 120 caracteres.");
  return title;
}

function cleanStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  if (!STATUS_LABELS[status]) {
    throw fail("Situação inválida. Use rascunho, enviado, aprovado ou recusado.");
  }
  return status;
}

function normalizeWhatsapp(input) {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) throw fail("Informe o WhatsApp do cliente.");
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15) {
    throw fail("Esse WhatsApp não parece válido. Use DDD e número, com ou sem o 55.");
  }
  return digits;
}

function displayWhatsapp(digits) {
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    if (local.length === 9) return `+55 ${ddd} ${local.slice(0, 5)}-${local.slice(5)}`;
    if (local.length === 8) return `+55 ${ddd} ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  return `+${digits}`;
}

function whatsappUrl(digits, name, note) {
  const text = `Olá, ${name}! Aqui é do Taldo Studio 3D, sobre: ${note}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function parseMoney(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw fail("Informe um valor válido, zero ou maior.");
    return parseMoney(input.toFixed(2));
  }

  let raw = String(input ?? "").trim().replace(/\s/g, "");
  if (!raw) throw fail("Informe o valor do orçamento.");
  raw = raw.replace(/^R\$/i, "");
  if (!raw || !/^[\d.,]+$/.test(raw)) {
    throw fail("Valor inválido. Use algo como 180 ou 180,50.");
  }

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized;

  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const parts = raw.split(",");
    if (parts.length !== 2) throw fail("Valor inválido. Use algo como 180 ou 180,50.");
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (lastDot !== -1) {
    const parts = raw.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = raw;
    } else if (parts.every((part, index) => (index === 0 ? /^\d+$/ : /^\d{3}$/).test(part))) {
      normalized = parts.join("");
    } else {
      throw fail("Valor inválido. Use algo como 180 ou 180,50.");
    }
  } else {
    normalized = raw;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw fail("Valor inválido. Use algo como 180 ou 180,50.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_00) {
    throw fail("Esse valor é alto demais para um orçamento.");
  }
  return cents;
}

function formatCentsLabel(cents) {
  const reais = Math.floor(cents / 100).toLocaleString("pt-BR");
  const fraction = String(cents % 100).padStart(2, "0");
  return `R$ ${reais},${fraction}`;
}

function formatCentsInput(cents) {
  const reais = Math.floor(cents / 100).toLocaleString("pt-BR");
  const fraction = String(cents % 100).padStart(2, "0");
  return `${reais},${fraction}`;
}

function fold(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

module.exports = {
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
};
