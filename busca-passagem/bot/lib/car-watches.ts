import { CAR_WATCH_INDEX_KEY, carWatchKey } from "./kv-keys.js";
import type { CarCategory, CarWatch } from "./types.js";

type Kv = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

const CATEGORIES = new Set<CarCategory>([
  "economy",
  "compact",
  "intermediate",
  "suv",
  "any",
]);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asCategory(value: unknown): CarCategory {
  if (typeof value === "string" && CATEGORIES.has(value as CarCategory)) {
    return value as CarCategory;
  }
  return "economy";
}

export async function listCarWatchIds(kv: Kv): Promise<string[]> {
  return asStringArray(await kv.get(CAR_WATCH_INDEX_KEY));
}

export async function getCarWatch(
  kv: Kv,
  id: string,
): Promise<CarWatch | undefined> {
  const raw = await kv.get(carWatchKey(id));
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Partial<CarWatch> & {
    id: string;
    pickupIata: string;
    pickupDate: string;
    dropoffDate: string;
    maxPrice: number;
  };
  return {
    id: w.id,
    pickupIata: w.pickupIata.toUpperCase(),
    pickupLabel: w.pickupLabel ?? `Aeroporto ${w.pickupIata.toUpperCase()}`,
    dropoffIata: (w.dropoffIata ?? w.pickupIata).toUpperCase(),
    dropoffLabel:
      w.dropoffLabel ??
      `Aeroporto ${(w.dropoffIata ?? w.pickupIata).toUpperCase()}`,
    pickupDate: w.pickupDate,
    dropoffDate: w.dropoffDate,
    pickupTime: w.pickupTime ?? "14:00",
    dropoffTime: w.dropoffTime ?? "12:00",
    category: asCategory(w.category),
    modelHint: w.modelHint ?? null,
    maxPrice: w.maxPrice,
    maxPricePerDay:
      typeof w.maxPricePerDay === "number" ? w.maxPricePerDay : null,
    marginPct: typeof w.marginPct === "number" ? w.marginPct : 15,
    currency: w.currency ?? "BRL",
    driverAge: typeof w.driverAge === "number" ? w.driverAge : 25,
    active: w.active ?? true,
    notes: w.notes ?? null,
    lastSeenPrice:
      typeof w.lastSeenPrice === "number" ? w.lastSeenPrice : null,
    lastSeenAt: w.lastSeenAt ?? null,
    lastSeenSource: w.lastSeenSource ?? null,
    updatedAt: w.updatedAt ?? new Date().toISOString(),
  };
}

export async function listCarWatches(kv: Kv): Promise<CarWatch[]> {
  const ids = await listCarWatchIds(kv);
  const out: CarWatch[] = [];
  for (const id of ids) {
    const w = await getCarWatch(kv, id);
    if (w) out.push(w);
  }
  return out;
}

export async function putCarWatch(kv: Kv, watch: CarWatch): Promise<void> {
  const ids = await listCarWatchIds(kv);
  if (!ids.includes(watch.id)) {
    ids.push(watch.id);
    await kv.put(CAR_WATCH_INDEX_KEY, ids);
  }
  await kv.put(carWatchKey(watch.id), watch);
}
