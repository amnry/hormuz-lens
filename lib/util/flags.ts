import countries from 'i18n-iso-countries';

// UI bucketing: the 7 Gulf-state flags shown individually in the flag panel.
// Everything else is aggregated as "Other" at query/render time — not at ingest.
export const GULF_FLAGS_UI = ['SA', 'IR', 'AE', 'QA', 'KW', 'IQ', 'OM'] as const;

// Converts a GFW ISO3 flag code (e.g. 'IRN', 'PAN') to ISO2 ('IR', 'PA').
// Returns 'XX' only for codes that have no ISO mapping (unregistered / data error).
// Nothing is bucketed into OT here — full fidelity is preserved for storage.
export function normalizeFlag(iso3: string | null | undefined): string {
  if (!iso3) return 'XX';
  return countries.alpha3ToAlpha2(iso3.toUpperCase()) ?? 'XX';
}
