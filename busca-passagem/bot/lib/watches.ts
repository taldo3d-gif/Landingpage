import { WATCH_INDEX_KEY, watchKey } from "./kv-keys.js";
import type { FlightWatch } from "./types.js";

type Kv = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function listWatchIds(kv: Kv): Promise<string[]> {
  return asStringArray(await kv.get(WATCH_INDEX_KEY));
}

export async function getWatch(
  kv: Kv,
  id: string,
): Promise<FlightWatch | undefined> {
  const raw = await kv.get(watchKey(id));
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Partial<FlightWatch> & {
    id: string;
    origin: string;
    destination: string;
    departDate: string;
    maxPrice: number;
  };
  return {
    id: w.id,
    origin: w.origin,
    destination: w.destination,
    departDate: w.departDate,
    returnDate: w.returnDate ?? null,
    maxPrice: w.maxPrice,
    marginPct: typeof w.marginPct === "number" ? w.marginPct : 15,
    flexDays: typeof w.flexDays === "number" ? w.flexDays : 0,
    directOnly: w.directOnly ?? false,
    maxLayoverMinutes:
      typeof w.maxLayoverMinutes === "number" ? w.maxLayoverMinutes : 180,
    currency: w.currency ?? "BRL",
    adults: typeof w.adults === "number" ? w.adults : 2,
    active: w.active ?? true,
    notes: w.notes ?? null,
    updatedAt: w.updatedAt ?? new Date().toISOString(),
  };
}

export async function listWatches(kv: Kv): Promise<FlightWatch[]> {
  const ids = await listWatchIds(kv);
  const out: FlightWatch[] = [];
  for (const id of ids) {
    const w = await getWatch(kv, id);
    if (w) out.push(w);
  }
  return out;
}

export async function putWatch(kv: Kv, watch: FlightWatch): Promise<void> {
  const ids = await listWatchIds(kv);
  if (!ids.includes(watch.id)) {
    ids.push(watch.id);
    await kv.put(WATCH_INDEX_KEY, ids);
  }
  await kv.put(watchKey(watch.id), watch);
}
