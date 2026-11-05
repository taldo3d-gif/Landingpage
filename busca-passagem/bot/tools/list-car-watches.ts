import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listCarWatches } from "../lib/car-watches.js";

export default defineTool({
  description:
    "List stored CAR rental watches (pickup, dates, total max price, last seen).",
  effect: "read",
  inputSchema: z.object({
    activeOnly: z.boolean().optional().describe("If true, only active watches"),
  }),
  async execute({ activeOnly }, ctx) {
    const watches = await listCarWatches(ctx.host.kv);
    const filtered = activeOnly ? watches.filter((w) => w.active) : watches;
    return { count: filtered.length, watches: filtered };
  },
});
