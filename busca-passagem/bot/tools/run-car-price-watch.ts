import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatCarLinksMessage } from "../lib/car-buy-links.js";
import {
  carWatchSearchInput,
  effectiveCarCeiling,
  searchCarPrices,
} from "../lib/car-prices.js";
import { listCarWatches } from "../lib/car-watches.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import {
  carAlertDedupeKey,
  carDigestDedupeKey,
} from "../lib/kv-keys.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default defineTool({
  description:
    "Scan active CAR rental watches. WhatsApp when lastSeenPrice ≤ ceiling, or daily digest with comparison links (forceNotify bypasses dedupe).",
  effect: "write",
  inputSchema: z.object({
    forceNotify: z
      .boolean()
      .optional()
      .describe("If true, always send digest even without under-ceiling price"),
    dryNotify: z
      .boolean()
      .optional()
      .describe("If true, skip WhatsApp and only return draft messages"),
  }),
  dryRunResult: () => ({ dryRun: true, alertCount: 0 }),
  async execute({ forceNotify, dryNotify }, ctx) {
    const watches = (await listCarWatches(ctx.host.kv)).filter((w) => w.active);
    const alerts: Array<{
      watchId: string;
      price: number | null;
      underMax: boolean;
      kind: "under_ceiling" | "daily_digest";
      text: string;
      notifyOk: boolean;
      notifyMode: string;
    }> = [];
    const scanned: Array<{
      watchId: string;
      mode: string;
      cheapest: number | null;
      ceiling: number | null;
      underMax: boolean;
      skipped: string | null;
    }> = [];

    for (const watch of watches) {
      const marginPct = watch.marginPct ?? 15;
      const ceiling = effectiveCarCeiling(watch.maxPrice, marginPct);
      const search = searchCarPrices(carWatchSearchInput(watch));
      const recorded = search.quotes.find((q) => q.source === "recorded");
      const cheapest = recorded ?? search.quotes[0] ?? null;
      const underMax =
        recorded != null &&
        ceiling != null &&
        recorded.price <= ceiling;

      if (underMax && recorded) {
        const dedupe = carAlertDedupeKey(watch.id, recorded.price);
        const prior = await ctx.host.kv.get(dedupe);
        if (prior && !forceNotify) {
          scanned.push({
            watchId: watch.id,
            mode: search.mode,
            cheapest: recorded.price,
            ceiling,
            underMax: true,
            skipped: "already_alerted_same_price",
          });
          continue;
        }
      } else if (!forceNotify) {
        // Daily digest so high-season links stay in WhatsApp without spam.
        const digestKey = carDigestDedupeKey(watch.id, todayUtc());
        const priorDigest = await ctx.host.kv.get(digestKey);
        if (priorDigest) {
          scanned.push({
            watchId: watch.id,
            mode: search.mode,
            cheapest: cheapest?.price ?? null,
            ceiling,
            underMax: false,
            skipped: "digest_already_sent_today",
          });
          continue;
        }
      }

      const route =
        `${watch.pickupLabel} · ${watch.pickupDate} ${watch.pickupTime}` +
        ` → ${watch.dropoffDate} ${watch.dropoffTime}` +
        ` · ${search.days}d · ${watch.category}`;
      const priceLine = recorded
        ? `Visto ao vivo: ${recorded.price} ${recorded.currency} total` +
          ` (~${recorded.pricePerDay}/dia)` +
          (recorded.supplier ? ` · ${recorded.supplier}` : "")
        : `Sem preço ao vivo registrado — estimativa ~${cheapest?.price ?? "?"} ${watch.currency} total` +
          ` (~${cheapest?.pricePerDay ?? "?"}/dia). Abra os links.`;

      const kind = underMax ? "under_ceiling" : "daily_digest";
      const text = [
        underMax
          ? "Aluguel abaixo do teto (com margem)"
          : "Monitor aluguel de carro — links do dia",
        route,
        `Teto: ${watch.maxPrice} ${watch.currency} total (margem ${marginPct}% → ${ceiling})`,
        priceLine,
        watch.notes ? `Notas: ${watch.notes}` : "",
        "",
        formatCarLinksMessage(search.links, watch.category),
        "",
        "Confira proteção, km livre e taxa aeroporto.",
      ]
        .filter(Boolean)
        .join("\n");

      let notifyOk = false;
      let notifyMode = "skipped";
      if (!dryNotify) {
        const to = defaultWhatsAppTo();
        if (!to) {
          notifyMode = "missing_WHATSAPP_TO";
        } else {
          const notify = await sendWhatsAppText({ to, text });
          notifyOk = notify.ok;
          notifyMode = notify.ok ? notify.mode : "error";
        }
      }

      if (underMax && recorded) {
        await ctx.host.kv.put(carAlertDedupeKey(watch.id, recorded.price), {
          at: new Date().toISOString(),
          price: recorded.price,
        });
      } else {
        await ctx.host.kv.put(carDigestDedupeKey(watch.id, todayUtc()), {
          at: new Date().toISOString(),
        });
      }

      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        cheapest: cheapest?.price ?? null,
        ceiling,
        underMax,
        skipped: null,
      });
      alerts.push({
        watchId: watch.id,
        price: cheapest?.price ?? null,
        underMax,
        kind,
        text,
        notifyOk,
        notifyMode,
      });
    }

    return {
      ok: true as const,
      watchCount: watches.length,
      scanned,
      alertCount: alerts.length,
      alerts,
    };
  },
});
