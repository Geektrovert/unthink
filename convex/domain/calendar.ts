import { ConvexError } from "convex/values";

export function assertDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new ConvexError("DAY_KEY_INVALID");
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dayKey) {
    throw new ConvexError("DAY_KEY_INVALID");
  }
}

export function localDayKey(timezone: string, now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nextLocalDayKey(timezone: string, now: number) {
  const current = new Date(`${localDayKey(timezone, now)}T00:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}
