import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchFlightOffers } from "../lib/amadeus.js";

export default defineTool({
  description:
    "Search flight offers via Amadeus (or mock data when credentials are missing).",
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
    const result = await searchFlightOffers({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults: input.adults ?? 1,
      currency: (input.currency ?? "BRL").toUpperCase(),
      maxPrice: input.maxPrice,
    });
    return {
      mode: result.mode,
      count: result.offers.length,
      offers: result.offers.map((o) => ({
        id: o.id,
        price: o.price,
        currency: o.currency,
        airlines: o.airlines,
        departures: o.departures,
        mock: o.mock,
      })),
      // Top candidates keep rawOfferJson for create-hold
      holdCandidates: result.offers.slice(0, 3).map((o) => ({
        id: o.id,
        price: o.price,
        currency: o.currency,
        airlines: o.airlines,
        departures: o.departures,
        rawOfferJson: o.rawOfferJson,
        mock: o.mock,
      })),
    };
  },
});
