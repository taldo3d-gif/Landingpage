export const WATCH_INDEX_KEY = "watches:index";
export const watchKey = (id: string) => `watches:${id}`;
export const alertDedupeKey = (watchId: string, price: number) =>
  `alerts:dedupe:${watchId}:${Math.round(price)}`;
