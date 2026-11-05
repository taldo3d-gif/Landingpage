import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  // Every 6 hours UTC — daily digest is deduped inside the tool
  cron: "0 */6 * * *",
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
