export const WATCH_INDEX_KEY = "watches:index";
export const watchKey = (id: string) => `watches:${id}`;
export const HOLD_INDEX_KEY = "holds:index";
export const holdKey = (id: string) => `holds:${id}`;
export const dedupeHoldKey = (watchId: string, offerId: string) =>
  `holds:dedupe:${watchId}:${offerId}`;
