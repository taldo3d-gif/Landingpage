export const WATCH_INDEX_KEY = "watches:index";
export const watchKey = (id: string) => `watches:${id}`;
export const alertDedupeKey = (watchId: string, price: number) =>
  `alerts:dedupe:${watchId}:${Math.round(price)}`;

export const CAR_WATCH_INDEX_KEY = "car-watches:index";
export const carWatchKey = (id: string) => `car-watches:${id}`;
export const carAlertDedupeKey = (watchId: string, price: number) =>
  `car-alerts:dedupe:${watchId}:${Math.round(price)}`;
/** @deprecated Prefer carDigestSlotKey — kept for older KV entries. */
export const carDigestDedupeKey = (watchId: string, day: string) =>
  `car-alerts:digest:${watchId}:${day}`;
/** Bi-hourly digest slot, e.g. 2026-11-05T14 (hour floored to even UTC). */
export const carDigestSlotKey = (slot: string) =>
  `car-alerts:digest-slot:${slot}`;
