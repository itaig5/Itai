// Date arithmetic on ISO date strings (YYYY-MM-DD). Pure — operates only on passed-in dates,
// never on the wall clock (the demo world runs on its own sim clock).

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

export function isWeekend(iso: string): boolean {
  const dow = new Date(Date.parse(iso)).getUTCDay();
  return dow === 5 || dow === 6; // Fri/Sat nights
}

export function eachDay(startIso: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(startIso, i));
}
