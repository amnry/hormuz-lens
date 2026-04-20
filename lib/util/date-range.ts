export interface DateRange {
  from: Date;
  to: Date;
}

export const TRACK_START = new Date('2025-12-01T00:00:00Z');
export const YTD_FROM    = new Date('2026-01-01T00:00:00Z');
export const CLOSURE_DATE = new Date('2026-02-28T00:00:00Z');

export function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function subtractDays(d: Date, n: number): Date {
  return new Date(d.getTime() - n * 86_400_000);
}

export function defaultRange(): DateRange {
  return { from: YTD_FROM, to: todayUtc() };
}

export function formatRangeLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
     .toUpperCase();
  return `${fmt(from)} → ${fmt(to)}`;
}
