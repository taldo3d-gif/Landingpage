import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listWatches } from "../lib/watches.js";

export default defineTool({
  description:
    "List stored flight price watches (origin, destination, dates, max price).",
  effect: "read",
  inputSchema: z.object({
    activeOnly: z.boolean().optional().describe("If true, only active watches"),
  }),
  async execute({ activeOnly }, ctx) {
    const watches = await listWatches(ctx.host.kv);
    const filtered = activeOnly ? watches.filter((w) => w.active) : watches;
    return { count: filtered.length, watches: filtered };
  },
});
