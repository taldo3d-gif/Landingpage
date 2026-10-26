import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Creates a watch and opens the deals board.",
  async test(t) {
    await t.send(
      'Use upsert-watch for GRU→LIS on 2026-12-01 one-way maxPrice 2000 BRL adults 2. Then call show-deals-board for the same route and tell me the board URL.',
    );
    t.succeeded();
    t.calledTool("upsert-watch");
    t.calledTool("show-deals-board");
  },
});
