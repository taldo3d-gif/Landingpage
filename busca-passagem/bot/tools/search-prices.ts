import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchPrices } from "../lib/prices.js";

export default defineTool({
  description:
    "Search flight prices. Prefer show-deals-board when the user wants a list/dashboard. Returns mode mock|travelpayouts.",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string().describe("YYYY-MM-DD"),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional().describe("Default 2 for casal"),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z.number().positive().optional(),
  }),
  async execute(input) {
    const result = await searchPrices({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults: input.adults ?? 2,
      currency: (input.currency ?? "BRL").toUpperCase(),
      maxPrice: input.maxPrice,
    });
    const cheapest = result.quotes[0] ?? null;
    return {
      mode: result.mode,
      note: result.note,
      count: result.quotes.length,
      cheapest,
      quotes: result.quotes.slice(0, 10).map((q) => ({
        price: q.price,
        currency: q.currency,
        airline: q.airline,
        departures: q.departures,
        deepLink: q.deepLink,
        source: q.source,
      })),
      buyLinks: result.links,
      underMax:
        input.maxPrice != null && cheapest != null
          ? cheapest.price <= input.maxPrice
          : null,
    };
  },
});
