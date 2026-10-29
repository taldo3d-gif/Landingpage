import { defineArtifacts } from "@grok/agent-sdk/artifacts";
import * as z from "zod/v4";

export default defineArtifacts({
  agentTool: false,
  kinds: {
    "deals-board": {
      description: "HTML dashboard listing flight deals with prices and buy links.",
      schema: z.object({
        origin: z.string(),
        destination: z.string(),
        departDate: z.string(),
        returnDate: z.string().nullable(),
        maxPrice: z.number().nullable(),
        currency: z.string(),
        mode: z.string(),
        dealCount: z.number(),
      }),
    },
  },
});
