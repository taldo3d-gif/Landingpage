import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatCarLinksMessage } from "../lib/car-buy-links.js";
import {
  carWatchSearchInput,
  effectiveCarCeiling,
  searchCarPrices,
} from "../lib/car-prices.js";
import {
  ensureDefaultCarWatches,
  listCarWatches,
} from "../lib/car-watches.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import {
  carAlertDedupeKey,
  carDigestSlotKey,
} from "../lib/kv-keys.js";
import type { CarWatch } from "../lib/types.js";

/** UTC slot id for bi-hourly digests, e.g. 2026-11-05T14. */
function digestSlotUtc(d = new Date()): string {
  const hour = d.getUTCHours() - (d.getUTCHours() % 2);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}T${String(hour).padStart(2, "0")}`;
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

function watchHeadline(watch: CarWatch, days: number): string {
  const perDay =
    watch.maxPricePerDay ?? Math.round(watch.maxPrice / Math.max(1, days));
  return (
    `${watch.pickupIata} · ${watch.category}` +
    (watch.modelHint ? ` (~${watch.modelHint})` : "") +
    ` · teto ${money(perDay, watch.currency)}/dia`
  );
}

export default defineTool({
  description:
    "Scan active CAR watches every ~2h. WhatsApp ASAP when lastSeenPrice ≤ ceiling (new price); otherwise one bi-hourly digest for all watches. forceNotify bypasses dedupe.",
  effect: "write",
  inputSchema: z.object({
    forceNotify: z
      .boolean()
      .optional()
      .describe("If true, always send digest even if this 2h slot already notified"),
    dryNotify: z
      .boolean()
      .optional()
      .describe("If true, skip WhatsApp and only return draft messages"),
  }),
  dryRunResult: () => ({ dryRun: true, alertCount: 0 }),
  async execute({ forceNotify, dryNotify }, ctx) {
    await ensureDefaultCarWatches(ctx.host.kv);
    const watches = (await listCarWatches(ctx.host.kv)).filter((w) => w.active);
    const slot = digestSlotUtc();
    const to = defaultWhatsAppTo();

    const scanned: Array<{
      watchId: string;
      mode: string;
      cheapest: number | null;
      ceiling: number | null;
      underMax: boolean;
      skipped: string | null;
    }> = [];
    const alerts: Array<{
      watchId: string | "digest";
      price: number | null;
      underMax: boolean;
      kind: "under_ceiling" | "bi_hourly_digest";
      text: string;
      notifyOk: boolean;
      notifyMode: string;
    }> = [];

    async function notify(text: string): Promise<{ ok: boolean; mode: string }> {
      if (dryNotify) return { ok: false, mode: "dry" };
      if (!to) return { ok: false, mode: "missing_WHATSAPP_TO" };
      const res = await sendWhatsAppText({ to, text });
      return { ok: res.ok, mode: res.ok ? res.mode : "error" };
    }

    // 1) Immediate under-ceiling alerts (any offer below teto+margem)
    for (const watch of watches) {
      const marginPct = watch.marginPct ?? 15;
      const ceiling = effectiveCarCeiling(watch.maxPrice, marginPct);
      const search = searchCarPrices(carWatchSearchInput(watch));
      const recorded = search.quotes.find((q) => q.source === "recorded");
      const cheapest = recorded ?? search.quotes[0] ?? null;
      const underMax =
        recorded != null && ceiling != null && recorded.price <= ceiling;

      if (!underMax || !recorded) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          cheapest: cheapest?.price ?? null,
          ceiling,
          underMax: false,
          skipped: null,
        });
        continue;
      }

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

      const text = [
        "⚡ Oferta de aluguel ABAIXO do teto — mandei na hora",
        watchHeadline(watch, search.days),
        `${watch.pickupLabel} · ${watch.pickupDate} ${watch.pickupTime}` +
          ` → ${watch.dropoffDate} ${watch.dropoffTime}`,
        `Visto: ${money(recorded.price, recorded.currency)} total` +
          ` (~${money(recorded.pricePerDay, recorded.currency)}/dia)` +
          (recorded.supplier ? ` · ${recorded.supplier}` : ""),
        `Teto c/ margem: ${money(ceiling ?? watch.maxPrice, watch.currency)}`,
        watch.notes ? `Notas: ${watch.notes}` : "",
        "",
        formatCarLinksMessage(search.links, watch.category),
      ]
        .filter(Boolean)
        .join("\n");

      const n = await notify(text);
      await ctx.host.kv.put(dedupe, {
        at: new Date().toISOString(),
        price: recorded.price,
      });
      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        cheapest: recorded.price,
        ceiling,
        underMax: true,
        skipped: null,
      });
      alerts.push({
        watchId: watch.id,
        price: recorded.price,
        underMax: true,
        kind: "under_ceiling",
        text,
        notifyOk: n.ok,
        notifyMode: n.mode,
      });
    }

    // 2) Bi-hourly digest (one WhatsApp for all watches)
    const digestKey = carDigestSlotKey(slot);
    const priorDigest = await ctx.host.kv.get(digestKey);
    if (priorDigest && !forceNotify) {
      return {
        ok: true as const,
        watchCount: watches.length,
        slot,
        scanned,
        alertCount: alerts.length,
        alerts,
        digestSkipped: "digest_already_sent_this_2h_slot",
      };
    }

    const lines: string[] = [
      `🚗 Atualização aluguel (a cada 2h) · slot ${slot}Z`,
      `Datas: 23/12/2026 14:00 → 01/01/2027 12:00 · REC + MCZ`,
      `Grupos: T-Cross ≤R$170/dia · Polo/HB20 Hatch ≤R$120/dia`,
      `Se surgir oferta abaixo do teto, aviso na hora (não espero as 2h).`,
      "",
    ];

    for (const watch of watches) {
      const search = searchCarPrices(carWatchSearchInput(watch));
      const recorded = search.quotes.find((q) => q.source === "recorded");
      const estimate = search.quotes.find((q) => q.source === "estimate");
      const best = recorded ?? estimate;
      const perDay =
        watch.maxPricePerDay ??
        Math.round(watch.maxPrice / Math.max(1, search.days));
      lines.push(
        `• ${watch.pickupIata} ${watch.modelHint ?? watch.category}` +
          ` · teto ${money(perDay, watch.currency)}/dia` +
          (best
            ? ` · ${recorded ? "visto" : "estimativa"} ${money(best.price, best.currency)}` +
              ` (~${money(best.pricePerDay, best.currency)}/dia)`
            : " · sem cotação"),
      );
      lines.push(`  Kayak: ${search.links.kayak}`);
    }

    lines.push(
      "",
      "Abra Kayak/Momondo primeiro; Localiza/Foco podem pedir Continuar.",
      "Mande o valor que você viu pra eu gravar e alertar se cair abaixo do teto.",
    );

    const digestText = lines.join("\n");
    const n = await notify(digestText);
    await ctx.host.kv.put(digestKey, { at: new Date().toISOString(), slot });
    alerts.push({
      watchId: "digest",
      price: null,
      underMax: false,
      kind: "bi_hourly_digest",
      text: digestText,
      notifyOk: n.ok,
      notifyMode: n.mode,
    });

    return {
      ok: true as const,
      watchCount: watches.length,
      slot,
      scanned,
      alertCount: alerts.length,
      alerts,
      digestSkipped: null,
    };
  },
});
