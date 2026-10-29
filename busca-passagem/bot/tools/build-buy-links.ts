import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { buildBuyLinks, formatLinksMessage } from "../lib/buy-links.js";

export default defineTool({
  description:
    "Build direct purchase/search links (Google Flights, Kayak, Skyscanner, Decolar) for a route — no API key needed.",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional(),
  }),
  async execute(input) {
    const links = buildBuyLinks({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults: input.adults ?? 2,
    });
    return { links, textBlock: formatLinksMessage(links) };
  },
});
