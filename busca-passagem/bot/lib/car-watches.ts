import { rentalDayCount } from "./car-buy-links.js";
import { CAR_WATCH_INDEX_KEY, carWatchKey } from "./kv-keys.js";
import type { CarCategory, CarWatch } from "./types.js";

type Kv = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

/** Natal/Ano Novo trip — shared pickup window for car watches. */
export const DEFAULT_CAR_TRIP = {
  pickupDate: "2026-12-23",
  dropoffDate: "2027-01-01",
  pickupTime: "14:00",
  dropoffTime: "12:00",
} as const;

function defaultAirportLabel(iata: string): string {
  switch (iata.toUpperCase()) {
    case "REC":
      return "Aeroporto de Recife (REC / Guararapes)";
    case "MCZ":
      return "Aeroporto de Maceió (MCZ / Zumbi dos Palmares)";
    case "AJU":
      return "Aeroporto de Aracaju (AJU / Santa Maria)";
    default:
      return `Aeroporto ${iata.toUpperCase()}`;
  }
}

/**
 * Ensure REC/MCZ watches exist for SUV (T-Cross) and hatch (Polo / HB20).
 * Idempotent — creates missing ids only; does not overwrite lastSeen*.
 */
export async function ensureDefaultCarWatches(kv: Kv): Promise<CarWatch[]> {
  const days = rentalDayCount(
    DEFAULT_CAR_TRIP.pickupDate,
    DEFAULT_CAR_TRIP.dropoffDate,
  );
  const now = new Date().toISOString();
  const templates: Array<{
    id: string;
    iata: string;
    category: CarCategory;
    modelHint: string;
    maxPricePerDay: number;
    notes: string;
  }> = [
    {
      id: "car-rec-tcross-170",
      iata: "REC",
      category: "suv",
      modelHint: "T-Cross",
      maxPricePerDay: 170,
      notes: "SUV compacto tipo T-Cross · teto R$170/dia",
    },
    {
      id: "car-mcz-tcross-170",
      iata: "MCZ",
      category: "suv",
      modelHint: "T-Cross",
      maxPricePerDay: 170,
      notes: "SUV compacto tipo T-Cross · teto R$170/dia",
    },
    {
      id: "car-rec-hatch-120",
      iata: "REC",
      category: "compact",
      modelHint: "Polo / HB20 Hatch",
      maxPricePerDay: 120,
      notes: "Grupo hatch compacto (Polo, HB20 Hatch ou similar) · teto R$120/dia",
    },
    {
      id: "car-mcz-hatch-120",
      iata: "MCZ",
      category: "compact",
      modelHint: "Polo / HB20 Hatch",
      maxPricePerDay: 120,
      notes: "Grupo hatch compacto (Polo, HB20 Hatch ou similar) · teto R$120/dia",
    },
  ];

  const ensured: CarWatch[] = [];
  for (const t of templates) {
    const existing = await getCarWatch(kv, t.id);
    if (existing) {
      ensured.push(existing);
      continue;
    }
    const label = defaultAirportLabel(t.iata);
    const watch: CarWatch = {
      id: t.id,
      pickupIata: t.iata,
      pickupLabel: label,
      dropoffIata: t.iata,
      dropoffLabel: label,
      pickupDate: DEFAULT_CAR_TRIP.pickupDate,
      dropoffDate: DEFAULT_CAR_TRIP.dropoffDate,
      pickupTime: DEFAULT_CAR_TRIP.pickupTime,
      dropoffTime: DEFAULT_CAR_TRIP.dropoffTime,
      category: t.category,
      modelHint: t.modelHint,
      maxPricePerDay: t.maxPricePerDay,
      maxPrice: Math.round(t.maxPricePerDay * days),
      marginPct: 15,
      currency: "BRL",
      driverAge: 25,
      active: true,
      notes: t.notes,
      lastSeenPrice: null,
      lastSeenAt: null,
      lastSeenSource: null,
      updatedAt: now,
    };
    await putCarWatch(kv, watch);
    ensured.push(watch);
  }
  return ensured;
}

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
