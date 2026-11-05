import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  // Every 2 hours — under-ceiling alerts fire immediately inside the tool
  cron: "0 */2 * * *",
  async run({ callTool, waitUntil }) {
    waitUntil(
      callTool("run-car-price-watch", {}).then((result) => {
        console.info(
          "[schedule:car-price-watch]",
          JSON.stringify(result).slice(0, 500),
        );
      }),
    );
  },
});
