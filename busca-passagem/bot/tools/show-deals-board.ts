import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchPrices } from "../lib/prices.js";

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
    "Search prices and return ONLY safe buy options: price values + Google Flights / Decolar / Kayak / Skyscanner links. Paste chatMarkdown in the reply.",
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

    const quotes = result.quotes.slice(0, 5);
    const cheapest = quotes[0] ?? null;
    const underMax =
      input.maxPrice != null && cheapest != null
        ? cheapest.price <= input.maxPrice
        : null;

    const priceLines =
      quotes.length === 0
        ? ["Nenhum preço encontrado."]
        : quotes.map((q, i) => {
            const when = q.departures[0] ? ` · ${q.departures[0]}` : "";
            const cia = q.airline ? ` · ${q.airline}` : "";
            return `${i + 1}. ${money(q.price, q.currency)}${cia}${when}`;
          });

    const chatMarkdown = [
      `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()} · ${input.departDate}` +
        (input.returnDate ? ` ↺ ${input.returnDate}` : "") +
        ` · ${adults} adulto(s)` +
        (input.maxPrice != null ? ` · teto ${money(input.maxPrice, currency)}` : ""),
      "",
      "Valores encontrados:",
      ...priceLines,
      "",
      "Onde comprar com segurança:",
      `- Google Flights: ${result.links.googleFlights}`,
      `- Decolar: ${result.links.decolar}`,
      `- Kayak: ${result.links.kayak}`,
      `- Skyscanner: ${result.links.skyscanner}`,
    ].join("\n");

    return {
      mode: result.mode,
      dealCount: result.quotes.length,
      cheapest,
      underMax,
      maxPrice: input.maxPrice ?? null,
      chatMarkdown,
      safeBuyLinks: result.links,
    };
  },
});
