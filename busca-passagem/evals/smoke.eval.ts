import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Creates a watch and builds buy links.",
  async test(t) {
    await t.send(
      'Use upsert-watch for GRU→LIS on 2026-12-01 one-way maxPrice 2000 BRL adults 2. Then call build-buy-links for the same route and list the Google Flights URL.',
    );
    t.succeeded();
    t.calledTool("upsert-watch");
    t.calledTool("build-buy-links");
  },
});
