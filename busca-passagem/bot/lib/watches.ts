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
  return raw as FlightWatch;
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
