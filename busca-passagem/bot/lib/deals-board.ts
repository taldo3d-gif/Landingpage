import type { BuyLinks, PriceQuote } from "./types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export function renderDealsBoardHtml(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  adults: number;
  maxPrice: number | null;
  currency: string;
  mode: string;
  quotes: PriceQuote[];
  links: BuyLinks;
}): string {
  const route = `${input.origin} → ${input.destination}`;
  const dates = input.returnDate
    ? `${input.departDate} ↺ ${input.returnDate}`
    : `${input.departDate} (só ida)`;
  const modeLabel =
    input.mode === "travelpayouts"
      ? "Preços reais (Travelpayouts / Aviasales cache)"
      : "MODO MOCK — preços aproximados (configure TRAVELPAYOUTS_TOKEN)";
  const under = input.quotes.filter(
    (q) => input.maxPrice == null || q.price <= input.maxPrice,
  );
  const rows = (under.length ? under : input.quotes).slice(0, 15);

  const rowHtml = rows
    .map((q, i) => {
      const ok =
        input.maxPrice == null
          ? ""
          : q.price <= input.maxPrice
            ? '<span class="ok">≤ teto</span>'
            : '<span class="no">acima</span>';
      const buy = q.deepLink ?? input.links.googleFlights;
      return `<tr>
        <td>${i + 1}</td>
        <td class="price">${esc(money(q.price, q.currency))}</td>
        <td>${esc(q.airline ?? "—")}</td>
        <td>${esc(q.departures.join(" · ") || "—")}</td>
        <td>${ok}</td>
        <td><a href="${esc(buy)}" target="_blank" rel="noopener">Abrir oferta</a></td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Deals — ${esc(route)}</title>
<style>
  :root { color-scheme: light; --bg:#f6f4ef; --ink:#1a1a1a; --muted:#5c5a55; --line:#d9d4c8; --ok:#0b6b3a; --no:#8a1f1f; --card:#fffdf8; }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
  main { max-width: 920px; margin: 0 auto; padding: 28px 20px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 6px; letter-spacing: -0.02em; }
  .meta { color: var(--muted); margin-bottom: 18px; }
  .banner { padding: 10px 12px; border: 1px solid var(--line); background: var(--card); margin-bottom: 18px; }
  .banner.mock { border-color: #c47a2c; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .price { font-variant-numeric: tabular-nums; font-weight: 650; }
  .ok { color: var(--ok); font-weight: 600; }
  .no { color: var(--no); }
  a { color: #0b4f8a; }
  .links { margin-top: 22px; }
  .links a { display: inline-block; margin: 0 14px 8px 0; }
</style>
</head>
<body>
<main>
  <h1>${esc(route)}</h1>
  <p class="meta">${esc(dates)} · ${input.adults} adulto(s) · moeda ${esc(input.currency)}${
    input.maxPrice != null
      ? ` · teto ${esc(money(input.maxPrice, input.currency))}`
      : ""
  }</p>
  <div class="banner ${input.mode === "mock" ? "mock" : ""}">${esc(modeLabel)}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Preço</th>
        <th>Cia</th>
        <th>Horários</th>
        <th>Teto</th>
        <th>Link</th>
      </tr>
    </thead>
    <tbody>
      ${rowHtml || `<tr><td colspan="6">Nenhuma cotação encontrada.</td></tr>`}
    </tbody>
  </table>
  <div class="links">
    <strong>Buscar também em:</strong><br/>
    <a href="${esc(input.links.googleFlights)}" target="_blank" rel="noopener">Google Flights</a>
    <a href="${esc(input.links.kayak)}" target="_blank" rel="noopener">Kayak</a>
    <a href="${esc(input.links.skyscanner)}" target="_blank" rel="noopener">Skyscanner</a>
    <a href="${esc(input.links.decolar)}" target="_blank" rel="noopener">Decolar</a>
  </div>
</main>
</body>
</html>`;
}
