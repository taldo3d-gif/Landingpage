import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  // Every 30 minutes UTC — dispatch manually under --dev
  cron: "*/30 * * * *",
  async run({ callTool, waitUntil }) {
    waitUntil(
      callTool("run-price-watch", {}).then((result) => {
        console.info("[schedule:price-watch]", JSON.stringify(result).slice(0, 500));
      }),
    );
  },
});
