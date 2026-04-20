// Converts a CSS variable name to a deck.gl-compatible [r, g, b] triplet.
// CSS custom properties can be in any format the browser supports (hex, rgb(),
// oklch(), etc.). We read the computed value, create an off-screen element so
// the browser resolves the color to a computed sRGB value, then parse it.
//
// Must be called client-side (requires document). Returns [148, 163, 184]
// (the --flag-ot slate fallback) if parsing fails for any reason.

const FALLBACK: [number, number, number] = [148, 163, 184];

function parseRgbString(s: string): [number, number, number] | null {
  // Matches "rgb(r, g, b)" or "rgb(r g b)" — both are valid in modern CSS
  const m = s.match(/rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function cssVarToRgb(varName: string): [number, number, number] {
  if (typeof document === 'undefined') return FALLBACK;

  // Read the raw value from :root
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return FALLBACK;

  // If it's already rgb(...), parse directly
  if (raw.startsWith('rgb')) {
    return parseRgbString(raw) ?? FALLBACK;
  }

  // For hex, oklch, hsl, or any other format: paint it onto a temporary element
  // and let the browser compute the resulting sRGB value via getComputedStyle.
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;width:0;height:0;color:${raw};visibility:hidden`;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  return parseRgbString(computed) ?? FALLBACK;
}

// Build the full flag-color map from CSS variables in one DOM pass.
export function buildFlagColorMap(): Record<string, [number, number, number]> {
  return {
    SA: cssVarToRgb('--flag-sa'),
    IR: cssVarToRgb('--flag-ir'),
    AE: cssVarToRgb('--flag-ae'),
    QA: cssVarToRgb('--flag-qa'),
    KW: cssVarToRgb('--flag-kw'),
    IQ: cssVarToRgb('--flag-iq'),
    OM: cssVarToRgb('--flag-om'),
    OT: cssVarToRgb('--flag-ot'),
  };
}
