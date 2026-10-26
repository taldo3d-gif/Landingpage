import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchPrices } from "../lib/prices.js";
import { trustSummaryPt } from "../lib/trust.js";

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

export default defineTool({
  description:
    "Search prices and return a simple inline deals table (markdown) plus trusted buy links. Primary UX is in-chat — no need to open another page.",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional(),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z.number().positive().optional(),
  }),
  async execute(input) {
    const adults = input.adults ?? 2;
    const currency = (input.currency ?? "BRL").toUpperCase();
    const result = await searchPrices({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults,
      currency,
      maxPrice: input.maxPrice,
    });

    const quotes = result.quotes.slice(0, 8);
    const cheapest = quotes[0] ?? null;
    const underMax =
      input.maxPrice != null && cheapest != null
        ? cheapest.price <= input.maxPrice
        : null;

    const tableLines = [
      "| # | Preço | Cia | Quando | vs teto | Comprar |",
      "|---|-------|-----|--------|---------|---------|",
      ...quotes.map((q, i) => {
        const vs =
          input.maxPrice == null
            ? "—"
            : q.price <= input.maxPrice
              ? "≤ teto"
              : "acima";
        const when = q.departures[0] ?? "—";
        const buy = q.deepLink ?? result.links.googleFlights;
        return `| ${i + 1} | ${money(q.price, q.currency)} | ${q.airline ?? "—"} | ${when} | ${vs} | [abrir](${buy}) |`;
      }),
    ];

    const compare = [
      `[Google Flights](${result.links.googleFlights})`,
      `[Decolar](${result.links.decolar})`,
      `[Kayak](${result.links.kayak})`,
      `[Skyscanner](${result.links.skyscanner})`,
    ].join(" · ");

    const chatMarkdown = [
      `**${input.origin.toUpperCase()}→${input.destination.toUpperCase()}** ${input.departDate}` +
        (input.returnDate ? ` ↺ ${input.returnDate}` : " (ida)") +
        ` · ${adults} adulto(s)` +
        (input.maxPrice != null ? ` · teto ${money(input.maxPrice, currency)}` : ""),
      "",
      `Modo: **${result.mode === "travelpayouts" ? "preços reais (referência)" : "mock"}**`,
      "",
      ...tableLines,
      "",
      `Comparar também: ${compare}`,
      "",
      `_${result.note}_`,
    ].join("\n");

    return {
      mode: result.mode,
      note: result.note,
      trustPolicy: trustSummaryPt(),
      dealCount: result.quotes.length,
      cheapest,
      underMax,
      maxPrice: input.maxPrice ?? null,
      chatMarkdown,
      topDeals: quotes.map((q) => ({
        price: q.price,
        currency: q.currency,
        airline: q.airline,
        when: q.departures,
        buyAt: "Google Flights / Decolar / Kayak / Skyscanner",
        link: q.deepLink,
      })),
      compareLinks: result.links,
      blockedCheckout: ["kiwi.com", "kiwifi", "aviasales checkout"],
    };
  },
});
