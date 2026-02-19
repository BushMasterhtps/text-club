/**
 * Brand normalization for analytics and filtering.
 * Single source of truth for canonical brand names; aligns with import alias logic
 * so "Gundry", "GundryMD", "Dr. Marty", "DrMarty" etc. group correctly.
 *
 * To sync with production: run `node query-production-data.js`, choose option 8
 * (Distinct brands for Text Club tasks), then add any new spellings here as
 * alias keys mapping to the desired canonical name.
 */

// Canonical display names and alias keys (lowercase token) -> canonical.
// Keep in sync with import route brandFromFilename aliases; add common spelling variants here.
const BRAND_ALIASES: Record<string, string> = {
  gundrymd: "GundryMD",
  gundry: "GundryMD",
  drmarty: "DrMarty",
  "dr-marty": "DrMarty",
  dr: "DrMarty",
  marty: "DrMarty",
  ultimatepetnutrition: "DrMarty",
  activatedyou: "ActivatedYou",
  activatedu: "ActivatedYou",
  upn: "UPN",
  ultimatpetnutrition: "UPN",
  terramare: "TerraMare",
  roundhouseprovisions: "RoundHouseProvisions",
  powerlife: "PowerLife",
  nucific: "Nucific",
  lonewolfranch: "LoneWolfRanch",
  kintsugihair: "KintsugiHair",
  badlandsranch: "BadlandsRanch",
  bhmd: "BHMD",
};

function toLookupKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")[0] || "";
}

/**
 * Normalize a raw brand string to a canonical name for grouping and display.
 * e.g. "Gundry", "Gundry MD", "gundrymd" -> "GundryMD"
 */
export function normalizeBrand(brand: string | null | undefined): string {
  if (brand == null || String(brand).trim() === "") return "Unknown";
  const key = toLookupKey(brand);
  if (!key) return "Unknown";
  return BRAND_ALIASES[key] ?? (key[0].toUpperCase() + key.slice(1));
}

/** Build reverse map: canonical -> list of alias keys (and variants) for DB filter */
const canonicalToRaw: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [key, canonical] of Object.entries(BRAND_ALIASES)) {
    if (!map[canonical]) map[canonical] = [];
    if (!map[canonical].includes(key)) map[canonical].push(key);
    const titleKey = key[0].toUpperCase() + key.slice(1);
    if (titleKey !== key && !map[canonical].includes(titleKey)) map[canonical].push(titleKey);
  }
  for (const canonical of Object.values(BRAND_ALIASES)) {
    if (!map[canonical]) map[canonical] = [];
    if (!map[canonical].includes(canonical)) map[canonical].unshift(canonical);
  }
  return map;
})();

/**
 * Return all possible raw brand values that map to this canonical name (for Prisma where.brand in [...]).
 */
export function getBrandFilterValues(canonical: string): string[] {
  const list = canonicalToRaw[canonical];
  if (list && list.length) return list;
  return [canonical];
}
