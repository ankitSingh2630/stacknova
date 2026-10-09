// Keep Appwrite ISO timestamps intact; convert only for display/filtering.
export const leadHref = (id: string) => "/admin/lead/?id=" + encodeURIComponent(id);
export const dateLabel = (value: string, withYear = false) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "2-digit", ...(withYear ? { year: "numeric" as const } : {}), timeZone: "Asia/Kolkata",
}).format(new Date(value));

export function calendarDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function matchesDate(value: string, filter: string, now = new Date()) {
  if (!filter) return true;
  const created = calendarDate(value);
  const today = calendarDate(now);
  if (filter === "today") return created === today;
  // Calendar subtraction avoids mixing the browser's timezone with India dates.
  const start = new Date(today + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 6);
  return created >= start.toISOString().slice(0, 10) && created <= today;
}
