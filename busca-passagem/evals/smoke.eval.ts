import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Creates a watch and lists it back.",
  async test(t) {
    await t.send(
      'Use upsert-watch to create an active watch GRU→LIS departing 2026-12-01 one-way maxPrice 2000 BRL adults 1. Then call list-watches with activeOnly true and summarize.',
    );
    t.succeeded();
    t.calledTool("upsert-watch");
    t.calledTool("list-watches");
  },
});
